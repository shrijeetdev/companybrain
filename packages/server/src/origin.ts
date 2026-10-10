import type { FastifyRequest } from 'fastify';

const HOST_RE = /^[A-Za-z0-9.-]+(?::\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](?::\d{1,5})?$/;

/**
 * Origin of the request as the client sees it. `protocol`/`host` honour X-Forwarded-* only
 * when `trustProxy` is configured. The host is validated so it can't inject into URLs.
 */
export function requestOrigin(req: FastifyRequest): string {
  const proto = req.protocol === 'https' ? 'https' : 'http';
  const host = typeof req.host === 'string' && HOST_RE.test(req.host) ? req.host : 'localhost';
  return `${proto}://${host}`;
}

/** Public base URL: configured COMPANYBRAIN_PUBLIC_URL, else the request origin. */
export function baseUrl(publicUrl: string | null, req: FastifyRequest): string {
  return (publicUrl ? publicUrl.replace(/\/+$/, '') : null) ?? requestOrigin(req);
}
