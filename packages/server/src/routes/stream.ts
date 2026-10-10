// GET /api/stream — Server-Sent Events of LiveEvent for the authenticated member.
// Registered inside the authenticated /api scope (EventSource sends the session cookie).
import type { FastifyInstance } from 'fastify';
import type { LiveEvent } from '@companybrain/types';
import type { ServerDeps } from '../types';

export const PING_MS = 25_000;

export function registerStream(api: FastifyInstance, deps: ServerDeps, opts: { pingMs?: number } = {}) {
  const pingMs = opts.pingMs ?? PING_MS;
  api.get('/api/stream', async (req, reply) => {
    const actor = req.actor!;
    const headers = reply.getHeaders();
    reply.hijack();
    const res = reply.raw;
    const out: Record<string, string | number | string[]> = {};
    for (const [k, v] of Object.entries(headers)) if (v !== undefined) out[k] = v as string | number | string[];
    res.writeHead(200, {
      ...out,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.socket?.setNoDelay(true);

    let closed = false;
    const write = (e: LiveEvent) => {
      if (closed || res.writableEnded) return;
      try {
        res.write(`data: ${JSON.stringify(e)}\n\n`);
      } catch (err) {
        req.log.warn({ err }, 'sse write failed');
        cleanup();
      }
    };

    res.write('retry: 5000\n\n');
    write({ type: 'ping', at: Date.now() });

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = deps.services.live.subscribe(actor.orgId, actor.memberId, write);
    } catch (err) {
      req.log.error({ err }, 'live subscribe failed');
      res.end();
      return;
    }
    const timer = setInterval(() => write({ type: 'ping', at: Date.now() }), pingMs);
    timer.unref?.();

    function cleanup() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      try {
        unsubscribe?.();
      } catch {
        /* ignore */
      }
      if (!res.writableEnded) res.end();
    }
    res.on('close', cleanup);
    res.on('error', cleanup);
  });
}
