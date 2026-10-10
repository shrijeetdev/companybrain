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
