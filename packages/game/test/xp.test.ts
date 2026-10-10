import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, MIN, HOUR, DAY } from './helpers';

const sum = (rows: { xp: number }[]) => rows.reduce((s, r) => s + r.xp, 0);

test('base XP per priority; assignee earns; creator earns intel', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  const ids: string[] = [];
  for (const priority of ['none', 'low', 'medium', 'high', 'urgent'] as const) {
    ids.push((await w.create('bob', { priority, assignees: ['alice'] })).id);
  }
  w.now += 10 * MIN;
  for (const id of ids) await w.complete(id, 'alice');
  assert.deepEqual(w.ledger('alice', 'mission_complete').map((r) => r.xp), [10, 15, 25, 40, 60]);
  assert.deepEqual(w.ledger('bob', 'intel').map((r) => r.xp), [2, 2, 2, 2, 2]);
  assert.equal(w.ledger('bob', 'mission_complete').length, 0, 'creator who is not assignee/completer earns no mission XP');
  // Streak bonus only on the first completion of the day.
  assert.deepEqual(w.ledger('alice', 'streak_bonus').map((r) => r.xp), [5]);
  // Every reward is published to the rewarded member.
  const live = w.rewardsFor('alice');
  assert.ok(live.some((r) => r.kind === 'mission_complete' && r.xp === 60 && r.label.includes('Mission complete')));
});

test('completer who is not an assignee also earns; all assignees (humans + agents) earn; system never earns', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  w.member('bot', { kind: 'agent' });
  const t = await w.create('alice', { assignees: ['bob', 'bot'], priority: 'high' });
  w.now += 5 * MIN;
  await w.complete(t.id, 'alice');
  for (const m of ['alice', 'bob', 'bot']) assert.deepEqual(w.ledger(m, 'mission_complete').map((r) => r.xp), [40], m);

  const t2 = await w.create('alice', { assignees: [], priority: 'low' });
  w.now += 5 * MIN;
  await w.complete(t2.id, 'system');
  assert.equal(w.ledger('system').length, 0);
  assert.equal(w.ledger('alice', 'mission_complete').length, 1, 'no assignees + system completer → nobody earns');
});

test('on-time bonus (+50% base), rescue bonus (+10), objectives (+3, max 10 per mission)', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  const onTime = await w.create('bob', { priority: 'high', assignees: ['alice'], dueAt: w.now + HOUR });
  const late = await w.create('bob', { priority: 'medium', assignees: ['alice'], dueAt: w.now - HOUR });
  const checklist = await w.create('bob', { priority: 'low', assignees: ['alice'], subtasks: 12 });
  w.now += 10 * MIN;
  await w.complete(onTime.id, 'alice');
  await w.complete(late.id, 'alice');
  assert.deepEqual(w.ledger('alice', 'on_time_bonus').map((r) => r.xp), [20]);
  assert.deepEqual(w.ledger('alice', 'rescue_bonus').map((r) => r.xp), [10]);

  for (let i = 0; i < 12; i++) await w.checkSubtask(checklist.id, i, 'alice');
  assert.equal(sum(w.ledger('alice', 'subtask')), 30, '10 objectives × 3 XP, capped per mission');
  const p = await w.game.service.profile(w.actor('alice'));
  assert.equal(p.stats.onTime, 1);
  assert.equal(p.stats.rescued, 1);
});

test('intel: +2 per created mission, max 10 per member per day', async () => {
  const w = new World();
  w.member('bob');
  for (let i = 0; i < 13; i++) await w.create('bob');
  assert.equal(sum(w.ledger('bob', 'intel')), 20);
  w.now += DAY;
  await w.create('bob');
  assert.equal(sum(w.ledger('bob', 'intel')), 22, 'cap resets the next day');
  assert.equal((await w.game.service.profile(w.actor('bob'))).stats.created, 14);
});

test('anti-farm: self-created mission completed < 2 min later → 20% base, no bonuses, no streak', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  const t = await w.create('alice', { priority: 'urgent', dueAt: w.now + HOUR });
  w.now += 60_000;
  await w.complete(t.id, 'alice');
  assert.deepEqual(w.ledger('alice', 'mission_complete').map((r) => r.xp), [12]);
  assert.equal(w.ledger('alice', 'on_time_bonus').length, 0);
  assert.equal(w.ledger('alice', 'streak_bonus').length, 0);
  assert.equal(w.ledger('alice', 'achievement').length, 0, 'farmed missions do not count toward medals');

  // Creator instantly completing a mission assigned to someone else penalizes everyone on it.
  const t2 = await w.create('bob', { priority: 'urgent', assignees: ['alice'] });
  w.now += 30_000;
  await w.complete(t2.id, 'bob');
  assert.deepEqual(w.ledger('alice', 'mission_complete').map((r) => r.xp), [12, 12]);

  // After 2 minutes it is a real mission.
  const t3 = await w.create('alice', { priority: 'urgent' });
  w.now += 3 * MIN;
  await w.complete(t3.id, 'alice');
  assert.deepEqual(w.ledger('alice', 'mission_complete').map((r) => r.xp), [12, 12, 60]);
});

