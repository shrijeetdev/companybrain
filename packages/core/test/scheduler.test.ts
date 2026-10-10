import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CalendarFetcher } from '@companybrain/types';
import { openDatabase } from '@companybrain/db';
import { DAY, FakeClock, FakeOutbound, HOUR, MIN, T0, advance, bootstrap, makeEnv } from './helpers.ts';

const kinds = async (env: ReturnType<typeof makeEnv>, a: Parameters<typeof env.s.notifications.list>[0]) =>
  (await env.s.notifications.list(a, { limit: 100 })).map((n) => n.kind).reverse();

test('reminder pipeline end-to-end: due-24h, due-1h, due, overdue (repeats), escalation; WhatsApp fan-out', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya, a: priyaA } = await team.add('Priya', 'member', { phone: '+91 98765 43210' });
  const due = T0 + 2 * DAY + 2 * HOUR;
  const t = await env.s.tasks.create(team.ownerA, { title: 'Send Acme proposal', dueAt: due, assigneeIds: [priya.id] });
  await env.tick();
  assert.deepEqual(await kinds(env, priyaA), ['task_assigned']);

  env.clock.set(due - DAY);
  await env.tick();
  assert.deepEqual(await kinds(env, priyaA), ['task_assigned', 'task_due_soon']);
  const soon = (await env.s.notifications.list(priyaA))[0]!;
  assert.equal(soon.title, 'Due in 24 hours: Send Acme proposal');
  assert.ok(env.out.to('+919876543210').some((s) => s.text.includes('Due in 24 hours')), 'WhatsApp delivered');

  env.clock.set(due - HOUR);
  await env.tick();
  env.clock.set(due);
  await env.tick();
  assert.deepEqual((await kinds(env, priyaA)).slice(2), ['task_due_soon', 'task_due_now']);

  env.clock.set(due + HOUR);
  await env.tick();
  const overdue = (await env.s.notifications.list(priyaA))[0]!;
  assert.equal(overdue.kind, 'task_overdue');
  assert.equal(overdue.urgent, true);
  assert.equal((await env.s.tasks.get(priyaA, t.id)).isOverdue, true);

  env.clock.set(due + DAY);
  await env.tick();
  const ownerKinds = await kinds(env, team.ownerA);
  assert.equal(ownerKinds.filter((k) => k === 'task_escalated').length, 1, 'creator gets escalation');
  assert.ok(!(await kinds(env, priyaA)).includes('task_escalated'), 'assignee not escalated to');

  env.clock.set(due + DAY + HOUR);
  await env.tick();
  assert.equal((await kinds(env, priyaA)).filter((k) => k === 'task_overdue').length, 2, 'overdue repeats daily');
  await advance(env, 3 * DAY, HOUR);
  assert.equal((await kinds(env, team.ownerA)).filter((k) => k === 'task_escalated').length, 1, 'escalation fires once');

  const acts = await env.s.tasks.activity(team.ownerA, t.id);
  assert.ok(acts.filter((a) => a.kind === 'reminder_sent').length >= 5);

  await env.s.tasks.complete(priyaA, t.id);
  const before = (await kinds(env, priyaA)).length;
  await advance(env, 3 * DAY, 6 * HOUR);
  assert.equal((await kinds(env, priyaA)).length, before, 'nothing after completion');
  assert.equal(env.db.jobs.list(team.owner.orgId, { status: 'pending', keyPrefix: `task.` }).length, 0, 'task jobs cancelled');
});

test('rescheduling: changing the due date moves reminders; stale jobs are no-ops', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: p, a: pA } = await team.add('Priya');
  const t = await env.s.tasks.create(team.ownerA, { title: 'Move me', dueAt: T0 + 2 * HOUR, assigneeIds: [p.id], reminderOffsets: [60] });
  await env.s.tasks.update(team.ownerA, t.id, { dueAt: T0 + 10 * HOUR });
  env.clock.set(T0 + HOUR);
  await env.tick();
  assert.ok(!(await kinds(env, pA)).includes('task_due_soon'), 'old reminder cancelled');
  env.clock.set(T0 + 9 * HOUR);
  await env.tick();
  assert.equal((await kinds(env, pA)).filter((k) => k === 'task_due_soon').length, 1);
  await env.s.tasks.update(team.ownerA, t.id, { assigneeIds: [] });
  env.clock.set(T0 + 11 * HOUR);
  await env.tick();
  assert.ok((await kinds(env, team.ownerA)).includes('task_overdue'), 'unassigned → creator is reminded');
});

