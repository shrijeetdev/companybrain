// TaskService: CRUD, quick-add (NL parse + hint resolution), subtasks, comments/mentions,
// waiting-on nudges, bulk ops, recurrence spawning (exactly once per occurrence).

import {
  AppError,
  SYSTEM_MEMBER_ID,
  type ActivityKind,
  type Actor,
  type CreateTaskInput,
  type Member,
  type ParsedQuickAdd,
  type Priority,
  type Project,
  type Subtask,
  type Task,
  type TaskActivity,
  type TaskDraft,
  type TaskQuery,
  type TaskService,
  type TaskStatus,
  type TaskView,
  type UpdateTaskInput,
  type WaitingOn,
} from '@companybrain/types';
import { parseQuickAdd } from '@companybrain/nlp';
import { atLocalHour, localParts, newId, safeTz, startOfLocalDay, zonedToUtc, type TaskFilter } from '@companybrain/db';
import { actorMember, actorTz, audit, firstName, getOrg, publish, type Ctx } from '../context.js';
import { canDeleteTask, canEditTask, forbidden, hasWriteScope, isSystem, notFound, rank, requireWrite, systemActor, visibility } from '../perms.js';
import { nextOccurrence, validateRecurrence } from '../recurrence.js';
import * as v from '../validate.js';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'];
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];
const CLOSED = new Set<TaskStatus>(['done', 'cancelled']);
export const isOpen = (t: Task) => !CLOSED.has(t.status);

const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', review: 'Review', done: 'Done', cancelled: 'Cancelled' };

// ─── hint resolution ─────────────────────────────────────────────────────────

const normName = (s: string) => s.toLowerCase().replace(/[\s._-]+/g, '');

/** Resolve "@priya" style hints to a member: exact (name / first name / email / email local part), else unique prefix. */
export function resolveMemberHint(hint: string, members: Member[], selfId: string | null): Member | null {
  const h = hint.replace(/^@/, '').trim().toLowerCase();
  if (!h) return null;
  if ((h === 'me' || h === 'myself') && selfId) return members.find((m) => m.id === selfId) ?? null;
  const nh = normName(h);
  const keys = (m: Member) => {
    const email = (m.email ?? '').toLowerCase();
    return [m.name.toLowerCase(), normName(m.name), firstName(m.name).toLowerCase(), email, email.split('@')[0] ?? ''].filter(Boolean);
  };
  const exact = members.filter((m) => keys(m).some((k) => k === h || k === nh));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;
  const prefix = members.filter((m) => keys(m).some((k) => k.startsWith(h) || k.startsWith(nh)));
  return prefix.length === 1 ? prefix[0]! : null;
}

/** Fuzzy project match: case-insensitive, ignoring spaces/dashes/underscores; exact then unique prefix. */
export function resolveProjectHint(hint: string, projects: Project[]): Project | null {
  const h = normName(hint.replace(/^#/, ''));
  if (!h) return null;
  const exact = projects.filter((p) => normName(p.name) === h);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;
  const prefix = projects.filter((p) => normName(p.name).startsWith(h));
  if (prefix.length === 1) return prefix[0]!;
  const sub = projects.filter((p) => normName(p.name).includes(h));
  return sub.length === 1 ? sub[0]! : null;
}

// ─── mentions ────────────────────────────────────────────────────────────────

export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(^|[^\w@])@([A-Za-z0-9][\w.-]{0,63})/g)) out.add(m[2]!.replace(/[.-]+$/, ''));
  return [...out];
}

// ─── nudge limits ────────────────────────────────────────────────────────────

/** Minimum gap between two nudges of the same task (manual or scheduled), and the floor for nudgeEveryHours. */
export const NUDGE_MIN_HOURS = 4;
export const NUDGE_MEMBER_DAILY_CAP = 20;
export const NUDGE_ORG_DAILY_CAP = 200;
const NUDGE_TITLE_MAX = 120;
const H = 3_600_000;

/** Nudge interval actually used: never below NUDGE_MIN_HOURS (also for legacy stored values). */
export const nudgeIntervalMs = (w: WaitingOn) => Math.max(NUDGE_MIN_HOURS, w.nudgeEveryHours ?? NUDGE_MIN_HOURS) * H;

