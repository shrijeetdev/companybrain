import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiRoutes } from '../src/routes/api';
import { oauthApiRoutes, CodeStore } from '../src/oauth';
import { harness, json, makeWebDir, WEB } from './helpers';

const fill = (path: string) => path.replace(/:subId/g, 'sub_abcdef12').replace(/:id/g, 'task_abcdef12');

test('every authenticated route returns 401 without credentials (and with bad ones)', async () => {
  const h = await harness();
  const defs = [...apiRoutes(h.deps), ...oauthApiRoutes(h.deps, new CodeStore(Date.now))];
  const routes = [...defs.map((d) => ({ method: d.method, url: fill(d.path) })), { method: 'GET' as const, url: '/api/stream' }];
  assert.ok(routes.length >= 80, `expected many routes, got ${routes.length}`);
  let n = 0;
  for (const r of routes) {
    const remoteAddress = `10.0.${(n >> 8) & 255}.${n++ & 255}`;
    for (const headers of [{}, { authorization: 'Bearer cb_live_nope' }, { cookie: 'cb_session=forged' }, { authorization: 'Basic abc' }]) {
      const res = await h.app.inject({ method: r.method, url: r.url, remoteAddress, headers: { ...headers, ...WEB }, payload: r.method === 'GET' || r.method === 'DELETE' ? undefined : {} });
      assert.equal(res.statusCode, 401, `${r.method} ${r.url} with ${JSON.stringify(headers)} → ${res.statusCode}`);
      assert.equal(json(res).error.code, 'unauthorized');
    }
  }
  // Nothing reached the services.
  assert.equal(h.fake.calls.length, 0);
  await h.app.close();
});

test('path-normalisation variants never bypass auth', async () => {
  const h = await harness({ config: { webDir: makeWebDir() } });
  const { owner } = h.fake.members;
  const variants = [
    '/%61pi/me', '/API/me', '/Api/me', '//api/me', '/api//me', '/api/./me', '/./api/me', '/api/me/', '/api/me/.',
    '/api/../api/me', '/api/%6de', '/api/me%2f', '/%2fapi/me', '/api%2fme', '/api/me;x=1', '/api/me%00', '/api/me%20',
    '/api/me?x=1', '/api/me#frag', '/api/ME', '/api/me%3Fx', '/%2e/api/me', '/api/%2e/me', '/api\\me', '/%5capi/me',
  ];
  for (const url of variants) {
    for (const method of ['GET', 'HEAD', 'PATCH']) {
      const res = await h.app.inject({ method: method as 'GET', url, headers: WEB, payload: method === 'PATCH' ? { name: 'pwned' } : undefined });
      assert.ok(!res.body.includes(owner.id) && !res.body.includes(owner.email!), `${method} ${url} leaked member data (${res.statusCode})`);
      assert.ok([400, 401, 404].includes(res.statusCode) || (res.statusCode === 200 && res.body.includes('SPA_INDEX')) || (method === 'HEAD' && res.statusCode === 200),
        `${method} ${url} → unexpected ${res.statusCode}`);
    }
  }
  assert.equal(h.fake.members.owner.name, 'Olivia Owner');
  // Positive control: the real route works with a session.
  const ok = await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: h.cookie() } });
  assert.equal(ok.statusCode, 200);
  assert.equal(json(ok).id, owner.id);
  await h.app.close();
});

test('session cookie and bearer key both authenticate', async () => {
  const h = await harness();
  const a = await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: h.cookie('regular') } });
  assert.equal(json(a).id, h.fake.members.regular.id);
  const b = await h.app.inject({ method: 'GET', url: '/api/me', headers: { authorization: h.bearer('agent') } });
  assert.equal(json(b).id, h.fake.members.agent.id);
  // Invalid bearer must not fall back to a valid cookie.
  const c = await h.app.inject({ method: 'GET', url: '/api/me', headers: { authorization: 'Bearer junk', cookie: h.cookie() } });
  assert.equal(c.statusCode, 401);
  assert.equal(c.headers['cache-control'], 'no-store');
  await h.app.close();
});

