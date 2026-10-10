import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { InboundMessage } from '@companybrain/types';
import { harness, json, until } from './helpers';

function sseConnect(port: number, headers: Record<string, string>) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; chunks: string[]; close: () => void; res: http.IncomingMessage }>((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/stream', headers }, (res) => {
      const chunks: string[] = [];
      res.setEncoding('utf8');
      res.on('data', (c: string) => chunks.push(c));
      resolve({ status: res.statusCode!, headers: res.headers, chunks, res, close: () => req.destroy() });
    });
    req.on('error', reject);
  });
}

test('SSE stream: authenticated, delivers published events, cleans up on close', async () => {
  const h = await harness();
  await h.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (h.app.server.address() as AddressInfo).port;

  const anon = await sseConnect(port, {});
  assert.equal(anon.status, 401);
  anon.close();

  const s = await sseConnect(port, { cookie: h.cookie(), accept: 'text/event-stream' });
  assert.equal(s.status, 200);
  assert.match(String(s.headers['content-type']), /^text\/event-stream/);
  assert.equal(s.headers['x-accel-buffering'], 'no');
  assert.match(String(s.headers['cache-control']), /no-cache/);
  await until(() => h.fake.subscriberCount() === 1);

  const { owner } = h.fake.members;
  h.fake.services.live.publish(owner.orgId, { type: 'task.deleted', taskId: 'task_abcdef12' });
  h.fake.services.live.publish('org_otherorg1', { type: 'task.deleted', taskId: 'task_LEAKED01' });
  await until(() => s.chunks.join('').includes('task_abcdef12'));
  const text = s.chunks.join('');
  assert.match(text, /data: \{"type":"ping","at":\d+\}\n\n/);
  assert.match(text, /data: \{"type":"task\.deleted","taskId":"task_abcdef12"\}\n\n/);
  assert.ok(!text.includes('task_LEAKED01'), 'other org events never delivered');

  s.close();
  await until(() => h.fake.subscriberCount() === 0);
  await h.app.close();
});

test('MCP: 401 + WWW-Authenticate without a valid key; handler gets the actor', async () => {
  const h = await harness();
  for (const req of [
    { method: 'POST' as const, url: '/mcp' },
    { method: 'POST' as const, url: '/mcp', headers: { authorization: 'Bearer cb_live_wrong' } },
    { method: 'GET' as const, url: '/mcp/k/cb_live_wrong' },
    { method: 'POST' as const, url: '/mcp', headers: { cookie: h.cookie() } }, // cookies are not accepted for MCP
  ]) {
    const r = await h.app.inject({ ...req, payload: req.method === 'POST' ? { jsonrpc: '2.0', id: 1, method: 'tools/list' } : undefined });
    assert.equal(r.statusCode, 401, JSON.stringify(req));
    assert.equal(json(r).jsonrpc, '2.0');
    assert.equal(json(r).error.code, -32001);
    assert.equal(r.headers['www-authenticate'], 'Bearer resource_metadata="http://localhost:80/.well-known/oauth-protected-resource"');
  }
  assert.equal(h.mcpCalls.length, 0);

  const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  const r1 = await h.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: h.bearer('agent') }, payload: body });
  assert.equal(r1.statusCode, 200);
  assert.equal(json(r1).result.member, h.fake.members.agent.id);
  assert.equal(h.mcpCalls[0]!.actor.memberId, h.fake.members.agent.id);
  assert.equal(h.mcpCalls[0]!.actor.via, 'api_key');
  assert.deepEqual(h.mcpCalls[0]!.body, body);

  const raw = h.bearer('regular').slice('Bearer '.length);
  const r2 = await h.app.inject({ method: 'POST', url: `/mcp/k/${raw}`, payload: body });
  assert.equal(r2.statusCode, 200);
  assert.equal(h.mcpCalls[1]!.actor.memberId, h.fake.members.regular.id);
  const r3 = await h.app.inject({ method: 'DELETE', url: `/mcp/k/${raw}` });
  assert.equal(r3.statusCode, 200);
  assert.equal(h.mcpCalls[2]!.method, 'DELETE');
  await h.app.close();

  const pub = await harness({ config: { publicUrl: 'https://brain.acme.com' } });
  const r4 = await pub.app.inject({ method: 'POST', url: '/mcp', payload: body });
  assert.equal(r4.headers['www-authenticate'], 'Bearer resource_metadata="https://brain.acme.com/.well-known/oauth-protected-resource"');
  await pub.app.close();
});

test('MCP: handler failure → JSON-RPC 500, server keeps running', async () => {
  const h = await harness({ mcp: { handleHttp: async () => { throw new Error('boom'); } } });
  const r = await h.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: h.bearer() }, payload: {} });
  assert.equal(r.statusCode, 500);
  assert.equal(json(r).error.code, -32603);
  assert.equal((await h.app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
  await h.app.close();
});

