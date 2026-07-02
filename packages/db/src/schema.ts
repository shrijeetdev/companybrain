// Drizzle ORM schema for Company Brain database.
// This replaces the JSON blob pattern with proper columns for queryability.

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// --- Loops table ---
export const loops = sqliteTable('loops', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  title: text('title').notNull(),
  why: text('why').notNull().default(''),
  side: text('side').notNull().default('yours'), // 'yours' | 'theirs'
  status: text('status').notNull().default('open'), // 'open' | 'due' | 'overdue' | 'snoozed' | 'closed'
  channel: text('channel').notNull().default('manual'),
  sourceRef: text('source_ref'),
  replyTo: text('reply_to'),
  ownerId: text('owner_id'),
  createdBy: text('created_by').notNull(),
  assignedTo: text('assigned_to').notNull().default('[]'), // JSON array of user IDs
  dueAt: integer('due_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// --- Tasks table ---
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  emoji: text('emoji').notNull().default(''),
  title: text('title').notNull(),
  list: text('list').notNull().default('Inbox'),
  day: text('day').notNull().default('today'), // 'today' | 'tomorrow' | 'upcoming'
  priority: text('priority'), // 'low' | 'med' | 'high' | null
  recurring: integer('recurring', { mode: 'boolean' }).notNull().default(false),
  recur: text('recur'), // 'Daily' | 'Weekly' | 'Monthly' | null
  assignees: text('assignees').notNull().default('[]'), // JSON array of user IDs
  createdBy: text('created_by').notNull(),
  subtasks: text('subtasks').notNull().default('[]'), // JSON array of subtasks
  comments: text('comments').notNull().default('[]'), // JSON array of comments
  dueAt: integer('due_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

// --- Leads table ---
export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  company: text('company').notNull().default(''),
  title: text('title').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  stage: text('stage').notNull().default('new'), // 'new' | 'contacted' | 'meeting' | 'proposal' | 'won' | 'lost'
  source: text('source').notNull().default('manual'),
  what: text('what').notNull().default(''),
  createdBy: text('created_by').notNull(),
  assignedTo: text('assigned_to').notNull().default('[]'), // JSON array of user IDs
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

// --- Events table (audit trail) ---
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  type: text('type').notNull(),
  entityId: text('entity_id').notNull(),
  actorId: text('actor_id').notNull(),
  undo: text('undo'), // JSON payload for undo
  reversible: integer('reversible', { mode: 'boolean' }).notNull().default(true),
  channel: text('channel'),
  at: integer('at', { mode: 'timestamp_ms' }).notNull(),
});

// --- Settings table ---
export const settings = sqliteTable('settings', {
  orgId: text('org_id').primaryKey(),
  doc: text('doc').notNull().default('{}'), // JSON autonomy settings
});

// --- Approvals table ---
export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  action: text('action').notNull(),
  loopId: text('loop_id'),
  title: text('title').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'dismissed'
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

// --- Projects table (new - moved from localStorage) ---
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  template: text('template').notNull().default('blank'), // 'blank' | 'social' | 'launch' | 'content' | 'onboarding' | 'event'
  color: text('color').notNull().default('#3e7bfa'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// --- Time entries table (new - for time tracking) ---
export const timeEntries = sqliteTable('time_entries', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  taskId: text('task_id').notNull(),
  userId: text('user_id').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  duration: integer('duration'), // in seconds
  note: text('note').notNull().default(''),
});

// --- Users table (new - for Supabase Auth) ---
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('employee'), // 'ceo' | 'manager' | 'employee' | 'client' | 'agent'
  initials: text('initials').notNull().default('??'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
