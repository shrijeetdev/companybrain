import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '@companybrain/db';
import { createCore } from '../src/index.ts';
import { FakeOutbound, HOUR, T0, bootstrap, makeEnv, silentLog } from './helpers.ts';

test('notifications.sendTest: per-channel checks and delivery to the actor', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: p, a: pA } = await team.add('Priya', 'member', { phone: '+15550001111' });
  assert.deepEqual(await env.s.notifications.sendTest(pA, 'whatsapp'), { ok: true });
  assert.equal(env.out.to('+15550001111').length, 1);
  assert.deepEqual(await env.s.notifications.sendTest(pA, 'email'), { ok: true });
  assert.equal(env.out.to(p.email!).length, 1);
  const push = await env.s.notifications.sendTest(pA, 'push');
  assert.equal(push.ok, false);
  assert.match(push.error!, /No push subscriptions/);
  await env.s.notifications.subscribePush(pA, { endpoint: 'https://push.example/p1', keys: { p256dh: 'k', auth: 'a' } }, 'ua');
  assert.deepEqual(await env.s.notifications.sendTest(pA, 'push'), { ok: true });
  const { a: noPhoneA } = await team.add('Max');
  assert.match((await env.s.notifications.sendTest(noPhoneA, 'whatsapp')).error!, /phone number/);
  env.out.configured.email = false;
  assert.match((await env.s.notifications.sendTest(pA, 'email')).error!, /not configured/);
  const { a: botA } = await team.addAgent('Claude');
  assert.equal((await env.s.notifications.sendTest(botA, 'push')).ok, false);
});

test('onAudit hook receives every audit event and its errors never fail the request', async () => {
  const db = openDatabase(':memory:', { secret: 'x' });
  const seen: string[] = [];
  const errors: unknown[] = [];
  const core = createCore({
    db,
    outbound: new FakeOutbound(),
    clock: () => T0,
    log: { ...silentLog, error: (...a: unknown[]) => errors.push(a) },
    onAudit: async (e) => {
      seen.push(e.type);
      throw new Error('game bug');
    },
  });
  const s = core.services;
  const res = await s.auth.setup({ orgName: 'A', name: 'Owner', email: 'o@a.io', password: 'password123', timezone: 'UTC' });
  const a = (await s.auth.resolveSession(res.token))!;
  const t = await s.tasks.create(a, { title: 'x' });
  await s.tasks.complete(a, t.id);
  assert.deepEqual(seen, ['org.setup', 'task.created', 'task.completed']);
  assert.equal(errors.length, 3);
});

test('meetings: visibility, organizer-only edits, reminders rescheduled on move, undo delete', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: p, a: pA } = await team.add('Priya');
  const { a: maxA } = await team.add('Max');
  const m = await env.s.meetings.create(team.ownerA, { title: 'Board', startAt: T0 + 2 * HOUR, endAt: T0 + 3 * HOUR, attendeeIds: [p.id] });
  assert.equal((await env.s.meetings.list(pA, { from: T0, to: T0 + 5 * HOUR })).length, 1);
  assert.equal((await env.s.meetings.list(maxA, { from: T0, to: T0 + 5 * HOUR })).length, 0);
  await assert.rejects(env.s.meetings.list(maxA, { from: T0, to: T0 + HOUR, memberId: p.id }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.meetings.update(pA, m.id, { title: 'x' }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.meetings.create(team.ownerA, { title: 'bad', startAt: T0 + HOUR, endAt: T0 }), (e: any) => e.code === 'bad_request');
  await env.s.meetings.update(team.ownerA, m.id, { startAt: T0 + 5 * HOUR, endAt: T0 + 6 * HOUR });
  const job = env.db.jobs.list(team.owner.orgId, { status: 'pending', kind: 'meeting.reminder' })[0]!;
  assert.equal(job.runAt, T0 + 5 * HOUR - 10 * 60_000);
  await env.s.meetings.remove(team.ownerA, m.id);
  assert.equal(env.db.jobs.list(team.owner.orgId, { status: 'pending', kind: 'meeting.reminder' }).length, 0);
  const ev = (await env.s.audit.list(team.ownerA, { entity: 'meeting' })).find((e) => e.type === 'meeting.deleted')!;
  await env.s.audit.undo(team.ownerA, ev.id);
  assert.equal((await env.s.meetings.list(pA, { from: T0, to: T0 + 10 * HOUR })).length, 1);
});

test('leads: CRUD with validation; guests have no access', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { a: guestA } = await team.add('Gus', 'guest');
  const l = await env.s.leads.create(team.ownerA, { name: 'Dana', company: 'Globex', email: 'DANA@globex.io', value: 5000 });
  assert.equal(l.email, 'dana@globex.io');
  assert.equal(l.stage, 'new');
  const u = await env.s.leads.update(team.ownerA, l.id, { stage: 'proposal' });
  assert.equal(u.stage, 'proposal');
  await assert.rejects(env.s.leads.update(team.ownerA, l.id, { stage: 'bogus' as never }), (e: any) => e.code === 'bad_request');
  await assert.rejects(env.s.leads.list(guestA), (e: any) => e.code === 'forbidden');
  await env.s.leads.remove(team.ownerA, l.id);
  assert.equal((await env.s.leads.list(team.ownerA)).length, 0);
});
