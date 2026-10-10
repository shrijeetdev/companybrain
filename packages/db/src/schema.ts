// Versioned migrations. Each runs once, in its own transaction, recorded in schema_migrations.
// Real columns for everything that is queried/filtered; JSON only for genuinely nested data.

import type BetterSqlite3 from 'better-sqlite3';
import { importV1 } from './v1-import.js';

export interface Migration {
  version: number;
  name: string;
  up(db: BetterSqlite3.Database): void;
}

const V1_SCHEMA = `
CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  logo TEXT,
  workday_start INTEGER NOT NULL DEFAULT 9,
  workday_end INTEGER NOT NULL DEFAULT 18,
  default_reminder_offsets TEXT NOT NULL DEFAULT '[1440,60,0]',
  escalate_after_min INTEGER,
  agent_stale_after_min INTEGER NOT NULL DEFAULT 240,
  intake_auto_ack INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('human','agent')),
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','member','guest','agent')),
  name TEXT NOT NULL,
  email TEXT,
  email_lc TEXT,
  phone TEXT,
  phone_digits TEXT,
  title TEXT,
  initials TEXT NOT NULL,
  color TEXT NOT NULL,
  avatar_url TEXT,
  timezone TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  prefs TEXT NOT NULL,
  password_hash TEXT,
  agent_provider TEXT,
  agent_description TEXT,
  agent_last_seen_at INTEGER,
  agent_supervisor_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_members_org_email ON members(org_id, email_lc) WHERE email_lc IS NOT NULL AND kind = 'human';
CREATE INDEX ix_members_org ON members(org_id, active, kind);
CREATE INDEX ix_members_email ON members(email_lc);
CREATE INDEX ix_members_phone ON members(org_id, phone_digits);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX ix_sessions_member ON sessions(org_id, member_id);
CREATE INDEX ix_sessions_expires ON sessions(expires_at);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX ix_api_keys_member ON api_keys(org_id, member_id);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active','paused','done','archived')),
  lead_id TEXT,
  due_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ix_projects_org ON projects(org_id, status);

CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, member_id)
);
CREATE INDEX ix_project_members_member ON project_members(member_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('todo','in_progress','blocked','review','done','cancelled')),
  priority TEXT NOT NULL CHECK (priority IN ('urgent','high','medium','low','none')),
  priority_rank INTEGER NOT NULL,
  creator_id TEXT NOT NULL,
  due_at INTEGER,
  due_all_day INTEGER NOT NULL DEFAULT 0,
  reminder_offsets TEXT,
  recurrence TEXT,
  recurrence_parent_id TEXT,
  recurrence_next_id TEXT,
  waiting_on TEXT,
  is_waiting INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  subtasks TEXT NOT NULL DEFAULT '[]',
  source_channel TEXT NOT NULL,
  source_ref TEXT,
  source_from TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  started_at INTEGER,
  completed_at INTEGER,
  completed_by TEXT,
  last_activity_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ix_tasks_org_status ON tasks(org_id, status);
CREATE INDEX ix_tasks_org_due ON tasks(org_id, due_at);
CREATE INDEX ix_tasks_org_project ON tasks(org_id, project_id);
CREATE INDEX ix_tasks_org_creator ON tasks(org_id, creator_id);
CREATE INDEX ix_tasks_org_completed ON tasks(org_id, completed_at);
CREATE INDEX ix_tasks_org_created ON tasks(org_id, created_at);
-- A recurring series can have at most one occurrence per due time: spawning is idempotent.
CREATE UNIQUE INDEX ux_tasks_occurrence ON tasks(org_id, recurrence_parent_id, due_at) WHERE recurrence_parent_id IS NOT NULL;

CREATE TABLE task_assignees (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  PRIMARY KEY (task_id, member_id)
);
CREATE INDEX ix_task_assignees_member ON task_assignees(org_id, member_id);

-- No FK to tasks: activity survives deletion so an undo restores the full history.
CREATE TABLE task_activity (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  data TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX ix_task_activity_task ON task_activity(org_id, task_id, at);

CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_id TEXT,
  title TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  url TEXT,
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('manual','ics')),
  external_id TEXT,
  feed_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ix_meetings_org_start ON meetings(org_id, start_at);
CREATE UNIQUE INDEX ux_meetings_feed_ext ON meetings(feed_id, external_id) WHERE feed_id IS NOT NULL;

CREATE TABLE meeting_attendees (
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, member_id)
);
CREATE INDEX ix_meeting_attendees_member ON meeting_attendees(member_id);

CREATE TABLE calendar_feeds (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url_enc TEXT NOT NULL,
  url_masked TEXT NOT NULL,
  last_sync_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX ix_calendar_feeds_org ON calendar_feeds(org_id, member_id);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  task_id TEXT,
  meeting_id TEXT,
  link TEXT,
  urgent INTEGER NOT NULL DEFAULT 0,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX ix_notifications_member ON notifications(org_id, member_id, created_at);
CREATE INDEX ix_notifications_unread ON notifications(org_id, member_id, read_at);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX ix_push_member ON push_subscriptions(org_id, member_id);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  run_at INTEGER NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('pending','running','done','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_jobs_pending_key ON jobs(key) WHERE status = 'pending';
CREATE INDEX ix_jobs_due ON jobs(status, run_at);
CREATE INDEX ix_jobs_org_key ON jobs(org_id, key);

CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  from_handle TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  text TEXT NOT NULL,
  external_id TEXT NOT NULL,
  member_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('new','converted','dismissed')),
  suggestion TEXT,
  task_id TEXT,
  received_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, external_id)
);
CREATE INDEX ix_inbox_org_status ON inbox_items(org_id, status, received_at);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL CHECK (stage IN ('new','contacted','meeting','proposal','won','lost')),
  value REAL,
  notes TEXT NOT NULL DEFAULT '',
  owner_id TEXT,
  source TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ix_leads_org_stage ON leads(org_id, stage);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  type TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  before TEXT,
  after TEXT,
  undoable INTEGER NOT NULL DEFAULT 0,
  undone_at INTEGER,
  undone_by TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX ix_audit_org_at ON audit_events(org_id, at);
CREATE INDEX ix_audit_entity ON audit_events(org_id, entity, entity_id);

CREATE TABLE kv (
  org_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, key)
);
`;

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'v2 schema',
    up(db) {
      db.exec(V1_SCHEMA);
    },
  },
  {
    version: 2,
    name: 'import v1 data (loops, tasks, leads, users)',
    up(db) {
      importV1(db);
    },
  },
  {
    version: 3,
    name: 'member prefs: theme + sound defaults',
    up(db) {
      db.exec(`
        UPDATE members SET prefs = json_set(prefs, '$.theme', 'tactical') WHERE json_type(prefs, '$.theme') IS NULL;
        UPDATE members SET prefs = json_set(prefs, '$.sound', json('true')) WHERE json_type(prefs, '$.sound') IS NULL;
      `);
    },
  },
  {
    version: 4,
    name: 'org currency (ISO 4217, default USD)',
    up(db) {
      if (!columns(db, 'orgs').includes('currency')) db.exec(`ALTER TABLE orgs ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'`);
    },
  },
];

