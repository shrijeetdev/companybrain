// v2 polish round: subtask reorder, delete → undo via audit id, priority/completedSince filters,
// org currency, briefing team includes the viewer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, runMigrations } from '@companybrain/db';
import { DAY, HOUR, bootstrap, makeEnv } from './helpers.ts';

test('reorderSubtasks persists the order; ids must be exactly the current set; permissions + audit + undo', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { a: outsiderA } = await team.add('Outsider', 'member');
  const t = await env.s.tasks.create(team.ownerA, { title: 'Launch', subtasks: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] });
  const [a, b, c] = t.subtasks.map((s) => s.id) as [string, string, string];
  await env.s.tasks.updateSubtask(team.ownerA, t.id, b, { done: true });

  const r = await env.s.tasks.reorderSubtasks(team.ownerA, t.id, [c, a, b]);
  assert.deepEqual(r.subtasks.map((s) => s.title), ['c', 'a', 'b']);
  assert.equal(r.subtasks[2]!.done, true, 'subtask state is kept');
  assert.deepEqual((await env.s.tasks.get(team.ownerA, t.id)).subtasks.map((s) => s.id), [c, a, b], 'persisted');

  const bad = (ids: unknown) => assert.rejects(env.s.tasks.reorderSubtasks(team.ownerA, t.id, ids as string[]), (e: any) => e.code === 'bad_request');
  await bad([c, a]); // missing one
  await bad([c, a, b, 'sub_unknown123']); // extra
  await bad([c, a, a]); // duplicate
  await bad([c, a, 'sub_unknown123']); // unknown
  await bad('nope');
  await assert.rejects(env.s.tasks.reorderSubtasks(outsiderA, t.id, [a, b, c]), (e: any) => ['forbidden', 'not_found'].includes(e.code));

  // Same order → no-op (no new audit event).
  const before = env.audits.length;
  await env.s.tasks.reorderSubtasks(team.ownerA, t.id, [c, a, b]);
  assert.equal(env.audits.length, before);

  const ev = env.audits.filter((e) => e.entityId === t.id).at(-1)!;
  assert.equal(ev.type, 'task.updated');
  assert.match(ev.summary, /Reordered subtasks/);
  assert.ok((await env.s.tasks.activity(team.ownerA, t.id)).some((x) => x.kind === 'subtask' && /reordered/.test(x.text)));
  await env.s.audit.undo(team.ownerA, ev.id);
  assert.deepEqual((await env.s.tasks.get(team.ownerA, t.id)).subtasks.map((s) => s.title), ['a', 'b', 'c'], 'undo restores the old order');
});

test('remove returns the audit id; undoing it restores the task', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const t = await env.s.tasks.create(team.ownerA, { title: 'Delete me', priority: 'high', subtasks: [{ title: 'x' }] });
  const { auditId } = await env.s.tasks.remove(team.ownerA, t.id);
  const ev = env.audits.find((e) => e.id === auditId)!;
  assert.equal(ev.type, 'task.deleted');
  assert.equal(ev.entityId, t.id);
  await assert.rejects(env.s.tasks.get(team.ownerA, t.id), (e: any) => e.code === 'not_found');
  await env.s.audit.undo(team.ownerA, auditId);
  const back = await env.s.tasks.get(team.ownerA, t.id);
  assert.equal(back.title, 'Delete me');
  assert.equal(back.priority, 'high');
  assert.equal(back.subtasks.length, 1);
  await assert.rejects(env.s.audit.undo(team.ownerA, auditId), (e: any) => e.code === 'conflict', 'single use');
});

