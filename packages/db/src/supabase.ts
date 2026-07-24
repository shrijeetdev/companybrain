// Supabase/Postgres database adapter — implements the DbPort interface.
// Uses Supabase client for managed Postgres, or direct Postgres connection.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Loop, Task, Lead, DomainEvent, LoopSide, LoopStatus, AutonomySettings, Approval, ApprovalStatus, TaskDay } from '@companybrain/types';
import type {
  Database as DbPort,
  LoopRepo,
  TaskRepo,
  LeadRepo,
  EventRepo,
  SettingsRepo,
  ApprovalRepo,
  TimeEntryRepo,
  TimeEntry,
  CustomFieldRepo,
  CustomField,
  ConnectionRepo,
  ApiKeyRepo,
} from './port';

export interface SupabaseDbOptions {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export class SupabaseDatabase implements DbPort {
  private client: SupabaseClient;
  private adminClient: SupabaseClient | null = null;
  loops: LoopRepo;
  tasks: TaskRepo;
  leads: LeadRepo;
  events: EventRepo;
  settings: SettingsRepo;
  approvals: ApprovalRepo;
  timeEntries: TimeEntryRepo;
  customFields: CustomFieldRepo;
  connections: ConnectionRepo = {
    async list() { return []; },
    async get() { return null; },
    async upsert() { throw new Error('Connections not supported in Supabase mode yet'); },
    async delete() {},
  };

  apiKeys: ApiKeyRepo = {
    async insert() { throw new Error('apiKeys not implemented for Supabase'); },
    async findByHash() { throw new Error('apiKeys not implemented for Supabase'); },
    async touch() { throw new Error('apiKeys not implemented for Supabase'); },
    async listByOrg() { throw new Error('apiKeys not implemented for Supabase'); },
    async delete() { throw new Error('apiKeys not implemented for Supabase'); },
  };

  constructor(opts: SupabaseDbOptions) {
    this.client = createClient(opts.url, opts.anonKey);
    this.adminClient = opts.serviceRoleKey
      ? createClient(opts.url, opts.serviceRoleKey)
      : null;

    const db = this.adminClient ?? this.client;

    this.loops = {
      async list(orgId, side?: LoopSide) {
        let query = db.from('loops').select('*').eq('org_id', orgId);
        if (side) query = query.eq('side', side);
        const { data, error } = await query.order('updated_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToLoop);
      },

      async get(id) {
        const { data, error } = await db.from('loops').select('*').eq('id', id).single();
        if (error || !data) return null;
        return rowToLoop(data);
      },

      async insert(loop) {
        const { error } = await db.from('loops').insert(loopToRow(loop));
        if (error) throw error;
        return loop;
      },

      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`loop ${id} not found`);
        const next = { ...current, ...patch, updatedAt: Date.now() } as Loop;
        const { error } = await db.from('loops').update(loopToRow(next)).eq('id', id);
        if (error) throw error;
        return next;
      },

      async remove(id) {
        const { error } = await db.from('loops').delete().eq('id', id);
        if (error) throw error;
      },
    };

    this.tasks = {
      async list(orgId) {
        const { data, error } = await db.from('tasks').select('*').eq('org_id', orgId);
        if (error) throw error;
        return (data ?? []).map(rowToTask);
      },

      async get(id) {
        const { data, error } = await db.from('tasks').select('*').eq('id', id).single();
        if (error || !data) return null;
        return rowToTask(data);
      },

      async insert(task) {
        const { error } = await db.from('tasks').insert(taskToRow(task));
        if (error) throw error;
        return task;
      },

      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`task ${id} not found`);
        const next = { ...current, ...patch } as Task;
        const { error } = await db.from('tasks').update(taskToRow(next)).eq('id', id);
        if (error) throw error;
        return next;
      },

