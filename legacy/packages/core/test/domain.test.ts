// Core domain tests — boot the real app stack (embedded SQLite + in-process queue +
// local auth) against a throwaway database and exercise the loop/task/lead flows.
// Run with: pnpm test  (node --test via the tsx loader).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

// Point the SQLite adapter at a fresh file BEFORE importing core (read at bootstrap time).
const dbPath = join(tmpdir(), `companybrain-test-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap } = await import('@companybrain/core');
const { LOCAL_ORG_ID, LOCAL_USER_ID } = await import('@companybrain/auth');

const boot = await bootstrap();
const core = boot.core;
const org = LOCAL_ORG_ID;
const me = LOCAL_USER_ID;

test('loops: capture → list → close', async () => {
  const loop = await core.loops.capture({ orgId: org, actorId: me, title: 'Reply to Priya', why: 'asked Monday', side: 'yours', channel: 'email' });
  assert.equal(loop.status, 'open');

  const yours = await core.loops.list(org, 'yours');
  assert.ok(yours.some((l) => l.id === loop.id), 'captured loop appears in "yours"');

  const closed = await core.loops.close(loop.id, me);
  assert.equal(closed.status, 'closed');
});

test('loops: capturing "theirs" enqueues a chase (no throw)', async () => {
  const loop = await core.loops.capture({ orgId: org, actorId: me, title: 'Waiting on Sam', why: '', side: 'theirs', channel: 'slack' });
  const theirs = await core.loops.list(org, 'theirs');
  assert.ok(theirs.some((l) => l.id === loop.id));
});

test('tasks: create → list → complete', async () => {
  const task = await core.tasks.create({ orgId: org, actorId: me, title: 'Draft Q3 plan', day: 'today', priority: 'high' });
  assert.equal(task.day, 'today');
  assert.equal(task.priority, 'high');

  const list = await core.tasks.list(org);
  assert.ok(list.some((t) => t.id === task.id));

  const done = await core.tasks.complete(task.id, me);
  assert.equal(done.id, task.id);
});

test('leads: create → advance through the pipeline', async () => {
  const lead = await core.leads.create({ orgId: org, actorId: me, name: 'Aisha Khan', company: 'Northwind', what: 'team plan' });
  assert.equal(lead.stage, 'new');

  const contacted = await core.leads.advance(lead.id, me);
  assert.equal(contacted.stage, 'contacted');

  const meeting = await core.leads.advance(lead.id, me);
  assert.equal(meeting.stage, 'meeting');
});

test('events: every mutation is logged to the audit trail', async () => {
  const before = await core.events.list(org, 100);
  await core.loops.capture({ orgId: org, actorId: me, title: 'Audited loop', why: '', side: 'yours', channel: 'manual' });
  const after = await core.events.list(org, 100);
  assert.ok(after.length > before.length, 'capturing a loop appended an event');
  assert.ok(after.some((e) => e.type === 'loop.captured'));
});

test.after(async () => {
  await boot.shutdown();
  try { rmSync(dbPath, { force: true }); } catch { /* best effort */ }
});
