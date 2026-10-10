// The Tactical Ops engine: turns audit events into ledger rows (XP, crates, achievements, …).
// All writes for one audit event happen in a single synchronous SQLite transaction, after the
// async lookups (members, task lists, project) are gathered. Events are processed one at a time.

import type Database from 'better-sqlite3';
import type {
  AuditEvent, CoreServices, CrateReward, Rarity, RewardEvent, RewardKind, TaskView,
} from '@companybrain/types';
import { SYSTEM_MEMBER_ID } from '@companybrain/types';
import {
  ACHIEVEMENTS, ACHIEVEMENT_CRATE, ACHIEVEMENT_XP, BASE_XP, BOOST_MULTIPLIER, CHALLENGES, CHALLENGES_PER_DAY,
  COSMETICS, CRATE_EVERY_MISSIONS, DAILY_MISSION_XP_CAP, EPIC_CRATE_EVERY_STREAK_DAYS, INTEL_MAX_PER_DAY, INTEL_XP,
  LEGENDARY_RANK_INDEX, ON_TIME_BONUS_PCT, QUICK_SELF_COMPLETE_MS, QUICK_SELF_COMPLETE_PCT, RANKS, RESCUE_BONUS_XP,
  REVOKE_WINDOW_MS, SQUAD_BONUS_MIN_TASKS, SQUAD_BONUS_XP, STREAK_XP_MAX, STREAK_XP_PER_DAY, SUBTASK_MAX_PER_DAY,
  SUBTASK_MAX_PER_TASK, SUBTASK_XP, XP_PER_COIN, levelForXp, rankForLevel, rankIndexForLevel, rollLoot,
  type ChallengeMetric, type Metric, type OpenStats,
} from './rules';
import { addDays, dayKey, isWeekend, localHour, onlyWeekendsBetween, startOfDay } from './time';
import { fmtXp, fnv1a, newId, seededRandom, systemActor, taskSnap, toInfo, type MemberInfo, type TaskSnap } from './util';

