// The AI executor — gate → LLM → action → record. Boots the real stack against a
// throwaway SQLite file; the OpenRouter client is stubbed so nothing touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-exec-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap } = await import('@companybrain/core');
const boot = await bootstrap();
const core = boot.core;
const org = (await core.ctx.auth.current()).orgId;

// A stub OpenRouter client that returns canned text and never hits the network.
function stubComplete(text = 'STUBBED OUTPUT') {
  return async () => ({ ok: true, text, model: 'stub/model', usage: { prompt_tokens: 1, completion_tokens: 1 }, costUsd: null, durationMs: 5 });
}

async function makeAiTask(over: Partial<any> = {}) {
  const t = await core.tasks.create({ orgId: org, actorId: 'user_local', title: over.title ?? 'Summarize cats' });
  return core.ctx.db.tasks.update(t.id, { aiAction: 'generate', aiStatus: 'queued', ...over });
}

test('executor: auto gate → runs LLM, writes run, completes task', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const task = await makeAiTask();
  await core.ctx.executor!.run(task.id, { complete: stubComplete('DONE'), actionDeps: {}, openRouterApiKey: 'k' });
  const after = await core.ctx.db.tasks.get(task.id);
  assert.equal(after!.aiStatus, 'done');
  assert.equal(after!.completed, true);
  const runs = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'done');
  assert.equal(runs[0].output, 'DONE');
  assert.ok(runs[0].resultRef, 'the comment id is recorded as the result');
});

test('executor: off gate → no run, task stays queued', async () => {
  await core.autonomy.set(org, 'executeAi', 'off');
  const task = await makeAiTask();
  await core.ctx.executor!.run(task.id, { complete: stubComplete(), actionDeps: {}, openRouterApiKey: 'k' });
  const after = await core.ctx.db.tasks.get(task.id);
  assert.equal(after!.aiStatus, 'queued');
  const runs = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(runs.length, 0, 'no run recorded under off');
});

test('executor: ask gate → LLM runs (draft), action waits, awaiting_review; approve → done', async () => {
  await core.autonomy.set(org, 'executeAi', 'ask');
  const task = await makeAiTask({ aiAction: 'publish_blog' });
  await core.ctx.executor!.run(task.id, { complete: stubComplete('<p>draft</p>'), actionDeps: {}, openRouterApiKey: 'k' });
  const parked = await core.ctx.db.tasks.get(task.id);
  assert.equal(parked!.aiStatus, 'awaiting_review');
  assert.equal(parked!.completed, false, 'nothing is completed until a human approves');
  const runs = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'awaiting_review');
  assert.equal(runs[0].output, '<p>draft</p>');

  // approve → action runs (inject a stub publishBlog so no network)
  let published: any = null;
  await core.ctx.executor!.approve(runs[0].id, {
    complete: stubComplete(),
    actionDeps: {
      wordpressCreds: { apiUrl: 'https://b', username: 'u', appPassword: 'p' },
      publishBlog: async (o: any) => { published = o; return { ok: true, postUrl: 'https://b/?p=1' }; },
    },
    openRouterApiKey: 'k',
  });
  const done = await core.ctx.db.tasks.get(task.id);
  assert.equal(done!.aiStatus, 'done');
  assert.equal(done!.completed, true);
  assert.equal(published.content, '<p>draft</p>', 'the approved draft is what gets published');
});

test('executor: approve is a no-op for a run that is not awaiting review', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const task = await makeAiTask();
  await core.ctx.executor!.run(task.id, { complete: stubComplete('X'), actionDeps: {}, openRouterApiKey: 'k' });
  const runs = await core.ctx.db.aiRuns.listByTask(task.id);
  await core.ctx.executor!.approve(runs[0].id, { complete: stubComplete(), actionDeps: {}, openRouterApiKey: 'k' });
  const after = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(after.length, 1, 'no extra run');
  assert.equal(after[0].status, 'done');
});

test('executor: publish_blog action floor stays ask even when global is auto', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const task = await makeAiTask({ aiAction: 'publish_blog' });
  await core.ctx.executor!.run(task.id, { complete: stubComplete('<p>x</p>'), actionDeps: {}, openRouterApiKey: 'k' });
  const after = await core.ctx.db.tasks.get(task.id);
  assert.equal(after!.aiStatus, 'awaiting_review', 'action floor overrides global auto');
});

test('executor: re-firing a running task is a no-op (idempotent)', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const task = await makeAiTask({ aiStatus: 'running' });
  await core.ctx.executor!.run(task.id, { complete: stubComplete(), actionDeps: {}, openRouterApiKey: 'k' });
  const runs = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(runs.length, 0, 'duplicate enqueue does not start a second run');
});

test('executor: LLM failure → run failed, task failed (not completed)', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const task = await makeAiTask();
  const failComplete = async () => ({ ok: false, error: 'rate limited', durationMs: 1 });
  await core.ctx.executor!.run(task.id, { complete: failComplete as any, actionDeps: {}, openRouterApiKey: 'k' });
  const after = await core.ctx.db.tasks.get(task.id);
  assert.equal(after!.aiStatus, 'failed');
  assert.equal(after!.completed, false);
  const runs = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(runs[0].status, 'failed');
  assert.match(runs[0].error ?? '', /rate limited/);
});

test('executor: action failure → run failed, task not completed', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  // publish_blog under auto parks for review, so approve into a failing publisher.
  const task = await makeAiTask({ aiAction: 'publish_blog' });
  await core.ctx.executor!.run(task.id, { complete: stubComplete('<p>y</p>'), actionDeps: {}, openRouterApiKey: 'k' });
  const [run] = await core.ctx.db.aiRuns.listByTask(task.id);
  await core.ctx.executor!.approve(run.id, {
    complete: stubComplete(),
    actionDeps: {
      wordpressCreds: { apiUrl: 'https://b', username: 'u', appPassword: 'p' },
      publishBlog: async () => ({ ok: false, error: 'WordPress 401: Unauthorized' }),
    },
    openRouterApiKey: 'k',
  });
  const after = await core.ctx.db.tasks.get(task.id);
  assert.equal(after!.aiStatus, 'failed');
  assert.equal(after!.completed, false, 'a failed publish never completes the task');
  const [recorded] = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(recorded.status, 'failed');
  assert.match(recorded.error ?? '', /401/);
});

test('executor: a completed AI task records an audit event', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const task = await makeAiTask();
  await core.ctx.executor!.run(task.id, { complete: stubComplete('E'), actionDeps: {}, openRouterApiKey: 'k' });
  const events = await core.ctx.db.events.list(org, 200);
  assert.ok(events.some((e) => e.type === 'ai.task.executed' && e.entityId === task.id), 'ai.task.executed recorded');
});

test.after(async () => {
  await boot.shutdown();
  try { rmSync(dbPath, { force: true }); } catch { /* best effort */ }
});
