// WordPress publish — basic-auth POST to /wp-json/wp/v2/posts. Always draft by default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishPost } from '@companybrain/integrations';

test('wordpress: success returns postId + permalink', async () => {
  let captured: any = {};
  const fetchImpl = async (url: any, init: any) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ id: 42, link: 'https://blog.example.com/?p=42' }), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  const r = await publishPost({
    creds: { apiUrl: 'https://blog.example.com', username: 'u', appPassword: 'p xxx' },
    title: 'Hello', content: '<p>body</p>',
    fetchImpl: fetchImpl as any,
  });
  assert.equal(r.ok, true);
  assert.equal(r.postId, 42);
  assert.equal(r.postUrl, 'https://blog.example.com/?p=42');
  // basic auth header present
  assert.match(captured.init.headers['Authorization'], /^Basic /);
  const body = JSON.parse(captured.init.body);
  assert.equal(body.status, 'draft', 'always draft by default');
  assert.equal(body.title, 'Hello');
  assert.equal(captured.url, 'https://blog.example.com/wp-json/wp/v2/posts');
});

test('wordpress: a caller asking to publish still gets a draft', async () => {
  let body: any = {};
  const fetchImpl = async (_url: any, init: any) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 1, link: 'https://blog.example.com/?p=1' }), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  await publishPost({
    creds: { apiUrl: 'https://blog.example.com/', username: 'u', appPassword: 'p' },
    title: 'x', content: 'y', status: 'publish', fetchImpl: fetchImpl as any,
  });
  assert.equal(body.status, 'draft', 'the draft floor is enforced in the client');
});

test('wordpress: non-2xx returns ok:false', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  const r = await publishPost({
    creds: { apiUrl: 'https://blog.example.com', username: 'u', appPassword: 'bad' },
    title: 'x', content: 'y', fetchImpl: fetchImpl as any,
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /401|Unauthorized/);
});

test('wordpress: never throws on network error', async () => {
  const fetchImpl = async () => { throw new Error('ENOTFOUND'); };
  const r = await publishPost({
    creds: { apiUrl: 'https://nope.example.com', username: 'u', appPassword: 'p' },
    title: 'x', content: 'y', fetchImpl: fetchImpl as any,
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /ENOTFOUND/);
});
