// Recurring task engine — auto-creates tasks based on schedule.
// Runs daily to check for tasks that need to be recreated.

import type { TaskDay } from '@companybrain/types';
import { type Context, newId, now, record } from './context';

export interface RecurringSchedule {
  /** 'daily' | 'weekly' | 'monthly' | 'weekdays' | 'weekends' */
  frequency: 'daily' | 'weekly' | 'monthly' | 'weekdays' | 'weekends';
  /** For weekly: array of day indices (0=Sun, 1=Mon, ..., 6=Sat) */
  weekdays?: number[];
  /** For monthly: day of month (1-31) */
  dayOfMonth?: number;
  /** Optional: hour to create (0-23), defaults to 6 */
  hour?: number;
  /** Time of day string like "09:00" */
  timeOfDay?: string;
}

/** YYYY-MM-DD in the server's local time zone (set TZ, e.g. Asia/Kolkata). */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function makeRecurring(ctx: Context) {
  return {
    /**
     * Process all recurring tasks and create new instances where needed.
     * Should be called daily (e.g., by a cron job or worker).
     */
    async processDaily(orgId: string, at: Date = new Date()): Promise<{ created: number; skipped: number }> {
      let created = 0;
      let skipped = 0;

      const tasks = await ctx.db.tasks.list(orgId);
      // One template per (title, creator): the oldest recurring task. Copies made by older
      // versions were also flagged recurring; treating each as a template made the list double daily.
      const templates = new Map<string, (typeof tasks)[number]>();
      for (const t of tasks) {
        if (!t.recurring || !t.recur) continue;
        const key = t.createdBy + '\u0000' + t.title;
        const cur = templates.get(key);
        if (!cur || t.createdAt < cur.createdAt) templates.set(key, t);
      }

      const today = localDay(at);
      // Days that already have a copy, kept up to date inside the loop.
      const madeOn = new Set(tasks.map((t) => t.createdBy + '\u0000' + t.title + '\u0000' + localDay(new Date(t.createdAt))));

      for (const [key, task] of templates) {
        if (!this.shouldCreateToday(task.recur!, at, new Date(task.createdAt))) {
          skipped++;
          continue;
        }
        if (madeOn.has(key + '\u0000' + today)) {
          skipped++;
          continue;
        }

        // The copy is a plain task, so it is never treated as a template itself.
        const copy = {
          id: newId('task'),
          orgId: task.orgId,
          emoji: task.emoji,
          title: task.title,
          list: task.list,
          day: 'today' as TaskDay,
          priority: task.priority,
          recurring: false,
          recur: null,
          assignees: task.assignees,
          createdBy: task.createdBy,
          completed: false,
          completedAt: null,
          subtasks: [],
          comments: [],
          dueAt: null,
          createdAt: at.getTime(),
        };
        await ctx.db.tasks.insert(copy);
        madeOn.add(key + '\u0000' + today);

        await record(ctx, {
          orgId: task.orgId,
          type: 'task.created',
          entityId: copy.id,
          actorId: task.createdBy,
          undo: { delete: copy.id },
        });

        created++;
      }

      return { created, skipped };
    },

    /**
     * Check if a recurring task should be created on `at`. Weekly repeats on the weekday the
     * task was first made; monthly on the same date (or the month's last day if shorter).
     */
    shouldCreateToday(recur: string, at: Date = new Date(), firstMade?: Date): boolean {
      const dayOfWeek = at.getDay(); // 0=Sun
      const dayOfMonth = at.getDate();
      const anchor = firstMade ?? at;

      switch ((recur ?? '').toLowerCase()) {
        case 'daily':
          return true;
        case 'weekly':
          return dayOfWeek === anchor.getDay();
        case 'monthly': {
          const lastDay = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
          return dayOfMonth === Math.min(anchor.getDate(), lastDay);
        }
        case 'weekdays':
          return dayOfWeek >= 1 && dayOfWeek <= 5;
        case 'weekends':
          return dayOfWeek === 0 || dayOfWeek === 6;
        default:
          return false;
      }
    },

    /**
     * Get next run date for a recurring task.
     */
    getNextRun(recur: string): Date {
      const now = new Date();
      switch ((recur ?? '').toLowerCase()) {
        case 'daily':
          return new Date(now.getTime() + 24 * 60 * 60 * 1000);
        case 'weekly':
          return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        case 'monthly': {
          const next = new Date(now);
          next.setMonth(next.getMonth() + 1);
          next.setDate(1);
          return next;
        }
        case 'weekdays': {
          const next = new Date(now);
          do {
            next.setDate(next.getDate() + 1);
          } while (next.getDay() === 0 || next.getDay() === 6);
          return next;
        }
        case 'weekends': {
          const next = new Date(now);
          do {
            next.setDate(next.getDate() + 1);
          } while (next.getDay() !== 0 && next.getDay() !== 6);
          return next;
        }
        default:
          return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      }
    },

    /**
     * Format schedule for display.
     */
    formatSchedule(recur: string): string {
      switch ((recur ?? '').toLowerCase()) {
        case 'daily': return 'Every day';
        case 'weekly': return 'Every week';
        case 'monthly': return 'Every month';
        case 'weekdays': return 'Weekdays only';
        case 'weekends': return 'Weekends only';
        default: return recur;
      }
    },
  };
}

export type RecurringService = ReturnType<typeof makeRecurring>;
