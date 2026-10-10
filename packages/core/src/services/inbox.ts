// Intake: WhatsApp / email → tasks. Team members get their message turned into a task (or can
// run simple commands); unknown senders land in the Inbox for triage. Idempotent on externalId.

import {
  AppError,
  type Actor,
  type InboundMessage,
  type InboxItem,
  type InboxService,
  type Member,
  type TaskDraft,
  type TaskView,
} from '@companybrain/types';
import { dueLabel, newId, safeTz } from '@companybrain/db';
import { audit, publish, withTimeout, type Ctx } from '../context.js';
import { forbidden, notFound, rank, requireRole, requireWrite, systemActor } from '../perms.js';
import type { TaskInternals } from './tasks.js';
import * as v from '../validate.js';

const LLM_TIMEOUT_MS = 8000;
const HELP = [
  'Send me any message and I\'ll turn it into a task, e.g. "Call Raj tomorrow 5pm !high".',
  'Commands:',
  '• list — your open tasks',
  '• done 2 — complete task #2 from your last list',
  '• help — this message',
].join('\n');

function memberActor(m: Member): Actor {
  return { orgId: m.orgId, memberId: m.id, role: m.role, kind: m.kind, via: 'system' };
}

const firstLine = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';

export const UNVERIFIED_NOTE = 'Sender not verified: this email did not pass sender authentication (DMARC/DKIM/SPF), so it may not really be from this address.';

/**
 * Was the sender verified by the transport? WhatsApp numbers are verified by WhatsApp itself;
 * email only when the receiving mail system vouched for the From address (InboundMessage.authenticated).
 */
export const senderVerified = (msg: Pick<InboundMessage, 'channel' | 'authenticated'>) => msg.channel === 'whatsapp' || msg.authenticated === true;

