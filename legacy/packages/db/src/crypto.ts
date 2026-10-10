// AES-256-GCM encryption for credentials stored at rest.
// ponytail: scrypt-derived key. Set COMPANYBRAIN_ENC_KEY in prod; dev falls back to a
// fixed-seed key so creds are never plaintext-at-rest even without config.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 16;

function getKey(): Buffer {
  const secret = process.env.COMPANYBRAIN_ENC_KEY;
  if (!secret) {
    // ponytail: fallback to a derived key from a fixed seed — NOT secure for production,
    // but prevents plaintext-at-rest in dev. Set COMPANYBRAIN_ENC_KEY in prod.
    return scryptSync('companybrain-dev-key', 'salt', KEY_LEN);
  }
  return scryptSync(secret, 'companybrain-salt', KEY_LEN);
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

export function decryptJSON(encrypted: string): unknown {
  if (!encrypted.startsWith('enc:v1:')) {
    // Legacy plaintext — return as-is (migration tolerant)
    try { return JSON.parse(encrypted); } catch { return {}; }
  }
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[2]!, 'hex');
  const tag = Buffer.from(parts[3]!, 'hex');
  const data = Buffer.from(parts[4]!, 'hex');
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}
