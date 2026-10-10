#!/usr/bin/env -S npx tsx
// companybrain mcp — standalone MCP stdio server. Boots a minimal Core directly from
// ports (no web UI, no registered workers, no port), verifies the env-supplied API key,
// injects the agent identity as ToolContext, and starts the JSON-RPC server. Spawned by
// MCP hosts (Claude Desktop, Cursor, VS Code) directly from their config.

import { createCoreFromPorts } from '@companybrain/core';
import { createDatabase } from '@companybrain/db';
import { createQueue } from '@companybrain/queue';
import { createAuth } from '@companybrain/auth';
import { startMcpServer } from '@companybrain/mcp';

// SECURITY: nothing in this process must log to stdout (that's the JSON-RPC channel).
// All diagnostics go to stderr.
const warn = (msg: string) => process.stderr.write(`[companybrain mcp] ${msg}\n`);

async function main() {
  const rawKey = process.env.COMPANYBRAIN_MCP_KEY ?? '';
  if (!rawKey) {
    warn('No COMPANYBRAIN_MCP_KEY set. Create an agent account + API key in the web app (Settings → User Management), then set COMPANYBRAIN_MCP_KEY.');
    process.exit(2);
  }

  // Minimal Core: same ports as bootstrap(), but we do NOT call registerWorkers — so the
  // queue (required by the Core signature) has no handlers and any enqueue is a no-op.
  const db = createDatabase();
  const queue = createQueue();
  const auth = createAuth();
  await db.init();
  await queue.init();
  await auth.init();
  const core = createCoreFromPorts({ db, queue, auth });

  const identity = await core.apiKeys.verify(rawKey);
  if (!identity) {
    warn('COMPANYBRAIN_MCP_KEY did not verify. Revoke and re-create the key from the web app.');
    await db.close();
    await queue.close();
    process.exit(3);
  }

  startMcpServer({
    core,
    name: 'companybrain',
    version: '0.1.0',
    context: { orgId: identity.orgId, actorId: identity.actorId ?? 'user_agent' },
  });
  // startMcpServer blocks on readline; no further code runs until stdin closes.
}

main().catch((err) => {
  warn(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
