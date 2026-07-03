// The HTTP layer for the single companybrain app. Thin: it resolves the local principal,
// then calls core. It also serves the embedded web UI at `/` — so the one process is the
// API *and* the website. No separate frontend server.

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Core } from '@companybrain/core';
import type { Auth, AuthUser, Principal, CreateUserInput, UpdateUserInput } from '@companybrain/auth';
import { ingest, whatsapp, createLlm } from '@companybrain/integrations';
import { LOCAL_ORG_ID } from '@companybrain/auth';
import { renderUi } from './web-ui';
import {
  validateBody,
  validateQuery,
  rateLimitConfig,
  webhookRateLimitConfig,
  authRateLimitConfig,
  whatsappSignatureVerify,
  requireMinRole,
  logger,
  schemas,
} from './middleware';

export interface ServerDeps {
  core: Core;
  auth: Auth;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { core, auth } = deps;
  const app = Fastify({
    logger: {
      level: process.env.COMPANYBRAIN_LOG_LEVEL ?? 'info',
      ...(process.env.NODE_ENV !== 'production' && {
        transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
      }),
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB for image uploads
    trustProxy: true,
  });

  // --- CORS ---
  const allowedOrigins = (process.env.COMPANYBRAIN_CORS_ORIGINS ?? '').split(',').filter(Boolean);
  app.register(cors, {
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  app.get('/health', async () => ({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // --- Prometheus metrics endpoint ---
  app.get('/metrics', async (_req, reply) => {
    const { renderMetrics } = await import('./middleware');
    return reply.type('text/plain').send(renderMetrics());
  });

  // --- Global preHandler: auth for /api/* routes ---
  app.addHook('preHandler', async (req, reply) => {
    const url = req.raw.url ?? '';
    if (!url.startsWith('/api/')) return;
    if (url.startsWith('/api/auth/')) return;

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
    const result = await core.loops.close(params(req).id, p.userId);
    broadcast({ type: 'loop.closed' });
    return result;
  });

  app.post('/api/loops/:id/snooze', {
    preHandler: validateBody(schemas.SnoozeLoopSchema),
  }, async (req) => {
    const p = await principalOf(req);
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
    const b = (req as any).validatedBody;
    const loop = await core.ctx.db.loops.get(params(req).id);
    if (!loop) throw badRequest('loop not found');
    return core.ctx.db.loops.update(loop.id, { assignedTo: b.userIds ?? [p.userId] });
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
    const result = await core.tasks.complete(params(req).id, (await principalOf(req)).userId);
    broadcast({ type: 'task.completed' });
    return result;
  });

  app.post('/api/tasks/:id/move', {
    preHandler: validateBody(schemas.MoveTaskSchema),
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    const result = await core.tasks.move(params(req).id, b.day ?? 'today', p.userId);
    broadcast({ type: 'task.moved' });
    return result;
  });

  app.post('/api/tasks/:id/assign', {
    preHandler: validateBody(schemas.AssignSchema),
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    const task = await core.ctx.db.tasks.get(params(req).id);
    if (!task) throw badRequest('task not found');
    return core.ctx.db.tasks.update(task.id, { assignees: b.userIds ?? [p.userId] });
  });

  // --- Time Tracking ---
  app.post('/api/tasks/:id/time/start', async (req) => {
    const p = await principalOf(req);
    const taskId = params(req).id;
    const entry = await core.timeTracking.start({ orgId: p.orgId, taskId, userId: p.userId });
    broadcast({ type: 'time.started' });
    return entry;
  });

  app.post('/api/time/:entryId/stop', async (req) => {
    const entryId = (req.params as { entryId: string }).entryId;
    const entry = await core.timeTracking.stop(entryId);
    broadcast({ type: 'time.stopped' });
    return entry;
  });

  app.get('/api/tasks/:id/time', async (req) => {
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
    const result = await core.leads.advance(params(req).id, (await principalOf(req)).userId);
    broadcast({ type: 'lead.advanced' });
    return result;
  });

  app.put('/api/leads/:id/stage', {
    preHandler: validateBody(schemas.SetLeadStageSchema),
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    const result = await core.leads.setStage(params(req).id, b.stage, p.userId);
    broadcast({ type: 'lead.advanced' });
    return result;
  });

  app.post('/api/leads/:id/assign', {
    preHandler: validateBody(schemas.AssignSchema),
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    const lead = await core.ctx.db.leads.get(params(req).id);
    if (!lead) throw badRequest('lead not found');
    return core.ctx.db.leads.update(lead.id, { assignedTo: b.userIds ?? [p.userId] });
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

  // --- Bulk Operations ---
  app.post('/api/bulk/loops/close', async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.closeLoops(ids, p.userId);
  });

  app.post('/api/bulk/loops/snooze', async (req) => {
    const p = await principalOf(req);
    const { ids, hours } = req.body as { ids: string[]; hours?: number };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.snoozeLoops(ids, hours ?? 24, p.userId);
  });

  app.post('/api/bulk/tasks/move', async (req) => {
    const p = await principalOf(req);
    const { ids, day } = req.body as { ids: string[]; day: string };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.moveTasks(ids, day as any, p.userId);
  });

  app.post('/api/bulk/tasks/complete', async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.completeTasks(ids, p.userId);
  });

  app.post('/api/bulk/tasks/delete', async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.deleteTasks(ids, p.userId);
  });

  app.post('/api/bulk/leads/advance', async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body as { ids: string[] };
    if (!ids?.length) throw badRequest('ids required');
    return core.bulk.advanceLeads(ids, p.userId);
  });

  app.post('/api/bulk/assign', async (req) => {
    const p = await principalOf(req);
    const { entityType, ids, userIds } = req.body as { entityType: string; ids: string[]; userIds: string[] };
    if (!ids?.length || !entityType) throw badRequest('ids and entityType required');
    return core.bulk.assignMany(entityType as any, ids, userIds ?? [p.userId], p.userId);
  });

  app.post('/api/bulk/delete', async (req) => {
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
    const taskId = params(req).id;
    const { title } = req.body as { title: string };
    if (!title) throw badRequest('title required');
    return core.subtasks.add(taskId, title);
  });

  app.post('/api/tasks/:id/subtasks/:subId/complete', async (req) => {
    const taskId = params(req).id;
    const subId = (req.params as { subId: string }).subId;
    await core.subtasks.complete(taskId, subId);
    return { ok: true };
  });

  app.post('/api/tasks/:id/subtasks/:subId/toggle', async (req) => {
    const taskId = params(req).id;
    const subId = (req.params as { subId: string }).subId;
    await core.subtasks.toggle(taskId, subId);
    return { ok: true };
  });

  app.delete('/api/tasks/:id/subtasks/:subId', async (req) => {
    const taskId = params(req).id;
    const subId = (req.params as { subId: string }).subId;
    await core.subtasks.remove(taskId, subId);
    return { ok: true };
  });

  app.get('/api/tasks/:id/subtasks', async (req) => {
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
  app.post('/api/events/:id/undo', async (req) => { await principalOf(req); return core.events.undo(params(req).id); });

  // --- Connections: what's configured vs. what needs credentials (for self-hosting) ---
  app.get('/api/connections', async () => {
    const env = process.env;
    const has = (...keys: string[]) => keys.every((k) => !!env[k]);
    return {
      ai: { configured: !!llm, via: llm ? 'anthropic' : null },
      whatsapp: {
        inbound: 'webhook ready at /webhooks/whatsapp',
        outbound: has('WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN') ? 'cloud-api'
          : env.WHATSAPP_BAILEYS === 'on' ? 'baileys-qr' : 'not configured',
      },
      channels: ['email', 'slack', 'telegram', 'github', 'calendar'].map((c) => ({
        channel: c, inbound: `webhook ready at /webhooks/${c}`, outbound: 'not configured',
      })),
    };
  });

  // --- Autonomy (off · ask · auto) + the human approval queue ---
  app.get('/api/autonomy', async (req) => core.autonomy.get((await principalOf(req)).orgId));

  app.put('/api/autonomy', {
    preHandler: validateBody(schemas.AutonomySchema),
  }, async (req) => {
    const p = await principalOf(req);
    const b = (req as any).validatedBody;
    return core.autonomy.set(p.orgId, b.action, b.level);
  });

  app.get('/api/approvals', async (req) => core.approvals.list((await principalOf(req)).orgId, 'pending'));
  app.post('/api/approvals/:id/approve', async (req) => { await principalOf(req); const r = await core.approvals.approve(params(req).id); broadcast({ type: 'agent.action' }); return r; });
  app.post('/api/approvals/:id/dismiss', async (req) => { await principalOf(req); const r = await core.approvals.dismiss(params(req).id); broadcast({ type: 'agent.action' }); return r; });

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
    preHandler: validateBody(schemas.WebhookFanInSchema),
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
    const taskId = (req.params as { taskId: string }).taskId;
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

  // --- Embedded web UI (this app IS the website) ---
  app.get('/', async (_req, reply) => reply.type('text/html').send(renderUi()));

  // --- Global error handler ---
  app.setErrorHandler(function (error: Error & { statusCode?: number; details?: Record<string, string> }, request: FastifyRequest, reply: FastifyReply) {
    const statusCode = error.statusCode ?? 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;

    if (statusCode >= 500) {
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
    'SameSite=Lax',
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
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// --- CSV Export Helpers ---
function escapeCsvField(val: unknown): string {
  if (val === null || val === val === undefined) return '';
  const str = String(val);
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
