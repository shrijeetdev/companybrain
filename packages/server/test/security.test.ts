// Regression tests for the v2 security audit (server package).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify from 'fastify';
import { normalizeTrustProxy } from '../src/server';
import { redactUrl } from '../src/http';
import { MAX_STREAMS_PER_MEMBER, registerStream } from '../src/routes/stream';
import type { ServerDeps } from '../src/types';
import { harness, until } from './helpers';

// ─── H1: trustProxy + login brute force ─────────────────────────────────────

test('H1: trustProxy=true means ONE hop — rotating X-Forwarded-For cannot dodge the login limiter', async () => {
  const h = await harness({ config: { trustProxy: true } });
  const statuses: number[] = [];
  for (let i = 0; i < 40; i++) {
    const r = await h.app.inject({
      method: 'POST', url: '/api/auth/login', payload: { identifier: 'owner@example.com', password: `guess-${i}` },
      // What nginx's $proxy_add_x_forwarded_for produces when the client sends its own XFF.
      headers: { 'x-forwarded-for': `10.9.${i >> 8}.${i & 255}, 203.0.113.7` },
    });
    statuses.push(r.statusCode);
  }
  assert.equal(statuses.indexOf(429), 10, `per-IP+identifier limit keys on the proxy-reported client: ${JSON.stringify(statuses)}`);
  await h.app.close();
});

test('H1: per-account login limit ignores the client IP (30 / 15 min)', async () => {
  const h = await harness({ config: { trustProxy: true } });
  for (let i = 0; i < 30; i++) {
    const r = await h.app.inject({
      method: 'POST', url: '/api/auth/login',
      // Every attempt from a genuinely different client (one trusted hop, rotating real IPs).
      headers: { 'x-forwarded-for': `10.20.${i >> 8}.${i & 255}` },
      payload: { identifier: i % 2 ? ' OWNER@example.com ' : 'owner@example.com', password: 'wrong' },
    });
    assert.equal(r.statusCode, 401, `attempt ${i + 1}`);
  }
  const blocked = await h.app.inject({
    method: 'POST', url: '/api/auth/login', headers: { 'x-forwarded-for': '10.99.0.1' },
    payload: { identifier: 'Owner@Example.com', password: 'correct horse battery' },
  });
  assert.equal(blocked.statusCode, 429);
  // Other accounts are unaffected.
  const other = await h.app.inject({
    method: 'POST', url: '/api/auth/login', headers: { 'x-forwarded-for': '10.99.0.1' },
    payload: { identifier: 'member@example.com', password: 'correct horse battery' },
  });
  assert.equal(other.statusCode, 200);
  await h.app.close();
});

// ─── M2: SSE after revocation + per-member cap ──────────────────────────────

function sse(port: number, headers: Record<string, string>) {
  return new Promise<{ status: number; chunks: string[]; ended: () => boolean; close: () => void }>((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/stream', headers }, (res) => {
      const chunks: string[] = [];
      let ended = false;
      res.setEncoding('utf8');
      res.on('data', (c: string) => chunks.push(c));
      res.on('end', () => (ended = true));
      res.on('close', () => (ended = true));
      resolve({ status: res.statusCode!, chunks, ended: () => ended, close: () => req.destroy() });
    });
    req.on('error', reject);
  });
}

test('M2: an open SSE stream stops as soon as its session or API key is revoked', async () => {
  const h = await harness();
  await h.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (h.app.server.address() as AddressInfo).port;
  const { owner, regular } = h.fake.members;

  const cookie = h.cookie('regular');
  const s = await sse(port, { cookie });
  assert.equal(s.status, 200);
  const bearer = h.bearer('regular');
  const k = await sse(port, { authorization: bearer });
  assert.equal(k.status, 200);
  await until(() => h.fake.subscriberCount() === 2);

  h.fake.services.live.publish(owner.orgId, { type: 'task.deleted', taskId: 'task_before01' });
  await until(() => s.chunks.join('').includes('task_before01') && k.chunks.join('').includes('task_before01'));

  // Password change / logout / deactivation: the session is gone.
  h.fake.sessions.delete(cookie.slice('cb_session='.length));
  // Key revoked.
  for (const { key } of h.fake.keys.values()) if (key.memberId === regular.id) key.revokedAt = Date.now();
  h.fake.services.live.publish(owner.orgId, { type: 'task.deleted', taskId: 'task_LEAKED01' });
  await until(() => s.ended() && k.ended());
  assert.ok(!s.chunks.join('').includes('task_LEAKED01'), 'revoked session got nothing more');
  assert.ok(!k.chunks.join('').includes('task_LEAKED01'), 'revoked key got nothing more');
  await until(() => h.fake.subscriberCount() === 0);
  await h.app.close();
});

