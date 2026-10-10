import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildV1Fixture, v1Hash } from './fixtures.ts';
import type { Member, Task } from '@companybrain/types';
import {
  addLocalMonths,
  atLocalHour,
  defaultPrefs,
  localParts,
  newId,
  openDatabase,
  resolveDbPath,
  spokenTime,
  startOfLocalDay,
  zonedToUtc,
  type Db,
} from '../src/index.ts';

const NOW = Date.UTC(2026, 9, 12, 9, 0);

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'cb-db-'));
}

function seedOrg(db: Db, id = newId('org')) {
  db.orgs.insert({
    id, name: 'Acme', timezone: 'UTC', logo: null, workdayStart: 9, workdayEnd: 18, defaultReminderOffsets: [1440, 60, 0], escalateAfterMin: 1440,
    agentStaleAfterMin: 240, intakeAutoAck: false, createdAt: NOW, updatedAt: NOW,
  });
  return id;
}

function seedMember(db: Db, orgId: string, over: Partial<Member> = {}): Member {
  const id = newId('mem');
  const m: Member = {
    id, orgId, kind: 'human', role: 'member', name: 'Priya Shah', email: `${id}@x.io`, phone: null, title: null, initials: 'PS', color: '#000000', avatarUrl: null,
    timezone: 'UTC', active: true, prefs: defaultPrefs('human'), agent: null, createdAt: NOW, updatedAt: NOW, ...over,
  };
  db.members.insert(m, null);
  return m;
}

function seedTask(db: Db, orgId: string, creatorId: string, over: Partial<Task> = {}): Task {
  const t: Task = {
    id: newId('task'), orgId, projectId: null, title: 'Send proposal', notes: '', status: 'todo', priority: 'none', assigneeIds: [creatorId], creatorId,
    dueAt: null, dueAllDay: false, reminderOffsets: null, recurrence: null, recurrenceParentId: null, waitingOn: null, tags: [], subtasks: [],
    source: { channel: 'manual', ref: null, from: null }, order: 0, startedAt: null, completedAt: null, completedBy: null, lastActivityAt: NOW, createdAt: NOW, updatedAt: NOW, ...over,
  };
  db.tasks.insert(t);
  return t;
}

