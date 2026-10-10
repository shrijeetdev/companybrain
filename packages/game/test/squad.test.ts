import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, MIN, HOUR, DAY, MON_NOON } from './helpers';
import { ACHIEVEMENTS, CHALLENGES } from '../src/index';

const unlocked = async (w: World, id: string) =>
  new Set((await w.game.service.achievements(w.actor(id))).filter((a) => a.unlockedAt != null).map((a) => a.achievement.id));

test('catalog: ≥24 achievements across tiers incl. secrets', () => {
  assert.ok(ACHIEVEMENTS.length >= 24);
  for (const tier of ['bronze', 'silver', 'gold', 'legendary']) assert.ok(ACHIEVEMENTS.some((a) => a.tier === tier), tier);
  assert.ok(ACHIEVEMENTS.filter((a) => a.secret).length >= 3);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
});

test('achievements: First Blood, Early Bird, Night Owl, Weekend Warrior (secret), Clean Sweep, Sharpshooter, Rescue Specialist', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  // Secret medals are masked until unlocked.
  const masked = (await w.game.service.achievements(w.actor('alice'))).find((a) => a.achievement.id === 'weekend_warrior')!;
  assert.equal(masked.achievement.name, 'Classified');

  // Monday 07:00 UTC → Early Bird + First Blood.
  w.now = MON_NOON - 5 * HOUR - 10 * MIN;
  const early = await w.create('bob', { assignees: ['alice'] });
  w.now += 10 * MIN;
  await w.complete(early.id, 'alice');
  let got = await unlocked(w, 'alice');
  assert.ok(got.has('first_blood') && got.has('early_bird'));
  assert.ok(!got.has('night_owl'));

  // Clean Sweep: three missions due today, all cleared.
  w.now = MON_NOON;
  const due = MON_NOON + 6 * HOUR;
  const sweep = [];
  for (let i = 0; i < 3; i++) sweep.push(await w.create('bob', { assignees: ['alice'], dueAt: due }));
  w.now += 10 * MIN;
  await w.complete(sweep[0]!.id, 'alice');
  await w.complete(sweep[1]!.id, 'alice');
  assert.ok(!(await unlocked(w, 'alice')).has('clean_sweep'));
  await w.complete(sweep[2]!.id, 'alice');
  assert.ok((await unlocked(w, 'alice')).has('clean_sweep'));

  // Night Owl: 23:00.
  w.now = MON_NOON + 10 * HOUR + 50 * MIN;
  const night = await w.create('bob', { assignees: ['alice'] });
  w.now += 10 * MIN;
  await w.complete(night.id, 'alice');
  assert.ok((await unlocked(w, 'alice')).has('night_owl'));

  // Sharpshooter: 10 on-time in a row (3 already on time above).
  w.now = MON_NOON + DAY;
  for (let i = 0; i < 7; i++) {
    const t = await w.create('bob', { assignees: ['alice'], dueAt: w.now + DAY });
    w.now += 5 * MIN;
    await w.complete(t.id, 'alice');
  }
  assert.ok((await unlocked(w, 'alice')).has('sharpshooter_10'));

  // Rescue Specialist: clear 10 overdue missions.
  for (let i = 0; i < 10; i++) {
    const t = await w.create('bob', { assignees: ['alice'], dueAt: w.now - HOUR });
    w.now += 5 * MIN;
    await w.complete(t.id, 'alice');
  }
  got = await unlocked(w, 'alice');
  assert.ok(got.has('rescue_specialist'));
  assert.ok(!got.has('weekend_warrior'));

  // Saturday → secret Weekend Warrior is revealed.
  w.now = MON_NOON + 5 * DAY;
  const sat = await w.create('bob', { assignees: ['alice'] });
  w.now += 10 * MIN;
  await w.complete(sat.id, 'alice');
  const ww = (await w.game.service.achievements(w.actor('alice'))).find((a) => a.achievement.id === 'weekend_warrior')!;
  assert.equal(ww.achievement.name, 'Weekend Warrior');
  assert.ok(ww.unlockedAt);

  // Each unlock → achievement reward (+XP) and a feed item; silver+ → crate.
  const rows = w.ledger('alice', 'achievement');
  assert.ok(rows.some((r) => r.xp === 75 && r.label.includes('Sharpshooter')));
  const crates = await w.game.service.crates(w.actor('alice'));
  assert.ok(crates.some((c) => c.source === 'Medal: Sharpshooter' && c.rarity === 'common'));
  assert.ok((await w.game.service.feed(w.actor('bob'), 100)).some((f) => f.text.includes('unlocked Clean Sweep')));
});

