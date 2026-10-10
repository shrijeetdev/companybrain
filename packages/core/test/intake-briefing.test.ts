import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { InboundMessage, Llm } from '@companybrain/types';
import { zonedToUtc } from '@companybrain/db';
import { DAY, HOUR, T0, bootstrap, makeEnv } from './helpers.ts';

let n = 0;
const wa = (from: string, text: string, extra: Partial<InboundMessage> = {}): InboundMessage => ({
  channel: 'whatsapp', from, fromName: null, subject: null, text, externalId: `wamid.${++n}`, receivedAt: T0, ...extra,
});

test('intake: team member WhatsApp → task + confirmation; idempotent; list / done / help commands', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya, a: priyaA } = await team.add('Priya', 'member', { phone: '+91 98765 43210' });
  const orgId = team.owner.orgId;

  const msg = wa('919876543210', 'Buy printer ink');
  const r = await env.s.inbox.ingest(orgId, msg);
  assert.ok(r.task);
  assert.match(r.task!.title, /Buy printer ink/);
  assert.deepEqual(r.task!.assigneeIds, [priya.id]);
  assert.equal(r.task!.source.channel, 'whatsapp');
  assert.equal(r.task!.source.from, '919876543210');
  assert.match(r.reply!, /^✅ Added: "Buy printer ink/);
  assert.equal(r.item!.status, 'converted');

  const dup = await env.s.inbox.ingest(orgId, { ...msg });
  assert.equal(dup.task, null);
  assert.equal(dup.reply, null);
  assert.equal((await env.s.tasks.list(priyaA)).length, 1, 'no duplicate task');

  await env.s.tasks.create(team.ownerA, { title: 'Call the bank', assigneeIds: [priya.id], dueAt: T0 - HOUR });
  const list = await env.s.inbox.ingest(orgId, wa('+919876543210', 'list'));
  assert.equal(list.task, null);
  assert.match(list.reply!, /Your open tasks:\n1\. Call the bank — OVERDUE/);
  assert.match(list.reply!, /2\. Buy printer ink/);
  const done = await env.s.inbox.ingest(orgId, wa('+919876543210', 'done 1'));
  assert.match(done.reply!, /Done: "Call the bank"/);
  assert.equal((await env.s.tasks.list(priyaA)).length, 1);
  assert.match((await env.s.inbox.ingest(orgId, wa('+919876543210', 'done 9'))).reply!, /don't have that number/);
  assert.match((await env.s.inbox.ingest(orgId, wa('+919876543210', 'help'))).reply!, /Commands/);
  assert.equal((await env.s.inbox.list(team.ownerA, { status: 'new' })).length, 0, 'member messages do not clutter the inbox');
});

