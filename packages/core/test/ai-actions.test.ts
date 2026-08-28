// Action adapters — what happens to the LLM's output. Pure units: no DB, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../src/ai-actions';
import type { Context } from '../src/context';
import type { Task } from '@companybrain/types';

// Minimal stub Context — only db.tasks.update is exercised by generate.run.
function makeCtx(): Context {
  const updates: any[] = [];
  return {
    db: { tasks: { update: async (id: string, patch: any) => { updates.push({ id, patch }); return { id, ...patch }; } } } as any,
  } as Context;
}

const baseTask = (over: Partial<Task> = {}): Task => ({
  id: 'task_1', orgId: 'org_local', emoji: '✅', title: 'Write a blog about cats', list: 'Inbox',
  day: 'today', priority: null, recurring: false, assignees: [], createdBy: 'user_local',
  completed: false, completedAt: null, createdAt: 0, aiAction: 'generate', ...over,
});

test('actions: generate.prompt describes the deliverable', () => {
  const p = ACTIONS.generate.prompt(baseTask());
  assert.match(p.system, /deliverable/i);
  assert.match(p.user, /cats/i);
});

test('actions: a promptOverride replaces the user message', () => {
  const p = ACTIONS.generate.prompt(baseTask({ aiConfig: { promptOverride: 'Only write haiku.' } }));
  assert.equal(p.user, 'Only write haiku.');
});

test('actions: generate.run appends a comment + returns ok', async () => {
  const ctx = makeCtx();
  const r = await ACTIONS.generate.run({ task: baseTask(), output: 'Here is the text', ctx, deps: {} });
  assert.equal(r.ok, true);
  assert.ok(r.resultRef, 'comment id returned');
});

test('actions: publish_blog.run posts a draft via injected publishBlog', async () => {
  let captured: any = {};
  const publishBlog = async (opts: any) => {
    captured = opts;
    return { ok: true, postUrl: 'https://blog.example.com/?p=7' };
  };
  const r = await ACTIONS.publish_blog.run({
    task: baseTask({ aiAction: 'publish_blog' }),
    output: '<p>cat post</p>',
    ctx: makeCtx(),
    deps: { wordpressCreds: { apiUrl: 'https://blog.example.com', username: 'u', appPassword: 'p' }, publishBlog },
  });
  assert.equal(r.ok, true);
  assert.equal(r.resultRef, 'https://blog.example.com/?p=7');
  assert.equal(captured.title, 'Write a blog about cats');
  assert.equal(captured.content, '<p>cat post</p>');
});

test('actions: publish_blog.run fails closed without publishBlog injected', async () => {
  const r = await ACTIONS.publish_blog.run({
    task: baseTask({ aiAction: 'publish_blog' }), output: 'x', ctx: makeCtx(),
    deps: { wordpressCreds: { apiUrl: 'https://b', username: 'u', appPassword: 'p' } },
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /publishBlog|not configured|not injected/i);
});

test('actions: publish_blog.run fails closed without creds', async () => {
  const r = await ACTIONS.publish_blog.run({
    task: baseTask({ aiAction: 'publish_blog' }), output: 'x', ctx: makeCtx(),
    deps: { publishBlog: async () => ({ ok: true, postUrl: 'x' }) },
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /wordpress/i);
});

test('actions: publish_blog.run surfaces a WordPress failure', async () => {
  const r = await ACTIONS.publish_blog.run({
    task: baseTask({ aiAction: 'publish_blog' }), output: 'x', ctx: makeCtx(),
    deps: {
      wordpressCreds: { apiUrl: 'https://b', username: 'u', appPassword: 'p' },
      publishBlog: async () => ({ ok: false, error: 'WordPress 401: Unauthorized' }),
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /401/);
});

test('actions: defaultAutonomy — generate auto, publish_blog ask', () => {
  assert.equal(ACTIONS.generate.defaultAutonomy, 'auto');
  assert.equal(ACTIONS.publish_blog.defaultAutonomy, 'ask');
});
