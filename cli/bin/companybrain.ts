#!/usr/bin/env node
// companybrain — one process: SQLite + scheduler + API + MCP + web UI on one port.
//
//   companybrain          start the app (default)
//   companybrain mcp      MCP over stdio for desktop AI hosts (Claude Desktop, Cursor, …)
//   companybrain migrate  run database migrations and exit
//
// The `mcp` subcommand must never write anything but JSON-RPC to stdout, so it is
// dispatched before anything else is constructed and never starts the web server.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase, resolveDbPath } from '@companybrain/db';
import { createCore, type Core } from '@companybrain/core';
import { createGame, type Game } from '@companybrain/game';
import {
  loadIntegrationsConfig,
  createOutbound,
  createLlm,
  createTts,
  createCalendarFetcher,
  getVapidKeys,
  createWhatsAppQr,
  createEmailPoller,
  integrationsStatus,
  type WhatsAppQr,
} from '@companybrain/integrations';
import { handleMcpHttp, runMcpStdio } from '@companybrain/mcp';
import { buildServer } from '@companybrain/server';
import type { AppServices, AuditEvent, InboundMessage, OnInbound } from '@companybrain/types';

const VERSION = '2.0.0';
const command = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'serve';

const env = process.env;
const dbPath = resolveDbPath(env);
const dataDir = dirname(dbPath);
mkdirSync(dataDir, { recursive: true });

// Everything that isn't the stdio MCP protocol goes to stderr in `mcp` mode.
const log = {
  info: (...a: unknown[]) => console.error('[companybrain]', ...a),
  warn: (...a: unknown[]) => console.error('[companybrain] warn:', ...a),
  error: (...a: unknown[]) => console.error('[companybrain] error:', ...a),
};

if (command === 'mcp') {
  await runMcp();
} else if (command === 'migrate') {
  const db = openDatabase(dbPath);
  db.close();
  log.info(`migrations applied → ${dbPath}`);
} else if (command === 'serve' || command === 'start') {
  await serve();
} else {
  console.error(`Unknown command "${command}". Use: companybrain [serve|mcp|migrate]`);
  process.exit(64);
}

async function runMcp(): Promise<void> {
  const key = env.COMPANYBRAIN_MCP_KEY?.trim();
  if (!key) {
    console.error('COMPANYBRAIN_MCP_KEY is not set. Create an API key in Settings → AI agents & API keys.');
    process.exit(2);
  }
  const db = openDatabase(dbPath);
  const cfg = loadIntegrationsConfig(env, dataDir);
  // The stdio process shares the SQLite file with the running web app (WAL). It does not run
  // the scheduler — the web app owns background jobs — so outbound is a no-op here.
  const { services } = createAppServices(db, { llm: createLlm(cfg), calendar: createCalendarFetcher(), log });
  await runMcpStdio(services, key);
}

