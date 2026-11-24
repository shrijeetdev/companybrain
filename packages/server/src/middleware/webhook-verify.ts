import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from './logger';

/**
 * Resolve the exact bytes the signer HMAC'd. Meta/Slack/GitHub sign the raw
 * request bytes, not a re-serialized JSON object (key ordering/whitespace differ).
 * The content-type parser in server.ts stashes the raw UTF-8 string on req.rawBody.
 */
function getRawBody(req: FastifyRequest): string {
  const raw = (req as any).rawBody;
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  // ponytail: fallback only — HMAC will likely NOT match the bytes the signer sent.
  logger.warn('req.rawBody missing — webhook HMAC may not match the bytes the signer sent');
  return JSON.stringify(req.body);
}

/** Constant-time string compare; length mismatch is not secret, so it short-circuits. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify WhatsApp Cloud API webhook signature (X-Hub-Signature-256).
 * Returns true if the signature is valid, false otherwise.
 */
export function verifyWhatsAppSignature(
  body: string | Buffer,
  signature: string | undefined,
  appSecret: string,
): boolean {
  if (!signature) return false;
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** A webhook rejection that the error handler turns into the given status, not a 500. */
function rejected(statusCode: number, message: string): Error & { statusCode: number } {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = statusCode;
  return e;
}

/**
 * Fastify preHandler hook for WhatsApp webhook signature verification.
 * B6: fail-closed when WHATSAPP_APP_SECRET is unset (never accept forged messages).
 */
export function whatsappSignatureVerify() {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      // Fail-closed: a missing secret must NOT become "accept everything".
      throw rejected(503, 'WHATSAPP_APP_SECRET not configured — webhook rejected (fail-closed)');
    }

    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!signature) {
      throw rejected(401, 'Missing WhatsApp webhook signature');
    }

    const rawBody = getRawBody(req);
    if (!verifyWhatsAppSignature(rawBody, signature, appSecret)) {
      throw rejected(401, 'Invalid WhatsApp webhook signature');
    }
  };
}

// --- H1: per-channel signature schemes for the generic fan-in webhook ---

interface ChannelScheme {
  headerName: string;                                  // header carrying the signature/token
  envVar: string;                                      // env var holding the shared secret
  prefix?: string;                                     // value prefix, e.g. 'sha256=' or 'v0='
  directCompare?: boolean;                             // telegram: header value === secret (no HMAC)
  buildMessage?: (req: FastifyRequest, rawBody: string) => string; // exact bytes to HMAC
}

// Real per-channel signing schemes. A generic 'x-webhook-signature' HMAC would never match
// real Slack/GitHub/Telegram requests — the schemes differ in header, prefix, and base string.
const CHANNEL_SCHEMES: Record<string, ChannelScheme> = {
  slack: {
    headerName: 'x-slack-signature',
    envVar: 'SLACK_SIGNING_SECRET',
    prefix: 'v0=',
    buildMessage: (req, raw) => `v0:${req.headers['x-slack-request-timestamp'] ?? ''}:${raw}`,
  },
  github: {
    headerName: 'x-hub-signature-256',
    envVar: 'GITHUB_WEBHOOK_SECRET',
    prefix: 'sha256=',
  },
  telegram: {
    // Telegram echoes back the secret token you set at webhook registration — direct compare, no HMAC.
    headerName: 'x-telegram-bot-api-secret-token',
    envVar: 'TELEGRAM_WEBHOOK_SECRET',
    directCompare: true,
  },
};

// Inbound-push channels with no standard signing mechanism. Allowed only outside production.
const UNAUTHENTICATED_CHANNELS = new Set(['email', 'calendar']);

function verifyChannelSignature(
  scheme: ChannelScheme,
  provided: string,
  secret: string,
  rawBody: string,
  req: FastifyRequest,
): boolean {
  if (scheme.directCompare) return safeEqual(provided, secret);
  const message = scheme.buildMessage ? scheme.buildMessage(req, rawBody) : rawBody;
  const expected = (scheme.prefix ?? '') + createHmac('sha256', secret).update(message).digest('hex');
  return safeEqual(expected, provided);
}

/**
 * Generic webhook signature verification for the fan-in route (/webhooks/:channel).
 * H1: every channel is authenticated. Channels with a known signing scheme are verified
 * against their configured secret (fail-closed if the secret is unset). Channels with no
 * standard signing mechanism (email/calendar) are rejected in production.
 */
export function genericWebhookVerify() {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const channel = (req.params as { channel?: string } | undefined)?.channel ?? '';
    const scheme = CHANNEL_SCHEMES[channel];

    if (scheme) {
      const secret = process.env[scheme.envVar];
      if (!secret) {
        throw rejected(503, `${scheme.envVar} not configured — ${channel} webhook rejected (fail-closed)`);
      }
      const provided = req.headers[scheme.headerName] as string | undefined;
      if (!provided) {
        throw rejected(401, `Missing ${scheme.headerName} signature for ${channel} webhook`);
      }
      if (channel === 'slack') {
        // Slack signs a timestamp; refuse anything older than 5 minutes so captured requests can't be replayed.
        const ts = Number(req.headers['x-slack-request-timestamp']);
        if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
          throw rejected(401, 'Stale or missing Slack request timestamp');
        }
      }
      const rawBody = getRawBody(req);
      if (!verifyChannelSignature(scheme, provided, secret, rawBody, req)) {
        throw rejected(401, `Invalid webhook signature for ${channel}`);
      }
      return;
    }

    // No signing scheme for this channel (e.g. email/calendar inbound push).
    if (!UNAUTHENTICATED_CHANNELS.has(channel)) {
      throw rejected(404, `Unknown channel '${channel}' — webhook rejected`);
    }
    if (process.env.NODE_ENV === 'production') {
      throw rejected(401, `Unauthenticated ${channel} webhook rejected in production`);
    }
    logger.warn({ channel }, 'Unauthenticated webhook accepted in non-production (inbound push)');
  };
}
