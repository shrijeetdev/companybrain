// The nightly backup job — the wiring between the queue, Database.filePath() and the
// backup module. The unit tests cover the copy itself; this covers that it is reachable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';

const dir = join(tmpdir(), `companybrain-backupjob-${process.pid}-${Date.now()}`);
mkdirSync(dir, { recursive: true });
const dbPath = join(dir, 'live.sqlite');
const backupDir = join(dir, 'backups');
process.env.COMPANYBRAIN_DB_PATH = dbPath;
process.env.COMPANYBRAIN_BACKUP_DIR = backupDir;

const { bootstrap } = await import('@companybrain/core');
const boot = await bootstrap();
const core = boot.core;
const org = (await core.ctx.auth.current()).orgId;

test('backup job: the database reports where it lives', () => {
  assert.equal(boot.db.filePath?.(), dbPath, 'the job needs a path to copy');
});

test('backup job: an enqueued backupDatabase writes a copy carrying live data', async () => {
  await core.tasks.create({ orgId: org, actorId: 'user_local', title: 'backed up by the worker' });
  await core.ctx.queue.enqueue('backupDatabase', {});
  // The in-process queue fires on a microtask; give the copy a moment to land. The backup
  // directory does not exist until the first backup creates it.
  const written = () => { try { return readdirSync(backupDir); } catch { return []; } };
  for (let i = 0; i < 50 && written().length === 0; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  const files = written();
  assert.equal(files.length, 1, 'one backup written');

  const { SqliteDatabase } = await import('@companybrain/db');
  const copy = new SqliteDatabase(join(backupDir, files[0]));
  await copy.init();
  const tasks = await copy.tasks.list(org);
  assert.ok(tasks.some((t) => t.title === 'backed up by the worker'), 'the copy carries the live write');
  await copy.close();
});

test.after(async () => {
  await boot.shutdown();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
});
