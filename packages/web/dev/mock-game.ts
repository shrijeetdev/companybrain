/* eslint-disable */
// In-memory mock of the "Tactical Ops" game layer (GameService) for web development.
import { randomBytes } from 'node:crypto';
import type {
  Achievement, AchievementProgress, Crate, CrateReward, DailyChallenge, FeedItem, Hud, InventoryItem,
  Leaderboard, LeaderboardEntry, LiveEvent, Member, MissionProgress, PlayerProfile, Project, Rank, Rarity,
  RewardEvent, RewardKind, TaskView,
} from '../../types/src/index.ts';

const D = 86400_000;
const H = 3600_000;

export const RANKS: Rank[] = [
  { id: 'recruit', name: 'Recruit', minLevel: 1, insignia: { kind: 'chevron', count: 1, color: '#9aa4b2' } },
  { id: 'private', name: 'Private', minLevel: 3, insignia: { kind: 'chevron', count: 1, color: '#c8d1dc' } },
  { id: 'corporal', name: 'Corporal', minLevel: 5, insignia: { kind: 'chevron', count: 2, color: '#c8d1dc' } },
  { id: 'sergeant', name: 'Sergeant', minLevel: 8, insignia: { kind: 'chevron', count: 3, color: '#ffb020' } },
  { id: 'staff_sergeant', name: 'Staff Sergeant', minLevel: 11, insignia: { kind: 'chevron', count: 4, color: '#ffb020' } },
  { id: 'lieutenant', name: 'Lieutenant', minLevel: 14, insignia: { kind: 'bar', count: 1, color: '#22d3ee' } },
  { id: 'captain', name: 'Captain', minLevel: 18, insignia: { kind: 'bar', count: 2, color: '#22d3ee' } },
  { id: 'major', name: 'Major', minLevel: 22, insignia: { kind: 'star', count: 1, color: '#a78bfa' } },
  { id: 'colonel', name: 'Colonel', minLevel: 27, insignia: { kind: 'star', count: 2, color: '#a78bfa' } },
  { id: 'general', name: 'General', minLevel: 33, insignia: { kind: 'star', count: 3, color: '#f472b6' } },
  { id: 'legend', name: 'Legend', minLevel: 40, insignia: { kind: 'crown', count: 1, color: '#facc15' } },
];
const rankFor = (level: number) => [...RANKS].reverse().find((r) => level >= r.minLevel)!;
const nextRankFor = (level: number) => RANKS.find((r) => r.minLevel > level) ?? null;
const levelXp = (level: number) => 200 + (level - 1) * 50;
function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1; let rest = xp;
  while (rest >= levelXp(level)) { rest -= levelXp(level); level++; }
  return { level, into: rest, need: levelXp(level) };
}
const xpForLevel = (level: number, into: number) => { let x = 0; for (let l = 1; l < level; l++) x += levelXp(l); return x + into; };

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', name: 'First Contact', description: 'Complete your first mission.', icon: '🎯', tier: 'bronze', secret: false, target: 1 },
  { id: 'sharpshooter_10', name: 'Sharpshooter', description: 'Finish 10 missions on time.', icon: '🏹', tier: 'silver', secret: false, target: 10 },
  { id: 'rescuer_5', name: 'Search & Rescue', description: 'Clear 5 critical (overdue) missions.', icon: '🛟', tier: 'silver', secret: false, target: 5 },
  { id: 'streak_7', name: 'Iron Discipline', description: 'Keep a 7-day streak.', icon: '🔥', tier: 'gold', secret: false, target: 7 },
  { id: 'centurion', name: 'Centurion', description: 'Complete 100 missions.', icon: '🛡️', tier: 'gold', secret: false, target: 100 },
  { id: 'commander', name: 'Field Commander', description: 'Assign 25 missions to your squad.', icon: '📡', tier: 'silver', secret: false, target: 25 },
  { id: 'ai_handler', name: 'AI Handler', description: 'Have AI operatives complete 10 of your missions.', icon: '🤖', tier: 'silver', secret: false, target: 10 },
  { id: 'sector_sweep', name: 'Sector Sweep', description: 'Clear every mission due today, 5 times.', icon: '🧹', tier: 'gold', secret: false, target: 5 },
  { id: 'night_owl', name: 'Night Shift', description: '???', icon: '🦉', tier: 'bronze', secret: true, target: 1 },
  { id: 'legendary', name: 'Living Legend', description: '???', icon: '👑', tier: 'legendary', secret: true, target: 1 },
  { id: 'crate_hunter', name: 'Crate Hunter', description: 'Open 10 loot crates.', icon: '📦', tier: 'bronze', secret: false, target: 10 },
  { id: 'zero_inbox', name: 'Clean Intel', description: 'Triage 20 intel items.', icon: '🛰️', tier: 'bronze', secret: false, target: 20 },
];

