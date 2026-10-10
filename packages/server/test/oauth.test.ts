import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { harness, json, WEB, type Harness } from './helpers';
import { CODE_TTL_MS } from '../src/index';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function register(h: Harness, redirectUris = [REDIRECT], name = 'Claude') {
  const r = await h.app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: name, redirect_uris: redirectUris, token_endpoint_auth_method: 'none' } });
  assert.equal(r.statusCode, 201, r.body);
  return json(r).client_id as string;
}

function authorizeUrl(params: Record<string, string>) {
  return `/oauth/authorize?${new URLSearchParams(params).toString()}`;
}

/** register → authorize → approve; returns the code + everything needed to redeem it. */
async function getCode(h: Harness, opts: { actAs?: string; scopes?: string[]; scope?: string } = {}) {
  const clientId = await register(h);
  const { verifier, challenge } = pkce();
  const auth = await h.app.inject({
    method: 'GET',
    url: authorizeUrl({
      response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge,
      code_challenge_method: 'S256', state: 'st4te', scope: opts.scope ?? 'read write', resource: 'http://localhost/mcp',
    }),
  });
  assert.equal(auth.statusCode, 302, auth.body);
  const location = String(auth.headers.location);
  assert.ok(location.startsWith('/connect?'), location);
  const query = Object.fromEntries(new URLSearchParams(location.slice('/connect?'.length)));
  const ap = await h.app.inject({
    method: 'POST', url: '/api/oauth/approve', headers: { cookie: h.cookie(), ...WEB },
    payload: { query, scopes: opts.scopes ?? ['read', 'write'], actAs: opts.actAs ?? h.fake.members.owner.id, approve: true },
  });
  assert.equal(ap.statusCode, 200, ap.body);
  const redirectTo = new URL(json(ap).redirectTo);
  assert.equal(`${redirectTo.origin}${redirectTo.pathname}`, REDIRECT);
  assert.equal(redirectTo.searchParams.get('state'), 'st4te');
  return { clientId, verifier, challenge, code: redirectTo.searchParams.get('code')!, query };
}

function token(h: Harness, form: Record<string, string>, asJson = false) {
  return h.app.inject({
    method: 'POST', url: '/oauth/token',
    ...(asJson ? { payload: form } : { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() }),
  });
}

test('OAuth happy path: register → authorize → approve → token → /mcp', async () => {
  const h = await harness();
  const { clientId, verifier, code, query } = await getCode(h);
  assert.equal(query.client_id, clientId);
  assert.equal(query.state, 'st4te');
  assert.match(code, /^cbc_/);

  const info = await h.app.inject({ method: 'GET', url: `/api/oauth/client?client_id=${encodeURIComponent(clientId)}`, headers: { cookie: h.cookie() } });
  assert.deepEqual(json(info), { name: 'Claude', host: 'claude.ai', redirectUri: REDIRECT, redirectUris: [REDIRECT] });

  const created = h.fake.calls.find((c) => c.method === 'apiKeys.create')!;
  assert.match((created.args[0] as { name: string }).name, /^Claude \(connected \d{4}-\d{2}-\d{2}\)$/);

  const tok = await token(h, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier });
  assert.equal(tok.statusCode, 200, tok.body);
  assert.equal(tok.headers['cache-control'], 'no-store');
  assert.equal(tok.headers['access-control-allow-origin'], '*');
  const t = json(tok);
  assert.equal(t.token_type, 'Bearer');
  assert.equal(t.scope, 'read write');
  assert.match(t.access_token, /^cb_live_/);

  const mcp = await h.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${t.access_token}` }, payload: { jsonrpc: '2.0', id: 1, method: 'initialize' } });
  assert.equal(mcp.statusCode, 200);
  assert.equal(h.mcpCalls.at(-1)!.actor.memberId, h.fake.members.owner.id);
  assert.deepEqual(h.mcpCalls.at(-1)!.actor.scopes, ['read', 'write']);

  // Reusing the code fails AND revokes the token issued for it.
  const again = await token(h, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier });
  assert.equal(again.statusCode, 400);
  assert.equal(json(again).error, 'invalid_grant');
  const after = await h.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${t.access_token}` }, payload: {} });
  assert.equal(after.statusCode, 401);
  await h.app.close();
});

test('OAuth token endpoint accepts JSON too; act as a managed agent; scope narrowing', async () => {
  const h = await harness();
  const { clientId, verifier, code } = await getCode(h, { actAs: h.fake.members.agent.id, scope: 'read' });
  const tok = await token(h, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier }, true);
  assert.equal(tok.statusCode, 200, tok.body);
  assert.equal(json(tok).scope, 'read', 'client asked for read only');
  const mcp = await h.app.inject({ method: 'GET', url: `/mcp/k/${json(tok).access_token}` });
  assert.equal(mcp.statusCode, 200);
  assert.equal(h.mcpCalls.at(-1)!.actor.memberId, h.fake.members.agent.id);
  await h.app.close();
});

