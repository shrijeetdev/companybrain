// Personal briefing: deterministic greeting/headline/spoken script (optionally LLM-polished with a
// 4 s timeout + fallback), cached per member for 60 s. 'tactical' theme speaks in game voice
// (missions / operations / squad) with the same facts.

import { ROLE_RANK, type Actor, type Briefing, type BriefingService, type Meeting, type Member, type Task, type TaskView, type TeamPulse } from '@companybrain/types';
import { localParts, safeTz, spokenTime, startOfLocalDay } from '@companybrain/db';
import { firstName, withTimeout, type Ctx } from '../context.js';
import { notFound, rank, visibility } from '../perms.js';
import { PRIORITY_RANK } from '@companybrain/db';

const CACHE_MS = 60_000;
const POLISH_TIMEOUT_MS = 4_000;
const MAX_WORDS = 120;

interface Voice {
  task: string;
  tasks: string;
  greeting(part: string, name: string): string;
  opener: string | null;
  team: string;
}
const CLASSIC: Voice = { task: 'task', tasks: 'tasks', greeting: (p, n) => `Good ${p}, ${n}`, opener: null, team: 'the team' };
const TACTICAL: Voice = { task: 'mission', tasks: 'missions', greeting: (p, n) => `Good ${p}, Commander ${n}`, opener: 'Mission briefing for today:', team: 'the squad' };

const plural = (n: number, one: string, many: string) => `${n === 1 ? 'one' : n} ${n === 1 ? one : many}`;
const quote = (t: string) => `"${t.length > 60 ? t.slice(0, 57) + '…' : t}"`;

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function partOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

const byPriorityThenDue = (a: Task, b: Task) =>
  (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);

export interface BriefingInternals {
  service: BriefingService;
  compose(member: Member, opts?: { polish?: boolean }): Promise<Briefing>;
  invalidate(orgId: string): void;
}

