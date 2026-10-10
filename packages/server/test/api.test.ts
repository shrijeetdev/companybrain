import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { InjectOptions } from 'fastify';
import { harness, json, WEB } from './helpers';
import { redactUrl } from '../src/http';

test('task CRUD round-trip through the services', async () => {
  const h = await harness();
  const headers = { authorization: h.bearer() };
  const created = await h.app.inject({
    method: 'POST', url: '/api/tasks', headers,
    payload: { title: 'Send Acme proposal', priority: 'high', tags: ['sales'], subtasks: [{ title: 'draft' }], waitingOn: { name: 'Raj' } },
  });
  assert.equal(created.statusCode, 200, created.body);
  const t = json(created);
  assert.equal(t.title, 'Send Acme proposal');
  assert.equal(t.subtasks.length, 1);
  assert.equal(t.waitingOn.channel, 'other', 'zod defaults applied');

  const list = await h.app.inject({ method: 'GET', url: '/api/tasks?status=todo,in_progress&limit=10&includeDone=1', headers });
  assert.equal(json(list).length, 1);
  const q = h.fake.calls.find((c) => c.method === 'tasks.list')!.args[0] as Record<string, unknown>;
  assert.deepEqual(q, { status: ['todo', 'in_progress'], limit: 10, includeDone: true });

  const patched = await h.app.inject({ method: 'PATCH', url: `/api/tasks/${t.id}`, headers, payload: { status: 'in_progress' } });
  assert.equal(json(patched).status, 'in_progress');
  const sub = t.subtasks[0].id;
  const subRes = await h.app.inject({ method: 'PATCH', url: `/api/tasks/${t.id}/subtasks/${sub}`, headers, payload: { done: true } });
  assert.equal(json(subRes).subtasks[0].done, true);
  const comment = await h.app.inject({ method: 'POST', url: `/api/tasks/${t.id}/comments`, headers, payload: { text: 'on it', kind: 'handoff' } });
  assert.equal(json(comment).kind, 'handoff');
  const acts = await h.app.inject({ method: 'GET', url: `/api/tasks/${t.id}/activity`, headers });
  assert.equal(json(acts).length, 1);
  const quick = await h.app.inject({ method: 'POST', url: '/api/tasks/quick', headers, payload: { text: 'Call Raj tomorrow @priya' } });
  assert.equal(json(quick).title, 'Call Raj tomorrow');
  const bulk = await h.app.inject({ method: 'POST', url: '/api/tasks/bulk', headers, payload: { ids: [t.id, 'task_missing1'], op: { kind: 'complete' } } });
  assert.deepEqual(json(bulk).ok, [t.id]);
  assert.equal(json(bulk).failed.length, 1);

  const del = await h.app.inject({ method: 'DELETE', url: `/api/tasks/${t.id}`, headers });
  assert.equal(del.statusCode, 204);
  assert.equal(del.body, '');
  const gone = await h.app.inject({ method: 'GET', url: `/api/tasks/${t.id}`, headers });
  assert.equal(gone.statusCode, 404);
  assert.deepEqual(json(gone), { error: { code: 'not_found', message: 'Task not found' } });
  await h.app.close();
});

test('empty JSON bodies on POST are accepted as {}', async () => {
  const h = await harness();
  const headers = { authorization: h.bearer() };
  const t = json(await h.app.inject({ method: 'POST', url: '/api/tasks', headers, payload: { title: 'x' } }));
  for (const extra of [{ 'content-type': 'application/json' }, {}, { 'content-type': 'application/json; charset=utf-8' }]) {
    const res = await h.app.inject({ method: 'POST', url: `/api/tasks/${t.id}/complete`, headers: { ...headers, ...extra }, body: '' });
    assert.equal(res.statusCode, 200, `${JSON.stringify(extra)}: ${res.body}`);
    assert.equal(json(res).status, 'done');
  }
  const cookie = h.cookie();
  const lo = await h.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie, ...WEB, 'content-type': 'application/json' }, body: '' });
  assert.equal(lo.statusCode, 200);
  await h.app.close();
});

