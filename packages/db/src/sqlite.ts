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
} from './port';

const DDL = `
CREATE TABLE IF NOT EXISTS loops  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, side TEXT, status TEXT, updated_at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, day TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, stage TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, type TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings  (org_id TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, status TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_loops_org  ON loops(org_id, side);
CREATE INDEX IF NOT EXISTS idx_tasks_org  ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_org  ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id, at);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id, status, at);
`;

export class SqliteDatabase implements DbPort {
  private db: Database.Database;
  loops: LoopRepo;
  tasks: TaskRepo;
  leads: LeadRepo;
  events: EventRepo;
  settings: SettingsRepo;
  approvals: ApprovalRepo;

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
  }

  async init() {
    this.db.exec(DDL);
  }

  async close() {
    this.db.close();
  }
}