test('intake: unknown sender → inbox item with suggestion + owner notification; auto-ack; email match; never throws', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya } = await team.add('Priya', 'member', { email: 'priya@acme.io' });
  const { a: memA } = await team.add('Max');
  const orgId = team.owner.orgId;

  const r = await env.s.inbox.ingest(orgId, wa('+15550009999', 'Hi, can you send me a quote for 50 chairs?', { fromName: 'Dana Client' }));
  assert.equal(r.task, null);
  assert.equal(r.reply, null, 'no auto-ack by default');
  assert.equal(r.item!.status, 'new');
  assert.match(r.item!.suggestion!.title, /quote for 50 chairs/);
  const owners = await env.s.notifications.list(team.ownerA);
  assert.equal(owners[0]!.kind, 'intake_new');
  assert.match(owners[0]!.title, /New WhatsApp from Dana Client/);
  await assert.rejects(env.s.inbox.list(memA), (e: any) => e.code === 'forbidden');

  await env.s.org.update(team.ownerA, { intakeAutoAck: true });
  const ack = await env.s.inbox.ingest(orgId, wa('+15550009999', 'Also tables', { fromName: 'Dana Client' }));
  assert.match(ack.reply!, /Thanks, Dana — we received your message/);

  const em = await env.s.inbox.ingest(orgId, { channel: 'email', from: 'Priya <PRIYA@ACME.IO>', fromName: 'Priya', subject: 'Renew domain', text: 'The domain expires soon.\nPlease renew.', externalId: '<m1@mail>', receivedAt: T0, authenticated: true });
  assert.ok(em.task);
  assert.equal(em.task!.title, 'Renew domain');
  assert.match(em.task!.notes, /expires soon/);
  assert.deepEqual(em.task!.assigneeIds, [priya.id]);

  // convert + dismiss + undo dismiss
  const items = await env.s.inbox.list(team.ownerA, { status: 'new' });
  assert.equal(items.length, 2);
  const task = await env.s.inbox.convert(team.ownerA, items[1]!.id, { priority: 'high' });
  assert.equal(task.priority, 'high');
  assert.equal(task.source.channel, 'whatsapp');
  await assert.rejects(env.s.inbox.convert(team.ownerA, items[1]!.id), (e: any) => e.code === 'conflict');
  await env.s.inbox.dismiss(team.ownerA, items[0]!.id);
  assert.equal((await env.s.inbox.list(team.ownerA, { status: 'new' })).length, 0);
  const ev = (await env.s.audit.list(team.ownerA, { entity: 'inbox' })).find((e) => e.type === 'inbox.dismissed')!;
  await env.s.audit.undo(team.ownerA, ev.id);
  assert.equal((await env.s.inbox.list(team.ownerA, { status: 'new' })).length, 1);

  // bad input never throws
  assert.deepEqual(await env.s.inbox.ingest(orgId, {} as InboundMessage), { item: null, task: null, reply: null });
  assert.deepEqual(await env.s.inbox.ingest(orgId, null as unknown as InboundMessage), { item: null, task: null, reply: null });
  assert.deepEqual(await env.s.inbox.ingest('org_doesnotexist', wa('+1', 'x')), { item: null, task: null, reply: null });
  assert.deepEqual(await env.s.inbox.ingest(orgId, wa('+15550009999', '   ')), { item: null, task: null, reply: null });
});

test('intake uses llm.extractTask first and falls back to the parser on failure', async () => {
  const calls: string[] = [];
  const llm: Llm = {
    async extractTask(input) {
      calls.push(input.text);
      if (input.text.includes('explode')) throw new Error('LLM down');
      return { title: 'Book flights to Delhi', dueAt: input.now + DAY, priority: 'high' };
    },
    async polishBriefing({ script }) {
      return script;
    },
  };
  const env = makeEnv({ llm });
  const team = await bootstrap(env);
  await team.add('Priya', 'member', { phone: '+15551112222' });
  const r = await env.s.inbox.ingest(team.owner.orgId, wa('+15551112222', 'pls book flights to delhi for tmrw, important'));
  assert.equal(r.task!.title, 'Book flights to Delhi');
  assert.equal(r.task!.priority, 'high');
  assert.equal(r.task!.dueAt, T0 + DAY);
  const r2 = await env.s.inbox.ingest(team.owner.orgId, wa('+15551112222', 'this will explode'));
  assert.match(r2.task!.title, /this will explode/i);
  assert.equal(calls.length, 2);
});

test('briefing for a member: greeting in their tz, overdue first, today, meetings in spoken time, waiting-on; classic voice', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: p, a: pA } = await team.add('Priya Shah', 'member', { timezone: 'Asia/Kolkata' });
  await env.s.members.update(pA, p.id, { prefs: { theme: 'classic' } });
  // T0 = 09:00 UTC = 14:30 IST
  await env.s.tasks.create(team.ownerA, { title: 'Acme proposal', assigneeIds: [p.id], dueAt: T0 - DAY });
  await env.s.tasks.create(team.ownerA, { title: 'Pay invoices', assigneeIds: [p.id], dueAt: T0 + 2 * HOUR, priority: 'high' });
  await env.s.tasks.create(team.ownerA, { title: 'Update website', assigneeIds: [p.id], dueAt: T0 + 3 * HOUR });
  await env.s.tasks.create(team.ownerA, { title: 'Next week thing', assigneeIds: [p.id], dueAt: T0 + 3 * DAY });
  await env.s.tasks.create(pA, { title: 'Signed NDA', waitingOn: { name: 'Raj', contact: null, channel: 'other', nudgeEveryHours: null } });
  await env.s.meetings.create(team.ownerA, { title: 'Sync with Raj', startAt: zonedToUtc(2026, 10, 12, 15, 0, 'Asia/Kolkata'), endAt: zonedToUtc(2026, 10, 12, 16, 0, 'Asia/Kolkata'), attendeeIds: [p.id] });

  const b = await env.s.briefing.get(pA);
  assert.equal(b.greeting, 'Good afternoon, Priya');
  assert.equal(b.myTasks.overdue.length, 1);
  assert.deepEqual(b.myTasks.today.map((t) => t.title), ['Pay invoices', 'Update website'], 'priority first');
  assert.deepEqual(b.myTasks.upcoming.map((t) => t.title), ['Next week thing']);
  assert.equal(b.meetings.length, 1);
  assert.equal(b.waitingOn.length, 1);
  assert.deepEqual(b.team, []);
  assert.match(b.spoken, /^Good afternoon, Priya\. One task is overdue: "Acme proposal"\./);
  assert.match(b.spoken, /You have 2 tasks due today: "Pay invoices" and "Update website"\./);
  assert.match(b.spoken, /You have a meeting: Sync with Raj at 3 PM\./);
  assert.match(b.spoken, /waiting on Raj for "Signed NDA"/);
  assert.equal(b.headline, '1 overdue · 2 tasks due today · 1 meeting · waiting on 1');
  assert.ok(b.spoken.split(/\s+/).length <= 125);

  const again = await env.s.briefing.get(pA);
  assert.equal(again.generatedAt, b.generatedAt, 'cached');
  env.clock.advance(61_000);
  assert.notEqual((await env.s.briefing.get(pA)).generatedAt, b.generatedAt, 'cache expires after 60s');
});

