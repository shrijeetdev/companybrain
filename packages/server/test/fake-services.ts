// In-memory fake of AppServices — minimal but behaviourally plausible (org scoping, roles,
// API-key scopes, sessions, live bus). Used only by the server tests.
import { randomBytes } from 'node:crypto';
import {
  AppError,
  ROLE_RANK,
  type Actor,
  type ApiKey,
  type ApiScope,
  type AppServices,
  type AuditEvent,
  type Crate,
  type LiveEvent,
  type Member,
  type MemberPrefs,
  type OrgSettings,
  type PlayerProfile,
  type ProjectSummary,
  type Rank,
  type TaskActivity,
  type TaskView,
} from '@companybrain/types';

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function fakeId(prefix: string): string {
  const bytes = randomBytes(12);
  let s = '';
  for (const b of bytes) s += ALNUM[b % ALNUM.length];
  return `${prefix}_${s}`;
}

export const ORG_ID = 'org_testorg01';
export const PASSWORD = 'correct horse battery';

const PREFS: MemberPrefs = {
  briefingVoice: 'button',
  voiceName: null,
  digestHour: 8,
  notifyPush: true,
  notifyWhatsapp: false,
  notifyEmail: false,
  quietStart: null,
  quietEnd: null,
  theme: 'tactical',
  sound: true,
};

function member(id: string, name: string, role: Member['role'], kind: Member['kind'], email: string | null, orgId = ORG_ID): Member {
  return {
    id,
    orgId,
    kind,
    role,
    name,
    email,
    phone: null,
    title: null,
    initials: name.slice(0, 2).toUpperCase(),
    color: '#336699',
    avatarUrl: null,
    timezone: 'UTC',
    active: true,
    prefs: { ...PREFS },
    agent: kind === 'agent' ? { provider: 'claude', description: 'test agent', lastSeenAt: null, supervisorId: null } : null,
    createdAt: 0,
    updatedAt: 0,
  };
}

const RANK: Rank = { id: 'recruit', name: 'Recruit', minLevel: 1, insignia: { kind: 'chevron', count: 0, color: '#999' } };

export interface FakeOptions {
  needsSetup?: boolean;
  now?: () => number;
}

