import type {
  AchievementProgress, ApiKey, ApiScope, AuditEvent, Briefing, CalendarFeed, CreateMemberInput, CreateTaskInput,
  Crate, DailyChallenge, FeedItem, Hud, InboxItem, InventoryItem, IntegrationsStatus, Lead, Leaderboard, Meeting,
  Member, Notification, OrgSettings, ParsedQuickAdd, PlayerProfile, Project, ProjectSummary, Report, RewardEvent,
  TaskActivity, TaskDraft, TaskQuery, TaskView, UpdateMemberInput, UpdateTaskInput,
} from '@companybrain/types';
import { http, request } from './client';

export interface AuthState { needsSetup: boolean; authenticated: boolean; member?: Member; org?: OrgSettings }
export interface Integrations extends IntegrationsStatus { mcpUrl: string }
export interface QrStatus { status: 'disconnected' | 'pairing' | 'connected'; qr: string | null; phone?: string | null }
export interface Preview { parsed: ParsedQuickAdd; draft: TaskDraft; unresolved: string[] }
export interface SearchResult { tasks: TaskView[]; projects: Project[]; members: Member[] }
export interface OAuthClientInfo { name: string; redirectUri?: string; redirectHost?: string }
export type ProjectInput = Partial<Pick<Project, 'name' | 'emoji' | 'color' | 'description' | 'status' | 'leadId' | 'memberIds' | 'dueAt'>>;
export type MeetingInput = Partial<Pick<Meeting, 'title' | 'startAt' | 'endAt' | 'allDay' | 'location' | 'url' | 'attendeeIds' | 'notes'>>;
export type BulkOp = { kind: 'complete' | 'delete' | 'assign' | 'move' | 'status'; value?: unknown };

function taskQuery(q: TaskQuery = {}) {
  return { ...q, status: q.status?.length ? q.status : undefined } as Record<string, string | number | boolean | string[] | undefined>;
}

