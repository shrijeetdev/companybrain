// analytics — PURE report computations over in-memory arrays of domain objects.
//
// This module is deliberately side-effect-free and has no database access: every
// function takes plain data arrays and returns plain numbers/objects. That makes it
// trivial to unit-test and lets the server layer decide WHERE the data comes from
// (db queries, an export, etc.) and only needs to hand the arrays to `computeReport`.
//
// It replaces the hardcoded numbers the Reports UI used to show ("94% loops closed",
// "142 Loops closed", the fake James/Priya/Alex/Sam leaderboard) with figures derived
// from real loops / tasks / leads / time entries.
//
// All "window" calculations are anchored to `now` and look back `windowDays`. Loops and
// leads in this codebase carry no dedicated "closed at"/"won at" timestamp, so where a
// transition time is needed we fall back to `updatedAt` / `createdAt` respectively. Each
// such assumption is called out inline.

import type { Loop, Task, Lead, LoopStatus, LeadStage, Priority } from '@companybrain/types';
import type { TimeEntry } from './time-tracking';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const SECONDS_PER_HOUR = 3_600;
/** A loop is "on time" if it was resolved within this many hours of being captured. */
const ON_TIME_HOURS = 72;

export interface AnalyticsInput {
  loops: Loop[];
  tasks: Task[];
  leads: Lead[];
  /** Tracked focus time, in seconds per entry (see TimeEntry). Optional: if absent, focusHours is 0. */
  timeEntries?: TimeEntry[];
  /** People to rank on the leaderboard. If absent, leaderboard is empty (NEVER synthetic names). */
  users?: Array<{ userId: string; name: string }>;
  /** Lookback window in days for "in-window" counts. Default 30. */
  windowDays?: number;
}

export interface LoopsReport {
  total: number;
  open: number;
  closed: number;
  /** Closed loops whose close timestamp (updatedAt proxy) falls inside the window. */
  closedInWindow: number;
  /** % of closed loops resolved within 72h, rounded. 0 when nothing is closed. */
  onTimeRate: number;
  snoozed: number;
  overdue: number;
  /** Mean (updatedAt - createdAt) for closed loops, in hours. 0 when nothing is closed. */
  avgCloseHours: number;
}

export interface TasksReport {
  total: number;
  /** Tasks completed (all subtasks done) within the window. */
  completedInWindow: number;
  /** Tasks created within the window. */
  createdInWindow: number;
  /** completedInWindow / createdInWindow × 100 (rounded). 0 when nothing created. */
  completionRate: number;
  /** Incomplete tasks past their dueAt. */
  overdue: number;
  byPriority: { high: number; med: number; low: number; none: number };
}

export interface LeadsReport {
  total: number;
  won: number;
  lost: number;
  /** Leads still in play (neither won nor lost). */
  pipeline: number;
  /** Won leads whose createdAt falls in the window (won-at proxy — see code). */
  wonInWindow: number;
  /** won / (won + lost) × 100 (rounded). 0 with no decided leads. */
  conversionRate: number;
  /** Sum of monetary value across pipeline leads. Currently always 0: Lead has no value field yet. */
  pipelineValue: number;
}

export interface ProductivityReport {
  /** Total tracked focus time in hours (sum of durations / 3600). 0 if no time entries. */
  focusHours: number;
  /** Average tasks completed per day over the window. */
  tasksPerDay: number;
  /** Completions per day for the last 7 days, oldest → newest. */
  velocityTrend: number[];
  /** Weekday name with the highest completion count over the window. */
  bestDay: string;
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  points: number;
  tasksDone: number;
  loopsClosed: number;
  focusMinutes: number;
}

export interface SummaryReport {
  /** One-line, real-number headline, e.g. "94% of loops closed on time this period." */
  headline: string;
  /** Supporting sentence with concrete counts, e.g. "30 tasks completed, 4 leads won." */
  sub: string;
}