test('validation errors → 400 in the standard error shape', async () => {
  const h = await harness();
  const headers = { authorization: h.bearer() };
  const cases: { method: 'GET' | 'POST' | 'PATCH'; url: string; payload?: unknown; body?: string; ct?: string }[] = [
    { method: 'GET', url: '/api/tasks/not-an-id' },
    { method: 'GET', url: '/api/tasks/task_abc' }, // too short
    { method: 'GET', url: '/api/tasks?status=bogus' },
    { method: 'GET', url: '/api/tasks?limit=0' },
    { method: 'GET', url: '/api/search' },
    { method: 'POST', url: '/api/tasks', payload: {} },
    { method: 'POST', url: '/api/tasks', payload: { title: 'x', priority: 'extreme' } },
    { method: 'POST', url: '/api/tasks', payload: { title: 'x', assigneeIds: ['../etc'] } },
    { method: 'PATCH', url: '/api/me', payload: { role: 'owner' } }, // privilege escalation attempt
    { method: 'PATCH', url: '/api/tasks/task_abcdef12', payload: { orgId: 'org_evil0001' } },
    { method: 'POST', url: '/api/tasks', body: '{"title": ', ct: 'application/json' },
    { method: 'POST', url: '/api/tasks', body: '{"__proto__": {"x": 1}, "title": "x"}', ct: 'application/json' },
    { method: 'POST', url: '/api/meetings', payload: { title: 'm', startAt: 10, endAt: 5 } },
    { method: 'POST', url: '/api/keys', payload: { memberId: 'mem_owner0001', name: 'k', scopes: ['admin'] } },
    { method: 'POST', url: '/api/calendar-feeds', payload: { name: 'x', url: 'file:///etc/passwd' } },
  ];
  for (const c of cases) {
    const res = await h.app.inject({
      method: c.method, url: c.url,
      headers: { ...headers, ...(c.ct ? { 'content-type': c.ct } : {}) },
      ...(c.body !== undefined ? { body: c.body } : c.payload !== undefined ? { payload: c.payload as object } : {}),
    });
    assert.equal(res.statusCode, 400, `${c.method} ${c.url} ${c.body ?? JSON.stringify(c.payload)} → ${res.statusCode} ${res.body}`);
    const b = json(res);
    assert.equal(b.error.code, 'bad_request');
    assert.equal(typeof b.error.message, 'string');
  }
  const zodErr = json(await h.app.inject({ method: 'POST', url: '/api/tasks', headers, payload: { title: 'x', priority: 'extreme' } }));
  assert.equal(zodErr.error.details.issues[0].path, 'priority');
  // Unsupported media type, still the standard shape.
  const form = await h.app.inject({ method: 'POST', url: '/api/tasks', headers: { ...headers, 'content-type': 'text/plain' }, body: 'title=x' });
  assert.equal(form.statusCode, 415);
  assert.equal(json(form).error.code, 'bad_request');
  assert.equal(h.fake.members.owner.role, 'owner');
  await h.app.close();
});

test('body limit is 1 MB → 413', async () => {
  const h = await harness();
  const res = await h.app.inject({ method: 'POST', url: '/api/tasks', headers: { authorization: h.bearer() }, payload: { title: 'x', notes: 'a'.repeat(1_100_000) } });
  assert.equal(res.statusCode, 413);
  assert.equal(json(res).error.code, 'bad_request');
  await h.app.close();
});

test('AppError codes map to HTTP statuses; unknown errors → generic 500', async () => {
  const h = await harness();
  const headers = { authorization: h.bearer() };
  const regular = { authorization: h.bearer('regular') };
  const expect = async (req: InjectOptions, status: number, code: string) => {
    const res = await h.app.inject(req);
    assert.equal(res.statusCode, status, `${JSON.stringify(req)} → ${res.body}`);
    assert.equal(json(res).error.code, code);
    return json(res);
  };
  await expect({ method: 'GET', url: '/api/projects/proj_abcdef12', headers }, 404, 'not_found');
  await expect({ method: 'PATCH', url: '/api/org', headers: regular, payload: { name: 'x' } }, 403, 'forbidden');
  await expect({ method: 'POST', url: '/api/audit/audit_abcdef12/undo', headers }, 409, 'conflict');
  await expect({ method: 'POST', url: '/api/calendar-feeds', headers, payload: { name: 'x', url: 'https://cal.example.com/a.ics' } }, 400, 'bad_request');
  const boom = await expect({ method: 'POST', url: '/api/leads', headers, payload: { name: 'Acme' } }, 500, 'internal');
  assert.equal(boom.error.message, 'Internal server error');
  assert.ok(!JSON.stringify(boom).includes('secret connection string'));
  // Read-only key cannot write (scope enforced by services → 403).
  await expect({ method: 'POST', url: '/api/tasks', headers: { authorization: h.bearer('owner', ['read']) }, payload: { title: 'x' } }, 403, 'forbidden');
  // Cross-org: outsider cannot see our tasks.
  const t = json(await h.app.inject({ method: 'POST', url: '/api/tasks', headers, payload: { title: 'secret' } }));
  await expect({ method: 'GET', url: `/api/tasks/${t.id}`, headers: { authorization: h.bearer('outsider') } }, 404, 'not_found');
  await h.app.close();
});

