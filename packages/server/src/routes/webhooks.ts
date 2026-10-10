// Inbound webhooks (public). Both fail closed: no valid signature/secret → 401.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { InboundMessage } from '@companybrain/types';
import type { ServerDeps } from '../types';
import type { Limiter } from '../auth';
import { safeEqual, sendError } from '../http';

interface RawBody {
  raw: Buffer;
}

function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body)) if (!(k in out)) out[k] = v;
  return out;
}

export async function registerWebhooks(app: FastifyInstance, deps: ServerDeps, limit: Limiter) {
  await app.register(async (wh) => {
    wh.addHook('onRequest', limit);
    // Signatures are computed over the exact bytes: keep the raw body, parse JSON ourselves.
    wh.removeContentTypeParser(['application/json', 'text/plain']);
    wh.addContentTypeParser(['application/json', 'text/plain'], { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, { raw: body as Buffer } satisfies RawBody);
    });
    wh.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, { raw: body as Buffer } satisfies RawBody);
    });

    const dispatch = (req: FastifyRequest, msgs: InboundMessage[]) => {
      // Respond to the provider immediately; process in the background.
      setImmediate(() => {
        for (const m of msgs) {
          deps.integrations.onInbound(m).catch((err) => req.log.error({ err, channel: m.channel }, 'inbound handler failed'));
        }
      });
    };

    // ── WhatsApp Cloud API (Meta) ─────────────────────────────────────────
    wh.get('/webhooks/whatsapp', async (req, reply) => {
      const h = deps.integrations.whatsappWebhook;
      if (!h) return sendError(reply, 'not_found', 'WhatsApp Cloud webhook is not configured');
      const q: Record<string, string> = {};
      for (const [k, v] of Object.entries((req.query ?? {}) as Record<string, unknown>)) if (typeof v === 'string') q[k] = v;
      const challenge = h.verifyChallenge(q);
      if (challenge === null) return sendError(reply, 'forbidden', 'Verification failed');
      return reply.type('text/plain; charset=utf-8').send(challenge);
    });

    wh.post('/webhooks/whatsapp', async (req, reply) => {
      const h = deps.integrations.whatsappWebhook;
      if (!h) return sendError(reply, 'not_found', 'WhatsApp Cloud webhook is not configured');
      const raw = (req.body as RawBody | undefined)?.raw ?? Buffer.alloc(0);
      const sig = req.headers['x-hub-signature-256'];
      let valid = false;
      try {
        valid = h.verifySignature(raw, typeof sig === 'string' ? sig : undefined);
      } catch (err) {
        req.log.warn({ err }, 'whatsapp signature check threw');
      }
      if (!valid) return sendError(reply, 'unauthorized', 'Invalid signature');
      let msgs: InboundMessage[] = [];
      try {
        msgs = h.parse(JSON.parse(raw.toString('utf8')));
      } catch (err) {
        // Signed by Meta but unparseable: acknowledge so Meta doesn't retry forever.
        req.log.warn({ err }, 'whatsapp webhook payload not understood');
      }
      dispatch(req, msgs);
      return { ok: true };
    });

    // ── Generic inbound email (Postmark / SendGrid / Mailgun / Cloudflare) ─
    wh.post('/webhooks/email', async (req, reply) => {
      const secret = deps.config.emailWebhookSecret;
      const parse = deps.integrations.parseEmailWebhook;
      if (!secret || !parse) return sendError(reply, 'not_found', 'Email webhook is not configured');
      const header = req.headers['x-cb-webhook-secret'];
      const q = (req.query ?? {}) as Record<string, unknown>;
      const given = typeof header === 'string' ? header : typeof q.secret === 'string' ? q.secret : '';
      if (!given || !safeEqual(given, secret)) return sendError(reply, 'unauthorized', 'Invalid webhook secret');

      const raw = (req.body as RawBody | undefined)?.raw;
      let body: unknown = {};
      if (raw && raw.length) {
        const text = raw.toString('utf8');
        const ct = String(req.headers['content-type'] ?? '');
        try {
          body = ct.includes('application/x-www-form-urlencoded') ? parseForm(text) : JSON.parse(text);
        } catch {
          return sendError(reply, 'bad_request', 'Body is not valid JSON');
        }
      }
      let msg: InboundMessage | null = null;
      try {
        msg = parse(body);
      } catch (err) {
        req.log.warn({ err }, 'email webhook payload not understood');
      }
      if (!msg) return { ok: true, ignored: true };
      dispatch(req, [msg]);
      return { ok: true };
    });
  });
}
