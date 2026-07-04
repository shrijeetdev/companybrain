// MCP tool registry — declarative descriptions + handlers that wrap core domain ops.
// Each tool is a JSON Schema for the args plus a handler that runs against a Core
// instance. The MCP server (server.ts) lists these for `tools/list` and dispatches
// `tools/call` to the matching handler. Handlers never throw — they return a plain
// object so the server can serialize it straight onto the wire.

import type { Core } from '@companybrain/core';

/** Identity used when a tool mutates state. Defaults to the local single-user org. */
export interface ToolContext {
  orgId?: string;
  actorId?: string;
}

export const DEFAULT_ORG_ID = 'org_local';
export const DEFAULT_ACTOR_ID = 'user_local';

export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: any, core: Core, ctx: ToolContext) => Promise<any>;
}

/** Resolve the acting org + user, preferring injected context, then core auth, then local defaults. */
async function identity(core: Core, ctx: ToolContext): Promise<{ orgId: string; actorId: string }> {
  if (ctx.orgId && ctx.actorId) return { orgId: ctx.orgId, actorId: ctx.actorId };
  try {
    const principal = await core.ctx.auth.current();
    return {
      orgId: ctx.orgId ?? principal.orgId ?? DEFAULT_ORG_ID,
      actorId: ctx.actorId ?? principal.userId ?? DEFAULT_ACTOR_ID,
    };
  } catch {
    return { orgId: ctx.orgId ?? DEFAULT_ORG_ID, actorId: ctx.actorId ?? DEFAULT_ACTOR_ID };
  }
}

const str = (description: string) => ({ type: 'string', description });

