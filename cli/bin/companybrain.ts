#!/usr/bin/env -S npx tsx
// companybrain — ONE app, one command. This single process runs everything: SQLite
// migrations, an in-process worker (real timers, real chases/briefings), the API, and
// the embedded web UI. No Docker, no Postgres, no Redis, no separate frontend.
// `pnpm start` locally; the same command runs it on a server (binds 0.0.0.0).

import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { bootstrap, seedIfEmpty } from '@companybrain/core';
import { buildServer } from '@companybrain/server';
import { whatsapp, createMessenger, createBaileysChannel, createLlm, complete, publishPost } from '@companybrain/integrations';
import { captureException, flushSentry } from '@companybrain/server/middleware';

// --- Subcommand dispatch: `companybrain mcp` runs the standalone MCP server. ---
// Scan argv (not a fixed index): when MCP hosts like Claude Desktop spawn `tsx bin mcp`,
// the runtime may rewrite argv so `mcp` lands at argv[1] instead of argv[2]. Slicing from
// index 2 first, then falling back to a full scan, covers both the interactive and
// spawned-`npx` cases without guessing the layout.
const cliArgs = process.argv.slice(2);
const isMcpInvocation = cliArgs[0] === 'mcp' || process.argv.includes('mcp');
const isBackupInvocation = !isMcpInvocation && (cliArgs[0] === 'backup' || cliArgs[0] === 'restore');
if (isMcpInvocation) {
  // Hand off to the MCP entrypoint. Dynamic import keeps MCP-only deps out of the
  // web-app boot path; the web app never loads @companybrain/mcp.
  //
  // Do NOT call process.exit() after the import: startMcpServer() returns immediately
  // after registering a readline listener on stdin — it does NOT block synchronously.
  // The process stays alive because stdin keeps the event loop busy, and exits on its
  // own when stdin closes. A process.exit() here would kill it before any line is read.
  await import('./mcp.js');
}

// `companybrain backup` — take one now and exit; `companybrain backup --list` shows what
// exists. Meant for cron and for a pre-deploy snapshot; the running app also takes a
// nightly one on its own.
if (isBackupInvocation) {
  await import('./backup.js');
}

// --- Process error handlers: catch what would otherwise be silent crashes (H6) ---
process.on('unhandledRejection', (reason) => {
  // A swallowed promise is a bug, not a reason to die. Log + report, keep running.
  console.error('[companybrain] unhandledRejection:', reason);
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
});

process.on('uncaughtException', (err) => {
  // Truly fatal — Node's state is now unreliable. Report, flush, then exit non-zero.
  console.error('[companybrain] uncaughtException (fatal):', err);
  captureException(err);
  flushSentry().finally(() => process.exit(1));
});

// The web app boots only when this is NOT a subcommand invocation. Without this guard a
// subcommand runs and then falls straight through to here, booting a second copy of the
// whole app (and trying to open a browser) inside the MCP host or the cron job.
if (!isMcpInvocation && !isBackupInvocation) {

const port = Number(process.env.COMPANYBRAIN_PORT ?? process.env.PORT ?? 4317);
const host = process.env.COMPANYBRAIN_HOST ?? '0.0.0.0';

// WhatsApp: WHATSAPP_BAILEYS=on uses QR pairing (no Meta app); otherwise the Cloud API
// is used when WHATSAPP_* creds are present. Either way the worker can reply over WhatsApp.
const baileys = process.env.WHATSAPP_BAILEYS === 'on' ? createBaileysChannel({ orgId: 'org_local' }) : null;
const wa = whatsapp.whatsappConfigFromEnv();
const messenger = baileys ? baileys.messenger : createMessenger({ whatsapp: wa ?? undefined });

// If ANTHROPIC_API_KEY is set, replies are AI-written; otherwise a fixed template is used.
const drafter = createLlm() ?? undefined;

// AI executor clients. This is the composition root: core defines the ports, the concrete
// OpenRouter + WordPress clients are handed in here. Without OPENROUTER_API_KEY the worker
// still skips, so wiring them is harmless when the feature is unused.
const aiClients = { complete, publishBlog: publishPost };

const boot = await bootstrap({ messenger, drafter, aiClients });
await seedIfEmpty(boot.core);

// In-process worker: timers fire chases/briefings inside this same process.
await boot.startWorkers();
await boot.queue.schedule('sendBriefing', { orgId: 'org_local' }, 6 * 60 * 60 * 1000);
// Nightly SQLite backup with retention. COMPANYBRAIN_BACKUP=off disables it (e.g. when the
// host already snapshots the volume); COMPANYBRAIN_BACKUP_DIR / _RETENTION tune it.
if ((process.env.COMPANYBRAIN_BACKUP ?? '').trim().toLowerCase() !== 'off') {
  await boot.queue.schedule('backupDatabase', {}, 24 * 60 * 60 * 1000);
}

// Open the WhatsApp socket (prints a QR to scan on first run) if enabled.
if (baileys) await baileys.start(boot.core);

const app = buildServer({ core: boot.core, auth: boot.auth });
await app.listen({ port, host });

const shown = host === '0.0.0.0' ? `http://localhost:${port}` : `http://${host}:${port}`;
const authMode = (boot.auth.mode ?? 'local').toUpperCase();
console.log(`
  company\x1b[1mbrain\x1b[0m  ·  running

  ▸ ${shown}
  ▸ data:  ~/.companybrain/companybrain.sqlite
  ▸ auth: ${authMode}${authMode === 'KEY' ? ' (session login enabled)' : ' (single-user local mode)'}
  ▸ single app: SQLite + in-process worker + API + web, no external services

  Ctrl-C to stop.
`);

// Try to open a browser for local use. On a headless server the spawn just fails (caught).
if (!process.env.COMPANYBRAIN_NO_OPEN) openBrowser(`http://localhost:${port}`);

function openBrowser(target: string) {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [target], { stdio: 'ignore', detached: true, shell: platform() === 'win32' }).unref();
  } catch {
    /* headless / CI — the URL is printed above */
  }
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    await boot.shutdown();
    process.exit(0);
  });
}

} // end: web app boot (skipped for `companybrain mcp`)
