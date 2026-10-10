// Regression tests for the v2 security audit (core package).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { InboundMessage } from '@companybrain/types';
import { DAY, HOUR, T0, bootstrap, makeEnv } from './helpers.ts';
import { UNVERIFIED_NOTE } from '../src/services/inbox.ts';

let seq = 0;
const email = (from: string, text: string, extra: Partial<InboundMessage> = {}): InboundMessage => ({
  channel: 'email', from, fromName: null, subject: null, text, externalId: `<sec-${++seq}@mail>`, receivedAt: T0, ...extra,
});

// ─── H3: email sender spoofing ──────────────────────────────────────────────

test('H3: an unauthenticated email is never matched to a member — it lands in the Inbox, flagged', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya } = await team.add('Priya', 'member', { email: 'priya@acme.io' });
  const orgId = team.owner.orgId;
  await env.s.org.update(team.ownerA, { intakeAutoAck: true });

  for (const authenticated of [undefined, false]) {
    const r = await env.s.inbox.ingest(orgId, email('priya@acme.io', 'Wire $40k to account 1234', { subject: 'Urgent payment', authenticated }));
    assert.equal(r.task, null, 'no task created as the member');
    assert.equal(r.item!.memberId, null, 'not matched to the member');
    assert.equal(r.item!.status, 'new');
    assert.ok(r.item!.suggestion!.notes!.startsWith(UNVERIFIED_NOTE), 'flagged "sender not verified"');
    assert.equal(r.reply, null, 'no auto-ack to a possibly spoofed address');
  }
  const ntf = await env.s.notifications.list(team.ownerA);
  assert.match(ntf[0]!.title, /sender not verified/);
  assert.equal((await env.s.tasks.list(team.ownerA, { assigneeId: priya.id })).length, 0);

  // Converting keeps the warning in the task notes.
  const items = await env.s.inbox.list(team.ownerA, { status: 'new' });
  const task = await env.s.inbox.convert(team.ownerA, items[0]!.id);
  assert.match(task.notes, /Sender not verified/);

  // The same email, authenticated, is the member's.
  const ok = await env.s.inbox.ingest(orgId, email('priya@acme.io', 'Renew the domain', { subject: 'Renew domain', authenticated: true }));
  assert.ok(ok.task);
  assert.deepEqual(ok.task!.assigneeIds, [priya.id]);
});

test('H3: email commands (list, done N) are only honoured from authenticated senders; WhatsApp counts as verified', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya, a: priyaA } = await team.add('Priya', 'member', { email: 'priya@acme.io', phone: '+919876543210' });
  const orgId = team.owner.orgId;
  await env.s.tasks.create(priyaA, { title: 'Secret board prep', assigneeIds: [priya.id] });

  const spoofList = await env.s.inbox.ingest(orgId, email('priya@acme.io', 'list'));
  assert.equal(spoofList.reply, null, 'no task list mailed to an unverified sender');
  assert.equal(spoofList.item!.memberId, null);

  const realList = await env.s.inbox.ingest(orgId, email('priya@acme.io', 'list', { authenticated: true }));
  assert.match(realList.reply!, /Secret board prep/);

  const spoofDone = await env.s.inbox.ingest(orgId, email('priya@acme.io', 'done 1'));
  assert.equal(spoofDone.reply, null);
  assert.equal((await env.s.tasks.list(priyaA, { assigneeId: 'me' }))[0]!.status, 'todo', 'spoofed "done 1" did nothing');

  const wa = await env.s.inbox.ingest(orgId, { channel: 'whatsapp', from: '919876543210', fromName: null, subject: null, text: 'done 1', externalId: 'wamid.sec1', receivedAt: T0 });
  assert.match(wa.reply!, /Done: "Secret board prep"/, 'WhatsApp senders are verified by WhatsApp');
});

// ─── M1: Web Push SSRF ──────────────────────────────────────────────────────

test('M1: push subscriptions only accept known push-service endpoints', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { a: pA, m: p } = await team.add('Priya');
  const keys = { p256dh: 'k', auth: 'a' };
  for (const endpoint of [
    'https://127.0.0.1:8443/admin/reset', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://169.254.169.254/latest/meta-data',
    'http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com:8443/fcm/send/x', 'https://evil.example/x',
    'https://fcm.googleapis.com.evil.example/x', 'https://notify.windows.com/x', 'https://user:pw@fcm.googleapis.com/x',
  ]) {
    await assert.rejects(env.s.notifications.subscribePush(pA, { endpoint, keys }, 'ua'), (e: any) => e.code === 'bad_request', endpoint);
  }
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/abc', 'https://android.googleapis.com/gcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QF0x', 'https://wns2-par02p.notify.windows.com/w/?token=abc', 'https://fcm.googleapis.com:443/fcm/send/def',
  ]) {
    await env.s.notifications.subscribePush(pA, { endpoint, keys }, 'ua');
  }
  assert.equal(env.db.push.list(p.orgId, p.id).length, 6);

  // A bad endpoint already stored (e.g. before this fix) is dropped, never contacted.
  env.db.push.upsert(p.orgId, p.id, { endpoint: 'https://127.0.0.1:9/internal', keys }, 'ua', T0);
  assert.deepEqual(await env.s.notifications.sendTest(pA, 'push'), { ok: true });
  assert.ok(!env.out.sent.some((s) => s.to.includes('127.0.0.1')), 'no request to the internal URL');
  assert.ok(!env.db.push.list(p.orgId, p.id).some((s) => s.endpoint.includes('127.0.0.1')), 'bad subscription deleted');
});

