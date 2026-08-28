// Credential encryption at rest — key handling, the production guard, and key migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { encryptJSON, decryptJSON, assertEncryptionKey, usingFallbackEncryptionKey } =
  await import('../src/crypto');

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { fn(); } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

test('crypto: round-trips under a configured key', () => {
  withEnv({ COMPANYBRAIN_ENC_KEY: 'a-real-production-key' }, () => {
    const blob = encryptJSON({ appPassword: 'abcd efgh', apiUrl: 'https://blog.example.com' });
    assert.ok(blob.startsWith('enc:v1:'), 'stored in the versioned envelope');
    assert.ok(!blob.includes('abcd'), 'no plaintext in the stored value');
    assert.deepEqual(decryptJSON(blob), { appPassword: 'abcd efgh', apiUrl: 'https://blog.example.com' });
  });
});

test('crypto: a row written without a key still opens after one is set', () => {
  let blob = '';
  withEnv({ COMPANYBRAIN_ENC_KEY: undefined }, () => {
    blob = encryptJSON({ token: 'written-before-the-key' });
  });
  withEnv({ COMPANYBRAIN_ENC_KEY: 'a-real-production-key' }, () => {
    assert.deepEqual(decryptJSON(blob), { token: 'written-before-the-key' },
      'setting a key must not strand existing credentials');
  });
});

test('crypto: a row from a different key does not crash the caller', () => {
  let blob = '';
  withEnv({ COMPANYBRAIN_ENC_KEY: 'the-old-key' }, () => { blob = encryptJSON({ token: 'x' }); });
  withEnv({ COMPANYBRAIN_ENC_KEY: 'a-rotated-key' }, () => {
    assert.deepEqual(decryptJSON(blob), {}, 'undecryptable reads as empty, not a throw');
  });
});

test('crypto: production refuses to run on the in-repo fallback key', () => {
  withEnv({ COMPANYBRAIN_ENC_KEY: undefined }, () => {
    assert.equal(usingFallbackEncryptionKey(), true);
    assert.throws(() => assertEncryptionKey({ NODE_ENV: 'production' } as any), /COMPANYBRAIN_ENC_KEY/);
  });
});

test('crypto: production is happy once a key is set, and development never blocks', () => {
  withEnv({ COMPANYBRAIN_ENC_KEY: 'a-real-production-key' }, () => {
    assert.doesNotThrow(() => assertEncryptionKey({ NODE_ENV: 'production' } as any));
  });
  withEnv({ COMPANYBRAIN_ENC_KEY: undefined }, () => {
    assert.doesNotThrow(() => assertEncryptionKey({ NODE_ENV: 'development' } as any));
  });
});

test('crypto: legacy plaintext rows are still readable', () => {
  assert.deepEqual(decryptJSON('{"legacy":true}'), { legacy: true });
});
