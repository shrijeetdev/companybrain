// Projects (shared, server-side) with members, progress and counts; plus the simple leads pipeline.

import type { Actor, Lead, LeadService, LeadStage, Project, ProjectService, ProjectStatus, ProjectSummary } from '@companybrain/types';
import { colorFor, newId, startOfLocalDay } from '@companybrain/db';
import { actorTz, audit, publish, type Ctx } from '../context.js';
import { forbidden, isManager, notFound, requireRole, requireWrite, visibility } from '../perms.js';
import * as v from '../validate.js';

const STATUSES: ProjectStatus[] = ['active', 'paused', 'done', 'archived'];

export interface ProjectInternals {
  service: ProjectService;
  summaries(orgId: string, projects: Project[], tz: string): ProjectSummary[];
  audience(p: Project): string[] | undefined;
}

export function createProjectService(ctx: Ctx): ProjectInternals {
  const { db } = ctx;
  const now = () => ctx.clock();

  function summaries(orgId: string, projects: Project[], tz: string): ProjectSummary[] {
    const t0 = now();
    const counts = db.projects.counts(orgId, projects.map((p) => p.id), t0, startOfLocalDay(t0, tz, 7));
    return projects.map((p) => {
      const c = counts.get(p.id) ?? { total: 0, open: 0, done: 0, cancelled: 0, overdue: 0, dueThisWeek: 0 };
      const denom = c.total - c.cancelled;
      return { ...p, counts: { total: c.total, open: c.open, done: c.done, overdue: c.overdue, dueThisWeek: c.dueThisWeek }, progress: denom > 0 ? Math.round((c.done / denom) * 1000) / 1000 : 0 };
    });
  }

  /** undefined = open project (everyone in the org). */
  function audience(p: Project): string[] | undefined {
    if (!p.memberIds.length) return undefined;
    const ids = new Set([...p.memberIds, p.createdBy, ...(p.leadId ? [p.leadId] : [])]);
    for (const m of db.members.list(p.orgId)) if (m.kind === 'agent' || ['owner', 'admin', 'manager'].includes(m.role)) ids.add(m.id);
    return [...ids];
  }

  function load(actor: Actor, id: string): Project {
    const p = typeof id === 'string' ? db.projects.get(actor.orgId, id, visibility(actor)) : null;
    if (!p) notFound('Project not found');
    return p!;
  }

  function validMember(actor: Actor, id: unknown, field: string): string | null {
    if (id === null || id === undefined) return null;
    const mid = v.ref(id, field);
    if (!db.members.get(actor.orgId, mid)) v.bad(`${field} refers to an unknown member`);
    return mid;
  }
  function validMembers(actor: Actor, ids: unknown): string[] {
    const list = v.refs(ids, 'memberIds', 200);
    if (db.members.getMany(actor.orgId, list).length !== list.length) v.bad('memberIds contains an unknown member');
    return list;
  }

  const summary = (actor: Actor, p: Project) => summaries(actor.orgId, [p], actorTz(ctx, actor))[0]!;

  function changed(p: Project) {
    publish(ctx, p.orgId, { type: 'project.upserted', project: p }, audience(p));
    ctx.internal.invalidateBriefings(p.orgId);
  }

  const service: ProjectService = {
    async list(actor, opts = {}) {
      const ps = db.projects.list(actor.orgId, { includeArchived: !!opts.includeArchived, visibility: visibility(actor) });
      return summaries(actor.orgId, ps, actorTz(ctx, actor));
    },

    async get(actor, id) {
      return summary(actor, load(actor, id));
    },

    async create(actor, input) {
      requireWrite(actor);
      requireRole(actor, 'manager', 'Managers and above can create projects');
      if (!v.isObj(input)) v.bad('project input required');
      const t0 = now();
      const id = newId('proj');
      const p: Project = {
        id,
        orgId: actor.orgId,
        name: v.str(input.name, 'name', { max: 100 }),
        emoji: input.emoji === undefined || input.emoji === null || input.emoji === '' ? '📁' : v.str(input.emoji, 'emoji', { max: 16 }),
        color: input.color === undefined ? colorFor(id) : v.color(input.color),
        description: v.optStr(input.description, 'description', 5000) ?? '',
        status: 'active',
        leadId: validMember(actor, input.leadId, 'leadId'),
        memberIds: input.memberIds === undefined ? [] : validMembers(actor, input.memberIds),
        dueAt: v.optTime(input.dueAt, 'dueAt'),
        createdBy: actor.memberId,
        createdAt: t0,
        updatedAt: t0,
      };
      db.projects.insert(p);
      await audit(ctx, actor, { type: 'project.created', entity: 'project', entityId: p.id, summary: `Created project ${p.name}`, after: p, undoable: true });
      changed(p);
      return summary(actor, p);
    },

    async update(actor, id, patch) {
      requireWrite(actor);
      const cur = load(actor, id);
      if (!isManager(actor) && cur.leadId !== actor.memberId) forbidden('Only managers or the project lead can edit this project');
      if (!v.isObj(patch)) v.bad('patch must be an object');
      const next: Project = { ...cur, memberIds: [...cur.memberIds] };
      if (patch.name !== undefined) next.name = v.str(patch.name, 'name', { max: 100 });
      if (patch.emoji !== undefined) next.emoji = v.str(patch.emoji, 'emoji', { max: 16 });
      if (patch.color !== undefined) next.color = v.color(patch.color);
      if (patch.description !== undefined) next.description = v.optStr(patch.description, 'description', 5000) ?? '';
      if (patch.status !== undefined) next.status = v.oneOf(patch.status, 'status', STATUSES);
      if (patch.leadId !== undefined) next.leadId = validMember(actor, patch.leadId, 'leadId');
      if (patch.memberIds !== undefined) next.memberIds = validMembers(actor, patch.memberIds);
      if (patch.dueAt !== undefined) next.dueAt = v.optTime(patch.dueAt, 'dueAt');
      next.updatedAt = now();
      db.projects.save(next);
      await audit(ctx, actor, { type: 'project.updated', entity: 'project', entityId: next.id, summary: `Updated project ${next.name}`, before: cur, after: next, undoable: true });
      changed(next);
      return summary(actor, next);
    },

    async remove(actor, id) {
      requireWrite(actor);
      requireRole(actor, 'manager', 'Managers and above can delete projects');
      const p = load(actor, id);
      const taskIds = db.projects.taskIds(actor.orgId, p.id);
      db.projects.delete(actor.orgId, p.id); // tasks keep existing, project_id → NULL
      await audit(ctx, actor, { type: 'project.deleted', entity: 'project', entityId: p.id, summary: `Deleted project ${p.name}`, before: { ...p, taskIds }, undoable: true });
      for (const tid of taskIds) {
        const t = db.tasks.get(actor.orgId, tid);
        if (t) ctx.internal.publishTask(t);
      }
      ctx.internal.invalidateBriefings(actor.orgId);
    },
  };

  return { service, summaries, audience };
}