test('achievements: AI Whisperer, Intel Officer, Squad Player', async () => {
  const w = new World();
  w.member('alice');
  w.member('carol');
  w.member('bot', { kind: 'agent' });
  for (let i = 0; i < 10; i++) {
    const t = await w.create('alice', { assignees: ['bot', 'carol'] });
    w.now += 3 * MIN;
    await w.complete(t.id, 'bot');
  }
  for (let i = 0; i < 40; i++) await w.create('alice');
  const a = await unlocked(w, 'alice');
  assert.ok(a.has('ai_whisperer'));
  assert.ok(a.has('intel_officer'));
  assert.ok((await unlocked(w, 'carol')).has('squad_player'));
  assert.ok((await unlocked(w, 'bot')).has('squad_player'));
});

test('daily challenges: 3 per day, deterministic per member+day, achievable picks, progress + reward', async () => {
  const mk = async () => {
    const w = new World();
    w.member('alice');
    w.member('bob');
    w.now = MON_NOON - 3 * HOUR; // 09:00
    for (let i = 0; i < 3; i++) await w.create('bob', { assignees: ['alice'] });
    return w;
  };
  const w = await mk();
  const c1 = await w.game.service.challenges(w.actor('alice'));
  assert.equal(c1.length, 3);
  assert.deepEqual(await w.game.service.challenges(w.actor('alice')), c1, 'stable within the day');
  const w2 = await mk();
  const c2 = await w2.game.service.challenges(w2.actor('alice'));
  assert.deepEqual(c2.map((c) => c.title), c1.map((c) => c.title), 'same member + day + missions → same picks');
  // With 3 open missions (no deadlines/priority/objectives) only these metrics are achievable.
  const metricOf = (title: string) => CHALLENGES.find((c) => c.title === title)!.metric;
  assert.deepEqual(new Set(c1.map((c) => metricOf(c.title))), new Set(['complete', 'complete_before_noon', 'create']));
  assert.ok(c1.every((c) => c.day === '2026-10-05' && c.memberId === 'alice' && c.progress === 0));

  // Progress from events: deploy 3, clear all 3 before noon.
  for (let i = 0; i < 3; i++) await w.create('alice', { assignees: ['bob'] });
  w.now += 10 * MIN;
  for (const t of w.tasks.filter((t) => t.creatorId === 'bob')) await w.complete(t.id, 'alice');
  const done = await w.game.service.challenges(w.actor('alice'));
  assert.ok(done.every((c) => c.completedAt != null && c.progress === c.target), JSON.stringify(done));
  assert.equal(w.ledger('alice', 'challenge').length, 3);
  assert.ok((await unlocked(w, 'alice')).has('daily_triple'));

  // A new day brings new challenges.
  w.now += DAY;
  const tomorrow = await w.game.service.challenges(w.actor('alice'));
  assert.ok(tomorrow.every((c) => c.day === '2026-10-06' && c.progress === 0));
});