const COSMETICS: Record<Rarity, { kind: 'title' | 'frame' | 'emote'; id: string; name: string }[]> = {
  common: [{ kind: 'title', id: 't_rookie', name: 'Rookie Runner' }, { kind: 'emote', id: 'e_salute', name: '🫡 Salute' }, { kind: 'frame', id: 'f_steel', name: 'Steel' }],
  rare: [{ kind: 'title', id: 't_night_raider', name: 'Night Raider' }, { kind: 'frame', id: 'f_cyan', name: 'Cyan Circuit' }, { kind: 'emote', id: 'e_rocket', name: '🚀 Liftoff' }],
  epic: [{ kind: 'title', id: 't_deadline_hunter', name: 'Deadline Hunter' }, { kind: 'frame', id: 'f_violet', name: 'Violet Storm' }],
  legendary: [{ kind: 'title', id: 't_ghost', name: 'The Ghost Who Ships' }, { kind: 'frame', id: 'f_gold', name: 'Gold Camo' }],
};

interface PlayerState {
  xp: number; coins: number; streak: { current: number; best: number; lastActiveDay: string | null };
  stats: PlayerProfile['stats']; equipped: PlayerProfile['equipped'];
  crates: Crate[]; inventory: InventoryItem[]; rewards: RewardEvent[]; achievements: Map<string, { progress: number; unlockedAt: number | null }>;
  challenges: DailyChallenge[]; periodXp: { week: number; month: number };
}

export interface MockGameDeps {
  orgId: string;
  members: () => Member[];
  tasks: () => TaskView[];
  projects: () => Project[];
  today0: () => number;
  dayKey: () => string;
  publish: (e: LiveEvent, memberIds?: string[]) => void;
}

