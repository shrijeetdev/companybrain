// Password auth: invite links, lockout after repeated wrong passwords, last-admin guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.COMPANYBRAIN_DB_PATH = join(tmpdir(), `companybrain-auth-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_ADMIN_EMAIL = 'owner@test.local';
process.env.COMPANYBRAIN_ADMIN_NAME = 'Owner';
process.env.COMPANYBRAIN_ADMIN_PASSWORD = 'owner-test-pass-1';

const { PasswordAuth } = await import('../src/password');
const auth = new PasswordAuth();
await auth.init();
const owner = auth.listUsers().find((u) => u.email === 'owner@test.local')!;

test('a username-only account signs in only after its invite is used', async () => {
  const u = auth.createUser({ username: 'garv', name: 'Garv', role: 'manager' }, owner.userId);
  const { token } = auth.createInvite(u.userId);
  assert.equal(auth.peekInvite(token)?.name, 'Garv');
  const session = auth.acceptInvite(token, 'garv-chosen-pass-1');
  assert.ok(session, 'invite sets the password and signs in');
  assert.equal(auth.acceptInvite(token, 'again-pass-123'), null, 'an invite works once');
  assert.ok(await auth.login('garv', 'garv-chosen-pass-1'));
  const p = await auth.authenticate(session!.token);
  assert.equal(p?.role, 'manager');
});

test('eight wrong passwords lock the account for a while', async () => {
  auth.createUser({ username: 'akshita', name: 'Akshita', role: 'employee', password: 'akshita-pass-123' }, owner.userId);
  for (let i = 0; i < 8; i++) assert.equal(await auth.login('akshita', 'wrong-' + i), null);
  assert.equal(await auth.login('akshita', 'akshita-pass-123'), null, 'locked even with the right password');
});

test('disabling a user ends their session at once', async () => {
  const u = auth.createUser({ username: 'temp', name: 'Temp', role: 'employee', password: 'temp-pass-1234' }, owner.userId);
  const s = await auth.login('temp', 'temp-pass-1234');
  assert.ok(await auth.authenticate(s!.token));
  auth.updateUser(u.userId, { active: false });
  assert.equal(await auth.authenticate(s!.token), null);
});

test('the last active CEO cannot be disabled or demoted', () => {
  assert.throws(() => auth.updateUser(owner.userId, { active: false }));
  assert.throws(() => auth.updateUser(owner.userId, { role: 'employee' }));
});