export const api = {
  auth: {
    state: () => request<AuthState>('GET', '/api/auth/state', { silent401: true }),
    setup: (b: { orgName: string; name: string; email: string; password: string; timezone: string }) => http.post<{ member: Member }>('/api/auth/setup', b),
    login: (identifier: string, password: string) => request<{ member: Member }>('POST', '/api/auth/login', { body: { identifier, password }, silent401: true }),
    logout: () => http.post<{ ok: true }>('/api/auth/logout'),
  },
  me: {
    get: () => http.get<Member>('/api/me'),
    update: (patch: UpdateMemberInput) => http.patch<Member>('/api/me', patch),
    password: (current: string, next: string) => http.post<{ ok: true }>('/api/me/password', { current, next }),
  },
  briefing: {
    get: () => http.get<Briefing>('/api/briefing'),
    /** Returns audio bytes, or null when the server has no TTS provider (204). */
    audio: async (text: string): Promise<Blob | null> => {
      const res = await request<Response>('POST', '/api/briefing/audio', { body: { text }, raw: true });
      if (res.status === 204) return null;
      const blob = await res.blob();
      return blob.size ? blob : null;
    },
  },
  tasks: {
    list: (q?: TaskQuery, signal?: AbortSignal) => http.get<TaskView[]>('/api/tasks', taskQuery(q), signal),
    get: (id: string) => http.get<TaskView>(`/api/tasks/${id}`),
    create: (input: CreateTaskInput) => http.post<TaskView>('/api/tasks', input),
    quick: (text: string, defaults?: Partial<CreateTaskInput>) => http.post<TaskView>('/api/tasks/quick', { text, defaults }),
    preview: (text: string) => http.post<Preview>('/api/tasks/preview', { text }),
    bulk: (ids: string[], op: BulkOp) => http.post<{ ok: string[]; failed: { id: string; error: string }[] }>('/api/tasks/bulk', { ids, op }),
    update: (id: string, patch: UpdateTaskInput) => http.patch<TaskView>(`/api/tasks/${id}`, patch),
    remove: (id: string) => http.del(`/api/tasks/${id}`),
    complete: (id: string) => http.post<TaskView>(`/api/tasks/${id}/complete`),
    reopen: (id: string) => http.post<TaskView>(`/api/tasks/${id}/reopen`),
    nudge: (id: string) => http.post<TaskView>(`/api/tasks/${id}/nudge`),
    addSubtask: (id: string, title: string) => http.post<TaskView>(`/api/tasks/${id}/subtasks`, { title }),
    updateSubtask: (id: string, subId: string, patch: { title?: string; done?: boolean }) => http.patch<TaskView>(`/api/tasks/${id}/subtasks/${subId}`, patch),
    removeSubtask: (id: string, subId: string) => http.del<TaskView>(`/api/tasks/${id}/subtasks/${subId}`),
    activity: (id: string) => http.get<TaskActivity[]>(`/api/tasks/${id}/activity`),
    comment: (id: string, text: string, kind: 'comment' | 'handoff' = 'comment') => http.post<TaskActivity>(`/api/tasks/${id}/comments`, { text, kind }),
  },
  projects: {
    list: (includeArchived = false) => http.get<ProjectSummary[]>('/api/projects', { includeArchived: includeArchived ? 1 : undefined }),
    get: (id: string) => http.get<ProjectSummary>(`/api/projects/${id}`),
    create: (input: ProjectInput & { name: string }) => http.post<ProjectSummary>('/api/projects', input),
    update: (id: string, patch: ProjectInput) => http.patch<ProjectSummary>(`/api/projects/${id}`, patch),
    remove: (id: string) => http.del(`/api/projects/${id}`),
  },
  members: {
    list: (opts: { includeInactive?: boolean; kind?: 'human' | 'agent' } = {}) => http.get<Member[]>('/api/members', { includeInactive: opts.includeInactive ? 1 : undefined, kind: opts.kind }),
    get: (id: string) => http.get<Member>(`/api/members/${id}`),
    create: (input: CreateMemberInput) => http.post<Member>('/api/members', input),
    update: (id: string, patch: UpdateMemberInput) => http.patch<Member>(`/api/members/${id}`, patch),
    remove: (id: string) => http.del(`/api/members/${id}`),
    setPassword: (id: string, password: string) => http.post<{ ok: true }>(`/api/members/${id}/password`, { password }),
  },
  keys: {
    list: (memberId?: string) => http.get<ApiKey[]>('/api/keys', { memberId }),
    create: (b: { memberId: string; name: string; scopes: ApiScope[]; expiresAt?: number | null }) => http.post<{ key: ApiKey; raw: string }>('/api/keys', b),
    revoke: (id: string) => http.del(`/api/keys/${id}`),
  },
  org: {
    get: () => http.get<OrgSettings>('/api/org'),
    update: (patch: Partial<Omit<OrgSettings, 'id' | 'createdAt' | 'updatedAt'>>) => http.patch<OrgSettings>('/api/org', patch),
  },
  meetings: {
    list: (from: number, to: number, memberId?: string) => http.get<Meeting[]>('/api/meetings', { from, to, memberId }),
    create: (input: MeetingInput & { title: string; startAt: number; endAt: number }) => http.post<Meeting>('/api/meetings', input),
    update: (id: string, patch: MeetingInput) => http.patch<Meeting>(`/api/meetings/${id}`, patch),
    remove: (id: string) => http.del(`/api/meetings/${id}`),
  },
  feeds: {
    list: () => http.get<CalendarFeed[]>('/api/calendar-feeds'),
    add: (name: string, url: string) => http.post<CalendarFeed>('/api/calendar-feeds', { name, url }),
    remove: (id: string) => http.del(`/api/calendar-feeds/${id}`),
    sync: (id: string) => http.post<CalendarFeed>(`/api/calendar-feeds/${id}/sync`),
  },
  notifications: {
    list: (opts: { unread?: boolean; limit?: number } = {}) => http.get<Notification[]>('/api/notifications', { unread: opts.unread ? 1 : undefined, limit: opts.limit }),
    count: () => http.get<{ unread: number }>('/api/notifications/count'),
    read: (ids: string[] | 'all') => http.post<{ ok: true }>('/api/notifications/read', { ids }),
  },
  push: {
    vapid: () => http.get<{ publicKey: string | null }>('/api/push/vapid'),
    subscribe: (sub: PushSubscriptionJSON) => http.post<{ ok: true }>('/api/push/subscribe', sub),
    unsubscribe: (endpoint: string) => http.post<{ ok: true }>('/api/push/unsubscribe', { endpoint }),
  },
  inbox: {
    list: (status?: InboxItem['status']) => http.get<InboxItem[]>('/api/inbox', { status }),
    convert: (id: string, draft?: Partial<TaskDraft>) => http.post<TaskView>(`/api/inbox/${id}/convert`, draft ?? {}),
    dismiss: (id: string) => http.post<{ ok: true }>(`/api/inbox/${id}/dismiss`),
  },
  leads: {
    list: () => http.get<Lead[]>('/api/leads'),
    create: (input: Partial<Lead> & { name: string }) => http.post<Lead>('/api/leads', input),
    update: (id: string, patch: Partial<Lead>) => http.patch<Lead>(`/api/leads/${id}`, patch),
    remove: (id: string) => http.del(`/api/leads/${id}`),
  },
  reports: { get: (days: number) => http.get<Report>('/api/reports', { days }) },
  audit: {
    list: (opts: { entity?: AuditEvent['entity']; entityId?: string; limit?: number } = {}) => http.get<AuditEvent[]>('/api/audit', opts),
    undo: (id: string) => http.post<AuditEvent>(`/api/audit/${id}/undo`),
  },
  search: (q: string, signal?: AbortSignal) => http.get<SearchResult>('/api/search', { q }, signal),
  integrations: {
    get: () => http.get<Integrations>('/api/integrations'),
    qrStart: () => http.post<{ qr: string | null; status: QrStatus['status'] }>('/api/integrations/whatsapp/qr/start'),
    qrStatus: () => http.get<QrStatus>('/api/integrations/whatsapp/qr/status'),
    qrLogout: () => http.post<{ ok: true }>('/api/integrations/whatsapp/qr/logout'),
    test: (channel: 'whatsapp' | 'email' | 'push') => http.post<{ ok: boolean; error?: string }>('/api/integrations/test', { channel }),
  },
  game: {
    hud: () => http.get<Hud>('/api/game/hud'),
    profile: (memberId?: string) => http.get<PlayerProfile>('/api/game/profile', { memberId }),
    leaderboard: (period: Leaderboard['period']) => http.get<Leaderboard>('/api/game/leaderboard', { period }),
    achievements: (memberId?: string) => http.get<AchievementProgress[]>('/api/game/achievements', { memberId }),
    challenges: () => http.get<DailyChallenge[]>('/api/game/challenges'),
    crates: () => http.get<Crate[]>('/api/game/crates'),
    openCrate: (id: string) => http.post<Crate>(`/api/game/crates/${id}/open`),
    inventory: () => http.get<InventoryItem[]>('/api/game/inventory'),
    equip: (patch: { title?: string | null; frame?: string | null; emote?: string | null }) => http.post<PlayerProfile>('/api/game/equip', patch),
    feed: (limit = 20) => http.get<FeedItem[]>('/api/game/feed', { limit }),
    rewards: (limit = 20) => http.get<RewardEvent[]>('/api/game/rewards', { limit }),
  },
  oauth: {
    client: (clientId: string, redirectUri?: string | null) => http.get<OAuthClientInfo>('/api/oauth/client', { client_id: clientId, redirect_uri: redirectUri ?? undefined }),
    approve: (b: { query: Record<string, string>; scopes: ApiScope[]; actAs: string; approve: boolean }) => http.post<{ redirectTo: string }>('/api/oauth/approve', b),
  },
};
