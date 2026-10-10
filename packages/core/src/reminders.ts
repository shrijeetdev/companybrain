// Reminder engine: (re)schedules jobs whenever tasks/meetings/members change, and implements
// the handler for every JobKind. Handlers are idempotent and re-check current state, so a stale
// job (task completed, due date moved, meeting deleted) is a harmless no-op.

import { SYSTEM_MEMBER_ID, type Job, type JobKind, type Meeting, type Member, type Task } from '@companybrain/types';
import { atLocalHour, dueLabel, safeTz, spokenTime } from '@companybrain/db';
import type { Ctx } from './context.js';
import type { JobHandler } from './scheduler.js';
import type { TaskInternals } from './services/tasks.js';
import { isOpen } from './services/tasks.js';
import { rank } from './perms.js';

/** Overdue notice fires this long after the due time (the offset-0 reminder covers "due now"), then daily. */
export const OVERDUE_AFTER_MS = 60 * 60_000;
export const OVERDUE_REPEAT_MS = 24 * 3_600_000;
export const STALE_SCAN_EVERY_MS = 15 * 60_000;
export const CALENDAR_SYNC_EVERY_MS = 15 * 60_000;
export const MEETING_REMINDER_MS = 10 * 60_000;

const K = {
  reminderPrefix: (id: string) => `task.reminder:${id}:`,
  reminder: (id: string, off: number) => `task.reminder:${id}:${off}`,
  overdue: (id: string) => `task.overdue:${id}`,
  escalate: (id: string) => `task.escalate:${id}`,
  nudge: (id: string) => `task.nudge:${id}`,
  recur: (id: string) => `task.recur:${id}`,
  meeting: (id: string) => `meeting.reminder:${id}`,
  digest: (id: string) => `member.digest:${id}`,
  stale: (orgId: string) => `agent.staleScan:${orgId}`,
  feed: (id: string) => `calendar.sync:${id}`,
};

export function formatOffset(min: number): string {
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  if (min < 2880 && min % 60 === 0) return min === 60 ? '1 hour' : `${min / 60} hours`;
  if (min < 2880) return `${Math.round(min / 60)} hours`;
  const d = Math.round(min / 1440);
  return `${d} days`;
}

export function inQuietHours(m: Member, at: number): boolean {
  const { quietStart: s, quietEnd: e } = m.prefs;
  if (s === null || e === null || s === e) return false;
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: safeTz(m.timezone), hour: 'numeric', hourCycle: 'h23' }).format(at)) % 24;
  return s < e ? h >= s && h < e : h >= s || h < e;
}

/** Next time (after `at`) the member's quiet hours end. */
export function quietEndsAt(m: Member, at: number): number {
  const tz = safeTz(m.timezone);
  const end = m.prefs.quietEnd ?? 7;
  let t = atLocalHour(at, tz, end);
  if (t <= at) t = atLocalHour(at, tz, end, 0, 1);
  return t;
}

export function nextDigestAt(m: Member, at: number): number | null {
  if (m.prefs.digestHour === null || m.prefs.digestHour === undefined) return null;
  const tz = safeTz(m.timezone);
  let t = atLocalHour(at, tz, m.prefs.digestHour);
  if (t <= at + 60_000) t = atLocalHour(at, tz, m.prefs.digestHour, 0, 1);
  return t;
}

