// Productivity-methods engine — pure functions over Task[] that classify, rank,
// or schedule work using well-known frameworks (Eisenhower, MoSCoW, ABCDE, GTD,
// the 2-minute rule, Eat-the-frog, 3-3-3, Pareto 80/20, time-blocking, Pomodoro).
//
// Each function is pure: same input → same output, no side effects. The UI and
// API layer compose these into views. A METHODS registry exposes metadata so the
// UI can render a method picker without hardcoding.

import type { Task, MethodId, MethodMeta, MethodResult } from '@companybrain/types';

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/** True when a task counts as "urgent" — due within 24h, or scheduled for today. */
function isUrgent(t: Task, now = Date.now()): boolean {
  if (t.day === 'today') return true;
  if (t.dueAt && t.dueAt - now <= MS_PER_DAY) return true;
  return false;
}

/** True when a task counts as "important" — high priority. */
function isImportant(t: Task): boolean {
  return t.priority === 'high';
}

/** True when a task is overdue (due in the past and not done). */
function isOverdue(t: Task, now = Date.now()): boolean {
  if (!t.dueAt) return false;
  return t.dueAt < now;
}

/** A task is "complete" when it has subtasks and every one is done. */
function isComplete(t: Task): boolean {
  if (!t.subtasks || t.subtasks.length === 0) return false;
  return t.subtasks.every((s) => s.done);
}

// ─── 1. Eisenhower Matrix ────────────────────────────────────────────────────
// Q1: urgent + important (do first) · Q2: important, not urgent (schedule)
// Q3: urgent, not important (delegate) · Q4: neither (drop).

export interface EisenhowerResult {
  q1: Task[]; // Do
  q2: Task[]; // Schedule
  q3: Task[]; // Delegate
  q4: Task[]; // Drop
}

export function eisenhower(tasks: Task[], now = Date.now()): EisenhowerResult {
  const open = tasks.filter((t) => !isComplete(t));
  const result: EisenhowerResult = { q1: [], q2: [], q3: [], q4: [] };
  for (const t of open) {
    const u = isUrgent(t, now);
    const i = isImportant(t);
    if (u && i) result.q1.push(t);
    else if (!u && i) result.q2.push(t);
    else if (u && !i) result.q3.push(t);
    else result.q4.push(t);
  }
  return result;
}

// ─── 2. MoSCoW ───────────────────────────────────────────────────────────────
// Must / Should / Could / Won't. Maps from priority, parking overdue no-priority
// tasks into "Won't" (they've slipped — re-scope or drop them).

export interface MoscowResult {
  must: Task[];
  should: Task[];
  could: Task[];
  wont: Task[];
}

export function moscow(tasks: Task[], now = Date.now()): MoscowResult {
  const open = tasks.filter((t) => !isComplete(t));
  const result: MoscowResult = { must: [], should: [], could: [], wont: [] };
  for (const t of open) {
    if (t.priority === 'high') result.must.push(t);
    else if (t.priority === 'med') result.should.push(t);
    else if (t.priority === 'low') result.could.push(t);
    else if (isOverdue(t, now)) result.wont.push(t);
    else result.could.push(t); // unscheduled, not overdue → Could
  }
  return result;
}

// ─── 3. ABCDE ─────────────────────────────────────────────────────────────────
// Rank A (critical) → E (eliminate). A = high + overdue, B = high, C = med + today,
// D = med, E = low or none. Returns the ranked list, most important first.

export interface AbcdeRow {
  task: Task;
  rank: 'A' | 'B' | 'C' | 'D' | 'E';
}

export interface AbcdeResult {
  ranked: AbcdeRow[];
}

const RANK_WEIGHT: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

export function abcde(tasks: Task[], now = Date.now()): AbcdeResult {
  const open = tasks.filter((t) => !isComplete(t));
  const ranked = open.map((task) => {
    let rank: AbcdeRow['rank'];
    if (task.priority === 'high' && isOverdue(task, now)) rank = 'A';
    else if (task.priority === 'high') rank = 'B';
    else if (task.priority === 'med' && task.day === 'today') rank = 'C';
    else if (task.priority === 'med') rank = 'D';
    else rank = 'E';
    return { task, rank };
  });
  ranked.sort((a, b) => (RANK_WEIGHT[a.rank] ?? 9) - (RANK_WEIGHT[b.rank] ?? 9));
  return { ranked };
}

