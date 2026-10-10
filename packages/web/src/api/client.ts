import type { ErrorCode } from '@companybrain/types';

export class ApiError extends Error {
  constructor(public status: number, public code: ErrorCode | 'network', message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Called whenever an authenticated request comes back 401 (session expired / revoked). */
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => { unauthorizedListeners.delete(fn); };
}

export type Query = Record<string, string | number | boolean | null | undefined | string[]>;

export function qs(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

interface RequestOpts { query?: Query; body?: unknown; raw?: boolean; signal?: AbortSignal; silent401?: boolean }

export async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  // CSRF: every cookie-authenticated mutation carries the web client header.
  if (method !== 'GET') headers['X-CB-Client'] = 'web';
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  } else if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    body = '{}';
  }
  let res: Response;
  try {
    res = await fetch(path + qs(opts.query), { method, headers, body, credentials: 'same-origin', signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'You appear to be offline. Check your connection and try again.');
  }
  if (res.status === 401 && !opts.silent401) unauthorizedListeners.forEach((fn) => fn());
  if (!res.ok) {
    let code: ErrorCode | 'network' = res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : res.status === 404 ? 'not_found' : res.status === 429 ? 'rate_limited' : 'internal';
    let message = res.status === 429 ? 'Too many requests — give it a moment.' : `Something went wrong (${res.status}).`;
    let details: Record<string, unknown> | undefined;
    try {
      const j = (await res.json()) as { error?: { code?: ErrorCode; message?: string; details?: Record<string, unknown> } };
      if (j.error?.code) code = j.error.code;
      if (j.error?.message) message = j.error.message;
      details = j.error?.details;
    } catch { /* not JSON */ }
    throw new ApiError(res.status, code, message, details);
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const http = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T = void>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
