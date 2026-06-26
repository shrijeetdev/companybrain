// One definition of every domain object, shared across the single app's packages.

export type Channel = 'email' | 'slack' | 'whatsapp' | 'telegram' | 'calendar' | 'github' | 'manual';
export type Role = 'ceo' | 'manager' | 'employee' | 'client' | 'agent';

/** off = never act · ask = queue for human approval · auto = act then log */
export type Autonomy = 'off' | 'ask' | 'auto';
export type AutonomyAction = 'createTasks' | 'sendReminders' | 'draftReplies' | 'chase' | 'joinMeetings';

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
  ownerId?: string;
  dueAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type TaskDay = 'today' | 'tomorrow' | 'upcoming';
export type Priority = 'low' | 'med' | 'high' | null;

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
  dueAt?: number | null;
  createdAt: number;
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
export type JobName = 'chaseLoop' | 'replyLoop' | 'sendBriefing' | 'autoSweep' | 'sendReminder';

export interface Job<T = Record<string, unknown>> {
  name: JobName;
  orgId: string;
  data: T;
}
