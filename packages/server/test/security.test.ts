// Regression tests for the v2 security audit (server package).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify from 'fastify';
import { normalizeTrustProxy } from '../src/server';
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

test('H1: normalizeTrustProxy never passes Fastify trust-everything `true`', () => {
  assert.equal(normalizeTrustProxy(true), 1);
  assert.equal(normalizeTrustProxy(false), false);
  assert.equal(normalizeTrustProxy(2), 2);
  assert.equal(normalizeTrustProxy('10.0.0.0/8,127.0.0.1'), '10.0.0.0/8,127.0.0.1');
});
