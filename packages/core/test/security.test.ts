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
