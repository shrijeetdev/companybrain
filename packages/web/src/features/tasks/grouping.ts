import type { TaskView } from '@companybrain/types';
import type { Labels } from '../../lib/labels';
import { dayIndex } from '../../lib/time';

export type BucketKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done';
export interface Bucket { key: BucketKey; label: string; tone?: 'danger' | 'accent'; tasks: TaskView[] }

const PRI = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const;

export function sortTasks(a: TaskView, b: TaskView): number {
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    // all-day items sort after timed ones on the same day
    const da = a.dueAt + (a.dueAllDay ? 1 : 0);
    const db = b.dueAt + (b.dueAllDay ? 1 : 0);
    if (da !== db) return da - db;
  }
  if (PRI[a.priority] !== PRI[b.priority]) return PRI[a.priority] - PRI[b.priority];
  return a.order - b.order;
}

export function bucketOf(t: TaskView, now = Date.now()): BucketKey {
  if (t.status === 'done' || t.status === 'cancelled') return 'done';
  if (t.isOverdue) return 'overdue';
  if (t.dueAt === null) return 'none';
  const d = dayIndex(t.dueAt, now);
  if (d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return 'week';
  return 'later';
}

export function groupTasks(tasks: TaskView[], L: Labels, opts: { keepDoneIds?: ReadonlySet<string> } = {}): Bucket[] {
  const labels: Record<BucketKey, string> = { overdue: L.overdue, today: 'Today', tomorrow: 'Tomorrow', week: 'This week', later: 'Later', none: 'No date', done: L.completed };
  const order: BucketKey[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none', 'done'];
  const map = new Map<BucketKey, TaskView[]>();
  for (const t of tasks) {
    // Freshly completed tasks stay in place for a moment so the completion can be seen.
    const k = opts.keepDoneIds?.has(t.id) ? bucketOf({ ...t, status: 'todo' }) : bucketOf(t);
    const arr = map.get(k) ?? [];
    arr.push(t);
    map.set(k, arr);
  }
  return order.filter((k) => map.get(k)?.length).map((k) => ({
    key: k,
    label: labels[k],
    tone: k === 'overdue' ? 'danger' : k === 'today' ? 'accent' : undefined,
    tasks: map.get(k)!.sort(k === 'done' ? (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) : sortTasks),
  }));
}
