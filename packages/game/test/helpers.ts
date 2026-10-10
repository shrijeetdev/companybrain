// Test harness: in-memory SQLite + fake CoreServices/LiveBus + fake clock + audit emitter.

import Database from 'better-sqlite3';
import type {
  Actor, AuditEvent, CoreServices, LiveEvent, Member, Priority, Project, Role, TaskQuery, TaskView,
} from '@companybrain/types';
import { AppError } from '@companybrain/types';
import { createGame, seededRandom, type Game } from '../src/index';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
/** Monday 2026-10-05 12:00 UTC. */
export const MON_NOON = Date.UTC(2026, 9, 5, 12, 0, 0);

export interface Published { orgId: string; event: LiveEvent; memberIds?: string[] }

export class World {
  now = MON_NOON;
  members: Member[] = [];
  tasks: TaskView[] = [];
  projects: Project[] = [];
  published: Published[] = [];
  events: AuditEvent[] = [];
  db = new Database(':memory:');
  game: Game;
  private seq = 0;

  constructor(random: () => number = seededRandom(42)) {
    this.game = createGame({
      sqlite: this.db,
      services: this.services(),
      clock: () => this.now,
      random,
      log: { info() {}, warn() {}, error() {} },
    });
  }

  member(id: string, o: { org?: string; kind?: 'human' | 'agent'; tz?: string; role?: Role; name?: string } = {}): Member {
    const m: Member = {
      id, orgId: o.org ?? 'org1', kind: o.kind ?? 'human', role: o.role ?? (o.kind === 'agent' ? 'agent' : 'member'),
      name: o.name ?? id[0]!.toUpperCase() + id.slice(1), email: null, phone: null, title: null, initials: id.slice(0, 2).toUpperCase(),
      color: '#000', avatarUrl: null, timezone: o.tz ?? 'UTC', active: true,
      prefs: { briefingVoice: 'off', digestHour: null, notifyPush: false, notifyWhatsapp: false, notifyEmail: false, quietStart: null, quietEnd: null, theme: 'tactical', sound: true },
      agent: null, createdAt: 0, updatedAt: 0,
    };
    this.members.push(m);
    return m;
  }

  actor(id: string, extra: Partial<Actor> = {}): Actor {
    const m = this.members.find((x) => x.id === id)!;
    return { orgId: m.orgId, memberId: id, role: m.role, kind: m.kind, via: 'session', ...extra };
  }

  project(id: string, o: { lead?: string; members?: string[]; org?: string; name?: string } = {}): Project {
    const p: Project = {
      id, orgId: o.org ?? 'org1', name: o.name ?? id, emoji: '🎯', color: '#f00', description: '', status: 'active',
      leadId: o.lead ?? null, memberIds: o.members ?? [], dueAt: null, createdBy: 'system', createdAt: 0, updatedAt: 0,
    };
    this.projects.push(p);
    return p;
  }

  private snap(t: TaskView | undefined): Record<string, unknown> | null {
    return t ? (JSON.parse(JSON.stringify(t)) as Record<string, unknown>) : null;
  }

  async emit(type: string, actorId: string, before: TaskView | undefined, after: TaskView | undefined, at = this.now): Promise<AuditEvent> {
    const e: AuditEvent = {
      id: `aud_${++this.seq}`, orgId: (after ?? before)!.orgId, actorId, type, entity: 'task', entityId: (after ?? before)!.id,
      summary: type, before: this.snap(before), after: this.snap(after), undoable: true, undoneAt: null, undoneBy: null, at,
    };
    this.events.push(e);
    await this.game.onAudit(e);
    return e;
  }

  async create(by: string, o: { id?: string; title?: string; priority?: Priority; assignees?: string[]; dueAt?: number | null; projectId?: string | null; subtasks?: number; org?: string } = {}): Promise<TaskView> {
    const id = o.id ?? `task_${++this.seq}`;
    const t: TaskView = {
      id, orgId: o.org ?? this.members.find((m) => m.id === by)?.orgId ?? 'org1', projectId: o.projectId ?? null,
      title: o.title ?? `Mission ${id}`, notes: '', status: 'todo', priority: o.priority ?? 'medium',
      assigneeIds: o.assignees ?? [by], creatorId: by, dueAt: o.dueAt ?? null, dueAllDay: false, reminderOffsets: null,
      recurrence: null, recurrenceParentId: null, waitingOn: null, tags: [],
      subtasks: Array.from({ length: o.subtasks ?? 0 }, (_, i) => ({ id: `${id}_s${i}`, title: `Objective ${i}`, done: false, doneAt: null, doneBy: null })),
      source: { channel: 'manual', ref: null, from: null }, order: 0, startedAt: null, completedAt: null, completedBy: null,
      lastActivityAt: this.now, createdAt: this.now, updatedAt: this.now, isOverdue: false, isDueToday: false, isStale: false, commentCount: 0,
    };
    this.tasks.push(t);
    await this.emit('task.created', by, undefined, t);
    return t;
  }

