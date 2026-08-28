// ai_runs persistence — append-only history of AI task executions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-airuns-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { SqliteDatabase } = await import('@companybrain/db');
const db = new SqliteDatabase(dbPath);
await db.init();

function run(overrides: Partial<any> = {}) {
  return {
    id: 'airun_' + Math.random().toString(36).slice(2, 8),
    orgId: 'org_local', taskId: 'task_1', action: 'generate', model: 'anthropic/claude-3.5-sonnet',
    status: 'running', systemPrompt: 'sys', userPrompt: 'u', at: Date.now(), ...overrides,
  };
}

test('aiRuns: insert then get round-trips', async () => {
  const r = run({ id: 'airun_a' });
  await db.aiRuns.insert(r);
  const got = await db.aiRuns.get('airun_a');
  assert.ok(got);
  assert.equal(got!.taskId, 'task_1');
  assert.equal(got!.status, 'running');
});

test('aiRuns: update patches fields', async () => {
  await db.aiRuns.insert(run({ id: 'airun_b', status: 'running' }));
  const updated = await db.aiRuns.update('airun_b', { status: 'done', output: 'hello', durationMs: 1234 });
  assert.equal(updated.status, 'done');
  assert.equal(updated.output, 'hello');
  assert.equal(updated.durationMs, 1234);
});

test('aiRuns: listByTask returns newest-first; listByOrg limits', async () => {
  await db.aiRuns.insert(run({ id: 'airun_c1', taskId: 'task_2', at: 1000 }));
  await db.aiRuns.insert(run({ id: 'airun_c2', taskId: 'task_2', at: 2000 }));
  const byTask = await db.aiRuns.listByTask('task_2');
  assert.equal(byTask.length, 2);
  assert.equal(byTask[0].id, 'airun_c2', 'newest first');
  const byOrg = await db.aiRuns.listByOrg('org_local', 1);
  assert.equal(byOrg.length, 1);
});

test('aiRuns: keys survive reopen of the file', async () => {
  await db.close();
  const db2 = new SqliteDatabase(dbPath);
  await db2.init();
  const got = await db2.aiRuns.get('airun_a');
  assert.ok(got, 'run survived reopen');
  await db2.close();
});

process.on('exit', () => { try { rmSync(dbPath); } catch {} });
