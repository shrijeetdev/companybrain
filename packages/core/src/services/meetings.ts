// Meetings (manual + ICS feeds). Feed URLs are encrypted at rest and only ever returned masked.

import { AppError, type Actor, type CalendarFeed, type Meeting, type MeetingService } from '@companybrain/types';
import { maskUrl, newId } from '@companybrain/db';
import { audit, publish, type Ctx } from '../context.js';
import { forbidden, isAdmin, isManager, notFound, requireWrite } from '../perms.js';
import * as v from '../validate.js';

const DAY = 86_400_000;
const SYNC_PAST_MS = 7 * DAY;
const SYNC_FUTURE_MS = 120 * DAY;

export interface MeetingInternals {
  service: MeetingService;
  syncFeed(orgId: string, feedId: string): Promise<CalendarFeed>;
  audience(m: Meeting): string[] | undefined;
}

export function createMeetingService(ctx: Ctx): MeetingInternals {
  const { db } = ctx;
  const now = () => ctx.clock();

  /** Owner + attendees + managers; undefined = org-wide meeting (everyone). */
  function audience(m: Meeting): string[] | undefined {
    if (!m.ownerId && !m.attendeeIds.length) return undefined;
    const ids = new Set([...(m.ownerId ? [m.ownerId] : []), ...m.attendeeIds]);
    for (const x of db.members.list(m.orgId, { kind: 'human' })) if (['owner', 'admin', 'manager'].includes(x.role)) ids.add(x.id);
    return [...ids];
  }

  function canSee(actor: Actor, m: Meeting): boolean {
    return isManager(actor) || !m.ownerId && !m.attendeeIds.length || m.ownerId === actor.memberId || m.attendeeIds.includes(actor.memberId);
  }

  function load(actor: Actor, id: string): Meeting {
    const m = typeof id === 'string' ? db.meetings.get(actor.orgId, id) : null;
    if (!m || !canSee(actor, m)) notFound('Meeting not found');
    return m!;
  }

  function loadEditable(actor: Actor, id: string): Meeting {
    requireWrite(actor);
    const m = load(actor, id);
    if (!isManager(actor) && m.ownerId !== actor.memberId) forbidden('Only the organizer or a manager can change this meeting');
    return m;
  }

  function validAttendees(actor: Actor, ids: unknown): string[] {
    const list = v.refs(ids, 'attendeeIds', 100);
    if (db.members.getMany(actor.orgId, list).length !== list.length) v.bad('attendeeIds contains an unknown member');
    return list;
  }

  function changed(m: Meeting) {
    ctx.internal.scheduleMeeting(m);
    publish(ctx, m.orgId, { type: 'meeting.upserted', meeting: m }, audience(m));
    ctx.internal.invalidateBriefings(m.orgId);
  }

  async function syncFeed(orgId: string, feedId: string): Promise<CalendarFeed> {
    const feed = db.feeds.get(orgId, feedId);
    if (!feed) notFound('Calendar feed not found');
    const url = db.feeds.getUrl(orgId, feedId)!;
    const t0 = now();
    try {
      const events = await ctx.calendar.fetch(url);
      const inWindow = events.filter((e) => e && typeof e.uid === 'string' && e.endAt >= t0 - SYNC_PAST_MS && e.startAt <= t0 + SYNC_FUTURE_MS).slice(0, 2000);
      const existing = new Map(db.meetings.listByFeed(orgId, feedId).map((m) => [m.externalId, m]));
      const seen = new Set<string>();
      const touched: Meeting[] = [];
      db.tx(() => {
        for (const e of inWindow) {
          if (seen.has(e.uid)) continue;
          seen.add(e.uid);
          const prev = existing.get(e.uid);
          const base = {
            title: String(e.title || 'Busy').slice(0, 300), startAt: e.startAt, endAt: Math.max(e.endAt, e.startAt), allDay: !!e.allDay,
            location: e.location ? String(e.location).slice(0, 500) : null, url: e.url ? String(e.url).slice(0, 2048) : null, notes: String(e.notes ?? '').slice(0, 5000),
          };
          if (prev) {
            const same = prev.title === base.title && prev.startAt === base.startAt && prev.endAt === base.endAt && prev.allDay === base.allDay && prev.location === base.location && prev.url === base.url && prev.notes === base.notes;
            if (same) continue;
            const next = { ...prev, ...base, updatedAt: t0 };
            db.meetings.save(next);
            touched.push(next);
          } else {
            const m: Meeting = {
              id: newId('mtg'), orgId, ownerId: feed!.memberId, ...base, attendeeIds: [feed!.memberId], source: 'ics', externalId: e.uid, feedId, createdAt: t0, updatedAt: t0,
            };
            db.meetings.insert(m);
            touched.push(m);
          }
        }
        for (const [uid, m] of existing) {
          if (!uid || !seen.has(uid)) {
            db.meetings.delete(orgId, m.id);
            ctx.internal.cancelMeeting(orgId, m.id);
          }
        }
        db.feeds.setSync(orgId, feedId, t0, null);
      });
      for (const m of touched) changed(m);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.feeds.setSync(orgId, feedId, t0, msg.slice(0, 500));
      throw new AppError('bad_request', `Calendar sync failed: ${msg}`);
    }
    return db.feeds.get(orgId, feedId)!;
  }

  const service: MeetingService = {
    async list(actor, range) {
      if (!v.isObj(range)) v.bad('range is required');
      const from = v.time(range.from, 'from');
      const to = v.time(range.to, 'to');
      if (to <= from) v.bad('to must be after from');
      if (to - from > 400 * DAY) v.bad('Range too large (max 400 days)');
      let memberId: string | undefined;
      if (range.memberId === 'me') memberId = actor.memberId;
      else if (range.memberId) {
        memberId = v.ref(range.memberId, 'memberId');
        if (memberId !== actor.memberId && !isManager(actor)) forbidden("Only managers can view other people's calendars");
      } else if (!isManager(actor)) memberId = actor.memberId;
      return db.meetings.list(actor.orgId, { from, to, memberId });
    },

    async create(actor, input) {
      requireWrite(actor);
      if (!v.isObj(input)) v.bad('meeting input required');
      const t0 = now();
      const startAt = v.time(input.startAt, 'startAt');
      const endAt = v.time(input.endAt, 'endAt');
      if (endAt < startAt) v.bad('endAt must not be before startAt');
      const m: Meeting = {
        id: newId('mtg'),
        orgId: actor.orgId,
        ownerId: actor.via === 'system' ? null : actor.memberId,
        title: v.str(input.title, 'title', { max: 300 }),
        startAt,
        endAt,
        allDay: input.allDay === undefined ? false : v.bool(input.allDay, 'allDay'),
        location: v.optStr(input.location, 'location', 500),
        url: input.url === undefined || input.url === null || input.url === '' ? null : v.url(input.url, 'url'),
        attendeeIds: input.attendeeIds === undefined ? [] : validAttendees(actor, input.attendeeIds),
        notes: v.optStr(input.notes, 'notes', 5000) ?? '',
        source: 'manual',
        externalId: null,
        feedId: null,
        createdAt: t0,
        updatedAt: t0,
      };
      db.meetings.insert(m);
      await audit(ctx, actor, { type: 'meeting.created', entity: 'meeting', entityId: m.id, summary: `Scheduled "${m.title}"`, after: m, undoable: true });
      changed(m);
      return m;
    },

    async update(actor, id, patch) {
      const cur = loadEditable(actor, id);
      if (!v.isObj(patch)) v.bad('patch must be an object');
      const next: Meeting = { ...cur };
      if (patch.title !== undefined) next.title = v.str(patch.title, 'title', { max: 300 });
      if (patch.startAt !== undefined) next.startAt = v.time(patch.startAt, 'startAt');
      if (patch.endAt !== undefined) next.endAt = v.time(patch.endAt, 'endAt');
      if (next.endAt < next.startAt) v.bad('endAt must not be before startAt');
      if (patch.allDay !== undefined) next.allDay = v.bool(patch.allDay, 'allDay');
      if (patch.location !== undefined) next.location = v.optStr(patch.location, 'location', 500);
      if (patch.url !== undefined) next.url = patch.url === null || patch.url === '' ? null : v.url(patch.url, 'url');
      if (patch.attendeeIds !== undefined) next.attendeeIds = validAttendees(actor, patch.attendeeIds);
      if (patch.notes !== undefined) next.notes = v.optStr(patch.notes, 'notes', 5000) ?? '';
      next.updatedAt = now();
      db.meetings.save(next);
      await audit(ctx, actor, { type: 'meeting.updated', entity: 'meeting', entityId: next.id, summary: `Updated "${next.title}"`, before: cur, after: next, undoable: true });
      changed(next);
      return next;
    },

    async remove(actor, id) {
      const m = loadEditable(actor, id);
      db.meetings.delete(actor.orgId, m.id);
      ctx.internal.cancelMeeting(actor.orgId, m.id);
      await audit(ctx, actor, { type: 'meeting.deleted', entity: 'meeting', entityId: m.id, summary: `Cancelled "${m.title}"`, before: m, undoable: true });
      ctx.internal.invalidateBriefings(actor.orgId);
    },

    async listFeeds(actor) {
      return db.feeds.list(actor.orgId, isAdmin(actor) ? undefined : actor.memberId);
    },

    async addFeed(actor, input) {
      requireWrite(actor);
      if (actor.kind !== 'human') forbidden('Only people can add calendar feeds');
      if (!v.isObj(input)) v.bad('feed input required');
      const name = v.str(input.name, 'name', { max: 100 });
      let raw = v.str(input.url, 'url', { max: 2048 });
      if (raw.startsWith('webcal://')) raw = 'https://' + raw.slice('webcal://'.length);
      const url = v.url(raw, 'url');
      if (db.feeds.list(actor.orgId, actor.memberId).length >= 20) v.bad('Too many calendar feeds (max 20)');
      const feed: CalendarFeed = { id: newId('feed'), orgId: actor.orgId, memberId: actor.memberId, name, urlMasked: maskUrl(url), lastSyncAt: null, lastError: null, createdAt: now() };
      db.feeds.insert(feed, url);
      ctx.internal.scheduleFeedSync(actor.orgId, feed.id, now());
      return feed;
    },

    async removeFeed(actor, id) {
      requireWrite(actor);
      const f = typeof id === 'string' ? db.feeds.get(actor.orgId, id) : null;
      if (!f) notFound('Calendar feed not found');
      if (f!.memberId !== actor.memberId && !isAdmin(actor)) forbidden();
      for (const m of db.meetings.listByFeed(actor.orgId, f!.id)) ctx.internal.cancelMeeting(actor.orgId, m.id);
      db.meetings.deleteByFeed(actor.orgId, f!.id);
      db.feeds.delete(actor.orgId, f!.id);
      db.jobs.cancel(actor.orgId, [`calendar.sync:${f!.id}`], [], now());
      ctx.internal.invalidateBriefings(actor.orgId);
    },

    async syncFeed(actor, id) {
      requireWrite(actor);
      const f = typeof id === 'string' ? db.feeds.get(actor.orgId, id) : null;
      if (!f) notFound('Calendar feed not found');
      if (f!.memberId !== actor.memberId && !isAdmin(actor)) forbidden();
      return syncFeed(actor.orgId, f!.id);
    },
  };

  return { service, syncFeed, audience };
}
