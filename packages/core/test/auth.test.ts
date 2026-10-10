import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '@companybrain/db';
import { buildV1Fixture } from '../../db/test/fixtures.ts';
import { DAY, actorOf, bootstrap, makeEnv } from './helpers.ts';

const meta = { ip: '127.0.0.1', userAgent: 'test' };

test('first-run setup → login → sessions; setup only once; orgId()', async () => {
  const env = makeEnv();
  assert.equal(await env.s.auth.needsSetup(), true);
  assert.equal(await env.s.auth.orgId(), null);
  await assert.rejects(env.s.auth.setup({ orgName: 'A', name: 'B', email: 'x@y.io', password: 'short', timezone: 'UTC' }), /at least 8/);
  const team = await bootstrap(env);
  assert.equal(await env.s.auth.needsSetup(), false);
  assert.equal(await env.s.auth.orgId(), team.owner.orgId);
  await assert.rejects(env.s.auth.setup({ orgName: 'A', name: 'B', email: 'z@y.io', password: 'password123', timezone: 'UTC' }), (e: any) => e.code === 'conflict');

  const login = await env.s.auth.login(team.owner.email!.toUpperCase(), 'correct horse', meta);
  assert.equal(login.member.id, team.owner.id);
  assert.notEqual(login.token, team.token, 'new token per login (rotation)');
  assert.equal(login.token.length, 43);
  const raw = env.db.sqlite.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
  assert.ok(raw.every((r) => r.token_hash !== login.token && r.token_hash.length === 64), 'only SHA-256 stored');
  await assert.rejects(env.s.auth.login(team.owner.email!, 'wrong password', meta), (e: any) => e.code === 'unauthorized');
  await assert.rejects(env.s.auth.login('nobody@nowhere.io', 'whatever1', meta), (e: any) => e.code === 'unauthorized' && /Invalid email or password/.test(e.message));
  await env.s.auth.logout(login.token);
  assert.equal(await env.s.auth.resolveSession(login.token), null);
  assert.equal(await env.s.auth.resolveSession('garbage'), null);
});

test('sessions: sliding 30-day expiry', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  env.clock.advance(20 * DAY);
  assert.ok(await env.s.auth.resolveSession(team.token), 'still valid at day 20 (slides)');
  env.clock.advance(25 * DAY);
  assert.ok(await env.s.auth.resolveSession(team.token), 'slid forward');
  env.clock.advance(31 * DAY);
  assert.equal(await env.s.auth.resolveSession(team.token), null, 'expired after 30 idle days');
});

test('sessions revoked on deactivate, role change and password change; role read fresh', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya } = await team.add('Priya', 'manager');
  const p1 = await env.s.auth.login(priya.email!, 'password123', meta);
  const actor = (await env.s.auth.resolveSession(p1.token))!;
  assert.equal(actor.role, 'manager');

  await env.s.members.update(team.ownerA, priya.id, { role: 'member' });
  assert.equal(await env.s.auth.resolveSession(p1.token), null, 'role change revokes sessions');

  const p2 = await env.s.auth.login(priya.email!, 'password123', meta);
  assert.equal((await env.s.auth.resolveSession(p2.token))!.role, 'member');
  await env.s.members.setPassword(team.ownerA, priya.id, 'brand-new-pass');
  assert.equal(await env.s.auth.resolveSession(p2.token), null, 'admin password reset revokes sessions');

  const p3 = await env.s.auth.login(priya.email!, 'brand-new-pass', meta);
  const a3 = (await env.s.auth.resolveSession(p3.token))!;
  await assert.rejects(env.s.members.changeOwnPassword(a3, 'wrong', 'another-pass'), /incorrect/);
  await env.s.members.changeOwnPassword(a3, 'brand-new-pass', 'another-pass');
  assert.equal(await env.s.auth.resolveSession(p3.token), null, 'own password change revokes sessions');

  const p4 = await env.s.auth.login(priya.email!, 'another-pass', meta);
  await env.s.members.remove(team.ownerA, priya.id);
  assert.equal(await env.s.auth.resolveSession(p4.token), null, 'deactivation revokes sessions');
  await assert.rejects(env.s.auth.login(priya.email!, 'another-pass', meta), (e: any) => e.code === 'unauthorized');
});

