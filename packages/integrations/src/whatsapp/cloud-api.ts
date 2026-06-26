// WhatsApp Cloud API — the FIRST integration wired end-to-end (cleanest path: a
// phone-number-id + permanent token + a verified webhook URL). Real network calls.

import type { InboundMessage } from '../pipeline';

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  /** the token you set when subscribing the webhook in the Meta dashboard */
  verifyToken: string;
}

export function whatsappConfigFromEnv(env = process.env): WhatsAppConfig | null {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  const verifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!phoneNumberId || !accessToken || !verifyToken) return null;
  return { phoneNumberId, accessToken, verifyToken };
}

/** GET handshake Meta sends to verify the webhook URL. Returns the challenge or null. */
export function verifyWebhook(
  cfg: WhatsAppConfig,
  query: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string },
): string | null {
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === cfg.verifyToken) {
    return query['hub.challenge'] ?? '';
  }
  return null;
}

/** Parse a Cloud API webhook POST body into normalized inbound messages. */
export function parseInbound(orgId: string, body: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (body as any)?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      for (const m of value?.messages ?? []) {
        const text: string = m?.text?.body ?? m?.button?.text ?? '';
        out.push({ orgId, channel: 'whatsapp', from: m?.from ?? 'unknown', text, ref: m?.id });
      }
    }
  }
  return out;
}

/** Send a text reply (used by chase/draft-reply jobs). */
export async function sendText(cfg: WhatsAppConfig, to: string, body: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp sendText failed: ${res.status} ${await res.text()}`);
  }
}
