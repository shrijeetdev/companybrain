// Meetings, calendar feeds, notifications, push subscriptions, jobs, inbox, leads, audit.

import type BetterSqlite3 from 'better-sqlite3';
import type { AuditEvent, CalendarFeed, InboxItem, Job, JobKind, Lead, Meeting, Notification, TaskDraft } from '@companybrain/types';
import type { SecretBox } from '../crypto.js';
import { newId } from '../util.js';
import { json, parseJson } from './identity.js';

type SQL = BetterSqlite3.Database;
type Row = Record<string, any>;

// ─── meetings ────────────────────────────────────────────────────────────────

function rowToMeeting(r: Row, attendeeIds: string[]): Meeting {
  return {
    id: r.id,
    orgId: r.org_id,
    ownerId: r.owner_id ?? null,
    title: r.title,
    startAt: r.start_at,
    endAt: r.end_at,
    allDay: !!r.all_day,
    location: r.location ?? null,
    url: r.url ?? null,
    attendeeIds,
    notes: r.notes,
    source: r.source,
    externalId: r.external_id ?? null,
    feedId: r.feed_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function meetingRepo(db: SQL) {
  const attendeesOf = (ids: string[]) => {
    const map = new Map<string, string[]>();
    if (!ids.length) return map;
    for (const r of db.prepare('SELECT meeting_id, member_id FROM meeting_attendees WHERE meeting_id IN (SELECT value FROM json_each(?)) ORDER BY rowid').all(JSON.stringify(ids)) as Row[]) {
      if (!map.has(r.meeting_id)) map.set(r.meeting_id, []);
      map.get(r.meeting_id)!.push(r.member_id);
    }
    return map;
  };
  const hydrate = (rows: Row[]) => {
    const a = attendeesOf(rows.map((r) => r.id));
    return rows.map((r) => rowToMeeting(r, a.get(r.id) ?? []));
  };
  const setAttendees = (m: Meeting) => {
    db.prepare('DELETE FROM meeting_attendees WHERE meeting_id=?').run(m.id);
    const ins = db.prepare('INSERT OR IGNORE INTO meeting_attendees (meeting_id, member_id) VALUES (?,?)');
    for (const a of m.attendeeIds) ins.run(m.id, a);
  };
  const params = (m: Meeting) => ({ ...m, allDay: m.allDay ? 1 : 0, attendeeIds: undefined });
  return {
    insert(m: Meeting): void {
      db.prepare(`INSERT INTO meetings (id, org_id, owner_id, title, start_at, end_at, all_day, location, url, notes, source, external_id, feed_id, created_at, updated_at)
        VALUES (@id, @orgId, @ownerId, @title, @startAt, @endAt, @allDay, @location, @url, @notes, @source, @externalId, @feedId, @createdAt, @updatedAt)`).run(params(m));
      setAttendees(m);
    },
    save(m: Meeting): void {
      db.prepare(`UPDATE meetings SET owner_id=@ownerId, title=@title, start_at=@startAt, end_at=@endAt, all_day=@allDay, location=@location, url=@url, notes=@notes,
        updated_at=@updatedAt WHERE org_id=@orgId AND id=@id`).run(params(m));
      setAttendees(m);
    },
    get(orgId: string, id: string): Meeting | null {
      const r = db.prepare('SELECT * FROM meetings WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r ? hydrate([r])[0]! : null;
    },
    delete(orgId: string, id: string): void {
      db.prepare('DELETE FROM meetings WHERE org_id=? AND id=?').run(orgId, id);
    },
    /** Meetings overlapping [from, to). memberId → owned by, attending, or org-wide. */
    list(orgId: string, range: { from: number; to: number; memberId?: string }): Meeting[] {
      let sql = 'SELECT * FROM meetings m WHERE m.org_id=@orgId AND m.end_at > @from AND m.start_at < @to';
      if (range.memberId) sql += ' AND (m.owner_id IS NULL OR m.owner_id=@memberId OR EXISTS (SELECT 1 FROM meeting_attendees a WHERE a.meeting_id=m.id AND a.member_id=@memberId))';
      sql += ' ORDER BY m.start_at LIMIT 2000';
      return hydrate(db.prepare(sql).all({ orgId, from: range.from, to: range.to, memberId: range.memberId ?? null }) as Row[]);
    },
    listByFeed(orgId: string, feedId: string): Meeting[] {
      return hydrate(db.prepare('SELECT * FROM meetings WHERE org_id=? AND feed_id=?').all(orgId, feedId) as Row[]);
    },
    deleteByFeed(orgId: string, feedId: string): void {
      db.prepare('DELETE FROM meetings WHERE org_id=? AND feed_id=?').run(orgId, feedId);
    },
  };
}

// ─── calendar feeds (URL encrypted at rest) ──────────────────────────────────

function rowToFeed(r: Row): CalendarFeed {
  return { id: r.id, orgId: r.org_id, memberId: r.member_id, name: r.name, urlMasked: r.url_masked, lastSyncAt: r.last_sync_at ?? null, lastError: r.last_error ?? null, createdAt: r.created_at };
}

export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = (u.pathname + u.search).slice(-4);
    return `${u.protocol}//${u.host}/…${tail}`;
  } catch {
    return '…';
  }
}

export function feedRepo(db: SQL, box: SecretBox) {
  return {
    insert(f: CalendarFeed, url: string): void {
      db.prepare('INSERT INTO calendar_feeds (id, org_id, member_id, name, url_enc, url_masked, last_sync_at, last_error, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(f.id, f.orgId, f.memberId, f.name, box.encrypt(url), f.urlMasked, f.lastSyncAt, f.lastError, f.createdAt);
    },
    get(orgId: string, id: string): CalendarFeed | null {
      const r = db.prepare('SELECT * FROM calendar_feeds WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r ? rowToFeed(r) : null;
    },
    /** Decrypted URL (server-side use only; never returned to clients). */
    getUrl(orgId: string, id: string): string | null {
      const r = db.prepare('SELECT url_enc FROM calendar_feeds WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r ? box.decrypt(r.url_enc) : null;
    },
    list(orgId: string, memberId?: string): CalendarFeed[] {
      const rows = memberId
        ? db.prepare('SELECT * FROM calendar_feeds WHERE org_id=? AND member_id=? ORDER BY created_at').all(orgId, memberId)
        : db.prepare('SELECT * FROM calendar_feeds WHERE org_id=? ORDER BY created_at').all(orgId);
      return (rows as Row[]).map(rowToFeed);
    },
    setSync(orgId: string, id: string, at: number, error: string | null): void {
      db.prepare('UPDATE calendar_feeds SET last_sync_at=?, last_error=? WHERE org_id=? AND id=?').run(at, error, orgId, id);
    },
    delete(orgId: string, id: string): void {
      db.prepare('DELETE FROM calendar_feeds WHERE org_id=? AND id=?').run(orgId, id);
    },
  };
}

// ─── notifications & push ────────────────────────────────────────────────────

function rowToNotification(r: Row): Notification {
  return {
    id: r.id, orgId: r.org_id, memberId: r.member_id, kind: r.kind, title: r.title, body: r.body, taskId: r.task_id ?? null, meetingId: r.meeting_id ?? null,
    link: r.link ?? null, urgent: !!r.urgent, readAt: r.read_at ?? null, createdAt: r.created_at,
  };
}

export function notificationRepo(db: SQL) {
  return {
    insert(n: Notification): void {
      db.prepare(`INSERT INTO notifications (id, org_id, member_id, kind, title, body, task_id, meeting_id, link, urgent, read_at, created_at)
        VALUES (@id, @orgId, @memberId, @kind, @title, @body, @taskId, @meetingId, @link, @urgent, @readAt, @createdAt)`).run({ ...n, urgent: n.urgent ? 1 : 0 });
    },
    get(orgId: string, id: string): Notification | null {
      const r = db.prepare('SELECT * FROM notifications WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r ? rowToNotification(r) : null;
    },
    list(orgId: string, memberId: string, opts: { unreadOnly?: boolean; limit?: number; kind?: string } = {}): Notification[] {
      let sql = 'SELECT * FROM notifications WHERE org_id=@orgId AND member_id=@memberId';
      if (opts.unreadOnly) sql += ' AND read_at IS NULL';
      if (opts.kind) sql += ' AND kind=@kind';
      sql += ' ORDER BY created_at DESC, rowid DESC LIMIT @limit';
      return (db.prepare(sql).all({ orgId, memberId, kind: opts.kind ?? null, limit: Math.min(Math.max(opts.limit ?? 50, 1), 500) }) as Row[]).map(rowToNotification);
    },
    unreadCount(orgId: string, memberId: string): number {
      return (db.prepare('SELECT COUNT(*) c FROM notifications WHERE org_id=? AND member_id=? AND read_at IS NULL').get(orgId, memberId) as Row).c;
    },
    markRead(orgId: string, memberId: string, ids: string[] | 'all', at: number): number {
      if (ids === 'all') return db.prepare('UPDATE notifications SET read_at=? WHERE org_id=? AND member_id=? AND read_at IS NULL').run(at, orgId, memberId).changes;
      return db.prepare('UPDATE notifications SET read_at=? WHERE org_id=? AND member_id=? AND read_at IS NULL AND id IN (SELECT value FROM json_each(?))')
        .run(at, orgId, memberId, JSON.stringify(ids)).changes;
    },
  };
}

export interface PushSubRow { id: string; orgId: string; memberId: string; endpoint: string; keys: { p256dh: string; auth: string }; userAgent: string | null; createdAt: number }

export function pushRepo(db: SQL) {
  return {
    upsert(orgId: string, memberId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null, at: number): void {
      // An endpoint belongs to one browser: re-subscribing moves it to the current member.
      db.prepare(`INSERT INTO push_subscriptions (id, org_id, member_id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(endpoint) DO UPDATE SET org_id=excluded.org_id, member_id=excluded.member_id, p256dh=excluded.p256dh, auth=excluded.auth, user_agent=excluded.user_agent`)
        .run(newId('push'), orgId, memberId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent, at);
    },
    list(orgId: string, memberId: string): PushSubRow[] {
      return (db.prepare('SELECT * FROM push_subscriptions WHERE org_id=? AND member_id=?').all(orgId, memberId) as Row[]).map((r) => ({
        id: r.id, orgId: r.org_id, memberId: r.member_id, endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth }, userAgent: r.user_agent ?? null, createdAt: r.created_at,
      }));
    },
    delete(orgId: string, memberId: string, endpoint: string): void {
      db.prepare('DELETE FROM push_subscriptions WHERE org_id=? AND member_id=? AND endpoint=?').run(orgId, memberId, endpoint);
    },
  };
}

// ─── jobs (persistent scheduler queue) ───────────────────────────────────────

function rowToJob(r: Row): Job {
  return {
    id: r.id, orgId: r.org_id, kind: r.kind as JobKind, key: r.key, runAt: r.run_at, payload: parseJson(r.payload, {}), status: r.status,
    attempts: r.attempts, lastError: r.last_error ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function jobRepo(db: SQL) {
  const pendingByKey = db.prepare("SELECT * FROM jobs WHERE key=? AND status='pending'");
  return {
    /**
     * Schedule (dedupe by key): if a pending job with this key exists it is moved to the new
     * runAt/payload (or left alone when `ifAbsent`). Keys embed ids, so they are org-unique.
     */
    schedule(orgId: string, kind: JobKind, key: string, runAt: number, payload: Record<string, unknown>, now: number, opts: { ifAbsent?: boolean } = {}): Job {
      return db.transaction(() => {
        const existing = pendingByKey.get(key) as Row | undefined;
        if (existing) {
          if (existing.org_id !== orgId) throw new Error('job key collision across orgs');
          if (!opts.ifAbsent) {
            db.prepare('UPDATE jobs SET run_at=?, payload=?, updated_at=? WHERE id=?').run(runAt, JSON.stringify(payload), now, existing.id);
            return rowToJob({ ...existing, run_at: runAt, payload: JSON.stringify(payload), updated_at: now });
          }
          return rowToJob(existing);
        }
        const id = newId('job');
        db.prepare("INSERT INTO jobs (id, org_id, kind, key, run_at, payload, status, attempts, created_at, updated_at) VALUES (?,?,?,?,?,?,'pending',0,?,?)")
          .run(id, orgId, kind, key, runAt, JSON.stringify(payload), now, now);
        return rowToJob({ id, org_id: orgId, kind, key, run_at: runAt, payload: JSON.stringify(payload), status: 'pending', attempts: 0, last_error: null, created_at: now, updated_at: now });
      })();
    },
    /** Cancel pending jobs whose key is in `keys` or starts with one of `prefixes`. */
    cancel(orgId: string, keys: string[], prefixes: string[] = [], now = Date.now()): number {
      let n = 0;
      if (keys.length) n += db.prepare("UPDATE jobs SET status='cancelled', updated_at=? WHERE org_id=? AND status='pending' AND key IN (SELECT value FROM json_each(?))").run(now, orgId, JSON.stringify(keys)).changes;
      for (const p of prefixes) {
        n += db.prepare("UPDATE jobs SET status='cancelled', updated_at=? WHERE org_id=? AND status='pending' AND substr(key, 1, ?)=?").run(now, orgId, p.length, p).changes;
      }
      return n;
    },
    /** Atomically claim due jobs (pending → running, attempts+1). System-level: spans orgs. */
    claimDue(now: number, limit = 50): Job[] {
      return db.transaction(() => {
        const rows = db.prepare("SELECT * FROM jobs WHERE status='pending' AND run_at <= ? ORDER BY run_at, rowid LIMIT ?").all(now, limit) as Row[];
        const claim = db.prepare("UPDATE jobs SET status='running', attempts=attempts+1, updated_at=? WHERE id=? AND status='pending'");
        const out: Job[] = [];
        for (const r of rows) {
          if (claim.run(now, r.id).changes === 1) out.push(rowToJob({ ...r, status: 'running', attempts: r.attempts + 1, updated_at: now }));
        }
        return out;
      })();
    },
    complete(orgId: string, id: string, now: number): void {
      db.prepare("UPDATE jobs SET status='done', last_error=NULL, updated_at=? WHERE org_id=? AND id=?").run(now, orgId, id);
    },
    /** Retry at `retryAt` (back to pending) or mark failed when null. Superseded retries are cancelled. */
    fail(orgId: string, id: string, error: string, retryAt: number | null, now: number): Job['status'] {
      return db.transaction(() => {
        const row = db.prepare('SELECT key FROM jobs WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
        if (!row) return 'failed' as const;
        if (retryAt !== null) {
          if (pendingByKey.get(row.key)) {
            db.prepare("UPDATE jobs SET status='cancelled', last_error=?, updated_at=? WHERE id=?").run(error, now, id);
            return 'cancelled' as const;
          }
          db.prepare("UPDATE jobs SET status='pending', run_at=?, last_error=?, updated_at=? WHERE id=?").run(retryAt, error, now, id);
          return 'pending' as const;
        }
        db.prepare("UPDATE jobs SET status='failed', last_error=?, updated_at=? WHERE id=?").run(error, now, id);
        return 'failed' as const;
      })();
    },
    /** After a crash: jobs left 'running' go back to pending (or are cancelled if superseded). System-level. */
    recoverRunning(now: number): number {
      return db.transaction(() => {
        let n = 0;
        for (const r of db.prepare("SELECT id, key FROM jobs WHERE status='running'").all() as Row[]) {
          if (pendingByKey.get(r.key)) db.prepare("UPDATE jobs SET status='cancelled', updated_at=? WHERE id=?").run(now, r.id);
          else db.prepare("UPDATE jobs SET status='pending', updated_at=? WHERE id=?").run(now, r.id);
          n++;
        }
        return n;
      })();
    },
    getPending(orgId: string, key: string): Job | null {
      const r = db.prepare("SELECT * FROM jobs WHERE org_id=? AND key=? AND status='pending'").get(orgId, key) as Row | undefined;
      return r ? rowToJob(r) : null;
    },
    list(orgId: string, opts: { status?: Job['status']; kind?: JobKind; keyPrefix?: string; limit?: number } = {}): Job[] {
      let sql = 'SELECT * FROM jobs WHERE org_id=@orgId';
      if (opts.status) sql += ' AND status=@status';
      if (opts.kind) sql += ' AND kind=@kind';
      if (opts.keyPrefix) sql += ' AND substr(key, 1, length(@prefix))=@prefix';
      sql += ' ORDER BY run_at, rowid LIMIT @limit';
      return (db.prepare(sql).all({ orgId, status: opts.status ?? null, kind: opts.kind ?? null, prefix: opts.keyPrefix ?? null, limit: opts.limit ?? 1000 }) as Row[]).map(rowToJob);
    },
    /** Housekeeping: drop finished jobs older than `before`. System-level. */
    purgeFinished(before: number): number {
      return db.prepare("DELETE FROM jobs WHERE status IN ('done','cancelled','failed') AND updated_at < ?").run(before).changes;
    },
  };
}

// ─── inbox ───────────────────────────────────────────────────────────────────

function rowToInbox(r: Row): InboxItem {
  return {
    id: r.id, orgId: r.org_id, channel: r.channel, from: r.from_handle, fromName: r.from_name ?? null, subject: r.subject ?? null, text: r.text, externalId: r.external_id,
    memberId: r.member_id ?? null, status: r.status, suggestion: parseJson<TaskDraft | null>(r.suggestion, null), taskId: r.task_id ?? null, receivedAt: r.received_at, createdAt: r.created_at,
  };
}

export function inboxRepo(db: SQL) {
  const params = (i: InboxItem) => ({ ...i, suggestion: json(i.suggestion) });
  return {
    /** Returns false if (org, externalId) already exists — idempotent ingest. */
    insert(i: InboxItem): boolean {
      return db.prepare(`INSERT OR IGNORE INTO inbox_items (id, org_id, channel, from_handle, from_name, subject, text, external_id, member_id, status, suggestion, task_id, received_at, created_at)
        VALUES (@id, @orgId, @channel, @from, @fromName, @subject, @text, @externalId, @memberId, @status, @suggestion, @taskId, @receivedAt, @createdAt)`).run(params(i)).changes === 1;
    },
    save(i: InboxItem): void {
      db.prepare('UPDATE inbox_items SET member_id=@memberId, status=@status, suggestion=@suggestion, task_id=@taskId WHERE org_id=@orgId AND id=@id').run(params(i));
    },
    get(orgId: string, id: string): InboxItem | null {
      const r = db.prepare('SELECT * FROM inbox_items WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r ? rowToInbox(r) : null;
    },
    findByExternal(orgId: string, externalId: string): InboxItem | null {
      const r = db.prepare('SELECT * FROM inbox_items WHERE org_id=? AND external_id=?').get(orgId, externalId) as Row | undefined;
      return r ? rowToInbox(r) : null;
    },
    list(orgId: string, opts: { status?: InboxItem['status']; limit?: number } = {}): InboxItem[] {
      const rows = opts.status
        ? db.prepare('SELECT * FROM inbox_items WHERE org_id=? AND status=? ORDER BY received_at DESC LIMIT ?').all(orgId, opts.status, opts.limit ?? 200)
        : db.prepare('SELECT * FROM inbox_items WHERE org_id=? ORDER BY received_at DESC LIMIT ?').all(orgId, opts.limit ?? 200);
      return (rows as Row[]).map(rowToInbox);
    },
    countNew(orgId: string): number {
      return (db.prepare("SELECT COUNT(*) c FROM inbox_items WHERE org_id=? AND status='new'").get(orgId) as Row).c;
    },
  };
}

// ─── leads ───────────────────────────────────────────────────────────────────

function rowToLead(r: Row): Lead {
  return {
    id: r.id, orgId: r.org_id, name: r.name, company: r.company, email: r.email, phone: r.phone, stage: r.stage, value: r.value ?? null, notes: r.notes,
    ownerId: r.owner_id ?? null, source: r.source, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function leadRepo(db: SQL) {
  return {
    list(orgId: string): Lead[] {
      return (db.prepare('SELECT * FROM leads WHERE org_id=? ORDER BY updated_at DESC').all(orgId) as Row[]).map(rowToLead);
    },
    get(orgId: string, id: string): Lead | null {
      const r = db.prepare('SELECT * FROM leads WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r ? rowToLead(r) : null;
    },
    insert(l: Lead): void {
      db.prepare(`INSERT INTO leads (id, org_id, name, company, email, phone, stage, value, notes, owner_id, source, created_by, created_at, updated_at)
        VALUES (@id, @orgId, @name, @company, @email, @phone, @stage, @value, @notes, @ownerId, @source, @createdBy, @createdAt, @updatedAt)`).run(l);
    },
    save(l: Lead): void {
      db.prepare(`UPDATE leads SET name=@name, company=@company, email=@email, phone=@phone, stage=@stage, value=@value, notes=@notes, owner_id=@ownerId, source=@source,
        updated_at=@updatedAt WHERE org_id=@orgId AND id=@id`).run(l);
    },
    delete(orgId: string, id: string): void {
      db.prepare('DELETE FROM leads WHERE org_id=? AND id=?').run(orgId, id);
    },
  };
}

// ─── audit ───────────────────────────────────────────────────────────────────

function rowToAudit(r: Row): AuditEvent {
  return {
    id: r.id, orgId: r.org_id, actorId: r.actor_id, type: r.type, entity: r.entity, entityId: r.entity_id, summary: r.summary,
    before: parseJson(r.before, null), after: parseJson(r.after, null), undoable: !!r.undoable, undoneAt: r.undone_at ?? null, undoneBy: r.undone_by ?? null, at: r.at,
  };
}

export function auditRepo(db: SQL) {
  return {
    insert(e: AuditEvent): void {
      db.prepare(`INSERT INTO audit_events (id, org_id, actor_id, type, entity, entity_id, summary, before, after, undoable, undone_at, undone_by, at)
        VALUES (@id, @orgId, @actorId, @type, @entity, @entityId, @summary, @before, @after, @undoable, @undoneAt, @undoneBy, @at)`)
        .run({ ...e, before: json(e.before), after: json(e.after), undoable: e.undoable ? 1 : 0 });
    },
    get(orgId: string, id: string): AuditEvent | null {
      const r = db.prepare('SELECT * FROM audit_events WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r ? rowToAudit(r) : null;
    },
    list(orgId: string, opts: { entity?: AuditEvent['entity']; entityId?: string; actorId?: string; limit?: number } = {}): AuditEvent[] {
      let sql = 'SELECT * FROM audit_events WHERE org_id=@orgId';
      if (opts.entity) sql += ' AND entity=@entity';
      if (opts.entityId) sql += ' AND entity_id=@entityId';
      if (opts.actorId) sql += ' AND actor_id=@actorId';
      sql += ' ORDER BY at DESC, rowid DESC LIMIT @limit';
      return (db.prepare(sql).all({ orgId, entity: opts.entity ?? null, entityId: opts.entityId ?? null, actorId: opts.actorId ?? null, limit: Math.min(Math.max(opts.limit ?? 100, 1), 1000) }) as Row[]).map(rowToAudit);
    },
    /** Single-use: returns true only for the first caller. */
    markUndone(orgId: string, id: string, by: string, at: number): boolean {
      return db.prepare('UPDATE audit_events SET undone_at=?, undone_by=? WHERE org_id=? AND id=? AND undoable=1 AND undone_at IS NULL').run(at, by, orgId, id).changes === 1;
    },
  };
}