test('CSRF: cookie-authenticated mutations need X-CB-Client: web; bearer is exempt', async () => {
  const h = await harness();
  const cookie = h.cookie();
  const no = await h.app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie }, payload: { title: 'x' } });
  assert.equal(no.statusCode, 403);
  assert.equal(json(no).error.code, 'forbidden');
  const wrong = await h.app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie, 'x-cb-client': 'evil' }, payload: { title: 'x' } });
  assert.equal(wrong.statusCode, 403);
  for (const method of ['PATCH', 'DELETE'] as const) {
    const r = await h.app.inject({ method, url: '/api/tasks/task_abcdef12', headers: { cookie }, payload: method === 'PATCH' ? { title: 'y' } : undefined });
    assert.equal(r.statusCode, 403, method);
  }
  assert.equal(h.fake.tasks.size, 0);
  const yes = await h.app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie, ...WEB }, payload: { title: 'x' } });
  assert.equal(yes.statusCode, 200);
  const get = await h.app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie } });
  assert.equal(get.statusCode, 200, 'GET needs no CSRF header');
  const bearer = await h.app.inject({ method: 'POST', url: '/api/tasks', headers: { authorization: h.bearer() }, payload: { title: 'b' } });
  assert.equal(bearer.statusCode, 200);
  // Logout with a cookie is also a cookie mutation.
  const lo = await h.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
  assert.equal(lo.statusCode, 403);
  await h.app.close();
});

test('login sets a hardened cookie; logout clears it and revokes the session', async () => {
  const h = await harness();
  const res = await h.app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: 'owner@example.com', password: 'correct horse battery' } });
  assert.equal(res.statusCode, 200);
  assert.equal(json(res).member.id, h.fake.members.owner.id);
  const sc = String(res.headers['set-cookie']);
  assert.match(sc, /^cb_session=[^;]+; /);
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Lax/);
  assert.match(sc, /Path=\//);
  assert.match(sc, /Max-Age=(\d+)/);
  assert.ok(Number(/Max-Age=(\d+)/.exec(sc)![1]) > 29 * 86400);
  assert.doesNotMatch(sc, /Secure/, 'plain http + auto → not Secure');
  const cookie = sc.split(';')[0]!;
  assert.equal((await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode, 200);

  const state = await h.app.inject({ method: 'GET', url: '/api/auth/state', headers: { cookie } });
  assert.deepEqual({ ...json(state), member: undefined, org: undefined }, { needsSetup: false, authenticated: true, member: undefined, org: undefined });
  assert.equal(json(state).org.name, 'Test Co');

  const out = await h.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie, ...WEB } });
  assert.equal(out.statusCode, 200);
  assert.match(String(out.headers['set-cookie']), /cb_session=; .*Max-Age=0/);
  assert.equal((await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode, 401);

  const bad = await h.app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: 'owner@example.com', password: 'wrong' } });
  assert.equal(bad.statusCode, 401);
  assert.equal(bad.headers['set-cookie'], undefined);
  await h.app.close();
});

test('Secure cookie: forced, or auto behind a trusted https proxy only', async () => {
  const login = { identifier: 'owner@example.com', password: 'correct horse battery' };
  const forced = await harness({ config: { secureCookies: true } });
  const r1 = await forced.app.inject({ method: 'POST', url: '/api/auth/login', payload: login });
  assert.match(String(r1.headers['set-cookie']), /; Secure/);
  assert.match(String(r1.headers['strict-transport-security']), /max-age=/);
  await forced.app.close();

  const trusted = await harness({ config: { trustProxy: true } });
  const r2 = await trusted.app.inject({ method: 'POST', url: '/api/auth/login', payload: login, headers: { 'x-forwarded-proto': 'https' } });
  assert.match(String(r2.headers['set-cookie']), /; Secure/);
  const r2b = await trusted.app.inject({ method: 'POST', url: '/api/auth/login', payload: login });
  assert.doesNotMatch(String(r2b.headers['set-cookie']), /Secure/);
  assert.equal(r2b.headers['strict-transport-security'], undefined, 'no HSTS over http');
  await trusted.app.close();

  const untrusted = await harness();
  const r3 = await untrusted.app.inject({ method: 'POST', url: '/api/auth/login', payload: login, headers: { 'x-forwarded-proto': 'https' } });
  assert.doesNotMatch(String(r3.headers['set-cookie']), /Secure/, 'X-Forwarded-Proto ignored without trustProxy');
  await untrusted.app.close();
});

