// Reversibility tests — every audit event with an undo payload can be reversed, and the
// reversal itself is logged but not re-reversible.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-undo-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap } = await import('@companybrain/core');
const { LOCAL_ORG_ID, LOCAL_USER_ID } = await import('@companybrain/auth');

const boot = await bootstrap();
const core = boot.core;
const org = LOCAL_ORG_ID;
const me = LOCAL_USER_ID;

async function findEvent(type: string, entityId: string) {
  const events = await core.events.list(org, 200);
  return events.find((e) => e.type === type && e.entityId === entityId);
}

test('undo: reverses a created loop (deletes it)', async () => {
  const loop = await core.loops.capture({ orgId: org, actorId: me, title: 'Undo me', why: '', side: 'yours', channel: 'manual' });
  const ev = await findEvent('loop.captured', loop.id);
  assert.ok(ev, 'capture logged an event');

  const res = await core.events.undo(ev!.id);
  assert.equal(res.type, 'loop.captured');
  assert.equal(await core.loops.get(loop.id), null, 'loop is gone after undo');
});

test('undo: reverses a closed loop (restores status)', async () => {
  const loop = await core.loops.capture({ orgId: org, actorId: me, title: 'Reopen me', why: '', side: 'yours', channel: 'manual' });
  await core.loops.close(loop.id, me);
  const ev = await findEvent('loop.closed', loop.id);
  await core.events.undo(ev!.id);
  const after = await core.loops.get(loop.id);
  assert.equal(after?.status, 'open', 'status restored to open');
});

test('undo: reverses an advanced lead (restores stage)', async () => {
  const lead = await core.leads.create({ orgId: org, actorId: me, name: 'Reverse Lead', company: 'X' });
  await core.leads.advance(lead.id, me); // new → contacted
  const ev = await findEvent('lead.advanced', lead.id);
  await core.events.undo(ev!.id);
  const after = await core.leads.list(org);
  assert.equal(after.find((l) => l.id === lead.id)?.stage, 'new', 'stage restored');
});

test('undo: a non-reversible event cannot be undone', async () => {
  const task = await core.tasks.create({ orgId: org, actorId: me, title: 'temp' });
  const ev = await findEvent('task.created', task.id);
  await core.events.undo(ev!.id); // produces an 'event.undone' (reversible: false)
  const undone = (await core.events.list(org, 200)).find((e) => e.type === 'event.undone' && e.entityId === ev!.id);
  assert.ok(undone, 'reversal was logged');
  await assert.rejects(() => core.events.undo(undone!.id), /not reversible/, 'cannot undo an undo');
});

test.after(async () => {
  await boot.shutdown();
  try { rmSync(dbPath, { force: true }); } catch { /* best effort */ }
});