test('me, briefing, misc service routes', async () => {
  const h = await harness();
  const cookie = h.cookie();
  const headers = { cookie, ...WEB };
  const me = await h.app.inject({ method: 'PATCH', url: '/api/me', headers, payload: { name: 'Liv', prefs: { theme: 'classic', sound: false } } });
  assert.equal(me.statusCode, 200, me.body);
  assert.equal(json(me).name, 'Liv');
  assert.equal(json(me).prefs.theme, 'classic');
  const pw = await h.app.inject({ method: 'POST', url: '/api/me/password', headers, payload: { current: 'correct horse battery', next: 'another long pw' } });
  assert.deepEqual(json(pw), { ok: true });
  assert.equal(json(await h.app.inject({ method: 'GET', url: '/api/briefing', headers })).headline, 'All clear');
  assert.deepEqual(json(await h.app.inject({ method: 'GET', url: '/api/notifications/count', headers })), { unread: 3 });
  assert.deepEqual(json(await h.app.inject({ method: 'GET', url: '/api/push/vapid', headers })), { publicKey: 'BPublicKey' });
  assert.deepEqual(json(await h.app.inject({ method: 'POST', url: '/api/notifications/read', headers, payload: { ids: 'all' } })), { ok: true });
  const sub = await h.app.inject({ method: 'POST', url: '/api/push/subscribe', headers, payload: { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } } });
  assert.deepEqual(json(sub), { ok: true });
  const rep = await h.app.inject({ method: 'GET', url: '/api/reports', headers });
  assert.equal(json(rep).windowDays, 30);
  await h.app.inject({ method: 'GET', url: '/api/meetings?memberId=me', headers });
  const range = h.fake.calls.find((c) => c.method === 'meetings.list')!.args[0] as { from: number; to: number; memberId: string };
  assert.ok(range.to > range.from);
  assert.equal(range.memberId, 'me');
  const s = await h.app.inject({ method: 'GET', url: '/api/search?q=acme', headers });
  assert.deepEqual(Object.keys(json(s)).sort(), ['members', 'projects', 'tasks']);
  const key = await h.app.inject({ method: 'POST', url: '/api/keys', headers, payload: { memberId: h.fake.members.agent.id, name: 'Claude', scopes: ['read'] } });
  assert.equal(key.statusCode, 200);
  assert.match(json(key).raw, /^cb_live_/);
  await h.app.close();
});

