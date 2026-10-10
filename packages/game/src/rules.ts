// Tactical Ops — every tunable number lives here. Player-facing explanation: ../RULES.md.

import type { Achievement, CrateReward, Priority, Rank, RankId, Rarity } from '@companybrain/types';

// ─── XP ──────────────────────────────────────────────────────────────────────

export const BASE_XP: Record<Priority, number> = { none: 10, low: 15, medium: 25, high: 40, urgent: 60 };
/** On-time bonus as a fraction of base. */
export const ON_TIME_BONUS_PCT = 0.5;
export const RESCUE_BONUS_XP = 10;
export const SUBTASK_XP = 3;
/** Max objectives that pay XP per mission (all earners combined). */
export const SUBTASK_MAX_PER_TASK = 10;
/** Max objectives that pay XP per member per day. */
export const SUBTASK_MAX_PER_DAY = 30;
export const INTEL_XP = 2;
export const INTEL_MAX_PER_DAY = 10;
/** Self-created + self-completed faster than this → farm penalty. */
export const QUICK_SELF_COMPLETE_MS = 2 * 60 * 1000;
export const QUICK_SELF_COMPLETE_PCT = 0.2;
/** Mission XP (completion, bonuses, objectives) per member per day. */
export const DAILY_MISSION_XP_CAP = 1000;
/** Reopening within this window revokes the completion's XP. */
export const REVOKE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const STREAK_XP_PER_DAY = 5;
export const STREAK_XP_MAX = 50;
export const SQUAD_BONUS_XP = 100;
export const SQUAD_BONUS_MIN_TASKS = 3;
export const XP_PER_COIN = 10;
export const BOOST_MULTIPLIER = 1.5;
export const CRATE_EVERY_MISSIONS = 5;
export const EPIC_CRATE_EVERY_STREAK_DAYS = 7;

/** Reward kinds that count toward the daily mission-XP cap (and get the boost). */
export const MISSION_KINDS = ['mission_complete', 'on_time_bonus', 'rescue_bonus', 'subtask'] as const;

// ─── Levels & ranks ──────────────────────────────────────────────────────────

export const MAX_LEVEL = 100;

/** Cumulative XP needed to reach level n (level 1 = 0). */
export function xpForLevel(n: number): number {
  const k = Math.max(0, Math.min(MAX_LEVEL, Math.floor(n)) - 1);
  return Math.round(50 * Math.pow(k, 1.6) + 50 * k);
}

export function levelForXp(xp: number): number {
  let lvl = 1;
  while (lvl < MAX_LEVEL && xpForLevel(lvl + 1) <= xp) lvl++;
  return lvl;
}

export const RANKS: Rank[] = [
  { id: 'recruit', name: 'Recruit', minLevel: 1, insignia: { kind: 'chevron', count: 0, color: '#9ca3af' } },
  { id: 'private', name: 'Private', minLevel: 3, insignia: { kind: 'chevron', count: 1, color: '#a8a29e' } },
  { id: 'corporal', name: 'Corporal', minLevel: 6, insignia: { kind: 'chevron', count: 2, color: '#84cc16' } },
  { id: 'sergeant', name: 'Sergeant', minLevel: 10, insignia: { kind: 'chevron', count: 3, color: '#22c55e' } },
  { id: 'staff_sergeant', name: 'Staff Sergeant', minLevel: 15, insignia: { kind: 'chevron', count: 4, color: '#14b8a6' } },
  { id: 'lieutenant', name: 'Lieutenant', minLevel: 21, insignia: { kind: 'bar', count: 1, color: '#3b82f6' } },
  { id: 'captain', name: 'Captain', minLevel: 28, insignia: { kind: 'bar', count: 2, color: '#6366f1' } },
  { id: 'major', name: 'Major', minLevel: 36, insignia: { kind: 'star', count: 1, color: '#a855f7' } },
  { id: 'colonel', name: 'Colonel', minLevel: 45, insignia: { kind: 'star', count: 2, color: '#ec4899' } },
  { id: 'general', name: 'General', minLevel: 60, insignia: { kind: 'star', count: 3, color: '#f59e0b' } },
  { id: 'legend', name: 'Legend', minLevel: 80, insignia: { kind: 'crown', count: 1, color: '#facc15' } },
];

export function rankIndexForLevel(level: number): number {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (level >= RANKS[i]!.minLevel) idx = i;
  return idx;
}
export function rankForLevel(level: number): Rank {
  return RANKS[rankIndexForLevel(level)]!;
}
export function rankById(id: RankId): Rank {
  return RANKS.find((r) => r.id === id) ?? RANKS[0]!;
}
/** Reaching a new rank at or above this index awards a legendary crate. */
export const LEGENDARY_RANK_INDEX = RANKS.findIndex((r) => r.id === 'lieutenant');

