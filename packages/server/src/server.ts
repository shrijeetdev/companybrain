import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { ServerDeps } from './types';
import { actorOrIp, makeIdentify, makeLimiter, requireActor } from './auth';
import { errorHandler, isSecureRequest, looksLikeApiPath, redactUrl, sendError } from './http';
import { mount, publicRoute, type RouteDocInfo } from './route';
import { apiRoutes } from './routes/api';
import { publicRoutes } from './routes/public';
import { registerStream } from './routes/stream';
import { registerWebhooks } from './routes/webhooks';
import { registerMcp } from './routes/mcp';
import { CodeStore, oauthApiRoutes, registerOAuthPublic } from './oauth';
import { buildOpenApi } from './openapi';
import { baseUrl } from './origin';

export const BODY_LIMIT = 1_048_576; // 1 MB
const MINUTE = 60_000;

/** Content-Security-Policy for the Vite React SPA served from the same origin. */
export const CSP_DIRECTIVES: Record<string, string[]> = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],
  // React/motion set inline `style` attributes; CSS injection is low-risk vs. script.
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  fontSrc: ["'self'", 'data:'],
  connectSrc: ["'self'"],
  mediaSrc: ["'self'", 'blob:', 'data:'],
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
  objectSrc: ["'none'"],
  frameSrc: ["'none'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
};

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const cfg = deps.config;
  const app = Fastify({
    logger: {
      level: cfg.logLevel || 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'headers.authorization',
          'headers.cookie',
          '*.password',
          '*.current',
          '*.next',
          '*.token',
          '*.raw',
          '*.access_token',
          '*.code_verifier',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req(req: FastifyRequest) {
          return {
            method: req.method,
            url: redactUrl(req.url),
            remoteAddress: req.ip,
            userAgent: req.headers?.['user-agent'],
          };
        },
      },
    },
    trustProxy: cfg.trustProxy as boolean,
    bodyLimit: BODY_LIMIT,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    return503OnClosing: true,
  });

  app.decorateRequest('actor', null);
  app.decorateRequest('sessionToken', null);

  // ─── Body parsing: JSON only; an empty JSON body is `{}` ─────────────────
  const defaultJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser(['application/json', 'text/plain']);
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if ((body as string).trim() === '') return done(null, {});
    return defaultJson(req, body as string, done);
  });

  app.setErrorHandler(errorHandler);

  // ─── Security headers ───────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
    hsts: false, // set below, only on secure requests
    crossOriginEmbedderPolicy: false,
  });
  app.addHook('onRequest', async (req, reply) => {
    if (isSecureRequest(req, cfg.secureCookies)) {
      reply.header('strict-transport-security', 'max-age=15552000; includeSubDomains');
    }
  });
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  // ─── CORS: off unless explicit origins are configured ───────────────────
  const allowed = new Set(cfg.corsOrigins.filter((o) => o && o !== '*').map((o) => o.replace(/\/+$/, '')));
  if (allowed.size) {
    app.addHook('onRequest', async (req, reply) => {
      // OAuth/discovery endpoints have their own open (credential-less) CORS policy.
      if (req.url.startsWith('/oauth/') || req.url.startsWith('/.well-known/')) return;
      const origin = req.headers.origin;
      if (!origin || !allowed.has(origin)) return;
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-credentials', 'true');
      reply.header('vary', 'Origin');
      if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
        reply.header('access-control-allow-methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
        reply.header('access-control-allow-headers', 'Content-Type, Authorization, X-CB-Client, MCP-Protocol-Version, Mcp-Session-Id');
        reply.header('access-control-max-age', '600');
        return reply.code(204).send();
      }
    });
  }

  // ─── Rate limiting (registered AND awaited) ─────────────────────────────
  await app.register(rateLimit, { global: false });
  const authIds = new WeakMap<FastifyRequest, string>();
  const globalLimit = makeLimiter(app, { max: 300, windowMs: MINUTE, key: actorOrIp, prefix: 'g' });
  const authIdLimit = makeLimiter(app, { max: 10, windowMs: MINUTE, prefix: 'auth', key: (req) => `${req.ip}|${authIds.get(req) ?? ''}` });
  const authIpLimit = makeLimiter(app, { max: 60, windowMs: MINUTE, prefix: 'auth-ip', key: (req) => req.ip });
  const authLimit = async (req: FastifyRequest, identifier: string, reply: import('fastify').FastifyReply) => {
    authIds.set(req, identifier.trim().toLowerCase());
    await authIpLimit(req, reply);
    await authIdLimit(req, reply);
  };

  const identify = makeIdentify(deps);
  const codes = new CodeStore(() => (deps.clock ?? Date.now)());

  // ─── Public routes ──────────────────────────────────────────────────────
  const pubDefs = publicRoutes(deps, { authLimit, identify });
  const apiDefs = [...apiRoutes(deps), ...oauthApiRoutes(deps, codes)];
  const docRoutes: RouteDocInfo[] = [
    ...pubDefs,
    ...apiDefs,
    {
      method: 'GET', path: '/api/stream', operationId: 'liveStream', tag: 'Realtime', auth: true,
      summary: 'Server-Sent Events of live changes (LiveEvent JSON per `data:` line, ping every 25 s)',
      response: { kind: 'sse', description: 'text/event-stream of LiveEvent' },
    },
  ];
  const openapiCache = new Map<string, unknown>();
  const openapiDef = publicRoute({
    method: 'GET', path: '/api/openapi.json', operationId: 'openapi', tag: 'Meta', summary: 'This document',
    response: { kind: 'raw', mime: 'application/json', description: 'OpenAPI 3.1' },
    handler: async ({ req, reply }) => {
      const serverUrl = baseUrl(cfg.publicUrl, req);
      let doc = openapiCache.get(serverUrl);
      if (!doc) {
        doc = buildOpenApi(docRoutes, { version: cfg.version, serverUrl });
        if (openapiCache.size < 16) openapiCache.set(serverUrl, doc);
      }
      reply.header('access-control-allow-origin', '*');
      reply.header('cache-control', 'public, max-age=300');
      return doc;
    },
  });

  await app.register(async (pub) => {
    pub.addHook('onRequest', globalLimit);
    mount(pub, [...pubDefs, openapiDef]);
  });

  // ─── Authenticated API: auth enforced by this encapsulated scope ────────
  await app.register(async (api) => {
    api.addHook('onRequest', identify);
    api.addHook('onRequest', globalLimit);
    api.addHook('onRequest', requireActor);
    api.addHook('onSend', async (_req, reply) => {
      if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    });
    mount(api, apiDefs);
    registerStream(api, deps);
  });

  await registerOAuthPublic(app, deps, codes, globalLimit);
  await registerWebhooks(app, deps, globalLimit);
  await registerMcp(app, deps, globalLimit);

  // ─── SPA ────────────────────────────────────────────────────────────────
  let spa = false;
  if (cfg.webDir) {
    const root = resolve(cfg.webDir);
    if (existsSync(root) && statSync(root).isDirectory()) {
      spa = existsSync(resolve(root, 'index.html'));
      await app.register(fastifyStatic, {
        root,
        prefix: '/',
        wildcard: true,
        index: ['index.html'],
        dotfiles: 'ignore',
        cacheControl: false,
        setHeaders(res, filePath) {
          const name = basename(filePath);
          if (filePath.includes(`${sep}assets${sep}`)) {
            res.setHeader('cache-control', 'public, max-age=31536000, immutable');
          } else if (name === 'index.html' || name === 'sw.js' || name === 'manifest.webmanifest') {
            res.setHeader('cache-control', 'no-cache');
          } else {
            res.setHeader('cache-control', 'public, max-age=3600');
          }
          // Content types come from @fastify/send's mime table (JS for sw.js,
          // application/manifest+json for .webmanifest).
          if (name === 'sw.js') res.setHeader('service-worker-allowed', '/');
        },
      });
    } else {
      app.log.warn({ webDir: root }, 'webDir does not exist — serving API only');
    }
  }

  app.setNotFoundHandler(async (req, reply) => {
    const path = req.url.split('?')[0] ?? '/';
    const last = path.slice(path.lastIndexOf('/') + 1);
    const isFile = /\.[A-Za-z0-9]{1,12}$/.test(last);
    if (spa && (req.method === 'GET' || req.method === 'HEAD') && !looksLikeApiPath(req.url) && !isFile) {
      reply.header('cache-control', 'no-cache');
      return reply.sendFile('index.html');
    }
    return sendError(reply, 'not_found', 'Not found');
  });

  return app;
}