const APP_SECRET = 'meta-app-secret';
const waMsg: InboundMessage = { channel: 'whatsapp', from: '+15550001111', fromName: 'Raj', subject: null, text: 'buy milk', externalId: 'wamid.1', receivedAt: 1 };
const whatsappWebhook = {
  verifyChallenge: (q: Record<string, string>) => (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === 'vt' ? q['hub.challenge'] ?? null : null),
  verifySignature: (raw: Buffer, sig: string | undefined) =>
    !!sig && sig === `sha256=${createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`,
  parse: (body: unknown) => ((body as { entry?: unknown[] }).entry ? [waMsg] : []),
};

test('WhatsApp webhook: challenge, signature required (401), dispatches inbound', async () => {
  const h = await harness({ integrations: { whatsappWebhook } });
  const ok = await h.app.inject({ method: 'GET', url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=12345' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body, '12345');
  const no = await h.app.inject({ method: 'GET', url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1' });
  assert.equal(no.statusCode, 403);

  const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{}] });
  const sig = `sha256=${createHmac('sha256', APP_SECRET).update(payload).digest('hex')}`;
  for (const headers of [{}, { 'x-hub-signature-256': 'sha256=deadbeef' }, { 'x-hub-signature-256': sig.replace(/.$/, '0') }]) {
    const r = await h.app.inject({ method: 'POST', url: '/webhooks/whatsapp', headers: { 'content-type': 'application/json', ...headers }, body: payload });
    assert.equal(r.statusCode, 401);
    assert.equal(json(r).error.code, 'unauthorized');
  }
  // Signature over different bytes (re-serialised JSON) must fail.
  const reformatted = JSON.stringify(JSON.parse(payload), null, 2);
  const r0 = await h.app.inject({ method: 'POST', url: '/webhooks/whatsapp', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: reformatted });
  assert.equal(r0.statusCode, 401);
  assert.equal(h.inbound.length, 0);

  const good = await h.app.inject({ method: 'POST', url: '/webhooks/whatsapp', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: payload });
  assert.equal(good.statusCode, 200);
  await until(() => h.inbound.length === 1);
  assert.deepEqual(h.inbound[0], waMsg);
  await h.app.close();

  const off = await harness();
  const r = await off.app.inject({ method: 'POST', url: '/webhooks/whatsapp', headers: { 'content-type': 'application/json' }, body: payload });
  assert.equal(r.statusCode, 404);
  await off.app.close();
});

test('email webhook: shared secret required (header or ?secret=), constant-time; fails closed', async () => {
  const emailMsg: InboundMessage = { channel: 'email', from: 'raj@acme.com', fromName: null, subject: 'Hi', text: 'do the thing', externalId: '<m1>', receivedAt: 1 };
  const parseEmailWebhook = (b: unknown) => ((b as { From?: string }).From ? emailMsg : null);
  const h = await harness({ config: { emailWebhookSecret: 's3cret-value' }, integrations: { parseEmailWebhook } });
  const body = { From: 'raj@acme.com', Subject: 'Hi', TextBody: 'do the thing' };
  for (const req of [
    { url: '/webhooks/email' },
    { url: '/webhooks/email?secret=wrong' },
    { url: '/webhooks/email', headers: { 'x-cb-webhook-secret': 's3cret-valuE' } },
    { url: '/webhooks/email', headers: { 'x-cb-webhook-secret': 's3cret-value-and-more' } },
  ]) {
    const r = await h.app.inject({ method: 'POST', ...req, payload: body });
    assert.equal(r.statusCode, 401, JSON.stringify(req));
    assert.equal(json(r).error.code, 'unauthorized');
  }
  assert.equal(h.inbound.length, 0);
  const a = await h.app.inject({ method: 'POST', url: '/webhooks/email', headers: { 'x-cb-webhook-secret': 's3cret-value' }, payload: body });
  assert.equal(a.statusCode, 200);
  const b = await h.app.inject({
    method: 'POST', url: '/webhooks/email?secret=s3cret-value',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'From=raj%40acme.com&Subject=Hi',
  });
  assert.equal(b.statusCode, 200);
  await until(() => h.inbound.length === 2);
  const ignored = await h.app.inject({ method: 'POST', url: '/webhooks/email?secret=s3cret-value', payload: { nothing: true } });
  assert.deepEqual(json(ignored), { ok: true, ignored: true });
  await h.app.close();

  const off = await harness({ integrations: { parseEmailWebhook } });
  const r = await off.app.inject({ method: 'POST', url: '/webhooks/email?secret=', payload: body });
  assert.equal(r.statusCode, 404, 'no secret configured → disabled');
  await off.app.close();
});
