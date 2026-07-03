// AI Services — smart suggestions, auto-assignment, pattern learning.

import { type Context, record } from './context';

export interface Suggestion {
  id: string;
  type: 'assign' | 'snooze' | 'close' | 'follow_up' | 'priority';
  entityType: 'loop' | 'task' | 'lead';
  entityId: string;
  reason: string;
  confidence: number;
  createdAt: number;
}

export function makeAi(ctx: Context) {
  const suggestions = new Map<string, Suggestion>();

  /**
   * Get smart suggestions for an entity based on patterns.
   */
  async function getSuggestions(entityType: 'loop' | 'task' | 'lead', entityId: string): Promise<Suggestion[]> {
    const results: Suggestion[] = [];

    // Pattern: frequently reassigned → suggest assignee
    if (entityType === 'task') {
      const task = await ctx.db.tasks.get(entityId);
      if (task) {
        // Check if task is overdue
        if (task.dueAt && task.dueAt < Date.now()) {
          results.push({
            id: `sug_${Date.now()}_overdue`,
            type: 'priority',
            entityType,
            entityId,
            reason: 'Task is overdue — consider bumping priority',
            confidence: 0.9,
            createdAt: Date.now(),
          });
        }
        // Check if all subtasks done but not marked complete
        const subtasks = task.subtasks ?? [];
        if (subtasks.length > 0 && subtasks.every(s => s.done)) {
          results.push({
            id: `sug_${Date.now()}_done`,
            type: 'close',
            entityType,
            entityId,
            reason: 'All subtasks complete — ready to close',
            confidence: 0.95,
            createdAt: Date.now(),
          });
        }
      }
    }

    if (entityType === 'loop') {
      const loop = await ctx.db.loops.get(entityId);
      if (loop) {
        const age = Date.now() - loop.createdAt;
        const threeDays = 3 * 24 * 60 * 60 * 1000;
        if (loop.status === 'open' && age > threeDays) {
          results.push({
            id: `sug_${Date.now()}_stale`,
            type: 'follow_up',
            entityType,
            entityId,
            reason: 'Loop open for 3+ days — consider following up',
            confidence: 0.7,
            createdAt: Date.now(),
          });
        }
      }
    }

    // Store suggestions
    for (const s of results) {
      suggestions.set(s.id, s);
    }

    return results;
  }

  /**
   * Auto-assign a task based on org patterns.
   */
  async function autoAssign(taskId: string): Promise<string | null> {
    const task = await ctx.db.tasks.get(taskId);
    if (!task || task.assignees?.length) return null;

    // Look at recent completed tasks to find most active assignee
    const allTasks = await ctx.db.tasks.list(task.orgId);
    const recentTasks = allTasks
      .filter(t => t.assignees?.length && t.subtasks?.some(s => s.done))
      .slice(-20);

    const counts = new Map<string, number>();
    for (const t of recentTasks) {
      for (const a of t.assignees ?? []) {
        counts.set(a, (counts.get(a) ?? 0) + 1);
      }
    }

    let best: string | null = null;
    let bestCount = 0;
    for (const [assignee, count] of counts) {
      if (count > bestCount) {
        best = assignee;
        bestCount = count;
      }
    }

    if (best) {
      await ctx.db.tasks.update(taskId, { assignees: [best] });
    }
    return best;
  }

  /**
   * Get pattern summary for an org.
   */
  async function getPatterns(orgId: string) {
    const tasks = await ctx.db.tasks.list(orgId);
    const loops = await ctx.db.loops.list(orgId);

    const assigneeCounts = new Map<string, number>();
    for (const t of tasks) {
      for (const a of t.assignees ?? []) {
        assigneeCounts.set(a, (assigneeCounts.get(a) ?? 0) + 1);
      }
    }

    const channelCounts = new Map<string, number>();
    for (const l of loops) {
      channelCounts.set(l.channel, (channelCounts.get(l.channel) ?? 0) + 1);
    }

    return {
      topAssignees: [...assigneeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      topChannels: [...channelCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      taskCompletionRate: tasks.length > 0
        ? tasks.filter(t => t.subtasks?.some(s => s.done)).length / tasks.length
        : 0,
      totalLoops: loops.length,
      totalTasks: tasks.length,
    };
  }

  /**
   * Dismiss a suggestion.
   */
  async function dismiss(suggestionId: string): Promise<void> {
    suggestions.delete(suggestionId);
  }

  return { getSuggestions, autoAssign, getPatterns, dismiss };
}

export type AiService = ReturnType<typeof makeAi>;
