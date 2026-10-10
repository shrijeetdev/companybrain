// MCP Streamable HTTP mount: /mcp (Bearer) and /mcp/k/:key (key in URL, for URL-only connectors).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerDeps } from '../types';
import type { Limiter } from '../auth';
import { bearerToken } from '../http';
import { protectedResourceMetadataUrl } from '../oauth';

const METHODS = ['GET', 'POST', 'DELETE'] as const;

export async function registerMcp(app: FastifyInstance, deps: ServerDeps, limit: Limiter) {
  await app.register(async (mcp) => {
    // Identify first (so the limiter can key by actor), then rate-limit, then reject.
    mcp.addHook('onRequest', async (req) => {
      req.actor = null;
      req.sessionToken = null;
      const params = (req.params ?? {}) as { key?: string };
      const raw = params.key ?? bearerToken(req);
      if (raw && raw.length <= 512) {
        const actor = await deps.services.auth.resolveApiKey(raw);
        if (actor) req.actor = { ...actor, via: 'api_key' };
      }
    });
    mcp.addHook('onRequest', limit);

    const handler = async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = req.actor;
      if (!actor) {
        return reply
          .code(401)
          .header('www-authenticate', `Bearer resource_metadata="${protectedResourceMetadataUrl(deps, req)}"`)
          .header('cache-control', 'no-store')
          .type('application/json; charset=utf-8')
          .send({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: missing or invalid API key' }, id: null });
      }
      // Hand the raw socket to the MCP transport; Fastify must not touch the response after this.
      const headers = reply.getHeaders();
      reply.hijack();
      for (const [k, v] of Object.entries(headers)) {
        if (v !== undefined && !reply.raw.headersSent) reply.raw.setHeader(k, v as string | number | string[]);
      }
      try {
        await deps.mcp.handleHttp(deps.services, actor, req.raw, reply.raw, req.body);
      } catch (err) {
        req.log.error({ err }, 'mcp handler failed');
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
          reply.raw.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }));
        } else if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      }
    };

    mcp.route({ method: [...METHODS], url: '/mcp', handler });
    mcp.route({ method: [...METHODS], url: '/mcp/k/:key', handler });
  });
}