test('quiet hours hold non-urgent external channels until quiet end; in-app immediate; urgent bypasses', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: p, a: pA } = await team.add('Priya', 'member', { phone: '+15550001111' });
  await env.s.members.update(pA, p.id, { prefs: { quietStart: 22, quietEnd: 7 } });
  const due = Date.UTC(2026, 9, 12, 23, 30);
  await env.s.tasks.create(team.ownerA, { title: 'Late task', dueAt: due, assigneeIds: [p.id], reminderOffsets: [0] });
  await env.tick();
  env.out.clear();
  env.clock.set(due);
  await env.tick();
  assert.ok((await kinds(env, pA)).includes('task_due_now'), 'in-app immediately');
  assert.equal(env.out.to('+15550001111').length, 0, 'WhatsApp held during quiet hours');
  env.clock.set(due + HOUR); // 00:30 — overdue is urgent
  await env.tick();
  assert.equal(env.out.to('+15550001111').length, 1, 'urgent overdue goes out immediately');
  assert.match(env.out.to('+15550001111')[0]!.text, /Overdue/);
  env.clock.set(Date.UTC(2026, 9, 13, 7, 0));
  await env.tick();
  const msgs = env.out.to('+15550001111').map((s) => s.text);
  assert.equal(msgs.length, 2);
  assert.match(msgs[1]!, /Due now/, 'held message delivered at quiet end');
});

test('recurring tasks spawn exactly one next occurrence — never duplicates across completions and ticks', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: p, a: pA } = await team.add('Priya');
  const root = await env.s.tasks.create(team.ownerA, { title: 'Daily standup notes', dueAt: T0 + 3 * HOUR, assigneeIds: [p.id], recurrence: { freq: 'daily', interval: 1 } });
  const series = () => env.db.tasks.query(team.owner.orgId, { limit: 1000 }).filter((t) => t.id === root.id || t.recurrenceParentId === root.id);

  for (let day = 0; day < 10; day++) {
    const open = series().filter((t) => t.status !== 'done');
    assert.equal(open.length, 1, `exactly one open occurrence on day ${day}`);
    await env.s.tasks.complete(pA, open[0]!.id);
    // hammer it: reopen + complete, run the recur job by hand, tick a lot
    await env.s.tasks.reopen(pA, open[0]!.id);
    await env.s.tasks.complete(pA, open[0]!.id);
    env.db.jobs.schedule(team.owner.orgId, 'task.recur', `task.recur:${open[0]!.id}`, env.clock.now, { taskId: open[0]!.id }, env.clock.now);
    await advance(env, DAY, 2 * HOUR);
  }
  const all = series();
  assert.equal(all.length, 11, '10 completions → 10 spawns + root');
  const dues = all.map((t) => t.dueAt);
  assert.equal(new Set(dues).size, dues.length, 'no two occurrences share a due time');
  const spawned = all.filter((t) => t.id !== root.id);
  assert.ok(spawned.every((t) => t.recurrenceParentId === root.id && t.source.channel === 'recurring'));
  const last = all.filter((t) => t.status !== 'done');
  assert.equal(last.length, 1);
  const p2 = new Date(last[0]!.dueAt!);
  assert.equal(p2.getUTCHours(), 12, 'keeps the local time of day');
});

test('recurrence: weekly by weekday, until, and late completion skips missed occurrences', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const mon = Date.UTC(2026, 9, 12, 10, 0);
  const t = await env.s.tasks.create(team.ownerA, { title: 'Mon/Thu', dueAt: mon, recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 4] } });
  await env.s.tasks.complete(team.ownerA, t.id);
  const next = env.db.tasks.query(team.owner.orgId, { recurrenceParentId: t.id })[0]!;
  assert.equal(new Date(next.dueAt!).getUTCDay(), 4, 'Thursday');
  env.clock.set(next.dueAt! + 10 * DAY); // complete very late
  await env.s.tasks.complete(team.ownerA, next.id);
  const after = env.db.tasks.query(team.owner.orgId, { recurrenceParentId: t.id, open: true })[0]!;
  assert.ok(after.dueAt! > env.clock.now, 'missed occurrences are skipped, next is in the future');
  const u = await env.s.tasks.create(team.ownerA, { title: 'Ends', dueAt: T0, recurrence: { freq: 'daily', interval: 1, until: T0 + HOUR } });
  env.clock.set(T0 + MIN);
  await env.s.tasks.complete(team.ownerA, u.id);
  assert.equal(env.db.tasks.query(team.owner.orgId, { recurrenceParentId: u.id }).length, 0, 'series ended');
});

