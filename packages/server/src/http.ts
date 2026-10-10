import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError, HTTP_STATUS, type ErrorCode } from '@companybrain/types';

export const SESSION_COOKIE = 'cb_session';
export const CSRF_HEADER = 'x-cb-client';
export const CSRF_VALUE = 'web';
export const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
}

export function errorBody(code: ErrorCode, message: string, details?: Record<string, unknown>): ErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

export function sendError(reply: FastifyReply, code: ErrorCode, message: string, details?: Record<string, unknown>, status?: number) {
  return reply.code(status ?? HTTP_STATUS[code]).type('application/json; charset=utf-8').send(errorBody(code, message, details));
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
};

function isAppError(err: unknown): err is AppError {
  if (err instanceof AppError) return true;
  // Tolerate a duplicated copy of the types module (structural check).
  const e = err as { name?: unknown; code?: unknown };
  return !!e && e.name === 'AppError' && typeof e.code === 'string' && e.code in HTTP_STATUS;
}

export function zodDetails(err: z.ZodError): Record<string, unknown> {
  return {
    issues: err.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message, code: i.code })),
  };
}

/** Root error handler: every error leaves the server as `{ error: { code, message, details? } }`. */
export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (isAppError(err)) {
    const status = HTTP_STATUS[err.code] ?? 500;
    if (status >= 500) req.log.error({ err }, 'service error');
    if (err.code === 'internal') return sendError(reply, 'internal', 'Internal server error');
    return sendError(reply, err.code, err.message, err.details);
  }
  if (err instanceof z.ZodError) {
    return sendError(reply, 'bad_request', 'Invalid request', zodDetails(err));
  }
  const fe = err as FastifyError;
  if (fe.validation) {
    return sendError(reply, 'bad_request', fe.message);
  }
  const status = typeof fe.statusCode === 'number' ? fe.statusCode : 500;
  if (status >= 400 && status < 500) {
    // Fastify-generated client errors (bad JSON, 413, 415, …) — messages are safe to expose.
    const code = STATUS_TO_CODE[status] ?? 'bad_request';
    return sendError(reply, code, fe.message || 'Bad request', undefined, status);
  }
  req.log.error({ err }, 'unhandled error');
  return sendError(reply, 'internal', 'Internal server error');
}

// ─── Cookies ────────────────────────────────────────────────────────────────

export function readCookie(req: FastifyRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function isSecureRequest(req: FastifyRequest, secureCookies: 'auto' | boolean): boolean {
  if (secureCookies === true) return true;
  if (secureCookies === false) return false;
  // `request.protocol` honours X-Forwarded-Proto only when trustProxy is configured.
  return req.protocol === 'https';
}

export function sessionCookie(token: string, expiresAt: number, secure: boolean, now = Date.now()): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${new Date(now + maxAge * 1000).toUTCString()}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(h);
  return m ? m[1]! : null;
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/** Strip secrets (URL-embedded MCP keys, `?secret=`) from URLs before logging. */
export function redactUrl(url: string): string {
  let out = url.replace(/(\/mcp\/k\/)[^/?#]+/i, '$1[REDACTED]');
  out = out.replace(/([?&](?:secret|key|token|hub\.verify_token)=)[^&#]*/gi, '$1[REDACTED]');
  return out;
}

/** Normalised view of a path, used ONLY to decide how to render a 404 (never for auth). */
export function looksLikeApiPath(url: string): boolean {
  let p = url.split('?')[0] ?? '';
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep raw */
  }
  p = p.toLowerCase().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  return /^\/(?:\.\/)*(api|mcp|webhooks|health)(?:[/.?;]|$)/.test(p);
}
