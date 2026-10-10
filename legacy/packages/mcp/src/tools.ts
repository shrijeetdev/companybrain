// MCP tool registry — declarative descriptions + handlers that wrap core domain ops.
// Reads run directly. Writes route through core.autonomy.gate first; the gate returns
// the resolved level and the handler only mutates on 'auto'. 'ask' queues an approval
// for human review (the mutation is NOT auto-replayed — approving only clears the
// queue item; an admin who wants the action done re-runs it or sets the level to auto).
// 'off' refuses. Every result carries `gated` so the host can narrate the outcome.

import type { Core } from '@companybrain/core';
import type { AutonomyAction } from '@companybrain/types';

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

/**
 * Gate a write through autonomy. Returns { proceed: boolean, level }.
 * - auto: proceed === true (mutate).
 * - ask:   an approval is queued; proceed === false (do not mutate).
 * - off:   nothing queued; proceed === false.
 */
async function gateWrite(
  core: Core,
  action: AutonomyAction,
  orgId: string,
  title: string,
): Promise<{ proceed: boolean; level: 'auto' | 'ask' | 'off' }> {
  const level = await core.autonomy.gate(action, { orgId, title });
  return { proceed: level === 'auto', level };
}

export const TOOLS: Tool[] = [
  // ---------- READS (never gated) ----------
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

  // ---------- WRITES (gated) ----------
  {
    name: 'create_task',
    description: 'Create a new task. Gated by autonomy.createTasks (off|ask|auto).',
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
      const { proceed, level } = await gateWrite(core, 'createTasks', orgId, `Create task: ${args.title}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'createTasks') };
      const task = await core.tasks.create({
        orgId, actorId,
        title: args.title, day: args.day, priority: args.priority ?? null, list: args.list,
      });
      return { gated: 'auto', task };
    },
  },

  {
    name: 'create_loop',
    description: 'Capture a new open loop (something waiting on a person). Gated by autonomy.createTasks.',
    inputSchema: {
      type: 'object',
      properties: {
        title: str('Short summary of the loop.'),
        why: str('Why it matters / what is needed.'),
        side: { type: 'string', enum: ['yours', 'theirs'], description: 'Whose court the ball is in.' },
      },
      required: ['title', 'why', 'side'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'createTasks', orgId, `Create loop: ${args.title}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'createTasks') };
      const loop = await core.loops.capture({
        orgId, actorId,
        title: args.title, why: args.why, side: args.side, channel: 'manual',
      });
      return { gated: 'auto', loop };
    },
  },

  {
    name: 'complete_task',
    description: 'Mark a task complete by id. Gated by autonomy.manageRecords.',
    inputSchema: {
      type: 'object',
      properties: { id: str('Task id (e.g. task_abcd1234).') },
      required: ['id'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'manageRecords', orgId, `Complete task ${args.id}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'manageRecords') };
      const task = await core.tasks.complete(args.id, actorId);
      return { gated: 'auto', task };
    },
  },

  {
    name: 'assign_task',
    description: 'Assign a task to one or more users. Gated by autonomy.manageRecords.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('Task id.'),
        userIds: { type: 'array', items: { type: 'string' }, description: 'User ids to assign.' },
      },
      required: ['id', 'userIds'],
    },
    async handler(args, core, ctx) {
      const { orgId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'manageRecords', orgId, `Assign task ${args.id}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'manageRecords') };
      const task = await core.ctx.db.tasks.update(args.id, { assignees: args.userIds });
      return { gated: 'auto', task };
    },
  },

  {
    name: 'close_loop',
    description: 'Close a loop by id. Gated by autonomy.manageRecords.',
    inputSchema: {
      type: 'object',
      properties: { id: str('Loop id.') },
      required: ['id'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'manageRecords', orgId, `Close loop ${args.id}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'manageRecords') };
      const loop = await core.loops.close(args.id, actorId);
      return { gated: 'auto', loop };
    },
  },

  {
    name: 'create_lead',
    description: 'Create a new lead (enters the pipeline at "new"). Gated by autonomy.manageRecords.',
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
      const { proceed, level } = await gateWrite(core, 'manageRecords', orgId, `Create lead: ${args.name}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'manageRecords') };
      const lead = await core.leads.create({
        orgId, actorId, name: args.name, company: args.company, email: args.email, phone: args.phone,
      });
      return { gated: 'auto', lead };
    },
  },

  {
    name: 'advance_lead',
    description: 'Advance a lead to the next pipeline stage. Gated by autonomy.manageRecords.',
    inputSchema: {
      type: 'object',
      properties: { id: str('Lead id.') },
      required: ['id'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'manageRecords', orgId, `Advance lead ${args.id}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'manageRecords') };
      const lead = await core.leads.advance(args.id, actorId);
      return { gated: 'auto', lead };
    },
  },
];

function gateMessage(level: 'auto' | 'ask' | 'off', action: string): string {
  if (level === 'off') return `Blocked: autonomy.${action} is 'off'. Ask an admin to set it to 'ask' or 'auto'.`;
  // 'auto' never reaches here (the handler mutates on auto); treat ask (and any future level) as queued.
  return `Queued for human approval: autonomy.${action} is 'ask'. It will appear in the companybrain Auto tab; approving clears the queue (no auto-replay).`;
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}
