// Small input validators. All throw AppError('bad_request') with a field-specific message.

import { AppError } from '@companybrain/types';
import { ID_PATTERN, isValidTimezone } from '@companybrain/db';

export function bad(message: string, details?: Record<string, unknown>): never {
  throw new AppError('bad_request', message, details);
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(v: unknown, field: string, opts: { min?: number; max?: number; trim?: boolean } = {}): string {
  if (typeof v !== 'string') bad(`${field} must be a string`);
  const s = opts.trim === false ? v : v.trim();
  const min = opts.min ?? 1;
  const max = opts.max ?? 1000;
  if (s.length < min) bad(min <= 1 ? `${field} is required` : `${field} must be at least ${min} characters`);
  if (s.length > max) bad(`${field} must be at most ${max} characters`);
  return s;
}

export function optStr(v: unknown, field: string, max = 1000): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') bad(`${field} must be a string`);
  const s = v.trim();
  if (s.length > max) bad(`${field} must be at most ${max} characters`);
  return s || null;
}

export function bool(v: unknown, field: string): boolean {
  if (typeof v !== 'boolean') bad(`${field} must be a boolean`);
  return v;
}

export function int(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) bad(`${field} must be an integer`);
  if (v < min || v > max) bad(`${field} must be between ${min} and ${max}`);
  return v;
}

export function num(v: unknown, field: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${field} must be a number`);
  if (v < min || v > max) bad(`${field} is out of range`);
  return v;
}

/** Epoch-ms timestamp (years 2000–2200) or null. */
export function optTime(v: unknown, field: string): number | null {
  if (v === null || v === undefined) return null;
  return time(v, field);
}

export function time(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${field} must be a timestamp (epoch ms)`);
  if (v < 946_684_800_000 || v > 7_258_118_400_000) bad(`${field} is out of range`);
  return Math.round(v);
}

export function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) bad(`${field} must be one of: ${allowed.join(', ')}`);
  return v as T;
}

export function id(v: unknown, field: string): string {
  if (typeof v !== 'string' || !ID_PATTERN.test(v)) bad(`${field} is not a valid id`);
  return v;
}

/** Any non-empty id-ish string (accepts imported v1 ids too). */
export function ref(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v || v.length > 64 || !/^[A-Za-z0-9_-]+$/.test(v)) bad(`${field} is not a valid id`);
  return v;
}

export function refs(v: unknown, field: string, max = 50): string[] {
  if (!Array.isArray(v)) bad(`${field} must be an array`);
  if (v.length > max) bad(`${field} has too many entries (max ${max})`);
  return [...new Set(v.map((x, i) => ref(x, `${field}[${i}]`)))];
}

export function timezone(v: unknown, field = 'timezone'): string {
  if (!isValidTimezone(v)) bad(`${field} must be a valid IANA time zone`);
  return v;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export function email(v: unknown, field = 'email'): string {
  const s = str(v, field, { max: 254 }).toLowerCase();
  if (!EMAIL.test(s)) bad(`${field} is not a valid email address`);
  return s;
}

/**
 * Phone numbers are stored in E.164 (`+<country code><number>`, 8–15 digits) so inbound WhatsApp
 * senders can be matched exactly. A leading `00` is accepted for `+`; a number without a country
 * code is rejected (it can't be matched safely).
 */
export function phone(v: unknown, field = 'phone'): string | null {
  const s = optStr(v, field, 32);
  if (s === null) return null;
  if (!/^(\+|00)[0-9 ().-]{6,28}$/.test(s)) bad(`${field} must be an international number with country code, e.g. +919876543210`);
  const digits = s.replace(/\D/g, '').replace(/^00/, '');
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) bad(`${field} must be an international number with country code, e.g. +919876543210`);
  return `+${digits}`;
}

/** ISO 4217 currency code ("usd" → "USD"); must be one the runtime's Intl knows. */
export function currency(v: unknown, field = 'currency'): string {
  if (typeof v !== 'string' || !/^[A-Za-z]{3}$/.test(v.trim())) bad(`${field} must be a 3-letter ISO 4217 code, e.g. USD or INR`);
  const code = (v as string).trim().toUpperCase();
  const known = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('currency');
  if (known && !known.includes(code)) bad(`${field} "${code}" is not a known ISO 4217 currency`);
  return code;
}

export function color(v: unknown, field = 'color'): string {
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) bad(`${field} must be a hex color like #6366f1`);
  return v.toLowerCase();
}

export function url(v: unknown, field: string, opts: { httpsOnly?: boolean } = {}): string {
  const s = str(v, field, { max: 2048 });
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    bad(`${field} must be a valid URL`);
  }
  const ok = opts.httpsOnly ? ['https:'] : ['https:', 'http:'];
  if (!ok.includes(u.protocol)) bad(`${field} must use ${ok.join(' or ')}`);
  return u.toString();
}

export function password(v: unknown, field = 'password'): string {
  if (typeof v !== 'string') bad(`${field} must be a string`);
  if (v.length < 8) bad(`${field} must be at least 8 characters`);
  if (v.length > 256) bad(`${field} must be at most 256 characters`);
  return v;
}

export function tags(v: unknown): string[] {
  if (!Array.isArray(v)) bad('tags must be an array');
  if (v.length > 30) bad('too many tags (max 30)');
  const out: string[] = [];
  for (const t of v) {
    const s = str(t, 'tag', { max: 40 }).replace(/^#/, '');
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

export function offsets(v: unknown, field = 'reminderOffsets'): number[] {
  if (!Array.isArray(v)) bad(`${field} must be an array of minutes`);
  if (v.length > 10) bad(`${field}: at most 10 reminders`);
  const out = [...new Set(v.map((x) => int(x, field, 0, 60 * 24 * 60)))];
  return out.sort((a, b) => b - a);
}
