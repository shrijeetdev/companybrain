// SQLite adapter — the one database. Zero servers: one file under ~/.companybrain.
// Entities are stored as a JSON `doc` plus a few indexed columns for cheap filtering.

import Database from 'better-sqlite3';
import type { Loop, Task, Lead, DomainEvent, LoopSide } from '@companybrain/types';
import type {
  Database as DbPort,
  LoopRepo,
  TaskRepo,
  LeadRepo,
  EventRepo,
} from './port';

const DDL = `
CREATE TABLE IF NOT EXISTS loops  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, side TEXT, status TEXT, updated_at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, day TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, stage TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, type TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_loops_org  ON loops(org_id, side);
CREATE INDEX IF NOT EXISTS idx_tasks_org  ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_org  ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id, at);
`;

export class SqliteDatabase implements DbPort {
  private db: Database.Database;
  loops: LoopRepo;
  tasks: TaskRepo;
  leads: LeadRepo;
  events: EventRepo;

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
  }

  async init() {
    this.db.exec(DDL);
  }

  async close() {
    this.db.close();
  }
}