test('setup only while needsSetup', async () => {
  const h = await harness({}, { needsSetup: true });
  const st = json(await h.app.inject({ method: 'GET', url: '/api/auth/state' }));
  assert.deepEqual(st, { needsSetup: true, authenticated: false });
  const body = { orgName: 'Acme', name: 'Shrijeet', email: 'ceo@acme.test', password: 'long enough pw', timezone: 'Asia/Kolkata' };
  const r = await h.app.inject({ method: 'POST', url: '/api/auth/setup', payload: body });
  assert.equal(r.statusCode, 200);
  assert.match(String(r.headers['set-cookie']), /cb_session=/);
  const again = await h.app.inject({ method: 'POST', url: '/api/auth/setup', payload: body });
  assert.equal(again.statusCode, 409);
  assert.equal(json(again).error.code, 'conflict');
  await h.app.close();
});

test('rate limiting: login 10/min per IP+identifier → 429', async () => {
  const h = await harness();
  const payload = { identifier: 'owner@example.com', password: 'wrong' };
  for (let i = 0; i < 10; i++) {
    const r = await h.app.inject({ method: 'POST', url: '/api/auth/login', payload });
    assert.equal(r.statusCode, 401, `attempt ${i + 1}`);
  }
  const blocked = await h.app.inject({ method: 'POST', url: '/api/auth/login', payload: { ...payload, password: 'correct horse battery' } });
  assert.equal(blocked.statusCode, 429);
  assert.equal(json(blocked).error.code, 'rate_limited');
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  // A different identifier from the same IP is still allowed.
  const other = await h.app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: 'member@example.com', password: 'correct horse battery' } });
  assert.equal(other.statusCode, 200);
  // A different IP for the same identifier is still allowed.
  const ip2 = await h.app.inject({ method: 'POST', url: '/api/auth/login', payload: { ...payload, password: 'correct horse battery' }, remoteAddress: '10.9.9.9' });
  assert.equal(ip2.statusCode, 200);
  await h.app.close();
});

test('rate limiting: global 300/min keyed by actor, else IP → 429', async () => {
  const h = await harness();
  const cookie = h.cookie();
  for (let i = 0; i < 300; i++) {
    const r = await h.app.inject({ method: 'GET', url: '/api/notifications/count', headers: { cookie } });
    assert.equal(r.statusCode, 200, `request ${i + 1}`);
  }
  const blocked = await h.app.inject({ method: 'GET', url: '/api/notifications/count', headers: { cookie } });
  assert.equal(blocked.statusCode, 429);
  assert.equal(json(blocked).error.code, 'rate_limited');
  // Another actor from the same IP has its own bucket.
  const other = await h.app.inject({ method: 'GET', url: '/api/notifications/count', headers: { cookie: h.cookie('regular') } });
  assert.equal(other.statusCode, 200);
  // Unauthenticated traffic is limited per IP (and still rejected with 401 until then).
  for (let i = 0; i < 300; i++) await h.app.inject({ method: 'GET', url: '/api/me', remoteAddress: '10.1.1.1' });
  const anon = await h.app.inject({ method: 'GET', url: '/api/me', remoteAddress: '10.1.1.1' });
  assert.equal(anon.statusCode, 429);
  await h.app.close();
});
