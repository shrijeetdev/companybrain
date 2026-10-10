import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { harness, json, makeWebDir } from './helpers';

test('SPA: static files with cache policy, client-side route fallback, JSON 404 for APIs', async () => {
  const h = await harness({ config: { webDir: makeWebDir() } });
  const root = await h.app.inject({ method: 'GET', url: '/' });
  assert.equal(root.statusCode, 200);
  assert.match(root.body, /SPA_INDEX/);
  assert.equal(root.headers['cache-control'], 'no-cache');
  assert.match(String(root.headers['content-type']), /text\/html/);
  const csp = String(root.headers['content-security-policy']);
  for (const d of ["default-src 'self'", "script-src 'self'", "connect-src 'self'", "img-src 'self' data: blob:", "media-src 'self' blob: data:", "frame-ancestors 'none'"]) {
    assert.ok(csp.includes(d), `CSP missing ${d}: ${csp}`);
  }
  assert.ok(!csp.includes('upgrade-insecure-requests'));
  assert.equal(root.headers['x-content-type-options'], 'nosniff');
  assert.equal(root.headers['strict-transport-security'], undefined);

  for (const url of ['/tasks/task_123', '/settings/keys', '/connect?client_id=x']) {
    const r = await h.app.inject({ method: 'GET', url });
    assert.equal(r.statusCode, 200, url);
    assert.match(r.body, /SPA_INDEX/);
    assert.equal(r.headers['cache-control'], 'no-cache');
  }
  const asset = await h.app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
  assert.equal(asset.statusCode, 200);
  assert.equal(asset.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.match(String(asset.headers['content-type']), /javascript/);
  const sw = await h.app.inject({ method: 'GET', url: '/sw.js' });
  assert.match(String(sw.headers['content-type']), /^(text|application)\/javascript/);
  assert.equal(sw.headers['cache-control'], 'no-cache');
  assert.equal(sw.headers['service-worker-allowed'], '/');
  // The no-flash theme bootstrap is an external same-origin script (CSP script-src 'self'), never cached stale.
  const ti = await h.app.inject({ method: 'GET', url: '/theme-init.js' });
  assert.equal(ti.statusCode, 200);
  assert.match(String(ti.headers['content-type']), /^(text|application)\/javascript/);
  assert.equal(ti.headers['cache-control'], 'no-cache');
  assert.match(String(ti.headers['content-security-policy']), /script-src 'self'(;|$)/);
  const mf = await h.app.inject({ method: 'GET', url: '/manifest.webmanifest' });
  assert.match(String(mf.headers['content-type']), /^application\/manifest\+json/);

  for (const url of ['/assets/missing.js', '/api/does-not-exist', '/API/nope', '/mcp/nope/x', '/webhooks/nope', '/%61pi/nope']) {
    const r = await h.app.inject({ method: 'GET', url });
    assert.ok([401, 404].includes(r.statusCode), `${url} → ${r.statusCode}`);
    assert.ok(!r.body.includes('SPA_INDEX'), `${url} must not serve the SPA`);
    assert.ok(json(r).error, url);
  }
  const post = await h.app.inject({ method: 'POST', url: '/tasks' });
  assert.equal(post.statusCode, 404);
  assert.equal(json(post).error.code, 'not_found');
  const dot = await h.app.inject({ method: 'GET', url: '/.env' });
  assert.equal(dot.statusCode, 404);
  const trav = await h.app.inject({ method: 'GET', url: '/assets/..%2f..%2f..%2fetc%2fpasswd' });
  assert.ok(!trav.body.includes('root:'), 'no traversal');
  await h.app.close();

  const apiOnly = await harness();
  const r = await apiOnly.app.inject({ method: 'GET', url: '/' });
  assert.equal(r.statusCode, 404);
  assert.equal(json(r).error.code, 'not_found');
  await apiOnly.app.close();
});

/** All `| METHOD | \`/api/...\`` rows from docs/v2/API.md. */
function apiMdRoutes(): { method: string; path: string }[] {
  const md = readFileSync(fileURLToPath(new URL('../../../docs/v2/API.md', import.meta.url)), 'utf8');
  const out: { method: string; path: string }[] = [];
  for (const m of md.matchAll(/^\|\s*([A-Z/]+)\s*\|\s*`([^`]+)`/gm)) {
    const path = m[2]!.split('?')[0]!;
    if (!path.startsWith('/api/') && path !== '/health') continue;
    for (const method of m[1]!.split('/')) out.push({ method: method.toLowerCase(), path: path.replace(/:([A-Za-z]+)/g, '{$1}') });
  }
  return out;
}

test('openapi.json is a valid OpenAPI 3.1 doc covering every API.md route', async () => {
  const h = await harness({ config: { publicUrl: 'https://brain.acme.com' } });
  const res = await h.app.inject({ method: 'GET', url: '/api/openapi.json' });
  assert.equal(res.statusCode, 200);
  const doc = json(res);
  assert.equal(doc.openapi, '3.1.0');
  assert.equal(doc.servers[0].url, 'https://brain.acme.com');
  assert.deepEqual(doc.components.securitySchemes.bearerAuth, { type: 'http', scheme: 'bearer', description: 'API key (cb_live_…)' });

  const expected = apiMdRoutes();
  assert.ok(expected.length > 80, `parsed ${expected.length} routes from API.md`);
  const missing = expected.filter((r) => r.path !== '/api/openapi.json' && !doc.paths[r.path]?.[r.method]);
  assert.deepEqual(missing, [], 'routes in API.md missing from openapi.json');

  const opIds = new Set<string>();
  const refs: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === '$ref') refs.push(x as string);
        else walk(x);
      }
    }
  };
  for (const [p, ops] of Object.entries<Record<string, any>>(doc.paths)) {
    assert.ok(p.startsWith('/'), p);
    for (const pathParam of p.matchAll(/\{(\w+)\}/g)) {
      for (const op of Object.values(ops)) assert.ok(op.parameters.some((x: any) => x.in === 'path' && x.name === pathParam[1]), `${p} declares ${pathParam[1]}`);
    }
    for (const [method, op] of Object.entries(ops)) {
      assert.ok(['get', 'post', 'patch', 'put', 'delete'].includes(method));
      assert.match(op.operationId, /^[A-Za-z][A-Za-z0-9]*$/);
      assert.ok(!opIds.has(op.operationId), `duplicate operationId ${op.operationId}`);
      opIds.add(op.operationId);
      assert.ok(op.responses && Object.keys(op.responses).length > 0);
    }
  }
  walk(doc);
  assert.ok(refs.length > 50);
  for (const r of refs) {
    assert.match(r, /^#\/components\/schemas\//);
    assert.ok(doc.components.schemas[r.split('/').pop()!], `dangling $ref ${r}`);
  }
  // Auth requirements are declared.
  assert.deepEqual(doc.paths['/api/tasks'].get.security, [{ bearerAuth: [] }]);
  assert.deepEqual(doc.paths['/api/auth/login'].post.security, []);
  assert.equal(doc.paths['/api/tasks'].post.requestBody.content['application/json'].schema.required[0], 'title');
  // DELETE /api/tasks/{id} documents its { auditId } body (not a 204).
  const del = doc.paths['/api/tasks/{id}'].delete.responses;
  assert.equal(del['204'], undefined);
  const delSchema = doc.components.schemas[del['200'].content['application/json'].schema.$ref.split('/').pop()];
  assert.deepEqual(delSchema.required, ['auditId']);
  // Subtask reorder + new list filters + org currency are documented.
  const order = doc.paths['/api/tasks/{id}/subtasks/order'].put;
  assert.deepEqual(order.requestBody.content['application/json'].schema.required, ['ids']);
  const listParams = doc.paths['/api/tasks'].get.parameters.map((p: any) => p.name);
  for (const n of ['priority', 'completedSince']) assert.ok(listParams.includes(n), `listTasks documents ${n}`);
  assert.ok(doc.components.schemas.OrgSettings.required.includes('currency'));
  await h.app.close();
});
