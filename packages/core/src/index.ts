// @companybrain/core — services (implements CoreServices), persistent scheduler, reminder engine,
// notifier fan-out, briefing composer, intake handler, live bus. See docs/v2/WIRING.md.

import type { AuditEvent, CalendarFetcher, CoreServices, Llm, Outbound, Tts } from '@companybrain/types';
import type { Db } from '@companybrain/db';
import { noCalendar, noopOutbound, type Ctx, type Internal, type Logger } from './context.js';
import { createLiveBus } from './live.js';
import { createReminders } from './reminders.js';
import { createScheduler, type Scheduler } from './scheduler.js';
import { createAuditService } from './services/audit.js';
import { createBriefingService } from './services/briefing.js';
import { createApiKeyService, createAuthService, createMemberService, createOrgService } from './services/identity.js';
import { createInboxService } from './services/inbox.js';
import { createMeetingService } from './services/meetings.js';
import { createNotificationService } from './services/notifications.js';
import { createLeadService, createProjectService } from './services/projects.js';
import { createReportService, createSearchService } from './services/reports.js';
import { createTaskService } from './services/tasks.js';

export interface CoreOptions {
  db: Db;
  /** default: no-op (all channels report not configured) */
  outbound?: Outbound;
  llm?: Llm | null;
  /** default: throws "calendar fetch not configured" */
  calendar?: CalendarFetcher;
  tts?: Tts | null;
  vapidPublicKey?: string | null;
  /** default Date.now — tests inject a fake clock */
  clock?: () => number;
  log?: Logger;
  /** Called after every audit event write (awaited; errors are logged, never thrown). */
  onAudit?: (e: AuditEvent) => void | Promise<void>;
}

export interface Core {
  services: CoreServices;
  scheduler: { start(intervalMs?: number): void; stop(): Promise<void>; tick(): Promise<number> };
  /** Used by server for /api/briefing/audio */
  tts: Tts | null;
}

const consoleLog: Logger = {
  info: (...a) => console.error('[info]', ...a),
  warn: (...a) => console.error('[warn]', ...a),
  error: (...a) => console.error('[error]', ...a),
};

export function createCore(opts: CoreOptions): Core {
  if (!opts?.db) throw new Error('createCore: db is required');
  const log = opts.log ?? consoleLog;
  const ctx = {
    db: opts.db,
    clock: opts.clock ?? Date.now,
    log,
    outbound: opts.outbound ?? noopOutbound,
    llm: opts.llm ?? null,
    calendar: opts.calendar ?? noCalendar,
    tts: opts.tts ?? null,
    vapidPublicKey: opts.vapidPublicKey ?? null,
    live: createLiveBus(log),
    onAudit: opts.onAudit,
  } as Ctx;

  const tasks = createTaskService(ctx);
  const notifications = createNotificationService(ctx);
  const meetings = createMeetingService(ctx);
  const projects = createProjectService(ctx);
  const briefing = createBriefingService(ctx);

  const services: CoreServices = {
    auth: createAuthService(ctx),
    members: createMemberService(ctx),
    apiKeys: createApiKeyService(ctx),
    org: createOrgService(ctx),
    tasks: tasks.service,
    projects: projects.service,
    meetings: meetings.service,
    notifications: notifications.service,
    inbox: createInboxService(ctx, tasks),
    briefing: briefing.service,
    reports: createReportService(ctx),
    audit: createAuditService(ctx),
    leads: createLeadService(ctx),
    search: createSearchService(ctx),
    live: ctx.live,
  };
  ctx.services = services;

  const reminders = createReminders(ctx, tasks);
  const internal: Internal = {
    scheduleTask: reminders.scheduleTask,
    cancelTask: reminders.cancelTask,
    scheduleMeeting: reminders.scheduleMeeting,
    cancelMeeting: reminders.cancelMeeting,
    scheduleDigest: (m) => reminders.scheduleDigest(m),
    ensurePeriodic: reminders.ensurePeriodic,
    scheduleFeedSync: reminders.scheduleFeedSync,
    views: tasks.views,
    publishTask: tasks.publishTask,
    publishTaskDeleted: tasks.publishTaskDeleted,
    spawnNext: tasks.spawnNext,
    syncFeed: meetings.syncFeed,
    deliver: notifications.deliver,
    composeBriefing: briefing.compose,
    invalidateBriefings: briefing.invalidate,
  };
  ctx.internal = internal;

  const scheduler: Scheduler = createScheduler(ctx, reminders.handlers);
  for (const org of ctx.db.orgs.list()) {
    try {
      reminders.ensurePeriodic(org.id);
    } catch (err) {
      log.warn('[core] could not ensure periodic jobs for org', org.id, err);
    }
  }

  return { services, scheduler, tts: ctx.tts };
}

export { createLiveBus } from './live.js';
export { hashPassword, verifyPassword } from './password.js';
export { nextOccurrence, validateRecurrence } from './recurrence.js';
export { resolveMemberHint, resolveProjectHint, extractMentions } from './services/tasks.js';
export { systemActor } from './perms.js';
export { MAX_ATTEMPTS } from './scheduler.js';
export { OVERDUE_AFTER_MS, OVERDUE_REPEAT_MS, MEETING_REMINDER_MS, formatOffset, inQuietHours } from './reminders.js';
export type { Logger } from './context.js';
