// The runAiTask worker — the wiring between setAiAction, the queue, the injected clients
// and the executor. Clients are stubs, so no network and no real API key are involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-aiworker-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;
process.env.OPENROUTER_API_KEY = 'test-key';

const { bootstrap } = await import('@companybrain/core');

let seenApiKey = '';
const published: any[] = [];
const aiClients = {
  async complete(opts: any) {
    seenApiKey = opts.apiKey;
    return { ok: true, text: '<p>from the model</p>', model: 'stub/model', durationMs: 1 };
  },
  async publishBlog(opts: any) {
    published.push(opts);
    return { ok: true, postUrl: 'https://blog.example.com/?p=99' };
  },
};

const boot = await bootstrap({ aiClients });
const core = boot.core;
const org = (await core.ctx.auth.current()).orgId;

/** The in-process queue fires on a microtask; poll briefly for the state we expect. */
async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, tries = 50): Promise<T> {
  let last = await fn();
  for (let i = 0; i < tries && !ok(last); i++) {
    await new Promise((r) => setTimeout(r, 10));
    last = await fn();
  }
  return last;
}

test('worker: setAiAction → queue → executor completes a generate task', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const t = await core.tasks.create({ orgId: org, actorId: 'user_local', title: 'Summarize photosynthesis' });
  await core.tasks.setAiAction(t.id, 'generate');

  const done = await waitFor(() => core.ctx.db.tasks.get(t.id), (task) => task?.aiStatus === 'done');
  assert.equal(done!.aiStatus, 'done');
  assert.equal(done!.completed, true);
  assert.equal(done!.comments?.at(-1)?.text, '<p>from the model</p>', 'output landed on the task');
  assert.equal(seenApiKey, 'test-key', 'the worker supplies the key from env');
});

test('worker: publish_blog parks for review, then approveAiRun publishes the draft', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto'); // action floor still forces ask
  const t = await core.tasks.create({ orgId: org, actorId: 'user_local', title: '3 tips for better sleep' });
  await core.ctx.db.connections.upsert(org, 'wordpress', {
    credentials: { apiUrl: 'https://blog.example.com', username: 'u', appPassword: 'p' },
    status: 'connected',
  });
  await core.tasks.setAiAction(t.id, 'publish_blog');

  const parked = await waitFor(() => core.ctx.db.tasks.get(t.id), (task) => task?.aiStatus === 'awaiting_review');
  assert.equal(parked!.aiStatus, 'awaiting_review');
  assert.equal(published.length, 0, 'nothing published before approval');

  const [run] = await core.ctx.db.aiRuns.listByTask(t.id);
  await core.tasks.approveAiRun(run.id);

  const done = await waitFor(() => core.ctx.db.tasks.get(t.id), (task) => task?.aiStatus === 'done');
  assert.equal(done!.aiStatus, 'done');
  assert.equal(published.length, 1);
  assert.equal(published[0].creds.apiUrl, 'https://blog.example.com', 'stored creds reached the publisher');
  assert.equal(published[0].content, '<p>from the model</p>');
  const [after] = await core.ctx.db.aiRuns.listByTask(t.id);
  assert.equal(after.resultRef, 'https://blog.example.com/?p=99');
});

test('worker: no OPENROUTER_API_KEY → the task is left queued, untouched', async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    await core.autonomy.set(org, 'executeAi', 'auto');
    const t = await core.tasks.create({ orgId: org, actorId: 'user_local', title: 'No key here' });
    await core.tasks.setAiAction(t.id, 'generate');
    await new Promise((r) => setTimeout(r, 60));
    const after = await core.ctx.db.tasks.get(t.id);
    assert.equal(after!.aiStatus, 'queued', 'stays queued so it can be retried once a key exists');
    assert.equal((await core.ctx.db.aiRuns.listByTask(t.id)).length, 0);
  } finally {
    process.env.OPENROUTER_API_KEY = prev;
  }
});

test.after(async () => {
  await boot.shutdown();
  try { rmSync(dbPath, { force: true }); } catch { /* best effort */ }
});