test('M2: SSE re-validates the credential on every ping (no event needed)', async () => {
  const app = Fastify();
  app.decorateRequest('actor', null);
  app.decorateRequest('sessionToken', null);
  const actor = { orgId: 'org_a', memberId: 'mem_a', role: 'member' as const, kind: 'human' as const, via: 'session' as const };
  app.addHook('onRequest', async (req) => {
    req.actor = actor;
    req.sessionToken = 'tok';
  });
  let valid = true;
  let checks = 0;
  const deps = {
    services: {
      auth: { resolveSession: async () => (checks++, valid ? actor : null), resolveApiKey: async () => null },
      live: { subscribe: () => () => {}, publish() {} },
    },
  } as unknown as ServerDeps;
  registerStream(app, deps, { pingMs: 20 });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const s = await sse((app.server.address() as AddressInfo).port, {});
  await until(() => checks >= 2);
  assert.equal(s.ended(), false);
  valid = false;
  await until(() => s.ended(), 1000);
  await app.close();
});

test('M2: at most 5 concurrent streams per member — a new one closes the oldest', async () => {
  const h = await harness();
  await h.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (h.app.server.address() as AddressInfo).port;
  const cookie = h.cookie('regular');
  const streams: Awaited<ReturnType<typeof sse>>[] = [];
  for (let i = 0; i < 7; i++) {
    streams.push(await sse(port, { cookie }));
    await until(() => h.fake.subscriberCount() === Math.min(i + 1, MAX_STREAMS_PER_MEMBER));
  }
  await until(() => streams[0]!.ended() && streams[1]!.ended());
  assert.equal(streams.filter((s) => !s.ended()).length, 5);
  assert.match(streams[0]!.chunks.join(''), /retry: 60000/, 'evicted stream is told to back off');
  // Another member is unaffected by this member's cap.
  const other = await sse(port, { cookie: h.cookie('owner') });
  await until(() => h.fake.subscriberCount() === 6);
  assert.equal(other.ended(), false);
  for (const s of [...streams, other]) s.close();
  await h.app.close();
});

// ─── M4: OAuth open redirect ────────────────────────────────────────────────

test('M4: /oauth/authorize never redirects on a validation error (audit repro); approve validation errors are 400s', async () => {
  const h = await harness();
  // An attacker registers a client for their own site (DCR is open)…
  const reg = await h.app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: 'Claude', redirect_uris: ['https://evil.example/cb'] } });
  const cid = JSON.parse(reg.body).client_id as string;
  // …and links victims to an authorize URL that fails validation.
  for (const qs of [
    `client_id=${encodeURIComponent(cid)}&response_type=token`,
    `client_id=${encodeURIComponent(cid)}&response_type=code`,
    `client_id=${encodeURIComponent(cid)}&response_type=code&code_challenge=${'a'.repeat(43)}&code_challenge_method=plain`,
    `client_id=${encodeURIComponent(cid)}&response_type=code&redirect_uri=${encodeURIComponent('https://evil.example/cb2')}`,
    `client_id=garbage&redirect_uri=${encodeURIComponent('https://evil.example/cb')}`,
    `client_id=${encodeURIComponent(cid)}&response_type=token&state=${encodeURIComponent('<script>alert(1)</script>')}&error_description=${encodeURIComponent('<img src=x onerror=alert(1)>')}`,
  ]) {
    const r = await h.app.inject({ method: 'GET', url: `/oauth/authorize?${qs}` });
    assert.equal(r.statusCode, 400, qs);
    assert.equal(r.headers.location, undefined, `no redirect for ${qs}`);
    assert.match(String(r.headers['content-type']), /^text\/html/);
    assert.ok(!r.body.includes('evil.example') && !r.body.includes('<script>') && !r.body.includes('<img'), 'nothing reflected unescaped');
    assert.match(String(r.headers['content-security-policy']), /default-src 'none'/);
  }
  // Consent API: a bad query is a 400, not a redirectTo.
  const bad = await h.app.inject({
    method: 'POST', url: '/api/oauth/approve', headers: { cookie: h.cookie(), 'x-cb-client': 'web' },
    payload: { query: { client_id: cid, response_type: 'token' }, scopes: ['read'], actAs: h.fake.members.owner.id, approve: false },
  });
  assert.equal(bad.statusCode, 400);
  assert.equal(JSON.parse(bad.body).redirectTo, undefined);
  await h.app.close();
});

// ─── L2: TTS abuse ──────────────────────────────────────────────────────────

