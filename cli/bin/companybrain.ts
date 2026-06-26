#!/usr/bin/env -S npx tsx
// companybrain — ONE app, one command. This single process runs everything: SQLite
// migrations, an in-process worker (real timers, real chases/briefings), the API, and
// the embedded web UI. No Docker, no Postgres, no Redis, no separate frontend.
// `pnpm start` locally; the same command runs it on a server (binds 0.0.0.0).

import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { bootstrap, seedIfEmpty } from '@companybrain/core';
import { buildServer } from '@companybrain/server';
import { whatsapp, createMessenger, createBaileysChannel } from '@companybrain/integrations';

const port = Number(process.env.COMPANYBRAIN_PORT ?? process.env.PORT ?? 4317);
const host = process.env.COMPANYBRAIN_HOST ?? '0.0.0.0';

// WhatsApp: WHATSAPP_BAILEYS=on uses QR pairing (no Meta app); otherwise the Cloud API
// is used when WHATSAPP_* creds are present. Either way the worker can reply over WhatsApp.
const baileys = process.env.WHATSAPP_BAILEYS === 'on' ? createBaileysChannel({ orgId: 'org_local' }) : null;
const wa = whatsapp.whatsappConfigFromEnv();
const messenger = baileys ? baileys.messenger : createMessenger({ whatsapp: wa ?? undefined });

const boot = await bootstrap({ messenger });
await seedIfEmpty(boot.core);

// In-process worker: timers fire chases/briefings inside this same process.
await boot.startWorkers();
await boot.queue.schedule('sendBriefing', { orgId: 'org_local' }, 6 * 60 * 60 * 1000);

// Open the WhatsApp socket (prints a QR to scan on first run) if enabled.
if (baileys) await baileys.start(boot.core);

const app = buildServer({ core: boot.core, auth: boot.auth });
await app.listen({ port, host });

const shown = host === '0.0.0.0' ? `http://localhost:${port}` : `http://${host}:${port}`;
console.log(`
  company\x1b[1mbrain\x1b[0m  ·  running

  ▸ ${shown}
  ▸ data:  ~/.companybrain/companybrain.sqlite
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
