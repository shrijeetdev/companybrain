#!/usr/bin/env node
// companybrain — one process: SQLite + scheduler + API + MCP + web UI on one port.
//
//   companybrain          start the app (default)
//   companybrain mcp      MCP over stdio for desktop AI hosts (Claude Desktop, Cursor, …)
//   companybrain migrate  run database migrations and exit
//   companybrain backup [dir] [--without-keys]
//                        hot backup of the database + key files into dir (default ./backups);
//                        --without-keys leaves out secret.key / signing.key / vapid.json
//
// The `mcp` subcommand must never write anything but JSON-RPC to stdout, so it never starts
// the web server, and all logging goes to stderr.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase, resolveDbPath } from '@companybrain/db';
import { createCalendarFetcher, createLlm, loadIntegrationsConfig } from '@companybrain/integrations';
import { runMcpStdio } from '@companybrain/mcp';
import { createApp, createAppServices, stderrLog as log, VERSION } from '../src/app';
import { backupTo } from '../src/backup';

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
  await backup(process.argv.slice(3).find((a) => !a.startsWith('-')) ?? 'backups', process.argv.includes('--without-keys'));
} else if (command === 'serve' || command === 'start') {
  await serve();
} else {
  console.error(`Unknown command "${command}". Use: companybrain [serve|mcp|migrate|backup]`);
  process.exit(64);
}

/** Online backup (safe while the app runs) of the SQLite file plus, unless --without-keys, the key files. */
async function backup(target: string, withoutKeys: boolean): Promise<void> {
  const { dir, files } = await backupTo(dbPath, dataDir, target, { withoutKeys });
  log.info(`backup written → ${dir} (${files.join(', ')})`);
  if (withoutKeys) log.info('key files skipped (--without-keys): keep secret.key / signing.key / vapid.json (or COMPANYBRAIN_SECRET) safe separately — the backup cannot decrypt stored secrets without them');
  else log.warn('this backup contains secret.key, which decrypts the secrets stored in the database — store it encrypted');
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