export function createFakeServices(opts: FakeOptions = {}) {
  const now = opts.now ?? Date.now;
  let setupDone = !opts.needsSetup;

  const members = new Map<string, Member>();
  const passwords = new Map<string, string>();
  const owner = member('mem_owner0001', 'Olivia Owner', 'owner', 'human', 'owner@example.com');
  const manager = member('mem_manager01', 'Manny Manager', 'manager', 'human', 'manager@example.com');
  const regular = member('mem_member001', 'Mo Member', 'member', 'human', 'member@example.com');
  const agent = member('mem_agent0001', 'Claude Agent', 'agent', 'agent', null);
  const outsider = member('mem_outsider1', 'Other Org', 'owner', 'human', 'other@example.com', 'org_otherorg1');
  for (const m of [owner, manager, regular, agent, outsider]) members.set(m.id, m);
  for (const m of [owner, manager, regular, outsider]) passwords.set(m.id, PASSWORD);

  const sessions = new Map<string, { memberId: string; expiresAt: number }>();
  const keys = new Map<string, { key: ApiKey; raw: string }>(); // by key id
  const tasks = new Map<string, TaskView>();
  const activity: TaskActivity[] = [];
  const subscribers = new Set<{ orgId: string; memberId: string; fn: (e: LiveEvent) => void }>();
  const calls: { method: string; actor?: Actor; args: unknown[] }[] = [];

  const org: OrgSettings = {
    id: ORG_ID,
    name: 'Test Co',
    timezone: 'UTC',
    logo: null,
    workdayStart: 9,
    workdayEnd: 18,
    defaultReminderOffsets: [1440, 60, 0],
    escalateAfterMin: 1440,
    agentStaleAfterMin: 240,
    intakeAutoAck: true,
    createdAt: 0,
    updatedAt: 0,
  };

  const actorFor = (m: Member, via: Actor['via'], scopes?: ApiScope[]): Actor => ({
    orgId: m.orgId,
    memberId: m.id,
    role: m.role,
    kind: m.kind,
    via,
    ...(scopes ? { scopes } : {}),
  });
  const record = (method: string, actor: Actor | undefined, ...args: unknown[]) => calls.push({ method, actor, args });
  const write = (actor: Actor) => {
    if (actor.via === 'api_key' && !actor.scopes?.includes('write')) throw new AppError('forbidden', 'write scope required');
  };
  const atLeast = (actor: Actor, role: Member['role']) => {
    if (ROLE_RANK[actor.role] < ROLE_RANK[role]) throw new AppError('forbidden', `requires ${role}`);
  };
  const getMember = (actor: Actor, id: string) => {
    const m = members.get(id);
    if (!m || m.orgId !== actor.orgId) throw new AppError('not_found', 'Member not found');
    return m;
  };
  const getTask = (actor: Actor, id: string) => {
    const t = tasks.get(id);
    if (!t || t.orgId !== actor.orgId) throw new AppError('not_found', 'Task not found');
    return t;
  };
  const publish = (orgId: string, e: LiveEvent, o?: { memberIds?: string[] }) => {
    for (const s of subscribers) {
      if (s.orgId !== orgId) continue;
      if (o?.memberIds && !o.memberIds.includes(s.memberId)) continue;
      s.fn(e);
    }
  };
  const newSession = (m: Member) => {
    const token = randomBytes(24).toString('base64url');
    const expiresAt = now() + 30 * 86_400_000;
    sessions.set(token, { memberId: m.id, expiresAt });
    return { token, member: m, expiresAt };
  };
  const makeTask = (actor: Actor, title: string, extra: Partial<TaskView> = {}): TaskView => {
    const t: TaskView = {
      id: fakeId('task'),
      orgId: actor.orgId,
      projectId: null,
      title,
      notes: '',
      status: 'todo',
      priority: 'none',
      assigneeIds: [actor.memberId],
      creatorId: actor.memberId,
      dueAt: null,
      dueAllDay: false,
      reminderOffsets: null,
      recurrence: null,
      recurrenceParentId: null,
      waitingOn: null,
      tags: [],
      subtasks: [],
      source: { channel: 'api', ref: null, from: null },
      order: tasks.size,
      startedAt: null,
      completedAt: null,
      completedBy: null,
      lastActivityAt: now(),
      createdAt: now(),
      updatedAt: now(),
      isOverdue: false,
      isDueToday: false,
      isStale: false,
      commentCount: 0,
      ...extra,
    };
    tasks.set(t.id, t);
    publish(actor.orgId, { type: 'task.upserted', task: t });
    return t;
  };
  const profile = (memberId: string): PlayerProfile => ({
    memberId,
    xp: 0,
    level: 1,
    levelXp: 100,
    levelProgressXp: 0,
    rank: RANK,
    nextRank: null,
    coins: 0,
    streak: { current: 0, best: 0, lastActiveDay: null },
    stats: { missionsCompleted: 0, onTime: 0, rescued: 0, created: 0, cratesOpened: 0, achievements: 0 },
    equipped: { title: null, frame: null, emote: null },
    unopenedCrates: 1,
  });
  const crates = new Map<string, Crate>();
  const crate: Crate = { id: 'crate_abcdef01', memberId: owner.id, rarity: 'rare', source: 'test', earnedAt: 0, openedAt: null, reward: null };
  crates.set(crate.id, crate);

  const services: AppServices = {
    auth: {
      async login(identifier, password, meta) {
        record('auth.login', undefined, identifier, meta);
        const m = [...members.values()].find((x) => x.email === identifier.toLowerCase());
        if (!m || passwords.get(m.id) !== password || !m.active) throw new AppError('unauthorized', 'Invalid email or password');
        return newSession(m);
      },
      async logout(token) {
        record('auth.logout', undefined, token);
        sessions.delete(token);
      },
      async resolveSession(token) {
        const s = sessions.get(token);
        if (!s || s.expiresAt < now()) return null;
        const m = members.get(s.memberId);
        return m && m.active ? actorFor(m, 'session') : null;
      },
      async resolveApiKey(raw) {
        for (const { key, raw: r } of keys.values()) {
          if (r !== raw || key.revokedAt || (key.expiresAt && key.expiresAt < now())) continue;
          const m = members.get(key.memberId);
          if (!m || !m.active) return null;
          return actorFor(m, 'api_key', key.scopes);
        }
        return null;
      },
      async needsSetup() {
        return !setupDone;
      },
      async setup(input) {
        if (setupDone) throw new AppError('conflict', 'Already set up');
        setupDone = true;
        const m = member(fakeId('mem'), input.name, 'owner', 'human', input.email.toLowerCase());
        members.set(m.id, m);
        passwords.set(m.id, input.password);
        return newSession(m);
      },
    },
    members: {
      async list(actor, o) {
        return [...members.values()].filter((m) => m.orgId === actor.orgId && (o?.includeInactive || m.active) && (!o?.kind || m.kind === o.kind));
      },
      async get(actor, id) {
        return getMember(actor, id);
      },
      async me(actor) {
        return getMember(actor, actor.memberId);
      },
      async create(actor, input) {
        write(actor);
        atLeast(actor, input.kind === 'agent' ? 'manager' : 'admin');
        const m = member(fakeId('mem'), input.name, input.role, input.kind, input.email ?? null, actor.orgId);
        members.set(m.id, m);
        return m;
      },
      async update(actor, id, patch) {
        write(actor);
        const m = getMember(actor, id);
        if (id !== actor.memberId) atLeast(actor, 'admin');
        if (patch.role && ROLE_RANK[actor.role] < ROLE_RANK.admin) throw new AppError('forbidden', 'cannot change role');
        const { prefs, agent: agentPatch, ...rest } = patch;
        Object.assign(m, rest, { updatedAt: now() });
        if (prefs) m.prefs = { ...m.prefs, ...prefs };
        if (agentPatch && m.agent) m.agent = { ...m.agent, ...agentPatch };
        return m;
      },
      async setPassword(actor, id, password) {
        write(actor);
        atLeast(actor, 'admin');
        getMember(actor, id);
        passwords.set(id, password);
      },
      async changeOwnPassword(actor, current, next) {
        write(actor);
        if (passwords.get(actor.memberId) !== current) throw new AppError('bad_request', 'Current password is wrong');
        passwords.set(actor.memberId, next);
      },
      async remove(actor, id) {
        write(actor);
        atLeast(actor, 'admin');
        getMember(actor, id).active = false;
      },
    },
    apiKeys: {
      async list(actor, memberId) {
        return [...keys.values()].map((k) => k.key).filter((k) => k.orgId === actor.orgId && (!memberId || k.memberId === memberId));
      },
      async create(actor, input) {
        write(actor);
        record('apiKeys.create', actor, input);
        const target = getMember(actor, input.memberId);
        if (target.id !== actor.memberId && !(target.kind === 'agent' && ROLE_RANK[actor.role] >= ROLE_RANK.manager)) {
          throw new AppError('forbidden', 'cannot mint keys for that member');
        }
        const raw = `cb_live_${randomBytes(32).toString('hex')}`;
        const key: ApiKey = {
          id: fakeId('key'),
          orgId: actor.orgId,
          memberId: input.memberId,
          name: input.name,
          prefix: raw.slice(0, 12),
          scopes: input.scopes,
          createdBy: actor.memberId,
          createdAt: now(),
          lastUsedAt: null,
          expiresAt: input.expiresAt ?? null,
          revokedAt: null,
        };
        keys.set(key.id, { key, raw });
        return { key, raw };
      },
      async revoke(actor, id) {
        record('apiKeys.revoke', actor, id);
        const k = keys.get(id);
        if (!k || k.key.orgId !== actor.orgId) throw new AppError('not_found', 'Key not found');
        k.key.revokedAt = now();
      },
    },
    org: {
      async get(actor) {
        if (actor.orgId !== ORG_ID) throw new AppError('not_found', 'Org not found');
        return org;
      },
      async update(actor, patch) {
        write(actor);
        atLeast(actor, 'admin');
        Object.assign(org, patch);
        return org;
      },
    },
    tasks: {
      async list(actor, q) {
        record('tasks.list', actor, q);
        return [...tasks.values()].filter((t) => t.orgId === actor.orgId && (!q?.status || q.status.includes(t.status)));
      },
      async get(actor, id) {
        return getTask(actor, id);
      },
      async create(actor, input) {
        write(actor);
        record('tasks.create', actor, input);
        const { subtasks, source, waitingOn, ...rest } = input;
        return makeTask(actor, input.title, {
          ...(rest as Partial<TaskView>),
          subtasks: (subtasks ?? []).map((s) => ({ id: fakeId('sub'), title: s.title, done: false, doneAt: null, doneBy: null })),
          source: { channel: source?.channel ?? 'api', ref: source?.ref ?? null, from: source?.from ?? null },
          waitingOn: waitingOn ? { ...waitingOn, lastNudgedAt: null, since: now() } : null,
        });
      },
      async quickAdd(actor, text, defaults) {
        write(actor);
        record('tasks.quickAdd', actor, text, defaults);
        return makeTask(actor, text.replace(/\s[@#!]\S+/g, '').trim(), { source: { channel: 'quick_add', ref: null, from: null } });
      },
      async preview(actor, text) {
        record('tasks.preview', actor, text);
        return {
          parsed: { title: text, dueAt: null, dueAllDay: false, priority: null, assigneeHints: [], projectHint: null, tags: [], recurrence: null, reminderOffsets: null, tokens: [] },
          draft: { title: text },
          unresolved: [],
        };
      },
      async update(actor, id, patch) {
        write(actor);
        const t = getTask(actor, id);
        const { waitingOn, ...rest } = patch;
        Object.assign(t, rest, { updatedAt: now() });
        if (waitingOn !== undefined) t.waitingOn = waitingOn ? { ...waitingOn, lastNudgedAt: null, since: now() } : null;
        publish(actor.orgId, { type: 'task.upserted', task: t });
        return t;
      },
      async complete(actor, id) {
        write(actor);
        const t = getTask(actor, id);
        Object.assign(t, { status: 'done', completedAt: now(), completedBy: actor.memberId });
        publish(actor.orgId, { type: 'task.upserted', task: t });
        return t;
      },
      async reopen(actor, id) {
        write(actor);
        const t = getTask(actor, id);
        Object.assign(t, { status: 'todo', completedAt: null, completedBy: null });
        return t;
      },
      async remove(actor, id) {
        write(actor);
        getTask(actor, id);
        tasks.delete(id);
        publish(actor.orgId, { type: 'task.deleted', taskId: id });
      },
      async addSubtask(actor, id, title) {
        write(actor);
        const t = getTask(actor, id);
        t.subtasks.push({ id: fakeId('sub'), title, done: false, doneAt: null, doneBy: null });
        return t;
      },
      async updateSubtask(actor, id, subId, patch) {
        write(actor);
        const t = getTask(actor, id);
        const s = t.subtasks.find((x) => x.id === subId);
        if (!s) throw new AppError('not_found', 'Subtask not found');
        Object.assign(s, patch);
        return t;
      },
      async removeSubtask(actor, id, subId) {
        write(actor);
        const t = getTask(actor, id);
        t.subtasks = t.subtasks.filter((x) => x.id !== subId);
        return t;
      },
      async comment(actor, id, text, kind) {
        write(actor);
        const t = getTask(actor, id);
        const a: TaskActivity = { id: fakeId('act'), orgId: actor.orgId, taskId: t.id, actorId: actor.memberId, kind: kind ?? 'comment', text, data: null, at: now() };
        activity.push(a);
        t.commentCount++;
        return a;
      },
      async activity(actor, id) {
        getTask(actor, id);
        return activity.filter((a) => a.taskId === id);
      },
      async nudge(actor, id) {
        write(actor);
        const t = getTask(actor, id);
        if (!t.waitingOn) throw new AppError('conflict', 'Task is not waiting on anyone');
        return t;
      },
      async bulk(actor, ids, op) {
        write(actor);
        const ok: string[] = [];
        const failed: { id: string; error: string }[] = [];
        for (const id of ids) {
          try {
            getTask(actor, id);
            if (op.kind === 'delete') tasks.delete(id);
            ok.push(id);
          } catch (e) {
            failed.push({ id, error: (e as Error).message });
          }
        }
        return { ok, failed };
      },
    },
    projects: {
      async list() {
        return [];
      },
      async get() {
        throw new AppError('not_found', 'Project not found');
      },
      async create(actor, input) {
        write(actor);
        const p: ProjectSummary = {
          id: fakeId('proj'),
          orgId: actor.orgId,
          name: input.name,
          emoji: input.emoji ?? '📁',
          color: input.color ?? '#000000',
          description: input.description ?? '',
          status: 'active',
          leadId: input.leadId ?? null,
          memberIds: input.memberIds ?? [],
          dueAt: input.dueAt ?? null,
          createdBy: actor.memberId,
          createdAt: now(),
          updatedAt: now(),
          counts: { total: 0, open: 0, done: 0, overdue: 0, dueThisWeek: 0 },
          progress: 0,
        };
        return p;
      },
      async update() {
        throw new AppError('not_found', 'Project not found');
      },
      async remove() {
        throw new AppError('not_found', 'Project not found');
      },
    },
    meetings: {
      async list(actor, range) {
        record('meetings.list', actor, range);
        return [];
      },
      async create() {
        throw new AppError('forbidden', 'nope');
      },
      async update() {
        throw new AppError('not_found', 'Meeting not found');
      },
      async remove() {
        throw new AppError('not_found', 'Meeting not found');
      },
      async listFeeds() {
        return [];
      },
      async addFeed() {
        throw new AppError('bad_request', 'feed unreachable');
      },
      async removeFeed() {
        throw new AppError('not_found', 'Feed not found');
      },
      async syncFeed() {
        throw new AppError('not_found', 'Feed not found');
      },
    },
    notifications: {
      async list() {
        return [];
      },
      async unreadCount() {
        return 3;
      },
      async markRead(actor, ids) {
        record('notifications.markRead', actor, ids);
      },
      async subscribePush(actor, sub, ua) {
        record('notifications.subscribePush', actor, sub, ua);
      },
      async unsubscribePush(actor, endpoint) {
        record('notifications.unsubscribePush', actor, endpoint);
      },
      vapidPublicKey() {
        return 'BPublicKey';
      },
      async notify() {
        throw new Error('not used');
      },
    },
    inbox: {
      async list() {
        return [];
      },
      async convert() {
        throw new AppError('not_found', 'Inbox item not found');
      },
      async dismiss() {
        throw new AppError('not_found', 'Inbox item not found');
      },
      async ingest() {
        return { item: null, task: null, reply: null };
      },
    },
    briefing: {
      async get(actor) {
        const m = getMember(actor, actor.memberId);
        return {
          memberId: m.id,
          generatedAt: now(),
          greeting: `Good morning, ${m.name}`,
          spoken: 'You have nothing due.',
          headline: 'All clear',
          myTasks: { overdue: [], today: [], upcoming: [] },
          meetings: [],
          waitingOn: [],
          team: [],
          agents: [],
          unreadNotifications: 0,
          inboxNew: 0,
        };
      },
    },
    reports: {
      async get(actor, windowDays) {
        record('reports.get', actor, windowDays);
        return {
          windowDays,
          generatedAt: now(),
          totals: { created: 0, completed: 0, overdueNow: 0, onTimeRate: 1, avgCycleHours: 0 },
          daily: [],
          byMember: [],
          byProject: [],
          humansVsAgents: { humans: 0, agents: 0 },
        };
      },
    },
    audit: {
      async list() {
        return [] as AuditEvent[];
      },
      async undo() {
        throw new AppError('conflict', 'Already undone');
      },
    },
    leads: {
      async list() {
        return [];
      },
      async create() {
        throw new Error('database exploded: secret connection string');
      },
      async update() {
        throw new AppError('not_found', 'Lead not found');
      },
      async remove() {
        throw new AppError('not_found', 'Lead not found');
      },
    },
    search: {
      async search(actor, q) {
        record('search', actor, q);
        return { tasks: [...tasks.values()].filter((t) => t.orgId === actor.orgId && t.title.includes(q)), projects: [], members: [] };
      },
    },
    live: {
      publish,
      subscribe(orgId, memberId, fn) {
        const s = { orgId, memberId, fn };
        subscribers.add(s);
        return () => subscribers.delete(s);
      },
    },
    game: {
      async hud(actor) {
        const p = profile(actor.memberId);
        const mp = { total: 0, done: 0, pending: 0, overdue: 0, pct: 0 };
        return { profile: p, today: mp, week: mp, operations: [], squadToday: mp, challenges: [], boost: null };
      },
      async profile(actor, memberId) {
        return profile(memberId ? getMember(actor, memberId).id : actor.memberId);
      },
      async leaderboard(_actor, period) {
        return { period, humans: [], agents: [] };
      },
      async achievements() {
        return [];
      },
      async challenges() {
        return [];
      },
      async crates(actor) {
        return [...crates.values()].filter((c) => c.memberId === actor.memberId);
      },
      async openCrate(actor, id) {
        write(actor);
        const c = crates.get(id);
        if (!c || c.memberId !== actor.memberId) throw new AppError('not_found', 'Crate not found');
        if (c.openedAt) throw new AppError('conflict', 'Already opened');
        c.openedAt = now();
        c.reward = { kind: 'coins', id: 'coins', name: '50 coins', rarity: 'common', amount: 50 };
        return c;
      },
      async inventory() {
        return [];
      },
      async equip(actor, patch) {
        write(actor);
        const p = profile(actor.memberId);
        p.equipped = { ...p.equipped, ...patch };
        return p;
      },
      async feed() {
        return [];
      },
      async rewards() {
        return [];
      },
    },
  };

  return {
    services,
    members: { owner, manager, regular, agent, outsider },
    tasks,
    keys,
    sessions,
    calls,
    subscriberCount: () => subscribers.size,
    /** Create a session directly (bypasses login + its rate limit). */
    sessionFor(m: Member) {
      return newSession(m).token;
    },
    /** Mint an API key directly. */
    keyFor(m: Member, scopes: ApiScope[] = ['read', 'write']) {
      const raw = `cb_live_${randomBytes(32).toString('hex')}`;
      const key: ApiKey = {
        id: fakeId('key'),
        orgId: m.orgId,
        memberId: m.id,
        name: 'test',
        prefix: raw.slice(0, 12),
        scopes,
        createdBy: m.id,
        createdAt: now(),
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
      };
      keys.set(key.id, { key, raw });
      return raw;
    },
    actorFor,
  };
}

export type Fake = ReturnType<typeof createFakeServices>;