export function createMockGame(deps: MockGameDeps) {
  const rid = (p: string) => `${p}_${randomBytes(8).toString('hex')}`;
  const players = new Map<string, PlayerState>();
  const feed: FeedItem[] = [];

  function init(m: Member, i: number): PlayerState {
    const isOwner = m.role === 'owner';
    const lvl = isOwner ? 13 : m.kind === 'agent' ? [16, 9, 19][i % 3]! : [11, 15, 7, 9, 12, 6][i % 6]!;
    const into = isOwner ? levelXp(13) - 45 : Math.round(levelXp(lvl) * ((i * 37) % 90) / 100);
    const now = Date.now();
    const st: PlayerState = {
      xp: xpForLevel(lvl, into), coins: isOwner ? 1240 : 300 + i * 117,
      streak: { current: isOwner ? 6 : (i * 3) % 9, best: isOwner ? 14 : 5 + i, lastActiveDay: deps.dayKey() },
      stats: { missionsCompleted: 40 + lvl * 9, onTime: 30 + lvl * 7, rescued: 3 + (i % 6), created: 60 + i * 9, cratesOpened: 4 + (i % 4), achievements: 4 },
      equipped: isOwner ? { title: 'Night Raider', frame: 'f_cyan', emote: '🫡 Salute' } : { title: null, frame: null, emote: null },
      crates: [], inventory: [], rewards: [], achievements: new Map(), challenges: [],
      periodXp: { week: isOwner ? 640 : 180 + ((i * 131) % 700), month: isOwner ? 2380 : 900 + ((i * 337) % 2200) },
    };
    if (isOwner) {
      st.crates = [
        { id: rid('crate'), memberId: m.id, rarity: 'rare', source: '5 missions completed', earnedAt: now - 3 * H, openedAt: null, reward: null },
        { id: rid('crate'), memberId: m.id, rarity: 'epic', source: '6-day streak', earnedAt: now - 20 * H, openedAt: null, reward: null },
        { id: rid('crate'), memberId: m.id, rarity: 'common', source: 'Daily challenge', earnedAt: now - 26 * H, openedAt: null, reward: null },
        { id: rid('crate'), memberId: m.id, rarity: 'legendary', source: 'Level 12 reached', earnedAt: now - 4 * D, openedAt: now - 4 * D, reward: { kind: 'title', id: 't_ghost', name: 'The Ghost Who Ships', rarity: 'legendary' } },
      ];
      st.inventory = [
        { kind: 'title', id: 't_rookie', name: 'Rookie Runner', rarity: 'common', acquiredAt: now - 40 * D },
        { kind: 'title', id: 't_night_raider', name: 'Night Raider', rarity: 'rare', acquiredAt: now - 12 * D },
        { kind: 'title', id: 't_ghost', name: 'The Ghost Who Ships', rarity: 'legendary', acquiredAt: now - 4 * D },
        { kind: 'frame', id: 'f_steel', name: 'Steel', rarity: 'common', acquiredAt: now - 30 * D },
        { kind: 'frame', id: 'f_cyan', name: 'Cyan Circuit', rarity: 'rare', acquiredAt: now - 9 * D },
        { kind: 'emote', id: 'e_salute', name: '🫡 Salute', rarity: 'common', acquiredAt: now - 20 * D },
      ];
    }
    const prog: Record<string, number> = { first_blood: 1, sharpshooter_10: 10, rescuer_5: isOwner ? 3 : 5, streak_7: isOwner ? 6 : 7, centurion: isOwner ? 157 >= 100 ? 64 : 0 : 40, commander: 25, ai_handler: isOwner ? 7 : 2, sector_sweep: isOwner ? 5 : 1, night_owl: isOwner ? 1 : 0, legendary: 0, crate_hunter: 6, zero_inbox: 12 };
    for (const a of ACHIEVEMENTS) {
      const p = Math.min(a.target, prog[a.id] ?? 0);
      st.achievements.set(a.id, { progress: p, unlockedAt: p >= a.target ? now - ((a.id.length * 3) % 30) * D : null });
    }
    st.stats.achievements = [...st.achievements.values()].filter((x) => x.unlockedAt).length;
    st.stats.missionsCompleted = isOwner ? 64 : st.stats.missionsCompleted;
    return st;
  }

  function player(memberId: string): PlayerState {
    let p = players.get(memberId);
    if (!p) {
      const ms = deps.members(); const i = Math.max(0, ms.findIndex((m) => m.id === memberId));
      p = init(ms[i] ?? ms[0]!, i); players.set(memberId, p);
    }
    const day = deps.dayKey();
    if (!p.challenges.length || p.challenges[0]!.day !== day) {
      const mine = deps.tasks().filter((t) => t.assigneeIds.includes(memberId));
      const doneToday = mine.filter((t) => t.completedAt && t.completedAt >= deps.today0()).length;
      p.challenges = [
        { id: rid('chl'), memberId, day, title: 'Clear 3 missions', description: 'Complete any three missions today.', target: 3, progress: Math.min(3, doneToday), xp: 60, completedAt: doneToday >= 3 ? Date.now() : null },
        { id: rid('chl'), memberId, day, title: 'Rescue a critical mission', description: 'Finish one overdue mission.', target: 1, progress: 0, xp: 40, completedAt: null },
        { id: rid('chl'), memberId, day, title: 'Beat the clock', description: 'Finish 2 missions before their deadline.', target: 2, progress: Math.min(2, doneToday), xp: 50, completedAt: null },
      ];
    }
    return p;
  }

  function profile(memberId: string): PlayerProfile {
    const p = player(memberId);
    const { level, into, need } = levelFromXp(p.xp);
    return {
      memberId, xp: p.xp, level, levelXp: need, levelProgressXp: into, rank: rankFor(level), nextRank: nextRankFor(level), coins: p.coins,
      streak: { ...p.streak }, stats: { ...p.stats }, equipped: { ...p.equipped }, unopenedCrates: p.crates.filter((c) => !c.openedAt).length,
    };
  }

  function progress(ts: TaskView[]): MissionProgress {
    const total = ts.length; const done = ts.filter((t) => t.status === 'done').length;
    return { total, done, pending: total - done, overdue: ts.filter((t) => t.isOverdue).length, pct: total ? Math.round(done / total * 100) : 0 };
  }

  function hud(me: Member): Hud {
    const t0 = deps.today0();
    const all = deps.tasks().filter((t) => t.status !== 'cancelled');
    const mine = all.filter((t) => t.assigneeIds.includes(me.id));
    const todayScope = (t: TaskView) => (t.isDueToday || t.isOverdue || (t.completedAt !== null && t.completedAt >= t0 && t.dueAt !== null && t.dueAt < t0 + D)) && !t.waitingOn;
    const weekScope = (t: TaskView) => t.dueAt !== null && t.dueAt < t0 + 7 * D && (t.status !== 'done' || (t.completedAt ?? 0) >= t0 - 6 * D);
    const ops = deps.projects().filter((p) => p.memberIds.includes(me.id) && p.status === 'active').map((p) => ({
      projectId: p.id, name: p.name, emoji: p.emoji, color: p.color, progress: progress(all.filter((t) => t.projectId === p.id)),
    }));
    player(me.id);
    return {
      profile: profile(me.id), today: progress(mine.filter(todayScope)), week: progress(mine.filter(weekScope)), operations: ops,
      squadToday: progress(all.filter(todayScope)), challenges: player(me.id).challenges, boost: me.role === 'owner' ? { multiplier: 1.5, until: Date.now() + 42 * 60_000 } : null,
    };
  }

  function grant(memberId: string, kind: RewardKind, xp: number, coins: number, label: string, taskId: string | null, extra: Partial<RewardEvent> = {}): RewardEvent {
    const p = player(memberId);
    const before = levelFromXp(p.xp).level;
    p.xp = Math.max(0, p.xp + xp); p.coins += coins; p.periodXp.week += xp; p.periodXp.month += xp;
    const r: RewardEvent = { id: rid('rwd'), orgId: deps.orgId, memberId, kind, xp, coins, label, taskId, at: Date.now(), ...extra };
    p.rewards.unshift(r);
    deps.publish({ type: 'game.reward', reward: r }, [memberId]);
    const name = deps.members().find((m) => m.id === memberId)?.name.split(' ')[0] ?? 'Someone';
    if (['level_up', 'squad_bonus', 'achievement'].includes(kind) || (kind === 'crate_earned' && extra.rarity === 'legendary')) {
      const item = { id: rid('feed'), memberId, kind, xp, at: r.at, text: kind === 'level_up' ? `${name} reached level ${extra.level} — ${extra.rank?.name}` : `${name} · ${label}` };
      feed.unshift(item);
      deps.publish({ type: 'game.feed', item });
    }
    const after = levelFromXp(p.xp).level;
    if (after > before) {
      const rank = rankFor(after);
      setTimeout(() => {
        grant(memberId, 'level_up', 0, 50, `Level ${after} reached`, null, { level: after, rank });
        const crate: Crate = { id: rid('crate'), memberId, rarity: rank.minLevel === after ? 'epic' : 'rare', source: `Level ${after} reached`, earnedAt: Date.now(), openedAt: null, reward: null };
        p.crates.unshift(crate);
        grant(memberId, 'crate_earned', 0, 0, `${crate.rarity[0]!.toUpperCase() + crate.rarity.slice(1)} crate earned`, null, { crateId: crate.id, rarity: crate.rarity });
      }, 30);
    }
    return r;
  }

  return {
    hud, profile,
    leaderboard(period: Leaderboard['period']): Leaderboard {
      const ms = deps.members().filter((m) => m.active);
      const entries = ms.map((m) => {
        const p = player(m.id); const pr = profile(m.id);
        const xp = period === 'week' ? p.periodXp.week : period === 'month' ? p.periodXp.month : p.xp;
        return { member: m, position: 0, xp, missions: Math.round(xp / 55), onTimeRate: 0.7 + ((m.name.length * 7) % 28) / 100, rank: pr.rank, level: pr.level, streak: p.streak.current } as LeaderboardEntry;
      });
      const rankList = (xs: LeaderboardEntry[]) => xs.sort((a, b) => b.xp - a.xp).map((e, i) => ({ ...e, position: i + 1 }));
      return { period, humans: rankList(entries.filter((e) => e.member.kind === 'human')), agents: rankList(entries.filter((e) => e.member.kind === 'agent')) };
    },
    achievements(memberId: string): AchievementProgress[] {
      const p = player(memberId);
      return ACHIEVEMENTS.map((a) => ({ achievement: a, progress: p.achievements.get(a.id)?.progress ?? 0, unlockedAt: p.achievements.get(a.id)?.unlockedAt ?? null }));
    },
    challenges: (memberId: string) => player(memberId).challenges,
    crates: (memberId: string) => player(memberId).crates,
    openCrate(memberId: string, id: string): Crate {
      const p = player(memberId); const c = p.crates.find((x) => x.id === id);
      if (!c) throw new Error('not found');
      if (c.openedAt) return c;
      const roll = Math.random();
      let reward: CrateReward;
      if (roll < 0.35) reward = { kind: 'coins', id: 'coins', name: 'Coins', rarity: c.rarity, amount: { common: 50, rare: 120, epic: 300, legendary: 800 }[c.rarity] };
      else if (roll < 0.5) reward = { kind: 'xp_boost', id: 'boost', name: 'XP Boost ×1.5', rarity: c.rarity, amount: 60 };
      else { const pool = COSMETICS[c.rarity]; const pick = pool[Math.floor(Math.random() * pool.length)]!; reward = { kind: pick.kind, id: pick.id, name: pick.name, rarity: c.rarity }; }
      c.openedAt = Date.now(); c.reward = reward; p.stats.cratesOpened++;
      if (reward.kind === 'coins') p.coins += reward.amount ?? 0;
      if (reward.kind === 'title' || reward.kind === 'frame' || reward.kind === 'emote') {
        if (!p.inventory.some((i) => i.id === reward.id)) p.inventory.unshift({ kind: reward.kind, id: reward.id, name: reward.name, rarity: reward.rarity, acquiredAt: Date.now() });
      }
      return c;
    },
    inventory: (memberId: string) => player(memberId).inventory,
    equip(memberId: string, patch: { title?: string | null; frame?: string | null; emote?: string | null }): PlayerProfile {
      const p = player(memberId);
      for (const k of ['title', 'frame', 'emote'] as const) if (patch[k] !== undefined) p.equipped[k] = patch[k] ?? null;
      return profile(memberId);
    },
    feed: (limit: number) => feed.slice(0, limit),
    rewards: (memberId: string, limit: number) => player(memberId).rewards.slice(0, limit),

    seedFeed(): void {
      const ms = deps.members();
      const by = (n: string) => ms.find((m) => m.name.startsWith(n))?.id ?? ms[0]!.id;
      const now = Date.now();
      const items: [string, RewardKind, number, string, number][] = [
        ['Cursor', 'mission_complete', 55, 'Cursor completed “Fix mobile nav overlap”', 55],
        ['Raj', 'mission_complete', 70, 'Raj completed “Set up WhatsApp intake”', 120],
        ['Claude', 'mission_complete', 60, 'Claude completed “Draft Acme welcome email”', 180],
        ['Priya', 'challenge', 60, 'Priya cleared the daily challenge “Clear 3 missions”', 300],
        ['Meera', 'level_up', 0, 'Meera reached level 9 — Sergeant', 420],
        ['Kabir', 'achievement', 100, 'Kabir unlocked “Sharpshooter”', 900],
        ['Priya', 'squad_bonus', 120, 'Priya cleared Operation “Office move” — squad bonus', 1500],
      ];
      for (const [n, kind, xp, text, ago] of items) feed.push({ id: rid('feed'), memberId: by(n), kind, xp, text, at: now - ago * 60_000 });
    },

    /** Reward hooks called by the mock task routes. */
    onComplete(memberId: string, t: TaskView, wasOverdue: boolean): void {
      const pri = t.priority === 'urgent' ? 20 : t.priority === 'high' ? 10 : 0;
      grant(memberId, 'mission_complete', 40, 5, `Mission complete: ${t.title}`, t.id);
      if (wasOverdue) grant(memberId, 'rescue_bonus', 10, 2, 'Rescue bonus', t.id);
      else if (t.dueAt) grant(memberId, 'on_time_bonus', 20, 3, 'On-time bonus', t.id);
      if (pri) grant(memberId, 'priority_bonus', pri, 0, `${t.priority === 'urgent' ? 'Urgent' : 'High'}-priority bonus`, t.id);
      const p = player(memberId);
      p.stats.missionsCompleted++;
      for (const c of p.challenges) {
        if (c.completedAt) continue;
        const hit = c.title.startsWith('Clear') || (c.title.startsWith('Rescue') && wasOverdue) || (c.title.startsWith('Beat') && !wasOverdue && t.dueAt);
        if (!hit) continue;
        c.progress = Math.min(c.target, c.progress + 1);
        if (c.progress >= c.target) { c.completedAt = Date.now(); setTimeout(() => grant(memberId, 'challenge', c.xp, 10, `Challenge complete: ${c.title}`, null), 20); }
      }
      if (p.stats.missionsCompleted % 4 === 0) {
        const crate: Crate = { id: rid('crate'), memberId, rarity: 'rare', source: `${p.stats.missionsCompleted} missions completed`, earnedAt: Date.now(), openedAt: null, reward: null };
        p.crates.unshift(crate);
        setTimeout(() => grant(memberId, 'crate_earned', 0, 0, 'Rare crate earned', null, { crateId: crate.id, rarity: 'rare' }), 40);
      }
    },
    onReopen(memberId: string, t: TaskView): void { grant(memberId, 'revoked', -60, -5, `Mission reopened: ${t.title}`, t.id); player(memberId).stats.missionsCompleted--; },
    onCreate(memberId: string, t: TaskView): void { grant(memberId, 'intel', 5, 0, `Mission deployed: ${t.title}`, t.id); player(memberId).stats.created++; },
    onSubtask(memberId: string, t: TaskView): void { grant(memberId, 'subtask', 10, 1, 'Objective complete', t.id); },
    /** A random squadmate earns something (feeds the squad feed + leaderboard). */
    squadTick(): void {
      const ms = deps.members().filter((m) => m.active && m.role !== 'owner');
      const m = ms[Math.floor(Math.random() * ms.length)]; if (!m) return;
      const t = deps.tasks().find((x) => x.assigneeIds.includes(m.id) && x.status !== 'done');
      grant(m.id, 'mission_complete', 40 + Math.round(Math.random() * 30), 5, `Mission complete: ${t?.title ?? 'Field report'}`, t?.id ?? null);
    },
  };
}