export const TOOLS: Tool[] = [
  {
    name: 'list_tasks',
    description:
      'List tasks for the org. Optionally filter by day (today|tomorrow|upcoming) and/or priority (low|med|high).',
    inputSchema: {
      type: 'object',
      properties: {
        day: { type: 'string', enum: ['today', 'tomorrow', 'upcoming'], description: 'Filter by board day.' },
        priority: { type: 'string', enum: ['low', 'med', 'high'], description: 'Filter by priority.' },
      },
    },
    async handler(args, core, ctx) {
      const { orgId } = await identity(core, ctx);
      let tasks = await core.tasks.list(orgId);
      if (args?.day) tasks = tasks.filter((t) => t.day === args.day);
      if (args?.priority) tasks = tasks.filter((t) => t.priority === args.priority);
      return { count: tasks.length, tasks };
    },
  },

  {
    name: 'create_task',
    description: 'Create a new task. Defaults to today / Inbox / unassigned-to-actor.',
    inputSchema: {
      type: 'object',
      properties: {
        title: str('Task title.'),
        day: { type: 'string', enum: ['today', 'tomorrow', 'upcoming'], description: 'Board day. Default today.' },
        priority: { type: 'string', enum: ['low', 'med', 'high'], description: 'Priority. Default none.' },
        list: str('List/board column name. Default "Inbox".'),
      },
      required: ['title'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const task = await core.tasks.create({
        orgId,
        actorId,
        title: args.title,
        day: args.day,
        priority: args.priority ?? null,
        list: args.list,
      });
      return { task };
    },
  },

  {
    name: 'complete_task',
    description: 'Mark a task complete by id.',
    inputSchema: {
      type: 'object',
      properties: { id: str('Task id (e.g. task_abcd1234).') },
      required: ['id'],
    },
    async handler(args, core, ctx) {
      const { actorId } = await identity(core, ctx);
      const task = await core.tasks.complete(args.id, actorId);
      return { task };
    },
  },

  {
    name: 'assign_task',
    description: 'Assign a task to one or more users (replaces its current assignees).',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('Task id.'),
        userIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'User ids to assign.',
        },
      },
      required: ['id', 'userIds'],
    },
    async handler(args, core) {
      const task = await core.ctx.db.tasks.update(args.id, { assignees: args.userIds });
      return { task };
    },
  },

  {
    name: 'list_loops',
    description: 'List open loops (things waiting on a person — "their court" or "your court").',
    inputSchema: {
      type: 'object',
      properties: {
        side: { type: 'string', enum: ['yours', 'theirs'], description: 'Filter by whose court the ball is in.' },
      },
    },
    async handler(args, core, ctx) {
      const { orgId } = await identity(core, ctx);
      const loops = await core.loops.list(orgId, args?.side);
      const open = loops.filter((l) => l.status !== 'closed');
      return { count: open.length, loops: open };
    },
  },

  {
    name: 'close_loop',
    description: 'Close a loop by id.',
    inputSchema: {
      type: 'object',
      properties: { id: str('Loop id.') },
      required: ['id'],
    },
    async handler(args, core, ctx) {
      const { actorId } = await identity(core, ctx);
      const loop = await core.loops.close(args.id, actorId);
      return { loop };
    },
  },

  {
    name: 'search',
    description: 'Search across tasks, loops, and leads by case-insensitive title/name substring.',
    inputSchema: {
      type: 'object',
      properties: { query: str('Substring to search for.') },
      required: ['query'],
    },
    async handler(args, core, ctx) {
      const { orgId } = await identity(core, ctx);
      const q = String(args.query ?? '').toLowerCase();
      if (!q) return { tasks: [], loops: [], leads: [] };
      const [tasks, loops, leads] = await Promise.all([
        core.tasks.list(orgId),
        core.loops.list(orgId),
        core.leads.list(orgId),
      ]);
      return {
        tasks: tasks.filter((t) => t.title.toLowerCase().includes(q)),
        loops: loops.filter((l) => l.title.toLowerCase().includes(q)),
        leads: leads.filter((l) => l.name.toLowerCase().includes(q) || l.company.toLowerCase().includes(q)),
      };
    },
  },

  {
    name: 'get_dashboard',
    description: 'Return a KPI summary: open loops, tasks by day, leads by stage.',
    inputSchema: { type: 'object', properties: {} },
    async handler(_args, core, ctx) {
      const { orgId } = await identity(core, ctx);
      const [loops, tasks, leads] = await Promise.all([
        core.loops.list(orgId),
        core.tasks.list(orgId),
        core.leads.list(orgId),
      ]);
      const openLoops = loops.filter((l) => l.status !== 'closed').length;
      const tasksByDay = {
        today: tasks.filter((t) => t.day === 'today').length,
        tomorrow: tasks.filter((t) => t.day === 'tomorrow').length,
        upcoming: tasks.filter((t) => t.day === 'upcoming').length,
      };
      const leadsByStage = leads.reduce<Record<string, number>>((acc, l) => {
        acc[l.stage] = (acc[l.stage] ?? 0) + 1;
        return acc;
      }, {});
      return { openLoops, totalTasks: tasks.length, tasksByDay, totalLeads: leads.length, leadsByStage };
    },
  },

  {
    name: 'create_lead',
    description: 'Create a new lead (enters the pipeline at "new").',
    inputSchema: {
      type: 'object',
      properties: {
        name: str('Contact name.'),
        company: str('Company name.'),
        email: str('Contact email.'),
        phone: str('Contact phone.'),
      },
      required: ['name'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const lead = await core.leads.create({
        orgId,
        actorId,
        name: args.name,
        company: args.company,
        email: args.email,
        phone: args.phone,
      });
      return { lead };
    },
  },

  {
    name: 'advance_lead',
    description: 'Advance a lead to the next pipeline stage (new → contacted → meeting → proposal → won).',
    inputSchema: {
      type: 'object',
      properties: { id: str('Lead id.') },
      required: ['id'],
    },
    async handler(args, core, ctx) {
      const { actorId } = await identity(core, ctx);
      const lead = await core.leads.advance(args.id, actorId);
      return { lead };
    },
  },
];

/** Find a tool by name (used by the server dispatcher). */
export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}
