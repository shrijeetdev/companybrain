// Bootstrap-admin password policy — the one account nobody gets to create weakly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeWeakPassword } from '../src/password';

test('policy: rejects short passwords', () => {
  assert.match(describeWeakPassword('short1!') ?? '', /shorter than 12/);
  assert.match(describeWeakPassword('elevenchars') ?? '', /shorter than 12/);
});

test('policy: rejects commonly used passwords', () => {
  for (const pw of ['1234@1234work', 'administrator', 'companybrain']) {
    assert.match(describeWeakPassword(pw) ?? '', /commonly used/, pw);
  }
});

test('policy: rejects low-entropy shapes', () => {
  assert.match(describeWeakPassword('aaaaaaaaaaaaaaaa') ?? '', /repeated character/);
  assert.match(describeWeakPassword('abababababababab') ?? '', /distinct characters/);
});

test('policy: accepts a generated password', () => {
  assert.equal(describeWeakPassword('Xk7pQ2mvR4tLz9Bn'), null);
  assert.equal(describeWeakPassword('correct-horse-battery-staple-42'), null);
});