      async remove(id) {
        const { error } = await db.from('tasks').delete().eq('id', id);
        if (error) throw error;
      },
    };

    this.leads = {
      async list(orgId) {
        const { data, error } = await db.from('leads').select('*').eq('org_id', orgId);
        if (error) throw error;
        return (data ?? []).map(rowToLead);
      },

      async get(id) {
        const { data, error } = await db.from('leads').select('*').eq('id', id).single();
        if (error || !data) return null;
        return rowToLead(data);
      },

      async insert(lead) {
        const { error } = await db.from('leads').insert(leadToRow(lead));
        if (error) throw error;
        return lead;
      },

      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`lead ${id} not found`);
        const next = { ...current, ...patch } as Lead;
        const { error } = await db.from('leads').update(leadToRow(next)).eq('id', id);
        if (error) throw error;
        return next;
      },

      async remove(id) {
        const { error } = await db.from('leads').delete().eq('id', id);
        if (error) throw error;
      },
    };

    this.events = {
      async append(event) {
        const { error } = await db.from('events').insert(eventToRow(event));
        if (error) throw error;
        return event;
      },

      async list(orgId, limit = 100) {
        const { data, error } = await db.from('events')
          .select('*')
          .eq('org_id', orgId)
          .order('at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return (data ?? []).map(rowToEvent);
      },

      async get(id) {
        const { data, error } = await db.from('events').select('*').eq('id', id).single();
        if (error || !data) return null;
        return rowToEvent(data);
      },
    };

    this.settings = {
      async getAutonomy(orgId) {
        const { data, error } = await db.from('settings').select('*').eq('org_id', orgId).single();
        if (error || !data) return null;
        return JSON.parse(data.doc) as AutonomySettings;
      },

      async setAutonomy(orgId, settings) {
        const { error } = await db.from('settings')
          .upsert({ org_id: orgId, doc: JSON.stringify(settings) }, { onConflict: 'org_id' });
        if (error) throw error;
      },
    };

    this.approvals = {
      async insert(approval) {
        const { error } = await db.from('approvals').insert(approvalToRow(approval));
        if (error) throw error;
        return approval;
      },

      async list(orgId, status?: ApprovalStatus) {
        let query = db.from('approvals').select('*').eq('org_id', orgId);
        if (status) query = query.eq('status', status);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToApproval);
      },

      async get(id) {
        const { data, error } = await db.from('approvals').select('*').eq('id', id).single();
        if (error || !data) return null;
        return rowToApproval(data);
      },

      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`approval ${id} not found`);
        const next = { ...current, ...patch } as Approval;
        const { error } = await db.from('approvals').update(approvalToRow(next)).eq('id', id);
        if (error) throw error;
        return next;
      },
    };

    this.timeEntries = {
      async insert(entry) {
        const { error } = await db.from('time_entries').insert(timeEntryToRow(entry));
        if (error) throw error;
        return entry;
      },

      async get(id) {
        const { data, error } = await db.from('time_entries').select('*').eq('id', id).single();
        if (error || !data) return null;
        return rowToTimeEntry(data);
      },

      async listByTask(taskId) {
        const { data, error } = await db.from('time_entries').select('*').eq('task_id', taskId).order('started_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToTimeEntry);
      },

      async listByUser(userId, orgId) {
        const { data, error } = await db.from('time_entries').select('*').eq('user_id', userId).eq('org_id', orgId).order('started_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToTimeEntry);
      },

      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`time entry ${id} not found`);
        const next = { ...current, ...patch } as TimeEntry;
        const { error } = await db.from('time_entries').update(timeEntryToRow(next)).eq('id', id);
        if (error) throw error;
        return next;
      },

      async delete(id) {
        const { error } = await db.from('time_entries').delete().eq('id', id);
        if (error) throw error;
      },
    };

    this.customFields = {
      async insert(field) {
        const { error } = await db.from('custom_fields').insert(customFieldToRow(field));
        if (error) throw error;
        return field;
      },

      async get(id) {
        const { data, error } = await db.from('custom_fields').select('*').eq('id', id).single();
        if (error || !data) return null;
        return rowToCustomField(data);
      },

      async listByEntity(entityType, entityId) {
        const { data, error } = await db.from('custom_fields')
          .select('*')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(rowToCustomField);
      },

      async listByOrg(orgId, entityType?) {
        let query = db.from('custom_fields').select('*').eq('org_id', orgId);
        if (entityType) query = query.eq('entity_type', entityType);
        const { data, error } = await query.order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(rowToCustomField);
      },

      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`custom field ${id} not found`);
        const next = { ...current, ...patch } as CustomField;
        const { error } = await db.from('custom_fields').update(customFieldToRow(next)).eq('id', id);
        if (error) throw error;
        return next;
      },

      async delete(id) {
        const { error } = await db.from('custom_fields').delete().eq('id', id);
        if (error) throw error;
      },

      async deleteByEntity(entityType, entityId) {
        const { error } = await db.from('custom_fields')
          .delete()
          .eq('entity_type', entityType)
          .eq('entity_id', entityId);
        if (error) throw error;
      },
    };
  }

  async init() {
    // Supabase tables are created via migrations, not at runtime
  }

  async close() {
    // Supabase client doesn't have a close method
  }
}

// --- Row ↔ Domain mappers ---

