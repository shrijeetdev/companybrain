// Integration-pipeline tests — the M3/M4 contract. `integrations` depends on `core`
// (not the reverse), so this is the correct home for tests that exercise both.
// Boots the real stack against a throwaway SQLite file. Run with: pnpm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-pipe-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap } = await import('@companybrain/core');
const { ingest, needsHuman } = await import('../src/pipeline');

const boot = await bootstrap();
const core = boot.core;
const org = (await core.ctx.auth.current()).orgId;

test('needsHuman: filters auto-acks but keeps real asks', () => {
  assert.equal(needsHuman({ orgId: org, channel: 'whatsapp', from: 'x', text: 'ok' }), false);
  assert.equal(needsHuman({ orgId: org, channel: 'whatsapp', from: 'x', text: 'thanks' }), false);
  assert.equal(needsHuman({ orgId: org, channel: 'whatsapp', from: 'x', text: 'can you send the proposal?' }), true);
});

test('M3: inbound WhatsApp → captured loop that remembers who to reply to', async () => {
  const loopId = await ingest(core, { orgId: org, channel: 'whatsapp', from: '15551234567', text: 'Please send the Q3 proposal by Friday', ref: 'wamid.X' });
  assert.ok(loopId, 'a real ask captures a loop');
  const loop = (await core.loops.list(org)).find((l) => l.id === loopId);
  assert.equal(loop?.channel, 'whatsapp');
  assert.equal(loop?.replyTo, '15551234567', 'remembers the reply-to handle');
});

test('M4: every channel funnels into the SAME pipeline', async () => {
  for (const channel of ['slack', 'telegram', 'email', 'github'] as const) {
    const id = await ingest(core, { orgId: org, channel, from: 'someone', text: `Inbound via ${channel} — needs review` });
    assert.ok(id, `${channel} captured a loop`);
  }
});

test('an auto-ack does NOT create a loop (nothing to forget)', async () => {
  const id = await ingest(core, { orgId: org, channel: 'slack', from: 'x', text: '👍' });
  assert.equal(id, null);
});

test.after(async () => {
  await boot.shutdown();
  try { rmSync(dbPath, { force: true }); } catch { /* best effort */ }
});
