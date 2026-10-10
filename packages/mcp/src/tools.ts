// MCP tool definitions. Every tool acts as the authenticated member, goes through
// AppServices (core services enforce org scoping, roles and key scopes), and returns concise
// human-readable text plus `structuredContent` JSON.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type {
  Actor, AppServices, CreateTaskInput, Member, RewardEvent, TaskActivity, TaskQuery, TaskView, UpdateTaskInput,
} from '@companybrain/types';
import { CallContext, type CompactTask } from './context.js';
import { READ_ONLY_MESSAGE, ToolInputError, errorResult, hasWriteScope, toToolError } from './errors.js';
import { addDays, humanDate, isoLocal, relativeAgo, startOfDay } from './dates.js';

export interface ToolDeps {
  services: AppServices;
  /** Returns the current actor (stdio re-resolves the key per call; HTTP is fixed per request). */
  getActor: () => Promise<Actor>;
  clock: () => number;
}

interface ToolOutput { text: string; data: Record<string, unknown> }

const STATUS = ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'] as const;
const PRIORITY = ['urgent', 'high', 'medium', 'low', 'none'] as const;
const OPEN = new Set<TaskView['status']>(['todo', 'in_progress', 'blocked', 'review']);
const HOUR = 3_600_000;

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

// ─── Shared schema pieces ────────────────────────────────────────────────────

const taskId = z.string().min(1).describe('Task id, e.g. "task_x7f3k2ab" (from get_my_work, list_tasks or search).');
const assigneeRefs = z.array(z.string().min(1)).max(20);
const reminders = z.array(z.number().int().min(0).max(60 * 24 * 60)).max(10)
  .describe('Reminder offsets in minutes before due, e.g. [1440, 60, 0] = a day before, an hour before, at due time. Omit for the org default.');
const tags = z.array(z.string().min(1).max(40)).max(20).describe('Tags without "#", e.g. ["sales", "q4"].');
const dueSchema = z.string().min(1).max(100);

// ─── Registration ────────────────────────────────────────────────────────────