test('OAuth token negatives: bad verifier, mismatched redirect/client, expired code', async () => {
  let now = Date.now();
  const h = await harness({ clock: () => now });
  const base = (c: Awaited<ReturnType<typeof getCode>>) => ({ grant_type: 'authorization_code', code: c.code, redirect_uri: REDIRECT, client_id: c.clientId, code_verifier: c.verifier });

  const c1 = await getCode(h);
  const bad = await token(h, { ...base(c1), code_verifier: pkce().verifier });
  assert.equal(bad.statusCode, 400);
  assert.equal(json(bad).error, 'invalid_grant');
  const retry = await token(h, base(c1));
  assert.equal(json(retry).error, 'invalid_grant', 'a failed attempt burns the code');

  const c2 = await getCode(h);
  const wrongRedirect = await token(h, { ...base(c2), redirect_uri: 'https://claude.ai/other' });
  assert.equal(json(wrongRedirect).error, 'invalid_grant');

  const c3 = await getCode(h);
  const otherClient = await register(h, [REDIRECT], 'Other');
  const wrongClient = await token(h, { ...base(c3), client_id: otherClient });
  assert.equal(json(wrongClient).error, 'invalid_grant');

  const c4 = await getCode(h);
  now += CODE_TTL_MS + 1;
  const expired = await token(h, base(c4));
  assert.equal(expired.statusCode, 400);
  assert.equal(json(expired).error, 'invalid_grant');
  assert.match(json(expired).error_description, /expired/i);

  // Every failure revoked the key minted for that code.
  const revoked = h.fake.calls.filter((c) => c.method === 'apiKeys.revoke').length;
  assert.equal(revoked, 4);

  const unknown = await token(h, { ...base(c4), code: 'cbc_nope' });
  assert.equal(json(unknown).error, 'invalid_grant');
  const grant = await token(h, { ...base(c4), grant_type: 'client_credentials' });
  assert.equal(json(grant).error, 'unsupported_grant_type');
  const missing = await token(h, { grant_type: 'authorization_code', code: 'x' });
  assert.equal(json(missing).error, 'invalid_request');
  await h.app.close();
});

test('OAuth registration + authorize validation', async () => {
  const h = await harness();
  for (const uris of [['http://evil.example/cb'], ['javascript:alert(1)'], ['https://ok.example/cb#frag'], [], ['https://user:pw@x.example/cb'], ['cursor://callback']]) {
    const r = await h.app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: 'x', redirect_uris: uris } });
    assert.equal(r.statusCode, 400, JSON.stringify(uris));
    assert.equal(json(r).error, 'invalid_redirect_uri');
  }
  for (const uri of ['http://localhost:6274/oauth/callback', 'http://127.0.0.1:33418/cb', 'https://chatgpt.com/connector_platform_oauth_redirect']) {
    const r = await h.app.inject({ method: 'POST', url: '/oauth/register', payload: { redirect_uris: [uri] } });
    assert.equal(r.statusCode, 201, uri);
    assert.equal(json(r).token_endpoint_auth_method, 'none');
  }

  const clientId = await register(h);
  const { challenge } = pkce();
  const good = { response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 's1' };

  // Untrusted client/redirect → error page, never a redirect.
  for (const p of [
    { ...good, redirect_uri: 'https://evil.example/cb' },
    { ...good, redirect_uri: `${REDIRECT}/` },
    { ...good, client_id: `${clientId.slice(0, -2)}xx` },
    { ...good, client_id: 'garbage' },
  ]) {
    const r = await h.app.inject({ method: 'GET', url: authorizeUrl(p) });
    assert.equal(r.statusCode, 400, JSON.stringify(p));
    assert.equal(r.headers.location, undefined);
  }
  // Registered redirect but a bad request → still an error page, never a redirect (M4: anyone can
  // register a client, so error redirects would be an open redirector).
  for (const [p, err] of [
    [{ ...good, code_challenge_method: 'plain' }, 'invalid_request'],
    [{ ...good, code_challenge: '' }, 'invalid_request'],
    [{ ...good, response_type: 'token' }, 'unsupported_response_type'],
  ] as const) {
    const r = await h.app.inject({ method: 'GET', url: authorizeUrl(p as Record<string, string>) });
    assert.equal(r.statusCode, 400);
    assert.equal(r.headers.location, undefined);
    assert.match(String(r.headers['content-type']), /^text\/html/);
    assert.ok(r.body.includes(err));
  }
  // A client registered with a different secret is rejected.
  const other = await harness({ config: { signingSecret: 'another-secret-entirely-xyz' } });
  const foreign = await register(other);
  const r = await h.app.inject({ method: 'GET', url: authorizeUrl({ ...good, client_id: foreign }) });
  assert.equal(r.statusCode, 400);
  await other.app.close();
  await h.app.close();
});

