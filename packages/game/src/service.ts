// GameService: read models (HUD, profile, leaderboard, …) + the two player mutations
// (open a crate, equip a cosmetic). Org-scoped everywhere; guests only see themselves.

import type {
  AchievementProgress, Actor, CoreServices, Crate, CrateReward, DailyChallenge, FeedItem, GameService, Hud,
  InventoryItem, Leaderboard, LeaderboardEntry, MissionProgress, PlayerProfile, Rarity, RewardEvent, RewardKind, TaskView,
} from '@companybrain/types';
import { AppError } from '@companybrain/types';
import { ACHIEVEMENTS, COSMETICS, RANKS, levelForXp, rankIndexForLevel, xpForLevel, MAX_LEVEL } from './rules';
import { addDays, dayKey, firstOfMonth, mondayOf, onlyWeekendsBetween, startOfDay } from './time';
import { openStatsOf, rewardFromRow, type ChallengeRow, type Engine, type RewardRow } from './engine';
import { systemActor, toInfo, type MemberInfo } from './util';

const clampLimit = (n: number | undefined, def: number, max: number) =>
  Math.max(1, Math.min(max, Number.isFinite(n) ? Math.floor(n as number) : def));

export function progressOf(tasks: TaskView[], from: number, to: number, now: number): MissionProgress {
  const rel = tasks.filter((t) => t.status !== 'cancelled' && (
    t.status === 'done'
      ? t.completedAt != null && t.completedAt >= from && t.completedAt < to
      : t.dueAt != null && t.dueAt < to
  ));
  const done = rel.filter((t) => t.status === 'done').length;
  const overdue = rel.filter((t) => t.status !== 'done' && t.dueAt != null && t.dueAt < now).length;
  const total = rel.length;
  return { total, done, pending: total - done, overdue, pct: total ? Math.round((done / total) * 100) : 0 };
}

export class Service implements GameService {
  constructor(private readonly engine: Engine, private readonly services: CoreServices) {}

  private get db() {
    return this.engine.db;
  }

  // ─── Access helpers ──────────────────────────────────────────────────────

  private async member(orgId: string, id: string): Promise<MemberInfo> {
    try {
      const m = await this.services.members.get(systemActor(orgId), id);
      if (!m || m.orgId !== orgId) throw new Error('wrong org');
      return toInfo(m);
    } catch {
      throw new AppError('not_found', 'Operative not found');
    }
  }

  /** Resolve whose data the actor may view (any squad member; guests only themselves). */
  private async viewable(actor: Actor, memberId?: string): Promise<MemberInfo> {
    const target = memberId && memberId !== 'me' ? memberId : actor.memberId;
    if (target !== actor.memberId && actor.role === 'guest') throw new AppError('forbidden', 'Guests can only view their own profile');
    return this.member(actor.orgId, target);
  }

  private requireWrite(actor: Actor): void {
    if (actor.via === 'api_key' && !(actor.scopes ?? []).includes('write')) throw new AppError('forbidden', 'API key lacks write scope');
  }

  // ─── Profile ─────────────────────────────────────────────────────────────

  private buildProfile(orgId: string, m: MemberInfo, now: number): PlayerProfile {
    const e = this.engine;
    const p = e.readPlayer(orgId, m.id);
    const level = levelForXp(p.xp);
    const floor = xpForLevel(level);
    const levelXp = level >= MAX_LEVEL ? 0 : xpForLevel(level + 1) - floor;
    const rIdx = rankIndexForLevel(level);
    const xpCoins = (e.q('SELECT COALESCE(SUM(coins), 0) AS s FROM game_rewards WHERE org_id = ? AND member_id = ?').get(orgId, m.id) as { s: number }).s;
    const crateCoins = (e.q('SELECT COALESCE(SUM(reward_coins), 0) AS s FROM game_crates WHERE org_id = ? AND member_id = ?').get(orgId, m.id) as { s: number }).s;
    const today = dayKey(now, m.tz);
    const last = p.streak_last_day;
    const alive = !!last && (last === today || (last < today && onlyWeekendsBetween(last, today)));
    const loadout = e.q('SELECT title, frame, emote FROM game_loadout WHERE org_id = ? AND member_id = ?').get(orgId, m.id) as
      { title: string | null; frame: string | null; emote: string | null } | undefined;
    const count = (sql: string) => (e.q(sql).get(orgId, m.id) as { n: number }).n;
    return {
      memberId: m.id,
      xp: p.xp,
      level,
      levelXp,
      levelProgressXp: level >= MAX_LEVEL ? 0 : p.xp - floor,
      rank: RANKS[rIdx]!,
      nextRank: RANKS[rIdx + 1] ?? null,
      coins: xpCoins + crateCoins,
      streak: { current: alive ? p.streak_current : 0, best: p.streak_best, lastActiveDay: last },
      stats: {
        missionsCompleted: e.stat(orgId, m.id, 'missions'),
        onTime: e.stat(orgId, m.id, 'on_time'),
        rescued: e.stat(orgId, m.id, 'rescued'),
        created: e.stat(orgId, m.id, 'created'),
        cratesOpened: e.stat(orgId, m.id, 'crates_opened'),
        achievements: count('SELECT COUNT(*) AS n FROM game_achievements WHERE org_id = ? AND member_id = ?'),
      },
      equipped: { title: loadout?.title ?? null, frame: loadout?.frame ?? null, emote: loadout?.emote ?? null },
      unopenedCrates: count('SELECT COUNT(*) AS n FROM game_crates WHERE org_id = ? AND member_id = ? AND opened_at IS NULL'),
    };
  }