test('squad bonus: +100 to everyone who completed a mission, once per operation; lead gets Operation Commander', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  w.member('carol');
  w.member('dave');
  w.project('acme', { lead: 'carol', members: ['alice', 'bob', 'carol'], name: 'Acme' });
  const t1 = await w.create('carol', { assignees: ['alice'], projectId: 'acme' });
  const t2 = await w.create('carol', { assignees: ['bob'], projectId: 'acme' });
  const t3 = await w.create('carol', { assignees: ['alice'], projectId: 'acme' });
  const t4 = await w.create('carol', { assignees: ['dave'], projectId: 'acme' });
  w.tasks.find((t) => t.id === t4.id)!.status = 'cancelled'; // cancelled missions don't block
  w.now += 10 * MIN;
  await w.complete(t1.id, 'alice');
  await w.complete(t2.id, 'bob');
  assert.equal(w.ledger('alice', 'squad_bonus').length, 0);
  await w.complete(t3.id, 'alice');
  assert.deepEqual(w.ledger('alice', 'squad_bonus').map((r) => r.xp), [100]);
  assert.deepEqual(w.ledger('bob', 'squad_bonus').map((r) => r.xp), [100]);
  assert.equal(w.ledger('carol', 'squad_bonus').length, 0);
  assert.equal(w.ledger('dave', 'squad_bonus').length, 0);
  assert.ok((await unlocked(w, 'carol')).has('operation_commander'));
  assert.ok((await w.game.service.feed(w.actor('dave'))).some((f) => f.text.startsWith('Operation Acme cleared')));

  w.now += HOUR;
  await w.reopen(t3.id, 'alice');
  w.now += DAY;
  await w.complete(t3.id, 'alice');
  assert.equal(w.ledger('alice', 'squad_bonus').length, 1, 'once per project');
});

test('leaderboard: period XP, humans/agents split, ordering', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  w.member('zoe');
  w.member('bot', { kind: 'agent', name: 'Bot' });
  // Bob: big week last week (Friday).
  w.now = MON_NOON - 3 * DAY;
  for (let i = 0; i < 3; i++) {
    const t = await w.create('zoe', { assignees: ['bob'], priority: 'urgent' });
    w.now += 3 * MIN;
    await w.complete(t.id, 'bob');
  }
  // This week: alice two low missions, bot one.
  w.now = MON_NOON;
  for (let i = 0; i < 2; i++) {
    const t = await w.create('zoe', { assignees: ['alice'], priority: 'low', dueAt: w.now + DAY });
    w.now += 3 * MIN;
    await w.complete(t.id, 'alice');
  }
  const tb = await w.create('zoe', { assignees: ['bot'], priority: 'medium' });
  w.now += 3 * MIN;
  await w.complete(tb.id, 'bot');

  const week = await w.game.service.leaderboard(w.actor('zoe'), 'week');
  assert.deepEqual(week.humans.map((e) => e.member.id), ['alice', 'zoe', 'bob']);
  assert.deepEqual(week.humans.map((e) => e.position), [1, 2, 3]);
  assert.deepEqual(week.agents.map((e) => e.member.id), ['bot']);
  const a = week.humans[0]!;
  assert.equal(a.missions, 2);
  assert.equal(a.onTimeRate, 1);
  assert.equal(a.xp, w.xpOf('alice'));
  assert.equal(week.humans.find((e) => e.member.id === 'bob')!.xp, 0);

  const all = await w.game.service.leaderboard(w.actor('zoe'), 'all');
  assert.equal(all.humans[0]!.member.id, 'bob');
  assert.equal(all.humans[0]!.missions, 3);
  assert.equal(all.humans[0]!.onTimeRate, 0, 'no deadlines → 0 on-time rate');
  await assert.rejects(w.game.service.leaderboard(w.actor('zoe'), 'year' as 'week'), /period/);
});

test('HUD: today/week/squad progress, operations, challenges, profile', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  w.project('ops', { members: ['alice'], name: 'Ops' });
  w.project('other', { members: ['bob'], name: 'Other' });
  const today = await w.create('bob', { assignees: ['alice'], dueAt: MON_NOON + 2 * HOUR, projectId: 'ops' });
  await w.create('bob', { assignees: ['alice'], dueAt: MON_NOON - 2 * HOUR, projectId: 'ops' }); // overdue
  await w.create('bob', { assignees: ['alice'], dueAt: MON_NOON + 3 * DAY }); // Thursday
  await w.create('bob', { assignees: ['alice'], dueAt: MON_NOON + 8 * DAY }); // next week
  await w.create('alice', { assignees: ['bob'], dueAt: MON_NOON + HOUR, projectId: 'other' });
  w.now += 10 * MIN;
  await w.complete(today.id, 'alice');
  const hud = await w.game.service.hud(w.actor('alice'));
  assert.deepEqual(hud.today, { total: 2, done: 1, pending: 1, overdue: 1, pct: 50 });
  assert.deepEqual(hud.week, { total: 3, done: 1, pending: 2, overdue: 1, pct: 33 });
  assert.deepEqual(hud.squadToday, { total: 3, done: 1, pending: 2, overdue: 1, pct: 33 });
  assert.deepEqual(hud.operations.map((o) => [o.projectId, o.progress.total, o.progress.done]), [['ops', 2, 1]]);
  assert.equal(hud.challenges.length, 3);
  assert.equal(hud.profile.memberId, 'alice');
  assert.equal(hud.boost, null);
});

