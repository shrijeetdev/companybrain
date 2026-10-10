// One-time import of v1 data (already renamed to v1_* by the migration runner) into v2 tables.
// v1 users → members, v1 tasks → tasks, v1 loops → tasks (their court → waitingOn), v1 leads → leads.
// Runs inside the migration transaction; guarded by a kv flag so it can never run twice.

import type BetterSqlite3 from 'better-sqlite3';
import type { Channel, LeadStage, Priority, Recurrence, Role, Subtask, WaitingOn } from '@companybrain/types';
import { atLocalHour } from './time.js';
import { ID_PATTERN, colorFor, defaultPrefs, initialsFor, newId, normEmail, systemTimezone } from './util.js';

const FLAG = 'v1_import_done';
const WORKDAY_END = 18;

function tableExists(db: BetterSqlite3.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function parseDoc<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function mapRole(r: string): Role {
  switch ((r ?? '').toLowerCase()) {
    case 'ceo':
    case 'owner':
    case 'admin':
      return 'owner';
    case 'manager':
      return 'manager';
    case 'client':
      return 'guest';
    case 'agent':
      return 'agent';
    default:
      return 'member';
  }
}

function mapPriority(p: unknown): Priority {
  if (p === 'high') return 'high';
  if (p === 'med' || p === 'medium') return 'medium';
  if (p === 'low') return 'low';
  return 'none';
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

function mapChannel(c: unknown): Channel {
  if (c === 'email' || c === 'whatsapp' || c === 'calendar' || c === 'manual') return c;
  return 'import';
}

function keepId(id: unknown, prefix: string): string {
  return typeof id === 'string' && ID_PATTERN.test(id) ? id : newId(prefix);
}

interface V1User { id: string; org_id: string; email: string; name: string; initials: string | null; role: string; password_hash: string; active: number; created_at: number; updated_at: number }
interface V1Task { id: string; orgId?: string; title?: string; list?: string; day?: string; priority?: string | null; recur?: string | null; assignees?: string[]; createdBy?: string; completed?: boolean; completedAt?: number | null; subtasks?: { id?: string; title?: string; done?: boolean }[]; comments?: { id?: string; text?: string; by?: string; at?: number }[]; dueAt?: number | null; createdAt?: number }
interface V1Loop { id: string; orgId?: string; title?: string; why?: string; side?: string; status?: string; channel?: string; sourceRef?: string; replyTo?: string; ownerId?: string; createdBy?: string; assignedTo?: string[]; dueAt?: number | null; createdAt?: number; updatedAt?: number }
interface V1Lead { id: string; orgId?: string; name?: string; company?: string; title?: string; phone?: string; email?: string; stage?: string; source?: string; what?: string; value?: number | null; createdBy?: string; assignedTo?: string[]; createdAt?: number }

export interface V1ImportResult { orgs: number; members: number; tasks: number; loops: number; leads: number }

export function importV1(db: BetterSqlite3.Database, now = Date.now()): V1ImportResult {
  const result: V1ImportResult = { orgs: 0, members: 0, tasks: 0, loops: 0, leads: 0 };
  const has = { users: tableExists(db, 'v1_users'), tasks: tableExists(db, 'v1_tasks'), loops: tableExists(db, 'v1_loops'), leads: tableExists(db, 'v1_leads') };
  if (!has.users && !has.tasks && !has.loops && !has.leads) return result;
  if (db.prepare("SELECT 1 FROM kv WHERE org_id='' AND key=?").get(FLAG)) return result;

  const tz = systemTimezone();

  // ── orgs ──
  const orgIds = new Set<string>();
  for (const t of ['users', 'tasks', 'loops', 'leads'] as const) {
    if (!has[t]) continue;
    for (const r of db.prepare(`SELECT DISTINCT org_id FROM v1_${t}`).all() as { org_id: string }[]) if (r.org_id) orgIds.add(r.org_id);
  }
  const insOrg = db.prepare(`INSERT OR IGNORE INTO orgs (id, name, timezone, created_at, updated_at, escalate_after_min) VALUES (?,?,?,?,?,1440)`);
  for (const id of orgIds) {
    if (insOrg.run(id, 'My Company', tz, now, now).changes) result.orgs++;
  }

  // ── members ──
  const memberIds = new Map<string, Set<string>>(); // org → ids
  const memberByKey = new Map<string, string>(); // org|lc(name/email/initials) → id
  const note = (org: string, id: string, keys: (string | null | undefined)[]) => {
    if (!memberIds.has(org)) memberIds.set(org, new Set());
    memberIds.get(org)!.add(id);
    for (const k of keys) if (k) memberByKey.set(`${org}|${k.toLowerCase()}`, id);
  };
  if (has.users) {
    const ins = db.prepare(`INSERT OR IGNORE INTO members (id, org_id, kind, role, name, email, email_lc, initials, color, timezone, active, prefs, password_hash, agent_provider, agent_description, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const u of db.prepare('SELECT * FROM v1_users ORDER BY created_at').all() as V1User[]) {
      const role = mapRole(u.role);
      const kind = role === 'agent' ? 'agent' : 'human';
      const id = keepId(u.id, 'mem');
      const name = (u.name || u.email || 'Member').trim();
      const r = ins.run(id, u.org_id, kind, role, name, u.email || null, normEmail(u.email), u.initials || initialsFor(name), colorFor(id), tz, u.active ? 1 : 0,
        JSON.stringify(defaultPrefs(kind)), kind === 'human' ? u.password_hash : null, kind === 'agent' ? 'custom' : null, kind === 'agent' ? 'Imported from v1' : null,
        u.created_at || now, u.updated_at || now);
      if (r.changes) result.members++;
      note(u.org_id, id, [u.id, id, u.email, name, name.split(/\s+/)[0], u.initials]);
    }
  }
  const resolveMembers = (org: string, refs: (string | undefined | null)[] | undefined): string[] => {
    const out = new Set<string>();
    for (const ref of refs ?? []) {
      if (!ref) continue;
      if (memberIds.get(org)?.has(ref)) out.add(ref);
      else {
        const hit = memberByKey.get(`${org}|${ref.toLowerCase()}`);
        if (hit) out.add(hit);
      }
    }
    return [...out];
  };
  const resolveOne = (org: string, ref: string | undefined | null): string | null => resolveMembers(org, [ref])[0] ?? null;

  // ── tasks (shared insert) ──
  const insTask = db.prepare(`INSERT OR IGNORE INTO tasks (id, org_id, title, notes, status, priority, priority_rank, creator_id, due_at, due_all_day, recurrence, waiting_on, is_waiting,
      tags, subtasks, source_channel, source_ref, source_from, sort_order, completed_at, completed_by, last_activity_at, created_at, updated_at)
    VALUES (@id, @org, @title, @notes, @status, @priority, @rank, @creator, @due, @allDay, @recurrence, @waiting, @isWaiting, @tags, @subtasks, @channel, @ref, @from, @order, @completedAt, @completedBy, @last, @created, @updated)`);
  const insAssignee = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, member_id, org_id) VALUES (?,?,?)');
  const insActivity = db.prepare('INSERT INTO task_activity (id, org_id, task_id, actor_id, kind, text, data, at) VALUES (?,?,?,?,?,?,?,?)');

  if (has.tasks) {
    for (const row of db.prepare('SELECT id, org_id, day, doc FROM v1_tasks').all() as { id: string; org_id: string; day: string | null; doc: string }[]) {
      const t = parseDoc<V1Task>(row.doc);
      if (!t) continue;
      const org = row.org_id;
      const id = keepId(row.id, 'task');
      const created = t.createdAt ?? now;
      let due: number | null = typeof t.dueAt === 'number' ? t.dueAt : null;
      let allDay = false;
      const day = t.day ?? row.day;
      if (due === null && (day === 'today' || day === 'tomorrow')) {
        due = atLocalHour(now, tz, WORKDAY_END, 0, day === 'tomorrow' ? 1 : 0);
        allDay = true;
      }
      const recurFreq = t.recur === 'Daily' ? 'daily' : t.recur === 'Weekly' ? 'weekly' : t.recur === 'Monthly' ? 'monthly' : null;
      const recurrence: Recurrence | null = recurFreq ? { freq: recurFreq, interval: 1 } : null;
      const subtasks: Subtask[] = (t.subtasks ?? []).filter((s) => s && s.title).map((s) => ({ id: keepId(s.id, 'sub'), title: String(s.title), done: !!s.done, doneAt: null, doneBy: null }));
      const priority = mapPriority(t.priority);
      const creator = resolveOne(org, t.createdBy) ?? t.createdBy ?? 'system';
      const done = !!t.completed;
      const comments = (t.comments ?? []).filter((c) => c && c.text);
      const last = Math.max(created, t.completedAt ?? 0, ...comments.map((c) => c.at ?? 0));
      const r = insTask.run({
        id, org, title: (t.title ?? 'Untitled').slice(0, 500), notes: '', status: done ? 'done' : 'todo', priority, rank: PRIORITY_RANK[priority], creator,
        due, allDay: allDay ? 1 : 0, recurrence: recurrence ? JSON.stringify(recurrence) : null, waiting: null, isWaiting: 0,
        tags: JSON.stringify(t.list && t.list !== 'Inbox' ? [t.list] : []), subtasks: JSON.stringify(subtasks), channel: 'import', ref: row.id, from: null,
        order: created, completedAt: done ? (t.completedAt ?? now) : null, completedBy: done ? creator : null, last, created, updated: last,
      });
      if (!r.changes) continue;
      result.tasks++;
      for (const m of resolveMembers(org, t.assignees)) insAssignee.run(id, m, org);
      for (const c of comments) insActivity.run(newId('act'), org, id, resolveOne(org, c.by) ?? c.by ?? 'system', 'comment', String(c.text), null, c.at ?? created);
      insActivity.run(newId('act'), org, id, 'system', 'created', 'Imported from v1', JSON.stringify({ v1Id: row.id }), now);
    }
  }

  if (has.loops) {
    for (const row of db.prepare('SELECT id, org_id, doc FROM v1_loops').all() as { id: string; org_id: string; doc: string }[]) {
      const l = parseDoc<V1Loop>(row.doc);
      if (!l) continue;
      const org = row.org_id;
      const id = keepId(row.id, 'task');
      const created = l.createdAt ?? now;
      const updated = l.updatedAt ?? created;
      const closed = l.status === 'closed';
      const channel = l.channel === 'whatsapp' ? 'whatsapp' : l.channel === 'email' ? 'email' : 'other';
      const waiting: WaitingOn | null = l.side === 'theirs'
        ? { name: l.replyTo || 'Them', contact: l.replyTo || null, channel, nudgeEveryHours: null, lastNudgedAt: null, since: created }
        : null;
      const creator = resolveOne(org, l.createdBy) ?? l.createdBy ?? 'system';
      const r = insTask.run({
        id, org, title: (l.title ?? 'Untitled').slice(0, 500), notes: l.why ?? '', status: closed ? 'done' : 'todo', priority: 'none', rank: PRIORITY_RANK.none, creator,
        due: typeof l.dueAt === 'number' ? l.dueAt : null, allDay: 0, recurrence: null, waiting: waiting ? JSON.stringify(waiting) : null, isWaiting: waiting ? 1 : 0,
        tags: '[]', subtasks: '[]', channel: mapChannel(l.channel), ref: l.sourceRef ?? row.id, from: l.replyTo ?? null,
        order: created, completedAt: closed ? updated : null, completedBy: closed ? creator : null, last: updated, created, updated,
      });
      if (!r.changes) continue;
      result.loops++;
      for (const m of resolveMembers(org, [...(l.assignedTo ?? []), l.ownerId])) insAssignee.run(id, m, org);
      insActivity.run(newId('act'), org, id, 'system', 'created', 'Imported from v1 loop', JSON.stringify({ v1Id: row.id }), now);
    }
  }

  if (has.leads) {
    const ins = db.prepare(`INSERT OR IGNORE INTO leads (id, org_id, name, company, email, phone, stage, value, notes, owner_id, source, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const STAGES: LeadStage[] = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost'];
    for (const row of db.prepare('SELECT id, org_id, doc FROM v1_leads').all() as { id: string; org_id: string; doc: string }[]) {
      const l = parseDoc<V1Lead>(row.doc);
      if (!l) continue;
      const org = row.org_id;
      const stage = STAGES.includes(l.stage as LeadStage) ? (l.stage as LeadStage) : 'new';
      const notes = [l.title, l.what].filter(Boolean).join('\n');
      const created = l.createdAt ?? now;
      const r = ins.run(keepId(row.id, 'lead'), org, l.name || 'Unnamed', l.company ?? '', l.email ?? '', l.phone ?? '', stage, typeof l.value === 'number' ? l.value : null,
        notes, resolveOne(org, l.assignedTo?.[0]), mapChannel(l.source), resolveOne(org, l.createdBy) ?? l.createdBy ?? 'system', created, created);
      if (r.changes) result.leads++;
    }
  }

  db.prepare("INSERT INTO kv (org_id, key, value, updated_at) VALUES ('', ?, ?, ?)").run(FLAG, JSON.stringify(result), now);
  return result;
}
