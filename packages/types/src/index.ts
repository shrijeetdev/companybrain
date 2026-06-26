// One definition of every domain object, shared by api / web / mobile / worker.

export type Mode = 'local' | 'selfhost' | 'cloud';

export function resolveMode(env: NodeJS.ProcessEnv = process.env): Mode {
  const m = (env.COMPANYBRAIN_MODE ?? 'local').toLowerCase();
  if (m === 'local' || m === 'selfhost' || m === 'cloud') return m;
  throw new Error(`Invalid COMPANYBRAIN_MODE: ${m} (expected local | selfhost | cloud)`);
}

export type Channel = 'email' | 'slack' | 'whatsapp' | 'telegram' | 'calendar' | 'github' | 'manual';
export type Role = 'ceo' | 'manager' | 'employee' | 'client' | 'agent';

/** off = never act · ask = queue for human approval · auto = act then log */
export type Autonomy = 'off' | 'ask' | 'auto';
export type AutonomyAction = 'createTasks' | 'sendReminders' | 'draftReplies' | 'chase' | 'joinMeetings';

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
  | 'agent.acted' | 'reminder.sent' | 'briefing.delivered';

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
export type JobName = 'chaseLoop' | 'sendBriefing' | 'autoSweep' | 'sendReminder';

export interface Job<T = Record<string, unknown>> {
  name: JobName;
  orgId: string;
  data: T;
}