async function serve(): Promise<void> {
  const db = openDatabase(dbPath);
  const cfg = loadIntegrationsConfig(env, dataDir);
  const vapid = getVapidKeys(cfg);

  // Inbound messages are routed into core once it exists (the QR socket needs the callback first).
  let onInbound: OnInbound = async () => ({ reply: null });
  const inbound: OnInbound = (msg: InboundMessage) => onInbound(msg);

  const whatsappQr: WhatsAppQr | null = cfg.whatsapp.qrEnabled ? createWhatsAppQr(cfg, inbound) : null;
  const outbound = createOutbound(cfg, whatsappQr);
  const tts = createTts(cfg);

  const { core, services } = createAppServices(db, {
    outbound,
    llm: createLlm(cfg),
    calendar: createCalendarFetcher(),
    tts,
    vapidPublicKey: vapid.publicKey,
    log,
  });
  const orgId = await services.auth.orgId();
  onInbound = async (msg) => {
    if (!orgId) return { reply: null }; // not set up yet
    const res = await services.inbox.ingest(orgId, msg);
    return { reply: res.reply };
  };

  const app = await buildServer({
    services,
    tts,
    integrations: {
      config: cfg,
      status: () => integrationsStatus(cfg, whatsappQr),
      whatsappQr,
      onInbound: inbound,
      sendTest: (actor, channel) => services.notifications.sendTest(actor, channel),
    },
    mcp: { handleHttp: handleMcpHttp },
    config: {
      version: VERSION,
      publicUrl: env.COMPANYBRAIN_PUBLIC_URL?.replace(/\/$/, '') || null,
      webDir: resolveWebDir(),
      trustProxy: parseTrustProxy(env.COMPANYBRAIN_TRUST_PROXY),
      secureCookies: env.COMPANYBRAIN_SECURE_COOKIE === 'true' ? true : env.COMPANYBRAIN_SECURE_COOKIE === 'false' ? false : 'auto',
      corsOrigins: (env.COMPANYBRAIN_CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      emailWebhookSecret: env.EMAIL_WEBHOOK_SECRET || null,
      signingSecret: loadSigningSecret(),
      logLevel: env.COMPANYBRAIN_LOG_LEVEL || 'info',
    },
  });

  const port = Number(env.PORT ?? env.COMPANYBRAIN_PORT ?? 4317);
  const host = env.COMPANYBRAIN_HOST ?? '0.0.0.0';
  await app.listen({ port, host });

  core.scheduler.start();
  const poller = createEmailPoller(cfg, inbound);
  poller?.start();
  if (whatsappQr) whatsappQr.start().catch((err) => log.warn('WhatsApp QR start failed:', err));

  const url = env.COMPANYBRAIN_PUBLIC_URL || `http://localhost:${port}`;
  log.info(`v${VERSION} running at ${url}  ·  data: ${dbPath}`);
  if (await services.auth.needsSetup()) log.info(`first run — open ${url} to create your company and owner account`);

  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      if (stopping) return;
      stopping = true;
      log.info(`${sig} received, shutting down…`);
      const force = setTimeout(() => process.exit(1), 10_000);
      force.unref();
      try {
        await app.close();
        await core.scheduler.stop();
        await poller?.stop();
        db.close();
      } finally {
        process.exit(0);
      }
    });
  }
  process.on('unhandledRejection', (reason) => log.error('unhandledRejection:', reason));
}

/** Core + game layer. The game consumes core's audit stream; core needs the game's callback first. */
function createAppServices(
  db: ReturnType<typeof openDatabase>,
  opts: Omit<Parameters<typeof createCore>[0], 'db' | 'onAudit'>,
): { core: Core; game: Game; services: AppServices } {
  let game: Game | null = null;
  const core = createCore({ ...opts, db, onAudit: (e: AuditEvent) => game?.onAudit(e) });
  game = createGame({ sqlite: db.sqlite, services: core.services });
  return { core, game, services: { ...core.services, game: game.service } };
}

/** HMAC key for OAuth client ids/codes. Env, else generated once and kept next to the DB. */
function loadSigningSecret(): string {
  if (env.COMPANYBRAIN_SIGNING_SECRET) return env.COMPANYBRAIN_SIGNING_SECRET;
  const file = join(dataDir, 'signing.key');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function resolveWebDir(): string | null {
  if (env.COMPANYBRAIN_WEB_DIR) return resolve(env.COMPANYBRAIN_WEB_DIR);
  const here = dirname(fileURLToPath(import.meta.url));
  // Bundled: dist/server.js → dist/web. Source (tsx): cli/bin → ../../dist/web.
  for (const candidate of [join(here, 'web'), join(here, '..', '..', 'dist', 'web')]) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  log.warn('web UI build not found (run `pnpm build`); serving the API only');
  return null;
}

function parseTrustProxy(v: string | undefined): boolean | number | string {
  if (!v || v === 'false') return false;
  if (v === 'true') return true;
  const n = Number(v);
  return Number.isInteger(n) ? n : v;
}
