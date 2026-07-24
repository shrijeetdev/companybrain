// MCP gate mapping + routing: writes go through core.autonomy.gate; reads never do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-mcp-gate-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap } = await import('@companybrain/core');
const { findTool, DEFAULT_ORG_ID } = await import('@companybrain/mcp');

const boot = await bootstrap();
const core = boot.core;
const org = DEFAULT_ORG_ID; // 'org_local' — matches LOCAL_ORG_ID used by the auth seed
const ctx = { orgId: org, actorId: 'user_agent_test' };

test('gate: create_loop tool exists', () => {
  assert.ok(findTool('create_loop'), 'create_loop tool is registered');
});

test('gate: defaults are off → every gated write returns "blocked" and mutates nothing', async () => {
  // createTasks must be off by default; ensure it.
  await core.autonomy.set(org, 'createTasks', 'off');
  await core.autonomy.set(org, 'manageRecords', 'off');

  // create_task
  const before = (await core.tasks.list(org)).length;
  const r = await findTool('create_task')!.handler({ title: 'x' }, core, ctx);
  assert.equal(r.gated, 'off', 'create_task blocked by default');
  assert.equal((await core.tasks.list(org)).length, before, 'no task created');

  // close_loop needs an existing loop; capture one directly via core first.
  const loop = await core.loops.capture({ orgId: org, actorId: 'u', title: 'L', why: 'w', side: 'yours', channel: 'manual' });
  const rc = await findTool('close_loop')!.handler({ id: loop.id }, core, ctx);
  assert.equal(rc.gated, 'off', 'close_loop blocked by default');
  const still = await core.loops.get(loop.id);
  assert.equal(still!.status, 'open', 'loop not closed');
});

test('gate: createTasks=auto → create_task mutates and is attributed to agent', async () => {
  await core.autonomy.set(org, 'createTasks', 'auto');
  const r = await findTool('create_task')!.handler({ title: 'via mcp' }, core, ctx);
  assert.equal(r.gated, 'auto');
  assert.ok(r.task, 'task returned');
  assert.equal(r.task.createdBy, 'user_agent_test', 'attributed to agent actor');
});

test('gate: createTasks=ask → create_task returns "queued", no task created', async () => {
  await core.autonomy.set(org, 'createTasks', 'ask');
  const before = (await core.tasks.list(org)).length;
  const r = await findTool('create_task')!.handler({ title: 'pending one' }, core, ctx);
  assert.equal(r.gated, 'ask');
  assert.equal((await core.tasks.list(org)).length, before, 'no task created on ask');
  const pending = await core.approvals.list(org, 'pending');
  assert.ok(pending.some((a) => a.action === 'createTasks'), 'approval queued');
});

test('gate: reads are never blocked (createTasks still ask, but list works)', async () => {
  const r = await findTool('list_tasks')!.handler({}, core, ctx);
  assert.ok(Array.isArray(r.tasks));
  const d = await findTool('get_dashboard')!.handler({}, core, ctx);
  assert.ok(typeof d.openLoops === 'number');
});

process.on('exit', () => { try { rmSync(dbPath); } catch {} });
