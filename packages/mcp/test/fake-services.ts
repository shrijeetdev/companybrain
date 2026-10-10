// In-memory fake CoreServices — just enough behaviour to exercise the MCP tools.

import { AppError } from '@companybrain/types';
import type {
  Actor, AppServices, Briefing, CreateTaskInput, Hud, Meeting, Member, Notification, ProjectSummary, Rank,
  RewardEvent, TaskActivity, TaskDraft, TaskQuery, TaskView, UpdateTaskInput, ParsedQuickAdd,
} from '@companybrain/types';

export const NOW = Date.parse('2026-10-10T08:00:00Z'); // 13:30 in Asia/Kolkata
export const TZ = 'Asia/Kolkata';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const ORG = 'org_test0001';

export const KEYS = {
  agentWrite: 'cb_live_agentwrite',
  agentRead: 'cb_live_agentread',
  revoked: 'cb_live_revoked',
};

function member(id: string, name: string, kind: Member['kind'], role: Member['role'], extra: Partial<Member> = {}): Member {
  return {
    id, orgId: ORG, kind, role, name, email: kind === 'human' ? `${name.split(' ')[0]!.toLowerCase()}@acme.test` : null,
    phone: null, title: null, initials: name.slice(0, 2).toUpperCase(), color: '#888', avatarUrl: null, timezone: TZ,
    active: true,
    prefs: { briefingVoice: 'button', digestHour: null, notifyPush: false, notifyWhatsapp: false, notifyEmail: false, quietStart: null, quietEnd: null, theme: 'tactical', sound: true },
    agent: kind === 'agent' ? { provider: 'claude', description: 'Writes things', lastSeenAt: NOW - 2 * HOUR, supervisorId: 'mem_shrijeet1' } : null,
    createdAt: NOW - 30 * DAY, updatedAt: NOW - 30 * DAY, ...extra,
  };
}

export interface FakeOptions { failOn?: Partial<Record<string, AppError | Error>> }

