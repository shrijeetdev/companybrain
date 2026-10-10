// Small shared helpers: logging, fetch with timeout, phone normalisation.

export interface Logger {
  info(...a: unknown[]): void;
  warn(...a: unknown[]): void;
  error(...a: unknown[]): void;
}

/** Default logger: stderr only (stdout must stay clean for `companybrain mcp`). */
export const defaultLogger: Logger = {
  info: (...a) => console.error('[integrations]', ...a),
  warn: (...a) => console.error('[integrations]', ...a),
  error: (...a) => console.error('[integrations]', ...a),
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** global fetch with a hard timeout (AbortSignal). Throws on timeout/network error. */
export async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  return fetchImpl(url, { ...init, signal });
}

/** Read a response body as text, but never more than `max` characters (for error logs). */
export async function safeText(res: Response, max = 500): Promise<string> {
  try {
    const t = await res.text();
    return t.length > max ? `${t.slice(0, max)}…` : t;
  } catch {
    return '';
  }
}

/**
 * Normalise a phone number to E.164 (`+<country><number>`, 8–15 digits).
 * Accepts "+91 98765-43210", "0091…", "(415) 555 0100" with a leading +/00, WhatsApp JIDs
 * ("919876543210@s.whatsapp.net", "…:12@s.whatsapp.net"). Returns null when it can't be E.164.
 * Numbers without a country code cannot be fixed reliably and are accepted as-is if long enough.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input).trim();
  const at = s.indexOf('@');
  if (at >= 0) {
    if (!/@(s\.whatsapp\.net|c\.us)$/i.test(s)) return null; // not a phone JID (group, lid, …)
    s = s.slice(0, at).split(':')[0] ?? '';
  }
  s = s.replace(/^(tel:|whatsapp:)/i, '');
  let digits = s.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.includes('+')) return null;
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}

/** E.164 without the plus — the format WhatsApp APIs want. */
export function phoneDigits(input: string | null | undefined): string | null {
  const p = normalizePhone(input);
  return p ? p.slice(1) : null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Exponential backoff with full jitter-free cap: base * 2^attempt, capped. */
export function backoffMs(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(maxMs, baseMs * 2 ** Math.min(attempt, 20));
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Race a promise against a timeout; rejects with Error('timeout') on expiry. */
export function withTimeout<T>(p: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref?.();
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}
