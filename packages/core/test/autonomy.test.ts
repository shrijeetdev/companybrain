// Autonomy tests — the "scoped, logged, reversible" gate. Boots the real stack against a
// throwaway DB and checks off/ask/auto behaviour plus the approval queue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-autonomy-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap, DEFAULT_AUTONOMY } = await import('@companybrain/core');
const { LOCAL_ORG_ID } = await import('@companybrain/auth');

const boot = await bootstrap();
const core = boot.core;
const org = LOCAL_ORG_ID;

test('autonomy: defaults applied, then changed + persisted', async () => {
  const initial = await core.autonomy.get(org);
  assert.deepEqual(initial, DEFAULT_AUTONOMY);
  assert.equal(initial.draftReplies, 'auto');
  assert.equal(initial.createTasks, 'off');

  const next = await core.autonomy.set(org, 'chase', 'ask');
  assert.equal(next.chase, 'ask');
  assert.equal((await core.autonomy.get(org)).chase, 'ask', 'change persists');
});

test('autonomy: ask → an approval is queued, not acted on', async () => {
  await core.autonomy.set(org, 'draftReplies', 'ask');
  const level = await core.autonomy.gate('draftReplies', { orgId: org, loopId: 'loop_x', title: 'Auto-reply: hello' });
  assert.equal(level, 'ask');

  const pending = await core.approvals.list(org, 'pending');
  assert.ok(pending.some((a) => a.action === 'draftReplies' && a.loopId === 'loop_x'), 'approval queued');
});

test('autonomy: off → nothing queued', async () => {
  await core.autonomy.set(org, 'joinMeetings', 'off');
  const before = (await core.approvals.list(org, 'pending')).length;
  const level = await core.autonomy.gate('joinMeetings', { orgId: org, loopId: 'loop_y', title: 'Join standup' });
  assert.equal(level, 'off');
  assert.equal((await core.approvals.list(org, 'pending')).length, before, 'off queues nothing');
});

test('autonomy: approving an approval clears it from the pending queue', async () => {
  await core.autonomy.set(org, 'chase', 'ask');
  await core.autonomy.gate('chase', { orgId: org, loopId: 'loop_z', title: 'Chase: invoice' });
  const pending = await core.approvals.list(org, 'pending');
  const target = pending.find((a) => a.loopId === 'loop_z');
  assert.ok(target, 'queued');

  const approved = await core.approvals.approve(target!.id);
  assert.equal(approved.status, 'approved');
  const stillPending = await core.approvals.list(org, 'pending');
  assert.ok(!stillPending.some((a) => a.id === target!.id), 'no longer pending');
});

test('autonomy: capturing a "theirs" loop under ask queues a chase approval', async () => {
  await core.autonomy.set(org, 'chase', 'ask');
  const loop = await core.loops.capture({ orgId: org, actorId: 'user_local', title: 'Waiting on contract', why: '', side: 'theirs', channel: 'email' });
  const pending = await core.approvals.list(org, 'pending');
  assert.ok(pending.some((a) => a.action === 'chase' && a.loopId === loop.id), 'capture queued a chase approval');
});

test.after(async () => {
  await boot.shutdown();
  try { rmSync(dbPath, { force: true }); } catch { /* best effort */ }
});
