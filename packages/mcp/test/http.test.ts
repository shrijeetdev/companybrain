import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { handleMcpHttp } from '../src/index.ts';
import { createFakeServices, KEYS } from './fake-services.ts';

const fake = createFakeServices();
let server: http.Server;
let base: string;

before(async () => {
  server = http.createServer(async (req, res) => {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    const actor = await fake.services.auth.resolveApiKey(auth);
    if (!actor) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'unauthorized', message: 'bad key' } }));
      return;
    }
    let body: unknown;
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    await handleMcpHttp(fake.services, actor, req, res, body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

test('SDK client over Streamable HTTP: initialize → tools/list → tools/call', async () => {
  const transport = new StreamableHTTPClientTransport(new URL(base), {
    requestInit: { headers: { Authorization: `Bearer ${KEYS.agentWrite}` } },
  });
  const client = new Client({ name: 'http-test', version: '1.0.0' });
  await client.connect(transport);
  assert.equal(client.getServerVersion()?.name, 'companybrain');
  assert.ok(client.getInstructions()?.includes('get_my_work'));
  assert.equal(transport.sessionId, undefined, 'stateless: no session id');

  const { tools } = await client.listTools();
  assert.equal(tools.length, 16);

  const r = (await client.callTool({ name: 'get_my_work', arguments: {} })) as CallToolResult;
  assert.ok(!r.isError);
  assert.equal((r.structuredContent as any).overdue[0].title, 'Send Acme proposal');

  const c = (await client.callTool({ name: 'create_task', arguments: { title: 'Via HTTP', due: 'tomorrow 9am' } })) as CallToolResult;
  assert.ok(!c.isError, JSON.stringify(c));
  assert.equal((c.structuredContent as any).task.title, 'Via HTTP');
  await client.close();
});

test('read-only key over HTTP gets a clean tool error on writes', async () => {
  const transport = new StreamableHTTPClientTransport(new URL(base), {
    requestInit: { headers: { Authorization: `Bearer ${KEYS.agentRead}` } },
  });
  const client = new Client({ name: 'http-test', version: '1.0.0' });
  await client.connect(transport);
  const r = (await client.callTool({ name: 'add_comment', arguments: { taskId: fake.ids.today, text: 'hi' } })) as CallToolResult;
  assert.equal(r.isError, true);
  assert.match((r.content[0] as any).text, /read-only/);
  await client.close();
});

test('plain JSON client (Accept: application/json only) works', async () => {
  const res = await fetch(base, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEYS.agentWrite}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  const json = (await res.json()) as any;
  assert.equal(json.id, 1);
  assert.equal(json.result.tools.length, 16);

  const call = await fetch(base, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEYS.agentWrite}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search', arguments: { query: 'acme' } } }),
  });
  assert.equal(call.status, 200);
  const cj = (await call.json()) as any;
  assert.equal(cj.result.structuredContent.tasks[0].title, 'Send Acme proposal');
});

test('GET and DELETE return 405 with a JSON-RPC error', async () => {
  for (const method of ['GET', 'DELETE']) {
    const res = await fetch(base, { method, headers: { authorization: `Bearer ${KEYS.agentWrite}`, accept: 'text/event-stream' } });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'POST');
    const json = (await res.json()) as any;
    assert.equal(json.jsonrpc, '2.0');
    assert.equal(json.error.code, -32000);
    assert.equal(json.id, null);
  }
});
