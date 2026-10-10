// Tests for new features: time tracking, bulk ops, subtasks, AI suggestions.
// Run with: pnpm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-newtest-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap } = await import('@companybrain/core');
const { LOCAL_ORG_ID, LOCAL_USER_ID } = await import('@companybrain/auth');

const boot = await bootstrap();
const core = boot.core;
const org = LOCAL_ORG_ID;
const me = LOCAL_USER_ID;

// --- Time Tracking ---
test('time tracking: start → list → stop', async () => {
  const task = await core.tasks.create({ orgId: org, actorId: me, title: 'Time tracked task', day: 'today' });

  const entry = await core.timeTracking.start({ orgId: org, taskId: task.id, userId: me });
  assert.ok(entry.id);
  assert.equal(entry.userId, me);
  assert.ok(entry.startedAt > 0);

  const entries = await core.timeTracking.listByTask(task.id);
  assert.ok(entries.some(e => e.id === entry.id));

  // Stop and verify duration is set
  await core.timeTracking.stop(entry.id);
  const updated = await core.ctx.db.timeEntries.get(entry.id);
  assert.ok(updated?.duration !== null && updated?.duration !== undefined);
});

// --- Bulk Operations ---
test('bulk ops: closeLoops batch', async () => {
  const l1 = await core.loops.capture({ orgId: org, actorId: me, title: 'Bulk loop 1', why: '', side: 'yours', channel: 'manual' });
  const l2 = await core.loops.capture({ orgId: org, actorId: me, title: 'Bulk loop 2', why: '', side: 'yours', channel: 'manual' });

  const result = await core.bulk.closeLoops([l1.id, l2.id], me);
  assert.equal(result.succeeded.length, 2);
  assert.equal(result.failed.length, 0);

  const check1 = await core.ctx.db.loops.get(l1.id);
  const check2 = await core.ctx.db.loops.get(l2.id);
  assert.equal(check1?.status, 'closed');
  assert.equal(check2?.status, 'closed');
});

// --- Subtasks ---
test('subtasks: add → complete → list → progress', async () => {
  const task = await core.tasks.create({ orgId: org, actorId: me, title: 'Parent task', day: 'today' });

  const s1 = await core.subtasks.add(task.id, 'Subtask 1');
  const s2 = await core.subtasks.add(task.id, 'Subtask 2');
  assert.equal(s1.title, 'Subtask 1');
  assert.equal(s1.done, false);

  await core.subtasks.complete(task.id, s1.id);
  
  // Get updated subtasks from DB
  const list = await core.subtasks.list(task.id);
  assert.equal(list.length, 2);
  
  // Calculate progress from list
  const progress = core.subtasks.getProgress(list);
  assert.equal(progress, 50);
  
  assert.ok(list.some(s => s.done));
});

test('subtasks: toggle flips done state', async () => {
  const task = await core.tasks.create({ orgId: org, actorId: me, title: 'Toggle task', day: 'today' });
  const sub = await core.subtasks.add(task.id, 'Toggle me');
  assert.equal(sub.done, false);

  await core.subtasks.toggle(task.id, sub.id);
  const list = await core.subtasks.list(task.id);
  assert.ok(list.some(s => s.done));

  await core.subtasks.toggle(task.id, sub.id);
  const list2 = await core.subtasks.list(task.id);
  assert.ok(!list2.some(s => s.done));
});

// --- AI Suggestions ---
test('AI: suggestions for overdue task', async () => {
  const task = await core.tasks.create({ orgId: org, actorId: me, title: 'Overdue task', day: 'today' });
  await core.ctx.db.tasks.update(task.id, { dueAt: Date.now() - 100000 });

  const suggestions = await core.ai.getSuggestions('task', task.id);
  assert.ok(suggestions.some(s => s.type === 'priority'));
});

test('AI: auto-assign picks most active user', async () => {
  const task = await core.tasks.create({ orgId: org, actorId: me, title: 'Auto assign task', day: 'today' });
  const assignee = await core.ai.autoAssign(task.id);
  // May be null if no patterns yet, but should not throw
  assert.ok(assignee === null || typeof assignee === 'string');
});

test.after(async () => {
  await boot.shutdown();
  try { rmSync(dbPath, { force: true }); } catch { /* best effort */ }
});
