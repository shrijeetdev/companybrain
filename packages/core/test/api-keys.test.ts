// api-keys: persisted, hashed, identity-bearing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-core-apikeys-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap } = await import('@companybrain/core');
const { LOCAL_ORG_ID } = await import('@companybrain/auth');
const boot = await bootstrap();
const core = boot.core;
const org = LOCAL_ORG_ID;

test('api-keys: create returns raw once, verify resolves identity', async () => {
  const { raw, row } = await core.apiKeys.create(org, 'MCP Agent', ['read', 'write'], 'user_agent1');
  assert.ok(raw.startsWith('cb_'), 'raw key has cb_ prefix');
  assert.equal(row.actorId, 'user_agent1');
  assert.equal(row.orgId, org);

  const id = await core.apiKeys.verify(raw);
  assert.ok(id, 'verify resolves');
  assert.equal(id!.actorId, 'user_agent1');
  assert.equal(id!.orgId, org);
  assert.deepEqual(id!.scopes, ['read', 'write']);
});

test('api-keys: wrong key returns null', async () => {
  const id = await core.apiKeys.verify('cb_totally_wrong');
  assert.equal(id, null);
});

test('api-keys: list hides the hash; revoke removes', async () => {
  const { row } = await core.apiKeys.create(org, 'Other', ['read']);
  const listed = await core.apiKeys.list(org);
  assert.ok(listed.some((k) => k.id === row.id));
  assert.ok(!(listed[0] as any).keyHash, 'hash never exposed via list');
  await core.apiKeys.revoke(row.id);
  assert.ok(!(await core.apiKeys.list(org)).some((k) => k.id === row.id));
});

process.on('exit', () => { try { rmSync(dbPath); } catch {} });
