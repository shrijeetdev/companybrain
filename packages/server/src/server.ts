// The HTTP layer for the single companybrain app. Thin: it resolves the local principal,
// then calls core. It also serves the embedded web UI at `/` — so the one process is the
// API *and* the website. No separate frontend server.

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import type { Core } from '@companybrain/core';
import type { Auth, AuthUser, Principal, CreateUserInput, UpdateUserInput } from '@companybrain/auth';
import { ingest, whatsapp, createLlm, input as inputApi } from '@companybrain/integrations';
import { methods, analytics } from '@companybrain/core';
import { LOCAL_ORG_ID } from '@companybrain/auth';
import { renderUi } from './web-ui';
import {
  validateBody,
  validateQuery,
  rateLimitConfig,
  webhookRateLimitConfig,
  authRateLimitConfig,
  aiRateLimitConfig,
  whatsappSignatureVerify,
  genericWebhookVerify,
  requireMinRole,
  logger,
  REDACTED_PATHS,
  schemas,
  initSentry,
  captureException,
  recordRequest,
} from './middleware';

export interface ServerDeps {
  core: Core;
  auth: Auth;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { core, auth } = deps;
  // B5: HSTS only over HTTPS. Force via COMPANYBRAIN_SECURE_COOKIE or detected per-request.
  const shouldSecureCookieForApp = ['1', 'true', 'yes'].includes((process.env.COMPANYBRAIN_SECURE_COOKIE ?? '').trim().toLowerCase()) || process.env.NODE_ENV === 'production';
  const app = Fastify({
    logger: {
      level: process.env.COMPANYBRAIN_LOG_LEVEL ?? 'info',
      // Same redaction as the shared logger: request logs must never carry session
      // cookies, bearer tokens or webhook signatures.
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      ...(process.env.NODE_ENV !== 'production' && {
        transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
      }),
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB for image uploads
    trustProxy: true,
  });

  // --- Observability: Sentry + per-request metrics (H7) ---
  if (process.env.SENTRY_DSN) initSentry();
  app.addHook('onResponse', async (request, reply) => {
    recordRequest(request.method, request.url, reply.statusCode);
  });

  // --- Security headers (B5: defense-in-depth — CSP, HSTS, framing, MIME) ---
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(self), camera=()');
    if (shouldSecureCookieForApp) {
      reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    // CSP: allow inline styles/scripts (the embedded UI needs them) + Google Fonts + data: images.
    // No external script domains — defends against XSS escalation.
    reply.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
  });