test('L2: briefing audio — human sessions only, 20 syntheses/hour per member, 10-minute per-text cache', async () => {
  let t = Date.UTC(2026, 9, 12, 9);
  const h = await harness({ clock: () => t, tts: { synthesize: async (text) => ({ audio: Buffer.from(`AUDIO:${text}`), mime: 'audio/mpeg' }) } });
  const post = (headers: Record<string, string>, text: string) => h.app.inject({ method: 'POST', url: '/api/briefing/audio', headers, payload: { text } });
  const web = { cookie: h.cookie('regular'), 'x-cb-client': 'web' };

  assert.equal((await post({ authorization: h.bearer('regular') }, 'hi')).statusCode, 403, 'API keys cannot spend TTS');
  assert.equal((await post({ authorization: h.bearer('agent') }, 'hi')).statusCode, 403, 'agents cannot');
  const guest = await h.fake.services.members.create(h.fake.actorFor(h.fake.members.owner, 'session'), { kind: 'human', role: 'guest', name: 'Gus', email: 'gus@example.com', password: 'long enough pw' });
  assert.equal((await post({ cookie: `cb_session=${h.fake.sessionFor(guest)}`, 'x-cb-client': 'web' }, 'hi')).statusCode, 403, 'guests cannot');
  assert.equal(h.ttsCalls.length, 0);

  // Same text again within 10 minutes → served from cache.
  assert.equal((await post(web, 'Good morning')).body, 'AUDIO:Good morning');
  assert.equal((await post(web, 'Good morning')).body, 'AUDIO:Good morning');
  assert.equal(h.ttsCalls.length, 1);
  t += 11 * 60_000;
  await post(web, 'Good morning');
  assert.equal(h.ttsCalls.length, 2, 'cache expires after 10 min');

  for (let i = 0; i < 18; i++) assert.equal((await post(web, `text ${i}`)).statusCode, 200);
  const limited = await post(web, 'one too many');
  assert.equal(limited.statusCode, 429);
  assert.ok(Number(limited.headers['retry-after']) > 0);
  assert.equal(h.ttsCalls.length, 20);
  // Other members have their own budget; the window slides.
  assert.equal((await post({ cookie: h.cookie('owner'), 'x-cb-client': 'web' }, 'hi')).statusCode, 200);
  t += 60 * 60_000;
  assert.equal((await post(web, 'later')).statusCode, 200);
  await h.app.close();
});

// ─── L6: webhook secret in the query string is never logged ─────────────────

test('L6: ?secret= (and encoded variants) are redacted by the request log serializer', async () => {
  assert.equal(redactUrl('/webhooks/email?secret=s3cret&a=b'), '/webhooks/email?secret=[REDACTED]&a=b');
  assert.equal(redactUrl('/webhooks/email?a=b&%73ecret=s3cret'), '/webhooks/email?a=b&%73ecret=[REDACTED]');
  assert.equal(redactUrl('/webhooks/email?SECRET=s3cret'), '/webhooks/email?SECRET=[REDACTED]');
  assert.equal(redactUrl('/webhooks/whatsapp?hub.verify_token=v&hub.challenge=1'), '/webhooks/whatsapp?hub.verify_token=[REDACTED]&hub.challenge=1');
  assert.equal(redactUrl('/oauth/authorize?client_id=x&state=y'), '/oauth/authorize?client_id=x&state=y');

  // The logger the server actually uses applies it.
  const h = await harness({ config: { emailWebhookSecret: 'email-hook-secret' }, integrations: { parseEmailWebhook: () => null } });
  const sym = Object.getOwnPropertySymbols(h.app.log).find((s) => s.description === 'pino.serializers')!;
  const serializers = (h.app.log as unknown as Record<symbol, { req(r: unknown): { url: string } }>)[sym]!;
  const out = serializers.req({ method: 'POST', url: '/webhooks/email?secret=email-hook-secret', ip: '1.2.3.4', headers: {} });
  assert.equal(out.url, '/webhooks/email?secret=[REDACTED]');
  // And the secret still works in the query string (some providers can't send headers).
  const r = await h.app.inject({ method: 'POST', url: '/webhooks/email?secret=email-hook-secret', payload: { from: 'a@b.co', subject: 's', text: 't' } });
  assert.equal(r.statusCode, 200);
  await h.app.close();
});

test('H1: normalizeTrustProxy never passes Fastify trust-everything `true`', () => {
  assert.equal(normalizeTrustProxy(true), 1);
  assert.equal(normalizeTrustProxy(false), false);
  assert.equal(normalizeTrustProxy(2), 2);
  assert.equal(normalizeTrustProxy('10.0.0.0/8,127.0.0.1'), '10.0.0.0/8,127.0.0.1');
});
