// Subtasks service — manage subtasks and lightweight dependencies.
// Works with the existing Task.subtasks shape: { id, title, done }.

import { type Context, newId, record } from './context';

/** Lightweight dependency record stored per org for task-level blocking. */
export interface TaskDependency {
  id: string;
  orgId: string;
  taskId: string;
  /** IDs of tasks that must complete before this task can start */
  blockedBy: string[];
}

export function makeSubtasks(ctx: Context) {
  return {
    /**
     * Add a subtask to a task (appends to Task.subtasks array).
     */
    async add(taskId: string, title: string): Promise<{ id: string; title: string; done: boolean }> {
      const task = await ctx.db.tasks.get(taskId);
      if (!task) throw new Error(`task ${taskId} not found`);

      const subtask = { id: newId('sub'), title, done: false };
      const subtasks = [...(task.subtasks ?? []), subtask];
      await ctx.db.tasks.update(taskId, { subtasks });
      return subtask;
    },

    /**
     * Complete a subtask.
     */
    async complete(taskId: string, subtaskId: string): Promise<void> {
      const task = await ctx.db.tasks.get(taskId);
      if (!task) throw new Error(`task ${taskId} not found`);

      const subtasks = (task.subtasks ?? []).map(s =>
        s.id === subtaskId ? { ...s, done: true } : s
      );
      await ctx.db.tasks.update(taskId, { subtasks });

      // Check if all subtasks are complete
      const allDone = subtasks.every(s => s.done);
      if (allDone && subtasks.length > 0) {
        await record(ctx, {
          orgId: task.orgId,
          type: 'task.completed',
          entityId: taskId,
          actorId: 'system',
        });
      }
    },

    /**
     * Remove a subtask.
     */
    async remove(taskId: string, subtaskId: string): Promise<void> {
      const task = await ctx.db.tasks.get(taskId);
      if (!task) throw new Error(`task ${taskId} not found`);

      const subtasks = (task.subtasks ?? []).filter(s => s.id !== subtaskId);
      await ctx.db.tasks.update(taskId, { subtasks });
    },

    /**
     * Toggle a subtask done state.
     */
    async toggle(taskId: string, subtaskId: string): Promise<void> {
      const task = await ctx.db.tasks.get(taskId);
      if (!task) throw new Error(`task ${taskId} not found`);

      const subtasks = (task.subtasks ?? []).map(s =>
        s.id === subtaskId ? { ...s, done: !s.done } : s
      );
      await ctx.db.tasks.update(taskId, { subtasks });
    },

    /**
     * List subtasks for a task.
     */
    async list(taskId: string): Promise<{ id: string; title: string; done: boolean }[]> {
      const task = await ctx.db.tasks.get(taskId);
      return task?.subtasks ?? [];
    },

    /**
     * Get progress percentage.
     */
    getProgress(subtasks: { done: boolean }[]): number {
      if (subtasks.length === 0) return 0;
      const done = subtasks.filter(s => s.done).length;
      return Math.round((done / subtasks.length) * 100);
    },

  };
}

export type SubtasksService = ReturnType<typeof makeSubtasks>;
