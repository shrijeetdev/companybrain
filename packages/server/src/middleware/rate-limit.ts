import type { FastifyRateLimitOptions } from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';

export const rateLimitConfig: FastifyRateLimitOptions = {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req: FastifyRequest) => {
    return req.ip ?? req.headers['x-forwarded-for'] as string ?? 'unknown';
  },
  errorResponseBuilder: (_req: FastifyRequest, context: { ttl: number }) => ({
    error: 'Too many requests',
    message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

export const webhookRateLimitConfig: FastifyRateLimitOptions = {
  max: 30,
  timeWindow: '1 minute',
  keyGenerator: (req: FastifyRequest) => {
    return req.ip ?? req.headers['x-forwarded-for'] as string ?? 'unknown';
  },
  errorResponseBuilder: () => ({
    error: 'Too many webhook requests',
    message: 'Rate limit exceeded for webhook endpoint.',
  }),
};

export const authRateLimitConfig: FastifyRateLimitOptions = {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (req: FastifyRequest) => {
    return req.ip ?? req.headers['x-forwarded-for'] as string ?? 'unknown';
  },
  errorResponseBuilder: () => ({
    error: 'Too many auth attempts',
    message: 'Rate limit exceeded for authentication. Try again later.',
  }),
};

/**
 * AI execution endpoints spend money on every call (an LLM request per run) and can push
 * content to an external site. The global 100/min is a DoS guard, not a spend guard — this
 * keeps a compromised session or a runaway client from burning a bill.
 */
export const aiRateLimitConfig: FastifyRateLimitOptions = {
  max: 20,
  timeWindow: '1 minute',
  keyGenerator: (req: FastifyRequest) => {
    return req.ip ?? req.headers['x-forwarded-for'] as string ?? 'unknown';
  },
  errorResponseBuilder: (_req: FastifyRequest, context: { ttl: number }) => ({
    error: 'Too many AI requests',
    message: `AI execution is rate limited. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};
