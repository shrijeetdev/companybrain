// Shared state for all services: DB, injected ports, clock, live bus, and cross-service hooks.

import {
  AppError,
  type Actor,
  type AuditEvent,
  type Briefing,
  type CalendarFeed,
  type CalendarFetcher,
  type CoreServices,
  type LiveBus,
  type LiveEvent,
  type Llm,
  type Member,
  type Meeting,
  type OrgSettings,
  type Outbound,
  type Task,
  type TaskView,
  type Tts,
} from '@companybrain/types';
import { defaultPrefs, newId, safeTz, type Db } from '@companybrain/db';

export interface Logger {
  info(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

/** Cross-service hooks (late-bound in createCore). */
export interface Internal {
  scheduleTask(task: Task): void;
  cancelTask(orgId: string, taskId: string): void;
  scheduleMeeting(m: Meeting): void;
  cancelMeeting(orgId: string, meetingId: string): void;
  scheduleDigest(m: Member): void;
  ensurePeriodic(orgId: string): void;
  scheduleFeedSync(orgId: string, feedId: string, runAt: number): void;
  views(orgId: string, tasks: Task[], tz: string): TaskView[];
  publishTask(task: Task): void;
  publishTaskDeleted(task: Task): void;
  spawnNext(orgId: string, taskId: string): Promise<Task | null>;
  syncFeed(orgId: string, feedId: string): Promise<CalendarFeed>;
  deliver(orgId: string, notificationId: string): Promise<void>;
  composeBriefing(member: Member, opts?: { polish?: boolean }): Promise<Briefing>;
  invalidateBriefings(orgId: string): void;
}

export interface Ctx {
  db: Db;
  clock: () => number;
  log: Logger;
  outbound: Outbound;
  llm: Llm | null;
  calendar: CalendarFetcher;
  tts: Tts | null;
  vapidPublicKey: string | null;
  live: LiveBus;
  onAudit?: (e: AuditEvent) => void | Promise<void>;
  services: CoreServices;
  internal: Internal;
}

export const noopOutbound: Outbound = {
  async whatsapp() {
    return false;
  },
  async email() {
    return false;
  },
  async push() {
    return 'failed';
  },
  status() {
    return { whatsapp: false, email: false, push: false };
  },
};

export const noCalendar: CalendarFetcher = {
  async fetch() {
    throw new Error('calendar fetch not configured');
  },
};

export function getOrg(ctx: Ctx, orgId: string): OrgSettings {
  const org = ctx.db.orgs.get(orgId);
  if (!org) throw new AppError('not_found', 'Organization not found');
  return org;
}

/** The actor's member row (null for the system actor). */
export function actorMember(ctx: Ctx, actor: Actor): Member | null {
  return ctx.db.members.get(actor.orgId, actor.memberId);
}

/** Time zone used for "today" etc.: the actor's, else the org's. */
export function actorTz(ctx: Ctx, actor: Actor): string {
  const m = actorMember(ctx, actor);
  return safeTz(m?.timezone ?? ctx.db.orgs.get(actor.orgId)?.timezone);
}

export interface AuditInput {
  type: string;
  entity: AuditEvent['entity'];
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  undoable?: boolean;
}

const snap = (v: unknown): Record<string, unknown> | null => (v === null || v === undefined ? null : (JSON.parse(JSON.stringify(v)) as Record<string, unknown>));

/** Write an audit event, then hand it to the onAudit hook (errors logged, never thrown). */
export async function audit(ctx: Ctx, actor: Pick<Actor, 'orgId' | 'memberId'>, e: AuditInput): Promise<AuditEvent> {
  const ev: AuditEvent = {
    id: newId('aud'),
    orgId: actor.orgId,
    actorId: actor.memberId,
    type: e.type,
    entity: e.entity,
    entityId: e.entityId,
    summary: e.summary.slice(0, 500),
    before: snap(e.before),
    after: snap(e.after),
    undoable: !!e.undoable,
    undoneAt: null,
    undoneBy: null,
    at: ctx.clock(),
  };
  ctx.db.audit.insert(ev);
  await fireAudit(ctx, ev);
  return ev;
}

export async function fireAudit(ctx: Ctx, ev: AuditEvent): Promise<void> {
  if (!ctx.onAudit) return;
  try {
    await ctx.onAudit(ev);
  } catch (err) {
    ctx.log.error('[core] onAudit hook failed', err);
  }
}

/**
 * What every teammate may see about a member: no contact details (email/phone) and no
 * preferences (prefs are replaced by the kind's defaults). Used for org-wide live events and for
 * guests' member lookups.
 */
export function publicMember(m: Member): Member {
  return { ...m, email: null, phone: null, prefs: defaultPrefs(m.kind) };
}

export function publish(ctx: Ctx, orgId: string, event: LiveEvent, memberIds?: string[]): void {
  try {
    if (event.type === 'member.upserted' && !memberIds) {
      // Org-wide broadcast: the member gets their full record, everyone else the public projection.
      const self = event.member.id;
      ctx.live.publish(orgId, event, { memberIds: [self] });
      const others = ctx.db.members.list(orgId).map((m) => m.id).filter((id) => id !== self);
      if (others.length) ctx.live.publish(orgId, { type: 'member.upserted', member: publicMember(event.member) }, { memberIds: others });
      return;
    }
    ctx.live.publish(orgId, event, memberIds ? { memberIds } : undefined);
  } catch (err) {
    ctx.log.warn('[core] live publish failed', err);
  }
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Run a promise with a timeout; rejects on timeout. */
export function withTimeout<T>(p: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      t.unref?.();
    }),
  ]);
}