test('migrations run once, pragmas set, path resolution', () => {
  const dir = tmp();
  try {
    const path = join(dir, 'nested', 'cb.sqlite');
    const db = openDatabase(path, { secret: 'x' });
    assert.deepEqual(db.migrated, [1, 2, 3]);
    assert.equal(db.sqlite.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(db.sqlite.pragma('journal_mode', { simple: true }), 'wal');
    db.close();
    const again = openDatabase(path, { secret: 'x' });
    assert.deepEqual(again.migrated, []);
    again.close();
    assert.equal(resolveDbPath({ COMPANYBRAIN_DB_PATH: '/data/x.sqlite' }), '/data/x.sqlite');
    assert.equal(resolveDbPath({ HOME: '/home/u' }), '/home/u/.companybrain/companybrain.sqlite');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('secret key file is generated once with mode 0600 and decrypts across reopen', () => {
  const dir = tmp();
  try {
    const path = join(dir, 'cb.sqlite');
    const db = openDatabase(path, { env: {} });
    const keyFile = join(dir, 'secret.key');
    assert.ok(existsSync(keyFile));
    if (process.platform !== 'win32') assert.equal(statSync(keyFile).mode & 0o777, 0o600);
    const org = seedOrg(db);
    const m = seedMember(db, org);
    db.feeds.insert({ id: 'feed_abcdef12', orgId: org, memberId: m.id, name: 'Work', urlMasked: 'x', lastSyncAt: null, lastError: null, createdAt: NOW }, 'https://cal.example.com/secret-token.ics');
    const raw = db.sqlite.prepare('SELECT url_enc FROM calendar_feeds').get() as { url_enc: string };
    assert.ok(raw.url_enc.startsWith('enc:v2:'));
    assert.ok(!raw.url_enc.includes('secret-token'));
    db.close();
    const db2 = openDatabase(path, { env: {} });
    assert.equal(db2.feeds.getUrl(org, 'feed_abcdef12'), 'https://cal.example.com/secret-token.ics');
    assert.equal(db2.feeds.getUrl('org_other123', 'feed_abcdef12'), null);
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repositories are org-scoped', () => {
  const db = openDatabase(':memory:', { secret: 'x' });
  const a = seedOrg(db);
  const b = seedOrg(db);
  const ma = seedMember(db, a);
  const t = seedTask(db, a, ma.id);
  assert.ok(db.tasks.get(a, t.id));
  assert.equal(db.tasks.get(b, t.id), null);
  assert.equal(db.members.get(b, ma.id), null);
  assert.equal(db.tasks.query(b).length, 0);
  db.tasks.delete(b, t.id);
  assert.ok(db.tasks.get(a, t.id), 'delete from another org is a no-op');
  db.close();
});

test('task visibility: members see own + open/joined projects; guests only joined; agents all project work', () => {
  const db = openDatabase(':memory:', { secret: 'x' });
  const org = seedOrg(db);
  const boss = seedMember(db, org, { role: 'manager' });
  const mem = seedMember(db, org);
  const guest = seedMember(db, org, { role: 'guest' });
  const agent = seedMember(db, org, { kind: 'agent', role: 'agent', email: null, agent: { provider: 'claude', description: '', lastSeenAt: null, supervisorId: boss.id } });
  const open = { id: newId('proj'), orgId: org, name: 'Open', emoji: '📁', color: '#000000', description: '', status: 'active' as const, leadId: null, memberIds: [], dueAt: null, createdBy: boss.id, createdAt: NOW, updatedAt: NOW };
  const closed = { ...open, id: newId('proj'), name: 'Closed', memberIds: [guest.id] };
  db.projects.insert(open);
  db.projects.insert(closed);
  const private1 = seedTask(db, org, boss.id, { assigneeIds: [boss.id] });
  const inOpen = seedTask(db, org, boss.id, { projectId: open.id, assigneeIds: [] });
  const inClosed = seedTask(db, org, boss.id, { projectId: closed.id, assigneeIds: [] });
  const ids = (vis: Parameters<typeof db.tasks.query>[1]) => db.tasks.query(org, vis).map((t) => t.id).sort();
  assert.deepEqual(ids({ visibility: { mode: 'member', memberId: mem.id } }), [inOpen.id].sort());
  assert.deepEqual(ids({ visibility: { mode: 'guest', memberId: guest.id } }), [inClosed.id].sort());
  assert.deepEqual(ids({ visibility: { mode: 'agent', memberId: agent.id } }), [inOpen.id, inClosed.id].sort());
  assert.equal(ids({ visibility: { mode: 'all' } }).length, 3);
  assert.ok(!ids({ visibility: { mode: 'member', memberId: mem.id } }).includes(private1.id));
  db.close();
});

test('jobs: dedupe by key, atomic claim, retry, cancel, recover', () => {
  const db = openDatabase(':memory:', { secret: 'x' });
  const org = seedOrg(db);
  const j1 = db.jobs.schedule(org, 'task.overdue', 'task.overdue:t1', NOW + 1000, { taskId: 't1' }, NOW);
  const j2 = db.jobs.schedule(org, 'task.overdue', 'task.overdue:t1', NOW + 5000, { taskId: 't1' }, NOW);
  assert.equal(j1.id, j2.id);
  assert.equal(db.jobs.list(org, { status: 'pending' }).length, 1);
  const j3 = db.jobs.schedule(org, 'task.overdue', 'task.overdue:t1', NOW, { taskId: 't1' }, NOW, { ifAbsent: true });
  assert.equal(j3.runAt, NOW + 5000, 'ifAbsent leaves existing job alone');
  assert.equal(db.jobs.claimDue(NOW + 4000).length, 0);
  const claimed = db.jobs.claimDue(NOW + 5000);
  assert.equal(claimed.length, 1);
  assert.equal(db.jobs.claimDue(NOW + 5000).length, 0, 'claimed jobs are not re-claimed');
  assert.equal(db.jobs.fail(org, claimed[0]!.id, 'boom', NOW + 9000, NOW), 'pending');
  const again = db.jobs.claimDue(NOW + 9000);
  assert.equal(again[0]!.attempts, 2);
  db.jobs.complete(org, again[0]!.id, NOW);
  db.jobs.schedule(org, 'task.reminder', 'task.reminder:t2:60', NOW, {}, NOW);
  db.jobs.schedule(org, 'task.reminder', 'task.reminder:t2:0', NOW, {}, NOW);
  assert.equal(db.jobs.cancel(org, [], ['task.reminder:t2:']), 2);
  db.jobs.schedule(org, 'agent.staleScan', 'agent.staleScan:x', NOW, {}, NOW);
  db.jobs.claimDue(NOW);
  assert.equal(db.jobs.recoverRunning(NOW), 1);
  assert.equal(db.jobs.list(org, { status: 'pending' }).length, 1);
  db.close();
});

test('recurrence occurrence uniqueness is enforced by the schema', () => {
  const db = openDatabase(':memory:', { secret: 'x' });
  const org = seedOrg(db);
  const m = seedMember(db, org);
  const root = seedTask(db, org, m.id);
  seedTask(db, org, m.id, { recurrenceParentId: root.id, dueAt: NOW });
  assert.throws(() => seedTask(db, org, m.id, { recurrenceParentId: root.id, dueAt: NOW }), /UNIQUE/);
  assert.ok(db.tasks.claimRecurrenceNext(org, root.id, 'task_next0001'));
  assert.ok(!db.tasks.claimRecurrenceNext(org, root.id, 'task_next0002'));
  db.close();
});

test('time helpers handle time zones and DST', () => {
  // 3 PM in Kolkata (UTC+5:30)
  const t = zonedToUtc(2026, 10, 12, 15, 0, 'Asia/Kolkata');
  assert.equal(t, Date.UTC(2026, 9, 12, 9, 30));
  assert.equal(spokenTime(t, 'Asia/Kolkata'), '3 PM');
  assert.equal(spokenTime(Date.UTC(2026, 9, 12, 10, 0), 'Asia/Kolkata'), '3:30 PM');
  // New York DST ends 2026-11-01: local 9 AM before and after is 13:00Z / 14:00Z
  assert.equal(zonedToUtc(2026, 10, 31, 9, 0, 'America/New_York'), Date.UTC(2026, 9, 31, 13, 0));
  assert.equal(zonedToUtc(2026, 11, 2, 9, 0, 'America/New_York'), Date.UTC(2026, 10, 2, 14, 0));
  assert.equal(startOfLocalDay(Date.UTC(2026, 9, 12, 20, 0), 'Asia/Kolkata'), Date.UTC(2026, 9, 12, 18, 30));
  assert.equal(atLocalHour(NOW, 'UTC', 18), Date.UTC(2026, 9, 12, 18, 0));
  assert.equal(localParts(addLocalMonths(Date.UTC(2026, 0, 31, 12), 1, 'UTC'), 'UTC').day, 28);
});

// ─── v1 import ───────────────────────────────────────────────────────────────

test('v1 import: users, tasks, loops, leads; v1 tables renamed; idempotent', () => {
  const dir = tmp();
  try {
    const path = join(dir, 'v1.sqlite');
    buildV1Fixture(path);
    const db = openDatabase(path, { secret: 'x' });
    const org = 'org_local';
    assert.ok(db.orgs.get(org));
    const members = db.members.list(org, { includeInactive: true });
    assert.equal(members.length, 5);
    const role = (email: string) => members.find((m) => m.email === email)!;
    assert.equal(role('ceo@acme.io').role, 'owner');
    assert.equal(role('raj@acme.io').role, 'manager');
    assert.equal(role('priya@acme.io').role, 'member');
    assert.equal(role('client@other.io').role, 'guest');
    assert.equal(role('bot@acme.io').kind, 'agent');
    assert.equal(role('bot@acme.io').role, 'agent');
    assert.equal(role('priya@acme.io').prefs.theme, 'tactical');
    assert.equal(db.members.getPasswordHash(org, 'user_ceo00001'), v1Hash('v1-password'), 'password hash kept');

    const today = db.tasks.get(org, 'task_v1today01')!;
    assert.equal(today.status, 'todo');
    assert.equal(today.priority, 'high');
    assert.equal(today.dueAllDay, true);
    assert.ok(today.dueAt! > Date.now() - 86_400_000);
    assert.deepEqual(today.assigneeIds, ['user_emp00001']);
    assert.deepEqual(today.tags, ['Sales']);
    assert.equal(db.activity.list(org, today.id).filter((a) => a.kind === 'comment').length, 1);
    const tmrw = db.tasks.get(org, 'task_v1tmrw001')!;
    assert.ok(tmrw.dueAt! > today.dueAt!);
    assert.deepEqual(tmrw.recurrence, { freq: 'weekly', interval: 1 });
    assert.equal(tmrw.subtasks[0]!.done, true);
    assert.equal(tmrw.priority, 'medium');
    const done = db.tasks.get(org, 'task_v1done001')!;
    assert.equal(done.status, 'done');
    assert.equal(done.completedAt, 1_700_000_500_000);
    assert.deepEqual(done.assigneeIds, [], 'unknown v1 assignees are dropped');

    const theirs = db.tasks.get(org, 'loop_theirs001')!;
    assert.equal(theirs.waitingOn?.contact, '+919876543210');
    assert.equal(theirs.waitingOn?.channel, 'whatsapp');
    assert.equal(theirs.notes, 'Need signature');
    assert.equal(theirs.source.channel, 'whatsapp');
    assert.equal(db.tasks.get(org, 'loop_closed001')!.status, 'done');

    const lead = db.leads.get(org, 'lead_v1lead001')!;
    assert.equal(lead.stage, 'proposal');
    assert.equal(lead.value, 5000);
    assert.equal(lead.ownerId, 'user_mgr00001');
    assert.match(lead.notes, /Wants a demo/);

    const tables = (db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    for (const t of ['v1_tasks', 'v1_loops', 'v1_leads', 'v1_users', 'v1_api_keys', 'v1_events', 'v1_settings']) assert.ok(tables.includes(t), `${t} kept`);
    assert.ok(!tables.includes('loops') && !tables.includes('users'));
    const count = db.tasks.query(org, { limit: 100 }).length;
    db.close();

    const again = openDatabase(path, { secret: 'x' });
    assert.deepEqual(again.migrated, []);
    assert.equal(again.tasks.query(org, { limit: 100 }).length, count, 'no duplicates on reopen');
    assert.equal(again.members.list(org, { includeInactive: true }).length, 5);
    again.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