test('daily cap: 1,000 mission XP per member per day; excess logged as 0', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  const ids: string[] = [];
  for (let i = 0; i < 18; i++) ids.push((await w.create('bob', { priority: 'urgent', assignees: ['alice'] })).id);
  w.now += 10 * MIN;
  for (const id of ids) await w.complete(id, 'alice');
  const rows = w.ledger('alice', 'mission_complete');
  assert.equal(rows.length, 18);
  assert.equal(sum(rows), 1000);
  assert.equal(rows[16]!.xp, 40);
  assert.equal(rows[17]!.xp, 0);
  assert.match(rows[17]!.label, /daily cap reached/);
  // Next day: fresh cap.
  w.now += DAY;
  const t = await w.create('bob', { priority: 'urgent', assignees: ['alice'] });
  w.now += 10 * MIN;
  await w.complete(t.id, 'alice');
  assert.equal(w.ledger('alice', 'mission_complete').at(-1)!.xp, 60);
});

test('idempotent: replaying audit events never double-awards', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  const t = await w.create('bob', { assignees: ['alice'], subtasks: 2, dueAt: w.now + HOUR });
  w.now += 10 * MIN;
  await w.checkSubtask(t.id, 0, 'alice');
  await w.complete(t.id, 'alice');
  const ledgerBefore = (w.db.prepare('SELECT COUNT(*) AS n, SUM(xp) AS s FROM game_rewards').get() as { n: number; s: number });
  const published = w.published.length;
  for (const e of [...w.events]) await w.game.onAudit(e);
  await Promise.all(w.events.map((e) => w.game.onAudit(structuredClone(e))));
  assert.deepEqual(w.db.prepare('SELECT COUNT(*) AS n, SUM(xp) AS s FROM game_rewards').get(), ledgerBefore);
  assert.equal(w.published.length, published);
});

test('reopen within 24h revokes exactly what the completion awarded; re-complete same day awards nothing', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  const t = await w.create('bob', { priority: 'high', assignees: ['alice'], dueAt: w.now + HOUR });
  w.now += 10 * MIN;
  await w.complete(t.id, 'alice');
  const earned = sum(w.ledger('alice').filter((r) => ['mission_complete', 'on_time_bonus', 'streak_bonus'].includes(r.kind)));
  assert.equal(earned, 40 + 20 + 5);
  const xpBefore = w.xpOf('alice');

  w.now += HOUR;
  await w.reopen(t.id, 'alice');
  assert.deepEqual(w.ledger('alice', 'revoked').map((r) => r.xp), [-65]);
  assert.equal(w.xpOf('alice'), xpBefore - 65);
  assert.ok(w.rewardsFor('alice').some((r) => r.kind === 'revoked' && r.xp === -65));
  assert.equal((await w.game.service.profile(w.actor('alice'))).stats.missionsCompleted, 0);

  w.now += 10 * MIN;
  await w.complete(t.id, 'alice');
  assert.equal(w.ledger('alice', 'mission_complete').length, 1, 'once per task per day');
});

test('re-completion on a later day awards again; reopen after 24h keeps XP', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  const t = await w.create('bob', { assignees: ['alice'] });
  w.now += 10 * MIN;
  await w.complete(t.id, 'alice');
  w.now += HOUR;
  await w.reopen(t.id, 'alice');
  w.now += DAY;
  await w.complete(t.id, 'alice');
  assert.deepEqual(w.ledger('alice', 'mission_complete').map((r) => r.xp), [25, 25]);
  w.now += 25 * HOUR;
  await w.reopen(t.id, 'alice');
  assert.equal(w.ledger('alice', 'revoked').length, 1, 'only the first (within 24h) reopen revoked');
});

test('coins: 1 coin per 10 XP earned (floor of running total)', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  const t = await w.create('bob', { priority: 'low', assignees: ['alice'] });
  w.now += 10 * MIN;
  await w.complete(t.id, 'alice');
  const p = await w.game.service.profile(w.actor('alice'));
  assert.equal(p.coins, Math.floor(p.xp / 10));
  const coinsInLedger = (w.db.prepare("SELECT SUM(coins) AS c FROM game_rewards WHERE member_id = 'alice'").get() as { c: number }).c;
  assert.equal(coinsInLedger, Math.floor(p.xp / 10));
});

test('onAudit never throws on malformed events or failing services', async () => {
  const w = new World();
  w.member('alice');
  await w.game.onAudit({ id: 'x1', orgId: 'org1', actorId: 'alice', type: 'task.updated', entity: 'task', entityId: 't', summary: '', before: { status: 'todo' }, after: { status: 'done', assigneeIds: 'nope', subtasks: [null, 3] }, undoable: false, undoneAt: null, undoneBy: null, at: w.now });
  // @ts-expect-error deliberately broken input
  await w.game.onAudit(null);
  await w.game.onAudit({ id: 'x2', orgId: 'org1', actorId: 'alice', type: 'member.updated', entity: 'member', entityId: 'alice', summary: '', before: null, after: null, undoable: false, undoneAt: null, undoneBy: null, at: w.now });
  assert.ok(true);
});
