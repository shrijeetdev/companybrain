// The HTTP layer for the single companybrain app. Thin: it resolves the local principal,
// then calls core. It also serves the embedded web UI at `/` — so the one process is the
// API *and* the website. No separate frontend server.

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Core } from '@companybrain/core';
import type { Auth } from '@companybrain/auth';
import { ingest, whatsapp, createLlm } from '@companybrain/integrations';
import { LOCAL_ORG_ID } from '@companybrain/auth';
import { renderUi } from './web-ui';

export interface ServerDeps {
  core: Core;
  auth: Auth;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { core, auth } = deps;
  const app = Fastify({ logger: false });

  // Optional AI: real Anthropic-backed extraction if ANTHROPIC_API_KEY is set, else null
  // (the domain falls back to a heuristic). Built once per server.
  const llm = createLlm();

  // Single self-hosted app: one user, one org. Every request is the local principal.
  const principalOf = (_req: FastifyRequest) => auth.current();
  const params = (req: FastifyRequest) => req.params as { id: string };

  app.get('/health', async () => ({ ok: true }));

  // --- Open Loops ---
  app.get('/api/loops', async (req) => {
    const p = await principalOf(req);
    const side = (req.query as { side?: 'yours' | 'theirs' }).side;
    return core.loops.list(p.orgId, side);
  });

  app.post('/api/loops', async (req) => {
    const p = await principalOf(req);
    const b = req.body as { title: string; why?: string; side?: 'yours' | 'theirs'; channel?: any };
    if (!b?.title?.trim()) throw badRequest('title is required');
    return core.loops.capture({
      orgId: p.orgId, actorId: p.userId,
      title: b.title, why: b.why ?? '', side: b.side ?? 'yours', channel: b.channel ?? 'manual',
    });
  });

  app.post('/api/loops/:id/close', async (req) => {
    const p = await principalOf(req);
    return core.loops.close(params(req).id, p.userId);
  });

  app.post('/api/loops/:id/snooze', async (req) => {
    const p = await principalOf(req);
    const b = (req.body ?? {}) as { hours?: number };
    const untilAt = Date.now() + Math.max(1, b.hours ?? 24) * 60 * 60 * 1000;
    return core.loops.snooze(params(req).id, p.userId, untilAt);
  });

  // --- Tasks ---
  app.get('/api/tasks', async (req) => core.tasks.list((await principalOf(req)).orgId));
  app.post('/api/tasks', async (req) => {
    const p = await principalOf(req);
    const b = req.body as { title: string; emoji?: string; day?: any; priority?: any };
    if (!b?.title?.trim()) throw badRequest('title is required');
    return core.tasks.create({ orgId: p.orgId, actorId: p.userId, ...b });
  });
  app.post('/api/tasks/:id/complete', async (req) => core.tasks.complete(params(req).id, (await principalOf(req)).userId));
  app.post('/api/tasks/:id/move', async (req) => {
    const p = await principalOf(req);
    const b = (req.body ?? {}) as { day?: 'today' | 'tomorrow' | 'upcoming' };
    return core.tasks.move(params(req).id, b.day ?? 'today', p.userId);
  });

  // --- Leads ---
  app.get('/api/leads', async (req) => core.leads.list((await principalOf(req)).orgId));
  app.post('/api/leads', async (req) => {
    const p = await principalOf(req);
    const b = req.body as { name: string; company?: string; phone?: string; email?: string; what?: string };
    if (!b?.name?.trim()) throw badRequest('name is required');
    return core.leads.create({ orgId: p.orgId, actorId: p.userId, ...b });
  });
  app.post('/api/leads/:id/advance', async (req) => core.leads.advance(params(req).id, (await principalOf(req)).userId));

  // Quick-add a lead from a phone + a rough note — the LLM (if configured) structures it.
  app.post('/api/leads/quick-add', async (req) => {
    const p = await principalOf(req);
    const b = req.body as { phone?: string; note: string };
    if (!b?.note?.trim()) throw badRequest('note is required');
    return core.leads.quickAddFromNote(
      { orgId: p.orgId, actorId: p.userId, phone: b.phone ?? '', note: b.note },
      llm?.extractLead,
    );
  });

  // --- AI agents + audit ---
  app.get('/api/agents', async () => core.agents.roster());
  app.get('/api/events', async (req) => core.events.list((await principalOf(req)).orgId, 50));
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
  app.put('/api/autonomy', async (req) => {
    const p = await principalOf(req);
    const b = req.body as { action?: string; level?: string };
    const actions = ['createTasks', 'sendReminders', 'draftReplies', 'chase', 'joinMeetings'];
    const levels = ['off', 'ask', 'auto'];
    if (!b || !actions.includes(b.action as string) || !levels.includes(b.level as string)) {
      throw badRequest('action and level are required (action ∈ ' + actions.join('|') + ', level ∈ off|ask|auto)');
    }
    return core.autonomy.set(p.orgId, b.action as any, b.level as any);
  });

  app.get('/api/approvals', async (req) => core.approvals.list((await principalOf(req)).orgId, 'pending'));
  app.post('/api/approvals/:id/approve', async (req) => { await principalOf(req); return core.approvals.approve(params(req).id); });
  app.post('/api/approvals/:id/dismiss', async (req) => { await principalOf(req); return core.approvals.dismiss(params(req).id); });

  // --- WhatsApp webhook (the one integration wired end-to-end) ---
  const wa = whatsapp.whatsappConfigFromEnv();

  app.get('/webhooks/whatsapp', async (req, reply) => {
    if (!wa) return reply.code(503).send('whatsapp not configured');
    const challenge = whatsapp.verifyWebhook(wa, req.query as any);
    if (challenge === null) return reply.code(403).send('forbidden');
    return reply.type('text/plain').send(challenge);
  });

  // Inbound capture does NOT require send-credentials — you can receive (and turn a
  // message into a loop) even before WHATSAPP_ACCESS_TOKEN is set; only the reply needs it.
  // (Production hardening TODO: verify the X-Hub-Signature-256 header here.)
  app.post('/webhooks/whatsapp', async (req, reply) => {
    const messages = whatsapp.parseInbound(LOCAL_ORG_ID, req.body);
    for (const m of messages) await ingest(core, m);
    return reply.code(200).send('ok');
  });

  // --- M4 fan-in: every other channel funnels into the SAME pipeline ---
  // Static /webhooks/whatsapp (above) keeps its Cloud-API shape; Gmail, Calendar, Slack,
  // Telegram and GitHub normalize to { from, text, ref } and reuse `ingest` verbatim.
  const FANIN_CHANNELS = ['email', 'slack', 'telegram', 'github', 'calendar'] as const;
  app.post('/webhooks/:channel', async (req, reply) => {
    const channel = (req.params as { channel: string }).channel;
    if (!(FANIN_CHANNELS as readonly string[]).includes(channel)) {
      return reply.code(404).send('unknown channel');
    }
    const b = req.body as { from?: string; text?: string; ref?: string };
    if (!b?.text?.trim()) throw badRequest('text is required');
    const loopId = await ingest(core, {
      orgId: LOCAL_ORG_ID,
      channel: channel as (typeof FANIN_CHANNELS)[number],
      from: b.from ?? 'unknown',
      text: b.text,
      ref: b.ref,
    });
    return reply.send({ captured: loopId });
  });

  // --- Embedded web UI (this app IS the website) ---
  app.get('/', async (_req, reply) => reply.type('text/html').send(renderUi()));

  return app;
}

function badRequest(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}
