import { randomBytes } from 'node:crypto';
import type { MemberKind, MemberPrefs } from '@companybrain/types';

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Unbiased base62 string of `len` chars from a CSPRNG. */
export function randomBase62(len: number): string {
  let out = '';
  while (out.length < len) {
    const buf = randomBytes(len * 2);
    for (const b of buf) {
      if (b < 248) out += B62[b % 62]; // 248 = 62*4 → no modulo bias
      if (out.length === len) break;
    }
  }
  return out;
}

/** `${prefix}_${16 base62 chars}` — matches the API id pattern ^[a-z]+_[A-Za-z0-9]{6,32}$. */
export function newId(prefix: string): string {
  return `${prefix}_${randomBase62(16)}`;
}

export const ID_PATTERN = /^[a-z]+_[A-Za-z0-9]{6,32}$/;

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function defaultPrefs(kind: MemberKind): MemberPrefs {
  const human = kind === 'human';
  return {
    briefingVoice: human ? 'auto' : 'off',
    voiceName: null,
    digestHour: human ? 8 : null,
    notifyPush: human,
    notifyWhatsapp: human,
    notifyEmail: false,
    quietStart: human ? 22 : null,
    quietEnd: human ? 7 : null,
    theme: 'tactical',
    sound: true,
  };
}

/** Digits only (drops +, spaces, dashes). "+91 98765-43210" → "919876543210". */
export function phoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  return d.length >= 6 ? d : null;
}

export function normEmail(email: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase();
  return e ? e : null;
}

export function systemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
