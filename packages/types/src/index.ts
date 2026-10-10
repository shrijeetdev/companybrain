// companybrain v2 — THE contract. Every package (db, core, server, mcp, integrations, web)
// codes against these types. Change them deliberately: a change here is an API change.
//
// Design rules
// - Everything is org-scoped. Every service method takes a `Actor` (who is acting, in which
//   org) and MUST filter/verify by `actor.orgId`. Never trust an orgId from a request body.
// - Humans and AI agents are both `Member`s. Tasks can be assigned to either.
// - Times are epoch milliseconds (UTC). Time zones are IANA names (e.g. "Asia/Kolkata").
// - IDs are `${prefix}_${random}` strings (e.g. task_x7f3k2...).

// ─── Members (humans + AI agents) ────────────────────────────────────────────

/** Permission level. `owner` = the CEO/admin. `agent` is only valid for kind === 'agent'. */
export type Role = 'owner' | 'admin' | 'manager' | 'member' | 'guest' | 'agent';
export type MemberKind = 'human' | 'agent';
/** Which AI product an agent account represents (for icon + setup instructions). */
export type AgentProvider = 'claude' | 'chatgpt' | 'gemini' | 'cursor' | 'copilot' | 'n8n' | 'custom';

export interface MemberPrefs {
  /** Speak the daily briefing when the dashboard opens. */
  briefingVoice: 'auto' | 'button' | 'off';
  /** Preferred browser voice name (SpeechSynthesis) — optional. */
  voiceName?: string | null;
  /** Hour (0-23, member's timezone) to deliver the daily digest. null = off. */
  digestHour: number | null;
  /** Channels for reminders/notifications, in addition to in-app (always on). */
  notifyPush: boolean;
  notifyWhatsapp: boolean;
  notifyEmail: boolean;
  /** Quiet hours (member timezone, 0-23). Non-urgent notifications are held until the end. */
  quietStart: number | null;
  quietEnd: number | null;
  /** UI + voice style. 'tactical' = game mode (Missions/Operations/Squad, HUD, rewards). Default 'tactical'. */
  theme: 'tactical' | 'classic';
  /** Game sound effects in the UI. Default true. */
  sound: boolean;
}

export interface Member {
  id: string;
  orgId: string;
  kind: MemberKind;
  role: Role;
  name: string;
  /** Unique per org for humans (login). Optional for agents. */
  email: string | null;
  /** E.164 phone, e.g. "+919876543210" — used to match inbound WhatsApp to this member. */
  phone: string | null;
  title: string | null;
  initials: string;
  /** Hex color for avatar. */
  color: string;
  avatarUrl: string | null;
  timezone: string;
  active: boolean;
  prefs: MemberPrefs;
  /** Agents only. */
  agent: {
    provider: AgentProvider;
    description: string;
    /** Last time this agent called the API/MCP. */
    lastSeenAt: number | null;
    /** Member responsible for this agent (gets escalations). */
    supervisorId: string | null;
  } | null;
  createdAt: number;
  updatedAt: number;
}

/** Who is performing an action. Resolved from a session cookie or an API key. */
export interface Actor {
  orgId: string;
  memberId: string;
  role: Role;
  kind: MemberKind;
  /** How the actor authenticated. */
  via: 'session' | 'api_key' | 'system';
  /** API-key scopes (only for via === 'api_key'). */
  scopes?: ApiScope[];
}

/** The system actor used by background jobs and intake. */
export const SYSTEM_MEMBER_ID = 'system';