export interface AnalyticsReport {
  windowDays: number;
  generatedAt: number;
  loops: LoopsReport;
  tasks: TasksReport;
  leads: LeadsReport;
  productivity: ProductivityReport;
  leaderboard: LeaderboardRow[];
  summary: SummaryReport;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * A task counts as "completed" only when ALL of its subtasks are done. The data model
 * has no top-level `done` flag, so this is our single source of truth for completion.
 * Tasks with zero subtasks cannot be proven complete, so they are treated as incomplete.
 */
function isTaskComplete(task: Task): boolean {
  return !!task.subtasks && task.subtasks.length > 0 && task.subtasks.every((s) => s.done);
}

function round(n: number): number {
  return Math.round(n);
}

function computeLoops(loops: Loop[], windowStart: number): LoopsReport {
  let open = 0;
  let closed = 0;
  let snoozed = 0;
  let overdue = 0;
  let closedInWindow = 0;
  let onTime = 0;
  let totalCloseMs = 0;

  for (const l of loops) {
    const status: LoopStatus = l.status;
    if (status === 'open') open++;
    else if (status === 'snoozed') snoozed++;
    else if (status === 'overdue') overdue++;

    if (status === 'closed') {
      closed++;
      // Loops have no closedAt; updatedAt is the best proxy for when it was resolved.
      if (l.updatedAt >= windowStart) closedInWindow++;

      const closeMs = l.updatedAt - l.createdAt;
      totalCloseMs += closeMs;
      if (closeMs <= ON_TIME_HOURS * MS_PER_HOUR) onTime++;
    }
  }

  const avgCloseHours = closed > 0 ? totalCloseMs / closed / MS_PER_HOUR : 0;
  const onTimeRate = closed > 0 ? round((onTime / closed) * 100) : 0;

  return {
    total: loops.length,
    open,
    closed,
    closedInWindow,
    onTimeRate,
    snoozed,
    overdue,
    avgCloseHours: round(avgCloseHours * 10) / 10, // one decimal place
  };
}

function computeTasks(tasks: Task[], windowStart: number, now: number): TasksReport {
  let completedInWindow = 0;
  let createdInWindow = 0;
  let overdue = 0;
  const byPriority = { high: 0, med: 0, low: 0, none: 0 };

  for (const t of tasks) {
    // Priority bucket; null/undefined → "none".
    const p: Priority = t.priority ?? null;
    if (p === 'high') byPriority.high++;
    else if (p === 'med') byPriority.med++;
    else if (p === 'low') byPriority.low++;
    else byPriority.none++;

    if (t.createdAt >= windowStart) createdInWindow++;
    if (isTaskComplete(t)) {
      // There is no completion timestamp; createdAt is the closest available signal, so a
      // completed task created in the window counts as completed in the window.
      if (t.createdAt >= windowStart) completedInWindow++;
    } else if (t.dueAt != null && t.dueAt < now) {
      overdue++;
    }
  }

  const completionRate = createdInWindow > 0 ? round((completedInWindow / createdInWindow) * 100) : 0;

  return { total: tasks.length, completedInWindow, createdInWindow, completionRate, overdue, byPriority };
}

function computeLeads(leads: Lead[], windowStart: number): LeadsReport {
  let won = 0;
  let lost = 0;
  let pipeline = 0;
  let wonInWindow = 0;

  for (const lead of leads) {
    const stage: LeadStage = lead.stage;
    if (stage === 'won') {
      won++;
      // Leads have no separate wonAt timestamp, so createdAt is used as the date proxy.
      // LIMITATION: this over-counts "won in window" when a lead created long ago was won
      // recently, and under-counts when a recently-created lead was won. Acceptable until
      // a wonAt field is added to the schema.
      if (lead.createdAt >= windowStart) wonInWindow++;
    } else if (stage === 'lost') {
      lost++;
    } else {
      pipeline++;
    }
  }

  const conversionRate = won + lost > 0 ? round((won / (won + lost)) * 100) : 0;

  return {
    total: leads.length,
    won,
    lost,
    pipeline,
    wonInWindow,
    conversionRate,
    // pipelineValue is a placeholder: Lead currently has no monetary/value field. Returns 0
    // rather than a fabricated number so the UI degrades honestly until value is modelled.
    pipelineValue: 0,
  };
}

function computeProductivity(
  tasks: Task[],
  timeEntries: TimeEntry[] | undefined,
  windowStart: number,
  now: number,
  windowDays: number,
): ProductivityReport {
  const focusSeconds = (timeEntries ?? []).reduce((sum, e) => sum + (e.duration ?? 0), 0);
  const focusHours = round((focusSeconds / SECONDS_PER_HOUR) * 10) / 10;

  // velocityTrend: completions per day for the last 7 calendar days (oldest → newest).
  // We approximate completion time by createdAt (no completion timestamp exists).
  const trend: number[] = [0, 0, 0, 0, 0, 0, 0];
  const dayBuckets: number[] = new Array(7).fill(0); // completion counts per weekday index

  const completedByCreatedAt = tasks.filter(isTaskComplete);
  for (const t of completedByCreatedAt) {
    // Weekday tally across the whole window → drives bestDay.
    const dow = new Date(t.createdAt).getDay();
    if (dayBuckets[dow] === undefined) dayBuckets[dow] = 0;
    dayBuckets[dow]++;

    // 7-day trend bucket: index 0 = 6 days ago … index 6 = today.
    const ageDays = Math.floor((now - t.createdAt) / MS_PER_DAY);
    if (ageDays >= 0 && ageDays <= 6) {
      const idx = 6 - ageDays;
      const slot = trend[idx];
      if (slot !== undefined) trend[idx] = slot + 1;
    }
  }

  const tasksPerDay = windowDays > 0 ? round((completedByCreatedAt.length / windowDays) * 10) / 10 : 0;

  let bestDay = '—';
  let bestCount = -1;
  for (let i = 0; i < 7; i++) {
    const count = dayBuckets[i] ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestDay = WEEKDAYS[i] ?? '—';
    }
  }
  // If literally nothing was completed, bestDay stays '—' rather than arbitrarily "Sunday".
  if (bestCount <= 0) bestDay = '—';

