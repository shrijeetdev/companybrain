import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, MIN, HOUR, DAY, MON_NOON } from './helpers';
import { levelForXp, rankForLevel, xpForLevel, MAX_LEVEL } from '../src/index';

test('level curve and rank thresholds', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 100);
  assert.equal(xpForLevel(3), Math.round(50 * 2 ** 1.6 + 100)); // 252
  assert.equal(xpForLevel(10), Math.round(50 * 9 ** 1.6 + 450));
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(251), 2);
  assert.equal(levelForXp(252), 3);
  assert.equal(levelForXp(10_000_000), MAX_LEVEL);
  const cases: [number, string][] = [
    [1, 'recruit'], [2, 'recruit'], [3, 'private'], [5, 'private'], [6, 'corporal'], [10, 'sergeant'], [15, 'staff_sergeant'],
    [21, 'lieutenant'], [28, 'captain'], [36, 'major'], [45, 'colonel'], [59, 'colonel'], [60, 'general'], [79, 'general'], [80, 'legend'], [100, 'legend'],
  ];
  for (const [lvl, id] of cases) assert.equal(rankForLevel(lvl).id, id, `level ${lvl}`);
  assert.deepEqual(rankForLevel(21).insignia, { kind: 'bar', count: 1, color: '#3b82f6' });
});

test('level-up → level_up reward + rare crate; new rank ≥ lieutenant → legendary crate + feed', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  const t1 = await w.create('bob', { priority: 'urgent', assignees: ['alice'] });
  const t2 = await w.create('bob', { priority: 'urgent', assignees: ['alice'] });
  w.now += 10 * MIN;
  await w.complete(t1.id, 'alice'); // 60 + 5 streak + 25 First Blood (+ maybe a daily challenge)
  await w.complete(t2.id, 'alice'); // ≥ 150 → level 2
  const p = await w.game.service.profile(w.actor('alice'));
  assert.equal(p.level, 2);
  assert.equal(p.levelXp, xpForLevel(3) - xpForLevel(2));
  assert.equal(p.levelProgressXp, p.xp - 100);
  const live = w.rewardsFor('alice');
  assert.ok(live.some((r) => r.kind === 'level_up' && r.level === 2 && r.rank?.id === 'recruit'));
  assert.ok(live.some((r) => r.kind === 'crate_earned' && r.rarity === 'rare'));

  // Jump the cached XP close to lieutenant (level 21) and finish one more mission.
  w.db.prepare("UPDATE game_players SET xp = ? WHERE member_id = 'alice'").run(xpForLevel(21) - 10);
  const t3 = await w.create('bob', { priority: 'medium', assignees: ['alice'] });
  w.now += 10 * MIN;
  await w.complete(t3.id, 'alice');
  const p2 = await w.game.service.profile(w.actor('alice'));
  assert.ok(p2.level >= 21);
  assert.equal(p2.rank.id, 'lieutenant');
  assert.equal(p2.nextRank?.id, 'captain');
  const crates = await w.game.service.crates(w.actor('alice'));
  assert.equal(crates.filter((c) => c.rarity === 'legendary' && c.source === 'Promoted to Lieutenant').length, 1);
  assert.equal(crates.filter((c) => c.rarity === 'rare' && c.source.startsWith('Level ')).length, p2.level - 1);
  const feed = await w.game.service.feed(w.actor('bob'));
  assert.ok(feed.some((f) => f.text.includes('promoted to Lieutenant')));
  assert.ok(feed.some((f) => f.text.includes('Legendary crate')));
  // Level medals fire from the same settle loop.
  const ach = await w.game.service.achievements(w.actor('alice'));
  assert.ok(ach.find((a) => a.achievement.id === 'level_10')!.unlockedAt);
});

test('streak: member timezone, weekend grace, break on missed weekday, bonus 5×streak', async () => {
  const w = new World();
  w.member('ny', { tz: 'America/New_York' });
  w.member('bob');
  const at = (iso: string) => Date.parse(iso);
  const doAt = async (ts: number) => {
    w.now = ts - 10 * MIN;
    const t = await w.create('bob', { assignees: ['ny'] });
    w.now = ts;
    await w.complete(t.id, 'ny');
  };
  // Mon 2026-10-05 23:00 New York = Tue 03:00 UTC → still Monday for this member.
  await doAt(at('2026-10-06T03:00:00Z'));
  await doAt(at('2026-10-06T23:30:00Z')); // Tue 19:30 NY → day 2
  await doAt(at('2026-10-09T16:00:00Z')); // Fri — Wed/Thu missed → reset to 1
  await doAt(at('2026-10-12T16:00:00Z')); // Mon — weekend grace → 2
  assert.deepEqual(w.ledger('ny', 'streak_bonus').map((r) => r.xp), [5, 10, 5, 10]);
  w.now = at('2026-10-13T16:00:00Z'); // Tue: Monday was active → alive
  let p = await w.game.service.profile(w.actor('ny'));
  assert.equal(p.streak.current, 2);
  assert.equal(p.streak.best, 2);
  assert.equal(p.streak.lastActiveDay, '2026-10-12');
  w.now = at('2026-10-14T16:00:00Z'); // Wed: Tuesday missed → broken
  p = await w.game.service.profile(w.actor('ny'));
  assert.equal(p.streak.current, 0);
  assert.equal(p.streak.best, 2);
});