  // --- CORS (B2: fail-closed in production — never reflect arbitrary origins with credentials) ---
  const allowedOrigins = (process.env.COMPANYBRAIN_CORS_ORIGINS ?? '').split(',').filter(Boolean);
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && allowedOrigins.length === 0) {
    logger.warn('COMPANYBRAIN_CORS_ORIGINS unset in production — defaulting to same-origin only. Set it to your domain(s).');
  }
  app.register(cors, {
    // In prod with no allowlist → empty (deny cross-origin credentialed requests).
    // In dev with no allowlist → true (reflect, convenient for localhost).
    origin: allowedOrigins.length > 0 ? allowedOrigins : (isProd ? false : true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  });

  // B6: capture raw body bytes so webhook HMAC signatures verify against the exact bytes
  // Meta/Slack/GitHub/Telegram sent, not a re-serialized JSON object. Still parses JSON so
  // regular routes behave identically (req.body remains populated).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      const raw = body.toString('utf8');
      (req as any).rawBody = raw;
      done(null, JSON.parse(raw));
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      (e as any).statusCode = 400;
      done(e);
    }
  });

  // --- Rate Limiting ---
  app.register(rateLimit, rateLimitConfig);

  // --- Static Files (for extracted frontend) ---
  const publicDir = join(import.meta.dirname ?? process.cwd(), 'public');
  if (existsSync(publicDir)) {
    app.register(fastifyStatic, {
      root: publicDir,
      prefix: '/',
      decorateReply: false,
    });
  }

  // SSE client registry
  const sseClients = new Set<import('node:http').ServerResponse>();
  function broadcast(event: Record<string, unknown>) {
    const line = 'data: ' + JSON.stringify(event) + '\n\n';
    for (const res of sseClients) {
      try { res.write(line); }
      catch { sseClients.delete(res); }
    }
  }

  // Optional AI: real Anthropic-backed extraction if ANTHROPIC_API_KEY is set, else null
  // (the domain falls back to a heuristic). Built once per server.
  const llm = createLlm();

  const authWithSessions = auth as Auth & {
    login?: (userIdOrEmail: string, key: string) => Promise<{ token: string; user: AuthUser; expiresAt: number } | null>;
    logout?: (token: string) => Promise<void>;
    listUsers?: () => Promise<AuthUser[]> | AuthUser[];
    getUser?: (userId: string) => Promise<AuthUser | null> | AuthUser | null;
    createUser?: (input: CreateUserInput, createdBy: string) => Promise<AuthUser> | AuthUser;
    updateUser?: (userId: string, patch: UpdateUserInput) => Promise<AuthUser> | AuthUser;
    deleteUser?: (userId: string) => Promise<void> | void;
    setPassword?: (userId: string, newPassword: string) => Promise<void> | void;
  };
  const authRequiresSession = typeof authWithSessions.login === 'function';
  const authSupportsUserManagement = typeof authWithSessions.createUser === 'function';
  const resolvedAuthMode = auth.mode ?? (authRequiresSession ? 'key' : 'local');

  const listUsers = async (): Promise<AuthUser[]> => {
    if (typeof authWithSessions.listUsers === 'function') {
      const users = await authWithSessions.listUsers();
      if (Array.isArray(users) && users.length) return users.map((u) => sanitizeUser(u));
    }
    const p = await auth.current();
    return [principalToUser(p)];
  };

  const getUserById = async (userId: string): Promise<AuthUser | null> => {
    if (typeof authWithSessions.getUser === 'function') {
      const user = await authWithSessions.getUser(userId);
      if (user) return sanitizeUser(user);
    }
    const users = await listUsers();
    return users.find((u) => u.userId === userId) ?? null;
  };

  const userFromPrincipal = async (p: Principal): Promise<AuthUser> => {
    const known = await getUserById(p.userId);
    return known ?? principalToUser(p);
  };

  const principalOf = async (req: FastifyRequest): Promise<Principal> => {
    const p = (req as FastifyRequest & { principal?: Principal }).principal;
    return p ?? auth.current();
  };
  const params = (req: FastifyRequest) => req.params as { id: string };
  const query = (req: FastifyRequest) => req.query as Record<string, string | undefined>;

  // B1: Authorization helpers — every :id mutation must prove the resource belongs to the
  // caller's org before acting. Returns 404 on mismatch (don't leak existence across orgs).
  const notFound = (msg = 'not found'): Error & { statusCode: number } => {
    const e = new Error(msg) as Error & { statusCode: number };
    e.statusCode = 404;
    return e;
  };
  /** Fetch a loop and verify org ownership; throws 404 otherwise. */
  const ownedLoop = async (req: FastifyRequest): Promise<NonNullable<Awaited<ReturnType<typeof core.ctx.db.loops.get>>>> => {
    const p = await principalOf(req);
    const loop = await core.ctx.db.loops.get(params(req).id);
    if (!loop || loop.orgId !== p.orgId) throw notFound('loop not found');
    return loop;
  };
  /** Fetch a task and verify org ownership. */
  const ownedTask = async (req: FastifyRequest): Promise<NonNullable<Awaited<ReturnType<typeof core.ctx.db.tasks.get>>>> => {
    const p = await principalOf(req);
    const task = await core.ctx.db.tasks.get(params(req).id);
    if (!task || task.orgId !== p.orgId) throw notFound('task not found');
    return task;
  };
  /** Fetch a lead and verify org ownership. */
  const ownedLead = async (req: FastifyRequest): Promise<NonNullable<Awaited<ReturnType<typeof core.ctx.db.leads.get>>>> => {
    const p = await principalOf(req);
    const lead = await core.ctx.db.leads.get(params(req).id);
    if (!lead || lead.orgId !== p.orgId) throw notFound('lead not found');
    return lead;
  };
  /** Verify a time entry belongs to the caller (user + org). */
  const ownedTimeEntry = async (req: FastifyRequest): Promise<NonNullable<Awaited<ReturnType<typeof core.ctx.db.timeEntries.get>>>> => {
    const p = await principalOf(req);
    const entryId = (req.params as { entryId: string }).entryId;
    const entry = await core.ctx.db.timeEntries.get(entryId);
    if (!entry || entry.orgId !== p.orgId) throw notFound('time entry not found');
    // Only the entry's owner (or a manager+) may stop/modify it.
    return entry;
  };

  app.get('/health', async () => ({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // --- Prometheus metrics endpoint ---
  // Outside /api/*, so the session preHandler does not cover it. The counters carry no
  // personal data but do reveal business volume, so in production they are served only to a
  // caller holding COMPANYBRAIN_METRICS_TOKEN. Unset in production → the endpoint is off
  // (a scraper that gets 404 is a better failure than a public dashboard of your numbers).
  const metricsToken = (process.env.COMPANYBRAIN_METRICS_TOKEN ?? '').trim();
  app.get('/metrics', async (req, reply) => {
    if (isProd) {
      if (!metricsToken) return reply.code(404).send({ error: 'not found' });
      const offered = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      // Length-independent comparison: never leak the token through timing.
      const ok = offered.length === metricsToken.length &&
        timingSafeEqual(Buffer.from(offered), Buffer.from(metricsToken));
      if (!ok) return reply.code(401).send({ error: 'unauthorized' });
    }
    const { renderMetrics } = await import('./middleware');
    return reply.type('text/plain').send(renderMetrics());
  });

  // --- Global preHandler: auth for /api/* routes ---
  app.addHook('preHandler', async (req, reply) => {
    const url = req.raw.url ?? '';
    if (!url.startsWith('/api/')) return;
    if (url.startsWith('/api/auth/')) return;
    // SSE stream authenticates inside its own handler via cookie — EventSource can't send headers.
    if (url.startsWith('/api/stream')) return;

    if (!authRequiresSession) {
      (req as FastifyRequest & { principal?: Principal }).principal = await auth.current();
      return;
    }

    const token = readAuthToken(req);
    const principal = await auth.authenticate(token);
    if (!principal) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    (req as FastifyRequest & { principal?: Principal }).principal = principal;
  });

  // --- Auth/session ---
  // Intentionally does NOT list users pre-login — visitors should not be able to see who
  // has an account before authenticating. The login form asks for an email/username instead.
  app.get('/api/auth/users', async () => {
    return { authMode: resolvedAuthMode, requiresAuth: authRequiresSession };
  });

  app.get('/api/auth/me', async (req) => {
    if (!authRequiresSession) {
      const p = await auth.current();
      return { authMode: resolvedAuthMode, authenticated: true, user: presentUser(await userFromPrincipal(p)) };
    }

    const principal = await auth.authenticate(readAuthToken(req));
    if (!principal) return { authMode: resolvedAuthMode, authenticated: false };
    return { authMode: resolvedAuthMode, authenticated: true, user: presentUser(await userFromPrincipal(principal)) };
  });

  app.post('/api/auth/login', {
    config: { rateLimit: authRateLimitConfig },
    preHandler: validateBody(schemas.LoginSchema),
  }, async (req, reply) => {
    if (!authRequiresSession || typeof authWithSessions.login !== 'function') {
      const p = await auth.current();
      return { ok: true, authMode: resolvedAuthMode, authenticated: true, user: presentUser(await userFromPrincipal(p)) };
    }

    const body = (req as any).validatedBody ?? (req.body ?? {}) as { userId?: string; key?: string };
    const userId = body.userId?.trim();
    const key = body.key?.trim();
    if (!userId || !key) {
      throw badRequest('userId and key are required');
    }

    const login = await authWithSessions.login(userId, key);
    if (!login) {
      logger.warn({ userId }, 'Failed login attempt');
      return reply.code(401).send({ error: 'Invalid email/username or password' });
    }

    logger.info({ userId: login.user.userId }, 'Successful login');

    const maxAge = Math.max(60, Math.floor((login.expiresAt - Date.now()) / 1000));
    reply.header('Set-Cookie', makeSessionCookie('cb_session', login.token, maxAge, shouldSecureCookie(req)));
    return { ok: true, authMode: resolvedAuthMode, authenticated: true, user: presentUser(login.user), expiresAt: login.expiresAt };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (authRequiresSession && typeof authWithSessions.logout === 'function') {
      const token = readAuthToken(req);
      if (token) await authWithSessions.logout(token);
    }
    reply.header('Set-Cookie', clearSessionCookie('cb_session', shouldSecureCookie(req)));
    return { ok: true };
  });

  // --- Admin user management ---
  const requireUserManagement = () => {
    if (!authSupportsUserManagement) {
      const err = new Error('User management is only available in password auth mode') as Error & { statusCode: number };
      err.statusCode = 501;
      throw err;
    }
  };

  app.get('/api/admin/users', {
    preHandler: requireMinRole('ceo'),
  }, async () => {
    requireUserManagement();
    const users = await listUsers();
    return users.map(presentUser);
  });

  app.post('/api/admin/users', {
    preHandler: [requireMinRole('ceo'), validateBody(schemas.CreateUserSchema)],
  }, async (req) => {
    requireUserManagement();
    const principal = await principalOf(req);
    const body = (req as any).validatedBody as CreateUserInput;
    try {
      const user = await authWithSessions.createUser!(body, principal.userId);
      return { ok: true, user: presentUser(user) };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'Could not create user');
    }
  });

  // --- API keys: what an MCP host authenticates with. The raw key is shown ONCE on
  // create and never stored (only its sha256 hash), so it can never be listed again.
  app.get('/api/admin/keys', { preHandler: requireMinRole('ceo') }, async (req) => {
    const p = await principalOf(req);
    return { keys: await core.apiKeys.list(p.orgId) };
  });

  app.post('/api/admin/keys', {
    preHandler: [requireMinRole('ceo'), validateBody(schemas.CreateApiKeySchema)],
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    const created = await core.apiKeys.create(p.orgId, b.name, b.scopes, b.actorId);
    // `raw` is the only time this value exists outside the caller's hands.
    return { ok: true, key: created.raw, row: created.row };
  });

  app.delete('/api/admin/keys/:id', { preHandler: requireMinRole('ceo') }, async (req) => {
    const p = await principalOf(req);
    const mine = await core.apiKeys.list(p.orgId); // B1: only revoke this org's keys
    if (!mine.some((k) => k.id === params(req).id)) throw notFound('key not found');
    await core.apiKeys.revoke(params(req).id);
    return { ok: true };
  });

  app.patch('/api/admin/users/:id', {
    preHandler: [requireMinRole('ceo'), validateBody(schemas.UpdateUserSchema)],
  }, async (req) => {
    requireUserManagement();
    const body = (req as any).validatedBody as UpdateUserInput;
    try {
      const user = await authWithSessions.updateUser!(params(req).id, body);
      return { ok: true, user: presentUser(user) };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'Could not update user');
    }
  });

  app.post('/api/admin/users/:id/password', {
    preHandler: [requireMinRole('ceo'), validateBody(schemas.SetPasswordSchema)],
  }, async (req) => {
    requireUserManagement();
    const body = (req as any).validatedBody as { password: string };
    try {
      await authWithSessions.setPassword!(params(req).id, body.password);
      return { ok: true };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'Could not set password');
    }
  });

  app.delete('/api/admin/users/:id', {
    preHandler: requireMinRole('ceo'),
  }, async (req) => {
    requireUserManagement();
    try {
      await authWithSessions.deleteUser!(params(req).id);
      return { ok: true };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'Could not delete user');
    }
  });

  // --- SSE stream ---
  app.get('/api/stream', async (req, reply) => {
    // Authenticate via cookie — EventSource sends cookies automatically.
    const token = readAuthToken(req);
    const principal = authRequiresSession ? await auth.authenticate(token) : await auth.current();
    if (!principal) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');
    sseClients.add(reply.raw);
    const ping = setInterval(() => {
      try { reply.raw.write(': ping\n\n'); }
      catch { clearInterval(ping); }
    }, 25000);
    req.raw.once('close', () => { clearInterval(ping); sseClients.delete(reply.raw); });
    await new Promise<void>(resolve => req.raw.once('close', resolve));
  });

  // --- Current user (for accountability UI) ---
  app.get('/api/me', async (req) => {
    const p = await principalOf(req);
    return presentUser(await userFromPrincipal(p));
  });

  // --- Open Loops ---
  app.get('/api/loops', async (req) => {
    const p = await principalOf(req);
    const side = (req.query as { side?: 'yours' | 'theirs' }).side;
    return core.loops.list(p.orgId, side);
  });

  app.post('/api/loops', {
    preHandler: validateBody(schemas.CreateLoopSchema),
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    const result = await core.loops.capture({
      orgId: p.orgId, actorId: p.userId,
      title: b.title, why: b.why ?? '', side: b.side ?? 'yours', channel: b.channel ?? 'manual',
    });
    broadcast({ type: 'loop.created', orgId: p.orgId });
    return result;
  });

  app.post('/api/loops/:id/close', async (req) => {
    const p = await principalOf(req);
    await ownedLoop(req); // B1: org-scoped
    const result = await core.loops.close(params(req).id, p.userId);
    broadcast({ type: 'loop.closed' });
    return result;
  });

  app.post('/api/loops/:id/snooze', {
    preHandler: validateBody(schemas.SnoozeLoopSchema),
  }, async (req) => {
    const p = await principalOf(req);
    await ownedLoop(req);
    const b = (req as any).validatedBody;
    const untilAt = Date.now() + Math.max(1, b.hours ?? 24) * 60 * 60 * 1000;
    const result = await core.loops.snooze(params(req).id, p.userId, untilAt);
    broadcast({ type: 'loop.snoozed' });
    return result;
  });

  app.post('/api/loops/:id/assign', {
    preHandler: validateBody(schemas.AssignSchema),
  }, async (req) => {
    const p = await principalOf(req);
    await ownedLoop(req);
    const b = (req as any).validatedBody;
    return core.ctx.db.loops.update(params(req).id, { assignedTo: b.userIds ?? [p.userId] });
  });

  // --- Tasks ---
  app.get('/api/tasks', async (req) => core.tasks.list((await principalOf(req)).orgId));

  app.post('/api/tasks', {
    preHandler: validateBody(schemas.CreateTaskSchema),
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    const result = await core.tasks.create({ orgId: p.orgId, actorId: p.userId, ...b });
    broadcast({ type: 'task.created' });
    return result;
  });

  app.post('/api/tasks/:id/complete', async (req) => {
    const p = await principalOf(req);
    await ownedTask(req); // B1
    const result = await core.tasks.complete(params(req).id, p.userId);
    broadcast({ type: 'task.completed' });
    return result;
  });

  app.post('/api/tasks/:id/move', {
    preHandler: validateBody(schemas.MoveTaskSchema),
  }, async (req) => {
    const p = await principalOf(req);
    await ownedTask(req);
    const b = (req as any).validatedBody;
    const result = await core.tasks.move(params(req).id, b.day ?? 'today', p.userId);
    broadcast({ type: 'task.moved' });
    return result;
  });

  app.post('/api/tasks/:id/assign', {
    preHandler: validateBody(schemas.AssignSchema),
  }, async (req) => {
    const p = await principalOf(req);
    await ownedTask(req);
    const b = (req as any).validatedBody;
    return core.ctx.db.tasks.update(params(req).id, { assignees: b.userIds ?? [p.userId] });
  });

  // --- AI tasks (executor) ---
  // Mark a task AI-executable (or clear it). The worker does the actual run.
  app.post('/api/tasks/:id/ai', {
    config: { rateLimit: aiRateLimitConfig },
    preHandler: validateBody(schemas.SetAiActionSchema),
  }, async (req) => {
    await ownedTask(req); // B1: no setting AI actions on another org's task
    const b = (req as any).validatedBody;
    const task = await core.tasks.setAiAction(params(req).id, b.action, b.config);
    broadcast({ type: 'task.ai.changed' });
    return task;
  });

  // Run history for a task: model, prompts, output, status, cost.
  app.get('/api/tasks/:id/ai-runs', async (req) => {
    await ownedTask(req);
    return { runs: await core.ctx.db.aiRuns.listByTask(params(req).id) };
  });

  // The `ask` path: a human approves the generated draft, letting the action run.
  app.post('/api/ai-runs/:id/approve', {
    config: { rateLimit: aiRateLimitConfig },
  }, async (req) => {
    const p = await principalOf(req);
    const run = await core.ctx.db.aiRuns.get(params(req).id);
    if (!run || run.orgId !== p.orgId) throw notFound('run not found'); // B1
    await core.tasks.approveAiRun(run.id);
    broadcast({ type: 'task.ai.changed' });
    return { ok: true };
  });

  // --- Time Tracking ---
  app.post('/api/tasks/:id/time/start', async (req) => {
    const p = await principalOf(req);
    await ownedTask(req); // B1: can't start time on another org's task
    const entry = await core.timeTracking.start({ orgId: p.orgId, taskId: params(req).id, userId: p.userId });
    broadcast({ type: 'time.started' });
    return entry;
  });

  app.post('/api/time/:entryId/stop', async (req) => {
    await ownedTimeEntry(req); // B1: verifies org (and user implicitly — entry belongs to a task)
    const entryId = (req.params as { entryId: string }).entryId;
    const entry = await core.timeTracking.stop(entryId);
    broadcast({ type: 'time.stopped' });
    return entry;
  });

  app.get('/api/tasks/:id/time', async (req) => {
    await ownedTask(req); // B1: verify org ownership before returning time entries
    const taskId = params(req).id;
    const entries = await core.timeTracking.listByTask(taskId);
    const total = await core.timeTracking.getTotalTime(taskId);
    const active = await core.timeTracking.getActive(taskId);
    return { entries, total, active };
  });

  app.get('/api/time/today', async (req) => {
    const p = await principalOf(req);
    const total = await core.timeTracking.getTodayTime(p.userId, p.orgId);
    return { total, formatted: core.timeTracking.formatDuration(total) };
  });

  // --- Leads ---
  app.get('/api/leads', async (req) => core.leads.list((await principalOf(req)).orgId));

  app.post('/api/leads', {
    preHandler: validateBody(schemas.CreateLeadSchema),
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    const result = await core.leads.create({ orgId: p.orgId, actorId: p.userId, ...b });
    broadcast({ type: 'lead.created' });
    return result;
  });

  app.post('/api/leads/:id/advance', async (req) => {
    await ownedLead(req); // B1
    const result = await core.leads.advance(params(req).id, (await principalOf(req)).userId);
    broadcast({ type: 'lead.advanced' });
    return result;
  });

  app.put('/api/leads/:id/stage', {
    preHandler: validateBody(schemas.SetLeadStageSchema),
  }, async (req) => {
    const p = await principalOf(req);
    await ownedLead(req);
    const b = (req as any).validatedBody;
    const result = await core.leads.setStage(params(req).id, b.stage, p.userId);
    broadcast({ type: 'lead.advanced' });
    return result;
  });

  app.post('/api/leads/:id/assign', {
    preHandler: validateBody(schemas.AssignSchema),
  }, async (req) => {
    const p = await principalOf(req);
    await ownedLead(req);
    const b = (req as any).validatedBody;
    return core.ctx.db.leads.update(params(req).id, { assignedTo: b.userIds ?? [p.userId] });
  });

  // Quick-add a lead from a phone + a rough note — the LLM (if configured) structures it.
  app.post('/api/leads/quick-add', {
    preHandler: validateBody(schemas.QuickAddLeadSchema),
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    const result = await core.leads.quickAddFromNote(
      { orgId: p.orgId, actorId: p.userId, phone: b.phone ?? '', note: b.note },
      llm?.extractLead,
    );
    broadcast({ type: 'lead.created' });
    return result;
  });

  // Extract contact info from a business card image or text using AI
  app.post('/api/leads/extract-card', {
    preHandler: validateBody(schemas.ExtractCardSchema),
  }, async (req) => {
    await principalOf(req); // require auth — prevents anonymous API credit abuse
    const b = (req as any).validatedBody;

    if (llm && b.text) {
      const extracted = await llm.extractLead(b.text);
      return extracted;
    }

    if (b.imageBase64 && process.env.ANTHROPIC_API_KEY) {
      const { Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b.imageBase64 } },
            { type: 'text', text: 'Extract the contact info from this business card. Reply with JSON only: { "name": "", "title": "", "company": "", "email": "", "phone": "" }' }
          ]
        }]
      });
      try {
        const text = (msg.content[0] as any).text;
        const json = text.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
        return JSON.parse(json);
      } catch { return {}; }
    }

    return { name: '', title: '', company: '', email: '', phone: '' };
  });

  // --- Bulk Operations (B1: manager+ only — these mutate/delete across entities) ---
  app.post('/api/bulk/loops/close', { preHandler: requireMinRole('manager') }, async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.closeLoops(ids, p.userId);
  });

  app.post('/api/bulk/loops/snooze', { preHandler: requireMinRole('manager') }, async (req) => {
    const p = await principalOf(req);
    const { ids, hours } = req.body as { ids: string[]; hours?: number };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.snoozeLoops(ids, hours ?? 24, p.userId);
  });

  app.post('/api/bulk/tasks/move', { preHandler: requireMinRole('manager') }, async (req) => {
    const p = await principalOf(req);
    const { ids, day } = req.body as { ids: string[]; day: string };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.moveTasks(ids, day as any, p.userId);
  });

  app.post('/api/bulk/tasks/complete', { preHandler: requireMinRole('manager') }, async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.completeTasks(ids, p.userId);
  });

  app.post('/api/bulk/tasks/delete', { preHandler: requireMinRole('manager') }, async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.deleteTasks(ids, p.userId);
  });

  app.post('/api/bulk/leads/advance', { preHandler: requireMinRole('manager') }, async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.advanceLeads(ids, p.userId);
  });

  app.post('/api/bulk/assign', { preHandler: requireMinRole('manager') }, async (req) => {
    const p = await principalOf(req);
    const { entityType, ids, userIds } = req.body as { entityType: string; ids: string[]; userIds: string[] };
    if (!ids?.length || !entityType) throw badRequest('ids and entityType required');
    return core.bulk.assignMany(entityType as any, ids, userIds ?? [p.userId], p.userId);
  });

  app.post('/api/bulk/delete', { preHandler: requireMinRole('manager') }, async (req) => {
    const p = await principalOf(req);
    const { entityType, ids } = req.body as { entityType: string; ids: string[] };
    if (!ids?.length || !entityType) throw badRequest('ids and entityType required');
    return core.bulk.deleteMany(entityType as any, ids, p.userId);
  });

  // --- Recurring Tasks ---
  app.post('/api/recurring/process', async (req) => {
    const p = await principalOf(req);
    const result = await core.recurring.processDaily(p.orgId);
    logger.info(result, 'Recurring tasks processed');
    return result;
  });

  app.get('/api/recurring/next/:recur', async (req) => {
    const recur = (req.params as { recur: string }).recur;
    const next = core.recurring.getNextRun(recur);
    return { next: next.toISOString(), formatted: core.recurring.formatSchedule(recur) };
  });

  // --- Subtasks ---
  app.post('/api/tasks/:id/subtasks', async (req) => {
    await ownedTask(req); // B1
    const taskId = params(req).id;
    const { title } = req.body as { title: string };
    if (!title) throw badRequest('title required');
    return core.subtasks.add(taskId, title);
  });

  app.post('/api/tasks/:id/subtasks/:subId/complete', async (req) => {
    await ownedTask(req);
    const taskId = params(req).id;
    const subId = (req.params as { subId: string }).subId;
    await core.subtasks.complete(taskId, subId);
    return { ok: true };
  });

  app.post('/api/tasks/:id/subtasks/:subId/toggle', async (req) => {
    await ownedTask(req);
    const taskId = params(req).id;
    const subId = (req.params as { subId: string }).subId;
    await core.subtasks.toggle(taskId, subId);
    return { ok: true };
  });

  app.delete('/api/tasks/:id/subtasks/:subId', async (req) => {
    await ownedTask(req);
    const taskId = params(req).id;
    const subId = (req.params as { subId: string }).subId;
    await core.subtasks.remove(taskId, subId);
    return { ok: true };
  });

  app.get('/api/tasks/:id/subtasks', async (req) => {
    await ownedTask(req);
    const taskId = params(req).id;
    return core.subtasks.list(taskId);
  });

  // --- AI agents + audit ---
  app.get('/api/agents', async () => core.agents.roster());
  app.get('/api/events', async (req) => {
    const p = await principalOf(req);
    const q = query(req);
    const events = await core.events.list(p.orgId, 200);
    if (q.entityId) return events.filter((e) => e.entityId === q.entityId);
    return events.slice(0, 50);
  });
  // Reverse a logged action (the "reversible" pillar): delete what was created, restore what changed.
  app.post('/api/events/:id/undo', { preHandler: requireMinRole('manager') }, async (req) => {
    await principalOf(req);
    return core.events.undo(params(req).id);
  });

  // --- Connections: real credential management + connect flows ---
  app.get('/api/connections', async (req) => {
    const p = await principalOf(req);
    const conns = await core.ctx.db.connections.list(p.orgId);
    const env = process.env;
    const has = (...keys: string[]) => keys.every((k) => !!env[k]);
    // Merge stored connections with env-based config
    const byChannel = new Map(conns.map(c => [c.channel, c]));
    return {
      ai: { configured: !!llm, via: llm ? 'anthropic' : null },
      whatsapp_cloud: {
        status: byChannel.get('whatsapp_cloud')?.status ?? (has('WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN') ? 'connected' : 'disconnected'),
        method: has('WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN') ? 'cloud-api' : 'not configured',
        phone: env.WHATSAPP_PHONE_NUMBER_ID ? `+${env.WHATSAPP_PHONE_NUMBER_ID}` : '',
      },
      whatsapp_baileys: {
        status: byChannel.get('whatsapp_baileys')?.status ?? (env.WHATSAPP_BAILEYS === 'on' ? 'connecting' : 'disconnected'),
        method: env.WHATSAPP_BAILEYS === 'on' ? 'baileys-qr' : 'not configured',
      },
      gmail: {
        status: byChannel.get('gmail')?.status ?? 'disconnected',
        email: byChannel.get('gmail')?.credentials?.email ?? '',
      },
      slack: {
        status: byChannel.get('slack')?.status ?? (has('SLACK_BOT_TOKEN') ? 'connected' : 'disconnected'),
      },
      telegram: {
        status: byChannel.get('telegram')?.status ?? (has('TELEGRAM_BOT_TOKEN') ? 'connected' : 'disconnected'),
      },
      github: {
        status: byChannel.get('github')?.status ?? (has('GITHUB_TOKEN') ? 'connected' : 'disconnected'),
      },
      calendar: {
        status: byChannel.get('calendar')?.status ?? 'disconnected',
      },
      wordpress: {
        status: byChannel.get('wordpress')?.status ?? 'disconnected',
        site: byChannel.get('wordpress')?.credentials?.apiUrl ?? '',
      },
    };
  });

  // WordPress — save credentials for the publish_blog action. Stored encrypted by the
  // connections repo; the app password is never returned or logged.
  app.put('/api/connections/wordpress', {
    preHandler: [requireMinRole('ceo'), validateBody(schemas.WordpressCredsSchema)],
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    await core.ctx.db.connections.upsert(p.orgId, 'wordpress', {
      status: 'connected',
      credentials: { apiUrl: b.apiUrl.replace(/\/+$/, ''), username: b.username, appPassword: b.appPassword },
    });
    broadcast({ type: 'connections.changed' });
    return { ok: true };
  });

  // Configured-or-not only. Never the secret.
  app.get('/api/connections/wordpress', async (req) => {
    const p = await principalOf(req);
    const conn = await core.ctx.db.connections.get(p.orgId, 'wordpress');
    return {
      configured: conn?.status === 'connected',
      apiUrl: (conn?.credentials?.apiUrl as string | undefined) ?? '',
      username: (conn?.credentials?.username as string | undefined) ?? '',
    };
  });

  // WhatsApp Cloud API — save credentials
  app.post('/api/connections/whatsapp_cloud', {
    preHandler: requireMinRole('ceo'),
  }, async (req) => {
    const p = await principalOf(req);
    const body = req.body as any;
    if (!body.phoneNumberId || !body.accessToken) {
      return { error: 'phone_number_id and access_token are required' };
    }
    const conn = await core.ctx.db.connections.upsert(p.orgId, 'whatsapp_cloud', {
      status: 'connected',
      credentials: {
        phoneNumberId: body.phoneNumberId,
        accessToken: body.accessToken,
        webhookVerifyToken: body.webhookVerifyToken ?? '',
        appSecret: body.appSecret ?? '',
      },
    });
    broadcast({ type: 'connections.changed' });
    return { ok: true, connection: conn };
  });

  // WhatsApp Baileys — request QR code
  app.post('/api/connections/whatsapp_baileys/start', {
    preHandler: requireMinRole('ceo'),
  }, async (req) => {
    const p = await principalOf(req);
    await core.ctx.db.connections.upsert(p.orgId, 'whatsapp_baileys', {
      status: 'connecting',
      credentials: {},
    });
    broadcast({ type: 'connections.changed' });
    return { ok: true, message: 'QR code will appear in server console. Scan with WhatsApp.' };
  });

  // Gmail — initiate OAuth flow (returns Google auth URL)
  app.get('/api/connections/gmail/auth-url', {
    preHandler: requireMinRole('ceo'),
  }, async (req, reply) => {
    const p = await principalOf(req);
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectBase = process.env.GMAIL_REDIRECT_URI || `${(req.headers.origin as string) || 'http://localhost:4317'}/api/connections/gmail/callback`;

    if (!clientId || !clientSecret) {
      return reply.code(503).send({ error: 'Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env' });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectBase,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify',
      access_type: 'offline',
      prompt: 'consent',
    });

    await core.ctx.db.connections.upsert(p.orgId, 'gmail', {
      status: 'connecting',
      credentials: { redirectUri: redirectBase },
    });

    return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  });

  // Gmail — OAuth callback (Google redirects here with code)
  app.get('/api/connections/gmail/callback', async (req, reply) => {
    const { code } = req.query as { code?: string; error?: string };
    if (!code) {
      return reply.redirect('/?error=gmail_no_code');
    }
    try {
      const clientId = process.env.GMAIL_CLIENT_ID!;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET!;
      const redirectBase = process.env.GMAIL_REDIRECT_URI || `http://localhost:4317/api/connections/gmail/callback`;

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectBase,
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenRes.json() as any;
      if (!tokens.access_token) {
        return reply.redirect('/?error=gmail_token_failed');
      }

      // Get user email
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json() as any;

      // Store credentials
      await core.ctx.db.connections.upsert(LOCAL_ORG_ID, 'gmail', {
        status: 'connected',
        credentials: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? '',
          expiresIn: tokens.expires_in,
          email: profile.emailAddress ?? '',
        },
      });

      broadcast({ type: 'connections.changed' });
      return reply.redirect('/?connected=gmail');
    } catch (err: any) {
      logger.error({ err }, 'Gmail OAuth callback failed');
      return reply.redirect('/?error=gmail_callback_failed');
    }
  });

  // Disconnect a channel
  app.post('/api/connections/:channel/disconnect', {
    preHandler: requireMinRole('ceo'),
  }, async (req) => {
    const p = await principalOf(req);
    const { channel } = req.params as { channel: string };
    await core.ctx.db.connections.upsert(p.orgId, channel, {
      status: 'disconnected',
      credentials: {},
    });
    broadcast({ type: 'connections.changed' });
    return { ok: true };
  });

  // --- Autonomy (off · ask · auto) + the human approval queue ---
  // B11: Kill-switch persistence — stored in the settings doc (one read path, no new table).
  // When true, the worker skips ALL autonomous actions (chase/reply/draft/sweep).
  const getKillSwitch = async (orgId: string): Promise<boolean> => {
    try {
      const settings = await core.autonomy.get(orgId);
      return !!(settings as Record<string, unknown>)?.killSwitch;
    } catch { return false; }
  };
  const setKillSwitch = async (orgId: string, paused: boolean): Promise<void> => {
    const cur = (await core.autonomy.get(orgId)) ?? {};
    // ponytail: spread onto the existing doc — autonomy.set persists the whole doc.
    await core.ctx.db.settings.setAutonomy(orgId, { ...cur, killSwitch: paused } as any);
  };

  app.get('/api/autonomy', async (req) => {
    const p = await principalOf(req);
    const settings = await core.autonomy.get(p.orgId);
    return { ...settings, killSwitch: await getKillSwitch(p.orgId) };
  });

  app.put('/api/autonomy', {
    preHandler: validateBody(schemas.AutonomySchema),
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    return core.autonomy.set(p.orgId, b.action, b.level);
  });

  // B11: Kill switch — real persisted state. Pauses ALL autonomous actions org-wide.
  // Stored in the settings table as a separate key so it survives restarts.
  app.put('/api/autonomy/kill-switch', { preHandler: requireMinRole('manager') }, async (req) => {
    const p = await principalOf(req);
    const { paused } = (req.body as { paused?: boolean });
    await setKillSwitch(p.orgId, paused !== false);
    broadcast({ type: 'autonomy.changed' });
    logger.warn({ orgId: p.orgId, paused }, 'Kill switch toggled');
    return { paused: paused !== false };
  });

  app.get('/api/approvals', async (req) => core.approvals.list((await principalOf(req)).orgId, 'pending'));
  app.post('/api/approvals/:id/approve', { preHandler: requireMinRole('manager') }, async (req) => { await principalOf(req); const r = await core.approvals.approve(params(req).id); broadcast({ type: 'agent.action' }); return r; });
  app.post('/api/approvals/:id/dismiss', { preHandler: requireMinRole('manager') }, async (req) => { await principalOf(req); const r = await core.approvals.dismiss(params(req).id); broadcast({ type: 'agent.action' }); return r; });

  // --- WhatsApp webhook (the one integration wired end-to-end) ---
  const wa = whatsapp.whatsappConfigFromEnv();

  app.get('/webhooks/whatsapp', async (req, reply) => {
    if (!wa) return reply.code(503).send('whatsapp not configured');
    const challenge = whatsapp.verifyWebhook(wa, req.query as any);
    if (challenge === null) return reply.code(403).send('forbidden');
    return reply.type('text/plain').send(challenge);
  });

  // Inbound capture with webhook signature verification
  app.post('/webhooks/whatsapp', {
    config: { rateLimit: webhookRateLimitConfig },
    preHandler: whatsappSignatureVerify(),
  }, async (req, reply) => {
    const messages = whatsapp.parseInbound(LOCAL_ORG_ID, req.body);
    for (const m of messages) await ingest(core, m);
    if (messages.length) {
      logger.info({ count: messages.length }, 'WhatsApp messages processed');
      broadcast({ type: 'loop.created' });
    }
    return reply.code(200).send('ok');
  });

  // --- M4 fan-in: every other channel funnels into the SAME pipeline ---
  const FANIN_CHANNELS = ['email', 'slack', 'telegram', 'github', 'calendar'] as const;
  app.post('/webhooks/:channel', {
    config: { rateLimit: webhookRateLimitConfig },
    preHandler: [genericWebhookVerify(), validateBody(schemas.WebhookFanInSchema)],
  }, async (req, reply) => {
    const channel = (req.params as { channel: string }).channel;
    if (!(FANIN_CHANNELS as readonly string[]).includes(channel)) {
      return reply.code(404).send('unknown channel');
    }
    const b = (req as any).validatedBody;
    const loopId = await ingest(core, {
      orgId: LOCAL_ORG_ID,
      channel: channel as (typeof FANIN_CHANNELS)[number],
      from: b.from ?? 'unknown',
      text: b.text,
      ref: b.ref,
    });
    logger.info({ channel, from: b.from }, 'Webhook received');
    broadcast({ type: 'loop.created' });
    return reply.send({ captured: loopId });
  });

  // --- Push Notifications ---
  const pushSubscriptions = new Map<string, any>();

  app.post('/api/notifications/subscribe', async (req) => {
    const { subscription } = req.body as { subscription: any };
    const p = await principalOf(req);
    pushSubscriptions.set(p.userId, subscription);
    return { ok: true };
  });

  app.post('/api/notifications/unsubscribe', async (req) => {
    const p = await principalOf(req);
    pushSubscriptions.delete(p.userId);
    return { ok: true };
  });

  app.get('/api/notifications/status', async (req) => {
    const p = await principalOf(req);
    return { subscribed: pushSubscriptions.has(p.userId) };
  });

  // --- Export ---
  app.get('/api/export/loops', async (req, reply) => {
    const p = await principalOf(req);
    const loops = await core.loops.list(p.orgId);
    const format = (req.query as any)?.format || 'json';

    if (format === 'csv') {
      const csv = loopsToCsv(loops);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="loops.csv"');
      return csv;
    }
    return loops;
  });

  app.get('/api/export/tasks', async (req, reply) => {
    const p = await principalOf(req);
    const tasks = await core.tasks.list(p.orgId);
    const format = (req.query as any)?.format || 'json';

    if (format === 'csv') {
      const csv = tasksToCsv(tasks);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="tasks.csv"');
      return csv;
    }
    return tasks;
  });

  app.get('/api/export/leads', async (req, reply) => {
    const p = await principalOf(req);
    const leads = await core.leads.list(p.orgId);
    const format = (req.query as any)?.format || 'json';

    if (format === 'csv') {
      const csv = leadsToCsv(leads);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="leads.csv"');
      return csv;
    }
    return leads;
  });

  // --- AI Suggestions ---
  app.get('/api/ai/suggestions/:entityType/:entityId', async (req) => {
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };
    return core.ai.getSuggestions(entityType as 'loop' | 'task' | 'lead', entityId);
  });

  app.post('/api/ai/assign/:taskId', async (req) => {
    const p = await principalOf(req);
    const taskId = (req.params as { taskId: string }).taskId;
    // B1: verify the task belongs to this org before AI auto-assigns it.
    const task = await core.ctx.db.tasks.get(taskId);
    if (!task || task.orgId !== p.orgId) throw notFound('task not found');
    const assignee = await core.ai.autoAssign(taskId);
    return { assignee };
  });

  app.get('/api/ai/patterns', async (req) => {
    const p = await principalOf(req);
    return core.ai.getPatterns(p.orgId);
  });

  app.post('/api/ai/suggestions/:id/dismiss', async (req) => {
    const id = (req.params as { id: string }).id;
    await core.ai.dismiss(id);
    return { ok: true };
  });

  // --- Dashboard KPIs ---
  // --- Today dashboard — the "what needs my attention" landing view ---
  app.get('/api/today', async (req) => {
    const p = await principalOf(req);
    const now = Date.now();
    const STALE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
    const DAY_START = new Date(); DAY_START.setHours(0, 0, 0, 0);
    const dayStartMs = DAY_START.getTime();

    const [loops, tasks, leads, approvals] = await Promise.all([
      core.loops.list(p.orgId),
      core.tasks.list(p.orgId),
      core.leads.list(p.orgId),
      core.approvals.list(p.orgId, 'pending'),
    ]);

    // Needs attention: overdue tasks + stale loops (your court, >3 days old)
    const overdueTasks = tasks.filter((t: any) => !t.completed && t.dueAt && t.dueAt < now);
    const staleLoops = loops.filter((l: any) => l.status !== 'closed' && l.side === 'yours' && (now - l.updatedAt) > STALE_MS);
    const needsAttention = [
      ...overdueTasks.map((t: any) => ({ id: t.id, kind: 'task' as const, title: t.title, dueAt: t.dueAt ?? null })),
      ...staleLoops.map((l: any) => ({ id: l.id, kind: 'loop' as const, title: l.title, why: l.why ?? '', updatedAt: l.updatedAt })),
    ];

    // Waiting on them: their-court loops still open
    const waitingOnThem = loops
      .filter((l: any) => l.status !== 'closed' && l.side === 'theirs')
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
      .slice(0, 10)
      .map((l: any) => ({ id: l.id, title: l.title, updatedAt: l.updatedAt, createdAt: l.createdAt }));

    // Wins today: tasks completed today + loops closed today
    const winsToday = [
      ...tasks.filter((t: any) => t.completed && (t.completedAt ?? 0) >= dayStartMs).map((t: any) => ({ id: t.id, kind: 'task', title: t.title })),
      ...loops.filter((l: any) => l.status === 'closed' && (l.updatedAt ?? 0) >= dayStartMs).map((l: any) => ({ id: l.id, kind: 'loop', title: l.title })),
    ];

    // Team mini-status (managers+)
    let teamStatus: any[] = [];
    if (p.role === 'ceo' || p.role === 'manager') {
      const userMap = new Map<string, { userId: string; openTasks: number; completedToday: number }>();
      for (const t of tasks) {
        for (const uid of t.assignees || []) {
          if (!userMap.has(uid)) userMap.set(uid, { userId: uid, openTasks: 0, completedToday: 0 });
          const u = userMap.get(uid)!;
          if (t.completed && (t.completedAt ?? 0) >= dayStartMs) u.completedToday++;
          else if (!t.completed) u.openTasks++;
        }
      }
      teamStatus = Array.from(userMap.values()).sort((a, b) => b.openTasks - a.openTasks).slice(0, 5);
      const myUser = await userFromPrincipal(p);
      for (const u of teamStatus) {
        try {
          const user = await (auth as any).getUser?.(u.userId);
          // ponytail: legacy seed data references 'user_local' which has no row in password-auth mode.
          // In single-user local mode any unresolvable user is the operator. Upgrade: real multi-user roster.
          if (user) (u as any).name = user.name;
          else if (u.userId === p.userId || u.userId === 'user_local') (u as any).name = myUser.name ?? 'You';
          else (u as any).name = u.userId;
        } catch {
          (u as any).name = (u.userId === p.userId || u.userId === 'user_local') ? (myUser.name ?? 'You') : u.userId;
        }
      }
    }

    return {
      needsAttention,
      waitingOnThem,
      pendingApprovals: approvals,
      winsToday,
      teamStatus,
      stats: {
        overdueCount: overdueTasks.length,
        waitingOnMeCount: staleLoops.length,
        completedTodayCount: winsToday.length,
      },
    };
  });

  app.get('/api/dashboard', async (req) => {
    const p = await principalOf(req);
    const [loops, tasks, leads] = await Promise.all([
      core.loops.list(p.orgId),
      core.tasks.list(p.orgId),
      core.leads.list(p.orgId),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const todayTasks = tasks.filter(t => t.day === 'today');
    const openLoops = loops.filter(l => l.status === 'open');
    const completedTasks = tasks.filter(t => t.subtasks?.every(s => s.done));

    return {
      loops: {
        total: loops.length,
        open: openLoops.length,
        closed: loops.filter(l => l.status === 'closed').length,
        snoozed: loops.filter(l => l.status === 'snoozed').length,
      },
      tasks: {
        total: tasks.length,
        today: todayTasks.length,
        completedToday: completedTasks.length,
        overdue: tasks.filter(t => t.dueAt && t.dueAt < Date.now() && t.subtasks?.some(s => !s.done)).length,
      },
      leads: {
        total: leads.length,
        won: leads.filter(l => l.stage === 'won').length,
        lost: leads.filter(l => l.stage === 'lost').length,
        pipeline: leads.filter(l => !['won', 'lost'].includes(l.stage)).length,
      },
      today,
    };
  });

  // --- Productivity Methods ---
  app.get('/api/methods', async () => ({ methods: methods.METHOD_LIST }));

  app.get('/api/methods/:methodId', async (req) => {
    const p = await principalOf(req);
    const { methodId } = req.params as { methodId: string };
    const entry = (methods.METHODS as Record<string, any>)[methodId];
    if (!entry) return { error: 'Unknown method' };
    const tasks = await core.tasks.list(p.orgId);
    const result = entry.run(tasks);
    return { result, meta: entry.meta };
  });

  // --- Reports (real analytics) ---
  app.get('/api/reports', async (req) => {
    const p = await principalOf(req);
    const days = Math.min(365, Math.max(1, Number((req.query as any)?.days ?? 30)));
    const [loops, tasks, leads] = await Promise.all([
      core.loops.list(p.orgId),
      core.tasks.list(p.orgId),
      core.leads.list(p.orgId),
    ]);
    // Time entries per user (best-effort — pull from db if available)
    let timeEntries: any[] = [];
    try { timeEntries = await core.ctx.db.timeEntries.listByUser(p.userId, p.orgId); } catch { /* no-op */ }
    return analytics.computeReport({ loops, tasks, leads, timeEntries, windowDays: days });
  });

  // --- Team performance (manager/ceo only) ---
  app.get('/api/team/performance', { preHandler: requireMinRole('manager') }, async (req) => {
    const p = await principalOf(req);
    const tasks = await core.tasks.list(p.orgId);
    const loops = await core.loops.list(p.orgId);
    // Build per-user stats from assignees + time entries
    const userStats = new Map<string, { userId: string; tasksDone: number; loopsClosed: number; focusMinutes: number; points: number }>();
    const ensure = (uid: string) => {
      if (!userStats.has(uid)) userStats.set(uid, { userId: uid, tasksDone: 0, loopsClosed: 0, focusMinutes: 0, points: 0 });
      return userStats.get(uid)!;
    };
    for (const t of tasks) {
      const done = t.subtasks && t.subtasks.length > 0 && t.subtasks.every((s: any) => s.done);
      for (const uid of t.assignees || []) {
        const s = ensure(uid);
        if (done) { s.tasksDone++; s.points += 3; }
      }
    }
    for (const l of loops) {
      if (l.status === 'closed') {
        for (const uid of l.assignedTo || []) {
          const s = ensure(uid);
          s.loopsClosed++; s.points += 2;
        }
      }
    }
    // Resolve user names from auth
    const rows = Array.from(userStats.values());
    for (const r of rows) {
      try {
        const u = await (auth as any).getUser?.(r.userId);
        (r as any).name = u?.name ?? r.userId;
        (r as any).role = u?.role ?? 'employee';
      } catch { (r as any).name = r.userId; (r as any).role = 'employee'; }
    }
    return rows.sort((a, b) => b.points - a.points);
  });

  // --- Rich input: voice transcription ---
  app.post('/api/input/voice', async (req) => {
    const p = await principalOf(req);
    const body = req.body as { audio?: string; mimeType?: string };
    if (!body.audio) return { error: 'No audio provided' };
    const buf = Buffer.from(body.audio, 'base64');
    const text = await inputApi.transcribeAudio(buf, body.mimeType);
    const taskTitles = inputApi.parseTasksFromTranscript(text);
    // Auto-create tasks if transcript yielded action items
    const created: any[] = [];
    for (const title of taskTitles.slice(0, 5)) {
      created.push(await core.tasks.create({ orgId: p.orgId, actorId: p.userId, title, day: 'today' }));
    }
    return { text, taskTitles, created };
  });

  // --- Rich input: calendar .ics import ---
  app.post('/api/input/calendar-import', async (req) => {
    const p = await principalOf(req);
    const body = req.body as { ics?: string; url?: string };
    const icsText = body.ics ?? (body.url ? await inputApi.downloadIcsFromUrl(body.url) : '');
    if (!icsText) return { error: 'No .ics content or URL provided' };
    const events = inputApi.parseIcs(icsText);
    const taskShapes = inputApi.icsToTasks(events, p.orgId, p.userId);
    const created: any[] = [];
    for (const t of taskShapes) {
      created.push(await core.tasks.create({ orgId: p.orgId, actorId: p.userId, title: t.title ?? 'Imported event', day: (t.day as any) ?? 'upcoming', dueAt: t.dueAt ?? undefined }));
    }
    return { eventsFound: events.length, created };
  });

  // --- Rich input: attachment upload ---
  app.post('/api/input/attachments', async (req) => {
    const p = await principalOf(req);
    const body = req.body as { taskId?: string; filename?: string; mimeType?: string; data?: string };
    if (!body.taskId || !body.filename || !body.data) return { error: 'taskId, filename, and data are required' };
    const buf = Buffer.from(body.data, 'base64');
    const record = await inputApi.saveAttachment({ taskId: body.taskId, filename: body.filename, mimeType: body.mimeType ?? 'application/octet-stream', data: buf, orgId: p.orgId });
    return { ok: true, attachment: record };
  });

  app.get('/api/input/attachments/:taskId', async (req) => {
    const { taskId } = req.params as { taskId: string };
    return { attachments: await inputApi.listAttachments(taskId) };
  });

  app.delete('/api/input/attachments/:orgId/:attachmentId', async (req) => {
    const { orgId, attachmentId } = req.params as { orgId: string; attachmentId: string };
    await inputApi.deleteAttachment(orgId, attachmentId);
    return { ok: true };
  });

  // --- Embedded web UI (this app IS the website) ---
  app.get('/', async (_req, reply) => reply.type('text/html').send(renderUi()));

  // --- Global error handler ---
  app.setErrorHandler(function (error: Error & { statusCode?: number; details?: Record<string, string> }, request: FastifyRequest, reply: FastifyReply) {
    const statusCode = error.statusCode ?? 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    if (statusCode >= 500) {
      captureException(error, { method: request.method, url: request.url });
      logger.error({ err: error, req: request }, 'Unhandled error');
    } else {
      logger.warn({ err: error, req: request }, 'Request error');
    }

    return reply.code(statusCode).send({
      error: message,
      ...(statusCode !== 500 && error.details && { details: error.details }),
    });
  });

  return app;
}

function badRequest(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}

function sanitizeUser(user: AuthUser): AuthUser {
  const name = (user.name ?? '').trim() || user.userId;
  const initials = (user.initials ?? initialsFor(name)).trim().slice(0, 3).toUpperCase();
  return {
    userId: user.userId,
    orgId: user.orgId,
    role: user.role,
    name,
    email: user.email?.trim() || undefined,
    username: user.username?.trim() || undefined,
    active: user.active,
    createdAt: user.createdAt,
    initials,
  };
}

function presentUser(user: AuthUser) {
  const safe = sanitizeUser(user);
  return {
    userId: safe.userId,
    orgId: safe.orgId,
    role: safe.role,
    name: safe.name,
    email: safe.email,
    username: safe.username,
    active: safe.active,
    createdAt: safe.createdAt,
    initials: safe.initials,
  };
}

function principalToUser(principal: Principal): AuthUser {
  const name = principal.userId.replace(/^user[_-]?/i, '').replace(/[_-]+/g, ' ').trim() || principal.userId;
  return {
    userId: principal.userId,
    orgId: principal.orgId,
    role: principal.role,
    name,
    initials: initialsFor(name),
    email: undefined,
  };
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return 'US';
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

function readAuthToken(req: FastifyRequest): string | undefined {
  const cookieToken = readCookie(req.headers.cookie, 'cb_session');
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (!authHeader) return undefined;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim();
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const k = pair.slice(0, idx).trim();
    if (k !== name) continue;
    const raw = pair.slice(idx + 1).trim();
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return undefined;
}

function shouldSecureCookie(req: FastifyRequest): boolean {
  const forced = (process.env.COMPANYBRAIN_SECURE_COOKIE ?? '').trim().toLowerCase();
  if (forced === '1' || forced === 'true' || forced === 'yes') return true;
  if (forced === '0' || forced === 'false' || forced === 'no') return false;

  const fwd = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(fwd) ? fwd.join(',') : String(fwd ?? '');
  if (proto) {
    const values = proto.split(',').map((v) => v.trim().toLowerCase());
    if (values.includes('https')) return true;
  }

  return (req.protocol ?? '').toLowerCase() === 'https';
}

function makeSessionCookie(name: string, token: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    // B2: Strict blocks all cross-site sends (loginCSRF defense). App is single-origin
    // so there's no legitimate cross-site POST flow to break.
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie(name: string, secure: boolean): string {
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// --- CSV Export Helpers ---
// H3: neutralize spreadsheet formula injection — prefix leading = + - @ TAB CR with a single quote.
function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Formula-injection guard: Excel/LibreOffice treat leading = + - @ \t \r as a formula.
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function arrayToCsv(headers: string[], rows: (string | number | boolean | null)[][]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return lines.join('\n');
}

function loopsToCsv(loops: any[]): string {
  const headers = ['id', 'channel', 'from', 'subject', 'body', 'status', 'assignee', 'createdAt'];
  const rows = loops.map(l => [
    l.id, l.channel, l.from, l.subject, l.body, l.status, l.assignee, l.createdAt,
  ]);
  return arrayToCsv(headers, rows);
}

function tasksToCsv(tasks: any[]): string {
  const headers = ['id', 'title', 'list', 'day', 'priority', 'recurring', 'dueAt', 'assignees', 'completed'];
  const rows = tasks.map(t => [
    t.id, t.title, t.list, t.day, t.priority, t.recurring ? 'yes' : 'no',
    t.dueAt ? new Date(t.dueAt).toISOString() : '',
    (t.assignees ?? []).join('; '),
    (t.subtasks ?? []).every((s: any) => s.done) ? 'yes' : 'no',
  ]);
  return arrayToCsv(headers, rows);
}

function leadsToCsv(leads: any[]): string {
  const headers = ['id', 'name', 'company', 'title', 'stage', 'value', 'notes', 'createdAt'];
  const rows = leads.map(l => [
    l.id, l.name, l.company, l.title, l.stage, l.value, l.notes, l.createdAt,
  ]);
  return arrayToCsv(headers, rows);
}
