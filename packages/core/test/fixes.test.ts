// Regression tests for the team-fit audit: lead stages, bulk complete + undo,
// recurring tasks that no longer double up, and the calendar URL guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.COMPANYBRAIN_DB_PATH = join(tmpdir(), `companybrain-fixes-${process.pid}-${Date.now()}.sqlite`);

const { bootstrap } = await import('@companybrain/core');
const { LOCAL_ORG_ID, LOCAL_USER_ID } = await import('@companybrain/auth');
const { nextLeadStage } = await import('../src/bulk');
const { isPrivateAddress } = await import('../../integrations/src/input/calendar-import');

const { core } = await bootstrap();
const org = LOCAL_ORG_ID;
const me = LOCAL_USER_ID;

test('lead stages: advance walks the pipeline and stops at a closed deal', () => {
  assert.equal(nextLeadStage('new'), 'contacted');
  assert.equal(nextLeadStage('won'), null);
  assert.equal(nextLeadStage('lost'), null);
  assert.equal(nextLeadStage('bogus' as any), null);
});

test('bulk complete marks tasks completed and one undo restores them', async () => {
  const t = await core.tasks.create({ orgId: org, actorId: me, title: 'Bulk finish me' } as any);
  const res = await core.bulk.completeTasks([t.id], me);
  assert.deepEqual(res.succeeded, [t.id]);
  assert.equal((await core.ctx.db.tasks.get(t.id))!.completed, true);

  const ev = (await core.events.list(org, 200)).find((e) => e.type === 'task.completed' && e.entityId === t.id);
  assert.ok(ev, 'bulk complete is logged with an undo');
  await core.events.undo(ev!.id, me);
  assert.equal((await core.ctx.db.tasks.get(t.id))!.completed, false);

  await assert.rejects(() => core.events.undo(ev!.id, me), 'the same event cannot be undone twice');
});

test('recurring: one copy per day, never a copy of a copy', async () => {
  const tpl = await core.tasks.create({ orgId: org, actorId: me, title: 'Daily standup notes', recur: 'Daily' } as any);
  const tomorrow = new Date(tpl.createdAt + 86400e3);
  const first = await core.recurring.processDaily(org, tomorrow);
  assert.equal(first.created, 1);
  const again = await core.recurring.processDaily(org, tomorrow);
  assert.equal(again.created, 0, 'running twice on the same day makes nothing new');
  const dayAfter = await core.recurring.processDaily(org, new Date(tpl.createdAt + 2 * 86400e3));
  assert.equal(dayAfter.created, 1, 'copies are not templates, so the list grows by one a day');
});

test('recurring: weekly and monthly follow the first day the task was made', () => {
  const monday = new Date(2026, 10, 23); // a Monday
  assert.equal(core.recurring.shouldCreateToday('Weekly', new Date(2026, 10, 30), monday), true);
  assert.equal(core.recurring.shouldCreateToday('Weekly', new Date(2026, 11, 1), monday), false);
  const the31st = new Date(2026, 0, 31);
  assert.equal(core.recurring.shouldCreateToday('Monthly', new Date(2026, 1, 28), the31st), true, 'short months use their last day');
  assert.equal(core.recurring.shouldCreateToday('Monthly', new Date(2026, 1, 27), the31st), false);
});

test('calendar import refuses private and local addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '142.250.72.14', '2606:4700::1111']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});