test('org isolation + viewing rules', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  w.member('gus', { role: 'guest' });
  w.member('zed', { org: 'org2' });
  w.member('yan', { org: 'org2' });
  for (const [by, who] of [['bob', 'alice'], ['yan', 'zed']] as const) {
    for (let i = 0; i < 5; i++) {
      const t = await w.create(by, { assignees: [who] });
      w.now += 3 * MIN;
      await w.complete(t.id, who);
    }
  }
  // Same-org member profiles are viewable; other orgs are not.
  assert.equal((await w.game.service.profile(w.actor('bob'), 'alice')).stats.missionsCompleted, 5);
  await assert.rejects(w.game.service.profile(w.actor('alice'), 'zed'), /not found/i);
  await assert.rejects(w.game.service.achievements(w.actor('alice'), 'zed'), /not found/i);
  // Guests only see themselves.
  await assert.rejects(w.game.service.profile(w.actor('gus'), 'alice'), /Guests/);
  assert.equal((await w.game.service.profile(w.actor('gus'))).memberId, 'gus');
  const gl = await w.game.service.leaderboard(w.actor('gus'), 'all');
  assert.deepEqual(gl.humans.map((e) => e.member.id), ['gus']);
  assert.deepEqual(await w.game.service.feed(w.actor('gus')), []);

  // Leaderboards / feed / crates never leak across orgs.
  const lb = await w.game.service.leaderboard(w.actor('alice'), 'all');
  assert.ok(!lb.humans.some((e) => e.member.orgId !== 'org1'));
  const feed = await w.game.service.feed(w.actor('alice'), 100);
  assert.ok(feed.length > 0 && feed.every((f) => ['alice', 'bob', 'gus'].includes(f.memberId)));
  const zedCrate = (await w.game.service.crates(w.actor('zed')))[0]!;
  await assert.rejects(w.game.service.openCrate(w.actor('alice'), zedCrate.id), /not found/i);
  assert.ok((await w.game.service.crates(w.actor('alice'))).every((c) => c.memberId === 'alice'));
  assert.ok((await w.game.service.rewards(w.actor('alice'))).every((r) => r.orgId === 'org1' && r.memberId === 'alice'));
  // Live events are org-scoped and member-targeted: rewards to the earner only, squad-feed items
  // to the earner's own org (never another org's members).
  assert.ok(w.published.filter((p) => p.event.type === 'game.reward').every((p) => p.memberIds?.length === 1));
  assert.ok(w.published.every((p) => (p.memberIds?.length ?? 0) >= 1));
  const org2 = new Set(['zed', 'yan']);
  for (const p of w.published) assert.ok(p.memberIds!.every((id) => org2.has(id) === (p.orgId === 'org2')), `${p.event.type} → ${p.memberIds}`);
  // An event for a member of another org cannot credit them in this org.
  const xpZed = w.xpOf('zed');
  const t = w.tasks.find((x) => x.orgId === 'org1')!;
  await w.game.onAudit({ id: 'cross', orgId: 'org1', actorId: 'zed', type: 'task.completed', entity: 'task', entityId: t.id, summary: '',
    before: { ...t, status: 'todo' }, after: { ...t, status: 'done', assigneeIds: ['zed'], completedBy: 'zed' }, undoable: false, undoneAt: null, undoneBy: null, at: w.now });
  assert.equal(w.xpOf('zed'), xpZed);
});