  return { focusHours, tasksPerDay, velocityTrend: trend, bestDay };
}

function computeLeaderboard(
  users: Array<{ userId: string; name: string }> | undefined,
  loops: Loop[],
  tasks: Task[],
  timeEntries: TimeEntry[] | undefined,
): LeaderboardRow[] {
  // With no roster there is nobody to rank — return an empty list instead of inventing names.
  if (!users || users.length === 0) return [];

  // Focus minutes per user.
  const focusMinutes = new Map<string, number>();
  for (const e of timeEntries ?? []) {
    const minutes = Math.floor((e.duration ?? 0) / 60);
    focusMinutes.set(e.userId, (focusMinutes.get(e.userId) ?? 0) + minutes);
  }

  // Tasks done per user: sum across assignees (a task can have several). We count a task
  // once per assigned user, which keeps individual totals honest even on shared tasks.
  const tasksDone = new Map<string, number>();
  for (const t of tasks) {
    if (!isTaskComplete(t)) continue;
    for (const uid of t.assignees) tasksDone.set(uid, (tasksDone.get(uid) ?? 0) + 1);
  }

  // Loops closed per user: credit everyone assigned to a closed loop.
  const loopsClosed = new Map<string, number>();
  for (const l of loops) {
    if (l.status !== 'closed') continue;
    for (const uid of l.assignedTo) loopsClosed.set(uid, (loopsClosed.get(uid) ?? 0) + 1);
  }

  const rows: LeaderboardRow[] = users.map((u) => {
    const done = tasksDone.get(u.userId) ?? 0;
    const closed = loopsClosed.get(u.userId) ?? 0;
    const minutes = focusMinutes.get(u.userId) ?? 0;
    const points = done * 3 + closed * 2 + Math.floor(minutes / 25);
    return { userId: u.userId, name: u.name, points, tasksDone: done, loopsClosed: closed, focusMinutes: minutes };
  });

  rows.sort((a, b) => b.points - a.points || b.tasksDone - a.tasksDone);
  return rows;
}

function buildSummary(loops: LoopsReport, tasks: TasksReport, leads: LeadsReport, windowDays: number): SummaryReport {
  const period = windowDays >= 30 ? 'this period' : `over the last ${windowDays} days`;
  const headline = `${loops.onTimeRate}% of loops closed on time ${period}.`;
  const sub = `${tasks.completedInWindow} tasks completed, ${leads.wonInWindow} leads won.`;
  return { headline, sub };
}

/**
 * Compute a full analytics report from in-memory domain arrays. Pure: no I/O, no globals,
 * safe to call concurrently. Pass `windowDays` to control the lookback (default 30).
 */
export function computeReport(input: AnalyticsInput): AnalyticsReport {
  const { loops = [], tasks = [], leads = [], timeEntries, users, windowDays = 30 } = input ?? {};

  const now = Date.now();
  const windowStart = now - windowDays * MS_PER_DAY;

  const loopsReport = computeLoops(loops, windowStart);
  const tasksReport = computeTasks(tasks, windowStart, now);
  const leadsReport = computeLeads(leads, windowStart);
  const productivity = computeProductivity(tasks, timeEntries, windowStart, now, windowDays);
  const leaderboard = computeLeaderboard(users, loops, tasks, timeEntries);
  const summary = buildSummary(loopsReport, tasksReport, leadsReport, windowDays);

  return {
    windowDays,
    generatedAt: now,
    loops: loopsReport,
    tasks: tasksReport,
    leads: leadsReport,
    productivity,
    leaderboard,
    summary,
  };
}
