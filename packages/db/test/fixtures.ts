// Shared test fixture: a v1-layout SQLite file (v1 DDL from legacy/packages/db + PasswordAuth users).
import { scryptSync } from 'node:crypto';
import Database from 'better-sqlite3';

const V1_DDL = `
CREATE TABLE IF NOT EXISTS loops  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, side TEXT, status TEXT, updated_at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, day TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, stage TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, type TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings  (org_id TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT, prefix TEXT, key_hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL, actor_id TEXT, created_at INTEGER, last_used_at INTEGER, expires_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_tasks_org  ON tasks(org_id);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, email TEXT NOT NULL UNIQUE, username TEXT UNIQUE, name TEXT NOT NULL, initials TEXT, role TEXT NOT NULL,
  password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT, updated_at INTEGER NOT NULL);
`;

export function v1Hash(pw: string) {
  const salt = 'a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8';
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`;
}

export function buildV1Fixture(path: string) {
  const v1 = new Database(path);
  v1.exec(V1_DDL);
  const org = 'org_local';
  const users = [
    ['user_ceo00001', 'ceo@acme.io', 'Shrijeet Admin', 'ceo'],
    ['user_mgr00001', 'raj@acme.io', 'Raj Kumar', 'manager'],
    ['user_emp00001', 'priya@acme.io', 'Priya Shah', 'employee'],
    ['user_cli00001', 'client@other.io', 'Client Person', 'client'],
    ['user_bot00001', 'bot@acme.io', 'Claude', 'agent'],
  ];
  for (const [id, email, name, role] of users) {
    v1.prepare('INSERT INTO users (id, org_id, email, name, initials, role, password_hash, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)')
      .run(id, org, email, name, 'XX', role, v1Hash('v1-password'), 1_700_000_000_000, 1_700_000_000_000);
  }
  const task = (id: string, doc: Record<string, unknown>) => v1.prepare('INSERT INTO tasks (id, org_id, day, doc) VALUES (?,?,?,?)').run(id, org, doc.day, JSON.stringify({ id, orgId: org, ...doc }));
  task('task_v1today01', { title: 'Call Acme', day: 'today', priority: 'high', assignees: ['user_emp00001'], createdBy: 'user_ceo00001', completed: false, createdAt: 1_700_000_000_000, list: 'Sales', comments: [{ id: 'c1', text: 'Ping them', by: 'user_ceo00001', at: 1_700_000_100_000 }] });
  task('task_v1tmrw001', { title: 'Write blog', day: 'tomorrow', priority: 'med', recur: 'Weekly', assignees: ['user_bot00001'], createdBy: 'user_mgr00001', createdAt: 1_700_000_000_000, subtasks: [{ id: 's1', title: 'Outline', done: true }] });
  task('task_v1done001', { title: 'Old thing', day: 'upcoming', completed: true, completedAt: 1_700_000_500_000, assignees: ['ghost'], createdBy: 'user_ceo00001', createdAt: 1_700_000_000_000 });
  const loop = (id: string, doc: Record<string, unknown>) => v1.prepare('INSERT INTO loops (id, org_id, side, status, updated_at, doc) VALUES (?,?,?,?,?,?)').run(id, org, doc.side, doc.status, 1_700_000_000_000, JSON.stringify({ id, orgId: org, ...doc }));
  loop('loop_theirs001', { title: 'Contract from Raj', why: 'Need signature', side: 'theirs', status: 'open', channel: 'whatsapp', replyTo: '+919876543210', createdBy: 'user_ceo00001', assignedTo: ['user_ceo00001'], createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 });
  loop('loop_closed001', { title: 'Reply to Bob', why: '', side: 'yours', status: 'closed', channel: 'email', createdBy: 'user_ceo00001', assignedTo: ['user_mgr00001'], createdAt: 1_700_000_000_000, updatedAt: 1_700_000_900_000 });
  v1.prepare('INSERT INTO leads (id, org_id, stage, doc) VALUES (?,?,?,?)').run('lead_v1lead001', org, 'proposal', JSON.stringify({ id: 'lead_v1lead001', orgId: org, name: 'Dana', company: 'Globex', title: 'CTO', phone: '123', email: 'dana@globex.io', stage: 'proposal', source: 'email', what: 'Wants a demo', value: 5000, createdBy: 'user_ceo00001', assignedTo: ['user_mgr00001'], createdAt: 1_700_000_000_000 }));
  v1.prepare("INSERT INTO api_keys (id, org_id, name, prefix, key_hash, scopes, actor_id, created_at) VALUES ('k1', ?, 'old', 'cb_', 'hash', '[]', NULL, 1)").run(org);
  v1.close();
}