export function createInboxService(ctx: Ctx, tasks: TaskInternals): InboxService {
  const { db } = ctx;
  const now = () => ctx.clock();

  function load(actor: Actor, id: string): InboxItem {
    const i = typeof id === 'string' ? db.inbox.get(actor.orgId, id) : null;
    if (!i) notFound('Inbox item not found');
    return i!;
  }

  function matchSender(orgId: string, msg: InboundMessage): Member | null {
    // An unverified email sender is never matched to a member: a forged From must not create
    // tasks as (or run commands for) a teammate.
    if (!senderVerified(msg)) return null;
    if (msg.channel === 'whatsapp') {
      const hits = db.members.findByPhone(orgId, msg.from);
      return hits.length === 1 ? hits[0]! : null;
    }
    const m = db.members.findByEmail(orgId, msg.from.replace(/^.*<([^>]+)>.*$/, '$1'));
    return m && m.active ? m : null;
  }

  async function suggest(orgId: string, msg: InboundMessage, tz: string): Promise<TaskDraft | null> {
    if (ctx.llm) {
      try {
        const d = await withTimeout(
          ctx.llm.extractTask({
            text: msg.text, subject: msg.subject, from: msg.from, now: now(), timezone: tz,
            members: db.members.list(orgId).map((m) => ({ id: m.id, name: m.name })),
            projects: db.projects.list(orgId).map((p) => ({ id: p.id, name: p.name })),
          }),
          LLM_TIMEOUT_MS,
          'llm.extractTask',
        );
        if (d && typeof d.title === 'string' && d.title.trim()) return d;
      } catch (err) {
        ctx.log.warn('[intake] llm.extractTask failed, using parser', err);
      }
    }
    const text = msg.subject?.trim() || firstLine(msg.text);
    if (!text) return null;
    try {
      return tasks.draftFromText(systemActor(orgId), text.slice(0, 500)).draft;
    } catch {
      return { title: text.slice(0, 500) };
    }
  }

  function taskReply(t: TaskView, m: Member): string {
    const tz = safeTz(m.timezone);
    let s = `✅ Added: "${t.title}"`;
    if (t.dueAt) s += ` — due ${dueLabel(t.dueAt, now(), tz, t.dueAllDay)}`;
    const others = t.assigneeIds.filter((a) => a !== m.id);
    if (others.length) s += ` · assigned to ${db.members.getMany(m.orgId, others).map((x) => x.name).join(', ')}`;
    return s;
  }

  async function memberCommand(m: Member, text: string): Promise<string | null> {
    const cmd = text.trim().toLowerCase().replace(/[.!]+$/, '');
    const actor = memberActor(m);
    const listKey = `intake:list:${m.id}`;
    if (cmd === 'help' || cmd === '?' || cmd === 'commands') return HELP;
    if (cmd === 'list' || cmd === 'today' || cmd === 'tasks' || cmd === 'my tasks') {
      const open = await ctx.services.tasks.list(actor, { assigneeId: 'me', limit: 10 });
      db.kv.set(m.orgId, listKey, open.map((t) => t.id), now());
      if (!open.length) return 'Nothing open — you\'re all caught up. 🎉';
      const tz = safeTz(m.timezone);
      const lines = open.map((t, i) => `${i + 1}. ${t.title}${t.dueAt ? ` — ${t.isOverdue ? 'OVERDUE, ' : ''}due ${dueLabel(t.dueAt, now(), tz, t.dueAllDay)}` : ''}`);
      return `Your open tasks:\n${lines.join('\n')}\n\nReply "done 1" to complete one.`;
    }
    const done = /^(done|complete|finished|close)\s+#?(\d{1,3})$/.exec(cmd);
    if (done) {
      const ids = db.kv.get<string[]>(m.orgId, listKey) ?? [];
      const id = ids[Number(done[2]) - 1];
      if (!id) return 'I don\'t have that number — send "list" first, then "done 1".';
      try {
        const t = await ctx.services.tasks.complete(actor, id);
        return `✅ Done: "${t.title}". Nice work!`;
      } catch (err) {
        return err instanceof AppError && err.code === 'not_found' ? 'That task no longer exists.' : 'Sorry, I couldn\'t complete that task.';
      }
    }
    return null;
  }

  async function createForMember(m: Member, msg: InboundMessage): Promise<TaskView> {
    const actor = memberActor(m);
    const source = { channel: msg.channel, ref: msg.externalId, from: msg.from };
    const body = msg.text.trim();
    const headline = msg.subject?.trim() || firstLine(body);
    const notes = msg.subject?.trim() ? body : body.includes('\n') ? body : '';
    if (ctx.llm) {
      const d = await suggest(m.orgId, msg, safeTz(m.timezone));
      if (d && d.title) {
        try {
          return await ctx.services.tasks.create(actor, { ...d, notes: d.notes ?? notes, source });
        } catch (err) {
          ctx.log.warn('[intake] llm draft rejected, using parser', err);
        }
      }
    }
    const view = await ctx.services.tasks.quickAdd(actor, headline.slice(0, 2000), { source });
    if (notes) return ctx.services.tasks.update(actor, view.id, { notes: notes.slice(0, 20_000) });
    return view;
  }

  async function ingest(orgId: string, msg: InboundMessage): Promise<{ item: InboxItem | null; task: TaskView | null; reply: string | null }> {
    const empty = { item: null, task: null, reply: null };
    try {
      if (!v.isObj(msg) || typeof orgId !== 'string') return empty;
      if (msg.channel !== 'whatsapp' && msg.channel !== 'email') return empty;
      if (typeof msg.from !== 'string' || !msg.from.trim() || typeof msg.externalId !== 'string' || !msg.externalId.trim()) return empty;
      const text = typeof msg.text === 'string' ? msg.text.slice(0, 20_000) : '';
      const subject = typeof msg.subject === 'string' ? msg.subject.slice(0, 500) : null;
      if (!text.trim() && !subject?.trim()) return empty;
      const org = db.orgs.get(orgId);
      if (!org) return empty;
      const clean: InboundMessage = {
        channel: msg.channel, from: msg.from.trim().slice(0, 254), fromName: typeof msg.fromName === 'string' ? msg.fromName.slice(0, 200) : null, subject, text,
        externalId: msg.externalId.trim().slice(0, 300), receivedAt: typeof msg.receivedAt === 'number' && Number.isFinite(msg.receivedAt) ? msg.receivedAt : now(),
        authenticated: senderVerified(msg),
      };
      const verified = clean.authenticated === true;

      const dup = db.inbox.findByExternal(orgId, clean.externalId);
      if (dup) return { item: dup, task: null, reply: null };

      const sender = matchSender(orgId, clean);
      const canCreate = sender && sender.role !== 'guest';
      const item: InboxItem = {
        id: newId('inbox'), orgId, channel: clean.channel, from: clean.from, fromName: clean.fromName, subject: clean.subject, text: clean.text, externalId: clean.externalId,
        memberId: sender?.id ?? null, status: canCreate ? 'converted' : 'new', suggestion: null, taskId: null, receivedAt: clean.receivedAt, createdAt: now(),
      };
      // Claim the externalId first (UNIQUE) so concurrent duplicate deliveries do nothing.
      if (!db.inbox.insert(item)) return { item: db.inbox.findByExternal(orgId, clean.externalId), task: null, reply: null };

      if (canCreate) {
        const reply = await memberCommand(sender!, (subject?.trim() ? '' : text) || '');
        if (reply !== null) {
          item.status = 'dismissed';
          db.inbox.save(item);
          return { item, task: null, reply };
        }
        try {
          const task = await createForMember(sender!, clean);
          item.taskId = task.id;
          db.inbox.save(item);
          return { item, task, reply: taskReply(task, sender!) };
        } catch (err) {
          ctx.log.warn('[intake] could not create task for member; moving to inbox', err);
          item.status = 'new';
          db.inbox.save(item);
        }
      }

      // Unknown/unverified sender (or creation failed): triage in the Inbox.
      item.suggestion = await suggest(orgId, clean, org.timezone);
      if (!verified) {
        const base = item.suggestion ?? { title: (clean.subject?.trim() || firstLine(clean.text) || 'Message').slice(0, 500) };
        const original = `From ${clean.fromName ? `${clean.fromName} <${clean.from}>` : clean.from}:\n\n${clean.text}`;
        item.suggestion = { ...base, notes: `${UNVERIFIED_NOTE}\n\n${base.notes ?? original}`.slice(0, 20_000) };
      }
      db.inbox.save(item);
      const managers = db.members.list(orgId, { kind: 'human' }).filter((m) => rank(m.role) >= rank('manager'));
      const who = (clean.fromName ? `${clean.fromName} (${clean.from})` : clean.from) + (verified ? '' : ' — sender not verified');
      const preview = (verified ? '' : '⚠ Sender not verified. ') + (clean.subject ? `${clean.subject} — ` : '') + firstLine(clean.text);
      for (const m of managers.filter((x) => rank(x.role) >= rank('admin'))) {
        try {
          await ctx.services.notifications.notify(orgId, m.id, {
            kind: 'intake_new', title: `New ${clean.channel === 'whatsapp' ? 'WhatsApp' : 'email'} from ${who}`, body: preview.slice(0, 300), taskId: null, meetingId: null, link: '/inbox', urgent: false,
          });
        } catch (err) {
          ctx.log.warn('[intake] notify failed', err);
        }
      }
      publish(ctx, orgId, { type: 'inbox.new', item }, managers.map((m) => m.id));
      ctx.internal.invalidateBriefings(orgId);
      // Never auto-acknowledge an unverified email: the From address may be a spoofing victim (backscatter).
      const reply = org.intakeAutoAck && verified ? `Thanks${clean.fromName ? `, ${clean.fromName.split(/\s+/)[0]}` : ''} — we received your message and will get back to you shortly.` : null;
      return { item, task: null, reply };
    } catch (err) {
      ctx.log.error('[intake] ingest failed', err);
      return empty;
    }
  }

  return {
    async list(actor, opts = {}) {
      requireRole(actor, 'manager', 'Managers and above can see the inbox');
      const status = opts.status !== undefined ? v.oneOf(opts.status, 'status', ['new', 'converted', 'dismissed'] as const) : undefined;
      return db.inbox.list(actor.orgId, { status });
    },

    async convert(actor, id, draft = {}) {
      requireWrite(actor);
      requireRole(actor, 'manager', 'Managers and above can triage the inbox');
      const item = load(actor, id);
      if (item.status === 'converted') throw new AppError('conflict', 'Already converted to a task');
      const base: TaskDraft = item.suggestion ?? { title: (item.subject?.trim() || firstLine(item.text) || 'Message').slice(0, 500) };
      const d = v.isObj(draft) ? draft : {};
      const task = await ctx.services.tasks.create(actor, {
        ...base,
        ...d,
        title: (d.title ?? base.title) as string,
        notes: (d.notes ?? base.notes ?? `From ${item.fromName ?? item.from}:\n\n${item.text}`) as string,
        source: { channel: item.channel, ref: item.externalId, from: item.from },
      });
      const before = { ...item };
      item.status = 'converted';
      item.taskId = task.id;
      db.inbox.save(item);
      await audit(ctx, actor, { type: 'inbox.converted', entity: 'inbox', entityId: item.id, summary: `Converted message from ${item.from} into "${task.title}"`, before, after: item });
      return task;
    },

    async dismiss(actor, id) {
      requireWrite(actor);
      requireRole(actor, 'manager', 'Managers and above can triage the inbox');
      const item = load(actor, id);
      if (item.status === 'dismissed') return;
      if (item.status === 'converted') forbidden('Converted items cannot be dismissed');
      const before = { ...item };
      item.status = 'dismissed';
      db.inbox.save(item);
      await audit(ctx, actor, { type: 'inbox.dismissed', entity: 'inbox', entityId: item.id, summary: `Dismissed message from ${item.from}`, before, after: item, undoable: true });
      ctx.internal.invalidateBriefings(actor.orgId);
    },

    ingest,
  };
}
