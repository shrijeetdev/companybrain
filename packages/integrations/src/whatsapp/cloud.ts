// WhatsApp Cloud API (official, Meta Graph API): webhook verification, signature check,
// payload parsing, and plain-text sending.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { InboundMessage } from '@companybrain/types';
import type { IntegrationsConfig } from '../config';
import { defaultLogger, fetchWithTimeout, normalizePhone, phoneDigits, safeText, type FetchLike, type Logger } from '../util';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Still burn comparable time so length isn't trivially observable.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** GET handshake: returns hub.challenge when mode=subscribe and the verify token matches. */
function verifyChallenge(cfg: IntegrationsConfig, query: Record<string, string>): string | null {
  const expected = cfg.whatsapp.verifyToken;
  if (!expected) return null;
  if (query['hub.mode'] !== 'subscribe') return null;
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (typeof token !== 'string' || typeof challenge !== 'string') return null;
  if (!safeEqual(token, expected)) return null;
  return challenge;
}

/**
 * Verify `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(rawBody, appSecret).
 * Fails closed: false when the app secret isn't configured or the header is missing/malformed.
 */
function verifySignature(cfg: IntegrationsConfig, rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = cfg.whatsapp.appSecret;
  if (!secret || !signatureHeader || !Buffer.isBuffer(rawBody)) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (!m) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(m[1]!.toLowerCase(), 'hex');
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** Extract the user-visible text of a Cloud API message, or null for unsupported types. */
function messageText(m: Obj): string | null {
  const type = s(m.type);
  if (type === 'text' && isObj(m.text)) return s(m.text.body);
  if (type === 'interactive' && isObj(m.interactive)) {
    const i = m.interactive;
    if (isObj(i.button_reply)) return s(i.button_reply.title) ?? s(i.button_reply.id);
    if (isObj(i.list_reply)) return s(i.list_reply.title) ?? s(i.list_reply.id);
    return null;
  }
  if (type === 'button' && isObj(m.button)) return s(m.button.text) ?? s(m.button.payload);
  return null;
}

/** Parse a webhook POST body into normalized inbound messages (statuses etc. are ignored). */
function parseWebhook(body: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  if (!isObj(body)) return out;
  for (const entry of arr(body.entry)) {
    if (!isObj(entry)) continue;
    for (const change of arr(entry.changes)) {
      if (!isObj(change) || !isObj(change.value)) continue;
      const value = change.value;
      const names = new Map<string, string>();
      for (const c of arr(value.contacts)) {
        if (isObj(c) && s(c.wa_id) && isObj(c.profile) && s(c.profile.name)) names.set(c.wa_id as string, c.profile.name as string);
      }
      for (const m of arr(value.messages)) {
        if (!isObj(m)) continue;
        const text = messageText(m)?.trim();
        const id = s(m.id);
        const fromRaw = s(m.from);
        if (!text || !id || !fromRaw) continue;
        const from = normalizePhone(fromRaw) ?? fromRaw;
        const ts = Number(m.timestamp);
        out.push({
          channel: 'whatsapp',
          from,
          fromName: names.get(fromRaw) ?? null,
          subject: null,
          text,
          externalId: id,
          receivedAt: Number.isFinite(ts) && ts > 0 ? ts * 1000 : Date.now(),
        });
      }
    }
  }
  return out;
}

export const whatsappCloud = { verifyChallenge, verifySignature, parseWebhook };

/** Send a plain text message via the Cloud API. Never throws. */
export async function sendCloudText(
  cfg: IntegrationsConfig,
  to: string,
  text: string,
  deps: { fetch?: FetchLike; log?: Logger } = {},
): Promise<boolean> {
  const log = deps.log ?? defaultLogger;
  const w = cfg.whatsapp;
  if (!w.cloudConfigured || !w.phoneNumberId || !w.accessToken) return false;
  const digits = phoneDigits(to);
  if (!digits) {
    log.warn('whatsapp: invalid phone number', to);
    return false;
  }
  try {
    const res = await fetchWithTimeout(
      deps.fetch ?? fetch,
      `https://graph.facebook.com/${w.graphVersion}/${encodeURIComponent(w.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${w.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: digits,
          type: 'text',
          text: { preview_url: false, body: text.slice(0, 4096) },
        }),
      },
      10_000,
    );
    if (!res.ok) {
      log.warn(`whatsapp cloud send failed: HTTP ${res.status} ${await safeText(res)}`);
      return false;
    }
    return true;
  } catch (e) {
    log.warn('whatsapp cloud send error:', e instanceof Error ? e.message : e);
    return false;
  }
}