// ─── M2: member.upserted live events carry no PII ───────────────────────────

test('M2: member.upserted is a public projection for everyone but the member', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya, a: priyaA } = await team.add('Priya', 'member', { email: 'priya@acme.io' });
  const { m: max } = await team.add('Max');
  const seen: Record<string, any[]> = { priya: [], max: [] };
  const un1 = env.s.live.subscribe(priya.orgId, priya.id, (e) => e.type === 'member.upserted' && seen.priya!.push(e.member));
  const un2 = env.s.live.subscribe(max.orgId, max.id, (e) => e.type === 'member.upserted' && seen.max!.push(e.member));
  await env.s.members.update(priyaA, priya.id, { phone: '+14155550123', prefs: { quietStart: 21 } });
  un1();
  un2();
  assert.equal(seen.max!.length, 1);
  const pub = seen.max![0]!;
  assert.equal(pub.id, priya.id);
  assert.equal(pub.email, null);
  assert.equal(pub.phone, null);
  assert.notEqual(pub.prefs.quietStart, 21, 'prefs not leaked');
  assert.equal(seen.priya!.length, 1);
  assert.equal(seen.priya![0]!.phone, '+14155550123', 'the member gets their own full record');
});

// ─── M3: nudge abuse ────────────────────────────────────────────────────────

test('M3: nudges use a fixed template — title capped at 120 chars, links stripped', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { a: pA } = await team.add('Priya');
  const title = 'URGENT: your account is locked, verify at https://evil.example/login or www.evil.example or evil.example/x now ' + 'x'.repeat(200);
  const t = await env.s.tasks.create(pA, { title, waitingOn: { name: 'https://evil.example Victim', contact: '+15551234567', channel: 'whatsapp', nudgeEveryHours: null } });
  await env.s.tasks.nudge(pA, t.id);
  const msg = env.out.to('+15551234567')[0]!.text;
  assert.match(msg, /^Hi there, a friendly follow-up from Acme about: "URGENT: your account is locked, verify at or or now x+…" — reply here if you have an update\.$/);
  assert.ok(!/evil|https?:|www\./i.test(msg), msg);
  const quoted = /about: "(.*)" — reply/.exec(msg)![1]!;
  assert.ok(quoted.length <= 120, `title ${quoted.length} chars`);
  await env.s.tasks.update(pA, t.id, { waitingOn: { name: 'Raj', contact: 'raj@client.io', channel: 'email', nudgeEveryHours: null } });
  env.clock.advance(4 * HOUR);
  await env.s.tasks.nudge(pA, t.id);
  assert.ok(!/evil/.test(env.out.to('raj@client.io')[0]!.subject!), 'email subject sanitized too');
});

test('M3: per-task cooldown (manual 4 h; scheduled ≥ 4 h even if set lower)', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { a: pA } = await team.add('Priya');
  const t = await env.s.tasks.create(pA, { title: 'Contract', waitingOn: { name: 'Raj', contact: '+15551234567', channel: 'whatsapp', nudgeEveryHours: 1 } });
  assert.equal(t.waitingOn!.nudgeEveryHours, 4, 'interval floored at 4 h');
  await env.s.tasks.nudge(pA, t.id);
  for (const dt of [0, HOUR, 3 * HOUR + 59 * 60_000]) {
    env.clock.set(T0 + dt);
    await assert.rejects(env.s.tasks.nudge(pA, t.id), (e: any) => e.code === 'rate_limited');
  }
  // The scheduler doesn't fire before 4 h either.
  env.clock.set(T0 + 3 * HOUR);
  await env.tick();
  assert.equal(env.out.to('+15551234567').length, 1);
  env.clock.set(T0 + 4 * HOUR);
  await env.tick();
  assert.equal(env.out.to('+15551234567').length, 2, 'scheduled nudge after 4 h');
});

