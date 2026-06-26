import type { Task, TaskDay, Priority } from '@companybrain/types';
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
      const task = await ctx.db.tasks.update(id, { day: 'today' });
      await record(ctx, { orgId: task.orgId, type: 'task.completed', entityId: id, actorId });
      return task;
    },
  };
}

export type TaskService = ReturnType<typeof makeTasks>;