// ─── leads ───────────────────────────────────────────────────────────────────

const STAGES: LeadStage[] = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost'];
const CHANNELS = ['manual', 'quick_add', 'voice', 'whatsapp', 'email', 'mcp', 'api', 'calendar', 'recurring', 'import'] as const;

export function createLeadService(ctx: Ctx): LeadService {
  const { db } = ctx;
  const deny = (a: Actor) => {
    if (a.role === 'guest') forbidden('Guests cannot access the sales pipeline');
  };
  function apply(actor: Actor, base: Lead, p: Record<string, unknown>): Lead {
    const l = { ...base };
    if (p.name !== undefined) l.name = v.str(p.name, 'name', { max: 200 });
    if (p.company !== undefined) l.company = v.optStr(p.company, 'company', 200) ?? '';
    if (p.email !== undefined) l.email = p.email === '' || p.email === null ? '' : v.email(p.email);
    if (p.phone !== undefined) l.phone = v.phone(p.phone) ?? '';
    if (p.stage !== undefined) l.stage = v.oneOf(p.stage, 'stage', STAGES);
    if (p.value !== undefined) l.value = p.value === null ? null : v.num(p.value, 'value', 0, 1e12);
    if (p.notes !== undefined) l.notes = v.optStr(p.notes, 'notes', 20_000) ?? '';
    if (p.source !== undefined) l.source = v.oneOf(p.source, 'source', CHANNELS);
    if (p.ownerId !== undefined) {
      l.ownerId = p.ownerId === null ? null : v.ref(p.ownerId, 'ownerId');
      if (l.ownerId && !db.members.get(actor.orgId, l.ownerId)) v.bad('ownerId refers to an unknown member');
    }
    return l;
  }
  function load(actor: Actor, id: string): Lead {
    const l = typeof id === 'string' ? db.leads.get(actor.orgId, id) : null;
    if (!l) notFound('Lead not found');
    return l!;
  }
  return {
    async list(actor) {
      deny(actor);
      return db.leads.list(actor.orgId);
    },
    async create(actor, input) {
      requireWrite(actor);
      deny(actor);
      if (!v.isObj(input)) v.bad('lead input required');
      const t0 = ctx.clock();
      const blank: Lead = {
        id: newId('lead'), orgId: actor.orgId, name: '', company: '', email: '', phone: '', stage: 'new', value: null, notes: '',
        ownerId: actor.kind === 'human' && actor.via !== 'system' ? actor.memberId : null, source: actor.via === 'api_key' ? 'api' : 'manual', createdBy: actor.memberId, createdAt: t0, updatedAt: t0,
      };
      const l = apply(actor, blank, { ...input, name: input.name });
      db.leads.insert(l);
      await audit(ctx, actor, { type: 'lead.created', entity: 'lead', entityId: l.id, summary: `Added lead ${l.name}`, after: l, undoable: true });
      return l;
    },
    async update(actor, id, patch) {
      requireWrite(actor);
      deny(actor);
      if (!v.isObj(patch)) v.bad('patch must be an object');
      const cur = load(actor, id);
      const next = { ...apply(actor, cur, patch), updatedAt: ctx.clock() };
      db.leads.save(next);
      await audit(ctx, actor, { type: 'lead.updated', entity: 'lead', entityId: next.id, summary: `Updated lead ${next.name}`, before: cur, after: next, undoable: true });
      return next;
    },
    async remove(actor, id) {
      requireWrite(actor);
      deny(actor);
      const l = load(actor, id);
      db.leads.delete(actor.orgId, l.id);
      await audit(ctx, actor, { type: 'lead.deleted', entity: 'lead', entityId: l.id, summary: `Deleted lead ${l.name}`, before: l, undoable: true });
    },
  };
}

