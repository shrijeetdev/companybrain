import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, ROLE_RANK, type Actor, type ApiScope, type Role } from '@companybrain/types';
import type { ServerDeps } from './types';
import { bearerToken, CSRF_HEADER, CSRF_VALUE, MUTATING_METHODS, readCookie, SESSION_COOKIE } from './http';

const MAX_TOKEN_LEN = 512;

/**
 * Resolve the actor from `Authorization: Bearer` (API key) or the `cb_session` cookie.
 * Never rejects — `requireActor` does that. A present-but-invalid Bearer header does NOT
 * fall back to the cookie (ambiguous credentials are treated as unauthenticated).
 */
export function makeIdentify(deps: ServerDeps) {
  return async function identify(req: FastifyRequest) {
    req.actor = null;
    req.sessionToken = null;
    if (req.headers.authorization !== undefined) {
      const raw = bearerToken(req);
      if (raw && raw.length <= MAX_TOKEN_LEN) {
        const actor = await deps.services.auth.resolveApiKey(raw);
        if (actor) req.actor = { ...actor, via: 'api_key' };
      }
      return;
    }
    const token = readCookie(req, SESSION_COOKIE);
    if (token && token.length <= MAX_TOKEN_LEN) {
      const actor = await deps.services.auth.resolveSession(token);
      if (actor) {
        req.actor = { ...actor, via: 'session' };
        req.sessionToken = token;
      }
    }
  };
}

/** Rejects unauthenticated requests and enforces the CSRF header on cookie-authenticated mutations. */
export async function requireActor(req: FastifyRequest) {
  if (!req.actor) throw new AppError('unauthorized', 'Authentication required');
  if (req.sessionToken !== null) checkCsrf(req);
}

export function checkCsrf(req: FastifyRequest) {
  if (MUTATING_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== CSRF_VALUE) {
    throw new AppError('forbidden', 'Missing X-CB-Client header (CSRF protection)');
  }
}

export function requireRole(actor: Actor, min: Role) {
  if (ROLE_RANK[actor.role] < ROLE_RANK[min]) throw new AppError('forbidden', `Requires ${min} role or higher`);
}

export function requireScope(actor: Actor, scope: ApiScope) {
  if (actor.via === 'api_key' && !(actor.scopes ?? []).includes(scope)) {
    throw new AppError('forbidden', `API key lacks the '${scope}' scope`);
  }
}

// ─── Rate limiting ──────────────────────────────────────────────────────────

export type Limiter = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * Builds a limiter hook from @fastify/rate-limit's `createRateLimit` (which, unlike the
 * `rateLimit` hook, can be stacked: global + strict-auth limits on the same request).
 */
export function makeLimiter(
  app: FastifyInstance,
  opts: { max: number; windowMs: number; key: (req: FastifyRequest) => string; prefix: string },
): Limiter {
  const check = app.createRateLimit({
    max: opts.max,
    timeWindow: opts.windowMs,
    keyGenerator: (req: FastifyRequest) => `${opts.prefix}:${opts.key(req)}`,
  });
  return async (req, reply) => {
    const r = await check(req);
    if (r.isAllowed) return;
    reply.header('x-ratelimit-limit', r.max);
    reply.header('x-ratelimit-remaining', r.remaining);
    reply.header('x-ratelimit-reset', r.ttlInSeconds);
    if (r.isExceeded) {
      reply.header('retry-after', r.ttlInSeconds);
      throw new AppError('rate_limited', `Too many requests, retry in ${r.ttlInSeconds}s`);
    }
  };
}

export const actorOrIp = (req: FastifyRequest) => (req.actor ? `m:${req.actor.memberId}` : `ip:${req.ip}`);