  private find(id: string): TaskView {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) throw new Error(`no task ${id}`);
    return t;
  }

  async complete(id: string, by: string): Promise<AuditEvent> {
    const t = this.find(id);
    const before = structuredClone(t);
    Object.assign(t, { status: 'done', completedAt: this.now, completedBy: by, updatedAt: this.now });
    return this.emit('task.completed', by, before, t);
  }

  async reopen(id: string, by: string): Promise<AuditEvent> {
    const t = this.find(id);
    const before = structuredClone(t);
    Object.assign(t, { status: 'todo', completedAt: null, completedBy: null, updatedAt: this.now });
    return this.emit('task.reopened', by, before, t);
  }

  async checkSubtask(id: string, idx: number, by: string): Promise<AuditEvent> {
    const t = this.find(id);
    const before = structuredClone(t);
    const s = t.subtasks[idx]!;
    Object.assign(s, { done: true, doneAt: this.now, doneBy: by });
    return this.emit('task.updated', by, before, t);
  }

  rewardsFor(memberId: string) {
    return this.published
      .filter((p) => p.event.type === 'game.reward' && p.memberIds?.includes(memberId))
      .map((p) => (p.event as Extract<LiveEvent, { type: 'game.reward' }>).reward);
  }

  xpOf(memberId: string): number {
    return (this.db.prepare('SELECT COALESCE(SUM(xp), 0) AS s FROM game_rewards WHERE member_id = ?').get(memberId) as { s: number }).s;
  }

  ledger(memberId: string, kind?: string): { kind: string; xp: number; label: string }[] {
    return this.db.prepare(`SELECT kind, xp, label FROM game_rewards WHERE member_id = ? ${kind ? 'AND kind = ?' : ''} ORDER BY rowid`)
      .all(...(kind ? [memberId, kind] : [memberId])) as { kind: string; xp: number; label: string }[];
  }

  private services(): CoreServices {
    const w = this;
    const notFound = () => new AppError('not_found', 'not found');
    const listTasks = async (actor: Actor, q: TaskQuery = {}) => w.tasks.filter((t) => {
      if (t.orgId !== actor.orgId) return false;
      if (q.assigneeId && q.assigneeId !== 'me' && q.assigneeId !== 'unassigned' && !t.assigneeIds.includes(q.assigneeId)) return false;
      if (q.projectId && t.projectId !== q.projectId) return false;
      if (!q.includeDone && (t.status === 'done' || t.status === 'cancelled')) return false;
      return true;
    }).map((t) => structuredClone(t));
    const fake = {
      members: {
        list: async (actor: Actor, o: { includeInactive?: boolean } = {}) => w.members.filter((m) => m.orgId === actor.orgId && (o.includeInactive || m.active)),
        get: async (actor: Actor, id: string) => {
          const m = w.members.find((x) => x.id === id && x.orgId === actor.orgId);
          if (!m) throw notFound();
          return m;
        },
      },
      tasks: { list: listTasks },
      projects: {
        list: async (actor: Actor) => w.projects.filter((p) => p.orgId === actor.orgId)
          .map((p) => ({ ...p, counts: { total: 0, open: 0, done: 0, overdue: 0, dueThisWeek: 0 }, progress: 0 })),
        get: async (actor: Actor, id: string) => {
          const p = w.projects.find((x) => x.id === id && x.orgId === actor.orgId);
          if (!p) throw notFound();
          return { ...p, counts: { total: 0, open: 0, done: 0, overdue: 0, dueThisWeek: 0 }, progress: 0 };
        },
      },
      live: {
        publish: (orgId: string, event: LiveEvent, opts?: { memberIds?: string[] }) => { w.published.push({ orgId, event, memberIds: opts?.memberIds }); },
        subscribe: () => () => {},
      },
    };
    return fake as unknown as CoreServices;
  }
}
