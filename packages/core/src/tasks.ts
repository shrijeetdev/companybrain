import type { Task, TaskDay, Priority, AiActionType, AiTaskConfig } from '@companybrain/types';
import { type Context, newId, now, record } from './context';

export interface CreateTaskInput {
  orgId: string;
  actorId: string;
  emoji?: string;
  title: string;
  list?: string;
  day?: TaskDay;
  priority?: Priority;
  recur?: Task['recur'];
  assignees?: string[];
  dueAt?: number | null;
}

export function makeTasks(ctx: Context) {
  return {
    list(orgId: string): Promise<Task[]> {
      return ctx.db.tasks.list(orgId);
    },

    async create(input: CreateTaskInput): Promise<Task> {
      const task: Task = {
        id: newId('task'),
        orgId: input.orgId,
        emoji: input.emoji ?? '✅',
        title: input.title,
        list: input.list ?? 'Inbox',
        day: input.day ?? 'today',
        priority: input.priority ?? null,
        recurring: Boolean(input.recur),
        recur: input.recur ?? null,
        assignees: input.assignees ?? [input.actorId],
        createdBy: input.actorId,
        completed: false,
        completedAt: null,
        dueAt: input.dueAt ?? null,
        createdAt: now(),
      };
      await ctx.db.tasks.insert(task);
      await record(ctx, { orgId: task.orgId, type: 'task.created', entityId: task.id, actorId: input.actorId, undo: { delete: task.id } });
      return task;
    },

    async move(id: string, day: TaskDay, actorId: string): Promise<Task> {
      const prev = await ctx.db.tasks.get(id);
      if (!prev) throw new Error(`task ${id} not found`);
      const task = await ctx.db.tasks.update(id, { day });
      await record(ctx, { orgId: task.orgId, type: 'task.moved', entityId: id, actorId, undo: { restoreDay: prev.day } });
      return task;
    },

    async complete(id: string, actorId: string): Promise<Task> {
      const prev = await ctx.db.tasks.get(id);
      if (!prev) throw new Error(`task ${id} not found`);
      const task = await ctx.db.tasks.update(id, { completed: true, completedAt: now() });
      await record(ctx, { orgId: task.orgId, type: 'task.completed', entityId: id, actorId, undo: { restoreCompleted: prev.completed ?? false, restoreCompletedAt: prev.completedAt ?? null } });
      return task;
    },

    /**
     * Mark a task AI-executable (or clear it). Setting an action queues the task and
     * enqueues the runAiTask job; the worker holds the API key and credentials, so the
     * actual execution happens there, not here.
     */
    async setAiAction(id: string, action: AiActionType | null, config?: AiTaskConfig): Promise<Task> {
      const prev = await ctx.db.tasks.get(id);
      if (!prev) throw new Error(`task ${id} not found`);
      const patch: Partial<Task> = action
        ? { aiAction: action, aiStatus: 'queued', aiConfig: config, aiRunId: undefined }
        : { aiAction: null, aiStatus: undefined, aiRunId: undefined };
      const task = await ctx.db.tasks.update(id, patch);
      if (action) {
        await ctx.queue.enqueue('runAiTask', { taskId: id });
        await record(ctx, { orgId: task.orgId, type: 'ai.task.queued', entityId: id, actorId: prev.createdBy });
      }
      return task;
    },

    /**
     * Approve the draft an `ask`-gated run produced, letting its action finally run.
     * Re-enqueued rather than called directly because the OpenRouter key and the
     * WordPress credentials live in the worker, which is the composition root.
     */
    async approveAiRun(runId: string): Promise<void> {
      const run = await ctx.db.aiRuns.get(runId);
      if (!run) throw new Error(`run ${runId} not found`);
      await ctx.queue.enqueue('runAiTask', { taskId: run.taskId, approveRunId: runId });
    },
  };
}

export type TaskService = ReturnType<typeof makeTasks>;