// ─── 4. GTD (Getting Things Done) ─────────────────────────────────────────────
// Group tasks by "context" — derived from explicit @tags in the title, or inferred
// from the emoji. Tasks with no discernible context land in "inbox".

const GTD_CONTEXTS = ['@email', '@call', '@computer', '@errands', '@home', '@anywhere'] as const;
type GtdContext = (typeof GTD_CONTEXTS)[number];

const EMOJI_TO_CONTEXT: Record<string, GtdContext> = {
  '📞': '@call',
  '☎️': '@call',
  '💻': '@computer',
  '🖥️': '@computer',
  '✉️': '@email',
  '📧': '@email',
  '🚗': '@errands',
  '🛒': '@errands',
  '🏠': '@home',
  '🏡': '@home',
};

function inferContext(task: Task): GtdContext | null {
  const lower = task.title.toLowerCase();
  for (const ctx of GTD_CONTEXTS) {
    if (lower.includes(ctx)) return ctx as GtdContext;
  }
  if (task.emoji && EMOJI_TO_CONTEXT[task.emoji]) return EMOJI_TO_CONTEXT[task.emoji]!;
  return null;
}

export interface GtdResult {
  contexts: Record<GtdContext, Task[]>;
  inbox: Task[];
}

export function gtd(tasks: Task[]): GtdResult {
  const open = tasks.filter((t) => !isComplete(t));
  const contexts = {
    '@email': [], '@call': [], '@computer': [],
    '@errands': [], '@home': [], '@anywhere': [],
  } as Record<GtdContext, Task[]>;
  const inbox: Task[] = [];
  for (const t of open) {
    const ctx = inferContext(t);
    if (ctx) contexts[ctx].push(t);
    else inbox.push(t);
  }
  return { contexts, inbox };
}

// ─── 5. Two-Minute Rule ───────────────────────────────────────────────────────
// Flag quick verbs that signal a <2-minute task. If it takes two minutes, do it now.

const QUICK_VERBS = ['call', 'email', 'reply', 'send', 'pay', 'file', 'book', 'text', 'sign', 'approve', 'confirm'];

export interface TwoMinuteResult {
  twoMinute: Task[];
  longer: Task[];
}

export function twoMinute(tasks: Task[]): TwoMinuteResult {
  const open = tasks.filter((t) => !isComplete(t));
  const twoMinute: Task[] = [];
  const longer: Task[] = [];
  for (const t of open) {
    const lower = t.title.toLowerCase();
    const isQuick = QUICK_VERBS.some((v) => lower.includes(v));
    if (isQuick) twoMinute.push(t);
    else longer.push(t);
  }
  return { twoMinute, longer };
}

// ─── 6. Eat That Frog ─────────────────────────────────────────────────────────
// The single highest-impact task to do first. Score by priority × urgency weight.

export interface FrogResult {
  frog: Task | null;
  why: string;
}

function frogScore(t: Task, now: number): number {
  const pWeight = t.priority === 'high' ? 3 : t.priority === 'med' ? 2 : t.priority === 'low' ? 1 : 0;
  let uWeight = 0;
  if (isOverdue(t, now)) uWeight = 3;
  else if (t.day === 'today') uWeight = 2;
  else if (t.day === 'tomorrow') uWeight = 1;
  return pWeight * 3 + uWeight;
}

