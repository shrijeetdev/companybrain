// Async scrypt password hashing. Format `scrypt$<salt-hex>$<hash-hex>` — identical to v1, so
// imported v1 users keep their passwords (v1 passed the hex salt *string* to scrypt; so do we).

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

let dummy: Promise<string> | null = null;
/** A real hash of a random password, used to equalize timing for unknown users. */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  return dummy;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = (stored ?? '').split('$');
  const valid = parts.length === 3 && parts[0] === 'scrypt' && !!parts[1] && /^[0-9a-f]+$/i.test(parts[2] ?? '');
  const [, salt, hashHex] = valid ? parts : (await dummyHash()).split('$');
  const expected = Buffer.from(hashHex!, 'hex');
  const actual = await scryptAsync(password, salt!);
  const same = actual.length === expected.length && timingSafeEqual(actual, expected);
  return valid && same;
}