export const ROLE_RANK: Record<Role, number> = {
  guest: 0,
  agent: 1,
  member: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

// ─── Org ─────────────────────────────────────────────────────────────────────

export interface OrgSettings {
  id: string;
  name: string;
  timezone: string;
  /** Logo URL or emoji. */
  logo: string | null;
  /** Default working hours (org timezone) used for reminders & "end of day". */
  workdayStart: number; // e.g. 9
  workdayEnd: number;   // e.g. 18
  /** Default reminder offsets (minutes before due) applied to new tasks with a due time. */
  defaultReminderOffsets: number[]; // e.g. [1440, 60, 0]
  /** Escalate overdue tasks to creator/supervisor after this many minutes. null = never. */
  escalateAfterMin: number | null; // e.g. 1440
  /** AI agent tasks with no activity for this many minutes are flagged as stale. */
  agentStaleAfterMin: number; // e.g. 240
  /** Auto-acknowledge messages from unknown senders on WhatsApp/email. */
  intakeAutoAck: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Projects ────────────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'paused' | 'done' | 'archived';

export interface Project {
  id: string;
  orgId: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  status: ProjectStatus;
  leadId: string | null;
  memberIds: string[];
  dueAt: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/** Project with computed counts — what list endpoints return. */
export interface ProjectSummary extends Project {
  counts: { total: number; open: number; done: number; overdue: number; dueThisWeek: number };
  /** 0..1 */
  progress: number;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled';
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type Channel = 'manual' | 'quick_add' | 'voice' | 'whatsapp' | 'email' | 'mcp' | 'api' | 'calendar' | 'recurring' | 'import';

export interface Recurrence {
  freq: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
  /** every N units (default 1) */
  interval: number;
  /** weekly: days of week 0=Sun..6=Sat */
  byWeekday?: number[];
  /** stop after this time (optional) */
  until?: number | null;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  doneAt: number | null;
  doneBy: string | null;
}

/** The task is waiting on someone outside the team ("their court" / follow-up). */
export interface WaitingOn {
  name: string;
  contact: string | null; // phone or email
  channel: 'whatsapp' | 'email' | 'other';
  /** Auto-nudge them every N hours while waiting (null = never). */
  nudgeEveryHours: number | null;
  lastNudgedAt: number | null;
  since: number;
}

export interface TaskSource {
  channel: Channel;
  /** External message/thread id. */
  ref: string | null;
  /** Sender handle (phone/email) for intake-created tasks. */
  from: string | null;
}

export interface Task {
  id: string;
  orgId: string;
  projectId: string | null;
  title: string;
  /** Markdown notes. */
  notes: string;
  status: TaskStatus;
  priority: Priority;
  assigneeIds: string[];
  creatorId: string;
  /** When it is due. null = no deadline. */
  dueAt: number | null;
  /** true = due date without a specific time (due at end of workday, member tz). */
  dueAllDay: boolean;
  /** Minutes-before-due offsets for reminders (overrides org default). null = use org default. */
  reminderOffsets: number[] | null;
  recurrence: Recurrence | null;
  /** For tasks generated from a recurring template. */
  recurrenceParentId: string | null;
  waitingOn: WaitingOn | null;
  tags: string[];
  subtasks: Subtask[];
  source: TaskSource;
  /** Manual order within a column/list (float, lower first). */
  order: number;
  startedAt: number | null;
  completedAt: number | null;
  completedBy: string | null;
  /** Last time anything happened on this task (comment, status, edit). */
  lastActivityAt: number;
  createdAt: number;
  updatedAt: number;
}

/** Derived flags returned with tasks by the API (not stored). */
export interface TaskView extends Task {
  isOverdue: boolean;
  isDueToday: boolean;
  /** Assigned to at least one AI agent with no activity for > org.agentStaleAfterMin. */
  isStale: boolean;
  commentCount: number;
}

export type ActivityKind =
  | 'created' | 'comment' | 'status' | 'assigned' | 'unassigned' | 'due_changed'
  | 'priority' | 'edited' | 'subtask' | 'moved_project' | 'reminder_sent'
  | 'nudge_sent' | 'handoff' | 'attachment';

export interface TaskActivity {
  id: string;
  orgId: string;
  taskId: string;
  actorId: string;
  kind: ActivityKind;
  /** Human-readable text (comment body, or a generated summary like "moved to Done"). */
  text: string;
  data: Record<string, unknown> | null;
  at: number;
}

// ─── Meetings ────────────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  orgId: string;
  /** Member whose calendar this came from (null = org-wide). */
  ownerId: string | null;
  title: string;
  startAt: number;
  endAt: number;
  allDay: boolean;
  location: string | null;
  url: string | null;
  attendeeIds: string[];
  notes: string;
  source: 'manual' | 'ics';
  externalId: string | null;
  feedId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CalendarFeed {
  id: string;
  orgId: string;
  memberId: string;
  name: string;
  /** Never returned in full to clients; masked. */
  urlMasked: string;
  lastSyncAt: number | null;
  lastError: string | null;
  createdAt: number;
}

// ─── Notifications & reminders ───────────────────────────────────────────────

export type NotificationKind =
  | 'task_assigned' | 'task_due_soon' | 'task_due_now' | 'task_overdue' | 'task_escalated'
  | 'task_comment' | 'task_mention' | 'task_completed' | 'agent_stale' | 'meeting_soon'
  | 'intake_new' | 'digest' | 'system';

export interface Notification {
  id: string;
  orgId: string;
  memberId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  taskId: string | null;
  meetingId: string | null;
  /** In-app route to open, e.g. "/tasks/task_123". */
  link: string | null;
  urgent: boolean;
  readAt: number | null;
  createdAt: number;
}

/** A persisted scheduled job (survives restarts). */
export type JobKind =
  | 'task.reminder'      // payload: { taskId, offsetMin }
  | 'task.overdue'       // payload: { taskId }
  | 'task.escalate'      // payload: { taskId }
  | 'task.nudge'         // payload: { taskId }  (waitingOn auto-nudge)
  | 'task.recur'         // payload: { taskId }  (spawn next occurrence)
  | 'meeting.reminder'   // payload: { meetingId }
  | 'member.digest'      // payload: { memberId }
  | 'agent.staleScan'    // payload: {}
  | 'calendar.sync'      // payload: { feedId }
  | 'email.poll'         // payload: {}
  | 'notification.deliver'; // payload: { notificationId }  (external fan-out; held until quiet hours end)

export interface Job {
  id: string;
  orgId: string;
  kind: JobKind;
  /** Dedupe key: at most one pending job per key (e.g. "task.reminder:task_1:60"). */
  key: string;
  runAt: number;
  payload: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  attempts: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

// ─── Intake (WhatsApp / email → tasks) ───────────────────────────────────────

export type IntakeChannel = 'whatsapp' | 'email';

/** A normalized inbound message from any channel. */
export interface InboundMessage {
  channel: IntakeChannel;
  /** Sender handle: E.164 phone for WhatsApp, address for email. */
  from: string;
  fromName: string | null;
  subject: string | null;
  text: string;
  /** External message id (dedupe). */
  externalId: string;
  receivedAt: number;
  /**
   * ADDITION (security audit H3): did the transport verify that `from` really sent this?
   * Email: true only when the receiving mail system vouched for the From address (DMARC pass, or
   * DKIM/SPF pass aligned with the From domain — see @companybrain/integrations email/auth.ts),
   * or when EMAIL_TRUST_UNVERIFIED_SENDERS=true (unsafe). Absent/false for email = unverified:
   * intake never matches it to a member and ignores commands from it.
   * WhatsApp (Cloud API / QR): the sender number is verified by WhatsApp; intake treats WhatsApp
   * as authenticated regardless of this field.
   */
  authenticated?: boolean;
}

export interface InboxItem {
  id: string;
  orgId: string;
  channel: IntakeChannel;
  from: string;
  fromName: string | null;
  subject: string | null;
  text: string;
  externalId: string;
  /** Member matched by phone/email, if the sender is on the team. */
  memberId: string | null;
  status: 'new' | 'converted' | 'dismissed';
  /** Suggested task (parsed / AI-extracted). */
  suggestion: TaskDraft | null;
  taskId: string | null;
  receivedAt: number;
  createdAt: number;
}

// ─── Quick add (natural language) ────────────────────────────────────────────

/** Output of the NL parser (`@companybrain/nlp`). Hints are unresolved names. */
export interface ParsedQuickAdd {
  title: string;
  dueAt: number | null;
  dueAllDay: boolean;
  priority: Priority | null;
  /** "@priya" → ["priya"] */
  assigneeHints: string[];
  /** "#website" → "website" */
  projectHint: string | null;
  tags: string[];
  recurrence: Recurrence | null;
  /** "remind me 30m before" → [30] */
  reminderOffsets: number[] | null;
  /** Spans in the original text that were recognized (for UI highlighting). */
  tokens: { start: number; end: number; kind: 'date' | 'priority' | 'assignee' | 'project' | 'tag' | 'recurrence' | 'reminder' }[];
}

/** A task ready to be created (hints resolved to ids where possible). */
export interface TaskDraft {
  title: string;
  notes?: string;
  dueAt?: number | null;
  dueAllDay?: boolean;
  priority?: Priority;
  assigneeIds?: string[];
  projectId?: string | null;
  tags?: string[];
  recurrence?: Recurrence | null;
  reminderOffsets?: number[] | null;
  waitingOn?: Omit<WaitingOn, 'since' | 'lastNudgedAt'> | null;
}

// ─── API keys (for MCP / REST agents) ────────────────────────────────────────

export type ApiScope = 'read' | 'write';

export interface ApiKey {
  id: string;
  orgId: string;
  memberId: string;
  name: string;
  /** First chars of the key for display, e.g. "cb_live_a1b2". */
  prefix: string;
  scopes: ApiScope[];
  createdBy: string;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  orgId: string;
  actorId: string;
  /** e.g. "task.created", "task.updated", "task.deleted", "member.updated" */
  type: string;
  entity: 'task' | 'project' | 'member' | 'meeting' | 'inbox' | 'org' | 'api_key' | 'lead';
  entityId: string;
  summary: string;
  /** Snapshot before the change (enables undo). null for creates. */
  before: Record<string, unknown> | null;
  /** Snapshot after the change. null for deletes. */
  after: Record<string, unknown> | null;
  undoable: boolean;
  undoneAt: number | null;
  undoneBy: string | null;
  at: number;
}

// ─── Leads (simple sales pipeline, kept from v1) ─────────────────────────────

export type LeadStage = 'new' | 'contacted' | 'meeting' | 'proposal' | 'won' | 'lost';

export interface Lead {
  id: string;
  orgId: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  stage: LeadStage;
  value: number | null;
  notes: string;
  ownerId: string | null;
  source: Channel;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Briefing ────────────────────────────────────────────────────────────────

export interface Briefing {
  memberId: string;
  generatedAt: number;
  /** "Good morning, Shrijeet" */
  greeting: string;
  /** Natural-language script to speak aloud (≤ ~60 seconds). */
  spoken: string;
  /** One-line headline for the dashboard hero. */
  headline: string;
  myTasks: { overdue: TaskView[]; today: TaskView[]; upcoming: TaskView[] };
  meetings: Meeting[];
  waitingOn: TaskView[];
  /** Managers+ only: per-person summary. Empty for others. */
  team: TeamPulse[];
  /** AI agents and what they're working on (all members can see). */
  agents: { member: Member; inProgress: TaskView[]; stale: TaskView[] }[];
  unreadNotifications: number;
  inboxNew: number;
}

export interface TeamPulse {
  member: Member;
  open: number;
  overdue: number;
  dueToday: number;
  doneToday: number;
  doneThisWeek: number;
  inProgress: TaskView[];
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface Report {
  windowDays: number;
  generatedAt: number;
  totals: { created: number; completed: number; overdueNow: number; onTimeRate: number; avgCycleHours: number };
  /** One entry per day in the window. */
  daily: { date: string; created: number; completed: number }[];
  byMember: { memberId: string; completed: number; overdue: number; onTimeRate: number }[];
  byProject: { projectId: string | null; open: number; completed: number }[];
  humansVsAgents: { humans: number; agents: number };
}

// ─── Realtime (SSE) ──────────────────────────────────────────────────────────

export type LiveEvent =
  | { type: 'task.upserted'; task: TaskView }
  | { type: 'task.deleted'; taskId: string }
  | { type: 'activity'; activity: TaskActivity }
  | { type: 'project.upserted'; project: Project }
  | { type: 'notification'; notification: Notification }
  | { type: 'inbox.new'; item: InboxItem }
  | { type: 'member.upserted'; member: Member }
  | { type: 'meeting.upserted'; meeting: Meeting }
  | { type: 'game.reward'; reward: import('./game').RewardEvent }
  | { type: 'ping'; at: number };

// ─── Query / input DTOs ──────────────────────────────────────────────────────

export interface TaskQuery {
  /** "me" resolves to the actor. */
  assigneeId?: string | 'me' | 'unassigned';
  projectId?: string | 'none';
  status?: TaskStatus[];
  /** Shortcut views. */
  view?: 'today' | 'upcoming' | 'overdue' | 'waiting' | 'done' | 'all' | 'agents';
  search?: string;
  tag?: string;
  dueBefore?: number;
  dueAfter?: number;
  includeDone?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateTaskInput extends TaskDraft {
  status?: TaskStatus;
  source?: Partial<TaskSource>;
  subtasks?: { title: string }[];
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  status?: TaskStatus;
  priority?: Priority;
  assigneeIds?: string[];
  projectId?: string | null;
  dueAt?: number | null;
  dueAllDay?: boolean;
  reminderOffsets?: number[] | null;
  recurrence?: Recurrence | null;
  waitingOn?: Omit<WaitingOn, 'since' | 'lastNudgedAt'> | null;
  tags?: string[];
  order?: number;
}

export interface CreateMemberInput {
  kind: MemberKind;
  role: Role;
  name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  timezone?: string;
  /** Humans only; required for humans. */
  password?: string;
  agent?: { provider: AgentProvider; description?: string; supervisorId?: string | null };
}

export interface UpdateMemberInput {
  role?: Role;
  name?: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  timezone?: string;
  color?: string;
  avatarUrl?: string | null;
  active?: boolean;
  prefs?: Partial<MemberPrefs>;
  agent?: Partial<{ provider: AgentProvider; description: string; supervisorId: string | null }>;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export type ErrorCode = 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'internal';

/** Thrown by core services; the server maps `code` to an HTTP status. */
export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
  }
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

// ─── Service contract (implemented by @companybrain/core) ────────────────────
// The server (REST), MCP and intake all go through these services — never the DB.
// Every method enforces: org scoping (actor.orgId), role permissions, API-key scope
// ('write' needed for mutations), validation, audit logging, live-event broadcast,
// and (re)scheduling reminders where relevant.

export interface TaskService {
  list(actor: Actor, q?: TaskQuery): Promise<TaskView[]>;
  get(actor: Actor, id: string): Promise<TaskView>;
  create(actor: Actor, input: CreateTaskInput): Promise<TaskView>;
  /** Parse natural language with @companybrain/nlp, resolve hints, create. */
  quickAdd(actor: Actor, text: string, defaults?: Partial<CreateTaskInput>): Promise<TaskView>;
  /** Parse + resolve only (no create) — powers live preview. */
  preview(actor: Actor, text: string): Promise<{ parsed: ParsedQuickAdd; draft: TaskDraft; unresolved: string[] }>;
  update(actor: Actor, id: string, patch: UpdateTaskInput): Promise<TaskView>;
  complete(actor: Actor, id: string): Promise<TaskView>;
  reopen(actor: Actor, id: string): Promise<TaskView>;
  remove(actor: Actor, id: string): Promise<void>;
  addSubtask(actor: Actor, id: string, title: string): Promise<TaskView>;
  updateSubtask(actor: Actor, id: string, subtaskId: string, patch: { title?: string; done?: boolean }): Promise<TaskView>;
  removeSubtask(actor: Actor, id: string, subtaskId: string): Promise<TaskView>;
  comment(actor: Actor, id: string, text: string, kind?: 'comment' | 'handoff'): Promise<TaskActivity>;
  activity(actor: Actor, id: string): Promise<TaskActivity[]>;
  /** Send the waitingOn party a nudge now (WhatsApp/email). */
  nudge(actor: Actor, id: string): Promise<TaskView>;
  bulk(actor: Actor, ids: string[], op: { kind: 'complete' | 'delete' | 'assign' | 'move' | 'status'; value?: unknown }): Promise<{ ok: string[]; failed: { id: string; error: string }[] }>;
}

export interface ProjectService {
  list(actor: Actor, opts?: { includeArchived?: boolean }): Promise<ProjectSummary[]>;
  get(actor: Actor, id: string): Promise<ProjectSummary>;
  create(actor: Actor, input: Pick<Project, 'name'> & Partial<Pick<Project, 'emoji' | 'color' | 'description' | 'leadId' | 'memberIds' | 'dueAt'>>): Promise<ProjectSummary>;
  update(actor: Actor, id: string, patch: Partial<Pick<Project, 'name' | 'emoji' | 'color' | 'description' | 'status' | 'leadId' | 'memberIds' | 'dueAt'>>): Promise<ProjectSummary>;
  remove(actor: Actor, id: string): Promise<void>;
}

export interface MemberService {
  list(actor: Actor, opts?: { includeInactive?: boolean; kind?: MemberKind }): Promise<Member[]>;
  get(actor: Actor, id: string): Promise<Member>;
  me(actor: Actor): Promise<Member>;
  create(actor: Actor, input: CreateMemberInput): Promise<Member>;
  update(actor: Actor, id: string, patch: UpdateMemberInput): Promise<Member>;
  /** Owner/admin only. Revokes all sessions of that member. */
  setPassword(actor: Actor, id: string, password: string): Promise<void>;
  changeOwnPassword(actor: Actor, current: string, next: string): Promise<void>;
  /** Soft-delete (deactivate + revoke sessions + revoke keys). */
  remove(actor: Actor, id: string): Promise<void>;
}

export interface AuthService {
  /** Returns a session token + member. Constant-time for unknown users. */
  login(identifier: string, password: string, meta: { ip: string; userAgent: string }): Promise<{ token: string; member: Member; expiresAt: number }>;
  logout(token: string): Promise<void>;
  /** Resolve a session token → Actor (role read fresh from DB every call). null if invalid/expired/inactive. */
  resolveSession(token: string): Promise<Actor | null>;
  /** Resolve an API key → Actor (scopes + expiry + revocation enforced; updates lastSeen). */
  resolveApiKey(rawKey: string): Promise<Actor | null>;
  /** First-run: true when no human owner exists yet. */
  needsSetup(): Promise<boolean>;
  /** First-run: create the org + owner account. Fails if already set up. */
  setup(input: { orgName: string; name: string; email: string; password: string; timezone: string }): Promise<{ token: string; member: Member; expiresAt: number }>;
  /** The deployment's (single) org id, or null before first-run setup. Used to route inbound messages. */
  orgId(): Promise<string | null>;
}

export interface ApiKeyService {
  list(actor: Actor, memberId?: string): Promise<ApiKey[]>;
  /** Returns the raw key ONCE. Managers+ can mint for agents; anyone can mint for themselves. */
  create(actor: Actor, input: { memberId: string; name: string; scopes: ApiScope[]; expiresAt?: number | null }): Promise<{ key: ApiKey; raw: string }>;
  revoke(actor: Actor, id: string): Promise<void>;
}

export interface NotificationService {
  list(actor: Actor, opts?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]>;
  unreadCount(actor: Actor): Promise<number>;
  markRead(actor: Actor, ids: string[] | 'all'): Promise<void>;
  /** Web Push subscription management. */
  subscribePush(actor: Actor, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string): Promise<void>;
  unsubscribePush(actor: Actor, endpoint: string): Promise<void>;
  vapidPublicKey(): string | null;
  /** Internal: create + fan out (in-app, push, WhatsApp, email) respecting prefs/quiet hours. */
  notify(orgId: string, memberId: string, n: Omit<Notification, 'id' | 'orgId' | 'memberId' | 'readAt' | 'createdAt'>): Promise<Notification>;
  /** Send a short test message to the actor on one channel (whatsapp → phone, email → email, push → all subscriptions). */
  sendTest(actor: Actor, channel: 'whatsapp' | 'email' | 'push'): Promise<{ ok: boolean; error?: string }>;
}

export interface MeetingService {
  list(actor: Actor, range: { from: number; to: number; memberId?: string | 'me' }): Promise<Meeting[]>;
  create(actor: Actor, input: Pick<Meeting, 'title' | 'startAt' | 'endAt'> & Partial<Pick<Meeting, 'allDay' | 'location' | 'url' | 'attendeeIds' | 'notes'>>): Promise<Meeting>;
  update(actor: Actor, id: string, patch: Partial<Pick<Meeting, 'title' | 'startAt' | 'endAt' | 'allDay' | 'location' | 'url' | 'attendeeIds' | 'notes'>>): Promise<Meeting>;
  remove(actor: Actor, id: string): Promise<void>;
  listFeeds(actor: Actor): Promise<CalendarFeed[]>;
  addFeed(actor: Actor, input: { name: string; url: string }): Promise<CalendarFeed>;
  removeFeed(actor: Actor, id: string): Promise<void>;
  syncFeed(actor: Actor, id: string): Promise<CalendarFeed>;
}

export interface InboxService {
  list(actor: Actor, opts?: { status?: InboxItem['status'] }): Promise<InboxItem[]>;
  /** Create a task from an inbox item (optionally overriding the suggestion). */
  convert(actor: Actor, id: string, draft?: Partial<TaskDraft>): Promise<TaskView>;
  dismiss(actor: Actor, id: string): Promise<void>;
  /** Called by channel adapters for every inbound message. Idempotent on externalId. */
  ingest(orgId: string, msg: InboundMessage): Promise<{ item: InboxItem | null; task: TaskView | null; reply: string | null }>;
}

export interface BriefingService {
  get(actor: Actor): Promise<Briefing>;
}

export interface ReportService {
  get(actor: Actor, windowDays: number): Promise<Report>;
}

export interface AuditService {
  list(actor: Actor, opts?: { entity?: AuditEvent['entity']; entityId?: string; limit?: number }): Promise<AuditEvent[]>;
  undo(actor: Actor, eventId: string): Promise<AuditEvent>;
}

export interface OrgService {
  get(actor: Actor): Promise<OrgSettings>;
  update(actor: Actor, patch: Partial<Omit<OrgSettings, 'id' | 'createdAt' | 'updatedAt'>>): Promise<OrgSettings>;
}

export interface LeadService {
  list(actor: Actor): Promise<Lead[]>;
  create(actor: Actor, input: Pick<Lead, 'name'> & Partial<Omit<Lead, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>>): Promise<Lead>;
  update(actor: Actor, id: string, patch: Partial<Omit<Lead, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>>): Promise<Lead>;
  remove(actor: Actor, id: string): Promise<void>;
}

/** Live-event bus. The server subscribes per connected client and filters by org. */
export interface LiveBus {
  publish(orgId: string, event: LiveEvent, opts?: { memberIds?: string[] }): void;
  subscribe(orgId: string, memberId: string, fn: (e: LiveEvent) => void): () => void;
}

/** Search across tasks, projects, members (for ⌘K). */
export interface SearchService {
  search(actor: Actor, q: string, limit?: number): Promise<{ tasks: TaskView[]; projects: Project[]; members: Member[] }>;
}

/** Everything @companybrain/core exposes. */
export interface CoreServices {
  auth: AuthService;
  members: MemberService;
  apiKeys: ApiKeyService;
  org: OrgService;
  tasks: TaskService;
  projects: ProjectService;
  meetings: MeetingService;
  notifications: NotificationService;
  inbox: InboxService;
  briefing: BriefingService;
  reports: ReportService;
  audit: AuditService;
  leads: LeadService;
  search: SearchService;
  live: LiveBus;
}

// ─── Ports implemented by @companybrain/integrations, injected into core ─────

/** Sends outbound messages. Each method resolves false if the channel isn't configured. */
export interface Outbound {
  whatsapp(to: string, text: string): Promise<boolean>;
  email(to: string, subject: string, text: string, html?: string): Promise<boolean>;
  push(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: { title: string; body: string; url?: string; tag?: string }): Promise<'sent' | 'gone' | 'failed'>;
  status(): { whatsapp: boolean; email: boolean; push: boolean };
}

/** Optional LLM. Every method must have a deterministic fallback in core when absent. */
export interface Llm {
  /** Extract a task from a free-form message (email/WhatsApp). null = not a task. */
  extractTask(input: { text: string; subject?: string | null; from?: string | null; now: number; timezone: string; members: { id: string; name: string }[]; projects: { id: string; name: string }[] }): Promise<TaskDraft | null>;
  /** Rewrite a briefing script to sound natural (keep facts identical). */
  polishBriefing(input: { script: string; name: string; timezone: string }): Promise<string>;
}

/** Fetches + parses ICS feeds (SSRF-safe). */
export interface CalendarFetcher {
  fetch(url: string): Promise<{ uid: string; title: string; startAt: number; endAt: number; allDay: boolean; location: string | null; url: string | null; notes: string }[]>;
}

/** Optional server-side text-to-speech. null provider → browser speech is used. */
export interface Tts {
  synthesize(text: string, opts?: { voice?: string }): Promise<{ audio: Buffer; mime: string } | null>;
}

/** Called by channel adapters for each inbound message; returns an optional reply to send back. */
export type OnInbound = (msg: InboundMessage) => Promise<{ reply: string | null }>;

/** GET /api/integrations (server adds `mcpUrl`). */
export interface IntegrationsStatus {
  whatsapp: { mode: 'cloud' | 'qr' | null; connected: boolean; phone: string | null };
  email: { inbound: boolean; outbound: boolean; address: string | null };
  push: boolean;
  llm: { provider: string | null };
  tts: { provider: string | null };
}

// ─── Gamification ────────────────────────────────────────────────────────────
export * from './game';

/** Services exposed to the server and MCP: core services + the game layer. */
export type AppServices = CoreServices & { game: import('./game').GameService };
