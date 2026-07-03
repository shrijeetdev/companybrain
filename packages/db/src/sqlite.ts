// SQLite adapter — the one database. Zero servers: one file under ~/.companybrain.
// Entities are stored as a JSON `doc` plus a few indexed columns for cheap filtering.

import Database from 'better-sqlite3';
import type { Loop, Task, Lead, DomainEvent, LoopSide, AutonomySettings, Approval, ApprovalStatus } from '@companybrain/types';
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
} from './port';

const DDL = `
CREATE TABLE IF NOT EXISTS loops  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, side TEXT, status TEXT, updated_at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, day TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, stage TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, type TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings  (org_id TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, status TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS time_entries (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, task_id TEXT NOT NULL, user_id TEXT NOT NULL, started_at INTEGER, ended_at INTEGER, duration INTEGER, note TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS custom_fields (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, field_name TEXT NOT NULL, field_type TEXT NOT NULL DEFAULT 'text', field_value TEXT NOT NULL, created_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_loops_org  ON loops(org_id, side);
CREATE INDEX IF NOT EXISTS idx_tasks_org  ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_org  ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id, at);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id, status, at);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_entity ON custom_fields(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_org ON custom_fields(org_id);
`;

export class SqliteDatabase implements DbPort {
  private db: Database.Database;
  loops: LoopRepo;
  tasks: TaskRepo;
  leads: LeadRepo;
  events: EventRepo;
  settings: SettingsRepo;
  approvals: ApprovalRepo;
  timeEntries: TimeEntryRepo;
  customFields: CustomFieldRepo;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    const db = this.db;