/** v1 table names that conflict with (or are superseded by) v2. Renamed to v1_* before v2 schema. */
const V1_TABLES = ['loops', 'tasks', 'leads', 'events', 'settings', 'approvals', 'time_entries', 'custom_fields', 'connections', 'api_keys', 'users'];

function tableExists(db: BetterSqlite3.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function columns(db: BetterSqlite3.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as { name: string }[]).map((c) => c.name);
}

/** True when a v1-layout table of that name is present (not a v2 table). */
function isV1Table(db: BetterSqlite3.Database, name: string): boolean {
  if (!tableExists(db, name)) return false;
  const cols = columns(db, name);
  switch (name) {
    case 'tasks':
    case 'leads':
    case 'loops':
    case 'events':
    case 'settings':
    case 'approvals':
    case 'time_entries':
      return cols.includes('doc');
    case 'api_keys':
      return cols.includes('actor_id') && !cols.includes('member_id');
    case 'users':
      return cols.includes('password_hash');
    default:
      return true; // custom_fields, connections: not v2 names
  }
}

/** Move v1 tables out of the way (to v1_*) so the v2 schema can be created. Nothing is dropped. */
function renameV1Tables(db: BetterSqlite3.Database): void {
  for (const t of V1_TABLES) {
    if (!isV1Table(db, t)) continue;
    let target = `v1_${t}`;
    let n = 2;
    while (tableExists(db, target)) target = `v1_${t}_${n++}`;
    db.exec(`ALTER TABLE ${t} RENAME TO ${target}`);
  }
}

export function runMigrations(db: BetterSqlite3.Database): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`);
  const applied = new Set((db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version));
  const ran: number[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      if (m.version === 1) renameV1Tables(db);
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?,?,?)').run(m.version, m.name, Date.now());
    })();
    ran.push(m.version);
  }
  return ran;
}