export function createBriefingService(ctx: Ctx): BriefingInternals {
  const { db } = ctx;
  const cache = new Map<string, { at: number; orgId: string; b: Briefing }>();
  const now = () => ctx.clock();

  function actorOf(m: Member): Actor {
    return { orgId: m.orgId, memberId: m.id, role: m.role, kind: m.kind, via: 'session' };
  }

  async function compose(m: Member, opts: { polish?: boolean } = {}): Promise<Briefing> {
    const t0 = now();
    const tz = safeTz(m.timezone);
    const actor = actorOf(m);
    const vis = visibility(actor);
    const voice = m.prefs.theme === 'classic' ? CLASSIC : TACTICAL;
    const views = (ts: Task[]) => ctx.internal.views(m.orgId, ts, tz);
    const dayStart = startOfLocalDay(t0, tz);
    const dayEnd = startOfLocalDay(t0, tz, 1);
    const weekEnd = startOfLocalDay(t0, tz, 8);

    const overdue = views(db.tasks.query(m.orgId, { assigneeId: m.id, open: true, dueBefore: t0, order: 'due', limit: 50 }));
    const today = views(db.tasks.query(m.orgId, { assigneeId: m.id, open: true, dueAfter: t0, dueBefore: dayEnd, limit: 50 })).sort(byPriorityThenDue);
    const upcoming = views(db.tasks.query(m.orgId, { assigneeId: m.id, open: true, dueAfter: dayEnd, dueBefore: weekEnd, order: 'due', limit: 10 }));
    const meetings: Meeting[] = db.meetings.list(m.orgId, { from: Math.max(t0 - 30 * 60_000, dayStart), to: dayEnd, memberId: m.id });
    const waitingOn = views(db.tasks.query(m.orgId, { involvedId: m.id, open: true, waiting: true, limit: 20 }));

    const isMgr = m.kind === 'human' && rank(m.role) >= ROLE_RANK.manager;
    const team: TeamPulse[] = [];
    if (isMgr) {
      for (const p of db.members.list(m.orgId, { kind: 'human' })) {
        if (p.role === 'guest') continue;
        team.push({
          member: p,
          open: db.tasks.count(m.orgId, { assigneeId: p.id, open: true }),
          overdue: db.tasks.count(m.orgId, { assigneeId: p.id, open: true, dueBefore: t0 }),
          dueToday: db.tasks.count(m.orgId, { assigneeId: p.id, open: true, dueAfter: dayStart, dueBefore: dayEnd }),
          doneToday: db.tasks.count(m.orgId, { assigneeId: p.id, statuses: ['done'], completedAfter: dayStart }),
          doneThisWeek: db.tasks.count(m.orgId, { assigneeId: p.id, statuses: ['done'], completedAfter: t0 - 7 * 86_400_000 }),
          inProgress: views(db.tasks.query(m.orgId, { assigneeId: p.id, statuses: ['in_progress'], limit: 3 })),
        });
      }
    }
    const agents: Briefing['agents'] = [];
    for (const a of db.members.list(m.orgId, { kind: 'agent' })) {
      const open = views(db.tasks.query(m.orgId, { visibility: vis, assigneeId: a.id, open: true, limit: 50 }));
      const inProgress = open.filter((t) => t.status === 'in_progress');
      const stale = open.filter((t) => t.isStale);
      if (inProgress.length || stale.length || isMgr) agents.push({ member: a, inProgress, stale });
    }
    const unreadNotifications = db.notifications.unreadCount(m.orgId, m.id);
    const inboxNew = isMgr ? db.inbox.countNew(m.orgId) : 0;

    // ── words ──
    const name = firstName(m.name);
    const greeting = voice.greeting(partOfDay(localParts(t0, tz).hour), name);
    const mtgToday = meetings.filter((x) => x.startAt >= t0 - 30 * 60_000);
    const headParts: string[] = [];
    if (overdue.length) headParts.push(`${overdue.length} overdue`);
    if (today.length) headParts.push(`${today.length} ${today.length === 1 ? voice.task : voice.tasks} due today`);
    if (mtgToday.length) headParts.push(`${mtgToday.length} meeting${mtgToday.length === 1 ? '' : 's'}`);
    if (waitingOn.length) headParts.push(`waiting on ${waitingOn.length}`);
    const headline = headParts.length ? headParts.join(' · ') : voice === TACTICAL ? 'All clear — no missions due today' : 'All clear — nothing due today';

    const sentences: string[] = [`${greeting}.`];
    if (voice.opener) sentences.push(voice.opener);
    const dueTodayCount = overdue.length + today.length;
    if (overdue.length === 1) sentences.push(`One ${voice.task} is overdue: ${quote(overdue[0]!.title)}.`);
    else if (overdue.length > 1) sentences.push(`${overdue.length} ${voice.tasks} are overdue, starting with ${quote(overdue[0]!.title)}.`);
    if (today.length) {
      const top = today.slice(0, 5);
      const named = listJoin(top.slice(0, 3).map((t) => quote(t.title)));
      sentences.push(`You have ${plural(today.length, voice.task, voice.tasks)} due today${today.length <= 3 ? `: ${named}` : `, including ${named}`}.`);
    } else if (!dueTodayCount) {
      sentences.push(voice === TACTICAL ? 'No missions are due today.' : 'Nothing is due today.');
    }
    if (mtgToday.length) {
      const items = mtgToday.slice(0, 3).map((x) => (x.allDay ? `${x.title} all day` : `${x.title} at ${spokenTime(x.startAt, tz)}`));
      sentences.push(mtgToday.length === 1 ? `You have a meeting: ${items[0]}.` : `You have ${mtgToday.length} meetings: ${listJoin(items)}.`);
    }
    if (waitingOn.length) {
      const w = waitingOn[0]!;
      sentences.push(waitingOn.length === 1 ? `You're waiting on ${w.waitingOn!.name} for ${quote(w.title)}.` : `You're waiting on ${waitingOn.length} people, including ${w.waitingOn!.name} for ${quote(w.title)}.`);
    }
    if (isMgr && team.length) {
      const open = team.reduce((s, p) => s + p.open, 0);
      const od = team.reduce((s, p) => s + p.overdue, 0);
      const doneToday = team.reduce((s, p) => s + p.doneToday, 0);
      sentences.push(`Across ${voice.team}, ${open} ${open === 1 ? voice.task : voice.tasks} are open, ${od} overdue, and ${doneToday} finished today.`);
      const star = [...team].sort((a, b) => b.doneThisWeek - a.doneThisWeek)[0];
      if (star && star.doneThisWeek > 0 && star.member.id !== m.id) sentences.push(`${firstName(star.member.name)} has closed ${plural(star.doneThisWeek, voice.task, voice.tasks)} this week.`);
    }
    if (isMgr) {
      const working = agents.filter((a) => a.inProgress.length).slice(0, 2).map((a) => `${a.member.name} is working on ${quote(a.inProgress[0]!.title)}`);
      if (working.length) sentences.push(`${listJoin(working)}.`);
      const quiet = agents.filter((a) => a.stale.length).slice(0, 2).map((a) => `${a.member.name} has gone quiet on ${quote(a.stale[0]!.title)}`);
      if (quiet.length) sentences.push(`Heads up: ${listJoin(quiet)}.`);
      if (inboxNew) sentences.push(`${plural(inboxNew, 'new message is', 'new messages are')} waiting in the inbox.`);
    }
    let words = 0;
    const kept: string[] = [];
    for (const s of sentences) {
      const n = s.split(/\s+/).length;
      if (kept.length >= 2 && words + n > MAX_WORDS) break;
      kept.push(s);
      words += n;
    }
    let spoken = kept.join(' ');

    if (opts.polish !== false && ctx.llm) {
      try {
        const polished = await withTimeout(ctx.llm.polishBriefing({ script: spoken, name, timezone: tz }), POLISH_TIMEOUT_MS, 'polishBriefing');
        if (typeof polished === 'string' && polished.trim() && polished.length < 2000) spoken = polished.trim();
      } catch (err) {
        ctx.log.warn('[briefing] polish failed, using deterministic script', err);
      }
    }

    return { memberId: m.id, generatedAt: t0, greeting, spoken, headline, myTasks: { overdue, today, upcoming }, meetings, waitingOn, team, agents, unreadNotifications, inboxNew };
  }

  return {
    compose,
    invalidate(orgId) {
      for (const [k, e] of cache) if (e.orgId === orgId) cache.delete(k);
    },
    service: {
      async get(actor) {
        const m = db.members.get(actor.orgId, actor.memberId);
        if (!m) notFound('Member not found');
        const hit = cache.get(m!.id);
        const t0 = now();
        if (hit && t0 - hit.at < CACHE_MS && t0 >= hit.at) return hit.b;
        const b = await compose(m!);
        cache.set(m!.id, { at: t0, orgId: m!.orgId, b });
        return b;
      },
    },
  };
}

export type { TaskView };