test('member permissions: no privilege escalation, last owner protected', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: admin, a: adminA } = await team.add('Ada', 'admin');
  const { m: mem, a: memA } = await team.add('Max', 'member');
  await assert.rejects(env.s.members.create(memA, { kind: 'human', role: 'member', name: 'X', email: 'x@a.io', password: 'password123' }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.members.create(adminA, { kind: 'human', role: 'owner', name: 'X', email: 'x@a.io', password: 'password123' }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.members.update(adminA, team.owner.id, { name: 'Hacked' }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.members.update(memA, mem.id, { role: 'admin' }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.members.update(memA, admin.id, { name: 'Nope' }), (e: any) => e.code === 'forbidden');
  const self = await env.s.members.update(memA, mem.id, { name: 'Max Power', prefs: { theme: 'classic' } });
  assert.equal(self.initials, 'MP');
  assert.equal(self.prefs.theme, 'classic');
  await assert.rejects(env.s.members.setPassword(adminA, team.owner.id, 'password999'), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.members.remove(team.ownerA, team.owner.id), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.members.update(team.ownerA, team.owner.id, { role: 'admin' }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.members.create(team.ownerA, { kind: 'human', role: 'member', name: 'Dup', email: mem.email, password: 'password123' }), (e: any) => e.code === 'conflict');
});

test('API keys: format, hashing, scopes, expiry, revocation, lastSeen', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: mgr, a: mgrA } = await team.add('Mia', 'manager');
  const { a: memA, m: mem } = await team.add('Max', 'member');
  const bot = await env.s.members.create(mgrA, { kind: 'agent', role: 'agent', name: 'Claude', agent: { provider: 'claude' } });
  assert.equal(bot.agent!.supervisorId, mgr.id);

  await assert.rejects(env.s.apiKeys.create(memA, { memberId: bot.id, name: 'k', scopes: ['read'] }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.apiKeys.create(mgrA, { memberId: mem.id, name: 'k', scopes: ['read'] }), (e: any) => e.code === 'forbidden');

  const { key, raw } = await env.s.apiKeys.create(mgrA, { memberId: bot.id, name: 'Claude desktop', scopes: ['read'] });
  assert.match(raw, /^cb_live_[A-Za-z0-9]{43}$/);
  assert.equal(key.prefix, raw.slice(0, 12));
  const stored = env.db.sqlite.prepare('SELECT key_hash FROM api_keys WHERE id=?').get(key.id) as { key_hash: string };
  assert.notEqual(stored.key_hash, raw);

  const ro = (await env.s.auth.resolveApiKey(raw))!;
  assert.equal(ro.via, 'api_key');
  assert.deepEqual(ro.scopes, ['read']);
  assert.equal(ro.kind, 'agent');
  assert.ok((await env.s.members.get(team.ownerA, bot.id)).agent!.lastSeenAt, 'agent lastSeenAt updated');
  assert.ok((await env.s.tasks.list(ro)).length >= 0, 'read works');
  await assert.rejects(env.s.tasks.create(ro, { title: 'nope' }), (e: any) => e.code === 'forbidden' && /read-only/.test(e.message));
  await assert.rejects(env.s.apiKeys.create(ro, { memberId: bot.id, name: 'x', scopes: ['write'] }), (e: any) => e.code === 'forbidden');

  const rw = await env.s.apiKeys.create(mgrA, { memberId: bot.id, name: 'rw', scopes: ['write'], expiresAt: env.clock.now + DAY });
  assert.deepEqual(rw.key.scopes, ['read', 'write']);
  const rwA = (await env.s.auth.resolveApiKey(rw.raw))!;
  const t = await env.s.tasks.create(rwA, { title: 'Agent task' });
  assert.deepEqual(t.assigneeIds, [bot.id]);
  assert.equal(t.source.channel, 'api');
  env.clock.advance(DAY + 1);
  assert.equal(await env.s.auth.resolveApiKey(rw.raw), null, 'expired');

  await env.s.apiKeys.revoke(mgrA, key.id);
  assert.equal(await env.s.auth.resolveApiKey(raw), null, 'revoked');
  assert.equal(await env.s.auth.resolveApiKey('cb_live_notarealkey'), null);
  assert.equal(await env.s.auth.resolveApiKey('Bearer x'), null);

  const own = await env.s.apiKeys.create(memA, { memberId: mem.id, name: 'mine', scopes: ['read', 'write'] });
  assert.equal((await env.s.apiKeys.list(memA)).length, 1);
  assert.ok((await env.s.apiKeys.list(team.ownerA)).length >= 3);
  await env.s.members.remove(team.ownerA, mem.id);
  assert.equal(await env.s.auth.resolveApiKey(own.raw), null, 'deactivation revokes keys');
});

test('v1 users can log in with their v1 passwords after import', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-core-v1-'));
  try {
    const path = join(dir, 'v1.sqlite');
    buildV1Fixture(path);
    const env = makeEnv({ db: openDatabase(path, { secret: 'x' }) });
    assert.equal(await env.s.auth.needsSetup(), false);
    const res = await env.s.auth.login('ceo@acme.io', 'v1-password', meta);
    assert.equal(res.member.role, 'owner');
    const a = actorOf(res.member);
    const tasks = await env.s.tasks.list(a, { view: 'all', limit: 100 });
    assert.ok(tasks.some((t) => t.title === 'Call Acme'));
    env.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('org settings: admin only, validated, undoable', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { a: memA } = await team.add('Max');
  await assert.rejects(env.s.org.update(memA, { name: 'X' }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.org.update(team.ownerA, { timezone: 'Mars/Base' }), (e: any) => e.code === 'bad_request');
  await assert.rejects(env.s.org.update(team.ownerA, { workdayStart: 18, workdayEnd: 9 }), (e: any) => e.code === 'bad_request');
  const o = await env.s.org.update(team.ownerA, { name: 'Acme Inc', intakeAutoAck: true });
  assert.equal(o.name, 'Acme Inc');
  const ev = (await env.s.audit.list(team.ownerA, { entity: 'org' })).find((e) => e.type === 'org.updated')!;
  await env.s.audit.undo(team.ownerA, ev.id);
  assert.equal((await env.s.org.get(team.ownerA)).name, 'Acme');
});
