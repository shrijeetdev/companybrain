// Projects, tasks (+ assignees), task activity.

import type BetterSqlite3 from 'better-sqlite3';
import type { ActivityKind, Priority, Project, ProjectStatus, Recurrence, Subtask, Task, TaskActivity, TaskStatus, WaitingOn } from '@companybrain/types';
import { json, parseJson } from './identity.js';

type SQL = BetterSqlite3.Database;
type Row = Record<string, any>;

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/** Who may see what. `all` = managers+ / system. */
export type Visibility =
  | { mode: 'all' }
  | { mode: 'member' | 'agent' | 'guest'; memberId: string };

/** SQL predicate: project `p` visible to @vis (expects alias p). */
function projectVisibleSql(v: Visibility): string {
  if (v.mode === 'all' || v.mode === 'agent') return '1=1';
  const explicit = `(p.lead_id=@vis OR p.created_by=@vis OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.member_id=@vis))`;
  if (v.mode === 'guest') return explicit;
  // members: explicit membership, or an open project (no member list)
  return `(${explicit} OR NOT EXISTS (SELECT 1 FROM project_members pm2 WHERE pm2.project_id=p.id))`;
}

/** SQL predicate: task `t` visible to @vis (expects alias t). */
function taskVisibleSql(v: Visibility): string {
  if (v.mode === 'all') return '1=1';
  const own = `(t.creator_id=@vis OR EXISTS (SELECT 1 FROM task_assignees va WHERE va.task_id=t.id AND va.member_id=@vis))`;
  if (v.mode === 'agent') return `(${own} OR t.project_id IS NOT NULL)`;
  return `(${own} OR (t.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.id=t.project_id AND ${projectVisibleSql(v)})))`;
}

// ─── projects ────────────────────────────────────────────────────────────────

