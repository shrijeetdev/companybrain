// Backups — a consistent copy of the one file, plus retention pruning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const root = join(tmpdir(), `companybrain-backup-${process.pid}-${Date.now()}`);
mkdirSync(root, { recursive: true });
const dbPath = join(root, 'source.sqlite');
const backupDir = join(root, 'backups');

const { SqliteDatabase } = await import('@companybrain/db');
const { backupDatabase, pruneBackups, listBackups } = await import('../src/backup');

const db = new SqliteDatabase(dbPath);
await db.init();
await db.tasks.insert({
  id: 'task_backup', orgId: 'org_local', emoji: '✅', title: 'survive the backup', list: 'Inbox',
  day: 'today', priority: null, recurring: false, assignees: [], createdBy: 'user_local',
  completed: false, completedAt: null, createdAt: Date.now(),
} as any);

test('backup: writes a readable copy containing the data', async () => {
  const r = await backupDatabase({ sourcePath: dbPath, dir: backupDir, now: new Date('2026-01-01T00:00:00Z') });
  assert.ok(existsSync(r.path), 'backup file exists');
  assert.ok(r.bytes > 0, 'backup is not empty');
  const copy = new SqliteDatabase(r.path);
  await copy.init();
  const task = await copy.tasks.get('task_backup');
  assert.equal(task?.title, 'survive the backup', 'the copy carries the data');
  await copy.close();
});

test('backup: succeeds while the source database is open and writing', async () => {
  await db.tasks.insert({
    id: 'task_live', orgId: 'org_local', emoji: '✅', title: 'written during backup', list: 'Inbox',
    day: 'today', priority: null, recurring: false, assignees: [], createdBy: 'user_local',
    completed: false, completedAt: null, createdAt: Date.now(),
  } as any);
  const r = await backupDatabase({ sourcePath: dbPath, dir: backupDir, now: new Date('2026-01-02T00:00:00Z') });
  const copy = new SqliteDatabase(r.path);
  await copy.init();
  assert.ok(await copy.tasks.get('task_live'), 'the live write is in the copy');
  await copy.close();
});

test('backup: retention keeps only the newest N', async () => {
  for (let i = 3; i <= 8; i++) {
    await backupDatabase({ sourcePath: dbPath, dir: backupDir, keep: 100, now: new Date(`2026-01-0${i}T00:00:00Z`) });
  }
  const before = listBackups(backupDir).length;
  assert.ok(before >= 8, `expected at least 8 backups, saw ${before}`);
  const pruned = pruneBackups(backupDir, 3);
  assert.equal(pruned.length, before - 3);
  const after = listBackups(backupDir);
  assert.equal(after.length, 3);
  assert.ok(after[0].at >= after[1].at, 'newest first');
});

test('backup: pruning never touches files it did not write', async () => {
  const stray = join(backupDir, 'do-not-delete.txt');
  writeFileSync(stray, 'important');
  pruneBackups(backupDir, 1);
  assert.ok(existsSync(stray), 'unrelated file survived');
});

test('backup: a missing source is an error, not a silent empty backup', async () => {
  await assert.rejects(() => backupDatabase({ sourcePath: join(root, 'nope.sqlite'), dir: backupDir }));
});

test('backup: listing an absent directory is empty, not a throw', () => {
  assert.deepEqual(listBackups(join(root, 'never-created')), []);
});

test.after(async () => {
  await db.close();
  try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});
