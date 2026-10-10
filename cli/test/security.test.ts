// Cross-package regression tests for the v2 security audit, against the real assembled app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Outbound } from '@companybrain/types';
import { createApp, parseTrustProxy, type App } from '../src/app';
import { backupTo, KEY_FILES } from '../src/backup';

const PW = 'Sup3r-secret!';
const EMAIL_SECRET = 'email-hook-secret';

interface Booted {
  app: App;
  B: string;
  dataDir: string;
  sent: { channel: string; to: string; text: string }[];
  stop(): Promise<void>;
}

async function boot(env: Record<string, string> = {}): Promise<Booted> {
  const dataDir = mkdtempSync(join(tmpdir(), 'cb-sec-'));
  const sent: Booted['sent'] = [];
  const outbound: Outbound = {
    async whatsapp(to, text) { sent.push({ channel: 'whatsapp', to, text }); return true; },
    async email(to, subject, text) { sent.push({ channel: 'email', to, text: `${subject}\n${text}` }); return true; },
    async push() { return 'sent'; },
    status: () => ({ whatsapp: true, email: true, push: true }),
  };
  const app = await createApp({
    env: { EMAIL_WEBHOOK_SECRET: EMAIL_SECRET, COMPANYBRAIN_LOG_LEVEL: 'silent', ...env },
    dbPath: join(dataDir, 'cb.sqlite'), dataDir, webDir: null, outbound,
    log: { info() {}, warn() {}, error() {} },
  });
  await app.server.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.server.address();
  const B = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  return { app, B, dataDir, sent, stop: async () => { await app.stop(); rmSync(dataDir, { recursive: true, force: true }); } };
}

