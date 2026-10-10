// API key persistence — keys survive restart and can be looked up by hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dbPath = join(tmpdir(), `companybrain-apikeys-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { SqliteDatabase } = await import('@companybrain/db');

const db = new SqliteDatabase(dbPath);
await db.init();

function hash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

test('apiKeys: insert then findByHash round-trips', async () => {
  const raw = 'cb_key_test123';
  await db.apiKeys.insert({
    id: 'apikey_1', orgId: 'org_local', name: 'MCP Agent',
    prefix: raw.slice(0, 8), keyHash: hash(raw),
    scopes: ['read', 'write'], actorId: 'user_agent',
    createdAt: Date.now(),
  });
  const found = await db.apiKeys.findByHash(hash(raw));
  assert.ok(found, 'key found by hash');
  assert.equal(found!.actorId, 'user_agent');
  assert.equal(found!.orgId, 'org_local');
});

test('apiKeys: unknown hash returns null', async () => {
  const found = await db.apiKeys.findByHash(hash('cb_does_not_exist'));
  assert.equal(found, null);
});

test('apiKeys: listByOrg and delete', async () => {
  const listed = await db.apiKeys.listByOrg('org_local');
  assert.equal(listed.length, 1);
  await db.apiKeys.delete('apikey_1');
  assert.equal((await db.apiKeys.listByOrg('org_local')).length, 0);
});

test('apiKeys: keys persist across a new connection (simulating a separate MCP process)', async () => {
  await db.apiKeys.insert({
    id: 'apikey_2', orgId: 'org_local', name: 'Other',
    prefix: 'cb_12345', keyHash: hash('cb_persist_me'),
    scopes: ['read'], createdAt: Date.now(),
  });
  await db.close();

  // Reopen the SAME file — this is exactly what the MCP process does vs the web app.
  const db2 = new SqliteDatabase(dbPath);
  await db2.init();
  const found = await db2.apiKeys.findByHash(hash('cb_persist_me'));
  assert.ok(found, 'key survived reopen of the same file');
  assert.equal(found!.actorId, undefined); // this key was created without an actorId
  await db2.close();
});

// cleanup
process.on('exit', () => { try { rmSync(dbPath); } catch {} });
