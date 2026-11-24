// Bulk operations service — perform batch actions on multiple entities.
// Supports loops, tasks, and leads with common operations.

import type { LeadStage, TaskDay } from '@companybrain/types';

/** The stage after this one, or null when the deal is already closed (won or lost). */
export function nextLeadStage(stage: LeadStage): LeadStage | null {
  const order: LeadStage[] = ['new', 'contacted', 'meeting', 'proposal', 'won'];
  const idx = order.indexOf(stage);
  if (idx < 0 || stage === 'won') return null;
  return order[idx + 1] ?? null;
}
import { type Context, record } from './context';

export interface BulkActionResult {
  succeeded: string[];
  failed: { id: string; error: string }[];
  total: number;
}

export function makeBulkOps(ctx: Context) {
  return {
    /**
     * Close multiple loops at once.
     */
    async closeLoops(ids: string[], actorId: string): Promise<BulkActionResult> {
      const result: BulkActionResult = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          const prev = await ctx.db.loops.get(id);
          if (!prev) throw new Error('loop not found');
          await ctx.db.loops.update(id, { status: 'closed' });
          await record(ctx, { orgId: prev.orgId, type: 'loop.closed', entityId: id, actorId, undo: { restoreStatus: prev.status } });
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },

    /**
     * Snooze multiple loops.
     */
    async snoozeLoops(ids: string[], hours: number, actorId: string): Promise<BulkActionResult> {
      const result: BulkActionResult = { succeeded: [], failed: [], total: ids.length };
      const untilAt = Date.now() + Math.max(1, hours) * 60 * 60 * 1000;
      for (const id of ids) {
        try {
          // Same as a single snooze: set the wake time and queue the reminder.
          const loop = await ctx.db.loops.update(id, { status: 'snoozed', dueAt: untilAt });
          await record(ctx, { orgId: loop.orgId, type: 'loop.snoozed', entityId: id, actorId });
          await ctx.queue.enqueue('sendReminder', { loopId: id, orgId: loop.orgId }, { delayMs: Math.max(0, untilAt - Date.now()) });
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },

    /**
     * Move multiple tasks to a different day.
     */
    async moveTasks(ids: string[], day: TaskDay, actorId: string): Promise<BulkActionResult> {
      const result: BulkActionResult = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          const prev = await ctx.db.tasks.get(id);
          if (!prev) throw new Error('task not found');
          await ctx.db.tasks.update(id, { day });
          await record(ctx, { orgId: prev.orgId, type: 'task.moved', entityId: id, actorId, undo: { restoreDay: prev.day } });
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },

    /**
     * Complete multiple tasks.
     */
    async completeTasks(ids: string[], actorId: string): Promise<BulkActionResult> {
      const result: BulkActionResult = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          const task = await ctx.db.tasks.get(id);
          if (!task) throw new Error('task not found');
          await ctx.db.tasks.update(id, { completed: true, completedAt: Date.now() });
          await record(ctx, { orgId: task.orgId, type: 'task.completed', entityId: id, actorId, undo: { restoreCompleted: task.completed ?? false, restoreCompletedAt: task.completedAt ?? null } });
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },

    /**
     * Delete multiple tasks.
     */
    async deleteTasks(ids: string[], actorId: string): Promise<BulkActionResult> {
      const result: BulkActionResult = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          const task = await ctx.db.tasks.get(id);
          if (!task) throw new Error('task not found');
          await ctx.db.tasks.remove(id);
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },

    /**
     * Advance multiple leads to next stage.
     */
    async advanceLeads(ids: string[], actorId: string): Promise<BulkActionResult> {
      const result: BulkActionResult = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          const lead = await ctx.db.leads.get(id);
          if (!lead) throw new Error('lead not found');
          const nextStage = nextLeadStage(lead.stage);
          if (!nextStage) throw new Error(`lead is already ${lead.stage}`);
          await ctx.db.leads.update(id, { stage: nextStage });
          await record(ctx, { orgId: lead.orgId, type: 'lead.advanced', entityId: id, actorId, undo: { restoreStage: lead.stage } });
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },

    /**
     * Assign multiple entities to a user.
     */
    async assignMany(entityType: 'loop' | 'task' | 'lead', ids: string[], userIds: string[], actorId: string): Promise<BulkActionResult> {
      const result: BulkActionResult = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          if (entityType === 'loop') {
            await ctx.db.loops.update(id, { assignedTo: userIds });
          } else if (entityType === 'task') {
            await ctx.db.tasks.update(id, { assignees: userIds });
          } else if (entityType === 'lead') {
            await ctx.db.leads.update(id, { assignedTo: userIds });
          }
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },

    /**
     * Delete multiple entities.
     */
    async deleteMany(entityType: 'loop' | 'task' | 'lead', ids: string[], actorId: string): Promise<BulkActionResult> {
      const result: BulkActionResult = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          if (entityType === 'loop') {
            await ctx.db.loops.remove(id);
          } else if (entityType === 'task') {
            await ctx.db.tasks.remove(id);
          } else if (entityType === 'lead') {
            await ctx.db.leads.remove(id);
          }
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },
  };
}

export type BulkOpsService = ReturnType<typeof makeBulkOps>;
