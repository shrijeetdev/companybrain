// Time tracking service — tracks time spent on tasks.
// Provides start/stop/pause functionality with duration calculation.

import { type Context, newId, now } from './context';

export interface TimeEntry {
  id: string;
  orgId: string;
  taskId: string;
  userId: string;
  startedAt: number;
  endedAt?: number;
  duration?: number; // in seconds
  note?: string;
}

export interface StartTimeInput {
  orgId: string;
  taskId: string;
  userId: string;
  note?: string;
}

export interface UpdateTimeEntryInput {
  note?: string;
  endedAt?: number;
}

export function makeTimeTracking(ctx: Context) {
  return {
    /**
     * Start tracking time on a task.
     * If there's already an active entry for this task, stop it first.
     */
    async start(input: StartTimeInput): Promise<TimeEntry> {
      // Stop any existing active entry for this task
      const active = await this.getActive(input.taskId);
      if (active) {
        await this.stop(active.id);
      }

      const entry: TimeEntry = {
        id: newId('time'),
        orgId: input.orgId,
        taskId: input.taskId,
        userId: input.userId,
        startedAt: now(),
        note: input.note,
      };

      await ctx.db.timeEntries.insert(entry);
      return entry;
    },

    /**
     * Stop tracking time on a task.
     */
    async stop(entryId: string): Promise<TimeEntry> {
      const entry = await ctx.db.timeEntries.get(entryId);
      if (!entry) throw new Error(`time entry ${entryId} not found`);
      if (entry.endedAt) throw new Error(`time entry ${entryId} already stopped`);

      const endedAt = now();
      const duration = Math.floor((endedAt - entry.startedAt) / 1000);

      return ctx.db.timeEntries.update(entryId, {
        endedAt,
        duration,
      });
    },

    /**
     * Get active (running) time entry for a task.
     */
    async getActive(taskId: string): Promise<TimeEntry | null> {
      const entries = await ctx.db.timeEntries.listByTask(taskId);
      return entries.find(e => !e.endedAt) ?? null;
    },

    /**
     * Get all time entries for a task.
     */
    async listByTask(taskId: string): Promise<TimeEntry[]> {
      return ctx.db.timeEntries.listByTask(taskId);
    },

    /**
     * Get all time entries for a user.
     */
    async listByUser(userId: string, orgId: string): Promise<TimeEntry[]> {
      return ctx.db.timeEntries.listByUser(userId, orgId);
    },

    /**
     * Get total time spent on a task (in seconds).
     */
    async getTotalTime(taskId: string): Promise<number> {
      const entries = await ctx.db.timeEntries.listByTask(taskId);
      return entries.reduce((total, e) => total + (e.duration ?? 0), 0);
    },

    /**
     * Get total time for a user today.
     */
    async getTodayTime(userId: string, orgId: string): Promise<number> {
      const entries = await ctx.db.timeEntries.listByUser(userId, orgId);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayMs = todayStart.getTime();

      return entries
        .filter(e => e.startedAt >= todayMs)
        .reduce((total, e) => total + (e.duration ?? 0), 0);
    },

    /**
     * Update a time entry (edit note, adjust end time).
     */
    async update(entryId: string, patch: UpdateTimeEntryInput): Promise<TimeEntry> {
      const entry = await ctx.db.timeEntries.get(entryId);
      if (!entry) throw new Error(`time entry ${entryId} not found`);

      const updates: Partial<TimeEntry> = {};
      if (patch.note !== undefined) updates.note = patch.note;
      if (patch.endedAt !== undefined) {
        updates.endedAt = patch.endedAt;
        updates.duration = Math.floor((patch.endedAt - entry.startedAt) / 1000);
      }

      return ctx.db.timeEntries.update(entryId, updates);
    },

    /**
     * Delete a time entry.
     */
    async delete(entryId: string): Promise<void> {
      await ctx.db.timeEntries.delete(entryId);
    },

    /**
     * Format duration for display.
     */
    formatDuration(seconds: number): string {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    },
  };
}

export type TimeTrackingService = ReturnType<typeof makeTimeTracking>;