async function call(B: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (body !== undefined) h['content-type'] ??= 'application/json';
  if (h.cookie && method !== 'GET') h['x-cb-client'] = 'web';
  const res = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

async function setup(B: string): Promise<string> {
  const r = await fetch(B + '/api/auth/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orgName: 'OrgA', name: 'Owner A', email: 'owner@a.test', password: PW, timezone: 'UTC' }) });
  return r.headers.get('set-cookie')!.split(';')[0]!;
}

const until = async (fn: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

// ─── H1 ─────────────────────────────────────────────────────────────────────

test('H1: COMPANYBRAIN_TRUST_PROXY parsing — true is one hop, never trust-all', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('true'), 1);
  assert.equal(parseTrustProxy('TRUE'), 1);
  assert.equal(parseTrustProxy('2'), 2);
  assert.equal(parseTrustProxy('10.0.0.0/8, 127.0.0.1'), '10.0.0.0/8,127.0.0.1');
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  assert.throws(() => parseTrustProxy('yes please'), /COMPANYBRAIN_TRUST_PROXY/);
});

test('H1: with COMPANYBRAIN_TRUST_PROXY=true, rotating X-Forwarded-For still gets 429 on one account (audit xff.ts)', async () => {
  const s = await boot({ COMPANYBRAIN_TRUST_PROXY: 'true' });
  try {
    await setup(s.B);
    const tally: Record<number, number> = {};
    for (let i = 0; i < 40; i++) {
      const r = await call(s.B, 'POST', '/api/auth/login', { identifier: 'owner@a.test', password: `guess-${i}` }, { 'x-forwarded-for': `10.9.${i >> 8}.${i & 255}, 203.0.113.7` });
      tally[r.status] = (tally[r.status] ?? 0) + 1;
    }
    assert.ok((tally[429] ?? 0) >= 25, JSON.stringify(tally));
    const r = await call(s.B, 'POST', '/api/auth/login', { identifier: 'owner@a.test', password: PW }, { 'x-forwarded-for': '10.99.0.1, 203.0.113.7' });
    assert.equal(r.status, 429);
  } finally {
    await s.stop();
  }
});

// ─── H3 ─────────────────────────────────────────────────────────────────────

const AR_PASS = 'mx.example.net; dkim=pass header.d=a.test; spf=pass smtp.mailfrom=member@a.test; dmarc=pass header.from=a.test';

test('H3: email webhook — a spoofed From lands in the Inbox; a provider-verified one becomes the member\'s task', async () => {
  const s = await boot();
  try {
    const owner = await setup(s.B);
    const mem = (await call(s.B, 'POST', '/api/members', { kind: 'human', role: 'member', name: 'Member A', email: 'member@a.test', password: PW }, { cookie: owner })).json;
    const hook = (body: unknown) => call(s.B, 'POST', '/webhooks/email', body, { 'x-cb-webhook-secret': EMAIL_SECRET });

    // Spoofed: "list" from the member's address, no provider verdict.
    assert.equal((await hook({ From: 'member@a.test', Subject: '', TextBody: 'list', MessageID: 'spoof-1' })).status, 200);
    await until(() => s.app.db.inbox.list(mem.orgId).length === 1);
    const item = s.app.db.inbox.list(mem.orgId)[0]!;
    assert.equal(item.memberId, null);
    assert.match(item.suggestion!.notes!, /Sender not verified/);
    assert.equal(s.sent.filter((x) => x.to === 'member@a.test').length, 0, 'no task list mailed to the spoofed address');

    // Verified by the provider (Postmark headers carry Authentication-Results).
    await hook({ From: 'member@a.test', Subject: 'Renew domain', TextBody: 'Please renew', MessageID: 'real-1', Headers: [{ Name: 'Authentication-Results', Value: AR_PASS }] });
    await until(() => s.app.db.inbox.list(mem.orgId).length === 2);
    const tasks = (await call(s.B, 'GET', `/api/tasks?assigneeId=${mem.id}`, undefined, { cookie: owner })).json;
    assert.ok(tasks.some((t: any) => t.title === 'Renew domain'));
  } finally {
    await s.stop();
  }
});

test('H3: EMAIL_AUTHSERV_ID pins the verifier; EMAIL_TRUST_UNVERIFIED_SENDERS=true is the (unsafe) escape hatch', async () => {
  const pinned = await boot({ EMAIL_AUTHSERV_ID: 'mx.google.com' });
  try {
    const owner = await setup(pinned.B);
    const mem = (await call(pinned.B, 'POST', '/api/members', { kind: 'human', role: 'member', name: 'Member A', email: 'member@a.test', password: PW }, { cookie: owner })).json;
    await call(pinned.B, 'POST', '/webhooks/email', { From: 'member@a.test', Subject: 'X', TextBody: 'x', MessageID: 'p-1', Headers: [{ Name: 'Authentication-Results', Value: AR_PASS }] }, { 'x-cb-webhook-secret': EMAIL_SECRET });
    await until(() => pinned.app.db.inbox.list(mem.orgId).length === 1);
    assert.equal(pinned.app.db.inbox.list(mem.orgId)[0]!.memberId, null, 'header from another authserv-id is ignored');
  } finally {
    await pinned.stop();
  }
  const open = await boot({ EMAIL_TRUST_UNVERIFIED_SENDERS: 'true' });
  try {
    const owner = await setup(open.B);
    const mem = (await call(open.B, 'POST', '/api/members', { kind: 'human', role: 'member', name: 'Member A', email: 'member@a.test', password: PW }, { cookie: owner })).json;
    await call(open.B, 'POST', '/webhooks/email', { From: 'member@a.test', Subject: 'Y', TextBody: 'y', MessageID: 'o-1' }, { 'x-cb-webhook-secret': EMAIL_SECRET });
    await until(() => open.app.db.inbox.list(mem.orgId).length === 1);
    assert.equal(open.app.db.inbox.list(mem.orgId)[0]!.memberId, mem.id);
  } finally {
    await open.stop();
  }
});

// ─── M2 ─────────────────────────────────────────────────────────────────────

test('M2: a deactivated member\'s open SSE stream is closed before it can receive anything (audit sse.ts)', async () => {
  const s = await boot();
  try {
    const owner = await setup(s.B);
    const mem = (await call(s.B, 'POST', '/api/members', { kind: 'human', role: 'member', name: 'Member A', email: 'member@a.test', password: PW }, { cookie: owner })).json;
    const login = await fetch(s.B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'member@a.test', password: PW }) });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const proj = (await call(s.B, 'POST', '/api/projects', { name: 'Shared', memberIds: [mem.id] }, { cookie: owner })).json;
    const chunks: string[] = [];
    const u = new URL(s.B + '/api/stream');
    const req = http.get({ host: u.hostname, port: u.port, path: u.pathname, headers: { cookie } }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (d: string) => chunks.push(d));
    });
    await until(() => chunks.length > 0);
    assert.equal((await call(s.B, 'DELETE', `/api/members/${mem.id}`, undefined, { cookie: owner })).status, 204);
    await call(s.B, 'POST', '/api/tasks', { title: 'CONFIDENTIAL layoff list', projectId: proj.id }, { cookie: owner });
    await call(s.B, 'PATCH', `/api/members/${mem.id}`, { title: 'post-deactivation update' }, { cookie: owner });
    await new Promise((r) => setTimeout(r, 300));
    const text = chunks.join('');
    assert.ok(!text.includes('CONFIDENTIAL') && !text.includes('post-deactivation'), text);
    req.destroy();
  } finally {
    await s.stop();
  }
});

// ─── L7 ─────────────────────────────────────────────────────────────────────

test('L7: `companybrain backup --without-keys` leaves the key files out', async () => {
  const s = await boot();
  const out = mkdtempSync(join(tmpdir(), 'cb-bak-'));
  try {
    await setup(s.B);
    writeFileSync(join(s.dataDir, 'secret.key'), 'k'.repeat(64));
    const dbPath = join(s.dataDir, 'cb.sqlite');
    const full = await backupTo(dbPath, s.dataDir, out, { now: new Date(Date.UTC(2026, 0, 1)) });
    for (const f of ['secret.key', 'signing.key', 'vapid.json']) assert.ok(existsSync(join(full.dir, f)), `${f} in a full backup`);
    const lean = await backupTo(dbPath, s.dataDir, out, { withoutKeys: true, now: new Date(Date.UTC(2026, 0, 2)) });
    assert.deepEqual(readdirSync(lean.dir), ['companybrain.sqlite']);
    assert.ok(KEY_FILES.every((f) => !existsSync(join(lean.dir, f))));
  } finally {
    rmSync(out, { recursive: true, force: true });
    await s.stop();
  }
});