test('briefing for a manager: tactical voice, team summary, AI agents working / stale; llm polish with fallback', async () => {
  let polishFails = false;
  const llm: Llm = {
    async extractTask() {
      return null;
    },
    async polishBriefing({ script }) {
      if (polishFails) throw new Error('nope');
      return `POLISHED: ${script}`;
    },
  };
  const env = makeEnv({ llm });
  const team = await bootstrap(env);
  const { m: priya, a: priyaA } = await team.add('Priya');
  const { m: bot, a: botA } = await team.addAgent('Claude');
  const { m: cursor, a: cursorA } = await team.addAgent('Cursor');
  const proj = await env.s.projects.create(team.ownerA, { name: 'Blog' });
  const t1 = await env.s.tasks.create(team.ownerA, { title: 'Draft blog post', assigneeIds: [bot.id], projectId: proj.id });
  await env.s.tasks.update(botA, t1.id, { status: 'in_progress' });
  const t2 = await env.s.tasks.create(team.ownerA, { title: 'Fix login bug', assigneeIds: [cursor.id], projectId: proj.id });
  await env.s.tasks.update(cursorA, t2.id, { status: 'in_progress' });
  for (let i = 0; i < 3; i++) {
    const t = await env.s.tasks.create(priyaA, { title: `Done ${i}` });
    await env.s.tasks.complete(priyaA, t.id);
  }
  await env.s.tasks.create(team.ownerA, { title: 'Open overdue', assigneeIds: [priya.id], dueAt: T0 - HOUR });
  env.clock.advance(5 * HOUR); // agents go quiet (stale after 240 min)
  await env.s.tasks.comment(botA, t1.id, 'still drafting');

  const b = await env.s.briefing.get(team.ownerA);
  assert.match(b.greeting, /^Good afternoon, Commander Shrijeet$/);
  assert.match(b.spoken, /^POLISHED: Good afternoon, Commander Shrijeet\. Mission briefing for today:/);
  assert.match(b.spoken, /Across the squad, 1 mission is open, 1 overdue, and 3 finished today\./);
  assert.match(b.spoken, /Priya has closed 3 missions this week\./);
  assert.match(b.spoken, /Claude is working on "Draft blog post"/);
  assert.match(b.spoken, /Heads up: Cursor has gone quiet on "Fix login bug"/);
  assert.ok(b.team.some((p) => p.member.id === priya.id && p.doneToday === 3 && p.overdue === 1));
  const agentRow = b.agents.find((a) => a.member.id === cursor.id)!;
  assert.equal(agentRow.stale.length, 1);

  polishFails = true;
  env.clock.advance(61_000);
  const fb = await env.s.briefing.get(team.ownerA);
  assert.match(fb.spoken, /^Good afternoon, Commander Shrijeet\./, 'deterministic fallback');
  assert.match(fb.headline, /missions? due today|overdue|All clear/);
});
