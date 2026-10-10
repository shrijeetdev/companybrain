#!/usr/bin/env node
// companybrain — one process: SQLite + scheduler + API + MCP + web UI on one port.
//
//   companybrain          start the app (default)
//   companybrain mcp      MCP over stdio for desktop AI hosts (Claude Desktop, Cursor, …)
//   companybrain migrate  run database migrations and exit
//   companybrain backup [dir]  hot backup of the database + keys into dir (default ./backups)
//
// The `mcp` subcommand must never write anything but JSON-RPC to stdout, so it never starts
// the web server, and all logging goes to stderr.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase, resolveDbPath } from '@companybrain/db';
import { createCalendarFetcher, createLlm, loadIntegrationsConfig } from '@companybrain/integrations';
import { runMcpStdio } from '@companybrain/mcp';
import { createApp, createAppServices, stderrLog as log, VERSION } from '../src/app';

// Load ./.env when present (never overrides variables already set by the host).
if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch (err) {
    console.error('[companybrain] warn: could not read .env:', err instanceof Error ? err.message : err);
  }
}

const command = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'serve';
const env = process.env;
const dbPath = resolveDbPath(env);
const dataDir = dirname(dbPath);
mkdirSync(dataDir, { recursive: true });

if (command === 'mcp') {
  await runMcp();
} else if (command === 'migrate') {
  openDatabase(dbPath).close();
  log.info(`migrations applied → ${dbPath}`);
} else if (command === 'backup') {
  await backup(process.argv.slice(3).find((a) => !a.startsWith('-')) ?? 'backups');
} else if (command === 'serve' || command === 'start') {
  await serve();
} else {
  console.error(`Unknown command "${command}". Use: companybrain [serve|mcp|migrate|backup]`);
  process.exit(64);
}

/** Online backup (safe while the app runs) of the SQLite file plus the key files next to it. */
async function backup(target: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = resolve(target, `companybrain-${stamp}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = openDatabase(dbPath);
  await db.sqlite.backup(join(dir, 'companybrain.sqlite'));
  db.close();
  for (const f of ['secret.key', 'signing.key', 'vapid.json']) {
    if (existsSync(join(dataDir, f))) copyFileSync(join(dataDir, f), join(dir, f));
  }
  log.info(`backup written → ${dir}`);
}

async function runMcp(): Promise<void> {
  const key = env.COMPANYBRAIN_MCP_KEY?.trim();
  if (!key) {
    console.error('COMPANYBRAIN_MCP_KEY is not set. Create an API key in Settings → Connect AI.');
    process.exit(2);
  }
  // Shares the SQLite file with the running web app (WAL). The web app owns background jobs,
  // so no scheduler and no outbound channels run here.
  const db = openDatabase(dbPath);
  const cfg = loadIntegrationsConfig(env, dataDir);
  const { services } = createAppServices(db, { llm: createLlm(cfg), calendar: createCalendarFetcher(), log });
  await runMcpStdio(services, key);
}

async function serve(): Promise<void> {
  const app = await createApp({ env, dbPath, dataDir, webDir: resolveWebDir(), log });
  const port = Number(env.PORT ?? env.COMPANYBRAIN_PORT ?? 4317);
  const host = env.COMPANYBRAIN_HOST ?? '0.0.0.0';
  await app.server.listen({ port, host });
  app.startBackground();

  const url = env.COMPANYBRAIN_PUBLIC_URL || `http://localhost:${port}`;
  log.info(`v${VERSION} running at ${url}  ·  data: ${dbPath}`);
  if (await app.services.auth.needsSetup()) log.info(`first run — open ${url} to create your company and owner account`);

  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      if (stopping) return;
      stopping = true;
      log.info(`${sig} received, shutting down…`);
      setTimeout(() => process.exit(1), 10_000).unref();
      try {
        await app.stop();
      } finally {
        process.exit(0);
      }
    });
  }
  process.on('unhandledRejection', (reason) => log.error('unhandledRejection:', reason));
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
