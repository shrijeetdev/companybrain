// Audit log + undo. Undo is single-use (atomic flag), org-checked, permission-checked:
// undoing a create deletes, undoing a delete restores, undoing an update restores the changed fields.

import { AppError, type Actor, type AuditEvent, type AuditService, type InboxItem, type Lead, type Meeting, type Member, type OrgSettings, type Project, type Task } from '@companybrain/types';
import { audit, publish, type Ctx } from '../context.js';
import { forbidden, isAdmin, isManager, notFound, rank, requireWrite } from '../perms.js';
import * as v from '../validate.js';

const ENTITIES = ['task', 'project', 'member', 'meeting', 'inbox', 'org', 'api_key', 'lead'] as const;
const IMMUTABLE = new Set(['id', 'orgId', 'createdAt', 'createdBy', 'creatorId', 'updatedAt']);

/** Copy back every field that the audited change modified. */
function restoreFields<T extends object>(cur: T, before: Record<string, unknown>, after: Record<string, unknown> | null): T {
  const next = { ...cur } as Record<string, unknown>;
  for (const k of Object.keys(before)) {
    if (IMMUTABLE.has(k) || !(k in cur)) continue;
    if (after && JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
    next[k] = before[k];
  }
  return next as T;
}

const conflict = (msg: string): never => {
  throw new AppError('conflict', msg);
};

export function createAuditService(ctx: Ctx): AuditService {
  const { db } = ctx;
  const now = () => ctx.clock();

  function canUndo(actor: Actor, e: AuditEvent): boolean {
    if (e.entity === 'member' || e.entity === 'org') return isAdmin(actor);
    return e.actorId === actor.memberId || isManager(actor);
  }

  /** Apply the undo inside a transaction; returns side effects to run after commit. */
  function apply(actor: Actor, e: AuditEvent): { after: () => void; snapshot: { type: string; before: unknown; after: unknown } } {
    const org = actor.orgId;
    const before = e.before as Record<string, unknown> | null;
    const created = e.before === null;
    const deleted = e.after === null;
    const t0 = now();
    switch (e.entity) {
      case 'task': {
        const cur = db.tasks.get(org, e.entityId);
        if (created) {
          if (!cur) conflict('The task no longer exists');
          db.tasks.delete(org, cur!.id);
          return {
            snapshot: { type: 'task.deleted', before: cur, after: null },
            after: () => {
              ctx.internal.cancelTask(org, cur!.id);
              ctx.internal.publishTaskDeleted(cur!);
            },
          };
        }
        const b = before as unknown as Task;
        if (deleted) {
          if (cur || db.tasks.exists(org, e.entityId)) conflict('The task already exists');
          const projectOk = b.projectId ? !!db.projects.get(org, b.projectId) : true;
          const assignees = db.members.getMany(org, b.assigneeIds ?? []).map((m) => m.id);
          const restored: Task = { ...b, orgId: org, projectId: projectOk ? b.projectId : null, assigneeIds: assignees, updatedAt: t0 };
          db.tasks.insert(restored);
          return {
            snapshot: { type: 'task.created', before: null, after: restored },
            after: () => {
              ctx.internal.scheduleTask(restored);
              ctx.internal.publishTask(restored);
            },
          };
        }
        if (!cur) conflict('The task no longer exists');
        const next = restoreFields(cur!, before!, e.after);
        next.assigneeIds = db.members.getMany(org, next.assigneeIds).map((m) => m.id);
        if (next.projectId && !db.projects.get(org, next.projectId)) next.projectId = null;
        next.updatedAt = t0;
        next.lastActivityAt = t0;
        db.tasks.save(next);
        const type = cur!.status !== 'done' && next.status === 'done' ? 'task.completed' : cur!.status === 'done' && next.status !== 'done' ? 'task.reopened' : 'task.updated';
        return {
          snapshot: { type, before: cur, after: next },
          after: () => {
            ctx.internal.scheduleTask(next);
            ctx.internal.publishTask(next);
          },
        };
      }
      case 'project': {
        const cur = db.projects.get(org, e.entityId);
        if (created) {
          if (!cur) conflict('The project no longer exists');
          db.projects.delete(org, cur!.id);
          return { snapshot: { type: 'project.deleted', before: cur, after: null }, after: () => ctx.internal.invalidateBriefings(org) };
        }
        if (deleted) {
          if (cur) conflict('The project already exists');
          const { taskIds, ...rest } = before as unknown as Project & { taskIds?: string[] };
          const p: Project = { ...rest, orgId: org, memberIds: db.members.getMany(org, rest.memberIds ?? []).map((m) => m.id), updatedAt: t0 };
          if (p.leadId && !db.members.get(org, p.leadId)) p.leadId = null;
          db.projects.insert(p);
          db.projects.relinkTasks(org, p.id, taskIds ?? []);
          return {
            snapshot: { type: 'project.created', before: null, after: p },
            after: () => {
              publish(ctx, org, { type: 'project.upserted', project: p });
              for (const id of taskIds ?? []) {
                const t = db.tasks.get(org, id);
                if (t) ctx.internal.publishTask(t);
              }
            },
          };
        }
        if (!cur) conflict('The project no longer exists');
        const next = restoreFields(cur!, before!, e.after);
        next.memberIds = db.members.getMany(org, next.memberIds).map((m) => m.id);
        next.updatedAt = t0;
        db.projects.save(next);
        return { snapshot: { type: 'project.updated', before: cur, after: next }, after: () => publish(ctx, org, { type: 'project.upserted', project: next }) };
      }
      case 'member': {
        const cur = db.members.get(org, e.entityId);
        if (!cur || created) conflict('This change cannot be undone');
        if (rank(cur!.role) > rank(actor.role) && actor.via !== 'system') forbidden('You cannot modify a higher role');
        if (actor.via !== 'system' && cur!.id !== actor.memberId && rank(cur!.role) >= rank('admin') && actor.role !== 'owner') forbidden('Only owners can modify an admin or owner');
        const next = restoreFields(cur!, before!, e.after) as Member;
        if (rank(next.role) > rank(actor.role) && actor.via !== 'system') forbidden('You cannot grant a role higher than your own');
        if (cur!.role === 'owner' && cur!.active && (next.role !== 'owner' || !next.active) && db.members.countActive(org, 'owner') <= 1) conflict('This is the last owner');
        next.updatedAt = t0;
        db.members.save(next);
        if (next.role !== cur!.role || (cur!.active && !next.active)) db.sessions.deleteForMember(org, next.id);
        if (cur!.active && !next.active) db.apiKeys.revokeForMember(org, next.id, t0); // deactivation revokes keys too
        return {
          snapshot: { type: 'member.updated', before: cur, after: next },
          after: () => {
            ctx.internal.scheduleDigest(next);
            publish(ctx, org, { type: 'member.upserted', member: next });
          },
        };
      }
      case 'org': {
        const cur = db.orgs.get(org);
        if (!cur || created || deleted) conflict('This change cannot be undone');
        const next = { ...restoreFields(cur!, before!, e.after), id: org, updatedAt: t0 } as OrgSettings;
        db.orgs.save(next);
        return { snapshot: { type: 'org.updated', before: cur, after: next }, after: () => ctx.internal.invalidateBriefings(org) };
      }
      case 'meeting': {
        const cur = db.meetings.get(org, e.entityId);
        if (created) {
          if (!cur) conflict('The meeting no longer exists');
          db.meetings.delete(org, cur!.id);
          return { snapshot: { type: 'meeting.deleted', before: cur, after: null }, after: () => ctx.internal.cancelMeeting(org, cur!.id) };
        }
        if (deleted) {
          if (cur) conflict('The meeting already exists');
          const b = before as unknown as Meeting;
          const m: Meeting = { ...b, orgId: org, attendeeIds: db.members.getMany(org, b.attendeeIds ?? []).map((x) => x.id), feedId: b.feedId && db.feeds.get(org, b.feedId) ? b.feedId : null, updatedAt: t0 };
          db.meetings.insert(m);
          return { snapshot: { type: 'meeting.created', before: null, after: m }, after: () => ctx.internal.scheduleMeeting(m) };
        }
        if (!cur) conflict('The meeting no longer exists');
        const next = { ...restoreFields(cur!, before!, e.after), updatedAt: t0 };
        next.attendeeIds = db.members.getMany(org, next.attendeeIds).map((x) => x.id);
        db.meetings.save(next);
        return { snapshot: { type: 'meeting.updated', before: cur, after: next }, after: () => ctx.internal.scheduleMeeting(next) };
      }
      case 'lead': {
        const cur = db.leads.get(org, e.entityId);
        if (created) {
          if (!cur) conflict('The lead no longer exists');
          db.leads.delete(org, cur!.id);
          return { snapshot: { type: 'lead.deleted', before: cur, after: null }, after: () => {} };
        }
        if (deleted) {
          if (cur) conflict('The lead already exists');
          const l = { ...(before as unknown as Lead), orgId: org, updatedAt: t0 };
          db.leads.insert(l);
          return { snapshot: { type: 'lead.created', before: null, after: l }, after: () => {} };
        }
        if (!cur) conflict('The lead no longer exists');
        const next = { ...restoreFields(cur!, before!, e.after), updatedAt: t0 };
        db.leads.save(next);
        return { snapshot: { type: 'lead.updated', before: cur, after: next }, after: () => {} };
      }
      case 'inbox': {
        const cur = db.inbox.get(org, e.entityId);
        if (!cur || created || deleted) conflict('This change cannot be undone');
        const next = restoreFields(cur!, before!, e.after) as InboxItem;
        db.inbox.save(next);
        return { snapshot: { type: 'inbox.updated', before: cur, after: next }, after: () => {} };
      }
      default:
        throw new AppError('bad_request', 'This change cannot be undone');
    }
  }

  return {
    async list(actor, opts = {}) {
      const entity = opts.entity !== undefined ? v.oneOf(opts.entity, 'entity', ENTITIES) : undefined;
      const entityId = opts.entityId !== undefined ? v.str(opts.entityId, 'entityId', { max: 64 }) : undefined;
      const limit = opts.limit !== undefined ? v.int(opts.limit, 'limit', 1, 1000) : 100;
      // Managers+ see the whole org's log; everyone else sees their own actions.
      return db.audit.list(actor.orgId, { entity, entityId, limit, actorId: isManager(actor) ? undefined : actor.memberId });
    },

    async undo(actor, eventId) {
      requireWrite(actor);
      const e = typeof eventId === 'string' ? db.audit.get(actor.orgId, eventId) : null;
      if (!e) notFound('Audit event not found');
      if (!e!.undoable) throw new AppError('bad_request', 'This change cannot be undone');
      if (e!.undoneAt !== null) conflict('This change was already undone');
      if (!canUndo(actor, e!)) forbidden('You can only undo your own changes');
      const t0 = now();
      const result = db.tx(() => {
        if (!db.audit.markUndone(actor.orgId, e!.id, actor.memberId, t0)) conflict('This change was already undone');
        return apply(actor, e!);
      });
      try {
        result.after();
      } catch (err) {
        ctx.log.warn('[audit] undo side effects failed', err);
      }
      await audit(ctx, actor, {
        type: result.snapshot.type, entity: e!.entity, entityId: e!.entityId, summary: `Undid: ${e!.summary}`, before: result.snapshot.before, after: result.snapshot.after,
      });
      return db.audit.get(actor.orgId, e!.id)!;
    },
  };
}