// ─── Achievements ────────────────────────────────────────────────────────────

/** Stats an achievement is measured against (see engine `statsFor`). */
export type Metric =
  | 'missions' | 'on_time' | 'ontime_run_best' | 'rescued' | 'comeback' | 'early_bird' | 'night_owl'
  | 'ghost' | 'weekend' | 'clutch' | 'clean_sweep' | 'squad_missions' | 'ops_commanded' | 'squad_bonuses'
  | 'created' | 'ai_whisperer' | 'urgent' | 'objectives' | 'streak_best' | 'level' | 'challenges'
  | 'daily_triple' | 'crates_opened';

export interface AchievementDef extends Achievement { metric: Metric }

const A = (
  id: string, name: string, description: string, icon: string, tier: Achievement['tier'],
  metric: Metric, target: number, secret = false,
): AchievementDef => ({ id, name, description, icon, tier, secret, target, metric });

export const ACHIEVEMENTS: AchievementDef[] = [
  A('first_blood', 'First Blood', 'Complete your first mission.', '🎯', 'bronze', 'missions', 1),
  A('veteran_25', 'Veteran', 'Complete 25 missions.', '🎖️', 'silver', 'missions', 25),
  A('centurion', 'Centurion', 'Complete 100 missions.', '💯', 'gold', 'missions', 100),
  A('warlord_500', 'Warlord', 'Complete 500 missions.', '⚔️', 'legendary', 'missions', 500),
  A('sharpshooter_10', 'Sharpshooter', 'Complete 10 missions with a deadline on time, in a row.', '🎯', 'silver', 'ontime_run_best', 10),
  A('precision_50', 'Precision Strike', 'Complete 50 missions on time.', '⏱️', 'gold', 'on_time', 50),
  A('rescue_specialist', 'Rescue Specialist', 'Clear 10 overdue missions.', '🚑', 'silver', 'rescued', 10),
  A('comeback_kid', 'Comeback Kid', 'Clear a mission that was overdue by a week or more.', '🔥', 'silver', 'comeback', 1, true),
  A('early_bird', 'Early Bird', 'Complete a mission before 8 am.', '🌅', 'bronze', 'early_bird', 1),
  A('night_owl', 'Night Owl', 'Complete a mission after 10 pm.', '🦉', 'bronze', 'night_owl', 1),
  A('ghost_protocol', 'Ghost Protocol', 'Complete a mission between 3 am and 5 am.', '👻', 'gold', 'ghost', 1, true),
  A('weekend_warrior', 'Weekend Warrior', 'Complete a mission on a Saturday or Sunday.', '🏕️', 'bronze', 'weekend', 1, true),
  A('clutch_play', 'Clutch Play', 'Complete a mission in the final 10 minutes before its deadline.', '⚡', 'bronze', 'clutch', 1, true),
  A('clean_sweep', 'Clean Sweep', "Clear every one of today's missions (at least 3).", '🧹', 'silver', 'clean_sweep', 1),
  A('squad_player', 'Squad Player', 'Complete 10 missions shared with other operatives.', '🤝', 'silver', 'squad_missions', 10),
  A('operation_commander', 'Operation Commander', 'Lead an operation all the way to 100%.', '🗺️', 'gold', 'ops_commanded', 1),
  A('squad_goals', 'Squad Goals', 'Earn 5 squad bonuses.', '🛡️', 'gold', 'squad_bonuses', 5),
  A('intel_officer', 'Intel Officer', 'Create 50 missions.', '📡', 'silver', 'created', 50),
  A('ai_whisperer', 'AI Whisperer', 'Assign 10 missions to AI operatives that they complete.', '🤖', 'silver', 'ai_whisperer', 10),
  A('high_value_target', 'High-Value Target', 'Complete 10 urgent missions.', '🚨', 'silver', 'urgent', 10),
  A('objective_master', 'Objective Master', 'Check off 50 objectives.', '✅', 'silver', 'objectives', 50),
  A('streak_3', 'On a Roll', 'Reach a 3-day streak.', '🔥', 'bronze', 'streak_best', 3),
  A('streak_7', 'Unstoppable', 'Reach a 7-day streak.', '🔥', 'silver', 'streak_best', 7),
  A('streak_30', 'Iron Will', 'Reach a 30-day streak.', '🏔️', 'gold', 'streak_best', 30),
  A('level_10', 'Field Ready', 'Reach level 10.', '⭐', 'bronze', 'level', 10),
  A('level_25', 'Seasoned', 'Reach level 25.', '🌟', 'silver', 'level', 25),
  A('level_50', 'Elite', 'Reach level 50.', '💫', 'gold', 'level', 50),
  A('legend', 'Legend', 'Reach the rank of Legend.', '👑', 'legendary', 'level', 80),
  A('challenge_hunter', 'Challenge Hunter', 'Complete 10 daily challenges.', '🏹', 'silver', 'challenges', 10),
  A('daily_triple', 'Hat Trick', 'Complete all 3 daily challenges in one day.', '🎩', 'gold', 'daily_triple', 1),
  A('crate_collector', 'Crate Collector', 'Open 10 crates.', '📦', 'bronze', 'crates_opened', 10),
];