  async profile(actor: Actor, memberId?: string): Promise<PlayerProfile> {
    const m = await this.viewable(actor, memberId);
    return this.buildProfile(actor.orgId, m, this.engine.clock());
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────

  async hud(actor: Actor): Promise<Hud> {
    const m = await this.member(actor.orgId, actor.memberId);
    const now = this.engine.clock();
    const [mineRaw, squadRaw, projects] = await Promise.all([
      this.services.tasks.list(actor, { assigneeId: m.id, includeDone: true, limit: 1000 }),
      this.services.tasks.list(actor, { includeDone: true, limit: 1000 }).catch(() => [] as TaskView[]),
      this.services.projects.list(actor).catch(() => []),
    ]);
    const mine = mineRaw.filter((t) => t.orgId === actor.orgId && t.assigneeIds.includes(m.id));
    const squad = squadRaw.filter((t) => t.orgId === actor.orgId);
    const today = dayKey(now, m.tz);
    const dayFrom = startOfDay(today, m.tz);
    const dayTo = startOfDay(addDays(today, 1), m.tz);
    const monday = mondayOf(today);
    const weekFrom = startOfDay(monday, m.tz);
    const weekTo = startOfDay(addDays(monday, 7), m.tz);

    const operations = projects
      .filter((p) => p.orgId === actor.orgId && p.status !== 'archived' && (p.memberIds.includes(m.id) || p.leadId === m.id))
      .map((p) => {
        const tasks = squad.filter((t) => t.projectId === p.id && t.status !== 'cancelled');
        const done = tasks.filter((t) => t.status === 'done').length;
        const overdue = tasks.filter((t) => t.status !== 'done' && t.dueAt != null && t.dueAt < now).length;
        const total = tasks.length;
        return {
          projectId: p.id, name: p.name, emoji: p.emoji, color: p.color,
          progress: { total, done, pending: total - done, overdue, pct: total ? Math.round((done / total) * 100) : 0 },
        };
      });

    const challenges = this.ensureToday(actor.orgId, m, now, mine);
    return {
      profile: this.buildProfile(actor.orgId, m, now),
      today: progressOf(mine, dayFrom, dayTo, now),
      week: progressOf(mine, weekFrom, weekTo, now),
      operations,
      squadToday: progressOf(squad, dayFrom, dayTo, now),
      challenges,
      boost: this.engine.activeBoost(actor.orgId, m.id, now),
    };
  }

  // ─── Challenges ──────────────────────────────────────────────────────────

  private toChallenge(r: ChallengeRow): DailyChallenge {
    return {
      id: r.id, memberId: r.member_id, day: r.day, title: r.title, description: r.description,
      target: r.target, progress: r.progress, xp: r.xp, completedAt: r.completed_at,
    };
  }

  private ensureToday(orgId: string, m: MemberInfo, now: number, tasks: TaskView[]): DailyChallenge[] {
    const day = dayKey(now, m.tz);
    const rows = this.db.transaction(() => this.engine.ensureChallenges(orgId, m.id, day, openStatsOf(tasks, m.id, now)))();
    return rows.map((r) => this.toChallenge(r));
  }

  async challenges(actor: Actor): Promise<DailyChallenge[]> {
    const m = await this.member(actor.orgId, actor.memberId);
    const now = this.engine.clock();
    const day = dayKey(now, m.tz);
    const existing = this.engine.ensureChallenges(actor.orgId, m.id, day, null);
    if (existing.length) return existing.map((r) => this.toChallenge(r));
    const tasks = await this.services.tasks.list(actor, { assigneeId: m.id, limit: 1000 }).catch(() => [] as TaskView[]);
    return this.ensureToday(actor.orgId, m, now, tasks.filter((t) => t.orgId === actor.orgId));
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────

  async leaderboard(actor: Actor, period: Leaderboard['period']): Promise<Leaderboard> {
    if (period !== 'week' && period !== 'month' && period !== 'all') throw new AppError('bad_request', 'period must be week, month or all');
    const me = await this.member(actor.orgId, actor.memberId);
    const now = this.engine.clock();
    const today = dayKey(now, me.tz);
    const from = period === 'all' ? 0 : startOfDay(period === 'week' ? mondayOf(today) : firstOfMonth(today), me.tz);
    let members = (await this.services.members.list(systemActor(actor.orgId))).filter((m) => m.orgId === actor.orgId && m.active);
    if (actor.role === 'guest') members = members.filter((m) => m.id === actor.memberId);

    const xpRows = this.engine.q('SELECT member_id, COALESCE(SUM(xp), 0) AS xp FROM game_rewards WHERE org_id = ? AND at >= ? GROUP BY member_id')
      .all(actor.orgId, from) as { member_id: string; xp: number }[];
    const mRows = this.engine.q(`SELECT member_id, COUNT(*) AS missions, SUM(on_time) AS on_time, SUM(had_due) AS had_due
      FROM game_completions WHERE org_id = ? AND at >= ? AND revoked_at IS NULL AND farm = 0 GROUP BY member_id`)
      .all(actor.orgId, from) as { member_id: string; missions: number; on_time: number; had_due: number }[];
    const xpBy = new Map(xpRows.map((r) => [r.member_id, r.xp]));
    const mBy = new Map(mRows.map((r) => [r.member_id, r]));

    const entries = members.map((member) => {
      const p = this.buildProfile(actor.orgId, toInfo(member), now);
      const s = mBy.get(member.id);
      const entry: LeaderboardEntry = {
        member, position: 0, xp: xpBy.get(member.id) ?? 0, missions: s?.missions ?? 0,
        onTimeRate: s && s.had_due > 0 ? s.on_time / s.had_due : 0,
        rank: p.rank, level: p.level, streak: p.streak.current,
      };
      return entry;
    });
    const sortRank = (list: LeaderboardEntry[]) => {
      list.sort((a, b) => b.xp - a.xp || b.missions - a.missions || b.onTimeRate - a.onTimeRate || a.member.name.localeCompare(b.member.name));
      list.forEach((e, i) => { e.position = i + 1; });
      return list;
    };
    return {
      period,
      humans: sortRank(entries.filter((e) => e.member.kind === 'human')),
      agents: sortRank(entries.filter((e) => e.member.kind === 'agent')),
    };
  }

  // ─── Achievements ────────────────────────────────────────────────────────

  async achievements(actor: Actor, memberId?: string): Promise<AchievementProgress[]> {
    const m = await this.viewable(actor, memberId);
    const unlocked = new Map((this.engine.q('SELECT achievement_id, unlocked_at FROM game_achievements WHERE org_id = ? AND member_id = ?')
      .all(actor.orgId, m.id) as { achievement_id: string; unlocked_at: number }[]).map((r) => [r.achievement_id, r.unlocked_at]));
    const cache = new Map<string, number>();
    return ACHIEVEMENTS.map(({ metric, ...a }) => {
      const at = unlocked.get(a.id) ?? null;
      if (!cache.has(metric)) cache.set(metric, this.engine.stat(actor.orgId, m.id, metric));
      const progress = Math.min(a.target, cache.get(metric) ?? 0);
      if (a.secret && at == null) {
        return {
          achievement: { ...a, name: 'Classified', description: 'Secret medal — keep playing to reveal it.', icon: '🔒' },
          progress: 0, unlockedAt: null,
        };
      }
      return { achievement: a, progress: at != null ? a.target : progress, unlockedAt: at };
    });
  }

  // ─── Crates & inventory ──────────────────────────────────────────────────

  private crateRow(r: { id: string; member_id: string; rarity: string; source: string; earned_at: number; opened_at: number | null; reward_json: string | null }): Crate {
    let reward: CrateReward | null = null;
    if (r.reward_json) {
      try { reward = JSON.parse(r.reward_json) as CrateReward; } catch { reward = null; }
    }
    return { id: r.id, memberId: r.member_id, rarity: r.rarity as Rarity, source: r.source, earnedAt: r.earned_at, openedAt: r.opened_at, reward };
  }

  async crates(actor: Actor): Promise<Crate[]> {
    const rows = this.engine.q('SELECT * FROM game_crates WHERE org_id = ? AND member_id = ? ORDER BY opened_at IS NOT NULL, earned_at DESC LIMIT 500')
      .all(actor.orgId, actor.memberId) as Parameters<Service['crateRow']>[0][];
    return rows.map((r) => this.crateRow(r));
  }

  async openCrate(actor: Actor, crateId: string): Promise<Crate> {
    this.requireWrite(actor);
    const m = await this.member(actor.orgId, actor.memberId);
    const now = this.engine.clock();
    const get = () => this.engine.q('SELECT * FROM game_crates WHERE id = ? AND org_id = ? AND member_id = ?')
      .get(crateId, actor.orgId, actor.memberId) as Parameters<Service['crateRow']>[0] | undefined;
    if (!get()) throw new AppError('not_found', 'Crate not found');
    try {
      this.db.transaction(() => {
        const opened = this.engine.openCrate(actor.orgId, actor.memberId, crateId, now);
        if (opened) this.engine.settle(actor.orgId, m, now); // Crate Collector etc.
      })();
    } catch (err) {
      this.engine.discard();
      throw err;
    }
    this.engine.flush();
    return this.crateRow(get()!);
  }

  async inventory(actor: Actor): Promise<InventoryItem[]> {
    const rows = this.engine.q('SELECT kind, item_id, name, rarity, acquired_at FROM game_inventory WHERE org_id = ? AND member_id = ? ORDER BY acquired_at DESC')
      .all(actor.orgId, actor.memberId) as { kind: InventoryItem['kind']; item_id: string; name: string; rarity: Rarity; acquired_at: number }[];
    return rows.map((r) => ({ kind: r.kind, id: r.item_id, name: r.name, rarity: r.rarity, acquiredAt: r.acquired_at }));
  }

  async equip(actor: Actor, patch: { title?: string | null; frame?: string | null; emote?: string | null }): Promise<PlayerProfile> {
    this.requireWrite(actor);
    const m = await this.member(actor.orgId, actor.memberId);
    const owned = new Set((await this.inventory(actor)).map((i) => `${i.kind}:${i.id}`));
    const cur = this.engine.q('SELECT title, frame, emote FROM game_loadout WHERE org_id = ? AND member_id = ?').get(actor.orgId, m.id) as
      { title: string | null; frame: string | null; emote: string | null } | undefined;
    const next = { title: cur?.title ?? null, frame: cur?.frame ?? null, emote: cur?.emote ?? null };
    for (const kind of ['title', 'frame', 'emote'] as const) {
      if (!(kind in patch)) continue;
      const v = patch[kind];
      if (v === undefined) continue;
      if (v !== null) {
        if (typeof v !== 'string' || !COSMETICS.some((c) => c.kind === kind && c.id === v)) throw new AppError('bad_request', `Unknown ${kind}: ${String(v)}`);
        if (!owned.has(`${kind}:${v}`)) throw new AppError('forbidden', `You don't own that ${kind} yet`);
      }
      next[kind] = v;
    }
    this.engine.q(`INSERT INTO game_loadout (org_id, member_id, title, frame, emote) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (org_id, member_id) DO UPDATE SET title = excluded.title, frame = excluded.frame, emote = excluded.emote`)
      .run(actor.orgId, m.id, next.title, next.frame, next.emote);
    return this.buildProfile(actor.orgId, m, this.engine.clock());
  }

  // ─── Feed & rewards ──────────────────────────────────────────────────────

  async feed(actor: Actor, limit?: number): Promise<FeedItem[]> {
    const n = clampLimit(limit, 30, 200);
    const rows = (actor.role === 'guest'
      ? this.engine.q('SELECT * FROM game_feed WHERE org_id = ? AND member_id = ? ORDER BY at DESC, rowid DESC LIMIT ?').all(actor.orgId, actor.memberId, n)
      : this.engine.q('SELECT * FROM game_feed WHERE org_id = ? ORDER BY at DESC, rowid DESC LIMIT ?').all(actor.orgId, n)) as
      { id: string; member_id: string; text: string; kind: RewardKind; xp: number; at: number }[];
    return rows.map((r) => ({ id: r.id, memberId: r.member_id, text: r.text, kind: r.kind, xp: r.xp, at: r.at }));
  }

  async rewards(actor: Actor, limit?: number): Promise<RewardEvent[]> {
    const n = clampLimit(limit, 50, 500);
    const rows = this.engine.q('SELECT * FROM game_rewards WHERE org_id = ? AND member_id = ? ORDER BY at DESC, rowid DESC LIMIT ?')
      .all(actor.orgId, actor.memberId, n) as RewardRow[];
    return rows.map(rewardFromRow);
  }
}