test('list: priority filter and completedSince (closed tasks only)', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const mk = (title: string, extra: object = {}) => env.s.tasks.create(team.ownerA, { title, ...extra });
  await mk('urgent', { priority: 'urgent' });
  await mk('high', { priority: 'high' });
  await mk('low', { priority: 'low' });
  const old = await mk('done long ago', { priority: 'high' });
  await env.s.tasks.complete(team.ownerA, old.id);
  env.clock.advance(10 * DAY);
  const recent = await mk('done recently', { priority: 'low' });
  await env.s.tasks.complete(team.ownerA, recent.id);
  const cancelled = await mk('cancelled recently');
  await env.s.tasks.update(team.ownerA, cancelled.id, { status: 'cancelled' });

  const titles = async (q: object) => (await env.s.tasks.list(team.ownerA, q)).map((t) => t.title).sort();
  assert.deepEqual(await titles({ priority: ['urgent', 'high'] }), ['high', 'urgent']);
  assert.deepEqual(await titles({ priority: 'urgent,low' as never }), ['low', 'urgent'], 'comma string accepted');
  assert.deepEqual(await titles({ priority: ['high'], includeDone: true }), ['done long ago', 'high']);
  await assert.rejects(env.s.tasks.list(team.ownerA, { priority: ['extreme' as never] }), (e: any) => e.code === 'bad_request');

  const since = env.clock.now - 7 * DAY;
  assert.deepEqual(await titles({ includeDone: true, completedSince: since }), ['cancelled recently', 'done recently', 'high', 'low', 'urgent'], 'open tasks unaffected, old done excluded');
  assert.deepEqual(await titles({ view: 'done', completedSince: since }), ['done recently']);
  assert.deepEqual(await titles({ includeDone: true }), ['cancelled recently', 'done long ago', 'done recently', 'high', 'low', 'urgent']);
  await assert.rejects(env.s.tasks.list(team.ownerA, { completedSince: 'yesterday' as never }), (e: any) => e.code === 'bad_request');
});

test('org currency: default USD, validated, normalized, audited', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { a: memA } = await team.add('Max', 'member');
  assert.equal((await env.s.org.get(team.ownerA)).currency, 'USD');
  assert.equal((await env.s.org.update(team.ownerA, { currency: 'inr' })).currency, 'INR');
  assert.equal((await env.s.org.get(memA)).currency, 'INR');
  for (const bad of ['RUPEE', 'XXZ', 12, '']) {
    await assert.rejects(env.s.org.update(team.ownerA, { currency: bad as never }), (e: any) => e.code === 'bad_request', String(bad));
  }
  await assert.rejects(env.s.org.update(memA, { currency: 'EUR' }), (e: any) => e.code === 'forbidden');
  const ev = env.audits.filter((e) => e.entity === 'org').at(-1)!;
  await env.s.audit.undo(team.ownerA, ev.id);
  assert.equal((await env.s.org.get(team.ownerA)).currency, 'USD');
});

test('migration 4 adds orgs.currency with USD default to an existing database', () => {
  const db = openDatabase(':memory:', { secret: 'x' });
  const raw = db.sqlite;
  raw.exec('ALTER TABLE orgs DROP COLUMN currency');
  raw.prepare('DELETE FROM schema_migrations WHERE version = 4').run();
  raw.prepare("INSERT INTO orgs (id, name, timezone, workday_start, workday_end, default_reminder_offsets, agent_stale_after_min, intake_auto_ack, created_at, updated_at) VALUES ('org_legacy01', 'Old', 'UTC', 9, 18, '[]', 240, 0, 0, 0)").run();
  assert.deepEqual(runMigrations(raw), [4]);
  assert.equal(db.orgs.get('org_legacy01')!.currency, 'USD');
});

test('briefing team: managers get every active human incl. themselves (first); members get none', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: zed } = await team.add('Zed', 'member');
  const { m: amy, a: amyA } = await team.add('Amy', 'manager');
  const { m: gus } = await team.add('Gus', 'guest');
  const { a: memA } = await team.add('Bo', 'member');
  const { m: gone } = await team.add('Gone', 'member');
  await env.s.members.remove(team.ownerA, gone.id);
  await team.addAgent('Claude');
  await env.s.tasks.create(team.ownerA, { title: 'mine', assigneeIds: [amy.id], dueAt: env.clock.now + HOUR });

  const b = await env.s.briefing.get(amyA);
  const ids = b.team.map((p) => p.member.id);
  assert.equal(ids[0], amy.id, 'viewer first');
  assert.ok(ids.includes(team.owner.id) && ids.includes(zed.id));
  assert.ok(!ids.includes(gus.id), 'guests excluded');
  assert.ok(!ids.includes(gone.id), 'inactive excluded');
  assert.ok(b.team.every((p) => p.member.kind === 'human'));
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  const names = b.team.slice(1).map((p) => p.member.name);
  assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y)), 'others sorted by name');
  assert.equal(b.team[0]!.open, 1, "viewer's own counts are included");

  assert.deepEqual((await env.s.briefing.get(memA)).team, []);
});
