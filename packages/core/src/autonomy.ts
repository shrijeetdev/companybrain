// Autonomy — the "scoped, logged, reversible" control plane. Every AI action is gated by
// a per-org level: off (never), ask (queue for human approval), or auto (act, then log).
// Nothing here imports an LLM or a channel — it only decides whether to enqueue work.

import type { AutonomySettings, AutonomyAction, Autonomy, Approval, JobName } from '@companybrain/types';
import type { Database } from '@companybrain/db';
import { type Context, newId, now, record } from './context';

/** Sensible defaults: Scout (replies/chases/reminders) acts; heavier actions stay off. */
export const DEFAULT_AUTONOMY: AutonomySettings = {
  draftReplies: 'auto',
  chase: 'auto',
  sendReminders: 'auto',
  createTasks: 'off',
  joinMeetings: 'off',
};

/** Which queue job an action dispatches (actions without a job are no-ops for now). */
const ACTION_JOB: Partial<Record<AutonomyAction, JobName>> = {
  draftReplies: 'replyLoop',
  chase: 'chaseLoop',
  sendReminders: 'sendReminder',
};

/** The org's autonomy config, with defaults filled in for anything unset. */
export async function resolveAutonomy(db: Database, orgId: string): Promise<AutonomySettings> {
  const stored = await db.settings.getAutonomy(orgId);
  return { ...DEFAULT_AUTONOMY, ...(stored ?? {}) };
}

async function dispatch(ctx: Context, action: AutonomyAction, loopId: string | undefined, orgId: string, delayMs = 0): Promise<void> {
  const job = ACTION_JOB[action];
  if (!job || !loopId) return;
  await ctx.queue.enqueue(job, { loopId, orgId }, delayMs > 0 ? { delayMs } : undefined);
}

async function queueForApproval(ctx: Context, action: AutonomyAction, opts: GateOptions): Promise<Approval> {
  const approval: Approval = {
    id: newId('appr'), orgId: opts.orgId, action, loopId: opts.loopId,
    title: opts.title, status: 'pending', createdAt: now(),
  };
  await ctx.db.approvals.insert(approval);
  await record(ctx, { orgId: opts.orgId, type: 'approval.created', entityId: approval.id, actorId: 'agent_scout' });
  return approval;
}

export interface GateOptions {
  orgId: string;
  /** the loop this action concerns (most actions need one) */
  loopId?: string;
  /** human-readable summary shown in the approval queue */
  title: string;
  /** delay applied only on the auto path (e.g. wait before chasing) */
  delayMs?: number;
}

/**
 * The single gate every autonomous action goes through. Returns the level it resolved to,
 * so callers can log/branch. auto → enqueue now; ask → park an approval; off → do nothing.
 */
export async function gateAction(ctx: Context, action: AutonomyAction, opts: GateOptions): Promise<Autonomy> {
  const level = (await resolveAutonomy(ctx.db, opts.orgId))[action];
  if (level === 'auto') await dispatch(ctx, action, opts.loopId, opts.orgId, opts.delayMs);
  else if (level === 'ask') await queueForApproval(ctx, action, opts);
  return level;
}

export function makeAutonomy(ctx: Context) {
  return {
    get: (orgId: string) => resolveAutonomy(ctx.db, orgId),
    async set(orgId: string, action: AutonomyAction, level: Autonomy): Promise<AutonomySettings> {
      const next = { ...(await resolveAutonomy(ctx.db, orgId)), [action]: level };
      await ctx.db.settings.setAutonomy(orgId, next);
      await record(ctx, { orgId, type: 'autonomy.changed', entityId: orgId, actorId: 'user_local' });
      return next;
    },
    /** Gate an action through the org's autonomy config. */
    gate: (action: AutonomyAction, opts: GateOptions) => gateAction(ctx, action, opts),
  };
}

export function makeApprovals(ctx: Context) {
  return {
    list: (orgId: string, status: Approval['status'] = 'pending') => ctx.db.approvals.list(orgId, status),
    async approve(id: string): Promise<Approval> {
      const a = await ctx.db.approvals.get(id);
      if (!a) throw new Error(`approval ${id} not found`);
      if (a.status === 'pending') await dispatch(ctx, a.action, a.loopId, a.orgId);
      const next = await ctx.db.approvals.update(id, { status: 'approved' });
      await record(ctx, { orgId: a.orgId, type: 'approval.approved', entityId: id, actorId: 'user_local' });
      return next;
    },
    async dismiss(id: string): Promise<Approval> {
      const a = await ctx.db.approvals.get(id);
      if (!a) throw new Error(`approval ${id} not found`);
      const next = await ctx.db.approvals.update(id, { status: 'dismissed' });
      await record(ctx, { orgId: a.orgId, type: 'approval.dismissed', entityId: id, actorId: 'user_local' });
      return next;
    },
  };
}

export type AutonomyService = ReturnType<typeof makeAutonomy>;
export type ApprovalService = ReturnType<typeof makeApprovals>;