test('briefing audio: 204 without TTS; bytes with TTS; text capped at 2000 chars', async () => {
  const none = await harness();
  const r0 = await none.app.inject({ method: 'POST', url: '/api/briefing/audio', headers: { authorization: none.bearer() }, payload: { text: 'hello' } });
  assert.equal(r0.statusCode, 204);
  await none.app.close();

  const h = await harness({ tts: { synthesize: async (text) => ({ audio: Buffer.from(`AUDIO:${text.length}`), mime: 'audio/mpeg' }) } });
  const r = await h.app.inject({ method: 'POST', url: '/api/briefing/audio', headers: { authorization: h.bearer() }, payload: { text: 'x'.repeat(5000) } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'audio/mpeg');
  assert.equal(r.body, 'AUDIO:2000');
  assert.equal(h.ttsCalls[0]!.length, 2000);
  await h.app.close();

  const nul = await harness({ tts: { synthesize: async () => null } });
  const rn = await nul.app.inject({ method: 'POST', url: '/api/briefing/audio', headers: { authorization: nul.bearer() }, payload: { text: 'hi' } });
  assert.equal(rn.statusCode, 204);
  await nul.app.close();
});

test('integrations: status + mcpUrl, QR admin+ only, 404 when QR disabled, test send', async () => {
  const h = await harness();
  const owner = { authorization: h.bearer() };
  const st = json(await h.app.inject({ method: 'GET', url: '/api/integrations', headers: { ...owner, host: 'brain.example.com' } }));
  assert.equal(st.mcpUrl, 'http://brain.example.com/mcp');
  assert.equal(st.push, true);
  const start = await h.app.inject({ method: 'POST', url: '/api/integrations/whatsapp/qr/start', headers: owner });
  assert.deepEqual(json(start), { qr: 'data:image/png;base64,AAAA', status: 'pairing' });
  assert.equal(h.qr.started, 1);
  const member = await h.app.inject({ method: 'GET', url: '/api/integrations/whatsapp/qr/status', headers: { authorization: h.bearer('regular') } });
  assert.equal(member.statusCode, 403);
  const ro = await h.app.inject({ method: 'POST', url: '/api/integrations/whatsapp/qr/logout', headers: { authorization: h.bearer('owner', ['read']) } });
  assert.equal(ro.statusCode, 403);
  assert.deepEqual(json(await h.app.inject({ method: 'POST', url: '/api/integrations/whatsapp/qr/logout', headers: owner })), { ok: true });
  const t = await h.app.inject({ method: 'POST', url: '/api/integrations/test', headers: owner, payload: { channel: 'email' } });
  assert.deepEqual(json(t), { ok: true });
  await h.app.close();

  const pub = await harness({ config: { publicUrl: 'https://brain.acme.com/' }, integrations: { whatsappQr: null } });
  const st2 = json(await pub.app.inject({ method: 'GET', url: '/api/integrations', headers: { authorization: pub.bearer() } }));
  assert.equal(st2.mcpUrl, 'https://brain.acme.com/mcp');
  const qr = await pub.app.inject({ method: 'GET', url: '/api/integrations/whatsapp/qr/status', headers: { authorization: pub.bearer() } });
  assert.equal(qr.statusCode, 404);
  await pub.app.close();
});

test('game routes map to services.game', async () => {
  const h = await harness();
  const headers = { authorization: h.bearer() };
  assert.equal(json(await h.app.inject({ method: 'GET', url: '/api/game/hud', headers })).profile.memberId, h.fake.members.owner.id);
  assert.equal(json(await h.app.inject({ method: 'GET', url: `/api/game/profile?memberId=${h.fake.members.agent.id}`, headers })).memberId, h.fake.members.agent.id);
  assert.equal(json(await h.app.inject({ method: 'GET', url: '/api/game/leaderboard', headers })).period, 'week');
  assert.equal(json(await h.app.inject({ method: 'GET', url: '/api/game/leaderboard?period=all', headers })).period, 'all');
  assert.equal((await h.app.inject({ method: 'GET', url: '/api/game/leaderboard?period=year', headers })).statusCode, 400);
  for (const p of ['achievements', 'challenges', 'inventory', 'feed?limit=5', 'rewards?limit=5']) {
    const r = await h.app.inject({ method: 'GET', url: `/api/game/${p}`, headers });
    assert.equal(r.statusCode, 200, p);
    assert.ok(Array.isArray(json(r)));
  }
  const crates = json(await h.app.inject({ method: 'GET', url: '/api/game/crates', headers }));
  const opened = await h.app.inject({ method: 'POST', url: `/api/game/crates/${crates[0].id}/open`, headers });
  assert.equal(json(opened).reward.kind, 'coins');
  const again = await h.app.inject({ method: 'POST', url: `/api/game/crates/${crates[0].id}/open`, headers });
  assert.equal(again.statusCode, 409);
  const eq = await h.app.inject({ method: 'POST', url: '/api/game/equip', headers, payload: { title: 'Night Raider', frame: null } });
  assert.equal(json(eq).equipped.title, 'Night Raider');
  const bad = await h.app.inject({ method: 'POST', url: '/api/game/equip', headers, payload: { xp: 999999 } });
  assert.equal(bad.statusCode, 400);
  await h.app.close();
});

test('log URL redaction hides URL-embedded secrets', () => {
  assert.equal(redactUrl('/mcp/k/cb_live_abcdef?x=1'), '/mcp/k/[REDACTED]?x=1');
  assert.equal(redactUrl('/webhooks/email?secret=s3cret&a=b'), '/webhooks/email?secret=[REDACTED]&a=b');
  assert.equal(redactUrl('/oauth/authorize?client_id=x&state=y'), '/oauth/authorize?client_id=x&state=y');
});

test('health and request ids', async () => {
  const h = await harness();
  const r = await h.app.inject({ method: 'GET', url: '/health' });
  const b = json(r);
  assert.equal(b.ok, true);
  assert.equal(b.version, '2.0.0-test');
  assert.equal(typeof b.uptime, 'number');
  assert.match(String(r.headers['x-request-id']), /^[0-9a-f-]{36}$/);
  await h.app.close();
});

test('CORS: off by default; exact configured origins only', async () => {
  const h = await harness();
  const r = await h.app.inject({ method: 'GET', url: '/api/me', headers: { origin: 'https://evil.example', cookie: h.cookie() } });
  assert.equal(r.headers['access-control-allow-origin'], undefined);
  await h.app.close();

  const c = await harness({ config: { corsOrigins: ['https://app.acme.com'] } });
  const ok = await c.app.inject({ method: 'GET', url: '/api/me', headers: { origin: 'https://app.acme.com', cookie: c.cookie() } });
  assert.equal(ok.headers['access-control-allow-origin'], 'https://app.acme.com');
  assert.equal(ok.headers['access-control-allow-credentials'], 'true');
  const bad = await c.app.inject({ method: 'GET', url: '/api/me', headers: { origin: 'https://app.acme.com.evil.io', cookie: c.cookie() } });
  assert.equal(bad.headers['access-control-allow-origin'], undefined);
  const pre = await c.app.inject({ method: 'OPTIONS', url: '/api/tasks', headers: { origin: 'https://app.acme.com', 'access-control-request-method': 'POST' } });
  assert.equal(pre.statusCode, 204);
  assert.match(String(pre.headers['access-control-allow-headers']), /X-CB-Client/);
  await c.app.close();
});
