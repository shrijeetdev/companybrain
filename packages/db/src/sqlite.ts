// SQLite adapter — the one database. Zero servers: one file under ~/.companybrain.
// Entities are stored as a JSON `doc` plus a few indexed columns for cheap filtering.

import Database from 'better-sqlite3';
import type { Loop, Task, Lead, DomainEvent, LoopSide, AutonomySettings, Approval, ApprovalStatus, AiRun } from '@companybrain/types';
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
  ConnectionRecord,
  ApiKeyRow,
  ApiKeyRepo,
  AiRunRepo,
} from './port';
import { encryptJSON, decryptJSON } from './crypto';

const DDL = `
CREATE TABLE IF NOT EXISTS loops  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, side TEXT, status TEXT, updated_at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, day TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, stage TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, type TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings  (org_id TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, status TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS time_entries (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, task_id TEXT NOT NULL, user_id TEXT NOT NULL, started_at INTEGER, ended_at INTEGER, duration INTEGER, note TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS custom_fields (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, field_name TEXT NOT NULL, field_type TEXT NOT NULL DEFAULT 'text', field_value TEXT NOT NULL, created_at INTEGER);
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'disconnected', credentials TEXT NOT NULL DEFAULT '{}', created_at INTEGER, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT, prefix TEXT, key_hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL, actor_id TEXT, created_at INTEGER, last_used_at INTEGER, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS ai_runs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, task_id TEXT NOT NULL, action TEXT, model TEXT, status TEXT, cost_usd REAL, duration_ms INTEGER, result_ref TEXT, error TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_loops_org  ON loops(org_id, side);
CREATE INDEX IF NOT EXISTS idx_tasks_org  ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_org  ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id, at);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id, status, at);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_entity ON custom_fields(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_org ON custom_fields(org_id);
CREATE INDEX IF NOT EXISTS idx_connections_org_channel ON connections(org_id, channel);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_ai_runs_task ON ai_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_org ON ai_runs(org_id, at);
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
  connections: ConnectionRepo;
  apiKeys: ApiKeyRepo;
  aiRuns: AiRunRepo;

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

    const connectionRepo: ConnectionRepo = {
      async list(orgId) {
        const rows = db.prepare('SELECT id, org_id, channel, status, credentials, created_at, updated_at FROM connections WHERE org_id=? ORDER BY channel ASC').all(orgId) as any[];
        return rows.map(rowToConnection);
      },
      async get(orgId, channel) {
        const row = db.prepare('SELECT id, org_id, channel, status, credentials, created_at, updated_at FROM connections WHERE org_id=? AND channel=?').get(orgId, channel) as any;
        return row ? rowToConnection(row) : null;
      },
      async upsert(orgId, channel, patch) {
        const existing = await connectionRepo.get(orgId, channel);
        const now = Date.now();
        if (existing) {
          const merged = { ...existing, ...patch, channel, updatedAt: now } as ConnectionRecord;
          db.prepare('UPDATE connections SET status=?, credentials=?, updated_at=? WHERE org_id=? AND channel=?')
            .run(merged.status, encryptJSON(merged.credentials), now, orgId, channel);
          return merged;
        }
        const conn: ConnectionRecord = {
          id: `conn_${channel}_${Date.now()}`,
          orgId,
          channel: channel as ConnectionRecord['channel'],
          status: patch.status ?? 'disconnected',
          credentials: patch.credentials ?? {},
          createdAt: patch.createdAt ?? now,
          updatedAt: now,
        };
        db.prepare('INSERT INTO connections (id, org_id, channel, status, credentials, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
          .run(conn.id, conn.orgId, conn.channel, conn.status, encryptJSON(conn.credentials), conn.createdAt, conn.updatedAt);
        return conn;
      },
      async delete(orgId, channel) {
        db.prepare('DELETE FROM connections WHERE org_id=? AND channel=?').run(orgId, channel);
      },
    };
    this.connections = connectionRepo;

    this.apiKeys = {
      async insert(row: ApiKeyRow) {
        db.prepare(
          'INSERT INTO api_keys (id, org_id, name, prefix, key_hash, scopes, actor_id, created_at, last_used_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ).run(row.id, row.orgId, row.name, row.prefix, row.keyHash, JSON.stringify(row.scopes), row.actorId ?? null, row.createdAt, row.lastUsedAt ?? null, row.expiresAt ?? null);
      },
      async findByHash(keyHash) {
        const row = db.prepare('SELECT * FROM api_keys WHERE key_hash=?').get(keyHash) as any;
        if (!row) return null;
        return {
          id: row.id, orgId: row.org_id, name: row.name, prefix: row.prefix,
          keyHash: row.key_hash, scopes: JSON.parse(row.scopes),
          actorId: row.actor_id ?? undefined, createdAt: row.created_at,
          lastUsedAt: row.last_used_at ?? undefined, expiresAt: row.expires_at ?? undefined,
        } as ApiKeyRow;
      },
      async touch(id, at) {
        db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(at, id);
      },
      async listByOrg(orgId) {
        const rows = db.prepare('SELECT * FROM api_keys WHERE org_id=? ORDER BY created_at DESC').all(orgId) as any[];
        return rows.map((row) => ({
          id: row.id, orgId: row.org_id, name: row.name, prefix: row.prefix,
          keyHash: row.key_hash, scopes: JSON.parse(row.scopes),
          actorId: row.actor_id ?? undefined, createdAt: row.created_at,
          lastUsedAt: row.last_used_at ?? undefined, expiresAt: row.expires_at ?? undefined,
        })) as ApiKeyRow[];
      },
      async delete(id) {
        db.prepare('DELETE FROM api_keys WHERE id=?').run(id);
      },
    };

    // Append-only history of AI task executions. Indexed columns for listing; the full
    // row (prompts + output) lives in `doc` for debugging and later mining.
    this.aiRuns = {
      async insert(run: AiRun) {
        db.prepare(
          'INSERT INTO ai_runs (id, org_id, task_id, action, model, status, cost_usd, duration_ms, result_ref, error, at, doc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        ).run(run.id, run.orgId, run.taskId, run.action, run.model, run.status, run.costUsd ?? null, run.durationMs ?? null, run.resultRef ?? null, run.error ?? null, run.at, JSON.stringify(run));
        return run;
      },
      async get(id) {
        const row = db.prepare('SELECT doc FROM ai_runs WHERE id=?').get(id) as { doc: string } | undefined;
        return row ? (JSON.parse(row.doc) as AiRun) : null;
      },
      async listByTask(taskId) {
        const rows = db.prepare('SELECT doc FROM ai_runs WHERE task_id=? ORDER BY at DESC').all(taskId) as { doc: string }[];
        return rows.map((r) => JSON.parse(r.doc) as AiRun);
      },
      async listByOrg(orgId, limit = 100) {
        const rows = db.prepare('SELECT doc FROM ai_runs WHERE org_id=? ORDER BY at DESC LIMIT ?').all(orgId, limit) as { doc: string }[];
        return rows.map((r) => JSON.parse(r.doc) as AiRun);
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`ai_run ${id} not found`);
        const next = { ...cur, ...patch };
        db.prepare('UPDATE ai_runs SET doc=?, status=?, cost_usd=?, duration_ms=?, result_ref=?, error=? WHERE id=?')
          .run(JSON.stringify(next), next.status, next.costUsd ?? null, next.durationMs ?? null, next.resultRef ?? null, next.error ?? null, id);
        return next;
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

function rowToConnection(row: any): ConnectionRecord {
  const raw = typeof row.credentials === 'string' ? row.credentials : '';
  return {
    id: row.id,
    orgId: row.org_id,
    channel: row.channel,
    status: row.status,
    credentials: (raw ? decryptJSON(raw) : {}) as Record<string, any>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