export interface Logger {
  info(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

export interface PlayerRow {
  org_id: string;
  member_id: string;
  xp: number;
  level: number;
  rank_id: string;
  max_level: number;
  max_rank: number;
  missions_hw: number;
  streak_current: number;
  streak_best: number;
  streak_last_day: string | null;
  updated_at: number;
}

export interface RewardRow {
  id: string; org_id: string; member_id: string; kind: string; xp: number; coins: number; label: string;
  task_id: string | null; completion_id: string | null; cap_day: string | null; level: number | null;
  rank_id: string | null; crate_id: string | null; rarity: string | null; achievement_id: string | null; at: number;
}

export interface ChallengeRow {
  id: string; org_id: string; member_id: string; day: string; slot: number; pool_id: string; title: string;
  description: string; metric: string; target: number; progress: number; xp: number; completed_at: number | null;
}

interface AwardOpts {
  at: number;
  taskId?: string | null;
  completionId?: string | null;
  capDay?: string | null;
  level?: number;
  rankId?: string;
  crateId?: string;
  rarity?: Rarity;
  achievementId?: string;
}

/** Data fetched from core services before the write transaction. */
interface Gathered {
  members: Map<string, MemberInfo>;
  openStats: Map<string, OpenStats>;
  cleanSweep: Map<string, boolean>;
  project: { id: string; name: string; leadId: string | null; completers: string[] } | null;
}

export interface EngineDeps {
  db: Database.Database;
  services: CoreServices;
  clock: () => number;
  random: () => number;
  log: Logger;
}

export function rewardFromRow(r: RewardRow): RewardEvent {
  const ev: RewardEvent = {
    id: r.id, orgId: r.org_id, memberId: r.member_id, kind: r.kind as RewardKind, xp: r.xp, coins: r.coins,
    label: r.label, taskId: r.task_id, at: r.at,
  };
  if (r.level != null) ev.level = r.level;
  if (r.rank_id) ev.rank = RANKS.find((k) => k.id === r.rank_id);
  if (r.crate_id) ev.crateId = r.crate_id;
  if (r.rarity) ev.rarity = r.rarity as Rarity;
  if (r.achievement_id) ev.achievementId = r.achievement_id;
  return ev;
}

const OPEN = (t: { status: string }) => t.status !== 'done' && t.status !== 'cancelled';

export function openStatsOf(tasks: TaskView[], memberId: string, now: number): OpenStats {
  const mine = tasks.filter((t) => OPEN(t) && t.assigneeIds.includes(memberId));
  return {
    open: mine.length,
    highOpen: mine.filter((t) => t.priority === 'high' || t.priority === 'urgent').length,
    overdueOpen: mine.filter((t) => t.dueAt != null && t.dueAt < now).length,
    dueFutureOpen: mine.filter((t) => t.dueAt != null && t.dueAt >= now).length,
    withObjectives: mine.filter((t) => t.subtasks.length > 0).length,
    openObjectives: mine.reduce((s, t) => s + t.subtasks.filter((x) => !x.done).length, 0),
    sharedOpen: mine.filter((t) => t.assigneeIds.length >= 2).length,
  };
}

/** Deterministic pick for member+day: seeded shuffle, achievable first, distinct metrics preferred. */
export function pickChallenges(orgId: string, memberId: string, day: string, stats: OpenStats) {
  const rand = seededRandom(fnv1a(`${orgId}|${memberId}|${day}`));
  const pool = [...CHALLENGES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const ordered = [...pool.filter((c) => c.achievable(stats)), ...pool.filter((c) => !c.achievable(stats))];
  const picked: typeof pool = [];
  for (const c of ordered) {
    if (picked.length >= CHALLENGES_PER_DAY) break;
    if (!picked.some((p) => p.metric === c.metric)) picked.push(c);
  }
  for (const c of ordered) {
    if (picked.length >= CHALLENGES_PER_DAY) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}

export class Engine {
  readonly db: Database.Database;
  private readonly services: CoreServices;
  readonly clock: () => number;
  private readonly random: () => number;
  readonly log: Logger;
  private readonly stmts = new Map<string, Database.Statement>();
  private queue: Promise<void> = Promise.resolve();
  /** Rewards created inside the current transaction; published after commit. */
  private pending: RewardEvent[] = [];
  private names = new Map<string, string>();

  constructor(deps: EngineDeps) {
    this.db = deps.db;
    this.services = deps.services;
    this.clock = deps.clock;
    this.random = deps.random;
    this.log = deps.log;
  }

  q(sql: string): Database.Statement {
    let s = this.stmts.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmts.set(sql, s);
    }
    return s;
  }

  // ─── Entry point ───────────────────────────────────────────────────────────

  /** Serialized, idempotent, never throws. */
  onAudit(e: AuditEvent): Promise<void> {
    const run = this.queue.then(() => this.process(e)).catch((err) => {
      this.log.error('[game] failed to process audit event', e?.id, err);
    });
    this.queue = run;
    return run;
  }

  private async process(e: AuditEvent): Promise<void> {
    if (!e || e.entity !== 'task' || !e.orgId || !e.id) return;
    if (this.q('SELECT 1 FROM game_processed WHERE org_id = ? AND audit_id = ?').get(e.orgId, e.id)) return;

    const before = taskSnap(e.before, e.entityId);
    const after = taskSnap(e.after, e.entityId);
    const task = after ?? before;
    if (!task) {
      this.markProcessed(e);
      return;
    }
    const prev = before?.status ?? null;
    const next = after?.status ?? null;
    const completed = next === 'done' && prev !== 'done';
    const reopened = prev === 'done' && next !== 'done';
    const created = !before && !!after;
    const newlyDoneSubs = this.newlyDoneSubtasks(before, after);

    if (!completed && !reopened && !created && newlyDoneSubs.length === 0) {
      this.markProcessed(e);
      return;
    }

    const at = typeof e.at === 'number' ? e.at : this.clock();
    const completer = completed ? (after?.completedBy ?? e.actorId) : null;
    const earners = completed && after ? this.earnersOf(after, completer) : [];
    const involved = new Set<string>(earners);
    if (created && after) involved.add(after.creatorId ?? e.actorId);
    for (const s of newlyDoneSubs) involved.add(s.doneBy ?? e.actorId);
    if (completed && after?.creatorId) involved.add(after.creatorId);
    involved.delete(SYSTEM_MEMBER_ID);

    const g = await this.gather(e.orgId, at, involved, completed ? after : null, earners);

    const tx = this.db.transaction(() => {
      // Atomic idempotency guard (also covers concurrent duplicates).
      const ins = this.q('INSERT OR IGNORE INTO game_processed (org_id, audit_id, at) VALUES (?, ?, ?)').run(e.orgId, e.id, at);
      if (ins.changes === 0) return;
      const touched = new Set<string>();
      if (created && after) this.applyCreate(e.orgId, after, after.creatorId ?? e.actorId, at, g, touched);
      if (newlyDoneSubs.length && after) this.applySubtasks(e.orgId, after, newlyDoneSubs, e.actorId, at, g, touched);
      if (reopened) this.applyRevoke(e.orgId, task, at, touched);
      if (completed && after) this.applyCompletion(e.orgId, after, completer, earners, at, g, touched);
      for (const id of touched) {
        const m = g.members.get(id);
        if (m) this.settle(e.orgId, m, at);
      }
    });
    try {
      tx();
    } catch (err) {
      this.discard();
      throw err;
    }
    this.flush();
  }

  private markProcessed(e: AuditEvent): void {
    this.q('INSERT OR IGNORE INTO game_processed (org_id, audit_id, at) VALUES (?, ?, ?)').run(e.orgId, e.id, e.at ?? this.clock());
  }

  /** Publish rewards created by the last committed transaction. */
  flush(): void {
    const out = this.pending;
    this.pending = [];
    for (const r of out) {
      try {
        this.services.live.publish(r.orgId, { type: 'game.reward', reward: r }, { memberIds: [r.memberId] });
      } catch (err) {
        this.log.warn('[game] live publish failed', err);
      }
    }
  }

  /** Discard rewards from a rolled-back transaction. */
  discard(): void {
    this.pending = [];
  }

  private earnersOf(t: TaskSnap, completer: string | null): string[] {
    const set = new Set(t.assigneeIds);
    if (completer) set.add(completer);
    set.delete(SYSTEM_MEMBER_ID);
    return [...set];
  }

  private newlyDoneSubtasks(before: TaskSnap | null, after: TaskSnap | null): TaskSnap['subtasks'] {
    if (!after || !before) return [];
    const wasDone = new Set(before.subtasks.filter((s) => s.done).map((s) => s.id));
    return after.subtasks.filter((s) => s.done && !wasDone.has(s.id));
  }

  // ─── Async gathering ───────────────────────────────────────────────────────

  async members(orgId: string): Promise<Map<string, MemberInfo>> {
    const map = new Map<string, MemberInfo>();
    try {
      const list = await this.services.members.list(systemActor(orgId), { includeInactive: true });
      for (const m of list) if (m.orgId === orgId) map.set(m.id, toInfo(m));
    } catch (err) {
      this.log.warn('[game] members.list failed', err);
    }
    for (const m of map.values()) this.names.set(`${orgId}:${m.id}`, m.name);
    return map;
  }

  private async gather(orgId: string, at: number, involved: Set<string>, completedTask: TaskSnap | null, earners: string[]): Promise<Gathered> {
    const members = await this.members(orgId);
    const sys = systemActor(orgId);
    const openStats = new Map<string, OpenStats>();
    const cleanSweep = new Map<string, boolean>();
    for (const id of involved) {
      const m = members.get(id);
      if (!m) continue;
      const day = dayKey(at, m.tz);
      const needChallenges = !this.q('SELECT 1 FROM game_challenges WHERE org_id = ? AND member_id = ? AND day = ? LIMIT 1').get(orgId, id, day);
      const needSweep = !!completedTask && earners.includes(id);
      if (!needChallenges && !needSweep) continue;
      try {
        const tasks = await this.services.tasks.list(sys, { assigneeId: id, includeDone: true, limit: 2000 });
        if (needChallenges) openStats.set(id, openStatsOf(tasks, id, at));
        if (needSweep) {
          const from = startOfDay(day, m.tz);
          const to = startOfDay(addDays(day, 1), m.tz);
          const today = tasks.filter((t) => t.assigneeIds.includes(id) && t.status !== 'cancelled' && t.dueAt != null && t.dueAt >= from && t.dueAt < to);
          cleanSweep.set(id, today.length >= 3 && today.every((t) => t.status === 'done'));
        }
      } catch (err) {
        this.log.warn('[game] tasks.list failed', err);
      }
    }
    let project: Gathered['project'] = null;
    const pid = completedTask?.projectId;
    if (pid && !this.q('SELECT 1 FROM game_squad_bonus WHERE org_id = ? AND project_id = ?').get(orgId, pid)) {
      try {
        const tasks = (await this.services.tasks.list(sys, { projectId: pid, includeDone: true, limit: 5000 }))
          .filter((t) => t.projectId === pid && t.status !== 'cancelled');
        if (tasks.length >= SQUAD_BONUS_MIN_TASKS && tasks.every((t) => t.status === 'done')) {
          const p = await this.services.projects.get(sys, pid);
          const completers = tasks.map((t) => t.completedBy).filter((x): x is string => !!x);
          project = { id: pid, name: p.name, leadId: p.leadId, completers };
        }
      } catch (err) {
        this.log.warn('[game] project lookup failed', err);
      }
    }
    return { members, openStats, cleanSweep, project };
  }

  // ─── Ledger primitives (call inside a transaction) ─────────────────────────

  player(orgId: string, memberId: string): PlayerRow {
    this.q('INSERT OR IGNORE INTO game_players (org_id, member_id, updated_at) VALUES (?, ?, ?)').run(orgId, memberId, this.clock());
    return this.q('SELECT * FROM game_players WHERE org_id = ? AND member_id = ?').get(orgId, memberId) as PlayerRow;
  }

  readPlayer(orgId: string, memberId: string): PlayerRow {
    const row = this.q('SELECT * FROM game_players WHERE org_id = ? AND member_id = ?').get(orgId, memberId) as PlayerRow | undefined;
    return row ?? {
      org_id: orgId, member_id: memberId, xp: 0, level: 1, rank_id: 'recruit', max_level: 1, max_rank: 0,
      missions_hw: 0, streak_current: 0, streak_best: 0, streak_last_day: null, updated_at: 0,
    };
  }

  award(orgId: string, memberId: string, kind: RewardKind, xp: number, label: string, o: AwardOpts): RewardEvent {
    const p = this.player(orgId, memberId);
    const newXp = p.xp + xp;
    const coins = Math.floor(newXp / XP_PER_COIN) - Math.floor(p.xp / XP_PER_COIN);
    this.q('UPDATE game_players SET xp = ?, updated_at = ? WHERE org_id = ? AND member_id = ?').run(newXp, o.at, orgId, memberId);
    const row: RewardRow = {
      id: newId('rwd'), org_id: orgId, member_id: memberId, kind, xp, coins, label, task_id: o.taskId ?? null,
      completion_id: o.completionId ?? null, cap_day: o.capDay ?? null, level: o.level ?? null, rank_id: o.rankId ?? null,
      crate_id: o.crateId ?? null, rarity: o.rarity ?? null, achievement_id: o.achievementId ?? null, at: o.at,
    };
    this.q(`INSERT INTO game_rewards (id, org_id, member_id, kind, xp, coins, label, task_id, completion_id, cap_day, level,
      rank_id, crate_id, rarity, achievement_id, at) VALUES (@id, @org_id, @member_id, @kind, @xp, @coins, @label, @task_id,
      @completion_id, @cap_day, @level, @rank_id, @crate_id, @rarity, @achievement_id, @at)`).run(row);
    const ev = rewardFromRow(row);
    this.pending.push(ev);
    return ev;
  }

  feed(orgId: string, memberId: string, kind: RewardKind, xp: number, text: string, at: number): void {
    this.q('INSERT INTO game_feed (id, org_id, member_id, text, kind, xp, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(newId('feed'), orgId, memberId, text, kind, xp, at);
  }

  private name(orgId: string, memberId: string): string {
    return this.names.get(`${orgId}:${memberId}`) ?? 'An operative';
  }

  counter(orgId: string, memberId: string, key: string): number {
    const r = this.q('SELECT value FROM game_counters WHERE org_id = ? AND member_id = ? AND key = ?').get(orgId, memberId, key) as { value: number } | undefined;
    return r?.value ?? 0;
  }

  private setCounter(orgId: string, memberId: string, key: string, value: number): void {
    this.q(`INSERT INTO game_counters (org_id, member_id, key, value) VALUES (?, ?, ?, ?)
      ON CONFLICT (org_id, member_id, key) DO UPDATE SET value = excluded.value`).run(orgId, memberId, key, value);
  }

  private bump(orgId: string, memberId: string, key: string, by = 1): number {
    const v = this.counter(orgId, memberId, key) + by;
    this.setCounter(orgId, memberId, key, v);
    return v;
  }

  grantCrate(orgId: string, memberId: string, rarity: Rarity, source: string, at: number): string {
    const id = newId('crt');
    this.q('INSERT INTO game_crates (id, org_id, member_id, rarity, source, earned_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, orgId, memberId, rarity, source, at);
    const label = `${rarity[0]!.toUpperCase()}${rarity.slice(1)} crate earned · ${source}`;
    this.award(orgId, memberId, 'crate_earned', 0, label, { at, crateId: id, rarity });
    if (rarity === 'legendary') this.feed(orgId, memberId, 'crate_earned', 0, `${this.name(orgId, memberId)} earned a Legendary crate — ${source}`, at);
    return id;
  }

  activeBoost(orgId: string, memberId: string, at: number): { multiplier: number; until: number } | null {
    const r = this.q('SELECT MAX(multiplier) AS m, MAX(until) AS u FROM game_boosts WHERE org_id = ? AND member_id = ? AND starts_at <= ? AND until > ?')
      .get(orgId, memberId, at, at) as { m: number | null; u: number | null };
    return r.m ? { multiplier: r.m, until: r.u ?? at } : null;
  }

  private capUsed(orgId: string, memberId: string, day: string): number {
    const r = this.q('SELECT COALESCE(SUM(xp), 0) AS s FROM game_rewards WHERE org_id = ? AND member_id = ? AND cap_day = ? AND xp > 0')
      .get(orgId, memberId, day) as { s: number };
    return r.s;
  }

  /** Award capped, boosted mission XP rows. */
  private awardMission(orgId: string, m: MemberInfo, rows: { kind: RewardKind; xp: number; what: string }[], o: AwardOpts & { day: string }): void {
    const boost = this.activeBoost(orgId, m.id, o.at);
    let remaining = Math.max(0, DAILY_MISSION_XP_CAP - this.capUsed(orgId, m.id, o.day));
    for (const r of rows) {
      const boosted = boost ? Math.round(r.xp * boost.multiplier) : r.xp;
      const xp = Math.min(boosted, remaining);
      remaining -= xp;
      let label = `${fmtXp(xp)} · ${r.what}`;
      if (boost && xp > 0) label += ` (×${boost.multiplier} boost)`;
      if (xp < boosted) label += ' (daily cap reached)';
      this.award(orgId, m.id, r.kind, xp, label, { ...o, capDay: o.day });
    }
  }

  // ─── Daily challenges ──────────────────────────────────────────────────────

  ensureChallenges(orgId: string, memberId: string, day: string, stats: OpenStats | null): ChallengeRow[] {
    const existing = this.q('SELECT * FROM game_challenges WHERE org_id = ? AND member_id = ? AND day = ? ORDER BY slot').all(orgId, memberId, day) as ChallengeRow[];
    if (existing.length || !stats) return existing;
    const picks = pickChallenges(orgId, memberId, day, stats);
    picks.forEach((c, slot) => {
      this.q(`INSERT OR IGNORE INTO game_challenges (id, org_id, member_id, day, slot, pool_id, title, description, metric, target, xp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(newId('chl'), orgId, memberId, day, slot, c.id, c.title, c.description, c.metric, c.target, c.xp);
    });
    return this.q('SELECT * FROM game_challenges WHERE org_id = ? AND member_id = ? AND day = ? ORDER BY slot').all(orgId, memberId, day) as ChallengeRow[];
  }

  private progressChallenges(orgId: string, m: MemberInfo, day: string, metrics: Partial<Record<ChallengeMetric, number>>, at: number, g: Gathered): void {
    const rows = this.ensureChallenges(orgId, m.id, day, g.openStats.get(m.id) ?? null);
    for (const c of rows) {
      const n = metrics[c.metric as ChallengeMetric];
      if (!n || c.completed_at != null) continue;
      const progress = Math.min(c.target, c.progress + n);
      const done = progress >= c.target;
      this.q('UPDATE game_challenges SET progress = ?, completed_at = ? WHERE id = ?').run(progress, done ? at : null, c.id);
      if (done) this.award(orgId, m.id, 'challenge', c.xp, `${fmtXp(c.xp)} · Challenge complete: ${c.title}`, { at });
    }
    const after = this.q('SELECT COUNT(*) AS n, SUM(completed_at IS NOT NULL) AS d FROM game_challenges WHERE org_id = ? AND member_id = ? AND day = ?')
      .get(orgId, m.id, day) as { n: number; d: number | null };
    if (after.n >= CHALLENGES_PER_DAY && (after.d ?? 0) >= after.n) this.setCounter(orgId, m.id, 'daily_triple', 1);
  }

  // ─── Event handlers (inside the transaction) ───────────────────────────────

  private applyCreate(orgId: string, t: TaskSnap, creatorId: string, at: number, g: Gathered, touched: Set<string>): void {
    const m = g.members.get(creatorId);
    if (!m) return;
    const day = dayKey(at, m.tz);
    const used = (this.q('SELECT COUNT(*) AS n FROM game_intel WHERE org_id = ? AND member_id = ? AND day = ? AND xp > 0').get(orgId, m.id, day) as { n: number }).n;
    const xp = used < INTEL_MAX_PER_DAY ? INTEL_XP : 0;
    const ins = this.q('INSERT OR IGNORE INTO game_intel (org_id, member_id, task_id, day, xp, at) VALUES (?, ?, ?, ?, ?, ?)').run(orgId, m.id, t.id, day, xp, at);
    if (ins.changes === 0) return;
    if (xp > 0) this.award(orgId, m.id, 'intel', xp, `${fmtXp(xp)} · Intel: ${t.title}`, { at, taskId: t.id });
    this.progressChallenges(orgId, m, day, { create: 1 }, at, g);
    touched.add(m.id);
  }

  private applySubtasks(orgId: string, t: TaskSnap, subs: TaskSnap['subtasks'], actorId: string, at: number, g: Gathered, touched: Set<string>): void {
    const allDone = t.subtasks.length > 0 && t.subtasks.every((s) => s.done);
    const perMember = new Map<string, number>();
    for (const s of subs) {
      const m = g.members.get(s.doneBy ?? actorId);
      if (!m) continue;
      const day = dayKey(at, m.tz);
      const taskPaid = (this.q('SELECT COUNT(*) AS n FROM game_subtasks WHERE org_id = ? AND task_id = ? AND xp > 0').get(orgId, t.id) as { n: number }).n;
      const dayPaid = (this.q('SELECT COUNT(*) AS n FROM game_subtasks WHERE org_id = ? AND member_id = ? AND day = ? AND xp > 0').get(orgId, m.id, day) as { n: number }).n;
      const xp = taskPaid < SUBTASK_MAX_PER_TASK && dayPaid < SUBTASK_MAX_PER_DAY ? SUBTASK_XP : 0;
      const ins = this.q('INSERT OR IGNORE INTO game_subtasks (org_id, task_id, subtask_id, member_id, day, xp, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(orgId, t.id, s.id, m.id, day, xp, at);
      if (ins.changes === 0) continue;
      if (xp > 0) this.awardMission(orgId, m, [{ kind: 'subtask', xp, what: `Objective: ${s.title || t.title}` }], { at, taskId: t.id, day });
      perMember.set(m.id, (perMember.get(m.id) ?? 0) + 1);
      touched.add(m.id);
    }
    for (const [id, n] of perMember) {
      const m = g.members.get(id)!;
      const metrics: Partial<Record<ChallengeMetric, number>> = { objective: n };
      if (allDone) metrics.complete_all_objectives = 1;
      this.progressChallenges(orgId, m, dayKey(at, m.tz), metrics, at, g);
    }
  }

  private applyRevoke(orgId: string, t: TaskSnap, at: number, touched: Set<string>): void {
    const rows = this.q('SELECT id, member_id, at FROM game_completions WHERE org_id = ? AND task_id = ? AND revoked_at IS NULL')
      .all(orgId, t.id) as { id: string; member_id: string; at: number }[];
    for (const c of rows) {
      if (at - c.at > REVOKE_WINDOW_MS || at < c.at) continue;
      const sum = (this.q('SELECT COALESCE(SUM(xp), 0) AS s FROM game_rewards WHERE org_id = ? AND completion_id = ? AND kind != ?')
        .get(orgId, c.id, 'revoked') as { s: number }).s;
      this.q('UPDATE game_completions SET revoked_at = ? WHERE id = ?').run(at, c.id);
      if (sum > 0) {
        this.award(orgId, c.member_id, 'revoked', -sum, `${fmtXp(-sum)} · Mission reopened: ${t.title}`, { at, taskId: t.id, completionId: c.id });
      }
      touched.add(c.member_id);
    }
  }

  private applyCompletion(orgId: string, t: TaskSnap, completer: string | null, earners: string[], at: number, g: Gathered, touched: Set<string>): void {
    const firstEver = !this.q('SELECT 1 FROM game_completions WHERE org_id = ? AND task_id = ? LIMIT 1').get(orgId, t.id);
    // Anti-farm: creator completes their own mission < 2 min after creating it.
    const farm = !!t.creatorId && t.createdAt != null && at - t.createdAt < QUICK_SELF_COMPLETE_MS
      && (completer ?? '') === t.creatorId;
    const base = BASE_XP[t.priority];
    const hadDue = t.dueAt != null;
    const onTime = hadDue && at <= t.dueAt!;
    const rescued = hadDue && at > t.dueAt!;
    let anyAwarded = false;

    for (const id of earners) {
      const m = g.members.get(id);
      if (!m) continue;
      const day = dayKey(at, m.tz);
      // Never more than once per task per member per day (even if the earlier one was revoked).
      if (this.q('SELECT 1 FROM game_completions WHERE org_id = ? AND member_id = ? AND task_id = ? AND day = ?').get(orgId, id, t.id, day)) continue;
      const cid = newId('cmp');
      this.q(`INSERT INTO game_completions (id, org_id, member_id, task_id, project_id, day, at, priority, had_due, on_time, rescued, farm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(cid, orgId, id, t.id, t.projectId, day, at, t.priority, hadDue ? 1 : 0,
        !farm && onTime ? 1 : 0, !farm && rescued ? 1 : 0, farm ? 1 : 0);
      touched.add(id);
      anyAwarded = true;

      if (farm) {
        const xp = Math.round(base * QUICK_SELF_COMPLETE_PCT);
        this.awardMission(orgId, m, [{ kind: 'mission_complete', xp, what: `Mission complete: ${t.title} (quick self-complete)` }], { at, taskId: t.id, completionId: cid, day });
        continue;
      }

      const rows: { kind: RewardKind; xp: number; what: string }[] = [{ kind: 'mission_complete', xp: base, what: `Mission complete: ${t.title}` }];
      if (onTime) rows.push({ kind: 'on_time_bonus', xp: Math.round(base * ON_TIME_BONUS_PCT), what: 'On-time bonus' });
      if (rescued) rows.push({ kind: 'rescue_bonus', xp: RESCUE_BONUS_XP, what: `Rescue bonus: ${t.title}` });
      this.awardMission(orgId, m, rows, { at, taskId: t.id, completionId: cid, day });

      this.updateStreak(orgId, m, day, at, t.id, cid);

      // Counters for achievements.
      const hour = localHour(at, m.tz);
      if (hadDue) {
        const run = onTime ? this.bump(orgId, id, 'ontime_run') : 0;
        if (!onTime) this.setCounter(orgId, id, 'ontime_run', 0);
        if (run > this.counter(orgId, id, 'ontime_run_best')) this.setCounter(orgId, id, 'ontime_run_best', run);
      }
      if (hour < 8) this.bump(orgId, id, 'early_bird');
      if (hour >= 22) this.bump(orgId, id, 'night_owl');
      if (hour >= 3 && hour < 5) this.bump(orgId, id, 'ghost');
      if (isWeekend(day)) this.bump(orgId, id, 'weekend');
      if (onTime && t.dueAt! - at <= 10 * 60 * 1000) this.bump(orgId, id, 'clutch');
      if (rescued && at - t.dueAt! >= 7 * 24 * 60 * 60 * 1000) this.bump(orgId, id, 'comeback');
      if (t.assigneeIds.length >= 2) this.bump(orgId, id, 'squad_missions');
      if (g.cleanSweep.get(id)) this.bump(orgId, id, 'clean_sweep');

      // Common crate every N missions (high-water mark so reopen/re-complete can't re-trigger).
      const missions = this.stat(orgId, id, 'missions');
      const p = this.player(orgId, id);
      const milestones = Math.floor(missions / CRATE_EVERY_MISSIONS);
      for (let k = p.missions_hw + 1; k <= milestones; k++) this.grantCrate(orgId, id, 'common', `${k * CRATE_EVERY_MISSIONS} missions completed`, at);
      if (milestones > p.missions_hw) this.q('UPDATE game_players SET missions_hw = ? WHERE org_id = ? AND member_id = ?').run(milestones, orgId, id);

      const allObjectives = t.subtasks.length > 0 && t.subtasks.every((s) => s.done);
      this.progressChallenges(orgId, m, day, {
        complete: 1,
        complete_high: t.priority === 'high' || t.priority === 'urgent' ? 1 : 0,
        complete_overdue: rescued ? 1 : 0,
        complete_on_time: onTime ? 1 : 0,
        complete_all_objectives: allObjectives ? 1 : 0,
        complete_shared: t.assigneeIds.length >= 2 ? 1 : 0,
        complete_before_noon: hour < 12 ? 1 : 0,
      }, at, g);
    }

    // AI Whisperer: a human's mission completed by/for an AI operative (counted once per task).
    if (!farm && firstEver && anyAwarded && t.creatorId) {
      const creator = g.members.get(t.creatorId);
      const hasAgent = t.assigneeIds.some((a) => g.members.get(a)?.kind === 'agent');
      if (creator && creator.kind === 'human' && hasAgent) {
        this.bump(orgId, creator.id, 'ai_whisperer');
        touched.add(creator.id);
      }
    }

    if (g.project) this.applySquadBonus(orgId, g.project, at, g, touched);
  }

  private updateStreak(orgId: string, m: MemberInfo, day: string, at: number, taskId: string, cid: string): void {
    const p = this.player(orgId, m.id);
    const last = p.streak_last_day;
    if (last === day || (last && day < last)) return;
    const current = last && onlyWeekendsBetween(last, day) ? p.streak_current + 1 : 1;
    const best = Math.max(p.streak_best, current);
    this.q('UPDATE game_players SET streak_current = ?, streak_best = ?, streak_last_day = ? WHERE org_id = ? AND member_id = ?')
      .run(current, best, day, orgId, m.id);
    const bonus = Math.min(STREAK_XP_PER_DAY * current, STREAK_XP_MAX);
    this.award(orgId, m.id, 'streak_bonus', bonus, `${fmtXp(bonus)} · ${current}-day streak`, { at, taskId, completionId: cid });
    if (current % EPIC_CRATE_EVERY_STREAK_DAYS === 0) {
      this.grantCrate(orgId, m.id, 'epic', `${current}-day streak`, at);
      this.feed(orgId, m.id, 'streak_bonus', bonus, `${m.name} is on a ${current}-day streak 🔥`, at);
    }
  }

  private applySquadBonus(orgId: string, proj: NonNullable<Gathered['project']>, at: number, g: Gathered, touched: Set<string>): void {
    const ins = this.q('INSERT OR IGNORE INTO game_squad_bonus (org_id, project_id, at) VALUES (?, ?, ?)').run(orgId, proj.id, at);
    if (ins.changes === 0) return;
    const fromLedger = (this.q('SELECT DISTINCT member_id FROM game_completions WHERE org_id = ? AND project_id = ? AND revoked_at IS NULL')
      .all(orgId, proj.id) as { member_id: string }[]).map((r) => r.member_id);
    const recipients = [...new Set([...fromLedger, ...proj.completers])].filter((id) => g.members.has(id));
    for (const id of recipients) {
      this.award(orgId, id, 'squad_bonus', SQUAD_BONUS_XP, `${fmtXp(SQUAD_BONUS_XP)} · Operation cleared: ${proj.name}`, { at });
      touched.add(id);
    }
    const lead = proj.leadId ? g.members.get(proj.leadId) : undefined;
    if (lead) {
      this.bump(orgId, lead.id, 'ops_commanded');
      touched.add(lead.id);
    }
    const credit = lead?.id ?? recipients[0];
    if (credit) {
      this.feed(orgId, credit, 'squad_bonus', SQUAD_BONUS_XP,
        `Operation ${proj.name} cleared — ${fmtXp(SQUAD_BONUS_XP)} to ${recipients.length} operative${recipients.length === 1 ? '' : 's'}`, at);
    }
  }

  // ─── Levels, ranks, achievements ───────────────────────────────────────────

  stat(orgId: string, memberId: string, metric: Metric): number {
    const one = (sql: string, ...a: unknown[]) => ((this.q(sql).get(...a) as { n: number | null }).n ?? 0);
    const done = 'FROM game_completions WHERE org_id = ? AND member_id = ? AND revoked_at IS NULL AND farm = 0';
    switch (metric) {
      case 'missions': return one(`SELECT COUNT(*) AS n ${done}`, orgId, memberId);
      case 'on_time': return one(`SELECT COUNT(*) AS n ${done} AND on_time = 1`, orgId, memberId);
      case 'rescued': return one(`SELECT COUNT(*) AS n ${done} AND rescued = 1`, orgId, memberId);
      case 'urgent': return one(`SELECT COUNT(*) AS n ${done} AND priority = 'urgent'`, orgId, memberId);
      case 'created': return one('SELECT COUNT(*) AS n FROM game_intel WHERE org_id = ? AND member_id = ?', orgId, memberId);
      case 'objectives': return one('SELECT COUNT(*) AS n FROM game_subtasks WHERE org_id = ? AND member_id = ?', orgId, memberId);
      case 'crates_opened': return one('SELECT COUNT(*) AS n FROM game_crates WHERE org_id = ? AND member_id = ? AND opened_at IS NOT NULL', orgId, memberId);
      case 'challenges': return one('SELECT COUNT(*) AS n FROM game_challenges WHERE org_id = ? AND member_id = ? AND completed_at IS NOT NULL', orgId, memberId);
      case 'squad_bonuses': return one("SELECT COUNT(*) AS n FROM game_rewards WHERE org_id = ? AND member_id = ? AND kind = 'squad_bonus'", orgId, memberId);
      case 'streak_best': return this.readPlayer(orgId, memberId).streak_best;
      case 'level': return this.readPlayer(orgId, memberId).max_level;
      default: return this.counter(orgId, memberId, metric);
    }
  }

  /** Level-ups, rank-ups, achievement unlocks — repeated until stable. */
  settle(orgId: string, m: MemberInfo, at: number): void {
    for (let i = 0; i < 10; i++) {
      this.applyLevel(orgId, m, at);
      if (!this.checkAchievements(orgId, m, at)) return;
    }
  }

  private applyLevel(orgId: string, m: MemberInfo, at: number): void {
    const p = this.player(orgId, m.id);
    const lvl = levelForXp(p.xp);
    let maxRank = p.max_rank;
    for (let l = p.max_level + 1; l <= lvl; l++) {
      const rIdx = rankIndexForLevel(l);
      const rank = RANKS[rIdx]!;
      const promoted = rIdx > maxRank;
      const label = promoted ? `Promoted to ${rank.name} · Level ${l}` : `Level ${l} reached`;
      this.award(orgId, m.id, 'level_up', 0, label, { at, level: l, rankId: rank.id });
      this.grantCrate(orgId, m.id, 'rare', `Level ${l} reached`, at);
      if (promoted) {
        if (rIdx >= LEGENDARY_RANK_INDEX) this.grantCrate(orgId, m.id, 'legendary', `Promoted to ${rank.name}`, at);
        this.feed(orgId, m.id, 'level_up', 0, `${m.name} was promoted to ${rank.name} (Level ${l})`, at);
        maxRank = rIdx;
      } else {
        this.feed(orgId, m.id, 'level_up', 0, `${m.name} reached Level ${l}`, at);
      }
    }
    this.q('UPDATE game_players SET level = ?, rank_id = ?, max_level = ?, max_rank = ? WHERE org_id = ? AND member_id = ?')
      .run(lvl, rankForLevel(lvl).id, Math.max(p.max_level, lvl), maxRank, orgId, m.id);
  }

  private checkAchievements(orgId: string, m: MemberInfo, at: number): boolean {
    const have = new Set((this.q('SELECT achievement_id FROM game_achievements WHERE org_id = ? AND member_id = ?').all(orgId, m.id) as { achievement_id: string }[])
      .map((r) => r.achievement_id));
    let unlocked = false;
    const cache = new Map<Metric, number>();
    for (const a of ACHIEVEMENTS) {
      if (have.has(a.id)) continue;
      if (!cache.has(a.metric)) cache.set(a.metric, this.stat(orgId, m.id, a.metric));
      if ((cache.get(a.metric) ?? 0) < a.target) continue;
      this.q('INSERT OR IGNORE INTO game_achievements (org_id, member_id, achievement_id, unlocked_at) VALUES (?, ?, ?, ?)').run(orgId, m.id, a.id, at);
      const xp = ACHIEVEMENT_XP[a.tier];
      this.award(orgId, m.id, 'achievement', xp, `${fmtXp(xp)} · Medal unlocked: ${a.name}`, { at, achievementId: a.id });
      const crate = ACHIEVEMENT_CRATE[a.tier];
      if (crate) this.grantCrate(orgId, m.id, crate, `Medal: ${a.name}`, at);
      this.feed(orgId, m.id, 'achievement', xp, `${m.name} unlocked ${a.name} ${a.icon}`, at);
      unlocked = true;
    }
    return unlocked;
  }

  // ─── Crates (called by the service) ────────────────────────────────────────

  openCrate(orgId: string, memberId: string, crateId: string, now: number): { reward: CrateReward; openedAt: number } | null {
    const crate = this.q('SELECT * FROM game_crates WHERE id = ? AND org_id = ? AND member_id = ?').get(crateId, orgId, memberId) as
      { rarity: Rarity; opened_at: number | null } | undefined;
    if (!crate || crate.opened_at != null) return null;
    const owned = new Set((this.q('SELECT item_id FROM game_inventory WHERE org_id = ? AND member_id = ?').all(orgId, memberId) as { item_id: string }[])
      .map((r) => r.item_id));
    const reward = rollLoot(crate.rarity, this.random, owned);
    let coins = 0;
    if (reward.kind === 'coins') coins = reward.amount ?? 0;
    else if (reward.kind === 'xp_boost') {
      const active = this.activeBoost(orgId, memberId, now);
      const start = active ? active.until : now;
      this.q('INSERT INTO game_boosts (id, org_id, member_id, multiplier, starts_at, until) VALUES (?, ?, ?, ?, ?, ?)')
        .run(newId('bst'), orgId, memberId, BOOST_MULTIPLIER, start, start + (reward.amount ?? 30) * 60_000);
    } else {
      const c = COSMETICS.find((x) => x.id === reward.id)!;
      this.q('INSERT OR IGNORE INTO game_inventory (org_id, member_id, kind, item_id, name, rarity, acquired_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(orgId, memberId, c.kind, c.id, c.name, c.rarity, now);
    }
    this.q('UPDATE game_crates SET opened_at = ?, reward_json = ?, reward_coins = ? WHERE id = ?').run(now, JSON.stringify(reward), coins, crateId);
    return { reward, openedAt: now };
  }

  // ─── Rebuild (cache is derived from the ledger) ────────────────────────────

  /** Recompute game_players for every member of an org from the ledger + completions. */
  rebuildPlayers(orgId: string): number {
    const ids = (this.q(`SELECT member_id FROM game_rewards WHERE org_id = ? UNION SELECT member_id FROM game_completions WHERE org_id = ?`)
      .all(orgId, orgId) as { member_id: string }[]).map((r) => r.member_id);
    this.db.transaction(() => {
      for (const id of ids) {
        const xp = (this.q('SELECT COALESCE(SUM(xp), 0) AS s FROM game_rewards WHERE org_id = ? AND member_id = ?').get(orgId, id) as { s: number }).s;
        const lvl = levelForXp(xp);
        const maxLevel = Math.max(lvl, (this.q("SELECT MAX(level) AS l FROM game_rewards WHERE org_id = ? AND member_id = ? AND kind = 'level_up'").get(orgId, id) as { l: number | null }).l ?? 1);
        const days = (this.q('SELECT DISTINCT day FROM game_completions WHERE org_id = ? AND member_id = ? AND farm = 0 ORDER BY day').all(orgId, id) as { day: string }[]).map((r) => r.day);
        let cur = 0, best = 0, last: string | null = null;
        for (const d of days) {
          cur = last && onlyWeekendsBetween(last, d) ? cur + 1 : 1;
          best = Math.max(best, cur);
          last = d;
        }
        const missionsHw = Math.floor(this.stat(orgId, id, 'missions') / CRATE_EVERY_MISSIONS);
        const prevHw = this.readPlayer(orgId, id).missions_hw;
        this.q(`INSERT INTO game_players (org_id, member_id, xp, level, rank_id, max_level, max_rank, missions_hw, streak_current, streak_best, streak_last_day, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (org_id, member_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, rank_id = excluded.rank_id,
            max_level = excluded.max_level, max_rank = excluded.max_rank, missions_hw = excluded.missions_hw,
            streak_current = excluded.streak_current, streak_best = excluded.streak_best, streak_last_day = excluded.streak_last_day,
            updated_at = excluded.updated_at`)
          .run(orgId, id, xp, lvl, rankForLevel(lvl).id, maxLevel, rankIndexForLevel(maxLevel), Math.max(missionsHw, prevHw), cur, best, last, this.clock());
      }
    })();
    return ids.length;
  }
}