test('OAuth approve: session + CSRF only, deny, actAs restrictions', async () => {
  const h = await harness();
  const clientId = await register(h);
  const { challenge } = pkce();
  const query = { response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'abc' };
  const body = { query, scopes: ['read', 'write'], actAs: h.fake.members.owner.id, approve: true };

  const noCsrf = await h.app.inject({ method: 'POST', url: '/api/oauth/approve', headers: { cookie: h.cookie() }, payload: body });
  assert.equal(noCsrf.statusCode, 403);
  const viaKey = await h.app.inject({ method: 'POST', url: '/api/oauth/approve', headers: { authorization: h.bearer() }, payload: body });
  assert.equal(viaKey.statusCode, 403);
  const anon = await h.app.inject({ method: 'POST', url: '/api/oauth/approve', headers: WEB, payload: body });
  assert.equal(anon.statusCode, 401);

  const deny = await h.app.inject({ method: 'POST', url: '/api/oauth/approve', headers: { cookie: h.cookie(), ...WEB }, payload: { ...body, approve: false } });
  const loc = new URL(json(deny).redirectTo);
  assert.equal(loc.searchParams.get('error'), 'access_denied');
  assert.equal(loc.searchParams.get('state'), 'abc');
  assert.equal(loc.searchParams.get('code'), null);

  // A regular member cannot connect as an agent; nobody can connect as another human.
  const asAgent = await h.app.inject({ method: 'POST', url: '/api/oauth/approve', headers: { cookie: h.cookie('regular'), ...WEB }, payload: { ...body, actAs: h.fake.members.agent.id } });
  assert.equal(asAgent.statusCode, 403);
  const asHuman = await h.app.inject({ method: 'POST', url: '/api/oauth/approve', headers: { cookie: h.cookie(), ...WEB }, payload: { ...body, actAs: h.fake.members.regular.id } });
  assert.equal(asHuman.statusCode, 403);
  const tampered = await h.app.inject({ method: 'POST', url: '/api/oauth/approve', headers: { cookie: h.cookie(), ...WEB }, payload: { ...body, query: { ...query, redirect_uri: 'https://evil.example/cb' } } });
  assert.equal(tampered.statusCode, 400);
  assert.equal(h.fake.calls.filter((c) => c.method === 'apiKeys.create').length, 0, 'no key minted on any failure');
  await h.app.close();
});

test('OAuth metadata + CORS for browser-based clients', async () => {
  const h = await harness({ config: { publicUrl: 'https://brain.acme.com', corsOrigins: ['https://app.acme.com'] } });
  for (const url of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    const r = await h.app.inject({ method: 'GET', url, headers: { origin: 'https://claude.ai' } });
    assert.equal(r.statusCode, 200);
    assert.deepEqual({ ...json(r), resource_name: undefined }, {
      resource: 'https://brain.acme.com/mcp',
      authorization_servers: ['https://brain.acme.com'],
      scopes_supported: ['read', 'write'],
      bearer_methods_supported: ['header'],
      resource_name: undefined,
    });
    assert.equal(r.headers['access-control-allow-origin'], '*');
    assert.equal(r.headers['access-control-allow-credentials'], undefined);
  }
  const as = json(await h.app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' }));
  assert.equal(as.issuer, 'https://brain.acme.com');
  assert.equal(as.authorization_endpoint, 'https://brain.acme.com/oauth/authorize');
  assert.equal(as.token_endpoint, 'https://brain.acme.com/oauth/token');
  assert.equal(as.registration_endpoint, 'https://brain.acme.com/oauth/register');
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(as.token_endpoint_auth_methods_supported, ['none']);
  assert.deepEqual(as.grant_types_supported, ['authorization_code']);
  for (const url of ['/oauth/token', '/oauth/register', '/.well-known/oauth-authorization-server']) {
    const pre = await h.app.inject({ method: 'OPTIONS', url, headers: { origin: 'https://claude.ai', 'access-control-request-method': 'POST' } });
    assert.equal(pre.statusCode, 204, url);
    assert.equal(pre.headers['access-control-allow-origin'], '*');
    assert.equal(pre.headers['access-control-allow-credentials'], undefined);
  }
  // Behind a trusted proxy without publicUrl, the base comes from X-Forwarded-*.
  const p = await harness({ config: { trustProxy: true } });
  const pr = json(await p.app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource', headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'brain.example.org' } }));
  assert.equal(pr.resource, 'https://brain.example.org/mcp');
  await p.app.close();
  await h.app.close();
});