test('7-day streak → epic crate; bonus capped at 50', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  for (let d = 0; d < 12; d++) {
    w.now = MON_NOON + d * DAY;
    const t = await w.create('bob', { assignees: ['alice'] });
    w.now += 10 * MIN;
    await w.complete(t.id, 'alice');
  }
  const bonuses = w.ledger('alice', 'streak_bonus').map((r) => r.xp);
  assert.deepEqual(bonuses, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 50, 50]);
  const crates = await w.game.service.crates(w.actor('alice'));
  assert.equal(crates.filter((c) => c.rarity === 'epic' && c.source === '7-day streak').length, 1);
  assert.equal(crates.filter((c) => c.rarity === 'common' && /missions completed/.test(c.source)).length, 2, 'common crate every 5 missions');
});

test('crate opening: reward rolled once, cosmetics to inventory, duplicates → coins, self only', async () => {
  const w = new World(() => 0.99); // always rolls the last cosmetic of the pool
  w.member('alice');
  w.member('bob');
  for (let i = 0; i < 10; i++) {
    const t = await w.create('bob', { assignees: ['alice'], priority: 'none' });
    w.now += 3 * MIN;
    await w.complete(t.id, 'alice');
  }
  const commons = (await w.game.service.crates(w.actor('alice'))).filter((c) => c.rarity === 'common');
  assert.equal(commons.length, 2);
  const before = await w.game.service.profile(w.actor('alice'));
  assert.equal(before.unopenedCrates >= 2, true);

  const c1 = await w.game.service.openCrate(w.actor('alice'), commons[0]!.id);
  assert.deepEqual(c1.reward, { kind: 'emote', id: 'thumbs-up', name: 'Thumbs Up', rarity: 'common' });
  assert.ok(c1.openedAt);
  const again = await w.game.service.openCrate(w.actor('alice'), commons[0]!.id);
  assert.deepEqual(again.reward, c1.reward, 'opening twice does not re-roll');
  assert.deepEqual((await w.game.service.inventory(w.actor('alice'))).map((i) => i.id), ['thumbs-up']);

  const c2 = await w.game.service.openCrate(w.actor('alice'), commons[1]!.id);
  assert.equal(c2.reward?.kind, 'coins');
  assert.equal(c2.reward?.amount, 25);
  const after = await w.game.service.profile(w.actor('alice'));
  assert.equal(after.coins, before.coins + 25);
  assert.equal(after.stats.cratesOpened, 2);

  await assert.rejects(w.game.service.openCrate(w.actor('bob'), commons[0]!.id), /not found/i);
  await assert.rejects(w.game.service.openCrate(w.actor('alice', { via: 'api_key', scopes: ['read'] }), commons[1]!.id), /write scope/);

  // Equip only what you own.
  const prof = await w.game.service.equip(w.actor('alice'), { emote: 'thumbs-up' });
  assert.equal(prof.equipped.emote, 'thumbs-up');
  await assert.rejects(w.game.service.equip(w.actor('alice'), { frame: 'gold-camo' }), /own/);
  await assert.rejects(w.game.service.equip(w.actor('alice'), { title: 'made-up' }), /Unknown/);
});

test('XP boost from a crate multiplies mission XP while active', async () => {
  const w = new World(() => 0.6); // common table → 30-min boost
  w.member('alice');
  w.member('bob');
  for (let i = 0; i < 5; i++) {
    const t = await w.create('bob', { assignees: ['alice'], priority: 'none' });
    w.now += 3 * MIN;
    await w.complete(t.id, 'alice');
  }
  const crate = (await w.game.service.crates(w.actor('alice'))).find((c) => c.rarity === 'common')!;
  const opened = await w.game.service.openCrate(w.actor('alice'), crate.id);
  assert.equal(opened.reward?.kind, 'xp_boost');
  const hud = await w.game.service.hud(w.actor('alice'));
  assert.deepEqual(hud.boost, { multiplier: 1.5, until: w.now + 30 * MIN });

  const t = await w.create('bob', { assignees: ['alice'], priority: 'medium' });
  w.now += 5 * MIN;
  await w.complete(t.id, 'alice');
  const last = w.ledger('alice', 'mission_complete').at(-1)!;
  assert.equal(last.xp, 38);
  assert.match(last.label, /boost/);

  w.now += HOUR;
  const t2 = await w.create('bob', { assignees: ['alice'], priority: 'medium' });
  w.now += 5 * MIN;
  await w.complete(t2.id, 'alice');
  assert.equal(w.ledger('alice', 'mission_complete').at(-1)!.xp, 25, 'boost expired');
});

test('rebuild recomputes the cached player rows from the ledger', async () => {
  const w = new World();
  w.member('alice');
  w.member('bob');
  const t = await w.create('bob', { assignees: ['alice'], priority: 'urgent' });
  w.now += 10 * MIN;
  await w.complete(t.id, 'alice');
  const p1 = await w.game.service.profile(w.actor('alice'));
  w.db.prepare('DELETE FROM game_players').run();
  assert.equal(w.game.rebuild('org1'), 2);
  const p2 = await w.game.service.profile(w.actor('alice'));
  assert.deepEqual(p2, p1);
});
