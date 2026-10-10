// The whole companybrain app, assembled from its packages. Used by the CLI (`companybrain`)
// and by the in-process integration tests, so both run exactly the same wiring.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { openDatabase, type Db } from '@companybrain/db';
import { createCore, type Core, type CoreOptions } from '@companybrain/core';
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
  whatsappCloud,
  parseInboundEmailWebhook,
  type WhatsAppQr,
} from '@companybrain/integrations';
import { handleMcpHttp } from '@companybrain/mcp';
import { buildServer } from '@companybrain/server';
import type { AppServices, AuditEvent, InboundMessage, OnInbound, Outbound } from '@companybrain/types';

export const VERSION = '2.0.0';

export interface Log {
  info(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

export const stderrLog: Log = {
  info: (...a) => console.error('[companybrain]', ...a),
  warn: (...a) => console.error('[companybrain] warn:', ...a),
  error: (...a) => console.error('[companybrain] error:', ...a),
};

/** Core + game layer. The game consumes core's audit stream; core needs the game's callback first. */
export function createAppServices(
  db: Db,
  opts: Omit<CoreOptions, 'db' | 'onAudit'>,
): { core: Core; game: Game; services: AppServices } {
  let game: Game | null = null;
  const core = createCore({ ...opts, db, onAudit: (e: AuditEvent) => game?.onAudit(e) });
  game = createGame({ sqlite: db.sqlite, services: core.services, clock: opts.clock });
  return { core, game, services: { ...core.services, game: game.service } };
}

export interface CreateAppOptions {
  env: NodeJS.ProcessEnv;
  /** SQLite file path or ':memory:'. */
  dbPath: string;
  /** Directory for generated secrets/keys (next to the DB). */
  dataDir: string;
  webDir: string | null;
  log?: Log;
  /** Test hooks. */
  clock?: () => number;
  outbound?: Outbound;
}

export interface App {
  server: Awaited<ReturnType<typeof buildServer>>;
  core: Core;
  services: AppServices;
  db: Db;
  /** Start background work (scheduler, email polling, WhatsApp QR socket). */
  startBackground(): void;
  stop(): Promise<void>;
}

export async function createApp(opts: CreateAppOptions): Promise<App> {
  const { env, dataDir } = opts;
  const log = opts.log ?? stderrLog;
  const db = openDatabase(opts.dbPath);
  const cfg = loadIntegrationsConfig(env, dataDir);
  const vapid = getVapidKeys(cfg);

  // Inbound messages are routed into core once it exists (the QR socket needs the callback first).
  // The org is resolved per message: on a fresh install it only exists after first-run setup.
  let route: OnInbound = async () => ({ reply: null });
  const inbound: OnInbound = (msg: InboundMessage) => route(msg);

  const whatsappQr: WhatsAppQr | null = cfg.whatsapp.qrEnabled ? createWhatsAppQr(cfg, inbound) : null;
  const outbound = opts.outbound ?? createOutbound(cfg, whatsappQr);
  const tts = createTts(cfg);

  const { core, services } = createAppServices(db, {
    outbound,
    llm: createLlm(cfg),
    calendar: createCalendarFetcher(),
    tts,
    vapidPublicKey: vapid.publicKey,
    clock: opts.clock,
    log,
  });

  let orgId: string | null = null;
  route = async (msg) => {
    orgId ??= await services.auth.orgId();
    if (!orgId) {
      log.warn(`inbound ${msg.channel} message from ${msg.from} ignored: run first-time setup first`);
      return { reply: null };
    }
    const res = await services.inbox.ingest(orgId, msg);
    return { reply: res.reply };
  };

  // Webhook deliveries (WhatsApp Cloud API, inbound-email providers) have no socket to answer on,
  // so their confirmation replies go out through the outbound channels. (The QR socket and the
  // IMAP poller reply on their own connections.)
  const webhookInbound: OnInbound = async (msg) => {
    const res = await inbound(msg);
    if (res.reply) {
      const ok = msg.channel === 'whatsapp'
        ? await outbound.whatsapp(msg.from, res.reply)
        : await outbound.email(msg.from, msg.subject ? `Re: ${msg.subject.replace(/^re:\s*/i, '')}` : 'companybrain', res.reply);
      if (!ok) log.warn(`could not send ${msg.channel} reply to ${msg.from} (channel not configured)`);
    }
    return { reply: null };
  };

  const server = await buildServer({
    services,
    tts,
    clock: opts.clock,
    integrations: {
      config: cfg,
      status: () => integrationsStatus(cfg, whatsappQr),
      whatsappQr,
      onInbound: webhookInbound,
      whatsappWebhook: {
        verifyChallenge: (q) => whatsappCloud.verifyChallenge(cfg, q),
        verifySignature: (raw, sig) => whatsappCloud.verifySignature(cfg, raw, sig),
        parse: (body) => whatsappCloud.parseWebhook(body),
      },
      parseEmailWebhook: parseInboundEmailWebhook,
      sendTest: (actor, channel) => services.notifications.sendTest(actor, channel),
    },
    mcp: { handleHttp: handleMcpHttp },
    config: {
      version: VERSION,
      publicUrl: env.COMPANYBRAIN_PUBLIC_URL?.replace(/\/$/, '') || null,
      webDir: opts.webDir,
      trustProxy: parseTrustProxy(env.COMPANYBRAIN_TRUST_PROXY),
      secureCookies: env.COMPANYBRAIN_SECURE_COOKIE === 'true' ? true : env.COMPANYBRAIN_SECURE_COOKIE === 'false' ? false : 'auto',
      corsOrigins: (env.COMPANYBRAIN_CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      emailWebhookSecret: env.EMAIL_WEBHOOK_SECRET || null,
      signingSecret: loadSigningSecret(env, dataDir),
      logLevel: env.COMPANYBRAIN_LOG_LEVEL || 'info',
    },
  });

  const poller = createEmailPoller(cfg, inbound);
  let started = false;

  return {
    server,
    core,
    services,
    db,
    startBackground() {
      if (started) return;
      started = true;
      core.scheduler.start();
      poller?.start();
      if (whatsappQr) whatsappQr.start().catch((err) => log.warn('WhatsApp QR start failed:', err));
    },
    async stop() {
      await server.close();
      await core.scheduler.stop();
      await poller?.stop();
      db.close();
    },
  };
}

/** HMAC key for OAuth client ids/codes. Env, else generated once and kept next to the DB. */
export function loadSigningSecret(env: NodeJS.ProcessEnv, dataDir: string): string {
  if (env.COMPANYBRAIN_SIGNING_SECRET) return env.COMPANYBRAIN_SIGNING_SECRET;
  const file = join(dataDir, 'signing.key');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

/**
 * COMPANYBRAIN_TRUST_PROXY: `true` = exactly ONE trusted reverse-proxy hop (never Fastify's
 * trust-everything `true`, which lets clients spoof their IP via X-Forwarded-For); a number = that
 * many hops; otherwise a comma-separated list of trusted proxy IPs/CIDRs (or proxy-addr presets
 * like `loopback`).
 */
export function parseTrustProxy(v: string | undefined): false | number | string {
  const s = (v ?? '').trim();
  if (!s || s.toLowerCase() === 'false' || s === '0') return false;
  if (s.toLowerCase() === 'true') return 1;
  if (/^\d+$/.test(s)) return Math.min(Number(s), 10);
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const ok = parts.every((p) => /^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(p) || ['loopback', 'linklocal', 'uniquelocal'].includes(p));
  if (!ok || !parts.length) throw new Error(`COMPANYBRAIN_TRUST_PROXY must be true/false, a hop count, or a comma-separated list of proxy IPs/CIDRs (got "${s}")`);
  return parts.join(',');
}