function rowToLoop(row: any): Loop {
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    why: row.why ?? '',
    side: row.side as LoopSide,
    status: row.status as LoopStatus,
    channel: row.channel as any,
    sourceRef: row.source_ref ?? undefined,
    replyTo: row.reply_to ?? undefined,
    ownerId: row.owner_id ?? undefined,
    createdBy: row.created_by,
    assignedTo: JSON.parse(row.assigned_to ?? '[]'),
    dueAt: row.due_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loopToRow(loop: Loop) {
  return {
    id: loop.id,
    org_id: loop.orgId,
    title: loop.title,
    why: loop.why,
    side: loop.side,
    status: loop.status,
    channel: loop.channel,
    source_ref: loop.sourceRef ?? null,
    reply_to: loop.replyTo ?? null,
    owner_id: loop.ownerId ?? null,
    created_by: loop.createdBy,
    assigned_to: JSON.stringify(loop.assignedTo),
    due_at: loop.dueAt ?? null,
    created_at: loop.createdAt,
    updated_at: loop.updatedAt,
  };
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    orgId: row.org_id,
    emoji: row.emoji ?? '',
    title: row.title,
    list: row.list ?? 'Inbox',
    day: row.day as TaskDay,
    priority: row.priority as any,
    recurring: row.recurring ?? false,
    recur: row.recur as any,
    assignees: JSON.parse(row.assignees ?? '[]'),
    createdBy: row.created_by,
    subtasks: JSON.parse(row.subtasks ?? '[]'),
    comments: JSON.parse(row.comments ?? '[]'),
    dueAt: row.due_at ?? undefined,
    createdAt: row.created_at,
  };
}

function taskToRow(task: Task) {
  return {
    id: task.id,
    org_id: task.orgId,
    emoji: task.emoji,
    title: task.title,
    list: task.list,
    day: task.day,
    priority: task.priority,
    recurring: task.recurring,
    recur: task.recur,
    assignees: JSON.stringify(task.assignees),
    created_by: task.createdBy,
    subtasks: JSON.stringify(task.subtasks ?? []),
    comments: JSON.stringify(task.comments ?? []),
    due_at: task.dueAt ?? null,
    created_at: task.createdAt,
  };
}

function rowToLead(row: any): Lead {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    company: row.company ?? '',
    title: row.title ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    stage: row.stage as any,
    source: row.source as any,
    what: row.what ?? '',
    createdBy: row.created_by,
    assignedTo: JSON.parse(row.assigned_to ?? '[]'),
    createdAt: row.created_at,
  };
}

function leadToRow(lead: Lead) {
  return {
    id: lead.id,
    org_id: lead.orgId,
    name: lead.name,
    company: lead.company,
    title: lead.title,
    phone: lead.phone,
    email: lead.email,
    stage: lead.stage,
    source: lead.source,
    what: lead.what,
    created_by: lead.createdBy,
    assigned_to: JSON.stringify(lead.assignedTo),
    created_at: lead.createdAt,
  };
}

function rowToEvent(row: any): DomainEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    type: row.type as any,
    entityId: row.entity_id,
    actorId: row.actor_id,
    undo: row.undo ? JSON.parse(row.undo) : null,
    reversible: row.reversible ?? true,
    channel: row.channel ?? undefined,
    at: row.at,
  };
}

function eventToRow(event: DomainEvent) {
  return {
    id: event.id,
    org_id: event.orgId,
    type: event.type,
    entity_id: event.entityId,
    actor_id: event.actorId,
    undo: event.undo ? JSON.stringify(event.undo) : null,
    reversible: event.reversible,
    channel: event.channel ?? null,
    at: event.at,
  };
}

function rowToApproval(row: any): Approval {
  return {
    id: row.id,
    orgId: row.org_id,
    action: row.action as any,
    loopId: row.loop_id ?? undefined,
    title: row.title,
    status: row.status as ApprovalStatus,
    createdAt: row.created_at,
  };
}

function approvalToRow(approval: Approval) {
  return {
    id: approval.id,
    org_id: approval.orgId,
    action: approval.action,
    loop_id: approval.loopId ?? null,
    title: approval.title,
    status: approval.status,
    created_at: approval.createdAt,
  };
}

function rowToTimeEntry(row: any): TimeEntry {
  return {
    id: row.id,
    orgId: row.org_id,
    taskId: row.task_id,
    userId: row.user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    duration: row.duration ?? undefined,
    note: row.note ?? undefined,
  };
}

function timeEntryToRow(entry: TimeEntry) {
  return {
    id: entry.id,
    org_id: entry.orgId,
    task_id: entry.taskId,
    user_id: entry.userId,
    started_at: entry.startedAt,
    ended_at: entry.endedAt ?? null,
    duration: entry.duration ?? null,
    note: entry.note ?? null,
  };
}

function rowToCustomField(row: any): CustomField {
  return {
    id: row.id,
    orgId: row.org_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fieldName: row.field_name,
    fieldType: row.field_type,
    fieldValue: row.field_value,
    createdAt: row.created_at,
  };
}

function customFieldToRow(field: CustomField) {
  return {
    id: field.id,
    org_id: field.orgId,
    entity_type: field.entityType,
    entity_id: field.entityId,
    field_name: field.fieldName,
    field_type: field.fieldType,
    field_value: field.fieldValue,
    created_at: field.createdAt,
  };
}
