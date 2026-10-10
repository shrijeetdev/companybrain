// GET /api/stream — Server-Sent Events of LiveEvent for the authenticated member.
// Registered inside the authenticated /api scope (EventSource sends the session cookie).
//
// A stream outlives the request that authenticated it, so the credential (session cookie or
// API key) is re-checked before every event and on every ping: a revoked session, revoked key,
// deactivated member or role change ends the stream. At most MAX_STREAMS_PER_MEMBER streams
// per member stay open; a new one closes the oldest.
import type { FastifyInstance } from 'fastify';
import type { Actor, LiveEvent } from '@companybrain/types';
import type { ServerDeps } from '../types';
import { bearerToken } from '../http';

export const PING_MS = 25_000;
export const MAX_STREAMS_PER_MEMBER = 5;

export function registerStream(api: FastifyInstance, deps: ServerDeps, opts: { pingMs?: number; maxPerMember?: number } = {}) {
  const pingMs = Math.min(opts.pingMs ?? PING_MS, PING_MS);
  const maxPerMember = opts.maxPerMember ?? MAX_STREAMS_PER_MEMBER;
  /** Open streams per member, oldest first (Set keeps insertion order). */
  const open = new Map<string, Set<() => void>>();

  api.get('/api/stream', async (req, reply) => {
    const actor = req.actor!;
    const auth = deps.services.auth;
    const sessionToken = req.sessionToken;
    const apiKey = sessionToken === null ? bearerToken(req) : null;
    const stillValid = async (): Promise<boolean> => {
      let now: Actor | null = null;
      try {
        if (sessionToken !== null) now = await auth.resolveSession(sessionToken);
        else if (apiKey) now = await auth.resolveApiKey(apiKey);
      } catch (err) {
        req.log.warn({ err }, 'sse revalidation failed');
        return false;
      }
      return !!now && now.memberId === actor.memberId && now.orgId === actor.orgId && now.role === actor.role;
    };

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
    let timer: NodeJS.Timeout | null = null;
    let unsubscribe: (() => void) | null = null;
    const write = (e: LiveEvent) => {
      if (closed || res.writableEnded) return;
      try {
        res.write(`data: ${JSON.stringify(e)}\n\n`);
      } catch (err) {
        req.log.warn({ err }, 'sse write failed');
        cleanup();
      }
    };
    // Re-validate the credential before anything goes out; keep events in order.
    let chain: Promise<void> = Promise.resolve();
    const deliver = (e: LiveEvent) => {
      if (closed) return;
      chain = chain.then(async () => {
        if (closed) return;
        if (!(await stillValid())) return cleanup();
        write(e);
      });
    };

    res.write('retry: 5000\n\n');
    write({ type: 'ping', at: Date.now() });

    // Per-member cap: evict the oldest streams.
    const key = `${actor.orgId}:${actor.memberId}`;
    let mine = open.get(key);
    if (!mine) open.set(key, (mine = new Set()));
    while (mine.size >= maxPerMember) {
      const oldest = mine.values().next().value as (() => void) | undefined;
      if (!oldest) break;
      mine.delete(oldest);
      oldest();
    }
    const evict = () => {
      // Ask the evicted browser tab to back off before reconnecting.
      if (!closed && !res.writableEnded) res.write('retry: 60000\n\n');
      cleanup();
    };
    mine.add(evict);

    try {
      unsubscribe = deps.services.live.subscribe(actor.orgId, actor.memberId, deliver);
    } catch (err) {
      req.log.error({ err }, 'live subscribe failed');
      cleanup();
      return;
    }
    timer = setInterval(() => deliver({ type: 'ping', at: Date.now() }), pingMs);
    timer.unref?.();

    function cleanup() {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      const set = open.get(key);
      if (set) {
        set.delete(evict);
        if (!set.size) open.delete(key);
      }
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