export function registerTools(server: McpServer, deps: ToolDeps): void {
  const { services } = deps;

  type Shape = Record<string, z.ZodType>;
  function tool<S extends Shape>(
    name: string,
    cfg: { title: string; description: string; input: S; write: boolean; annotations?: ToolAnnotations },
    run: (args: z.infer<z.ZodObject<S>>, ctx: CallContext) => Promise<ToolOutput>,
  ): void {
    server.registerTool(
      name,
      {
        title: cfg.title,
        description: cfg.description,
        inputSchema: cfg.input,
        annotations: { title: cfg.title, ...(cfg.annotations ?? (cfg.write ? WRITE : READ)) },
      },
      // The SDK has already validated args against `input`.
      (async (args: z.infer<z.ZodObject<S>>): Promise<CallToolResult> => {
        let actor: Actor;
        try {
          actor = await deps.getActor();
        } catch (err) {
          return errorResult(
            `Not authenticated: ${err instanceof Error ? err.message : String(err)}. The API key may have been revoked or expired.`,
            { code: 'unauthorized' },
          );
        }
        if (cfg.write && !hasWriteScope(actor)) return errorResult(READ_ONLY_MESSAGE, { code: 'forbidden', reason: 'read_only_key' });
        try {
          const ctx = new CallContext(services, actor, deps.clock);
          const out = await run(args, ctx);
          return { content: [{ type: 'text', text: out.text }], structuredContent: out.data };
        } catch (err) {
          return toToolError(err, actor);
        }
      }) as never,
    );
  }

  // ── get_my_work ────────────────────────────────────────────────────────────
  tool('get_my_work', {
    title: 'Get my work (start here)',
    description:
      'CALL THIS FIRST in every session — it restores your memory. Returns the open tasks assigned to you, grouped as ' +
      'overdue / in progress / today / upcoming (next 7 days) / blocked (plus a count of later or undated ones), the comments and ' +
      'hand-off notes others left on those tasks in the last 48 hours, your own last progress note on each active task, ' +
      'and your unread notification count. No arguments needed. Example: get_my_work {}',
    input: {
      upcomingDays: z.number().int().min(1).max(30).optional().describe('How many days ahead count as "upcoming" (default 7).'),
    },
    write: false,
  }, async (args, ctx) => {
    const { services: s, actor, now } = ctx;
    const tz = await ctx.timezone();
    const me = await ctx.me();
    const days = args.upcomingDays ?? 7;
    const all = (await s.tasks.list(actor, { assigneeId: 'me', limit: 500 })).filter((t) => OPEN.has(t.status));

    const groups = { overdue: [] as TaskView[], inProgress: [] as TaskView[], today: [] as TaskView[], upcoming: [] as TaskView[], blocked: [] as TaskView[], later: [] as TaskView[] };
    const horizon = addDays(startOfDay(now, tz), days + 1);
    for (const t of all) {
      if (t.isOverdue) groups.overdue.push(t);
      else if (t.status === 'blocked') groups.blocked.push(t);
      else if (t.status === 'in_progress' || t.status === 'review') groups.inProgress.push(t);
      else if (t.isDueToday) groups.today.push(t);
      else if (t.dueAt != null && t.dueAt < horizon) groups.upcoming.push(t);
      else groups.later.push(t);
    }
    const byDue = (a: TaskView, b: TaskView) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.order - b.order;
    for (const g of Object.values(groups)) g.sort(byDue);

    // Notes: fetch activity for tasks touched in the last 48 h and for every active (in progress/blocked/overdue) task.
    const since = now - 48 * HOUR;
    const active = new Set([...groups.overdue, ...groups.inProgress, ...groups.blocked].map((t) => t.id));
    const toScan = all.filter((t) => t.lastActivityAt >= since || active.has(t.id)).slice(0, 40);
    const scanned = await Promise.all(toScan.map(async (t) => ({ t, acts: await s.tasks.activity(actor, t.id).catch(() => [] as TaskActivity[]) })));
    const recentNotes: { task: { id: string; title: string }; activity: TaskActivity }[] = [];
    const myLastNote = new Map<string, TaskActivity>();
    for (const { t, acts } of scanned) {
      for (const a of acts) {
        if (a.kind !== 'comment' && a.kind !== 'handoff') continue;
        if (a.actorId === me.id) {
          const prev = myLastNote.get(t.id);
          if (!prev || a.at > prev.at) myLastNote.set(t.id, a);
        } else if (a.at >= since) {
          recentNotes.push({ task: { id: t.id, title: t.title }, activity: a });
        }
      }
    }
    recentNotes.sort((a, b) => b.activity.at - a.activity.at);
    const unread = await s.notifications.unreadCount(actor).catch(() => 0);

    const compact = async (ts: TaskView[]) => Promise.all(ts.map(async (t) => {
      const c = await ctx.compactTask(t);
      const note = myLastNote.get(t.id);
      return note ? { ...c, myLastNote: { text: note.text, kind: note.kind, at: isoLocal(note.at, tz) } } : c;
    }));
    const data = {
      member: { id: me.id, name: me.name, kind: me.kind, role: me.role, timezone: tz },
      now: isoLocal(now, tz),
      overdue: await compact(groups.overdue),
      inProgress: await compact(groups.inProgress),
      today: await compact(groups.today),
      upcoming: await compact(groups.upcoming),
      blocked: await compact(groups.blocked),
      laterCount: groups.later.length,
      later: await compact(groups.later.slice(0, 10)),
      recentNotes: await Promise.all(recentNotes.slice(0, 30).map(async (n) => ({ task: n.task, ...(await ctx.activityEntry(n.activity)) }))),
      unreadNotifications: unread,
    };

    const lines: string[] = [`${me.name} — your work as of ${humanDate(now, tz, now)} (${tz}).`];
    const section = async (label: string, ts: (CompactTask & { myLastNote?: { text: string; at: string } })[]) => {
      if (!ts.length) return;
      lines.push('', `${label} (${ts.length})`);
      for (const t of ts) {
        lines.push(await ctx.taskLine(t));
        if (t.myLastNote) lines.push(`    your last note (${t.myLastNote.at.slice(0, 16).replace('T', ' ')}): ${clip(t.myLastNote.text, 240)}`);
      }
    };
    await section('OVERDUE', data.overdue);
    await section('IN PROGRESS', data.inProgress);
    await section('DUE TODAY', data.today);
    await section(`UPCOMING (next ${days} days)`, data.upcoming);
    await section('BLOCKED', data.blocked);
    if (data.laterCount) {
      lines.push('', `LATER / NO DUE DATE (${data.laterCount}${data.laterCount > 10 ? ', showing 10' : ''})`);
      lines.push(await ctx.taskLines(data.later));
    }
    if (!all.length) lines.push('', 'You have no open tasks assigned to you.');
    if (data.recentNotes.length) {
      lines.push('', `NOTES FOR YOU (last 48 h, ${data.recentNotes.length})`);
      for (const n of data.recentNotes) {
        lines.push(`- ${n.by.name} ${n.kind === 'handoff' ? 'handed off' : 'commented on'} "${n.task.title}" [${n.task.id}] ${relativeAgo(Date.parse(n.at), now)}: ${clip(n.text, 400)}`);
      }
    }
    lines.push('', `Unread notifications: ${unread}${unread ? ' (get_notifications to read them)' : ''}.`);
    lines.push('Reminder: record progress with add_comment (or handoff) before you stop, and complete_task when done.');
    return { text: lines.join('\n'), data };
  });

  // ── list_tasks ─────────────────────────────────────────────────────────────
  tool('list_tasks', {
    title: 'List tasks',
    description:
      'List tasks with filters. Examples: {"assignee":"me","view":"today"} · {"project":"Website","status":["todo","in_progress"]} · ' +
      '{"assignee":"Priya","view":"overdue"} · {"search":"invoice","includeDone":true} · {"view":"agents"} (work assigned to AI agents). ' +
      'Views: today, upcoming, overdue, waiting (waiting on someone outside the team), done, all, agents. Done/cancelled tasks are excluded unless includeDone or view "done".',
    input: {
      view: z.enum(['today', 'upcoming', 'overdue', 'waiting', 'done', 'all', 'agents']).optional().describe('Shortcut view.'),
      assignee: z.string().optional().describe('"me", "unassigned", a member id, or a name / unique name prefix (e.g. "priya").'),
      project: z.string().optional().describe('Project id, name or unique prefix (e.g. "Website"), or "none" for tasks without a project.'),
      status: z.array(z.enum(STATUS)).optional().describe('Only these statuses.'),
      search: z.string().max(200).optional().describe('Text to look for in title/notes.'),
      tag: z.string().optional().describe('Only tasks with this tag.'),
      includeDone: z.boolean().optional().describe('Include done/cancelled tasks.'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 25, max 100).'),
      offset: z.number().int().min(0).optional().describe('Skip this many (pagination).'),
    },
    write: false,
  }, async (args, ctx) => {
    const q: TaskQuery = { limit: args.limit ?? 25 };
    if (args.view) q.view = args.view;
    if (args.assignee) {
      const a = args.assignee.trim().toLowerCase();
      q.assigneeId = a === 'me' ? 'me' : a === 'unassigned' ? 'unassigned' : await ctx.resolveMember(args.assignee);
      if (q.assigneeId === ctx.actor.memberId) q.assigneeId = 'me';
    }
    if (args.project) q.projectId = (await ctx.resolveProject(args.project)) ?? 'none';
    if (args.status?.length) q.status = args.status;
    if (args.search) q.search = args.search;
    if (args.tag) q.tag = args.tag.replace(/^#/, '');
    if (args.includeDone) q.includeDone = true;
    if (args.offset) q.offset = args.offset;
    const tasks = await ctx.services.tasks.list(ctx.actor, q);
    const compact = await ctx.compactTasks(tasks.slice(0, q.limit));
    const text = compact.length
      ? `${compact.length} task${compact.length === 1 ? '' : 's'}${compact.length === q.limit ? ' (limit reached — use offset for more)' : ''}:\n${await ctx.taskLines(compact)}`
      : 'No tasks match those filters.';
    return { text, data: { count: compact.length, query: q, tasks: compact } };
  });

  // ── get_task ───────────────────────────────────────────────────────────────
  tool('get_task', {
    title: 'Get task details',
    description:
      'Full details of one task: notes, subtasks, assignees, due date, waiting-on, and the last 30 activity entries ' +
      '(comments, hand-offs, status changes) — read this before continuing someone else\'s work. Example: {"taskId":"task_x7f3k2ab"}',
    input: { taskId },
    write: false,
  }, async (args, ctx) => {
    const [task, acts] = await Promise.all([
      ctx.services.tasks.get(ctx.actor, args.taskId),
      ctx.services.tasks.activity(ctx.actor, args.taskId),
    ]);
    const tz = await ctx.timezone();
    const c = await ctx.compactTask(task);
    const recent = [...acts].sort((a, b) => a.at - b.at).slice(-30);
    const activity = await Promise.all(recent.map((a) => ctx.activityEntry(a)));
    const lines = [await ctx.taskLine(c)];
    lines.push(`Created ${humanDate(task.createdAt, tz, ctx.now)} by ${await ctx.memberName(task.creatorId)} via ${task.source.channel}.`);
    if (task.recurrence) lines.push(`Repeats: ${task.recurrence.freq}${task.recurrence.interval > 1 ? ` every ${task.recurrence.interval}` : ''}.`);
    if (task.waitingOn) lines.push(`Waiting on ${task.waitingOn.name}${task.waitingOn.contact ? ` (${task.waitingOn.contact})` : ''} since ${humanDate(task.waitingOn.since, tz, ctx.now)}.`);
    if (task.notes.trim()) lines.push('', 'Notes:', task.notes.trim());
    if (task.subtasks.length) {
      lines.push('', 'Subtasks:');
      for (const st of task.subtasks) lines.push(`  [${st.done ? 'x' : ' '}] ${st.title}`);
    }
    if (activity.length) {
      lines.push('', `Activity (last ${activity.length}, oldest first):`);
      for (const a of activity) lines.push(`- ${a.at.slice(0, 16).replace('T', ' ')} ${a.by.name} [${a.kind}]: ${clip(a.text, 500)}`);
    }
    return {
      text: lines.join('\n'),
      data: {
        task: { ...c, notes: task.notes, subtasks: task.subtasks, recurrence: task.recurrence, waitingOn: task.waitingOn, reminderOffsets: task.reminderOffsets, creatorId: task.creatorId, source: task.source, createdAt: isoLocal(task.createdAt, tz), completedAt: task.completedAt != null ? isoLocal(task.completedAt, tz) : null },
        activity,
      },
    };
  });

  // ── create_task ────────────────────────────────────────────────────────────
  tool('create_task', {
    title: 'Create task',
    description:
      'Create a task (use this for every follow-up instead of remembering it). Assignees and project accept ids OR names. ' +
      'Assignees default to you; pass [] to leave it unassigned. Due accepts ISO 8601 or natural language in your time zone. ' +
      'Example: {"title":"Send Acme proposal","due":"tomorrow 5pm","assignees":["Priya"],"project":"Website","priority":"high",' +
      '"tags":["sales"],"notes":"Use the Q4 pricing sheet"}',
    input: {
      title: z.string().min(1).max(300).describe('Short imperative title, e.g. "Draft blog post on v2 launch".'),
      notes: z.string().max(20_000).optional().describe('Markdown details, context, links, acceptance criteria.'),
      due: dueSchema.optional().describe('When it is due: ISO 8601 ("2026-10-12T17:00" local, "2026-10-12T11:30:00Z", "2026-10-12" all day) or natural language ("tomorrow 5pm", "next friday", "in 2 hours").'),
      assignees: assigneeRefs.optional().describe('Member ids or names (e.g. ["Priya", "me"]). Default: you. [] = unassigned.'),
      project: z.string().optional().describe('Project id or name (e.g. "Website").'),
      priority: z.enum(PRIORITY).optional().describe('urgent | high | medium | low | none.'),
      status: z.enum(['todo', 'in_progress', 'blocked', 'review']).optional().describe('Initial status (default todo).'),
      tags: tags.optional(),
      reminders: reminders.optional(),
      subtasks: z.array(z.string().min(1).max(300)).max(50).optional().describe('Checklist items.'),
    },
    write: true,
  }, async (args, ctx) => {
    const input: CreateTaskInput = { title: args.title.trim(), source: { channel: 'mcp' } };
    if (args.notes !== undefined) input.notes = args.notes;
    if (args.due) Object.assign(input, await ctx.parseDue(args.due));
    input.assigneeIds = args.assignees === undefined ? [ctx.actor.memberId] : await ctx.resolveMembers(args.assignees);
    if (args.project) input.projectId = await ctx.resolveProject(args.project);
    if (args.priority) input.priority = args.priority;
    if (args.status) input.status = args.status;
    if (args.tags) input.tags = args.tags.map((t) => t.replace(/^#/, ''));
    if (args.reminders) input.reminderOffsets = args.reminders;
    if (args.subtasks) input.subtasks = args.subtasks.map((title) => ({ title }));
    const task = await ctx.services.tasks.create(ctx.actor, input);
    const c = await ctx.compactTask(task);
    return { text: `Created task:\n${await ctx.taskLine(c)}`, data: { task: c } };
  });

  // ── quick_add ──────────────────────────────────────────────────────────────
  tool('quick_add', {
    title: 'Quick add (natural language)',
    description:
      'Create a task from one line of natural language, exactly like the app\'s quick-add box. Understands dates/times, ' +
      '@assignee, #project, !priority, recurrence ("every monday") and reminders ("remind me 30m before"). ' +
      'Example: {"text":"Send Acme proposal tomorrow 5pm @priya #website !high"}. Without an @assignee the task is assigned to you.',
    input: {
      text: z.string().min(1).max(1000).describe('e.g. "Call Raj every friday 10am #sales remind me 15m before".'),
      project: z.string().optional().describe('Default project (id or name) if the text has no #project.'),
    },
    write: true,
  }, async (args, ctx) => {
    const defaults: Partial<CreateTaskInput> = { source: { channel: 'mcp' } };
    if (!/(^|\s)@\S/.test(args.text)) defaults.assigneeIds = [ctx.actor.memberId];
    if (args.project) defaults.projectId = await ctx.resolveProject(args.project);
    const task = await ctx.services.tasks.quickAdd(ctx.actor, args.text, defaults);
    const c = await ctx.compactTask(task);
    return { text: `Created task:\n${await ctx.taskLine(c)}`, data: { task: c } };
  });

  // ── update_task ────────────────────────────────────────────────────────────
  tool('update_task', {
    title: 'Update task',
    description:
      'Change a task\'s status, priority, due date, assignees, project, notes, title, tags or reminders. Only the fields you pass change. ' +
      'Examples: {"taskId":"task_x7f3k2ab","status":"in_progress"} · {"taskId":"…","due":"friday 3pm","priority":"urgent"} · ' +
      '{"taskId":"…","addAssignees":["Raj"]} · {"taskId":"…","due":"none"} (clear due date) · {"taskId":"…","project":"none"}. ' +
      'To mark done prefer complete_task; when blocking, also add_comment explaining why.',
    input: {
      taskId,
      title: z.string().min(1).max(300).optional().describe('New title.'),
      notes: z.string().max(20_000).optional().describe('Replaces the notes (Markdown). To log progress use add_comment instead.'),
      status: z.enum(STATUS).optional().describe('todo | in_progress | blocked | review | done | cancelled.'),
      priority: z.enum(PRIORITY).optional().describe('urgent | high | medium | low | none.'),
      due: dueSchema.optional().describe('New due date (ISO 8601 or natural language, your time zone), or "none" to clear.'),
      assignees: assigneeRefs.optional().describe('Replace assignees (ids or names). [] = unassigned.'),
      addAssignees: assigneeRefs.optional().describe('Add these assignees (ids or names).'),
      removeAssignees: assigneeRefs.optional().describe('Remove these assignees (ids or names).'),
      project: z.string().optional().describe('Project id or name, or "none" to remove from its project.'),
      tags: tags.optional().describe('Replace tags.'),
      reminders: reminders.nullable().optional().describe('Replace reminder offsets (minutes before due); null = org default.'),
    },
    write: true,
  }, async (args, ctx) => {
    const patch: UpdateTaskInput = {};
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.status) patch.status = args.status;
    if (args.priority) patch.priority = args.priority;
    if (args.due !== undefined) {
      if (/^(none|null|clear|no due date|-)$/i.test(args.due.trim())) Object.assign(patch, { dueAt: null, dueAllDay: false });
      else Object.assign(patch, await ctx.parseDue(args.due));
    }
    if (args.assignees || args.addAssignees || args.removeAssignees) {
      let ids: string[];
      if (args.assignees) ids = await ctx.resolveMembers(args.assignees);
      else ids = [...(await ctx.services.tasks.get(ctx.actor, args.taskId)).assigneeIds];
      for (const id of await ctx.resolveMembers(args.addAssignees ?? [])) if (!ids.includes(id)) ids.push(id);
      const remove = new Set(await ctx.resolveMembers(args.removeAssignees ?? []));
      patch.assigneeIds = ids.filter((id) => !remove.has(id));
    }
    if (args.project !== undefined) patch.projectId = await ctx.resolveProject(args.project);
    if (args.tags) patch.tags = args.tags.map((t) => t.replace(/^#/, ''));
    if (args.reminders !== undefined) patch.reminderOffsets = args.reminders;
    if (!Object.keys(patch).length) throw new ToolInputError('Nothing to update — pass at least one field (status, priority, due, assignees, project, notes, title, tags, reminders).');
    const task = await ctx.services.tasks.update(ctx.actor, args.taskId, patch);
    const c = await ctx.compactTask(task);
    const reward = patch.status === 'done' ? await completionRewards(ctx, task.id) : null;
    return {
      text: `Updated (${Object.keys(patch).join(', ')}):\n${await ctx.taskLine(c)}${reward ? `\n${reward.line}` : ''}`,
      data: { task: c, changed: Object.keys(patch), ...(reward ? { rewards: reward.rewards } : {}) },
    };
  });

  // ── complete_task ──────────────────────────────────────────────────────────
  tool('complete_task', {
    title: 'Complete task',
    description:
      'Mark a task done. Optionally include a final note (what was delivered, links) — it is saved as a comment first so the record is complete. ' +
      'Recurring tasks automatically schedule their next occurrence. Example: {"taskId":"task_x7f3k2ab","note":"Published: https://…"}',
    input: {
      taskId,
      note: z.string().max(20_000).optional().describe('Final summary to record before completing.'),
    },
    write: true,
  }, async (args, ctx) => {
    if (args.note?.trim()) await ctx.services.tasks.comment(ctx.actor, args.taskId, args.note.trim(), 'comment');
    const task = await ctx.services.tasks.complete(ctx.actor, args.taskId);
    const c = await ctx.compactTask(task);
    const reward = await completionRewards(ctx, task.id);
    return {
      text: `Completed: ${c.title} [${c.id}]${args.note?.trim() ? ' (note saved)' : ''}.${reward ? `\n${reward.line}` : ''}`,
      data: { task: c, noteSaved: Boolean(args.note?.trim()), ...(reward ? { rewards: reward.rewards } : {}) },
    };
  });

  // ── add_comment ────────────────────────────────────────────────────────────
  tool('add_comment', {
    title: 'Add comment / progress note',
    description:
      'Record progress on a task: what you did, what is left, decisions, links, blockers. Do this before you end or pause a session — ' +
      'it is how you (and teammates) remember next time; get_my_work shows your last note. Assignees and watchers are notified. ' +
      'Example: {"taskId":"task_x7f3k2ab","text":"Drafted sections 1-3 in https://docs/…; next: pricing table. Need Q4 numbers from Raj."}',
    input: {
      taskId,
      text: z.string().min(1).max(20_000).describe('The note (Markdown ok).'),
    },
    write: true,
  }, async (args, ctx) => {
    const a = await ctx.services.tasks.comment(ctx.actor, args.taskId, args.text.trim(), 'comment');
    return { text: `Comment added to ${args.taskId}.`, data: { activity: await ctx.activityEntry(a) } };
  });

  // ── handoff ────────────────────────────────────────────────────────────────
  tool('handoff', {
    title: 'Hand off task',
    description:
      'Pass a task to someone else (or park it) with a hand-off note: records the note as a hand-off, optionally reassigns, and optionally changes status. ' +
      'The new assignee sees the note at the top of their get_my_work. Write the note so a colleague with no context can continue: state, next step, links. ' +
      'Example: {"taskId":"task_x7f3k2ab","note":"Draft done in https://…; needs legal review of section 4.","to":"Priya","status":"review"}',
    input: {
      taskId,
      note: z.string().min(1).max(20_000).describe('Hand-off note: what is done, what is next, where things are.'),
      to: z.string().optional().describe('Member id or name to reassign to (replaces current assignees unless keepCurrentAssignees).'),
      keepCurrentAssignees: z.boolean().optional().describe('Add `to` instead of replacing current assignees (default false).'),
      status: z.enum(['todo', 'in_progress', 'blocked', 'review', 'done']).optional().describe('New status, e.g. "review", "blocked", or "done" (closing note).'),
    },
    write: true,
  }, async (args, ctx) => {
    const patch: UpdateTaskInput = {};
    let toId: string | null = null;
    if (args.to) {
      toId = await ctx.resolveMember(args.to);
      if (args.keepCurrentAssignees) {
        const current = (await ctx.services.tasks.get(ctx.actor, args.taskId)).assigneeIds;
        patch.assigneeIds = current.includes(toId) ? current : [...current, toId];
      } else {
        patch.assigneeIds = [toId];
      }
    }
    if (args.status) patch.status = args.status;
    // Record the note first: even if the reassignment fails, the context is never lost.
    const a = await ctx.services.tasks.comment(ctx.actor, args.taskId, args.note.trim(), 'handoff');
    let task: TaskView;
    try {
      task = Object.keys(patch).length
        ? await ctx.services.tasks.update(ctx.actor, args.taskId, patch)
        : await ctx.services.tasks.get(ctx.actor, args.taskId);
    } catch (err) {
      const res = toToolError(err, ctx.actor);
      const first = res.content[0];
      const msg = first && first.type === 'text' ? first.text : 'update failed';
      throw new ToolInputError(`Hand-off note was saved, but updating the task failed: ${msg}`);
    }
    const c = await ctx.compactTask(task);
    const who = toId ? await ctx.memberName(toId) : null;
    const reward = args.status === 'done' ? await completionRewards(ctx, task.id) : null;
    return {
      text: `Handed off${who ? ` to ${who}` : ''}${args.status ? `, status → ${args.status.replace('_', ' ')}` : ''}:\n${await ctx.taskLine(c)}${reward ? `\n${reward.line}` : ''}`,
      data: { task: c, activity: await ctx.activityEntry(a), reassignedTo: toId, ...(reward ? { rewards: reward.rewards } : {}) },
    };
  });

  // ── list_projects ──────────────────────────────────────────────────────────
  tool('list_projects', {
    title: 'List projects',
    description: 'Projects with progress and open/overdue counts. Use names from here wherever a project is expected. Example: {} or {"includeArchived":true}',
    input: { includeArchived: z.boolean().optional().describe('Include archived projects.') },
    write: false,
  }, async (args, ctx) => {
    const projects = await ctx.services.projects.list(ctx.actor, { includeArchived: args.includeArchived ?? false });
    const tz = await ctx.timezone();
    const items = await Promise.all(projects.map(async (p) => ({
      id: p.id, name: p.name, emoji: p.emoji, status: p.status, description: p.description,
      lead: p.leadId ? { id: p.leadId, name: await ctx.memberName(p.leadId) } : null,
      memberCount: p.memberIds.length, due: p.dueAt != null ? isoLocal(p.dueAt, tz) : null,
      progress: Math.round(p.progress * 100), counts: p.counts,
    })));
    const text = items.length
      ? items.map((p) => `- ${p.emoji ? `${p.emoji} ` : ''}${p.name} [${p.id}] · ${p.status} · ${p.progress}% · ${p.counts.open} open${p.counts.overdue ? `, ${p.counts.overdue} overdue` : ''}${p.lead ? ` · lead ${p.lead.name}` : ''}`).join('\n')
      : 'No projects yet.';
    return { text, data: { projects: items } };
  });

  // ── list_team ──────────────────────────────────────────────────────────────
  tool('list_team', {
    title: 'List team',
    description:
      'Everyone on the team — humans and AI agents — with role, title and (for agents) provider, supervisor and when they were last seen. ' +
      'Use names from here for assignees. Example: {} or {"kind":"agent"}',
    input: {
      kind: z.enum(['human', 'agent']).optional().describe('Only humans or only agents.'),
      includeInactive: z.boolean().optional().describe('Include deactivated members.'),
    },
    write: false,
  }, async (args, ctx) => {
    const opts: { includeInactive?: boolean; kind?: Member['kind'] } = {};
    if (args.kind) opts.kind = args.kind;
    if (args.includeInactive) opts.includeInactive = true;
    const members = await ctx.services.members.list(ctx.actor, opts);
    const tz = await ctx.timezone();
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const items = members.map((m) => ({
      id: m.id, name: m.name, kind: m.kind, role: m.role, title: m.title, email: m.email, timezone: m.timezone, active: m.active,
      isYou: m.id === ctx.actor.memberId,
      agent: m.agent ? {
        provider: m.agent.provider, description: m.agent.description,
        lastSeen: m.agent.lastSeenAt != null ? isoLocal(m.agent.lastSeenAt, tz) : null,
        supervisor: m.agent.supervisorId ? { id: m.agent.supervisorId, name: nameOf.get(m.agent.supervisorId) ?? m.agent.supervisorId } : null,
      } : null,
    }));
    const line = (m: (typeof items)[number]) => {
      const bits = [`- ${m.name}${m.isYou ? ' (you)' : ''} [${m.id}]`, m.kind === 'agent' ? `AI agent (${m.agent?.provider ?? 'custom'})` : m.role];
      if (m.title) bits.push(m.title);
      if (m.agent) bits.push(`last seen ${m.agent.lastSeen ? relativeAgo(Date.parse(m.agent.lastSeen), ctx.now) : 'never'}`);
      if (m.agent?.supervisor) bits.push(`supervisor ${m.agent.supervisor.name}`);
      if (!m.active) bits.push('inactive');
      return bits.join(' · ');
    };
    const humans = items.filter((m) => m.kind === 'human');
    const agents = items.filter((m) => m.kind === 'agent');
    const parts: string[] = [];
    if (humans.length) parts.push(`People (${humans.length}):`, ...humans.map(line));
    if (agents.length) parts.push(...(parts.length ? [''] : []), `AI agents (${agents.length}):`, ...agents.map(line));
    return { text: parts.join('\n') || 'No team members found.', data: { members: items } };
  });

  // ── get_briefing ───────────────────────────────────────────────────────────
  tool('get_briefing', {
    title: 'Get briefing',
    description:
      'The member\'s daily briefing: a short spoken-style summary plus structured data (my overdue/today/upcoming tasks, meetings, ' +
      'waiting-on items, AI agents\' work and stale agents, and for managers the team pulse). Example: {}',
    input: {},
    write: false,
  }, async (_args, ctx) => {
    const b = await ctx.services.briefing.get(ctx.actor);
    const tz = await ctx.timezone();
    const meetings = b.meetings.map((m) => ({ id: m.id, title: m.title, start: isoLocal(m.startAt, tz), end: isoLocal(m.endAt, tz), allDay: m.allDay, location: m.location, url: m.url }));
    const data = {
      greeting: b.greeting,
      headline: b.headline,
      spoken: b.spoken,
      myTasks: {
        overdue: await ctx.compactTasks(b.myTasks.overdue),
        today: await ctx.compactTasks(b.myTasks.today),
        upcoming: await ctx.compactTasks(b.myTasks.upcoming),
      },
      meetings,
      waitingOn: await ctx.compactTasks(b.waitingOn),
      agents: await Promise.all(b.agents.map(async (a) => ({
        member: { id: a.member.id, name: a.member.name, provider: a.member.agent?.provider ?? null },
        inProgress: await ctx.compactTasks(a.inProgress),
        stale: await ctx.compactTasks(a.stale),
      }))),
      team: b.team.map((p) => ({ member: { id: p.member.id, name: p.member.name, kind: p.member.kind }, open: p.open, overdue: p.overdue, dueToday: p.dueToday, doneToday: p.doneToday, doneThisWeek: p.doneThisWeek })),
      unreadNotifications: b.unreadNotifications,
      inboxNew: b.inboxNew,
    };
    const lines = [b.spoken.trim() || `${b.greeting}. ${b.headline}`];
    if (meetings.length) {
      lines.push('', 'Meetings:');
      for (const m of meetings) lines.push(`- ${humanDate(Date.parse(m.start), tz, ctx.now, m.allDay)} ${m.title}`);
    }
    const stale = data.agents.filter((a) => a.stale.length);
    if (stale.length) lines.push('', `Stale agent work: ${stale.map((a) => `${a.member.name} (${a.stale.length})`).join(', ')}.`);
    return { text: lines.join('\n'), data };
  });

  // ── list_meetings ──────────────────────────────────────────────────────────
  tool('list_meetings', {
    title: 'List meetings',
    description:
      'Meetings in a time range (default: start of today to 7 days ahead, your time zone). from/to accept ISO 8601 or natural language. ' +
      'Examples: {} · {"from":"tomorrow","to":"in 3 days"} · {"member":"Raj"}',
    input: {
      from: z.string().optional().describe('Range start (default: start of today).'),
      to: z.string().optional().describe('Range end (default: 7 days after start).'),
      member: z.string().optional().describe('Whose meetings: "me" (default) or a member id/name.'),
    },
    write: false,
  }, async (args, ctx) => {
    const tz = await ctx.timezone();
    const from = args.from ? await ctx.parseInstant(args.from) : startOfDay(ctx.now, tz);
    const to = args.to ? await ctx.parseInstant(args.to) : addDays(from, 7);
    if (to <= from) throw new ToolInputError('"to" must be after "from".');
    const memberId = !args.member || args.member.trim().toLowerCase() === 'me' ? 'me' : await ctx.resolveMember(args.member);
    const meetings = (await ctx.services.meetings.list(ctx.actor, { from, to, memberId })).sort((a, b) => a.startAt - b.startAt);
    const items = await Promise.all(meetings.map(async (m) => ({
      id: m.id, title: m.title, start: isoLocal(m.startAt, tz), end: isoLocal(m.endAt, tz), allDay: m.allDay,
      location: m.location, url: m.url, notes: m.notes,
      attendees: await Promise.all(m.attendeeIds.map(async (id) => ({ id, name: await ctx.memberName(id) }))),
    })));
    const range = `${humanDate(from, tz, ctx.now)} – ${humanDate(to, tz, ctx.now)}`;
    const text = items.length
      ? `${items.length} meeting${items.length === 1 ? '' : 's'} (${range}):\n` + meetings.map((m, i) => {
        const it = items[i]!;
        const when = m.allDay ? `${humanDate(m.startAt, tz, ctx.now, true)} (all day)` : `${humanDate(m.startAt, tz, ctx.now)}–${isoLocal(m.endAt, tz).slice(11, 16)}`;
        return `- ${when} ${m.title}${m.location ? ` @ ${m.location}` : ''}${it.attendees.length ? ` · with ${it.attendees.map((a) => a.name).join(', ')}` : ''}`;
      }).join('\n')
      : `No meetings ${range}.`;
    return { text, data: { from: isoLocal(from, tz), to: isoLocal(to, tz), meetings: items } };
  });

  // ── get_notifications ──────────────────────────────────────────────────────
  tool('get_notifications', {
    title: 'Get notifications',
    description:
      'Your notifications (assignments, mentions, comments, reminders, overdue, escalations). Unread only by default. ' +
      'Set markRead to mark the returned ones as read (needs a write-scope key). Examples: {} · {"markRead":true} · {"unreadOnly":false,"limit":50}',
    input: {
      unreadOnly: z.boolean().optional().describe('Only unread (default true).'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20).'),
      markRead: z.boolean().optional().describe('Mark the returned notifications as read.'),
    },
    write: false,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args, ctx) => {
    const list = await ctx.services.notifications.list(ctx.actor, { unreadOnly: args.unreadOnly ?? true, limit: args.limit ?? 20 });
    const tz = await ctx.timezone();
    let markedRead = 0;
    let note = '';
    const canMark = hasWriteScope(ctx.actor);
    if (args.markRead && !canMark) note = '\nNot marked as read: this API key is read-only (scope: read).';
    if (args.markRead && canMark) {
      const ids = list.filter((n) => n.readAt == null).map((n) => n.id);
      if (ids.length) await ctx.services.notifications.markRead(ctx.actor, ids);
      markedRead = ids.length;
      if (markedRead) note = `\nMarked ${markedRead} as read.`;
    }
    const items = list.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, taskId: n.taskId, meetingId: n.meetingId, urgent: n.urgent, read: n.readAt != null || markedRead > 0, at: isoLocal(n.createdAt, tz) }));
    const text = (items.length
      ? items.map((n) => `- ${n.urgent ? '[URGENT] ' : ''}${n.title}${n.body ? ` — ${clip(n.body, 200)}` : ''}${n.taskId ? ` [${n.taskId}]` : ''} (${relativeAgo(Date.parse(n.at), ctx.now)})`).join('\n')
      : (args.unreadOnly ?? true) ? 'No unread notifications.' : 'No notifications.') + note;
    return { text, data: { notifications: items, markedRead } };
  });

  // ── search ─────────────────────────────────────────────────────────────────
  tool('search', {
    title: 'Search',
    description: 'Search tasks, projects and people by text. Example: {"query":"acme proposal"}',
    input: {
      query: z.string().min(1).max(200).describe('Words to search for.'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results per type (default 10).'),
    },
    write: false,
  }, async (args, ctx) => {
    const r = await ctx.services.search.search(ctx.actor, args.query, args.limit ?? 10);
    const tasks = await ctx.compactTasks(r.tasks);
    const projects = r.projects.map((p) => ({ id: p.id, name: p.name, status: p.status }));
    const members = r.members.map((m) => ({ id: m.id, name: m.name, kind: m.kind, role: m.role }));
    const lines: string[] = [];
    if (tasks.length) lines.push(`Tasks (${tasks.length}):`, await ctx.taskLines(tasks));
    if (projects.length) lines.push(`Projects (${projects.length}):`, ...projects.map((p) => `- ${p.name} [${p.id}] · ${p.status}`));
    if (members.length) lines.push(`People & agents (${members.length}):`, ...members.map((m) => `- ${m.name} [${m.id}] · ${m.kind === 'agent' ? 'AI agent' : m.role}`));
    return { text: lines.join('\n') || `Nothing matches "${args.query}".`, data: { query: args.query, tasks, projects, members } };
  });

  // ── get_my_stats ───────────────────────────────────────────────────────────
  tool('get_my_stats', {
    title: 'Get my stats (Tactical Ops)',
    description:
      'Your game profile: level, rank, XP to the next level, streak, coins and unopened crates, plus today\'s mission progress (% of ' +
      'today\'s tasks done) and your daily challenges with progress. Completing tasks on time earns XP. Example: {}',
    input: {},
    write: false,
  }, async (_args, ctx) => {
    const hud = await ctx.services.game.hud(ctx.actor);
    const p = hud.profile;
    const toNext = Math.max(0, p.levelXp - p.levelProgressXp);
    const data = {
      profile: {
        level: p.level, xp: p.xp, rank: p.rank.name, nextRank: p.nextRank?.name ?? null,
        levelProgressXp: p.levelProgressXp, levelXp: p.levelXp, xpToNextLevel: toNext,
        streak: p.streak.current, bestStreak: p.streak.best, coins: p.coins, unopenedCrates: p.unopenedCrates,
        stats: p.stats, title: p.equipped.title,
      },
      today: hud.today,
      week: hud.week,
      challenges: hud.challenges.map((c) => ({
        id: c.id, title: c.title, description: c.description, progress: c.progress, target: c.target, xp: c.xp,
        pct: c.target > 0 ? Math.min(100, Math.round((c.progress / c.target) * 100)) : 0, done: c.completedAt != null,
      })),
      boost: hud.boost,
    };
    const lines = [
      `${p.rank.name} · Level ${p.level} · ${p.xp} XP (${toNext} XP to level ${p.level + 1}${p.nextRank ? `, next rank ${p.nextRank.name} at level ${p.nextRank.minLevel}` : ''})`,
      `Streak ${p.streak.current} day${p.streak.current === 1 ? '' : 's'} (best ${p.streak.best}) · ${p.coins} coins · ${p.unopenedCrates} unopened crate${p.unopenedCrates === 1 ? '' : 's'}`,
      `Today: ${hud.today.pct}% of missions done (${hud.today.done}/${hud.today.total}${hud.today.overdue ? `, ${hud.today.overdue} overdue` : ''}) · this week ${hud.week.pct}%`,
    ];
    if (hud.boost) lines.push(`XP boost ×${hud.boost.multiplier} active.`);
    if (data.challenges.length) {
      lines.push('', 'Daily challenges:');
      for (const c of data.challenges) lines.push(`- [${c.done ? 'x' : ' '}] ${c.title} — ${c.progress}/${c.target} (+${c.xp} XP)`);
    }
    return { text: lines.join('\n'), data };
  });
}

export const TOOL_NAMES = [
  'get_my_work', 'list_tasks', 'get_task', 'create_task', 'quick_add', 'update_task', 'complete_task',
  'add_comment', 'handoff', 'list_projects', 'list_team', 'get_briefing', 'list_meetings', 'get_notifications', 'search',
  'get_my_stats',
] as const;


const REWARD_WINDOW_MS = 10_000;
const KIND_LABEL: Partial<Record<RewardEvent['kind'], string>> = {
  on_time_bonus: 'on-time bonus', rescue_bonus: 'rescue bonus', priority_bonus: 'priority bonus',
  streak_bonus: 'streak bonus', challenge: 'challenge', squad_bonus: 'squad bonus', subtask: 'objective',
};
/** Rewards not tied to a task that a completion can trigger (level-ups, crates, …). */
const SIDE_EFFECT_KINDS = new Set<RewardEvent['kind']>(['level_up', 'crate_earned', 'achievement', 'challenge', 'streak_bonus', 'squad_bonus']);

/** Mission XP first, then task bonuses, then side effects (level-up, crates, achievements…). */
const rewardOrder = (r: RewardEvent) => (r.kind === 'mission_complete' ? 0 : r.taskId != null ? 1 : 2);

/**
 * Best-effort reward summary after completing a task: "🎖️ +40 XP · on-time bonus +20 · LEVEL 5 (Sergeant)".
 * Never throws — a game error must not fail the tool.
 */
async function completionRewards(ctx: CallContext, taskId: string): Promise<{ line: string; rewards: { kind: string; xp: number; coins: number; label: string }[] } | null> {
  try {
    const game = ctx.services.game;
    if (!game?.rewards) return null;
    const since = ctx.now - REWARD_WINDOW_MS;
    const recent = (await game.rewards(ctx.actor, 30))
      .filter((r) => r.at >= since && r.kind !== 'revoked' && (r.taskId === taskId || (r.taskId == null && SIDE_EFFECT_KINDS.has(r.kind))))
      .sort((a, b) => rewardOrder(a) - rewardOrder(b) || a.at - b.at);
    if (!recent.some((r) => r.taskId === taskId)) return null;
    const xp = recent.reduce((n, r) => n + r.xp, 0);
    const coins = recent.reduce((n, r) => n + r.coins, 0);
    const parts = [`🎖️ +${xp} XP`];
    for (const r of recent) {
      if (r.kind === 'level_up') parts.push(`LEVEL UP → ${r.level ?? '?'}${r.rank ? ` (${r.rank.name})` : ''}`);
      else if (r.kind === 'crate_earned') parts.push(`${r.rarity ?? ''} crate earned`.trim());
      else if (r.kind === 'achievement') parts.push(`🏅 ${r.label.replace(/^[+-]?\d+ XP · /, '')}`);
      else if (KIND_LABEL[r.kind] && r.xp) parts.push(`${KIND_LABEL[r.kind]} +${r.xp}`);
    }
    if (coins) parts.push(`+${coins} coins`);
    return { line: parts.join(' · '), rewards: recent.map((r) => ({ kind: r.kind, xp: r.xp, coins: r.coins, label: r.label })) };
  } catch (err) {
    console.error('[companybrain mcp] reward lookup failed (ignored):', err instanceof Error ? err.message : err);
    return null;
  }
}

function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}
