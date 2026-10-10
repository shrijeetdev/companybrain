// Regression tests for the v2 security audit (core package).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { InboundMessage } from '@companybrain/types';
import { T0, bootstrap, makeEnv } from './helpers.ts';
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
