import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { KEYS } from './fake-services.ts';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, 'stdio-entry.ts');

function spawnEntry(key: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    cwd: join(here, '..'),
    env: { ...process.env, TEST_MCP_KEY: key },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (d: string) => { stdout += d; });
  child.stderr.setEncoding('utf8').on('data', (d: string) => { stderr += d; });
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, exited, out: () => stdout, err: () => stderr };
}

async function waitFor(cond: () => boolean, ms = 15_000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('stdio: initialize → tools/list → tools/call; stdout carries only JSON-RPC', async () => {
  const p = spawnEntry(KEYS.agentWrite);
  const send = (m: unknown) => p.child.stdin.write(JSON.stringify(m) + '\n');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stdio-test', version: '1' } } });
  await waitFor(() => p.out().includes('"id":1'));
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_my_work', arguments: {} } });
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_tasks', arguments: { assignee: 'me' } } });
  await waitFor(() => p.out().includes('"id":4'));
  p.child.stdin.end();
  const code = await p.exited;

  const lines = p.out().split('\n').filter((l) => l.length);
  assert.ok(lines.length >= 4);
  const msgs = lines.map((l) => {
    const m = JSON.parse(l); // throws if anything but JSON reached stdout
    assert.equal(m.jsonrpc, '2.0');
    return m;
  });
  const byId = new Map(msgs.map((m) => [m.id, m]));
  assert.equal(byId.get(1).result.serverInfo.name, 'companybrain');
  assert.ok(byId.get(1).result.instructions.includes('get_my_work'));
  assert.equal(byId.get(2).result.tools.length, 16);
  assert.equal(byId.get(3).result.isError, undefined);
  assert.equal(byId.get(3).result.structuredContent.overdue[0].title, 'Send Acme proposal');
  assert.ok(byId.get(4).result.structuredContent.count > 0);
  assert.ok(p.err().includes('noisy log from a service'), 'console.log redirected to stderr');
  assert.ok(!p.out().includes('noisy'));
  assert.equal(code, 0, `exits cleanly when stdin closes; stderr:\n${p.err()}`);
  assert.ok(p.err().includes('client disconnected'), 'runMcpStdio resolves on disconnect');
});

test('stdio: invalid key → clear stderr message, exit code 2, nothing on stdout', async () => {
  const p = spawnEntry(KEYS.revoked);
  const code = await p.exited;
  assert.equal(code, 2);
  assert.equal(p.out(), '');
  assert.match(p.err(), /cannot authenticate \(the key is invalid, revoked or expired\)/);
  assert.match(p.err(), /COMPANYBRAIN_MCP_KEY/);
});

test('stdio: missing key → exit code 2', async () => {
  const p = spawnEntry('');
  assert.equal(await p.exited, 2);
  assert.match(p.err(), /no API key given/);
});