export function eatThatFrog(tasks: Task[], now = Date.now()): FrogResult {
  const open = tasks.filter((t) => !isComplete(t));
  if (open.length === 0) return { frog: null, why: 'No open tasks — nothing to eat.' };
  let best = open[0]!;
  let bestScore = frogScore(best, now);
  for (const t of open) {
    const s = frogScore(t, now);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  const reasons: string[] = [];
  if (best.priority === 'high') reasons.push('highest priority');
  if (isOverdue(best, now)) reasons.push('overdue');
  else if (best.day === 'today') reasons.push('due today');
  const why = reasons.length > 0
    ? `Your frog: the task that is ${reasons.join(' and ')}. Do it first.`
    : 'Your frog: the highest-impact task right now. Do it first.';
  return { frog: best, why };
}

// ─── 7. 3-3-3 Method ──────────────────────────────────────────────────────────
// Three deep-work tasks, three medium, three small — a focused daily plan.

export interface ThreeThreeResult {
  deep: Task[];
  medium: Task[];
  small: Task[];
}

export function threeThree(tasks: Task[]): ThreeThreeResult {
  const open = tasks.filter((t) => !isComplete(t));
  const deep = open.filter((t) => t.priority === 'high').slice(0, 3);
  const deepIds = new Set(deep.map((t) => t.id));
  const remaining = open.filter((t) => !deepIds.has(t.id));
  const medium = remaining.filter((t) => t.priority === 'med').slice(0, 3);
  const mediumIds = new Set(medium.map((t) => t.id));
  const small = remaining
    .filter((t) => !mediumIds.has(t.id) && (t.priority === 'low' || t.priority === null))
    .slice(0, 3);
  return { deep, medium, small };
}

// ─── 8. Pareto 80/20 ──────────────────────────────────────────────────────────
// The vital 20% of tasks that drive 80% of value. Score by priority + richness
// (subtasks add surface area; recurring tasks carry ongoing value).

export interface ParetoResult {
  vital: Task[];
  useful: Task[];
}

function paretoScore(t: Task): number {
  const p = t.priority === 'high' ? 3 : t.priority === 'med' ? 2 : t.priority === 'low' ? 1 : 0;
  const subtasks = t.subtasks?.length ?? 0;
  const recurring = t.recurring ? 2 : 0;
  return p * 2 + subtasks + recurring;
}

export function pareto(tasks: Task[]): ParetoResult {
  const open = tasks.filter((t) => !isComplete(t));
  if (open.length === 0) return { vital: [], useful: [] };
  const sorted = [...open].sort((a, b) => paretoScore(b) - paretoScore(a));
  const vitalCount = Math.max(1, Math.ceil(open.length * 0.2));
  return { vital: sorted.slice(0, vitalCount), useful: sorted.slice(vitalCount) };
}

// ─── 9. Time-Blocking ─────────────────────────────────────────────────────────
// Spread tasks across a 9am–6pm workday. Deep work in the morning, calls/meetings
// in the afternoon, admin in the gaps. Returns ordered time blocks.

export interface TimeBlock {
  start: string; // "09:00"
  end: string; // "09:30"
  task: Task;
  blockType: 'deep' | 'meeting' | 'admin';
}

const toClock = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export function timeBlocking(tasks: Task[]): TimeBlock[] {
  const open = tasks.filter((t) => !isComplete(t));
  // Partition: meetings = calls/verb-heavy; deep = high priority; admin = the rest.
  const meeting = open.filter((t) => {
    const lower = t.title.toLowerCase();
    return lower.includes('call') || lower.includes('meet') || lower.includes('sync') || lower.includes('standup');
  });
  const meetingIds = new Set(meeting.map((t) => t.id));
  const deep = open.filter((t) => !meetingIds.has(t.id) && t.priority === 'high');
  const deepIds = new Set(deep.map((t) => t.id));
  const admin = open.filter((t) => !meetingIds.has(t.id) && !deepIds.has(t.id));

  // 9:00–12:00 deep work (30-min slots), 12:00–14:00 lunch/admin, 14:00–17:00 meetings, 17:00–18:00 admin
  const blocks: TimeBlock[] = [];
  let clock = 9 * 60; // 540 min = 9:00

  const place = (list: Task[], blockType: TimeBlock['blockType']) => {
    for (const task of list) {
      const dur = 30;
      blocks.push({ start: toClock(clock), end: toClock(clock + dur), task, blockType });
      clock += dur;
    }
  };

  place(deep, 'deep');           // morning: 9:00 → up to 12:00
  place(admin.slice(0, 4), 'admin'); // midday admin: 12:00 → up to 14:00
  place(meeting, 'meeting');     // afternoon meetings: 14:00 → up to 17:00
  place(admin.slice(4), 'admin'); // tail admin: 17:00 → 18:00
  return blocks.slice(0, 18);    // cap at a 9-hour day (18 × 30-min slots)
}

// ─── 10. Pomodoro Estimate ────────────────────────────────────────────────────
// Estimate focus sessions (25 min) per task. Heuristic from title length + subtasks.

export interface PomodoroRow {
  task: Task;
  sessions: number;
  minutes: number;
}

export function pomodoro(tasks: Task[]): PomodoroRow[] {
  const open = tasks.filter((t) => !isComplete(t));
  return open.map((task) => {
    const words = task.title.trim().split(/\s+/).filter(Boolean).length;
    let sessions = 1;
    if (words > 15) sessions = 4;
    else if (words > 10) sessions = 3;
    else if (words > 5) sessions = 2;
    const subtaskCount = task.subtasks?.length ?? 0;
    sessions += subtaskCount;
    return { task, sessions, minutes: sessions * 25 };
  });
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// One entry per method so the UI can render a picker without hardcoding. Each
// entry's `run` dispatches to the matching function and returns its structured
// result (typed loosely as MethodResult at the registry boundary).

export interface MethodEntry {
  meta: MethodMeta;
  run(tasks: Task[]): MethodResult;
}

export const METHODS: Record<MethodId, MethodEntry> = {
  eisenhower: {
    meta: { id: 'eisenhower', name: 'Eisenhower Matrix', icon: '🔲', description: 'Sort by urgent vs important into 4 quadrants.' },
    run: (tasks) => eisenhower(tasks),
  },
  moscow: {
    meta: { id: 'moscow', name: 'MoSCoW', icon: '🎯', description: 'Must / Should / Could / Won\u2019t — prioritize by commitment.' },
    run: (tasks) => moscow(tasks),
  },
  abcde: {
    meta: { id: 'abcde', name: 'ABCDE Method', icon: '🔤', description: 'Rank A (critical) through E (eliminate).' },
    run: (tasks) => abcde(tasks),
  },
  gtd: {
    meta: { id: 'gtd', name: 'Getting Things Done', icon: '🗂️', description: 'Group tasks by context (@call, @computer, @email…).' },
    run: (tasks) => gtd(tasks),
  },
  twominute: {
    meta: { id: 'twominute', name: '2-Minute Rule', icon: '⚡', description: 'Flag quick tasks you can knock out right now.' },
    run: (tasks) => twoMinute(tasks),
  },
  frog: {
    meta: { id: 'frog', name: 'Eat That Frog', icon: '🐸', description: 'The one highest-impact task to do first today.' },
    run: (tasks) => eatThatFrog(tasks),
  },
  threethree: {
    meta: { id: 'threethree', name: '3-3-3 Method', icon: '3️⃣', description: '3 deep + 3 medium + 3 small tasks for a focused day.' },
    run: (tasks) => threeThree(tasks),
  },
  pareto: {
    meta: { id: 'pareto', name: '80/20 Rule', icon: '📊', description: 'The vital 20% of tasks driving 80% of value.' },
    run: (tasks) => pareto(tasks),
  },
  timeblock: {
    meta: { id: 'timeblock', name: 'Time Blocking', icon: '🗓️', description: 'Lay tasks out across a 9am–6pm workday.' },
    run: (tasks) => timeBlocking(tasks),
  },
  pomodoro: {
    meta: { id: 'pomodoro', name: 'Pomodoro Estimate', icon: '🍅', description: 'Estimate focus sessions (25 min) per task.' },
    run: (tasks) => pomodoro(tasks),
  },
};

/** List of all method metadata — handy for the UI picker. */
export const METHOD_LIST: MethodMeta[] = Object.values(METHODS).map((m) => m.meta);
