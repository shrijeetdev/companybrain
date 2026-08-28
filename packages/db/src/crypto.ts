// AES-256-GCM encryption for credentials stored at rest (channel tokens, the WordPress
// application password, anything in connections.credentials).
//
// The key comes from COMPANYBRAIN_ENC_KEY. Without it we fall back to a key derived from a
// fixed seed, which keeps development free of configuration while still avoiding
// plaintext-at-rest — but that seed is in this file, and this file is in the repository, so
// the fallback protects nothing against anyone who can read the source. Production therefore
// REFUSES to start without a real key (see assertEncryptionKey, called at boot).
//
// Setting a key on an install that has been running on the fallback is non-breaking:
// decryption tries the configured key first and then the legacy fallback, so existing rows
// keep opening and are written back under the new key the next time they are saved.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 16;

/** The keyless fallback. Derived from a constant in this file — development only. */
const LEGACY_DEV_KEY = scryptSync('companybrain-dev-key', 'salt', KEY_LEN);

function configuredSecret(): string {
  return (process.env.COMPANYBRAIN_ENC_KEY ?? '').trim();
}

function getKey(): Buffer {
  const secret = configuredSecret();
  return secret ? scryptSync(secret, 'companybrain-salt', KEY_LEN) : LEGACY_DEV_KEY;
}

/** True when credentials are being protected by the in-repo fallback key rather than a real one. */
export function usingFallbackEncryptionKey(): boolean {
  return configuredSecret().length === 0;
}

/**
 * Fail closed at boot: a production deployment must not encrypt customer credentials with a
 * key published in this repository. Called from the app entrypoint; throws with the fix.
 */
export function assertEncryptionKey(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  if (!usingFallbackEncryptionKey()) return;
  throw new Error(
    'COMPANYBRAIN_ENC_KEY is not set. Stored credentials (channel tokens, the WordPress ' +
    'application password) would be encrypted with a key derived from a constant in this ' +
    'repository, which anyone who can read the source can reproduce. Generate one and set it ' +
    'in the environment:\n\n' +
    '  node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"\n\n' +
    'Keep it safe: losing it means re-entering every stored credential.',
  );
}

export function encryptJSON(data: unknown): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: enc:v1:<iv_hex>:<tag_hex>:<data_hex>
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function tryDecrypt(key: Buffer, iv: Buffer, tag: Buffer, data: Buffer): unknown | undefined {
  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return undefined; // wrong key, or the row was tampered with — GCM catches both
  }
}

export function decryptJSON(encrypted: string): unknown {
  if (!encrypted.startsWith('enc:v1:')) {
    // Legacy plaintext — return as-is (migration tolerant)
    try { return JSON.parse(encrypted); } catch { return {}; }
  }
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[2]!, 'hex');
  const tag = Buffer.from(parts[3]!, 'hex');
  const data = Buffer.from(parts[4]!, 'hex');

  const withConfigured = tryDecrypt(getKey(), iv, tag, data);
  if (withConfigured !== undefined) return withConfigured;

  // Written before a key was configured. Open it with the old key so setting
  // COMPANYBRAIN_ENC_KEY does not strand existing credentials; the next save re-encrypts
  // under the real key.
  if (!usingFallbackEncryptionKey()) {
    const withLegacy = tryDecrypt(LEGACY_DEV_KEY, iv, tag, data);
    if (withLegacy !== undefined) return withLegacy;
  }

  // Undecryptable: a rotated key with no legacy match, or a corrupted row. Returning {} keeps
  // one bad connection row from taking down every page that lists connections; the operator
  // sees the credential as missing and can re-enter it.
  return {};
}
