// One definition of every domain object, shared across the single app's packages.

export type Channel = 'email' | 'slack' | 'whatsapp' | 'telegram' | 'calendar' | 'github' | 'manual';
export type Role = 'ceo' | 'manager' | 'employee' | 'client' | 'agent';

/** off = never act · ask = queue for human approval · auto = act then log */
export type Autonomy = 'off' | 'ask' | 'auto';
export type AutonomyAction = 'createTasks' | 'sendReminders' | 'draftReplies' | 'chase' | 'joinMeetings' | 'manageRecords' | 'executeAi';

/** Per-org autonomy config: how the AI may act for each kind of action. */
export type AutonomySettings = Record<AutonomyAction, Autonomy>;

/** A queued AI action awaiting human approval (autonomy = 'ask'). */
export type ApprovalStatus = 'pending' | 'approved' | 'dismissed';
export interface Approval {
  id: string;
  orgId: string;
  /** the autonomy action the AI wants to take */
  action: AutonomyAction;
  /** the loop this action concerns, if any */
  loopId?: string;
  /** human-readable summary of what will happen if approved */
  title: string;
  status: ApprovalStatus;
  createdAt: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  initials: string;
  orgId: string;
}

/** "Their court" vs "your court" — who owes the next move. */
export type LoopSide = 'yours' | 'theirs';
export type LoopStatus = 'open' | 'due' | 'overdue' | 'snoozed' | 'closed';

export interface Loop {
  id: string;
  orgId: string;
  title: string;
  why: string;
  side: LoopSide;
  status: LoopStatus;
  channel: Channel;
  /** source message/thread the loop was detected from */
  sourceRef?: string;
  /** external address to reply on for this channel (e.g. the sender's phone for WhatsApp) */
  replyTo?: string;
  /** who is responsible for the next move */
  ownerId?: string;
  /** who created the loop */
  createdBy: string;
  /** assignees accountable for this loop */
  assignedTo: string[];
  dueAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type TaskDay = 'today' | 'tomorrow' | 'upcoming';
export type Priority = 'low' | 'med' | 'high' | null;

/** The kind of work an AI task performs. Extensible — new actions are added to this union. */
export type AiActionType = 'generate' | 'publish_blog';

/** Lifecycle of an AI task's execution. */
export type AiStatus = 'queued' | 'running' | 'awaiting_review' | 'done' | 'failed' | 'cancelled';

/** Status of a single run record (a task can be retried → many runs). */
export type AiRunStatus = 'running' | 'done' | 'failed' | 'awaiting_review';

/** Per-task AI configuration overrides. */
export interface AiTaskConfig {
  promptOverride?: string;
  modelOverride?: string;
}

/** One execution attempt of an AI task. Append-only history. */
export interface AiRun {
  id: string;
  orgId: string;
  taskId: string;
  action: AiActionType;
  model: string;
  status: AiRunStatus;
  systemPrompt: string;
  userPrompt: string;
  output?: string;
  resultRef?: string;
  costUsd?: number | null;
  durationMs?: number;
  error?: string;
  at: number;
}

export interface Task {
  id: string;
  orgId: string;
  emoji: string;
  title: string;
  list: string;
  day: TaskDay;
  priority: Priority;
  recurring: boolean;
  recur?: 'Daily' | 'Weekly' | 'Monthly' | null;
  assignees: string[];
  createdBy: string;
  /** true when the task is done (persisted, not just an audit event) */
  completed?: boolean;
  /** when the task was marked complete */
  completedAt?: number | null;
  /** optional subtasks */
  subtasks?: { id: string; title: string; done: boolean }[];
  /** comments / activity notes */
  comments?: { id: string; text: string; by: string; at: number }[];
  dueAt?: number | null;
  createdAt: number;
  /** When set, this task is AI-executable via the given action. null/absent = normal human task. */
  aiAction?: AiActionType | null;
  /** Current execution state of the AI task. */
  aiStatus?: AiStatus;
  /** id of the latest ai_runs row. */
  aiRunId?: string;
  /** Per-task overrides (prompt, model). */
  aiConfig?: AiTaskConfig;
}

export type LeadStage = 'new' | 'contacted' | 'meeting' | 'proposal' | 'won' | 'lost';

export interface Lead {
  id: string;
  orgId: string;
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  stage: LeadStage;
  source: Channel;
  what: string;
  /** deal value in the org's currency (major units, e.g. dollars) */
  value?: number | null;
  createdBy: string;
  assignedTo: string[];
  createdAt: number;
}

/** Every state change is an immutable, reversible event — the audit backbone. */
export type EventType =
  | 'loop.captured' | 'loop.closed' | 'loop.snoozed' | 'loop.reopened'
  | 'task.created' | 'task.completed' | 'task.moved'
  | 'lead.created' | 'lead.advanced'
  | 'agent.acted' | 'reminder.sent' | 'reply.sent' | 'briefing.delivered'
  | 'autonomy.changed' | 'approval.created' | 'approval.approved' | 'approval.dismissed'
  | 'ai.task.queued' | 'ai.task.executed' | 'ai.task.failed'
  | 'event.undone';

export interface DomainEvent {
  id: string;
  orgId: string;
  type: EventType;
  entityId: string;
  actorId: string;
  /** payload needed to undo this event */
  undo?: Record<string, unknown> | null;
  reversible: boolean;
  channel?: Channel;
  at: number;
}

/** A unit of deferred work the queue runs (chase a loop, send a briefing…). */
export type JobName = 'chaseLoop' | 'replyLoop' | 'sendBriefing' | 'autoSweep' | 'sendReminder' | 'runAiTask';

export interface Job<T = Record<string, unknown>> {
  name: JobName;
  orgId: string;
  data: T;
}

// ─── Productivity-methods engine types ────────────────────────────────────────
// Pure functions over Task[] that classify / rank / schedule work. The engine in
// @companybrain/core exposes both individual functions and a METHODS registry.

/** Identifier for one of the built-in productivity frameworks. */
export type MethodId =
  | 'eisenhower'
  | 'moscow'
  | 'abcde'
  | 'gtd'
  | 'twominute'
  | 'frog'
  | 'threethree'
  | 'pareto'
  | 'timeblock'
  | 'pomodoro';

/** Human-facing metadata for a method (used by the registry / UI). */
export interface MethodMeta {
  id: MethodId;
  name: string;
  icon: string;
  description: string;
}

/** Methods return arbitrary structured results — typed loosely at the boundary. */
export interface MethodResult {
  [key: string]: any;
}