test('waiting-on: auto-nudge via WhatsApp with activity log; manual nudge; unconfigured channel errors', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const t = await env.s.tasks.create(team.ownerA, {
    title: 'Signed contract', waitingOn: { name: 'Raj Mehta', contact: '+1 555 123 4567', channel: 'whatsapp', nudgeEveryHours: 24 },
  });
  assert.equal(t.waitingOn!.contact, '+15551234567');
  env.clock.set(T0 + 23 * HOUR);
  await env.tick();
  assert.equal(env.out.to('+15551234567').length, 0);
  env.clock.set(T0 + 24 * HOUR);
  await env.tick();
  const sent = env.out.to('+15551234567');
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.text, /Hi Raj, a friendly reminder from Acme about: "Signed contract"/);
  const after = await env.s.tasks.get(team.ownerA, t.id);
  assert.equal(after.waitingOn!.lastNudgedAt, T0 + 24 * HOUR);
  assert.ok((await env.s.tasks.activity(team.ownerA, t.id)).some((a) => a.kind === 'nudge_sent'));
  env.clock.set(T0 + 48 * HOUR);
  await env.tick();
  assert.equal(env.out.to('+15551234567').length, 2, 'nudges again after the interval');
  await env.s.tasks.nudge(team.ownerA, t.id);
  assert.equal(env.out.to('+15551234567').length, 3);
  assert.match(env.out.to('+15551234567')[2]!.text, /Shrijeet Owner \(Acme\)/);
  env.out.configured.whatsapp = false;
  await assert.rejects(env.s.tasks.nudge(team.ownerA, t.id), (e: any) => e.code === 'bad_request' && /not configured/.test(e.message));
});

test('failed jobs retry with exponential backoff, then give up after 5 attempts', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  env.out.configured.whatsapp = false;
  const t = await env.s.tasks.create(team.ownerA, { title: 'x', waitingOn: { name: 'Raj', contact: '+15551234567', channel: 'whatsapp', nudgeEveryHours: 1 } });
  env.clock.set(T0 + HOUR);
  await env.tick();
  const job = () => env.db.jobs.list(team.owner.orgId, { kind: 'task.nudge' })[0]!;
  assert.equal(job().status, 'pending');
  assert.equal(job().attempts, 1);
  assert.equal(job().runAt, T0 + HOUR + 30_000);
  await advance(env, DAY, MIN);
  assert.equal(job().status, 'failed');
  assert.equal(job().attempts, 5);
  assert.match(job().lastError!, /not configured/);
  assert.ok(t);
});