    this.loops = {
      async list(orgId, side?: LoopSide) {
        const rows = side
          ? db.prepare('SELECT doc FROM loops WHERE org_id=? AND side=? ORDER BY updated_at DESC').all(orgId, side)
          : db.prepare('SELECT doc FROM loops WHERE org_id=? ORDER BY updated_at DESC').all(orgId);
        return (rows as { doc: string }[]).map((r) => JSON.parse(r.doc) as Loop);
      },
      async get(id) {
        const row = db.prepare('SELECT doc FROM loops WHERE id=?').get(id) as { doc: string } | undefined;
        return row ? (JSON.parse(row.doc) as Loop) : null;
      },
      async insert(loop) {
        db.prepare('INSERT INTO loops (id, org_id, side, status, updated_at, doc) VALUES (?,?,?,?,?,?)')
          .run(loop.id, loop.orgId, loop.side, loop.status, loop.updatedAt, JSON.stringify(loop));
        return loop;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`loop ${id} not found`);
        const next = { ...cur, ...patch, updatedAt: Date.now() } as Loop;
        db.prepare('UPDATE loops SET side=?, status=?, updated_at=?, doc=? WHERE id=?')
          .run(next.side, next.status, next.updatedAt, JSON.stringify(next), id);
        return next;
      },
      async remove(id) {
        db.prepare('DELETE FROM loops WHERE id=?').run(id);
      },
    };

    this.tasks = {
      async list(orgId) {
        const rows = db.prepare('SELECT doc FROM tasks WHERE org_id=?').all(orgId) as { doc: string }[];
        return rows.map((r) => JSON.parse(r.doc) as Task);
      },
      async get(id) {
        const row = db.prepare('SELECT doc FROM tasks WHERE id=?').get(id) as { doc: string } | undefined;
        return row ? (JSON.parse(row.doc) as Task) : null;
      },
      async insert(task) {
        db.prepare('INSERT INTO tasks (id, org_id, day, doc) VALUES (?,?,?,?)')
          .run(task.id, task.orgId, task.day, JSON.stringify(task));
        return task;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`task ${id} not found`);
        const next = { ...cur, ...patch } as Task;
        db.prepare('UPDATE tasks SET day=?, doc=? WHERE id=?').run(next.day, JSON.stringify(next), id);
        return next;
      },
      async remove(id) {
        db.prepare('DELETE FROM tasks WHERE id=?').run(id);
      },
    };

    this.leads = {
      async list(orgId) {
        const rows = db.prepare('SELECT doc FROM leads WHERE org_id=?').all(orgId) as { doc: string }[];
        return rows.map((r) => JSON.parse(r.doc) as Lead);
      },
      async get(id) {
        const row = db.prepare('SELECT doc FROM leads WHERE id=?').get(id) as { doc: string } | undefined;
        return row ? (JSON.parse(row.doc) as Lead) : null;
      },
      async insert(lead) {
        db.prepare('INSERT INTO leads (id, org_id, stage, doc) VALUES (?,?,?,?)')
          .run(lead.id, lead.orgId, lead.stage, JSON.stringify(lead));
        return lead;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`lead ${id} not found`);
        const next = { ...cur, ...patch } as Lead;
        db.prepare('UPDATE leads SET stage=?, doc=? WHERE id=?').run(next.stage, JSON.stringify(next), id);
        return next;
      },
      async remove(id) {
        db.prepare('DELETE FROM leads WHERE id=?').run(id);
      },
    };

    this.events = {
      async append(event) {
        db.prepare('INSERT INTO events (id, org_id, type, at, doc) VALUES (?,?,?,?,?)')
          .run(event.id, event.orgId, event.type, event.at, JSON.stringify(event));
        return event;
      },
      async list(orgId, limit = 100) {
        const rows = db.prepare('SELECT doc FROM events WHERE org_id=? ORDER BY at DESC LIMIT ?')
          .all(orgId, limit) as { doc: string }[];
        return rows.map((r) => JSON.parse(r.doc) as DomainEvent);
      },
      async get(id) {
        const row = db.prepare('SELECT doc FROM events WHERE id=?').get(id) as { doc: string } | undefined;
        return row ? (JSON.parse(row.doc) as DomainEvent) : null;
      },
    };

    this.settings = {
      async getAutonomy(orgId) {
        const row = db.prepare('SELECT doc FROM settings WHERE org_id=?').get(orgId) as { doc: string } | undefined;
        return row ? (JSON.parse(row.doc) as AutonomySettings) : null;
      },
      async setAutonomy(orgId, settings) {
        db.prepare('INSERT INTO settings (org_id, doc) VALUES (?,?) ON CONFLICT(org_id) DO UPDATE SET doc=excluded.doc')
          .run(orgId, JSON.stringify(settings));
      },
    };

    this.approvals = {
      async insert(approval) {
        db.prepare('INSERT INTO approvals (id, org_id, status, at, doc) VALUES (?,?,?,?,?)')
          .run(approval.id, approval.orgId, approval.status, approval.createdAt, JSON.stringify(approval));
        return approval;
      },
      async list(orgId, status?: ApprovalStatus) {
        const rows = status
          ? db.prepare('SELECT doc FROM approvals WHERE org_id=? AND status=? ORDER BY at DESC').all(orgId, status)
          : db.prepare('SELECT doc FROM approvals WHERE org_id=? ORDER BY at DESC').all(orgId);
        return (rows as { doc: string }[]).map((r) => JSON.parse(r.doc) as Approval);
      },
      async get(id) {
        const row = db.prepare('SELECT doc FROM approvals WHERE id=?').get(id) as { doc: string } | undefined;
        return row ? (JSON.parse(row.doc) as Approval) : null;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`approval ${id} not found`);
        const next = { ...cur, ...patch } as Approval;
        db.prepare('UPDATE approvals SET status=?, doc=? WHERE id=?').run(next.status, JSON.stringify(next), id);
        return next;
      },
    };

    this.timeEntries = {
      async insert(entry) {
        db.prepare('INSERT INTO time_entries (id, org_id, task_id, user_id, started_at, ended_at, duration, note, doc) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(entry.id, entry.orgId, entry.taskId, entry.userId, entry.startedAt, entry.endedAt ?? null, entry.duration ?? null, entry.note ?? null, JSON.stringify(entry));
        return entry;
      },
      async get(id) {
        const row = db.prepare('SELECT doc FROM time_entries WHERE id=?').get(id) as { doc: string } | undefined;
        return row ? (JSON.parse(row.doc) as TimeEntry) : null;
      },
      async listByTask(taskId) {
        const rows = db.prepare('SELECT doc FROM time_entries WHERE task_id=? ORDER BY started_at DESC').all(taskId) as { doc: string }[];
        return rows.map((r) => JSON.parse(r.doc) as TimeEntry);
      },
      async listByUser(userId, orgId) {
        const rows = db.prepare('SELECT doc FROM time_entries WHERE user_id=? AND org_id=? ORDER BY started_at DESC').all(userId, orgId) as { doc: string }[];
        return rows.map((r) => JSON.parse(r.doc) as TimeEntry);
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`time entry ${id} not found`);
        const next = { ...cur, ...patch } as TimeEntry;
        db.prepare('UPDATE time_entries SET ended_at=?, duration=?, note=?, doc=? WHERE id=?')
          .run(next.endedAt ?? null, next.duration ?? null, next.note ?? null, JSON.stringify(next), id);
        return next;
      },
      async delete(id) {
        db.prepare('DELETE FROM time_entries WHERE id=?').run(id);
      },
    };

    this.customFields = {
      async insert(field) {
        db.prepare('INSERT INTO custom_fields (id, org_id, entity_type, entity_id, field_name, field_type, field_value, created_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(field.id, field.orgId, field.entityType, field.entityId, field.fieldName, field.fieldType, field.fieldValue, field.createdAt);
        return field;
      },
      async get(id) {
        const row = db.prepare('SELECT * FROM custom_fields WHERE id=?').get(id) as any;
        return row ? rowToCustomField(row) : null;
      },
      async listByEntity(entityType, entityId) {
        const rows = db.prepare('SELECT * FROM custom_fields WHERE entity_type=? AND entity_id=? ORDER BY created_at ASC').all(entityType, entityId) as any[];
        return rows.map(rowToCustomField);
      },
      async listByOrg(orgId, entityType?) {
        const rows = entityType
          ? db.prepare('SELECT * FROM custom_fields WHERE org_id=? AND entity_type=? ORDER BY created_at ASC').all(orgId, entityType) as any[]
          : db.prepare('SELECT * FROM custom_fields WHERE org_id=? ORDER BY created_at ASC').all(orgId) as any[];
        return rows.map(rowToCustomField);
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`custom field ${id} not found`);
        const next = { ...cur, ...patch } as CustomField;
        db.prepare('UPDATE custom_fields SET field_value=?, field_name=?, field_type=? WHERE id=?')
          .run(next.fieldValue, next.fieldName, next.fieldType, id);
        return next;
      },
      async delete(id) {
        db.prepare('DELETE FROM custom_fields WHERE id=?').run(id);
      },
      async deleteByEntity(entityType, entityId) {
        db.prepare('DELETE FROM custom_fields WHERE entity_type=? AND entity_id=?').run(entityType, entityId);
      },
    };
  }

  async init() {
    this.db.exec(DDL);
  }

  async close() {
    this.db.close();
  }
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