export const ACHIEVEMENT_XP: Record<Achievement['tier'], number> = { bronze: 25, silver: 75, gold: 150, legendary: 500 };
/** Crate awarded per achievement tier (null = none). */
export const ACHIEVEMENT_CRATE: Record<Achievement['tier'], Rarity | null> = {
  bronze: null, silver: 'common', gold: 'rare', legendary: 'legendary',
};

// ─── Loot ────────────────────────────────────────────────────────────────────

export interface Cosmetic { kind: 'title' | 'frame' | 'emote'; id: string; name: string; rarity: Rarity }

export const COSMETICS: Cosmetic[] = [
  { kind: 'title', id: 'rookie-operator', name: 'Rookie Operator', rarity: 'common' },
  { kind: 'title', id: 'inbox-sniper', name: 'Inbox Sniper', rarity: 'common' },
  { kind: 'title', id: 'night-raider', name: 'Night Raider', rarity: 'rare' },
  { kind: 'title', id: 'field-medic', name: 'Field Medic', rarity: 'rare' },
  { kind: 'title', id: 'deadline-slayer', name: 'Deadline Slayer', rarity: 'epic' },
  { kind: 'title', id: 'shadow-ops', name: 'Shadow Ops', rarity: 'epic' },
  { kind: 'title', id: 'ghost-protocol', name: 'Ghost Protocol', rarity: 'legendary' },
  { kind: 'frame', id: 'olive-drab', name: 'Olive Drab', rarity: 'common' },
  { kind: 'frame', id: 'desert-storm', name: 'Desert Storm', rarity: 'common' },
  { kind: 'frame', id: 'arctic', name: 'Arctic', rarity: 'rare' },
  { kind: 'frame', id: 'urban-grey', name: 'Urban Grey', rarity: 'rare' },
  { kind: 'frame', id: 'neon-grid', name: 'Neon Grid', rarity: 'epic' },
  { kind: 'frame', id: 'gold-camo', name: 'Gold Camo', rarity: 'legendary' },
  { kind: 'emote', id: 'salute', name: 'Salute', rarity: 'common' },
  { kind: 'emote', id: 'thumbs-up', name: 'Thumbs Up', rarity: 'common' },
  { kind: 'emote', id: 'mic-drop', name: 'Mic Drop', rarity: 'rare' },
  { kind: 'emote', id: 'victory-dance', name: 'Victory Dance', rarity: 'epic' },
  { kind: 'emote', id: 'airstrike', name: 'Airstrike', rarity: 'legendary' },
];

/** Coins given instead of a cosmetic the player already owns. */
export const DUPLICATE_COINS: Record<Rarity, number> = { common: 25, rare: 75, epic: 200, legendary: 500 };

export type LootEntry =
  | { weight: number; kind: 'coins'; min: number; max: number }
  | { weight: number; kind: 'xp_boost'; minutes: number }
  | { weight: number; kind: 'cosmetic'; rarity: Rarity };

export const LOOT_TABLES: Record<Rarity, LootEntry[]> = {
  common: [
    { weight: 55, kind: 'coins', min: 20, max: 50 },
    { weight: 15, kind: 'xp_boost', minutes: 30 },
    { weight: 30, kind: 'cosmetic', rarity: 'common' },
  ],
  rare: [
    { weight: 35, kind: 'coins', min: 60, max: 120 },
    { weight: 15, kind: 'xp_boost', minutes: 30 },
    { weight: 35, kind: 'cosmetic', rarity: 'rare' },
    { weight: 15, kind: 'cosmetic', rarity: 'common' },
  ],
  epic: [
    { weight: 25, kind: 'coins', min: 150, max: 300 },
    { weight: 15, kind: 'xp_boost', minutes: 60 },
    { weight: 40, kind: 'cosmetic', rarity: 'epic' },
    { weight: 20, kind: 'cosmetic', rarity: 'rare' },
  ],
  legendary: [
    { weight: 15, kind: 'coins', min: 400, max: 800 },
    { weight: 15, kind: 'xp_boost', minutes: 60 },
    { weight: 50, kind: 'cosmetic', rarity: 'legendary' },
    { weight: 20, kind: 'cosmetic', rarity: 'epic' },
  ],
};

