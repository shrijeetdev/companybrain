// Regression tests for the v2 security audit (server package).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrustProxy } from '../src/server';
import { harness } from './helpers';

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

test('H1: normalizeTrustProxy never passes Fastify trust-everything `true`', () => {
  assert.equal(normalizeTrustProxy(true), 1);
  assert.equal(normalizeTrustProxy(false), false);
  assert.equal(normalizeTrustProxy(2), 2);
  assert.equal(normalizeTrustProxy('10.0.0.0/8,127.0.0.1'), '10.0.0.0/8,127.0.0.1');
});