function rowToProject(r: Row, memberIds: string[]): Project {
  return {
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    emoji: r.emoji,
    color: r.color,
    description: r.description,
    status: r.status as ProjectStatus,
    leadId: r.lead_id ?? null,
    memberIds,
    dueAt: r.due_at ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface ProjectCounts { total: number; open: number; done: number; cancelled: number; overdue: number; dueThisWeek: number }

export function projectRepo(db: SQL) {
  const membersOf = (ids: string[]): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    if (!ids.length) return map;
    for (const r of db.prepare('SELECT project_id, member_id FROM project_members WHERE project_id IN (SELECT value FROM json_each(?)) ORDER BY rowid').all(JSON.stringify(ids)) as Row[]) {
      if (!map.has(r.project_id)) map.set(r.project_id, []);
      map.get(r.project_id)!.push(r.member_id);
    }
    return map;
  };
  const hydrate = (rows: Row[]) => {
    const m = membersOf(rows.map((r) => r.id));
    return rows.map((r) => rowToProject(r, m.get(r.id) ?? []));
  };
  const setMembers = (p: Project) => {
    db.prepare('DELETE FROM project_members WHERE project_id=?').run(p.id);
    const ins = db.prepare('INSERT OR IGNORE INTO project_members (project_id, member_id) VALUES (?,?)');
    for (const m of p.memberIds) ins.run(p.id, m);
  };
  return {
    list(orgId: string, opts: { includeArchived?: boolean; visibility?: Visibility } = {}): Project[] {
      const v = opts.visibility ?? { mode: 'all' };
      let sql = `SELECT p.* FROM projects p WHERE p.org_id=@orgId AND ${projectVisibleSql(v)}`;
      if (!opts.includeArchived) sql += " AND p.status != 'archived'";
      sql += ' ORDER BY p.status, p.name COLLATE NOCASE';
      return hydrate(db.prepare(sql).all({ orgId, vis: v.mode === 'all' ? null : v.memberId }) as Row[]);
    },
    get(orgId: string, id: string, visibility?: Visibility): Project | null {
      const v = visibility ?? { mode: 'all' };
      const r = db.prepare(`SELECT p.* FROM projects p WHERE p.org_id=@orgId AND p.id=@id AND ${projectVisibleSql(v)}`).get({ orgId, id, vis: v.mode === 'all' ? null : v.memberId }) as Row | undefined;
      return r ? hydrate([r])[0]! : null;
    },
    insert(p: Project): void {
      db.prepare(`INSERT INTO projects (id, org_id, name, emoji, color, description, status, lead_id, due_at, created_by, created_at, updated_at)
        VALUES (@id, @orgId, @name, @emoji, @color, @description, @status, @leadId, @dueAt, @createdBy, @createdAt, @updatedAt)`).run({ ...p, memberIds: undefined });
      setMembers(p);
    },
    save(p: Project): void {
      db.prepare(`UPDATE projects SET name=@name, emoji=@emoji, color=@color, description=@description, status=@status, lead_id=@leadId, due_at=@dueAt, updated_at=@updatedAt
        WHERE org_id=@orgId AND id=@id`).run({ ...p, memberIds: undefined });
      setMembers(p);
    },
    delete(orgId: string, id: string): void {
      db.prepare('DELETE FROM projects WHERE org_id=? AND id=?').run(orgId, id);
    },
    /** Task counts per project (whole project, regardless of viewer). */
    counts(orgId: string, projectIds: string[], now: number, weekEnd: number): Map<string, ProjectCounts> {
      const out = new Map<string, ProjectCounts>();
      if (!projectIds.length) return out;
      const rows = db.prepare(`SELECT project_id,
          COUNT(*) total,
          SUM(CASE WHEN status NOT IN ('done','cancelled') THEN 1 ELSE 0 END) open,
          SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done,
          SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) cancelled,
          SUM(CASE WHEN status NOT IN ('done','cancelled') AND due_at IS NOT NULL AND due_at < @now THEN 1 ELSE 0 END) overdue,
          SUM(CASE WHEN status NOT IN ('done','cancelled') AND due_at IS NOT NULL AND due_at >= @now AND due_at < @weekEnd THEN 1 ELSE 0 END) due_week
        FROM tasks WHERE org_id=@orgId AND project_id IN (SELECT value FROM json_each(@ids)) GROUP BY project_id`).all({ orgId, ids: JSON.stringify(projectIds), now, weekEnd }) as Row[];
      for (const r of rows) out.set(r.project_id, { total: r.total, open: r.open ?? 0, done: r.done ?? 0, cancelled: r.cancelled ?? 0, overdue: r.overdue ?? 0, dueThisWeek: r.due_week ?? 0 });
      return out;
    },
    /** Ids of tasks in a project (used for delete snapshots so undo can re-link them). */
    taskIds(orgId: string, id: string): string[] {
      return (db.prepare('SELECT id FROM tasks WHERE org_id=? AND project_id=?').all(orgId, id) as Row[]).map((r) => r.id);
    },
    relinkTasks(orgId: string, id: string, taskIds: string[]): void {
      db.prepare('UPDATE tasks SET project_id=? WHERE org_id=? AND project_id IS NULL AND id IN (SELECT value FROM json_each(?))').run(id, orgId, JSON.stringify(taskIds));
    },
  };
}

// ─── tasks ───────────────────────────────────────────────────────────────────

export interface TaskFilter {
  visibility?: Visibility;
  ids?: string[];
  assigneeId?: string;
  unassigned?: boolean;
  /** At least one assignee of this kind. */
  assigneeKind?: 'agent' | 'human';
  /** Assignee or creator. */
  involvedId?: string;
  creatorId?: string;
  projectId?: string;
  noProject?: boolean;
  statuses?: TaskStatus[];
  priorities?: Priority[];
  open?: boolean;
  /** Closed (done/cancelled) tasks only when closed at/after this time (completed_at, else updated_at). Open tasks pass. */
  closedSince?: number;
  dueBefore?: number;
  dueAfter?: number;
  hasDue?: boolean;
  waiting?: boolean;
  search?: string;
  tag?: string;
  completedAfter?: number;
  createdAfter?: number;
  lastActivityBefore?: number;
  recurrenceParentId?: string;
  order?: 'default' | 'due' | 'updated' | 'completed' | 'created';
  limit?: number;
  offset?: number;
}

function rowToTask(r: Row, assigneeIds: string[]): Task {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id ?? null,
    title: r.title,
    notes: r.notes,
    status: r.status,
    priority: r.priority,
    assigneeIds,
    creatorId: r.creator_id,
    dueAt: r.due_at ?? null,
    dueAllDay: !!r.due_all_day,
    reminderOffsets: parseJson<number[] | null>(r.reminder_offsets, null),
    recurrence: parseJson<Recurrence | null>(r.recurrence, null),
    recurrenceParentId: r.recurrence_parent_id ?? null,
    waitingOn: parseJson<WaitingOn | null>(r.waiting_on, null),
    tags: parseJson<string[]>(r.tags, []),
    subtasks: parseJson<Subtask[]>(r.subtasks, []),
    source: { channel: r.source_channel, ref: r.source_ref ?? null, from: r.source_from ?? null },
    order: r.sort_order,
    startedAt: r.started_at ?? null,
    completedAt: r.completed_at ?? null,
    completedBy: r.completed_by ?? null,
    lastActivityAt: r.last_activity_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function taskParams(t: Task) {
  return {
    id: t.id,
    orgId: t.orgId,
    projectId: t.projectId,
    title: t.title,
    notes: t.notes,
    status: t.status,
    priority: t.priority,
    rank: PRIORITY_RANK[t.priority] ?? 4,
    creatorId: t.creatorId,
    dueAt: t.dueAt,
    dueAllDay: t.dueAllDay ? 1 : 0,
    reminderOffsets: json(t.reminderOffsets),
    recurrence: json(t.recurrence),
    recurrenceParentId: t.recurrenceParentId,
    waitingOn: json(t.waitingOn),
    isWaiting: t.waitingOn ? 1 : 0,
    tags: JSON.stringify(t.tags),
    subtasks: JSON.stringify(t.subtasks),
    sourceChannel: t.source.channel,
    sourceRef: t.source.ref,
    sourceFrom: t.source.from,
    order: t.order,
    startedAt: t.startedAt,
    completedAt: t.completedAt,
    completedBy: t.completedBy,
    lastActivityAt: t.lastActivityAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

const ORDER: Record<NonNullable<TaskFilter['order']>, string> = {
  default: "CASE WHEN t.status IN ('done','cancelled') THEN 1 ELSE 0 END, CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at, t.priority_rank, t.sort_order, t.created_at",
  due: 'CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at, t.priority_rank, t.created_at',
  updated: 't.updated_at DESC',
  completed: 't.completed_at DESC',
  created: 't.created_at DESC',
};

export function taskRepo(db: SQL) {
  const assigneesOf = (ids: string[]): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    if (!ids.length) return map;
    for (const r of db.prepare('SELECT task_id, member_id FROM task_assignees WHERE task_id IN (SELECT value FROM json_each(?)) ORDER BY rowid').all(JSON.stringify(ids)) as Row[]) {
      if (!map.has(r.task_id)) map.set(r.task_id, []);
      map.get(r.task_id)!.push(r.member_id);
    }
    return map;
  };
  const hydrate = (rows: Row[]): Task[] => {
    const a = assigneesOf(rows.map((r) => r.id));
    return rows.map((r) => rowToTask(r, a.get(r.id) ?? []));
  };
  const setAssignees = (t: Task) => {
    db.prepare('DELETE FROM task_assignees WHERE task_id=?').run(t.id);
    const ins = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, member_id, org_id) VALUES (?,?,?)');
    for (const m of t.assigneeIds) ins.run(t.id, m, t.orgId);
  };
  const COLS = `id, org_id, project_id, title, notes, status, priority, priority_rank, creator_id, due_at, due_all_day, reminder_offsets, recurrence, recurrence_parent_id,
    waiting_on, is_waiting, tags, subtasks, source_channel, source_ref, source_from, sort_order, started_at, completed_at, completed_by, last_activity_at, created_at, updated_at`;
  const VALS = `@id, @orgId, @projectId, @title, @notes, @status, @priority, @rank, @creatorId, @dueAt, @dueAllDay, @reminderOffsets, @recurrence, @recurrenceParentId,
    @waitingOn, @isWaiting, @tags, @subtasks, @sourceChannel, @sourceRef, @sourceFrom, @order, @startedAt, @completedAt, @completedBy, @lastActivityAt, @createdAt, @updatedAt`;

  function where(orgId: string, f: TaskFilter): { sql: string; params: Record<string, unknown> } {
    const v = f.visibility ?? { mode: 'all' };
    const c: string[] = ['t.org_id=@orgId', taskVisibleSql(v)];
    const p: Record<string, unknown> = { orgId, vis: v.mode === 'all' ? null : v.memberId };
    if (f.ids) { c.push('t.id IN (SELECT value FROM json_each(@ids))'); p.ids = JSON.stringify(f.ids); }
    if (f.assigneeId) { c.push('EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id=t.id AND a.member_id=@assigneeId)'); p.assigneeId = f.assigneeId; }
    if (f.unassigned) c.push('NOT EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id=t.id)');
    if (f.assigneeKind) { c.push('EXISTS (SELECT 1 FROM task_assignees a JOIN members m ON m.id=a.member_id WHERE a.task_id=t.id AND m.kind=@assigneeKind)'); p.assigneeKind = f.assigneeKind; }
    if (f.involvedId) { c.push('(t.creator_id=@involvedId OR EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id=t.id AND a.member_id=@involvedId))'); p.involvedId = f.involvedId; }
    if (f.creatorId) { c.push('t.creator_id=@creatorId'); p.creatorId = f.creatorId; }
    if (f.projectId) { c.push('t.project_id=@projectId'); p.projectId = f.projectId; }
    if (f.noProject) c.push('t.project_id IS NULL');
    if (f.statuses?.length) { c.push('t.status IN (SELECT value FROM json_each(@statuses))'); p.statuses = JSON.stringify(f.statuses); }
    if (f.open) c.push("t.status NOT IN ('done','cancelled')");
    if (f.priorities?.length) { c.push('t.priority IN (SELECT value FROM json_each(@priorities))'); p.priorities = JSON.stringify(f.priorities); }
    if (f.closedSince !== undefined) {
      c.push("(t.status NOT IN ('done','cancelled') OR COALESCE(t.completed_at, t.updated_at) >= @closedSince)");
      p.closedSince = f.closedSince;
    }
    if (f.dueBefore !== undefined) { c.push('t.due_at IS NOT NULL AND t.due_at < @dueBefore'); p.dueBefore = f.dueBefore; }
    if (f.dueAfter !== undefined) { c.push('t.due_at IS NOT NULL AND t.due_at >= @dueAfter'); p.dueAfter = f.dueAfter; }
    if (f.hasDue === true) c.push('t.due_at IS NOT NULL');
    if (f.hasDue === false) c.push('t.due_at IS NULL');
    if (f.waiting === true) c.push('t.is_waiting=1');
    if (f.waiting === false) c.push('t.is_waiting=0');
    if (f.search) {
      c.push("(t.title LIKE @search ESCAPE '\\' OR t.notes LIKE @search ESCAPE '\\')");
      p.search = `%${f.search.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    }
    if (f.tag) { c.push('EXISTS (SELECT 1 FROM json_each(t.tags) jt WHERE lower(jt.value)=lower(@tag))'); p.tag = f.tag; }
    if (f.completedAfter !== undefined) { c.push('t.completed_at IS NOT NULL AND t.completed_at >= @completedAfter'); p.completedAfter = f.completedAfter; }
    if (f.createdAfter !== undefined) { c.push('t.created_at >= @createdAfter'); p.createdAfter = f.createdAfter; }
    if (f.lastActivityBefore !== undefined) { c.push('t.last_activity_at < @lastActivityBefore'); p.lastActivityBefore = f.lastActivityBefore; }
    if (f.recurrenceParentId) { c.push('t.recurrence_parent_id=@recurrenceParentId'); p.recurrenceParentId = f.recurrenceParentId; }
    return { sql: c.join(' AND '), params: p };
  }

  return {
    insert(t: Task): void {
      db.prepare(`INSERT INTO tasks (${COLS}) VALUES (${VALS})`).run(taskParams(t));
      setAssignees(t);
    },
    save(t: Task): void {
      db.prepare(`UPDATE tasks SET project_id=@projectId, title=@title, notes=@notes, status=@status, priority=@priority, priority_rank=@rank, creator_id=@creatorId,
          due_at=@dueAt, due_all_day=@dueAllDay, reminder_offsets=@reminderOffsets, recurrence=@recurrence, recurrence_parent_id=@recurrenceParentId, waiting_on=@waitingOn,
          is_waiting=@isWaiting, tags=@tags, subtasks=@subtasks, source_channel=@sourceChannel, source_ref=@sourceRef, source_from=@sourceFrom, sort_order=@order,
          started_at=@startedAt, completed_at=@completedAt, completed_by=@completedBy, last_activity_at=@lastActivityAt, updated_at=@updatedAt
        WHERE org_id=@orgId AND id=@id`).run(taskParams(t));
      setAssignees(t);
    },
    get(orgId: string, id: string, visibility?: Visibility): Task | null {
      const w = where(orgId, { visibility, ids: [id] });
      const r = db.prepare(`SELECT t.* FROM tasks t WHERE ${w.sql}`).get(w.params) as Row | undefined;
      return r ? hydrate([r])[0]! : null;
    },
    exists(orgId: string, id: string): boolean {
      return !!db.prepare('SELECT 1 FROM tasks WHERE org_id=? AND id=?').get(orgId, id);
    },
    delete(orgId: string, id: string): void {
      db.prepare('DELETE FROM tasks WHERE org_id=? AND id=?').run(orgId, id);
    },
    query(orgId: string, f: TaskFilter = {}): Task[] {
      const w = where(orgId, f);
      const limit = Math.min(Math.max(f.limit ?? 500, 1), 5000);
      const offset = Math.max(f.offset ?? 0, 0);
      const rows = db.prepare(`SELECT t.* FROM tasks t WHERE ${w.sql} ORDER BY ${ORDER[f.order ?? 'default']} LIMIT ${limit} OFFSET ${offset}`).all(w.params) as Row[];
      return hydrate(rows);
    },
    count(orgId: string, f: TaskFilter = {}): number {
      const w = where(orgId, f);
      return (db.prepare(`SELECT COUNT(*) c FROM tasks t WHERE ${w.sql}`).get(w.params) as Row).c;
    },
    /** Comment + handoff counts per task. */
    commentCounts(orgId: string, ids: string[]): Map<string, number> {
      const out = new Map<string, number>();
      if (!ids.length) return out;
      for (const r of db.prepare("SELECT task_id, COUNT(*) c FROM task_activity WHERE org_id=? AND kind IN ('comment','handoff') AND task_id IN (SELECT value FROM json_each(?)) GROUP BY task_id")
        .all(orgId, JSON.stringify(ids)) as Row[]) out.set(r.task_id, r.c);
      return out;
    },
    /** The recurring series' occurrence at a due time (idempotent spawn check). */
    findOccurrence(orgId: string, parentId: string, dueAt: number | null): Task | null {
      const r = db.prepare('SELECT t.* FROM tasks t WHERE t.org_id=? AND t.recurrence_parent_id=? AND t.due_at IS ?').get(orgId, parentId, dueAt) as Row | undefined;
      return r ? hydrate([r])[0]! : null;
    },
    getRecurrenceNext(orgId: string, id: string): string | null {
      const r = db.prepare('SELECT recurrence_next_id FROM tasks WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r?.recurrence_next_id ?? null;
    },
    /** Claims the "next occurrence" slot. Returns false if already claimed (spawn exactly once). */
    claimRecurrenceNext(orgId: string, id: string, nextId: string): boolean {
      return db.prepare('UPDATE tasks SET recurrence_next_id=? WHERE org_id=? AND id=? AND recurrence_next_id IS NULL').run(nextId, orgId, id).changes === 1;
    },
    setRecurrenceNext(orgId: string, id: string, nextId: string): void {
      db.prepare('UPDATE tasks SET recurrence_next_id=? WHERE org_id=? AND id=?').run(nextId, orgId, id);
    },
    touchActivity(orgId: string, id: string, at: number): void {
      db.prepare('UPDATE tasks SET last_activity_at=? WHERE org_id=? AND id=?').run(at, orgId, id);
    },
    /** Task ids assigned to a member (open only by default). */
    tasksAssignedTo(orgId: string, memberId: string, openOnly = true): string[] {
      return (db.prepare(`SELECT a.task_id FROM task_assignees a JOIN tasks t ON t.id=a.task_id WHERE a.org_id=? AND a.member_id=? ${openOnly ? "AND t.status NOT IN ('done','cancelled')" : ''}`)
        .all(orgId, memberId) as Row[]).map((r) => r.task_id);
    },
  };
}

// ─── activity ────────────────────────────────────────────────────────────────

function rowToActivity(r: Row): TaskActivity {
  return { id: r.id, orgId: r.org_id, taskId: r.task_id, actorId: r.actor_id, kind: r.kind as ActivityKind, text: r.text, data: parseJson(r.data, null), at: r.at };
}

export function activityRepo(db: SQL) {
  return {
    insert(a: TaskActivity): void {
      db.prepare('INSERT INTO task_activity (id, org_id, task_id, actor_id, kind, text, data, at) VALUES (?,?,?,?,?,?,?,?)')
        .run(a.id, a.orgId, a.taskId, a.actorId, a.kind, a.text, json(a.data), a.at);
    },
    list(orgId: string, taskId: string, limit = 500): TaskActivity[] {
      return (db.prepare('SELECT * FROM task_activity WHERE org_id=? AND task_id=? ORDER BY at, rowid LIMIT ?').all(orgId, taskId, limit) as Row[]).map(rowToActivity);
    },
    countKind(orgId: string, taskId: string, kind: ActivityKind): number {
      return (db.prepare('SELECT COUNT(*) c FROM task_activity WHERE org_id=? AND task_id=? AND kind=?').get(orgId, taskId, kind) as Row).c;
    },
  };
}