test('M3: daily caps — 20 nudges per member, 200 per org; scheduled nudges wait instead of failing', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: p, a: pA } = await team.add('Priya');
  const { a: maxA } = await team.add('Max');
  const mk = (a: typeof pA, i: number) => env.s.tasks.create(a, { title: `T${i}`, waitingOn: { name: 'Raj', contact: `+1555000${String(i).padStart(4, '0')}`, channel: 'whatsapp', nudgeEveryHours: null } });
  for (let i = 0; i < 20; i++) await env.s.tasks.nudge(pA, (await mk(pA, i)).id);
  const extra = await mk(pA, 20);
  await assert.rejects(env.s.tasks.nudge(pA, extra.id), (e: any) => e.code === 'rate_limited' && /Daily nudge limit/.test(e.message));
  // Max has his own quota.
  await env.s.tasks.nudge(maxA, (await mk(maxA, 21)).id);
  // Org-wide cap.
  env.db.kv.set(p.orgId, 'nudge:quota:org', { day: Math.floor(env.clock.now / DAY), n: 200 }, env.clock.now);
  await assert.rejects(env.s.tasks.nudge(maxA, (await mk(maxA, 22)).id), (e: any) => e.code === 'rate_limited' && /organization/.test(e.message));
  // A scheduled nudge over the cap is re-planned for the next day, not failed.
  const sched = await env.s.tasks.create(pA, { title: 'Sched', waitingOn: { name: 'Raj', contact: '+15559999999', channel: 'whatsapp', nudgeEveryHours: 4 } });
  env.clock.advance(4 * HOUR);
  await env.tick();
  assert.equal(env.out.to('+15559999999').length, 0);
  const job = env.db.jobs.list(p.orgId, { kind: 'task.nudge', status: 'pending' }).find((j) => j.payload.taskId === sched.id)!;
  assert.equal(job.runAt, (Math.floor(env.clock.now / DAY) + 1) * DAY);
  // Next day: quotas reset.
  env.clock.set(job.runAt);
  await env.tick();
  assert.equal(env.out.to('+15559999999').length, 1);
  await env.s.tasks.nudge(pA, extra.id);
});

test('M3: only members (not agents, guests or read-only keys) can set a waiting-on contact', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { a: pA } = await team.add('Priya');
  const { a: botA } = await team.addAgent('Claude');
  const { a: guestA } = await team.add('Gus', 'guest');
  const w = { name: 'Raj', contact: '+15551234567', channel: 'whatsapp' as const, nudgeEveryHours: null };
  await assert.rejects(env.s.tasks.create(botA, { title: 'x', waitingOn: w }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.tasks.create(guestA, { title: 'x', waitingOn: w }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.tasks.create({ ...pA, via: 'api_key', scopes: ['read'] }, { title: 'x', waitingOn: w }), (e: any) => e.code === 'forbidden');
  // Agents can still record who a task waits on (no contact), and members can add the contact.
  const t = await env.s.tasks.create(botA, { title: 'Waiting', waitingOn: { name: 'Raj', contact: null, channel: 'other', nudgeEveryHours: null } });
  await assert.rejects(env.s.tasks.update(botA, t.id, { waitingOn: w }), (e: any) => e.code === 'forbidden');
  const t2 = await env.s.tasks.create(pA, { title: 'ok', waitingOn: w });
  assert.equal(t2.waitingOn!.contact, '+15551234567');
});

// ─── M5: WhatsApp sender matching ───────────────────────────────────────────

test('M5: member phones are stored as E.164 and WhatsApp senders match on all digits only', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya } = await team.add('Priya', 'member', { phone: '0091 98765 43210' });
  assert.equal(priya.phone, '+919876543210', '00 prefix normalized to +');
  for (const bad of ['9876543210', '98765 43210', '+0123456789', '+1234567', '+1234567890123456']) {
    await assert.rejects(env.s.members.update(team.ownerA, priya.id, { phone: bad }), (e: any) => e.code === 'bad_request', bad);
  }
  const orgId = team.owner.orgId;
  const wa = (from: string) => env.s.inbox.ingest(orgId, { channel: 'whatsapp', from, fromName: null, subject: null, text: 'Buy ink', externalId: `wamid.${++seq}`, receivedAt: T0 });
  const spoof = await wa('19876543210'); // same last 10 digits, US number
  assert.equal(spoof.item!.memberId, null);
  assert.equal(spoof.task, null);
  const real = await wa('919876543210');
  assert.equal(real.item!.memberId, priya.id);
  assert.ok(real.task);
});

// ─── L1: read-only keys ─────────────────────────────────────────────────────

test('L1: a read-only API key cannot mark notifications read', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: p, a: pA } = await team.add('Priya');
  await env.s.notifications.notify(p.orgId, p.id, { kind: 'system', title: 'Hello', body: 'b', taskId: null, meetingId: null, link: null, urgent: false });
  const ro = { ...pA, via: 'api_key' as const, scopes: ['read' as const] };
  await assert.rejects(env.s.notifications.markRead(ro, 'all'), (e: any) => e.code === 'forbidden');
  assert.equal(await env.s.notifications.unreadCount(pA), 1);
  await env.s.notifications.markRead({ ...ro, scopes: ['read', 'write'] }, 'all');
  assert.equal(await env.s.notifications.unreadCount(pA), 0);
});