export function createReminders(ctx: Ctx, tasks: TaskInternals) {
  const { db } = ctx;
  const now = () => ctx.clock();
  const notify: Ctx['services']['notifications']['notify'] = (orgId, memberId, n) => ctx.services.notifications.notify(orgId, memberId, n);

  // ── scheduling ──
  function scheduleTask(t: Task): void {
    const t0 = now();
    const org = db.orgs.get(t.orgId);
    if (!org) return;
    type Want = { kind: JobKind; runAt: number; payload: Record<string, unknown> };
    const want = new Map<string, Want | 'keep'>();
    if (isOpen(t)) {
      if (t.dueAt !== null) {
        for (const off of t.reminderOffsets ?? org.defaultReminderOffsets) {
          const runAt = t.dueAt - off * 60_000;
          if (runAt > t0) want.set(K.reminder(t.id, off), { kind: 'task.reminder', runAt, payload: { taskId: t.id, offsetMin: off, dueAt: t.dueAt } });
        }
        const od = db.jobs.getPending(t.orgId, K.overdue(t.id));
        if (od && od.payload.dueAt === t.dueAt) want.set(K.overdue(t.id), 'keep');
        else want.set(K.overdue(t.id), { kind: 'task.overdue', runAt: Math.max(t.dueAt + OVERDUE_AFTER_MS, t0), payload: { taskId: t.id, dueAt: t.dueAt } });
        if (org.escalateAfterMin !== null && db.kv.get(t.orgId, `escalated:${t.id}`) !== t.dueAt) {
          const es = db.jobs.getPending(t.orgId, K.escalate(t.id));
          if (es && es.payload.dueAt === t.dueAt) want.set(K.escalate(t.id), 'keep');
          else want.set(K.escalate(t.id), { kind: 'task.escalate', runAt: Math.max(t.dueAt + org.escalateAfterMin * 60_000, t0), payload: { taskId: t.id, dueAt: t.dueAt } });
        }
      }
      const w = t.waitingOn;
      if (w && w.nudgeEveryHours && w.contact && w.channel !== 'other') {
        const runAt = Math.max((w.lastNudgedAt ?? w.since) + w.nudgeEveryHours * 3_600_000, t0);
        want.set(K.nudge(t.id), { kind: 'task.nudge', runAt, payload: { taskId: t.id } });
      }
    }
    const existing = db.jobs.list(t.orgId, { status: 'pending', keyPrefix: K.reminderPrefix(t.id) }).map((j) => j.key);
    const stale = [...existing, K.overdue(t.id), K.escalate(t.id), K.nudge(t.id)].filter((k) => !want.has(k));
    db.jobs.cancel(t.orgId, stale, [], t0);
    for (const [key, w] of want) if (w !== 'keep') db.jobs.schedule(t.orgId, w.kind, key, w.runAt, w.payload, t0);
  }

  function cancelTask(orgId: string, taskId: string): void {
    db.jobs.cancel(orgId, [K.overdue(taskId), K.escalate(taskId), K.nudge(taskId), K.recur(taskId)], [K.reminderPrefix(taskId)], now());
  }

  function scheduleMeeting(m: Meeting): void {
    const runAt = m.startAt - MEETING_REMINDER_MS;
    if (runAt > now() && !m.allDay) db.jobs.schedule(m.orgId, 'meeting.reminder', K.meeting(m.id), runAt, { meetingId: m.id, startAt: m.startAt }, now());
    else db.jobs.cancel(m.orgId, [K.meeting(m.id)], [], now());
  }

  function cancelMeeting(orgId: string, id: string): void {
    db.jobs.cancel(orgId, [K.meeting(id)], [], now());
  }

  function scheduleDigest(m: Member, opts: { ifAbsent?: boolean } = {}): void {
    const at = m.active && m.kind === 'human' ? nextDigestAt(m, now()) : null;
    if (at === null) {
      db.jobs.cancel(m.orgId, [K.digest(m.id)], [], now());
      return;
    }
    db.jobs.schedule(m.orgId, 'member.digest', K.digest(m.id), at, { memberId: m.id }, now(), opts);
  }

  function scheduleFeedSync(orgId: string, feedId: string, runAt: number): void {
    db.jobs.schedule(orgId, 'calendar.sync', K.feed(feedId), runAt, { feedId }, now());
  }

  /** Make sure the recurring per-org jobs exist (never moves an already-pending job). */
  function ensurePeriodic(orgId: string): void {
    const t0 = now();
    db.jobs.schedule(orgId, 'agent.staleScan', K.stale(orgId), t0 + STALE_SCAN_EVERY_MS, {}, t0, { ifAbsent: true });
    for (const m of db.members.list(orgId, { kind: 'human' })) scheduleDigest(m, { ifAbsent: true });
    for (const f of db.feeds.list(orgId)) db.jobs.schedule(orgId, 'calendar.sync', K.feed(f.id), t0, { feedId: f.id }, t0, { ifAbsent: true });
  }

  // ── helpers ──
  const activeMembers = (orgId: string, ids: string[]) => db.members.getMany(orgId, ids).filter((m) => m.active);

  /** Who gets task reminders: active assignees, else the creator. */
  function reminderRecipients(t: Task): Member[] {
    const a = activeMembers(t.orgId, t.assigneeIds);
    if (a.length) return a;
    return t.creatorId !== SYSTEM_MEMBER_ID ? activeMembers(t.orgId, [t.creatorId]) : [];
  }

  function loadDueTask(job: Job): Task | null {
    const t = db.tasks.get(job.orgId, String(job.payload.taskId ?? ''));
    if (!t || !isOpen(t) || t.dueAt === null) return null;
    if (job.payload.dueAt !== undefined && job.payload.dueAt !== t.dueAt) return null; // due moved: superseded
    return t;
  }

  function logReminder(t: Task, text: string, data: Record<string, unknown>) {
    const act = tasks.addActivity(t, SYSTEM_MEMBER_ID, 'reminder_sent', text, data, false);
    ctx.live.publish(t.orgId, { type: 'activity', activity: act }, { memberIds: tasks.audience(t) });
  }

  const tzOf = (m: Member) => safeTz(m.timezone);

  // ── handlers ──
  const handlers: Record<JobKind, JobHandler> = {
    async 'task.reminder'(job) {
      const t = loadDueTask(job);
      if (!t) return;
      const off = Number(job.payload.offsetMin ?? 0);
      const recipients = reminderRecipients(t);
      for (const m of recipients) {
        await notify(t.orgId, m.id, {
          kind: off === 0 ? 'task_due_now' : 'task_due_soon',
          title: off === 0 ? `Due now: ${t.title}` : `Due in ${formatOffset(off)}: ${t.title}`,
          body: `"${t.title}" is due ${dueLabel(t.dueAt!, now(), tzOf(m), t.dueAllDay)}.`,
          taskId: t.id, meetingId: null, link: `/tasks/${t.id}`, urgent: t.priority === 'urgent',
        });
      }
      if (recipients.length) logReminder(t, off === 0 ? 'Reminder sent: due now' : `Reminder sent: due in ${formatOffset(off)}`, { offsetMin: off, to: recipients.map((m) => m.id) });
    },

    async 'task.overdue'(job) {
      const t = loadDueTask(job);
      if (!t) return;
      const recipients = reminderRecipients(t);
      for (const m of recipients) {
        await notify(t.orgId, m.id, {
          kind: 'task_overdue', title: `Overdue: ${t.title}`, body: `"${t.title}" was due ${dueLabel(t.dueAt!, now(), tzOf(m), t.dueAllDay)}. Finish it or move the date.`,
          taskId: t.id, meetingId: null, link: `/tasks/${t.id}`, urgent: true,
        });
      }
      if (recipients.length) logReminder(t, 'Overdue reminder sent', { overdue: true, to: recipients.map((m) => m.id) });
      // Persistent: keep reminding daily until done or re-dated.
      db.jobs.schedule(t.orgId, 'task.overdue', K.overdue(t.id), now() + OVERDUE_REPEAT_MS, { taskId: t.id, dueAt: t.dueAt }, now());
    },

    async 'task.escalate'(job) {
      const t = loadDueTask(job);
      if (!t) return;
      const flag = `escalated:${t.id}`;
      if (db.kv.get(t.orgId, flag) === t.dueAt) return;
      const assignees = activeMembers(t.orgId, t.assigneeIds);
      const ids = new Set<string>();
      if (t.creatorId !== SYSTEM_MEMBER_ID) ids.add(t.creatorId);
      for (const a of assignees) if (a.kind === 'agent' && a.agent?.supervisorId) ids.add(a.agent.supervisorId);
      if (t.projectId) {
        const lead = db.projects.get(t.orgId, t.projectId)?.leadId;
        if (lead) ids.add(lead);
      }
      for (const a of t.assigneeIds) ids.delete(a);
      let recipients = activeMembers(t.orgId, [...ids]).filter((m) => m.kind === 'human');
      if (!recipients.length) {
        recipients = db.members.list(t.orgId, { kind: 'human' }).filter((m) => rank(m.role) >= rank('admin') && !t.assigneeIds.includes(m.id));
      }
      const names = assignees.map((a) => a.name).join(', ') || 'nobody';
      for (const m of recipients) {
        await notify(t.orgId, m.id, {
          kind: 'task_escalated', title: `Escalation: "${t.title}" is overdue`,
          body: `Assigned to ${names}; it was due ${dueLabel(t.dueAt!, now(), tzOf(m), t.dueAllDay)} and is still open.`,
          taskId: t.id, meetingId: null, link: `/tasks/${t.id}`, urgent: true,
        });
      }
      db.kv.set(t.orgId, flag, t.dueAt, now());
      if (recipients.length) logReminder(t, `Escalated to ${recipients.map((m) => m.name).join(', ')}`, { escalated: true, to: recipients.map((m) => m.id) });
    },

    async 'task.nudge'(job) {
      const t = db.tasks.get(job.orgId, String(job.payload.taskId ?? ''));
      if (!t || !isOpen(t) || !t.waitingOn?.nudgeEveryHours) return;
      const res = await tasks.sendNudge(t, SYSTEM_MEMBER_ID);
      if (!res.ok) throw new Error(res.error);
    },

    async 'task.recur'(job) {
      await tasks.spawnNext(job.orgId, String(job.payload.taskId ?? ''));
    },

    async 'meeting.reminder'(job) {
      const m = db.meetings.get(job.orgId, String(job.payload.meetingId ?? ''));
      if (!m || m.startAt !== job.payload.startAt) return;
      let recipients = activeMembers(m.orgId, [...new Set([...(m.ownerId ? [m.ownerId] : []), ...m.attendeeIds])]);
      if (!m.ownerId && !m.attendeeIds.length) recipients = db.members.list(m.orgId, { kind: 'human' });
      for (const r of recipients) {
        await notify(m.orgId, r.id, {
          kind: 'meeting_soon', title: `Meeting at ${spokenTime(m.startAt, tzOf(r))}: ${m.title}`,
          body: `Starts in 10 minutes${m.location ? ` · ${m.location}` : ''}${m.url ? ` · ${m.url}` : ''}`,
          taskId: null, meetingId: m.id, link: `/meetings`, urgent: false,
        });
      }
    },

    async 'member.digest'(job) {
      const m = db.members.get(job.orgId, String(job.payload.memberId ?? ''));
      if (!m || !m.active || m.kind !== 'human' || m.prefs.digestHour === null) return;
      try {
        const b = await ctx.internal.composeBriefing(m, { polish: false });
        await notify(m.orgId, m.id, { kind: 'digest', title: b.greeting, body: b.spoken, taskId: null, meetingId: null, link: '/', urgent: false });
      } finally {
        scheduleDigest(m);
      }
    },

    async 'agent.staleScan'(job) {
      const orgId = job.orgId;
      const org = db.orgs.get(orgId);
      if (!org) return;
      try {
        const cutoff = now() - org.agentStaleAfterMin * 60_000;
        const stale = db.tasks.query(orgId, { statuses: ['todo', 'in_progress'], assigneeKind: 'agent', lastActivityBefore: cutoff, limit: 1000 });
        for (const t of stale) {
          const flag = `stale:${t.id}`;
          if (db.kv.get(orgId, flag) === t.lastActivityAt) continue; // already flagged for this quiet period
          const agents = activeMembers(orgId, t.assigneeIds).filter((a) => a.kind === 'agent');
          const ids = new Set<string>();
          for (const a of agents) if (a.agent?.supervisorId) ids.add(a.agent.supervisorId);
          if (t.creatorId !== SYSTEM_MEMBER_ID) ids.add(t.creatorId);
          const recipients = activeMembers(orgId, [...ids]).filter((m) => m.kind === 'human');
          const names = agents.map((a) => a.name).join(', ') || 'The agent';
          const hours = Math.max(1, Math.round((now() - t.lastActivityAt) / 3_600_000));
          for (const r of recipients) {
            await notify(orgId, r.id, {
              kind: 'agent_stale', title: `${names} went quiet on "${t.title}"`, body: `No activity for ${hours} hour${hours === 1 ? '' : 's'}. Check in or reassign.`,
              taskId: t.id, meetingId: null, link: `/tasks/${t.id}`, urgent: false,
            });
          }
          db.kv.set(orgId, flag, t.lastActivityAt, now());
          tasks.publishTask(t); // isStale flips on clients
        }
      } finally {
        db.jobs.schedule(orgId, 'agent.staleScan', K.stale(orgId), now() + STALE_SCAN_EVERY_MS, {}, now());
      }
    },

    async 'calendar.sync'(job) {
      const feedId = String(job.payload.feedId ?? '');
      if (!db.feeds.get(job.orgId, feedId)) return;
      try {
        await ctx.internal.syncFeed(job.orgId, feedId);
      } catch (err) {
        ctx.log.warn('[calendar] sync failed', err);
      } finally {
        if (db.feeds.get(job.orgId, feedId)) scheduleFeedSync(job.orgId, feedId, now() + CALENDAR_SYNC_EVERY_MS);
      }
    },

    async 'notification.deliver'(job) {
      await ctx.internal.deliver(job.orgId, String(job.payload.notificationId ?? ''));
    },

    async 'email.poll'() {
      // The IMAP poller lives in @companybrain/integrations and runs on its own timer.
    },
  };

  return { scheduleTask, cancelTask, scheduleMeeting, cancelMeeting, scheduleDigest, scheduleFeedSync, ensurePeriodic, handlers };
}
