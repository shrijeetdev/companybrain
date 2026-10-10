// companybrain v2 — gamification contract ("Tactical Ops").
// Tasks are Missions, projects are Operations, the team is the Squad. Completing work earns XP,
// ranks, streaks, loot crates, achievements and daily challenges. Everything is computed and
// stored server-side (anti-farming rules in @companybrain/game); the client only renders.

import type { Actor, Member } from './index';

export type RankId =
  | 'recruit' | 'private' | 'corporal' | 'sergeant' | 'staff_sergeant' | 'lieutenant'
  | 'captain' | 'major' | 'colonel' | 'general' | 'legend';

export interface Rank {
  id: RankId;
  name: string;      // "Sergeant"
  minLevel: number;
  /** Insignia hint for the UI: number of chevrons/stars and tier color. */
  insignia: { kind: 'chevron' | 'bar' | 'star' | 'crown'; count: number; color: string };
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type RewardKind =
  | 'mission_complete'   // base XP for completing a task
  | 'on_time_bonus'      // completed before the deadline
  | 'rescue_bonus'       // cleared an overdue mission
  | 'priority_bonus'
  | 'subtask'            // objective (subtask) completed
  | 'intel'              // created a mission (small, capped per day)
  | 'streak_bonus'
  | 'challenge'          // daily challenge completed
  | 'achievement'
  | 'level_up'
  | 'crate_earned'
  | 'squad_bonus'        // whole operation/project completed
  | 'revoked';           // XP removed (mission reopened)

/** One XP/coin movement. Streamed to the client as a live event for celebration animations. */
export interface RewardEvent {
  id: string;
  orgId: string;
  memberId: string;
  kind: RewardKind;
  xp: number;            // may be negative for 'revoked'
  coins: number;
  label: string;         // "+40 XP · Mission complete: Send Acme proposal"
  taskId: string | null;
  /** Present on level_up. */
  level?: number;
  rank?: Rank;
  /** Present on crate_earned. */
  crateId?: string;
  rarity?: Rarity;
  /** Present on achievement. */
  achievementId?: string;
  at: number;
}

export interface PlayerProfile {
  memberId: string;
  xp: number;
  level: number;
  /** XP needed from the start of this level to the next. */
  levelXp: number;
  /** XP earned within the current level. */
  levelProgressXp: number;
  rank: Rank;
  nextRank: Rank | null;
  coins: number;
  streak: { current: number; best: number; lastActiveDay: string | null; /** member-tz date "2026-10-10" */ };
  stats: {
    missionsCompleted: number;
    onTime: number;
    rescued: number;
    created: number;
    cratesOpened: number;
    achievements: number;
  };
  equipped: { title: string | null; frame: string | null; emote: string | null };
  unopenedCrates: number;
}

export interface Achievement {
  id: string;            // "first_blood", "sharpshooter_10", …
  name: string;
  description: string;
  icon: string;          // emoji or lucide icon name
  tier: 'bronze' | 'silver' | 'gold' | 'legendary';
  secret: boolean;
  target: number;
}

export interface AchievementProgress {
  achievement: Achievement;
  progress: number;
  unlockedAt: number | null;
}

export interface CrateReward {
  kind: 'coins' | 'xp_boost' | 'title' | 'frame' | 'emote';
  id: string;            // cosmetic id, or "coins"
  name: string;          // "Night Raider" (title), "Gold Camo" (frame)…
  rarity: Rarity;
  amount?: number;       // coins / boost minutes
}

export interface Crate {
  id: string;
  memberId: string;
  rarity: Rarity;
  source: string;        // "Level 5 reached", "5 missions completed", "7-day streak"…
  earnedAt: number;
  openedAt: number | null;
  reward: CrateReward | null;
}

export interface DailyChallenge {
  id: string;
  memberId: string;
  day: string;           // member-tz date
  title: string;         // "Clear 3 missions"
  description: string;
  target: number;
  progress: number;
  xp: number;
  completedAt: number | null;
}

export interface InventoryItem {
  kind: 'title' | 'frame' | 'emote';
  id: string;
  name: string;
  rarity: Rarity;
  acquiredAt: number;
}

/** Mission progress for the HUD (percent done vs pending). */
export interface MissionProgress {
  total: number;
  done: number;
  pending: number;
  overdue: number;
  /** 0..100 */
  pct: number;
}

export interface Hud {
  profile: PlayerProfile;
  today: MissionProgress;
  week: MissionProgress;
  /** Per operation (project) the member is part of. */
  operations: { projectId: string; name: string; emoji: string; color: string; progress: MissionProgress }[];
  /** Whole squad today. */
  squadToday: MissionProgress;
  challenges: DailyChallenge[];
  /** Active XP boost, if any. */
  boost: { multiplier: number; until: number } | null;
}

export interface LeaderboardEntry {
  member: Member;
  position: number;
  xp: number;            // XP earned in the period
  missions: number;
  onTimeRate: number;    // 0..1
  rank: Rank;
  level: number;
  streak: number;
}

export interface Leaderboard {
  period: 'week' | 'month' | 'all';
  humans: LeaderboardEntry[];
  agents: LeaderboardEntry[];
}

/** Squad activity feed item ("Priya cleared Operation Acme — +120 XP"). */
export interface FeedItem {
  id: string;
  memberId: string;
  text: string;
  kind: RewardKind;
  xp: number;
  at: number;
}

export interface GameService {
  hud(actor: Actor): Promise<Hud>;
  profile(actor: Actor, memberId?: string): Promise<PlayerProfile>;
  leaderboard(actor: Actor, period: Leaderboard['period']): Promise<Leaderboard>;
  achievements(actor: Actor, memberId?: string): Promise<AchievementProgress[]>;
  challenges(actor: Actor): Promise<DailyChallenge[]>;
  crates(actor: Actor): Promise<Crate[]>;
  openCrate(actor: Actor, crateId: string): Promise<Crate>;
  inventory(actor: Actor): Promise<InventoryItem[]>;
  equip(actor: Actor, patch: { title?: string | null; frame?: string | null; emote?: string | null }): Promise<PlayerProfile>;
  feed(actor: Actor, limit?: number): Promise<FeedItem[]>;
  rewards(actor: Actor, limit?: number): Promise<RewardEvent[]>;
}