test('restart persistence: scheduled reminders survive close + reopen; interrupted jobs recover', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-restart-'));
  try {
    const path = join(dir, 'cb.sqlite');
    const clock = new FakeClock();
    const env1 = makeEnv({ db: openDatabase(path, { secret: 's' }), clock });
    const team = await bootstrap(env1);
    const t = await env1.s.tasks.create(team.ownerA, { title: 'Survive restart', dueAt: T0 + 2 * HOUR });
    env1.db.jobs.schedule(team.owner.orgId, 'task.recur', 'task.recur:ghost', T0, { taskId: 'ghost' }, T0);
    env1.db.jobs.claimDue(T0); // simulate a crash mid-job: left 'running'
    await env1.core.scheduler.stop();
    env1.db.close();

    clock.set(T0 + 2 * HOUR + MIN);
    const env2 = makeEnv({ db: openDatabase(path, { secret: 's' }), clock, out: new FakeOutbound() });
    assert.equal(env2.db.jobs.list(team.owner.orgId, { status: 'running' }).length, 0, 'running jobs recovered');
    await env2.tick();
    const ns = await env2.s.notifications.list(team.ownerA);
    assert.ok(ns.some((n) => n.kind === 'task_due_now' && n.taskId === t.id));
    assert.ok(ns.some((n) => n.kind === 'task_due_soon' && n.taskId === t.id));
    env2.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('meeting reminders, daily digest (self-rescheduling), push gone-cleanup', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: p, a: pA } = await team.add('Priya');
  await env.s.meetings.create(team.ownerA, { title: 'Design review', startAt: T0 + HOUR, endAt: T0 + 2 * HOUR, attendeeIds: [p.id] });
  env.clock.set(T0 + 50 * MIN);
  await env.tick();
  const mn = (await env.s.notifications.list(pA))[0]!;
  assert.equal(mn.kind, 'meeting_soon');
  assert.equal(mn.title, 'Meeting at 10 AM: Design review');
  assert.ok((await kinds(env, team.ownerA)).includes('meeting_soon'));

  await env.s.members.update(team.ownerA, team.owner.id, { prefs: { digestHour: 8 } });
  await env.s.notifications.subscribePush(team.ownerA, { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc', keys: { p256dh: 'k', auth: 'a' } }, 'ua');
  env.out.goneEndpoints.add('https://updates.push.services.mozilla.com/wpush/v2/abc');
  env.clock.set(Date.UTC(2026, 9, 13, 8, 0));
  await env.tick();
  const digest = (await env.s.notifications.list(team.ownerA)).find((n) => n.kind === 'digest')!;
  assert.match(digest.title, /Good morning, Commander Shrijeet/);
  assert.equal(env.db.push.list(team.owner.orgId, team.owner.id).length, 0, 'gone subscription removed');
  const pending = env.db.jobs.list(team.owner.orgId, { status: 'pending', kind: 'member.digest' });
  assert.equal(pending.length, 1);
  assert.equal(pending[0]!.runAt, Date.UTC(2026, 9, 14, 8, 0), 'next digest tomorrow');
});

test('agent stale scan notifies the supervisor once per quiet period', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: bot, a: botA } = await team.addAgent('Claude');
  const t = await env.s.tasks.create(team.ownerA, { title: 'Draft blog post', assigneeIds: [bot.id] });
  await env.s.tasks.update(botA, t.id, { status: 'in_progress' });
  await advance(env, 5 * HOUR, 15 * MIN);
  const stale = () => env.s.notifications.list(team.ownerA, { limit: 100 }).then((ns) => ns.filter((n) => n.kind === 'agent_stale'));
  assert.equal((await stale()).length, 1);
  assert.match((await stale())[0]!.title, /Claude went quiet on "Draft blog post"/);
  assert.equal((await env.s.tasks.get(team.ownerA, t.id)).isStale, true);
  await advance(env, 5 * HOUR, 15 * MIN);
  assert.equal((await stale()).length, 1, 'not repeated for the same quiet period');
  await env.s.tasks.comment(botA, t.id, 'Progress: outline done');
  assert.equal((await env.s.tasks.get(team.ownerA, t.id)).isStale, false);
  await advance(env, 5 * HOUR, 15 * MIN);
  assert.equal((await stale()).length, 2, 'flags again after a new quiet period');
  assert.ok((await env.s.notifications.list(botA)).every((n) => n.kind !== 'agent_stale'), 'stale notices go to the supervisor, not the agent');
});

test('calendar feeds: encrypted URL, sync creates/updates/removes meetings, periodic re-sync', async () => {
  let events = [
    { uid: 'a', title: 'Standup', startAt: T0 + HOUR, endAt: T0 + 2 * HOUR, allDay: false, location: null, url: null, notes: '' },
    { uid: 'b', title: 'Lunch', startAt: T0 + 4 * HOUR, endAt: T0 + 5 * HOUR, allDay: false, location: 'Cafe', url: null, notes: '' },
  ];
  const calendar: CalendarFetcher = { fetch: async () => events };
  const env = makeEnv({ calendar });
  const team = await bootstrap(env);
  const f = await env.s.meetings.addFeed(team.ownerA, { name: 'Google', url: 'webcal://calendar.google.com/private-abc123/basic.ics' });
  assert.ok(!f.urlMasked.includes('private-abc123'));
  await env.tick();
  let ms = await env.s.meetings.list(team.ownerA, { from: T0, to: T0 + DAY });
  assert.deepEqual(ms.map((m) => m.title), ['Standup', 'Lunch']);
  events = [{ ...events[0]!, title: 'Standup (moved)' }];
  env.clock.advance(15 * MIN);
  await env.tick();
  ms = await env.s.meetings.list(team.ownerA, { from: T0, to: T0 + DAY });
  assert.deepEqual(ms.map((m) => m.title), ['Standup (moved)']);
  assert.ok((await env.s.meetings.listFeeds(team.ownerA))[0]!.lastSyncAt);
  const failing = makeEnv();
  const t2 = await bootstrap(failing);
  const f2 = await failing.s.meetings.addFeed(t2.ownerA, { name: 'x', url: 'https://example.com/a.ics' });
  await assert.rejects(failing.s.meetings.syncFeed(t2.ownerA, f2.id), /calendar fetch not configured/);
  assert.match((await failing.s.meetings.listFeeds(t2.ownerA))[0]!.lastError!, /not configured/);
});
