// Notifications: in-app row + live event immediately; external fan-out (Web Push, WhatsApp,
// email) per member prefs through a persisted `notification.deliver` job — held until quiet
// hours end for non-urgent notifications. Agents get in-app only.

import { AppError, isAllowedPushEndpoint, type Member, type Notification, type NotificationService } from '@companybrain/types';
import { newId } from '@companybrain/db';
import { publish, type Ctx } from '../context.js';
import { forbidden, notFound, requireWrite } from '../perms.js';
import { inQuietHours, quietEndsAt } from '../reminders.js';
import * as v from '../validate.js';

const KINDS = new Set(['task_assigned', 'task_due_soon', 'task_due_now', 'task_overdue', 'task_escalated', 'task_comment', 'task_mention', 'task_completed', 'agent_stale', 'meeting_soon', 'intake_new', 'digest', 'system']);

export interface NotificationInternals {
  service: NotificationService;
  deliver(orgId: string, notificationId: string): Promise<void>;
}

export function createNotificationService(ctx: Ctx): NotificationInternals {
  const { db } = ctx;
  const now = () => ctx.clock();

  /** Channels this member would receive externally right now (configured + opted in + has a handle). */
  function externalChannels(m: Member) {
    const st = safeStatus();
    return {
      push: st.push && m.prefs.notifyPush && db.push.list(m.orgId, m.id).length > 0,
      whatsapp: st.whatsapp && m.prefs.notifyWhatsapp && !!m.phone,
      email: st.email && m.prefs.notifyEmail && !!m.email,
    };
  }

  function safeStatus() {
    try {
      return ctx.outbound.status();
    } catch {
      return { whatsapp: false, email: false, push: false };
    }
  }

  function linkUrl(link: string | null): string | undefined {
    return link ?? undefined;
  }

  async function deliver(orgId: string, notificationId: string): Promise<void> {
    const n = db.notifications.get(orgId, notificationId);
    if (!n) return;
    const m = db.members.get(orgId, n.memberId);
    if (!m || !m.active || m.kind !== 'human') return;
    const ch = externalChannels(m);
    if (ch.push) {
      for (const sub of db.push.list(orgId, m.id)) {
        if (!isAllowedPushEndpoint(sub.endpoint)) {
          db.push.delete(orgId, m.id, sub.endpoint); // never POST to a non-push-service URL (SSRF)
          continue;
        }
        try {
          const res = await ctx.outbound.push({ endpoint: sub.endpoint, keys: sub.keys }, { title: n.title, body: n.body, url: linkUrl(n.link), tag: n.taskId ?? n.meetingId ?? n.kind });
          if (res === 'gone') db.push.delete(orgId, m.id, sub.endpoint);
        } catch (err) {
          ctx.log.warn('[notify] push failed', err);
        }
      }
    }
    if (ch.whatsapp) {
      try {
        await ctx.outbound.whatsapp(m.phone!, `*${n.title}*\n${n.body}`);
      } catch (err) {
        ctx.log.warn('[notify] whatsapp failed', err);
      }
    }
    if (ch.email) {
      try {
        await ctx.outbound.email(m.email!, n.title, `${n.body}${n.link ? `\n\nOpen: ${n.link}` : ''}\n\n— Company Brain`);
      } catch (err) {
        ctx.log.warn('[notify] email failed', err);
      }
    }
  }

  const service: NotificationService = {
    async list(actor, opts = {}) {
      return db.notifications.list(actor.orgId, actor.memberId, {
        unreadOnly: !!opts.unreadOnly,
        limit: opts.limit !== undefined ? v.int(opts.limit, 'limit', 1, 500) : 50,
      });
    },

    async unreadCount(actor) {
      return db.notifications.unreadCount(actor.orgId, actor.memberId);
    },

    async markRead(actor, ids) {
      requireWrite(actor);
      if (ids !== 'all') {
        if (!Array.isArray(ids)) v.bad("ids must be an array or 'all'");
        if (ids.length > 1000) v.bad('Too many ids');
        ids = ids.filter((x) => typeof x === 'string');
      }
      db.notifications.markRead(actor.orgId, actor.memberId, ids, now());
      ctx.internal.invalidateBriefings(actor.orgId);
    },

    async subscribePush(actor, sub, userAgent) {
      if (actor.kind !== 'human') forbidden('Only people can subscribe to push notifications');
      if (!v.isObj(sub) || !v.isObj(sub.keys)) v.bad('Invalid push subscription');
      const endpoint = v.url(sub.endpoint, 'endpoint', { httpsOnly: true });
      if (!isAllowedPushEndpoint(endpoint)) v.bad('endpoint must be a Web Push service URL (FCM, Mozilla, Apple or Windows push service)');
      const p256dh = v.str(sub.keys.p256dh, 'keys.p256dh', { max: 200 });
      const auth = v.str(sub.keys.auth, 'keys.auth', { max: 100 });
      db.push.upsert(actor.orgId, actor.memberId, { endpoint, keys: { p256dh, auth } }, typeof userAgent === 'string' ? userAgent.slice(0, 300) : null, now());
    },

    async unsubscribePush(actor, endpoint) {
      if (typeof endpoint !== 'string' || !endpoint) v.bad('endpoint is required');
      db.push.delete(actor.orgId, actor.memberId, endpoint);
    },

    vapidPublicKey() {
      return ctx.vapidPublicKey ?? null;
    },

    async notify(orgId, memberId, input) {
      const m = db.members.get(orgId, memberId);
      if (!m) notFound('Member not found');
      if (!KINDS.has(input.kind)) throw new AppError('bad_request', `Unknown notification kind ${input.kind}`);
      const t0 = now();
      const n: Notification = {
        id: newId('ntf'),
        orgId,
        memberId,
        kind: input.kind,
        title: String(input.title ?? '').slice(0, 300),
        body: String(input.body ?? '').slice(0, 4000),
        taskId: input.taskId ?? null,
        meetingId: input.meetingId ?? null,
        link: input.link ?? null,
        urgent: !!input.urgent,
        readAt: null,
        createdAt: t0,
      };
      db.notifications.insert(n);
      publish(ctx, orgId, { type: 'notification', notification: n }, [memberId]);
      ctx.internal.invalidateBriefings(orgId);
      if (!m!.active || m!.kind !== 'human') return n;
      const ch = externalChannels(m!);
      if (ch.push || ch.whatsapp || ch.email) {
        const runAt = !n.urgent && inQuietHours(m!, t0) ? quietEndsAt(m!, t0) : t0;
        db.jobs.schedule(orgId, 'notification.deliver', `notification.deliver:${n.id}`, runAt, { notificationId: n.id }, t0);
      }
      return n;
    },

    async sendTest(actor, channel) {
      const c = v.oneOf(channel, 'channel', ['whatsapp', 'email', 'push'] as const);
      const m = db.members.get(actor.orgId, actor.memberId);
      if (!m || m.kind !== 'human') return { ok: false, error: 'Only people can test notification channels' };
      const st = safeStatus();
      const text = `This is a test message from Company Brain. If you can read this, ${c === 'whatsapp' ? 'WhatsApp' : c === 'email' ? 'email' : 'push'} notifications work.`;
      try {
        if (c === 'whatsapp') {
          if (!st.whatsapp) return { ok: false, error: 'WhatsApp is not configured on this server' };
          if (!m.phone) return { ok: false, error: 'Add your phone number in your profile first' };
          return (await ctx.outbound.whatsapp(m.phone, text)) ? { ok: true } : { ok: false, error: 'WhatsApp send failed — check the integration status' };
        }
        if (c === 'email') {
          if (!st.email) return { ok: false, error: 'Outbound email (SMTP) is not configured on this server' };
          if (!m.email) return { ok: false, error: 'Add your email address in your profile first' };
          return (await ctx.outbound.email(m.email, 'Company Brain test message', text)) ? { ok: true } : { ok: false, error: 'Email send failed — check the SMTP settings' };
        }
        if (!st.push) return { ok: false, error: 'Web Push is not configured on this server' };
        const subs = db.push.list(actor.orgId, m.id);
        if (!subs.length) return { ok: false, error: 'No push subscriptions — enable notifications in this browser first' };
        let sent = 0;
        for (const s of subs) {
          if (!isAllowedPushEndpoint(s.endpoint)) {
            db.push.delete(actor.orgId, m.id, s.endpoint);
            continue;
          }
          const res = await ctx.outbound.push({ endpoint: s.endpoint, keys: s.keys }, { title: 'Company Brain', body: text, url: '/', tag: 'test' });
          if (res === 'gone') db.push.delete(actor.orgId, m.id, s.endpoint);
          if (res === 'sent') sent++;
        }
        return sent ? { ok: true } : { ok: false, error: 'Push delivery failed — try re-enabling notifications in this browser' };
      } catch (err) {
        ctx.log.warn('[notify] sendTest failed', err);
        return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
      }
    },
  };

  return { service, deliver };
}
