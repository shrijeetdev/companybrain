// Secrets at rest: AES-256-GCM. Key from COMPANYBRAIN_SECRET, or a random key generated once
// and stored next to the database (`secret.key`, mode 0600). In-memory DBs get an ephemeral key.

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface SecretBox {
  encrypt(plain: string): string;
  decrypt(sealed: string): string;
}

const PREFIX = 'enc:v2:';

export function deriveKey(secret: string): Buffer {
  const s = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  return scryptSync(s, 'companybrain-v2-secret', 32);
}

/** Load or create the encryption key for a DB at `dbPath`. */
export function loadKey(dbPath: string, env: NodeJS.ProcessEnv = process.env): Buffer {
  const fromEnv = env.COMPANYBRAIN_SECRET;
  if (fromEnv && fromEnv.trim()) return deriveKey(fromEnv);
  if (dbPath === ':memory:') return randomBytes(32);
  const file = join(dirname(dbPath), 'secret.key');
  if (existsSync(file)) return deriveKey(readFileSync(file, 'utf8'));
  const hex = randomBytes(32).toString('hex');
  try {
    writeFileSync(file, hex + '\n', { mode: 0o600, flag: 'wx' });
  } catch (err) {
    // Lost a race with another process creating it — use theirs.
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return deriveKey(readFileSync(file, 'utf8'));
    throw err;
  }
  try {
    chmodSync(file, 0o600);
  } catch {
    /* best effort on platforms without chmod */
  }
  return Buffer.from(hex, 'hex');
}

export function createSecretBox(key: Buffer): SecretBox {
  if (key.length !== 32) throw new Error('secret key must be 32 bytes');
  return {
    encrypt(plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ct.toString('base64url')}`;
    },
    decrypt(sealed: string): string {
      if (!sealed.startsWith(PREFIX)) throw new Error('not an encrypted value');
      const [ivB, tagB, ctB] = sealed.slice(PREFIX.length).split(':');
      if (!ivB || !tagB || ctB === undefined) throw new Error('malformed encrypted value');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64url')), decipher.final()]).toString('utf8');
    },
  };
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