export function createFakeServices(opts: FakeOptions = {}) {
  const members: Member[] = [
    member('mem_shrijeet1', 'Shrijeet Kumar', 'human', 'owner'),
    member('mem_priya0001', 'Priya Sharma', 'human', 'member'),
    member('mem_prakash01', 'Prakash Rao', 'human', 'member'),
    member('mem_raj00001', 'Raj Patel', 'human', 'manager'),
    member('mem_claude001', 'Claude', 'agent', 'agent'),
    member('mem_guest0001', 'Gina Guest', 'human', 'guest'),
  ];
  const projects: ProjectSummary[] = [
    project('proj_website01', 'Website'),
    project('proj_webapp001', 'Web App'),
    project('proj_sales0001', 'Sales'),
  ];
  const tasks: TaskView[] = [];
  const activity: TaskActivity[] = [];
  const notifications: Notification[] = [];
  const calls: { method: string; args: unknown[] }[] = [];
  const rewards: RewardEvent[] = [];
  const SERGEANT: Rank = { id: 'sergeant', name: 'Sergeant', minLevel: 5, insignia: { kind: 'chevron', count: 3, color: '#c9a227' } };
  const CORPORAL: Rank = { id: 'corporal', name: 'Corporal', minLevel: 3, insignia: { kind: 'chevron', count: 2, color: '#999' } };
  /** What the real game layer does via onAudit when a task is completed. */
  function grantCompletion(actor: Actor, t: TaskView) {
    const base = { orgId: ORG, memberId: actor.memberId, coins: 0, at: NOW };
    rewards.unshift({ ...base, id: id('rwd'), kind: 'mission_complete', xp: 40, coins: 5, label: `+40 XP · Mission complete: ${t.title}`, taskId: t.id });
    if (t.dueAt != null && t.dueAt >= NOW) rewards.unshift({ ...base, id: id('rwd'), kind: 'on_time_bonus', xp: 20, label: '+20 XP · On time', taskId: t.id });
    if (t.dueAt != null && t.dueAt < NOW) rewards.unshift({ ...base, id: id('rwd'), kind: 'rescue_bonus', xp: 15, label: '+15 XP · Rescued', taskId: t.id });
    if (t.title.includes('level')) rewards.unshift({ ...base, id: id('rwd'), kind: 'level_up', xp: 0, label: 'Level 5', taskId: null, level: 5, rank: SERGEANT });
  }
  let seq = 0;
  const id = (p: string) => `${p}_${String(++seq).padStart(8, '0')}`;

  function project(pid: string, name: string): ProjectSummary {
    return {
      id: pid, orgId: ORG, name, emoji: '', color: '#333', description: '', status: 'active', leadId: 'mem_raj00001',
      memberIds: [], dueAt: null, createdBy: 'mem_shrijeet1', createdAt: NOW - DAY, updatedAt: NOW - DAY,
      counts: { total: 0, open: 0, done: 0, overdue: 0, dueThisWeek: 0 }, progress: 0.5,
    };
  }

  const localDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
  function derive(t: TaskView): TaskView {
    const open = t.status !== 'done' && t.status !== 'cancelled';
    t.isOverdue = open && t.dueAt != null && t.dueAt < NOW;
    t.isDueToday = t.dueAt != null && localDay(t.dueAt) === localDay(NOW);
    t.commentCount = activity.filter((a) => a.taskId === t.id && (a.kind === 'comment' || a.kind === 'handoff')).length;
    return t;
  }

  function track(method: string, args: unknown[]) {
    calls.push({ method, args });
    const f = opts.failOn?.[method];
    if (f) throw f;
  }
  function requireWrite(actor: Actor) {
    if (actor.via === 'api_key' && !(actor.scopes ?? []).includes('write')) throw new AppError('forbidden', 'API key lacks write scope');
    if (actor.role === 'guest') throw new AppError('forbidden', 'guests cannot change tasks');
  }
  function find(tid: string): TaskView {
    const t = tasks.find((x) => x.id === tid);
    if (!t) throw new AppError('not_found', `task ${tid} not found`);
    return t;
  }
  function memberOrThrow(mid: string) {
    if (!members.some((m) => m.id === mid)) throw new AppError('bad_request', `unknown member ${mid}`);
  }

  function addTask(actor: Actor, input: CreateTaskInput & { lastActivityAt?: number; createdAt?: number }): TaskView {
    for (const a of input.assigneeIds ?? []) memberOrThrow(a);
    const t: TaskView = {
      id: id('task'), orgId: ORG, projectId: input.projectId ?? null, title: input.title, notes: input.notes ?? '',
      status: input.status ?? 'todo', priority: input.priority ?? 'none', assigneeIds: input.assigneeIds ?? [],
      creatorId: actor.memberId, dueAt: input.dueAt ?? null, dueAllDay: input.dueAllDay ?? false,
      reminderOffsets: input.reminderOffsets ?? null, recurrence: input.recurrence ?? null, recurrenceParentId: null,
      waitingOn: null, tags: input.tags ?? [], subtasks: (input.subtasks ?? []).map((s) => ({ id: id('sub'), title: s.title, done: false, doneAt: null, doneBy: null })),
      source: { channel: input.source?.channel ?? 'api', ref: null, from: null }, order: seq, startedAt: null,
      completedAt: null, completedBy: null, lastActivityAt: input.lastActivityAt ?? NOW, createdAt: input.createdAt ?? NOW, updatedAt: NOW,
      isOverdue: false, isDueToday: false, isStale: false, commentCount: 0,
    };
    tasks.push(t);
    activity.push({ id: id('act'), orgId: ORG, taskId: t.id, actorId: actor.memberId, kind: 'created', text: 'created the task', data: null, at: t.createdAt });
    return derive(t);
  }

  // Tiny NL parser: "tomorrow [N(am|pm)]", "in N days", "@name", "#project", "!priority".
  function parse(text: string): ParsedQuickAdd {
    let title = text;
    let dueAt: number | null = null;
    let dueAllDay = false;
    const m = /\btomorrow(?:\s+(\d{1,2})\s*(am|pm))?/i.exec(text);
    if (m) {
      const base = Date.parse('2026-10-11T00:00:00+05:30');
      if (m[1]) dueAt = base + ((Number(m[1]) % 12) + (m[2]!.toLowerCase() === 'pm' ? 12 : 0)) * HOUR;
      else { dueAt = base + 18 * HOUR; dueAllDay = true; }
      title = title.replace(m[0], '');
    }
    const d = /\bin (\d+) days?\b/i.exec(text);
    if (d) { dueAt = NOW + Number(d[1]) * DAY; title = title.replace(d[0], ''); }
    const assigneeHints = [...text.matchAll(/@(\w+)/g)].map((x) => x[1]!);
    const projectHint = /#(\w+)/.exec(text)?.[1] ?? null;
    const pr = /!(urgent|high|medium|low)/.exec(text)?.[1] as ParsedQuickAdd['priority'] | undefined;
    title = title.replace(/[@#!]\w+/g, '').replace(/\s+/g, ' ').trim();
    return { title, dueAt, dueAllDay, priority: pr ?? null, assigneeHints, projectHint, tags: [], recurrence: null, reminderOffsets: null, tokens: [] };
  }
  function draftFrom(parsed: ParsedQuickAdd): { draft: TaskDraft; unresolved: string[] } {
    const unresolved: string[] = [];
    const assigneeIds: string[] = [];
    for (const h of parsed.assigneeHints) {
      const mm = members.find((x) => x.name.toLowerCase().startsWith(h.toLowerCase()));
      if (mm) assigneeIds.push(mm.id); else unresolved.push(`@${h}`);
    }
    const p = parsed.projectHint ? projects.find((x) => x.name.toLowerCase().startsWith(parsed.projectHint!.toLowerCase())) : null;
    return {
      draft: { title: parsed.title, dueAt: parsed.dueAt, dueAllDay: parsed.dueAllDay, ...(parsed.priority ? { priority: parsed.priority } : {}), ...(assigneeIds.length ? { assigneeIds } : {}), projectId: p?.id ?? null },
      unresolved,
    };
  }

  const notImpl = (name: string) => () => { throw new Error(`fake: ${name} not implemented`); };

  const services: AppServices = {
    auth: {
      orgId: async () => ORG,
      async resolveApiKey(raw: string): Promise<Actor | null> {
        track('auth.resolveApiKey', [raw]);
        if (raw === KEYS.agentWrite) return { orgId: ORG, memberId: 'mem_claude001', role: 'agent', kind: 'agent', via: 'api_key', scopes: ['read', 'write'] };
        if (raw === KEYS.agentRead) return { orgId: ORG, memberId: 'mem_claude001', role: 'agent', kind: 'agent', via: 'api_key', scopes: ['read'] };
        return null;
      },
      login: notImpl('login'), logout: notImpl('logout'), resolveSession: notImpl('resolveSession'), needsSetup: notImpl('needsSetup'), setup: notImpl('setup'),
    },
    members: {
      async list(actor, o) {
        track('members.list', [actor, o]);
        return members.filter((m) => (o?.includeInactive || m.active) && (!o?.kind || m.kind === o.kind));
      },
      async get(_a, mid) { const m = members.find((x) => x.id === mid); if (!m) throw new AppError('not_found', 'member not found'); return m; },
      async me(actor) { track('members.me', [actor]); return members.find((m) => m.id === actor.memberId)!; },
      create: notImpl('members.create'), update: notImpl('members.update'), setPassword: notImpl('setPassword'), changeOwnPassword: notImpl('changeOwnPassword'), remove: notImpl('members.remove'),
    },
    apiKeys: { list: notImpl('apiKeys.list'), create: notImpl('apiKeys.create'), revoke: notImpl('apiKeys.revoke') },
    org: {
      async get() { return { id: ORG, name: 'Acme', timezone: TZ, logo: null, workdayStart: 9, workdayEnd: 18, defaultReminderOffsets: [1440, 60, 0], escalateAfterMin: 1440, agentStaleAfterMin: 240, intakeAutoAck: true, currency: 'USD', createdAt: 0, updatedAt: 0 }; },
      update: notImpl('org.update'),
    },
    tasks: {
      async list(actor, q: TaskQuery = {}) {
        track('tasks.list', [actor, q]);
        let r = tasks.map(derive);
        const includeDone = q.includeDone || q.view === 'done' || q.status?.some((s) => s === 'done' || s === 'cancelled');
        if (!includeDone) r = r.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
        if (q.view === 'done') r = r.filter((t) => t.status === 'done');
        if (q.view === 'today') r = r.filter((t) => t.isDueToday);
        if (q.view === 'overdue') r = r.filter((t) => t.isOverdue);
        if (q.assigneeId === 'me') r = r.filter((t) => t.assigneeIds.includes(actor.memberId));
        else if (q.assigneeId === 'unassigned') r = r.filter((t) => !t.assigneeIds.length);
        else if (q.assigneeId) r = r.filter((t) => t.assigneeIds.includes(q.assigneeId!));
        if (q.projectId === 'none') r = r.filter((t) => !t.projectId);
        else if (q.projectId) r = r.filter((t) => t.projectId === q.projectId);
        if (q.status?.length) r = r.filter((t) => q.status!.includes(t.status));
        if (q.search) r = r.filter((t) => `${t.title} ${t.notes}`.toLowerCase().includes(q.search!.toLowerCase()));
        if (q.tag) r = r.filter((t) => t.tags.includes(q.tag!));
        return r.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 100));
      },
      async get(actor, tid) { track('tasks.get', [actor, tid]); return derive(find(tid)); },
      async create(actor, input) { track('tasks.create', [actor, input]); requireWrite(actor); return addTask(actor, input); },
      async quickAdd(actor, text, defaults) {
        track('tasks.quickAdd', [actor, text, defaults]);
        requireWrite(actor);
        const { draft } = draftFrom(parse(text));
        return addTask(actor, { ...defaults, ...Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== undefined && v !== null)), title: draft.title, source: { channel: 'mcp' } } as CreateTaskInput);
      },
      async preview(actor, text) { track('tasks.preview', [actor, text]); const parsed = parse(text); return { parsed, ...draftFrom(parsed) }; },
      async update(actor, tid, patch: UpdateTaskInput) {
        track('tasks.update', [actor, tid, patch]);
        requireWrite(actor);
        const t = find(tid);
        for (const a of patch.assigneeIds ?? []) memberOrThrow(a);
        const wasOpen = t.status !== 'done';
        Object.assign(t, patch, { updatedAt: NOW, lastActivityAt: NOW });
        if (wasOpen && patch.status === 'done') grantCompletion(actor, t);
        return derive(t);
      },
      async complete(actor, tid) {
        track('tasks.complete', [actor, tid]);
        requireWrite(actor);
        const t = find(tid);
        Object.assign(t, { status: 'done', completedAt: NOW, completedBy: actor.memberId, lastActivityAt: NOW });
        grantCompletion(actor, t);
        return derive(t);
      },
      async comment(actor, tid, text, kind = 'comment') {
        track('tasks.comment', [actor, tid, text, kind]);
        requireWrite(actor);
        const t = find(tid);
        const a: TaskActivity = { id: id('act'), orgId: ORG, taskId: tid, actorId: actor.memberId, kind, text, data: null, at: NOW };
        activity.push(a);
        t.lastActivityAt = NOW;
        return a;
      },
      async activity(actor, tid) { track('tasks.activity', [actor, tid]); find(tid); return activity.filter((a) => a.taskId === tid); },
      reopen: notImpl('reopen'), remove: notImpl('remove'), addSubtask: notImpl('addSubtask'), updateSubtask: notImpl('updateSubtask'),
      removeSubtask: notImpl('removeSubtask'), reorderSubtasks: notImpl('reorderSubtasks'), nudge: notImpl('nudge'), bulk: notImpl('bulk'),
    },
    projects: {
      async list(actor, o) { track('projects.list', [actor, o]); return projects.filter((p) => o?.includeArchived || p.status !== 'archived'); },
      async get(_a, pid) { const p = projects.find((x) => x.id === pid); if (!p) throw new AppError('not_found', 'project not found'); return p; },
      create: notImpl('projects.create'), update: notImpl('projects.update'), remove: notImpl('projects.remove'),
    },
    meetings: {
      async list(actor, range) {
        track('meetings.list', [actor, range]);
        return meetings.filter((m) => m.startAt < range.to && m.endAt > range.from);
      },
      create: notImpl('meetings.create'), update: notImpl('meetings.update'), remove: notImpl('meetings.remove'),
      listFeeds: notImpl('listFeeds'), addFeed: notImpl('addFeed'), removeFeed: notImpl('removeFeed'), syncFeed: notImpl('syncFeed'),
    },
    notifications: {
      sendTest: notImpl('notifications.sendTest'),
      async list(actor, o) {
        track('notifications.list', [actor, o]);
        return notifications.filter((n) => n.memberId === actor.memberId && (!o?.unreadOnly || n.readAt == null)).slice(0, o?.limit ?? 50);
      },
      async unreadCount(actor) { return notifications.filter((n) => n.memberId === actor.memberId && n.readAt == null).length; },
      async markRead(actor, ids) {
        track('notifications.markRead', [actor, ids]);
        requireWrite(actor);
        for (const n of notifications) if (n.memberId === actor.memberId && (ids === 'all' || ids.includes(n.id))) n.readAt = NOW;
      },
      subscribePush: notImpl('subscribePush'), unsubscribePush: notImpl('unsubscribePush'), vapidPublicKey: () => null, notify: notImpl('notify'),
    },
    inbox: { list: notImpl('inbox.list'), convert: notImpl('inbox.convert'), dismiss: notImpl('inbox.dismiss'), ingest: notImpl('inbox.ingest') },
    briefing: {
      async get(actor): Promise<Briefing> {
        track('briefing.get', [actor]);
        const mine = tasks.map(derive).filter((t) => t.assigneeIds.includes(actor.memberId) && t.status !== 'done');
        return {
          memberId: actor.memberId, generatedAt: NOW, greeting: 'Good afternoon, Claude',
          spoken: `Good afternoon, Claude. You have ${mine.filter((t) => t.isDueToday).length} tasks today and ${mine.filter((t) => t.isOverdue).length} overdue.`,
          headline: `${mine.length} open tasks`,
          myTasks: { overdue: mine.filter((t) => t.isOverdue), today: mine.filter((t) => t.isDueToday && !t.isOverdue), upcoming: [] },
          meetings: meetings.slice(0, 1), waitingOn: [], team: [],
          agents: [{ member: members.find((m) => m.id === 'mem_claude001')!, inProgress: mine.filter((t) => t.status === 'in_progress'), stale: [] }],
          unreadNotifications: 1, inboxNew: 0,
        };
      },
    },
    reports: { get: notImpl('reports.get') },
    audit: { list: notImpl('audit.list'), undo: notImpl('audit.undo') },
    leads: { list: notImpl('leads.list'), create: notImpl('leads.create'), update: notImpl('leads.update'), remove: notImpl('leads.remove') },
    search: {
      async search(actor, q, limit = 10) {
        track('search.search', [actor, q, limit]);
        const s = q.toLowerCase();
        return {
          tasks: tasks.map(derive).filter((t) => t.title.toLowerCase().includes(s)).slice(0, limit),
          projects: projects.filter((p) => p.name.toLowerCase().includes(s)).slice(0, limit),
          members: members.filter((m) => m.name.toLowerCase().includes(s)).slice(0, limit),
        };
      },
    },
    live: { publish() {}, subscribe() { return () => {}; } },
    game: {
      async rewards(actor, limit = 20) {
        track('game.rewards', [actor, limit]);
        return rewards.filter((x) => x.memberId === actor.memberId).slice(0, limit);
      },
      async hud(actor): Promise<Hud> {
        track('game.hud', [actor]);
        return {
          profile: {
            memberId: actor.memberId, xp: 1240, level: 4, levelXp: 400, levelProgressXp: 310, rank: CORPORAL, nextRank: SERGEANT, coins: 85,
            streak: { current: 6, best: 9, lastActiveDay: '2026-10-10' },
            stats: { missionsCompleted: 31, onTime: 27, rescued: 3, created: 12, cratesOpened: 2, achievements: 4 },
            equipped: { title: 'Night Raider', frame: null, emote: null }, unopenedCrates: 2,
          },
          today: { total: 4, done: 1, pending: 3, overdue: 1, pct: 25 },
          week: { total: 10, done: 6, pending: 4, overdue: 1, pct: 60 },
          operations: [], squadToday: { total: 12, done: 5, pending: 7, overdue: 2, pct: 42 },
          challenges: [
            { id: 'ch_1', memberId: actor.memberId, day: '2026-10-10', title: 'Clear 3 missions', description: 'Complete 3 tasks today', target: 3, progress: 1, xp: 50, completedAt: null },
            { id: 'ch_2', memberId: actor.memberId, day: '2026-10-10', title: 'Leave 2 intel notes', description: 'Comment twice', target: 2, progress: 2, xp: 30, completedAt: NOW - HOUR },
          ],
          boost: null,
        };
      },
      profile: notImpl('game.profile'), leaderboard: notImpl('game.leaderboard'), achievements: notImpl('game.achievements'),
      challenges: notImpl('game.challenges'), crates: notImpl('game.crates'), openCrate: notImpl('game.openCrate'),
      inventory: notImpl('game.inventory'), equip: notImpl('game.equip'), feed: notImpl('game.feed'),
    },
  };

  const meetings: Meeting[] = [{
    id: 'meet_00000001', orgId: ORG, ownerId: 'mem_claude001', title: 'Sync with Raj', startAt: Date.parse('2026-10-10T15:00:00+05:30'),
    endAt: Date.parse('2026-10-10T15:30:00+05:30'), allDay: false, location: 'Zoom', url: null, attendeeIds: ['mem_raj00001', 'mem_claude001'],
    notes: '', source: 'manual', externalId: null, feedId: null, createdAt: NOW, updatedAt: NOW,
  }];

  // ── Seed data (as of NOW) ──────────────────────────────────────────────────
  const shrijeet: Actor = { orgId: ORG, memberId: 'mem_shrijeet1', role: 'owner', kind: 'human', via: 'session' };
  const priya: Actor = { orgId: ORG, memberId: 'mem_priya0001', role: 'member', kind: 'human', via: 'session' };
  const claude: Actor = { orgId: ORG, memberId: 'mem_claude001', role: 'agent', kind: 'agent', via: 'api_key', scopes: ['read', 'write'] };
  const overdue = addTask(shrijeet, { title: 'Send Acme proposal', assigneeIds: ['mem_claude001'], dueAt: NOW - 20 * HOUR, priority: 'high', projectId: 'proj_sales0001', lastActivityAt: NOW - 3 * DAY, createdAt: NOW - 5 * DAY });
  const inProg = addTask(shrijeet, { title: 'Draft blog post', assigneeIds: ['mem_claude001'], status: 'in_progress', projectId: 'proj_website01', lastActivityAt: NOW - 5 * DAY, createdAt: NOW - 6 * DAY });
  const today = addTask(shrijeet, { title: 'Review pricing page', assigneeIds: ['mem_claude001'], dueAt: Date.parse('2026-10-10T17:00:00+05:30'), lastActivityAt: NOW - 2 * HOUR, createdAt: NOW - DAY });
  addTask(shrijeet, { title: 'Prepare Q4 report', assigneeIds: ['mem_claude001'], dueAt: NOW + 3 * DAY, createdAt: NOW - DAY, lastActivityAt: NOW - DAY });
  addTask(shrijeet, { title: 'Fix signup bug', assigneeIds: ['mem_claude001'], status: 'blocked', createdAt: NOW - DAY, lastActivityAt: NOW - DAY });
  addTask(shrijeet, { title: 'Someday idea', assigneeIds: ['mem_claude001'], createdAt: NOW - DAY, lastActivityAt: NOW - 10 * DAY });
  addTask(shrijeet, { title: 'Priya only task', assigneeIds: ['mem_priya0001'], dueAt: NOW + DAY });
  // Notes: Claude's own old progress note on the in-progress task, plus a fresh hand-off from Priya.
  activity.push({ id: id('act'), orgId: ORG, taskId: inProg.id, actorId: claude.memberId, kind: 'comment', text: 'Outline done; next: write intro section.', data: null, at: NOW - 5 * DAY });
  activity.push({ id: id('act'), orgId: ORG, taskId: today.id, actorId: priya.memberId, kind: 'handoff', text: 'Check the new enterprise tier copy please.', data: null, at: NOW - 2 * HOUR });
  activity.push({ id: id('act'), orgId: ORG, taskId: overdue.id, actorId: priya.memberId, kind: 'comment', text: 'Very old comment', data: null, at: NOW - 4 * DAY });
  notifications.push(
    { id: 'notif_0000001', orgId: ORG, memberId: 'mem_claude001', kind: 'task_assigned', title: 'New task: Review pricing page', body: 'Assigned by Shrijeet', taskId: today.id, meetingId: null, link: null, urgent: false, readAt: null, createdAt: NOW - HOUR },
    { id: 'notif_0000002', orgId: ORG, memberId: 'mem_claude001', kind: 'task_overdue', title: 'Overdue: Send Acme proposal', body: '', taskId: overdue.id, meetingId: null, link: null, urgent: true, readAt: NOW - HOUR, createdAt: NOW - 2 * HOUR },
  );

  return { services, calls, rewards, tasks, activity, notifications, members, ids: { overdue: overdue.id, inProgress: inProg.id, today: today.id }, actors: { shrijeet, priya, claude } };
}
