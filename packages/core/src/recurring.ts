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

export function makeRecurring(ctx: Context) {
  return {
    /**
     * Process all recurring tasks and create new instances where needed.
     * Should be called daily (e.g., by a cron job or worker).
     */
    async processDaily(orgId: string): Promise<{ created: number; skipped: number }> {
      let created = 0;
      let skipped = 0;

      // Get all tasks that are marked as recurring
      const tasks = await ctx.db.tasks.list(orgId);
      const recurringTasks = tasks.filter(t => t.recurring && t.recur);

      for (const task of recurringTasks) {
        const shouldCreate = this.shouldCreateToday(task.recur!);
        if (!shouldCreate) {
          skipped++;
          continue;
        }

        // Check if we already created this task today
        const today = new Date().toISOString().split('T')[0];
        const existingToday = tasks.find(t =>
          t.title === task.title &&
          t.createdBy === task.createdBy &&
          new Date(t.createdAt).toISOString().split('T')[0] === today
        );

        if (existingToday) {
          skipped++;
          continue;
        }

        // Create new instance of the recurring task
        await ctx.db.tasks.insert({
          id: newId('task'),
          orgId: task.orgId,
          emoji: task.emoji,
          title: task.title,
          list: task.list,
          day: 'today' as TaskDay,
          priority: task.priority,
          recurring: true,
          recur: task.recur,
          assignees: task.assignees,
          createdBy: task.createdBy,
          subtasks: [],
          comments: [],
          dueAt: null,
          createdAt: now(),
        });

        await record(ctx, {
          orgId: task.orgId,
          type: 'task.created',
          entityId: task.id,
          actorId: task.createdBy,
        });

        created++;
      }

      return { created, skipped };
    },

    /**
     * Check if a recurring task should be created today.
     */
    shouldCreateToday(recur: string): boolean {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=Sun
      const dayOfMonth = today.getDate();

      switch (recur) {
        case 'Daily':
          return true;
        case 'Weekly':
          return true; // Base task is weekly, check on creation day
        case 'Monthly':
          return dayOfMonth === 1; // Create on 1st of month
        case 'Weekdays':
          return dayOfWeek >= 1 && dayOfWeek <= 5;
        case 'Weekends':
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
      switch (recur) {
        case 'Daily':
          return new Date(now.getTime() + 24 * 60 * 60 * 1000);
        case 'Weekly':
          return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        case 'Monthly': {
          const next = new Date(now);
          next.setMonth(next.getMonth() + 1);
          next.setDate(1);
          return next;
        }
        case 'Weekdays': {
          const next = new Date(now);
          do {
            next.setDate(next.getDate() + 1);
          } while (next.getDay() === 0 || next.getDay() === 6);
          return next;
        }
        case 'Weekends': {
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
      switch (recur) {
        case 'Daily': return 'Every day';
        case 'Weekly': return 'Every week';
        case 'Monthly': return 'Every month';
        case 'Weekdays': return 'Weekdays only';
        case 'Weekends': return 'Weekends only';
        default: return recur;
      }
    },
  };
}

export type RecurringService = ReturnType<typeof makeRecurring>;