const URLISH = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)|^[^\s@/]+\.[a-z]{2,24}(?:[/:?#]|$)/i;
/** Drop anything link-like (URLs, www., bare domains) and cap the length: nudges go to people outside the org. */
export function sanitizeNudgeText(s: string, max: number): string {
  const words = s
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !URLISH.test(w.replace(/^[("'<[]+|[)"'>\].,;:!?]+$/g, '')));
  const out = words.join(' ').trim();
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
}

/** Fixed template — the only free text is the (sanitized) task title and first name. */
export function nudgeMessage(name: string, org: string, title: string): string {
  const who = sanitizeNudgeText(firstName(name), 40) || 'there';
  return `Hi ${who}, a friendly follow-up from ${org} about: "${sanitizeNudgeText(title, NUDGE_TITLE_MAX) || 'your task'}" — reply here if you have an update.`;
}

// ─── service ─────────────────────────────────────────────────────────────────

export interface TaskInternals {
  service: TaskService;
  views(orgId: string, tasks: Task[], tz: string): TaskView[];
  publishTask(task: Task): void;
  publishTaskDeleted(task: Task): void;
  spawnNext(orgId: string, taskId: string): Promise<Task | null>;
  audience(task: Task): string[];
  /** Parse + resolve hints (preview / intake suggestions). */
  draftFromText(actor: Actor, text: string): { parsed: ParsedQuickAdd; draft: TaskDraft; unresolved: string[] };
  /** Send the waiting-on party a nudge (used by the API and the scheduler). */
  sendNudge(cur: Task, actorId: string): Promise<{ ok: true } | { ok: false; error: string; retryAt?: number }>;
  addActivity(t: Task, actorId: string, kind: ActivityKind, text: string, data?: Record<string, unknown> | null, bump?: boolean): TaskActivity;
}

export function createTaskService(ctx: Ctx): TaskInternals {
  const { db } = ctx;
  const now = () => ctx.clock();

  // ── views ──
  function views(orgId: string, tasks: Task[], tz: string): TaskView[] {
    if (!tasks.length) return [];
    const org = db.orgs.get(orgId);
    const staleMs = (org?.agentStaleAfterMin ?? 240) * 60_000;
    const agents = new Set(db.members.list(orgId, { includeInactive: true, kind: 'agent' }).map((m) => m.id));
    const counts = db.tasks.commentCounts(orgId, tasks.map((t) => t.id));
    const t0 = now();
    const dayStart = startOfLocalDay(t0, tz);
    const dayEnd = startOfLocalDay(t0, tz, 1);
    return tasks.map((t) => {
      const open = isOpen(t);
      return {
        ...t,
        isOverdue: open && t.dueAt !== null && t.dueAt < t0,
        isDueToday: t.dueAt !== null && t.dueAt >= dayStart && t.dueAt < dayEnd,
        isStale: open && t.assigneeIds.some((a) => agents.has(a)) && t0 - t.lastActivityAt > staleMs,
        commentCount: counts.get(t.id) ?? 0,
      };
    });
  }
  const view = (actor: Actor, t: Task) => views(actor.orgId, [t], actorTz(ctx, actor))[0]!;
  const orgView = (t: Task) => views(t.orgId, [t], safeTz(db.orgs.get(t.orgId)?.timezone))[0]!;

  /** Members who can see the task (for targeted live events). */
  function audience(t: Task): string[] {
    const members = db.members.list(t.orgId);
    const project = t.projectId ? db.projects.get(t.orgId, t.projectId) : null;
    const out = new Set<string>([t.creatorId, ...t.assigneeIds]);
    for (const m of members) {
      if (m.kind === 'human' && rank(m.role) >= rank('manager')) out.add(m.id);
      else if (project) {
        if (m.kind === 'agent') out.add(m.id);
        else if (project.leadId === m.id || project.createdBy === m.id || project.memberIds.includes(m.id)) out.add(m.id);
        else if (!project.memberIds.length && m.role !== 'guest') out.add(m.id);
      }
    }
    out.delete(SYSTEM_MEMBER_ID);
    return [...out];
  }

  function publishTask(t: Task) {
    publish(ctx, t.orgId, { type: 'task.upserted', task: orgView(t) }, audience(t));
    ctx.internal.invalidateBriefings(t.orgId);
  }
  function publishTaskDeleted(t: Task) {
    publish(ctx, t.orgId, { type: 'task.deleted', taskId: t.id }, audience(t));
    ctx.internal.invalidateBriefings(t.orgId);
  }

  // ── loading & permissions ──
  function loadVisible(actor: Actor, id: string): Task {
    const t = typeof id === 'string' && id ? db.tasks.get(actor.orgId, id, visibility(actor)) : null;
    if (!t) notFound('Task not found');
    return t!;
  }
  function loadEditable(actor: Actor, id: string): Task {
    requireWrite(actor);
    const t = loadVisible(actor, id);
    if (!canEditTask(actor, t)) forbidden(actor.kind === 'agent' ? 'AI agents can only update tasks assigned to them' : 'You cannot edit this task');
    return t;
  }

  // ── activity helpers ──
  function addActivity(t: Task, actorId: string, kind: ActivityKind, text: string, data: Record<string, unknown> | null = null, bump = true): TaskActivity {
    const a: TaskActivity = { id: newId('act'), orgId: t.orgId, taskId: t.id, actorId, kind, text: text.slice(0, 10_000), data, at: now() };
    db.activity.insert(a);
    if (bump) t.lastActivityAt = a.at;
    return a;
  }
  function publishActivity(t: Task, acts: TaskActivity[]) {
    if (!acts.length) return;
    const aud = audience(t);
    for (const a of acts) publish(ctx, t.orgId, { type: 'activity', activity: a }, aud);
  }

  const memberName = (orgId: string, id: string) => (id === SYSTEM_MEMBER_ID ? 'System' : db.members.get(orgId, id)?.name ?? 'Someone');

  // ── validation ──
  function validAssignees(actor: Actor, ids: unknown): string[] {
    const list = v.refs(ids, 'assigneeIds', 20);
    if (!list.length) return [];
    const found = db.members.getMany(actor.orgId, list).filter((m) => m.active);
    if (found.length !== list.length) v.bad('assigneeIds contains an unknown or inactive member');
    return list;
  }
  function validProject(actor: Actor, pid: unknown): string | null {
    if (pid === null || pid === undefined) return null;
    const id = v.ref(pid, 'projectId');
    const p = db.projects.get(actor.orgId, id, visibility(actor));
    if (!p) v.bad('projectId refers to an unknown project');
    return id;
  }
  function validWaiting(actor: Actor, w: unknown, prev: WaitingOn | null): WaitingOn | null {
    if (w === null || w === undefined) return null;
    if (!v.isObj(w)) v.bad('waitingOn must be an object');
    const name = v.str(w.name, 'waitingOn.name', { max: 100 });
    const channel = v.oneOf(w.channel ?? 'other', 'waitingOn.channel', ['whatsapp', 'email', 'other'] as const);
    let contact = v.optStr(w.contact, 'waitingOn.contact', 254);
    if (contact && channel === 'email') contact = v.email(contact, 'waitingOn.contact');
    if (contact && channel === 'whatsapp') contact = v.phone(contact, 'waitingOn.contact');
    // A contact makes the server message an outside party: only people (member role or above,
    // write access) may set one — not guests, AI agents or read-only keys.
    const contactChanged = !!contact && (!prev || prev.contact !== contact || prev.channel !== channel);
    if (contactChanged && !isSystem(actor) && !(actor.kind === 'human' && rank(actor.role) >= rank('member') && hasWriteScope(actor))) {
      forbidden('Only team members can set a waiting-on contact');
    }
    const nudgeEveryHours = w.nudgeEveryHours === null || w.nudgeEveryHours === undefined
      ? null
      : Math.max(NUDGE_MIN_HOURS, v.int(w.nudgeEveryHours, 'waitingOn.nudgeEveryHours', 1, 24 * 30));
    const same = prev && prev.name === name && prev.contact === contact;
    return { name, contact, channel, nudgeEveryHours, lastNudgedAt: same ? prev.lastNudgedAt : null, since: same ? prev.since : now() };
  }
  /** All-day dues are normalized to the end of the workday (actor tz) on that local date. */
  function normalizeDue(actor: Actor, dueAt: number | null, allDay: boolean): number | null {
    if (dueAt === null || !allDay) return dueAt;
    const org = getOrg(ctx, actor.orgId);
    const tz = actorTz(ctx, actor);
    const p = localParts(dueAt, tz);
    return zonedToUtc(p.year, p.month, p.day, Math.min(org.workdayEnd, 23), org.workdayEnd >= 24 ? 59 : 0, tz);
  }

  // ── create ──
  async function create(actor: Actor, input: CreateTaskInput): Promise<TaskView> {
    requireWrite(actor);
    if (!v.isObj(input)) v.bad('task input required');
    const t0 = now();
    const status = input.status === undefined ? 'todo' : v.oneOf(input.status, 'status', STATUSES);
    const allDay = input.dueAllDay === undefined ? false : v.bool(input.dueAllDay, 'dueAllDay');
    const dueAt = normalizeDue(actor, v.optTime(input.dueAt, 'dueAt'), allDay);
    const real = !isSystem(actor) && !!actorMember(ctx, actor);
    const assigneeIds = input.assigneeIds === undefined || input.assigneeIds === null ? (real ? [actor.memberId] : []) : validAssignees(actor, input.assigneeIds);
    const src = v.isObj(input.source) ? input.source : {};
    const subtasks: Subtask[] = Array.isArray(input.subtasks)
      ? input.subtasks.slice(0, 100).map((s, i) => ({ id: newId('sub'), title: v.str(v.isObj(s) ? s.title : s, `subtasks[${i}].title`, { max: 300 }), done: false, doneAt: null, doneBy: null }))
      : [];
    const task: Task = {
      id: newId('task'),
      orgId: actor.orgId,
      projectId: validProject(actor, input.projectId),
      title: v.str(input.title, 'title', { max: 500 }),
      notes: v.optStr(input.notes, 'notes', 20_000) ?? '',
      status,
      priority: input.priority === undefined ? 'none' : v.oneOf(input.priority, 'priority', PRIORITIES),
      assigneeIds,
      creatorId: actor.memberId,
      dueAt,
      dueAllDay: dueAt !== null && allDay,
      reminderOffsets: input.reminderOffsets === undefined || input.reminderOffsets === null ? null : v.offsets(input.reminderOffsets),
      recurrence: validateRecurrence(input.recurrence),
      recurrenceParentId: null,
      waitingOn: validWaiting(actor, input.waitingOn, null),
      tags: input.tags === undefined ? [] : v.tags(input.tags),
      subtasks,
      source: {
        channel: src.channel !== undefined ? v.oneOf(src.channel, 'source.channel', ['manual', 'quick_add', 'voice', 'whatsapp', 'email', 'mcp', 'api', 'calendar', 'recurring', 'import'] as const) : actor.via === 'api_key' ? 'api' : 'manual',
        ref: v.optStr(src.ref, 'source.ref', 300),
        from: v.optStr(src.from, 'source.from', 300),
      },
      order: t0,
      startedAt: status === 'in_progress' ? t0 : null,
      completedAt: status === 'done' ? t0 : null,
      completedBy: status === 'done' ? actor.memberId : null,
      lastActivityAt: t0,
      createdAt: t0,
      updatedAt: t0,
    };
    const act = db.tx(() => {
      db.tasks.insert(task);
      return addActivity(task, actor.memberId, 'created', `${memberName(actor.orgId, actor.memberId)} created this task`, { source: task.source.channel });
    });
    await afterCreate(actor, task, [act]);
    return view(actor, task);
  }

  async function afterCreate(actor: Actor, task: Task, acts: TaskActivity[]) {
    await audit(ctx, actor, { type: 'task.created', entity: 'task', entityId: task.id, summary: `Created "${task.title}"`, after: task, undoable: true });
    ctx.internal.scheduleTask(task);
    publishTask(task);
    publishActivity(task, acts);
    await notifyAssigned(actor, task, task.assigneeIds);
  }

  async function notifyAssigned(actor: Actor, task: Task, ids: string[]) {
    const by = memberName(task.orgId, actor.memberId);
    for (const id of ids) {
      if (id === actor.memberId) continue;
      await safeNotify(task.orgId, id, {
        kind: 'task_assigned', title: `New task: ${task.title}`, body: `${by} assigned you "${task.title}"`, taskId: task.id, meetingId: null, link: `/tasks/${task.id}`, urgent: task.priority === 'urgent',
      });
    }
  }

  async function safeNotify(orgId: string, memberId: string, n: Parameters<Ctx['services']['notifications']['notify']>[2]) {
    try {
      await ctx.services.notifications.notify(orgId, memberId, n);
    } catch (err) {
      ctx.log.warn('[tasks] notify failed', err);
    }
  }

  // ── quick add ──
  function draftFromText(actor: Actor, text: string) {
    const raw = v.str(text, 'text', { max: 2000 });
    const org = getOrg(ctx, actor.orgId);
    const tz = actorTz(ctx, actor);
    let parsed: ParsedQuickAdd;
    try {
      parsed = parseQuickAdd(raw, { now: now(), timezone: tz, defaultHour: Math.min(org.workdayEnd, 23) });
    } catch (err) {
      ctx.log.warn('[tasks] parseQuickAdd failed, using raw text', err);
      parsed = { title: raw, dueAt: null, dueAllDay: false, priority: null, assigneeHints: [], projectHint: null, tags: [], recurrence: null, reminderOffsets: null, tokens: [] };
    }
    const unresolved: string[] = [];
    const members = db.members.list(actor.orgId);
    const assigneeIds: string[] = [];
    for (const h of parsed.assigneeHints ?? []) {
      const m = resolveMemberHint(h, members, isSystem(actor) ? null : actor.memberId);
      if (m) {
        if (!assigneeIds.includes(m.id)) assigneeIds.push(m.id);
      } else unresolved.push(`@${h.replace(/^@/, '')}`);
    }
    let projectId: string | null = null;
    if (parsed.projectHint) {
      const projects = db.projects.list(actor.orgId, { visibility: visibility(actor) });
      const p = resolveProjectHint(parsed.projectHint, projects);
      if (p) projectId = p.id;
      else unresolved.push(`#${parsed.projectHint.replace(/^#/, '')}`);
    }
    const draft: TaskDraft = {
      title: (parsed.title || raw).trim().slice(0, 500) || raw.slice(0, 500),
      dueAt: parsed.dueAt,
      dueAllDay: parsed.dueAllDay,
      priority: parsed.priority ?? 'none',
      assigneeIds,
      projectId,
      tags: parsed.tags ?? [],
      recurrence: parsed.recurrence,
      reminderOffsets: parsed.reminderOffsets,
    };
    return { parsed, draft, unresolved };
  }

  async function quickAdd(actor: Actor, text: string, defaults: Partial<CreateTaskInput> = {}): Promise<TaskView> {
    requireWrite(actor);
    const { draft } = draftFromText(actor, text);
    const d = v.isObj(defaults) ? defaults : {};
    const input: CreateTaskInput = {
      ...d,
      title: draft.title,
      dueAt: draft.dueAt ?? d.dueAt ?? null,
      dueAllDay: draft.dueAt !== null && draft.dueAt !== undefined ? draft.dueAllDay : d.dueAllDay,
      priority: draft.priority && draft.priority !== 'none' ? draft.priority : d.priority ?? 'none',
      assigneeIds: draft.assigneeIds?.length ? draft.assigneeIds : d.assigneeIds,
      projectId: draft.projectId ?? d.projectId ?? null,
      tags: [...new Set([...(d.tags ?? []), ...(draft.tags ?? [])])],
      recurrence: draft.recurrence ?? d.recurrence ?? null,
      reminderOffsets: draft.reminderOffsets ?? d.reminderOffsets ?? null,
      source: { channel: 'quick_add', ...(v.isObj(d.source) ? d.source : {}) },
    };
    return create(actor, input);
  }

  // ── update ──
  type Change = { kind: ActivityKind; text: string; data?: Record<string, unknown> };

  function applyPatch(actor: Actor, cur: Task, patch: UpdateTaskInput): { next: Task; changes: Change[] } {
    if (!v.isObj(patch)) v.bad('patch must be an object');
    const next: Task = { ...cur, assigneeIds: [...cur.assigneeIds], tags: [...cur.tags], subtasks: cur.subtasks.map((s) => ({ ...s })) };
    const changes: Change[] = [];
    const who = memberName(cur.orgId, actor.memberId);
    if (patch.title !== undefined) next.title = v.str(patch.title, 'title', { max: 500 });
    if (patch.notes !== undefined) next.notes = v.optStr(patch.notes, 'notes', 20_000) ?? '';
    if (patch.tags !== undefined) next.tags = v.tags(patch.tags);
    if (patch.order !== undefined) next.order = v.num(patch.order, 'order');
    if (patch.reminderOffsets !== undefined) next.reminderOffsets = patch.reminderOffsets === null ? null : v.offsets(patch.reminderOffsets);
    if (patch.recurrence !== undefined) next.recurrence = validateRecurrence(patch.recurrence);
    if (patch.waitingOn !== undefined) next.waitingOn = validWaiting(actor, patch.waitingOn, cur.waitingOn);
    if (next.title !== cur.title || next.notes !== cur.notes || JSON.stringify(next.tags) !== JSON.stringify(cur.tags) ||
      JSON.stringify(next.recurrence) !== JSON.stringify(cur.recurrence) || JSON.stringify(next.waitingOn) !== JSON.stringify(cur.waitingOn) ||
      JSON.stringify(next.reminderOffsets) !== JSON.stringify(cur.reminderOffsets)) {
      changes.push({ kind: 'edited', text: `${who} edited the task` });
    }
    if (patch.priority !== undefined) {
      next.priority = v.oneOf(patch.priority, 'priority', PRIORITIES);
      if (next.priority !== cur.priority) changes.push({ kind: 'priority', text: `${who} set priority to ${next.priority}`, data: { from: cur.priority, to: next.priority } });
    }
    if (patch.projectId !== undefined) {
      next.projectId = validProject(actor, patch.projectId);
      if (next.projectId !== cur.projectId) {
        const pname = next.projectId ? db.projects.get(cur.orgId, next.projectId)?.name ?? 'a project' : 'no project';
        changes.push({ kind: 'moved_project', text: `${who} moved this to ${pname}`, data: { from: cur.projectId, to: next.projectId } });
      }
    }
    if (patch.dueAt !== undefined || patch.dueAllDay !== undefined) {
      const allDay = patch.dueAllDay !== undefined ? v.bool(patch.dueAllDay, 'dueAllDay') : cur.dueAllDay;
      const raw = patch.dueAt !== undefined ? v.optTime(patch.dueAt, 'dueAt') : cur.dueAt;
      next.dueAt = normalizeDue(actor, raw, allDay);
      next.dueAllDay = next.dueAt !== null && allDay;
      if (next.dueAt !== cur.dueAt) changes.push({ kind: 'due_changed', text: next.dueAt ? `${who} changed the due date` : `${who} removed the due date`, data: { from: cur.dueAt, to: next.dueAt } });
    }
    if (patch.assigneeIds !== undefined) {
      next.assigneeIds = validAssignees(actor, patch.assigneeIds);
      const added = next.assigneeIds.filter((a) => !cur.assigneeIds.includes(a));
      const removed = cur.assigneeIds.filter((a) => !next.assigneeIds.includes(a));
      for (const a of added) changes.push({ kind: 'assigned', text: `${who} assigned ${memberName(cur.orgId, a)}`, data: { memberId: a } });
      for (const a of removed) changes.push({ kind: 'unassigned', text: `${who} unassigned ${memberName(cur.orgId, a)}`, data: { memberId: a } });
    }
    if (patch.status !== undefined) {
      const s = v.oneOf(patch.status, 'status', STATUSES);
      if (s !== cur.status) {
        next.status = s;
        const t0 = now();
        if (s === 'in_progress' && next.startedAt === null) next.startedAt = t0;
        if (s === 'done') {
          next.completedAt = t0;
          next.completedBy = actor.memberId;
        } else if (cur.status === 'done') {
          next.completedAt = null;
          next.completedBy = null;
        }
        changes.push({ kind: 'status', text: `${who} moved this to ${STATUS_LABEL[s]}`, data: { from: cur.status, to: s } });
      }
    }
    return { next, changes };
  }

  /** Persist a changed task: activity, audit (task.updated/completed/reopened), jobs, live, notifications, recurrence. */
  async function commit(actor: Actor, cur: Task, next: Task, changes: Change[], opts: { auditType?: string; summary?: string } = {}): Promise<Task> {
    if (!changes.length && JSON.stringify(cur) === JSON.stringify(next)) return cur;
    next.updatedAt = now();
    const acts = db.tx(() => {
      const list = changes.map((c) => addActivity(next, actor.memberId, c.kind, c.text, c.data ?? null));
      if (!list.length) next.lastActivityAt = next.updatedAt;
      db.tasks.save(next);
      return list;
    });
    const completed = next.status === 'done' && cur.status !== 'done';
    const reopened = cur.status === 'done' && next.status !== 'done';
    const type = opts.auditType ?? (completed ? 'task.completed' : reopened ? 'task.reopened' : 'task.updated');
    const summary = opts.summary ?? (completed ? `Completed "${next.title}"` : reopened ? `Reopened "${next.title}"` : `Updated "${next.title}"`);
    await audit(ctx, actor, { type, entity: 'task', entityId: next.id, summary, before: cur, after: next, undoable: true });
    ctx.internal.scheduleTask(next);
    publishTask(next);
    publishActivity(next, acts);
    const added = next.assigneeIds.filter((a) => !cur.assigneeIds.includes(a));
    if (added.length && isOpen(next)) await notifyAssigned(actor, next, added);
    if (completed) {
      if (next.creatorId !== actor.memberId && next.creatorId !== SYSTEM_MEMBER_ID && !next.assigneeIds.includes(next.creatorId)) {
        await safeNotify(next.orgId, next.creatorId, {
          kind: 'task_completed', title: `Done: ${next.title}`, body: `${memberName(next.orgId, actor.memberId)} completed "${next.title}"`, taskId: next.id, meetingId: null, link: `/tasks/${next.id}`, urgent: false,
        });
      }
      if (next.recurrence) {
        try {
          await spawnNext(next.orgId, next.id);
        } catch (err) {
          ctx.log.warn('[tasks] recurrence spawn failed; retrying via job', err);
          db.jobs.schedule(next.orgId, 'task.recur', `task.recur:${next.id}`, now(), { taskId: next.id }, now());
        }
      }
    }
    return next;
  }

  async function update(actor: Actor, id: string, patch: UpdateTaskInput): Promise<TaskView> {
    const cur = loadEditable(actor, id);
    const { next, changes } = applyPatch(actor, cur, patch);
    const saved = await commit(actor, cur, next, changes);
    return view(actor, saved);
  }

  // ── recurrence ──
  async function spawnNext(orgId: string, taskId: string): Promise<Task | null> {
    const src = db.tasks.get(orgId, taskId);
    if (!src || !src.recurrence || src.status !== 'done') return null;
    const existingNext = db.tasks.getRecurrenceNext(orgId, src.id);
    if (existingNext) return db.tasks.get(orgId, existingNext);
    const rootId = src.recurrenceParentId ?? src.id;
    const assigneeTz = src.assigneeIds.map((a) => db.members.get(orgId, a)).find((m) => m?.active)?.timezone;
    const tz = safeTz(assigneeTz ?? db.orgs.get(orgId)?.timezone);
    const t0 = now();
    const org = getOrg(ctx, orgId);
    const base = src.dueAt ?? atLocalHour(src.completedAt ?? t0, tz, Math.min(org.workdayEnd, 23));
    const due = nextOccurrence(base, src.recurrence, tz, t0);
    if (due === null) return null;
    const activeAssignees = db.members.getMany(orgId, src.assigneeIds).filter((m) => m.active).map((m) => m.id);
    const next: Task = {
      ...src,
      id: newId('task'),
      status: 'todo',
      assigneeIds: activeAssignees,
      dueAt: due,
      recurrenceParentId: rootId,
      waitingOn: null,
      subtasks: src.subtasks.map((s) => ({ ...s, id: newId('sub'), done: false, doneAt: null, doneBy: null })),
      source: { channel: 'recurring', ref: src.id, from: null },
      order: t0,
      startedAt: null,
      completedAt: null,
      completedBy: null,
      lastActivityAt: t0,
      createdAt: t0,
      updatedAt: t0,
    };
    const created = db.tx(() => {
      if (!db.tasks.claimRecurrenceNext(orgId, src.id, next.id)) return null;
      const dup = db.tasks.findOccurrence(orgId, rootId, due);
      if (dup) {
        db.tasks.setRecurrenceNext(orgId, src.id, dup.id);
        return null;
      }
      db.tasks.insert(next);
      addActivity(next, SYSTEM_MEMBER_ID, 'created', 'Next occurrence of a recurring task', { from: src.id });
      return next;
    });
    if (!created) {
      const id = db.tasks.getRecurrenceNext(orgId, src.id);
      return id ? db.tasks.get(orgId, id) : null;
    }
    await audit(ctx, systemActor(orgId), { type: 'task.created', entity: 'task', entityId: next.id, summary: `Recurring: "${next.title}"`, after: next, undoable: true });
    ctx.internal.scheduleTask(next);
    publishTask(next);
    return next;
  }

  // ── subtasks ──
  async function subtaskChange(actor: Actor, id: string, mutate: (t: Task) => string): Promise<TaskView> {
    const cur = loadEditable(actor, id);
    const next: Task = { ...cur, subtasks: cur.subtasks.map((s) => ({ ...s })) };
    const text = mutate(next);
    const saved = await commit(actor, cur, next, [{ kind: 'subtask', text }], { auditType: 'task.updated', summary: `Updated subtasks of "${cur.title}"` });
    return view(actor, saved);
  }

  // ── list ──
  async function list(actor: Actor, q: TaskQuery = {}): Promise<TaskView[]> {
    const query = v.isObj(q) ? q : {};
    const tz = actorTz(ctx, actor);
    const f: TaskFilter = { visibility: visibility(actor) };
    if (query.assigneeId === 'me') f.assigneeId = actor.memberId;
    else if (query.assigneeId === 'unassigned') f.unassigned = true;
    else if (query.assigneeId) f.assigneeId = v.ref(query.assigneeId, 'assigneeId');
    if (query.projectId === 'none') f.noProject = true;
    else if (query.projectId) f.projectId = v.ref(query.projectId, 'projectId');
    if (query.status !== undefined) {
      const arr = Array.isArray(query.status) ? query.status : String(query.status).split(',').filter(Boolean);
      if (arr.length) f.statuses = arr.map((s) => v.oneOf(s, 'status', STATUSES));
    }
    if (query.search) f.search = v.str(query.search, 'search', { max: 200 });
    if (query.tag) f.tag = v.str(query.tag, 'tag', { max: 40 }).replace(/^#/, '');
    if (query.dueBefore !== undefined) f.dueBefore = v.time(query.dueBefore, 'dueBefore');
    if (query.dueAfter !== undefined) f.dueAfter = v.time(query.dueAfter, 'dueAfter');
    let includeClosed = !!query.includeDone || !!f.statuses;
    const t0 = now();
    switch (query.view) {
      case undefined:
      case 'all':
        if (query.view === 'all') includeClosed = true;
        break;
      case 'today':
        f.dueBefore = Math.min(f.dueBefore ?? Infinity, startOfLocalDay(t0, tz, 1));
        f.order = 'due';
        break;
      case 'upcoming':
        f.dueAfter = Math.max(f.dueAfter ?? -Infinity, startOfLocalDay(t0, tz, 1));
        f.order = 'due';
        break;
      case 'overdue':
        f.dueBefore = Math.min(f.dueBefore ?? Infinity, t0);
        f.order = 'due';
        break;
      case 'waiting':
        f.waiting = true;
        break;
      case 'done':
        f.statuses = ['done'];
        f.order = 'completed';
        includeClosed = true;
        break;
      case 'agents':
        f.assigneeKind = 'agent';
        break;
      default:
        v.bad('view must be one of: today, upcoming, overdue, waiting, done, all, agents');
    }
    if (!includeClosed) f.open = true;
    f.limit = query.limit !== undefined ? v.int(query.limit, 'limit', 1, 1000) : 200;
    f.offset = query.offset !== undefined ? v.int(query.offset, 'offset', 0, 1_000_000) : 0;
    return views(actor.orgId, db.tasks.query(actor.orgId, f), tz);
  }

  // ── comments ──
  async function comment(actor: Actor, id: string, text: string, kind: 'comment' | 'handoff' = 'comment'): Promise<TaskActivity> {
    requireWrite(actor);
    const t = loadVisible(actor, id);
    const body = v.str(text, 'text', { max: 10_000 });
    const k = v.oneOf(kind ?? 'comment', 'kind', ['comment', 'handoff'] as const);
    const a = db.tx(() => {
      const act = addActivity(t, actor.memberId, k, body, null);
      db.tasks.touchActivity(t.orgId, t.id, t.lastActivityAt);
      return act;
    });
    publishActivity(t, [a]);
    publishTask(t);
    // mentions → task_mention; everyone else involved → task_comment
    const members = db.members.list(actor.orgId);
    const mentioned = new Set<string>();
    for (const h of extractMentions(body)) {
      const m = resolveMemberHint(h, members, null);
      if (m && m.id !== actor.memberId) mentioned.add(m.id);
    }
    const who = memberName(actor.orgId, actor.memberId);
    const snippet = body.length > 140 ? body.slice(0, 137) + '…' : body;
    for (const mid of mentioned) {
      await safeNotify(t.orgId, mid, { kind: 'task_mention', title: `${who} mentioned you`, body: `On "${t.title}": ${snippet}`, taskId: t.id, meetingId: null, link: `/tasks/${t.id}`, urgent: false });
    }
    const involved = new Set([...t.assigneeIds, t.creatorId]);
    for (const mid of involved) {
      if (mid === actor.memberId || mentioned.has(mid) || mid === SYSTEM_MEMBER_ID) continue;
      await safeNotify(t.orgId, mid, {
        kind: 'task_comment', title: k === 'handoff' ? `Hand-off from ${who}` : `${who} commented`, body: `On "${t.title}": ${snippet}`, taskId: t.id, meetingId: null, link: `/tasks/${t.id}`, urgent: false,
      });
    }
    return a;
  }

  // ── nudge ──
  async function nudge(actor: Actor, id: string): Promise<TaskView> {
    const cur = loadEditable(actor, id);
    const sent = await sendNudge(cur, actor.memberId);
    if (!sent.ok) throw new AppError(sent.retryAt !== undefined ? 'rate_limited' : 'bad_request', sent.error);
    return view(actor, db.tasks.get(actor.orgId, cur.id)!);
  }

  async function remove(actor: Actor, id: string): Promise<void> {
    requireWrite(actor);
    const t = loadVisible(actor, id);
    const lead = t.projectId ? db.projects.get(t.orgId, t.projectId)?.leadId ?? null : null;
    if (!canDeleteTask(actor, t, lead)) forbidden('Only the creator, the project lead or a manager can delete this task');
    const aud = audience(t);
    db.tasks.delete(actor.orgId, t.id);
    ctx.internal.cancelTask(actor.orgId, t.id);
    await audit(ctx, actor, { type: 'task.deleted', entity: 'task', entityId: t.id, summary: `Deleted "${t.title}"`, before: t, undoable: true });
    publish(ctx, t.orgId, { type: 'task.deleted', taskId: t.id }, aud);
    ctx.internal.invalidateBriefings(t.orgId);
  }

  const service: TaskService = {
    list,
    async get(actor, id) {
      return view(actor, loadVisible(actor, id));
    },
    create,
    quickAdd,
    async preview(actor, text) {
      return draftFromText(actor, text);
    },
    update,
    async complete(actor, id) {
      const cur = loadEditable(actor, id);
      if (cur.status === 'done') return view(actor, cur);
      return update(actor, id, { status: 'done' });
    },
    async reopen(actor, id) {
      const cur = loadEditable(actor, id);
      if (isOpen(cur)) return view(actor, cur);
      return update(actor, id, { status: 'todo' });
    },
    remove,
    async addSubtask(actor, id, title) {
      const tt = v.str(title, 'title', { max: 300 });
      return subtaskChange(actor, id, (t) => {
        if (t.subtasks.length >= 100) v.bad('Too many subtasks (max 100)');
        t.subtasks.push({ id: newId('sub'), title: tt, done: false, doneAt: null, doneBy: null });
        return `Added subtask "${tt}"`;
      });
    },
    async updateSubtask(actor, id, subtaskId, patch) {
      if (!v.isObj(patch)) v.bad('patch must be an object');
      return subtaskChange(actor, id, (t) => {
        const s = t.subtasks.find((x) => x.id === subtaskId);
        if (!s) notFound('Subtask not found');
        if (patch.title !== undefined) s!.title = v.str(patch.title, 'title', { max: 300 });
        if (patch.done !== undefined) {
          const d = v.bool(patch.done, 'done');
          if (d !== s!.done) {
            s!.done = d;
            s!.doneAt = d ? now() : null;
            s!.doneBy = d ? actor.memberId : null;
          }
        }
        return patch.done === true ? `Completed subtask "${s!.title}"` : patch.done === false ? `Reopened subtask "${s!.title}"` : `Renamed subtask to "${s!.title}"`;
      });
    },
    async removeSubtask(actor, id, subtaskId) {
      return subtaskChange(actor, id, (t) => {
        const s = t.subtasks.find((x) => x.id === subtaskId);
        if (!s) notFound('Subtask not found');
        t.subtasks = t.subtasks.filter((x) => x.id !== subtaskId);
        return `Removed subtask "${s!.title}"`;
      });
    },
    comment,
    async activity(actor, id) {
      const t = loadVisible(actor, id);
      return db.activity.list(actor.orgId, t.id);
    },
    nudge,
    async bulk(actor, ids, op) {
      requireWrite(actor);
      if (!Array.isArray(ids) || !ids.length) v.bad('ids must be a non-empty array');
      if (ids.length > 200) v.bad('At most 200 tasks per bulk operation');
      if (!v.isObj(op)) v.bad('op is required');
      const kind = v.oneOf(op.kind, 'op.kind', ['complete', 'delete', 'assign', 'move', 'status'] as const);
      const ok: string[] = [];
      const failed: { id: string; error: string }[] = [];
      for (const raw of [...new Set(ids)]) {
        const id = String(raw);
        try {
          if (kind === 'complete') await service.complete(actor, id);
          else if (kind === 'delete') await remove(actor, id);
          else if (kind === 'assign') await update(actor, id, { assigneeIds: (Array.isArray(op.value) ? op.value : op.value === null || op.value === undefined ? [] : [op.value]) as string[] });
          else if (kind === 'move') await update(actor, id, { projectId: (op.value ?? null) as string | null });
          else await update(actor, id, { status: op.value as TaskStatus });
          ok.push(id);
        } catch (err) {
          failed.push({ id, error: err instanceof AppError ? err.message : 'Failed' });
        }
      }
      return { ok, failed };
    },
  };

  // ── waiting-on nudges (shared with the scheduler) ──
  /** Daily (UTC) counters in kv: { day, n }. */
  const dayOf = (t: number) => Math.floor(t / 86_400_000);
  function quotaUsed(orgId: string, key: string, t: number): number {
    const q = db.kv.get<{ day: number; n: number }>(orgId, key);
    return q && q.day === dayOf(t) ? q.n : 0;
  }
  function quotaBump(orgId: string, key: string, t: number): void {
    db.kv.set(orgId, key, { day: dayOf(t), n: quotaUsed(orgId, key, t) + 1 }, t);
  }

  async function sendNudge(cur: Task, actorId: string): Promise<{ ok: true } | { ok: false; error: string; retryAt?: number }> {
    const w = cur.waitingOn;
    if (!w) return { ok: false, error: 'This task is not waiting on anyone' };
    if (!w.contact) return { ok: false, error: `No contact saved for ${w.name}` };
    if (w.channel === 'other') return { ok: false, error: 'Set the waiting-on channel to WhatsApp or email to send nudges' };
    const t0 = now();
    // Per-task cooldown: manual nudges at most every NUDGE_MIN_HOURS; scheduled ones per their interval.
    const scheduled = actorId === SYSTEM_MEMBER_ID;
    const gap = scheduled ? nudgeIntervalMs(w) : NUDGE_MIN_HOURS * H;
    if (w.lastNudgedAt !== null && t0 - w.lastNudgedAt < gap) {
      const retryAt = w.lastNudgedAt + gap;
      return { ok: false, error: `${w.name} was already nudged recently — try again in ${Math.ceil((retryAt - t0) / 60_000)} min`, retryAt };
    }
    // Daily caps: per member (the one nudging; for scheduled nudges the task's creator) and per org.
    const memberKey = `nudge:quota:${scheduled ? cur.creatorId : actorId}`;
    const nextDay = (dayOf(t0) + 1) * 86_400_000;
    if (quotaUsed(cur.orgId, memberKey, t0) >= NUDGE_MEMBER_DAILY_CAP) {
      return { ok: false, error: `Daily nudge limit reached (${NUDGE_MEMBER_DAILY_CAP} per person) — try again tomorrow`, retryAt: nextDay };
    }
    if (quotaUsed(cur.orgId, 'nudge:quota:org', t0) >= NUDGE_ORG_DAILY_CAP) {
      return { ok: false, error: `Daily nudge limit reached for the organization (${NUDGE_ORG_DAILY_CAP}) — try again tomorrow`, retryAt: nextDay };
    }
    const org = getOrg(ctx, cur.orgId);
    const text = nudgeMessage(w.name, org.name, cur.title);
    let sent = false;
    try {
      sent = w.channel === 'whatsapp'
        ? await ctx.outbound.whatsapp(w.contact, text)
        : await ctx.outbound.email(w.contact, `Following up: ${sanitizeNudgeText(cur.title, NUDGE_TITLE_MAX) || 'your task'}`, text);
    } catch (err) {
      ctx.log.warn('[tasks] nudge send failed', err);
    }
    if (!sent) return { ok: false, error: `Could not send the nudge — ${w.channel === 'whatsapp' ? 'WhatsApp' : 'email'} is not configured or the send failed` };
    quotaBump(cur.orgId, memberKey, t0);
    quotaBump(cur.orgId, 'nudge:quota:org', t0);
    const fresh = db.tasks.get(cur.orgId, cur.id);
    if (!fresh || !fresh.waitingOn) return { ok: true };
    fresh.waitingOn = { ...fresh.waitingOn, lastNudgedAt: t0 };
    fresh.updatedAt = t0;
    const act = db.tx(() => {
      const a = addActivity(fresh, actorId, 'nudge_sent', `Nudged ${w.name} via ${w.channel}`, { channel: w.channel, to: w.contact }, actorId !== SYSTEM_MEMBER_ID);
      db.tasks.save(fresh);
      return a;
    });
    ctx.internal.scheduleTask(fresh);
    publishTask(fresh);
    publishActivity(fresh, [act]);
    return { ok: true };
  }

  return {
    service,
    views,
    publishTask,
    publishTaskDeleted,
    spawnNext,
    audience,
    draftFromText,
    sendNudge,
    addActivity,
  };
}