/** Roll a crate reward. `rand()` returns [0,1). `owned` = cosmetic ids the player has. */
export function rollLoot(rarity: Rarity, rand: () => number, owned: Set<string>): CrateReward {
  const table = LOOT_TABLES[rarity];
  const total = table.reduce((s, e) => s + e.weight, 0);
  let r = rand() * total;
  let entry = table[table.length - 1]!;
  for (const e of table) {
    if (r < e.weight) { entry = e; break; }
    r -= e.weight;
  }
  if (entry.kind === 'coins') {
    const amount = entry.min + Math.floor(rand() * (entry.max - entry.min + 1));
    return { kind: 'coins', id: 'coins', name: `${amount} coins`, rarity, amount };
  }
  if (entry.kind === 'xp_boost') {
    return { kind: 'xp_boost', id: `boost-${entry.minutes}`, name: `${entry.minutes}-min XP Boost ×${BOOST_MULTIPLIER}`, rarity, amount: entry.minutes };
  }
  const pool = COSMETICS.filter((c) => c.rarity === entry.rarity);
  const pick = pool[Math.floor(rand() * pool.length)] ?? pool[0]!;
  if (owned.has(pick.id)) {
    const amount = DUPLICATE_COINS[pick.rarity];
    return { kind: 'coins', id: 'coins', name: `${amount} coins (duplicate ${pick.name})`, rarity, amount };
  }
  return { kind: pick.kind, id: pick.id, name: pick.name, rarity: pick.rarity };
}

// ─── Daily challenges ────────────────────────────────────────────────────────

export type ChallengeMetric =
  | 'complete' | 'complete_high' | 'complete_overdue' | 'complete_on_time' | 'complete_all_objectives'
  | 'complete_shared' | 'complete_before_noon' | 'create' | 'objective';

/** What the member's open missions must offer for a challenge to be achievable. */
export interface OpenStats { open: number; highOpen: number; overdueOpen: number; dueFutureOpen: number; withObjectives: number; openObjectives: number; sharedOpen: number }

export interface ChallengeDef {
  id: string;
  title: string;
  description: string;
  target: number;
  xp: number;
  metric: ChallengeMetric;
  achievable: (s: OpenStats) => boolean;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'clear_1', title: 'Boots on the ground', description: 'Clear any mission.', target: 1, xp: 15, metric: 'complete', achievable: (s) => s.open >= 1 },
  { id: 'clear_3', title: 'Clear 3 missions', description: 'Complete three missions today.', target: 3, xp: 30, metric: 'complete', achievable: (s) => s.open >= 3 },
  { id: 'clear_5', title: 'Clear 5 missions', description: 'Complete five missions today.', target: 5, xp: 50, metric: 'complete', achievable: (s) => s.open >= 5 },
  { id: 'high_value', title: 'High-value target', description: 'Complete a high-priority or urgent mission.', target: 1, xp: 25, metric: 'complete_high', achievable: (s) => s.highOpen >= 1 },
  { id: 'rescue', title: 'Rescue op', description: 'Clear a critical (overdue) mission.', target: 1, xp: 30, metric: 'complete_overdue', achievable: (s) => s.overdueOpen >= 1 },
  { id: 'on_time_2', title: 'Right on schedule', description: 'Complete 2 missions on time.', target: 2, xp: 30, metric: 'complete_on_time', achievable: (s) => s.dueFutureOpen >= 2 },
  { id: 'all_objectives', title: 'Full debrief', description: 'Finish every objective of a mission.', target: 1, xp: 25, metric: 'complete_all_objectives', achievable: (s) => s.withObjectives >= 1 },
  { id: 'objectives_5', title: 'Checklist commando', description: 'Check off 5 objectives.', target: 5, xp: 20, metric: 'objective', achievable: (s) => s.openObjectives >= 5 },
  { id: 'squad_assist', title: 'Squad assist', description: 'Complete a mission shared with a squadmate.', target: 1, xp: 25, metric: 'complete_shared', achievable: (s) => s.sharedOpen >= 1 },
  { id: 'before_noon', title: 'Morning strike', description: 'Clear a mission before noon.', target: 1, xp: 20, metric: 'complete_before_noon', achievable: (s) => s.open >= 1 },
  { id: 'deploy_3', title: 'Deploy 3 new missions', description: 'Create three new missions.', target: 3, xp: 15, metric: 'create', achievable: () => true },
];
export const CHALLENGES_PER_DAY = 3;
