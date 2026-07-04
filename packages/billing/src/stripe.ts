// Zero-dependency Stripe wrapper.
//
// We talk to the Stripe REST API directly with the global `fetch` (available in
// Node 20+) instead of pulling in the `stripe` SDK. This keeps @companybrain/billing
// install-free and consistent with the rest of the monorepo's "no native deps"
// stance. Only three things are needed:
//
//   1. create a Checkout Session (one redirect URL for the customer to pay),
//   2. verify a webhook's HMAC signature (Stripe signs `t=...,v1=...`),
//   3. turn a verified raw payload into a typed-enough event object.
//
// On any signature mismatch we return `null`/`false` rather than throwing, so a
// caller can simply `if (!event) return` from a webhook route.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  successUrl: string;
  cancelUrl: string;
}

const STRIPE_API = 'https://api.stripe.com/v1';

export interface CreateCheckoutOpts {
  priceId: string;
  customerEmail: string;
  metadata: Record<string, string>;
  /** 'subscription' for recurring plans, 'payment' for one-time. Defaults to payment. */
  mode?: 'payment' | 'subscription';
  /** Optional quantity (e.g. extra seats). Defaults to 1. */
  quantity?: number;
}

/**
 * Create a Stripe Checkout Session and return the URL the customer should be
 * redirected to. Throws on non-2xx responses (the caller decides how to surface
 * a failed checkout attempt) — but never throws on signature checks below.
 */
export async function createCheckoutSession(
  config: StripeConfig,
  opts: CreateCheckoutOpts,
): Promise<{ url: string }> {
  if (!config.secretKey) throw new Error('createCheckoutSession: secretKey is required');
  if (!opts.priceId) throw new Error('createCheckoutSession: priceId is required');

  const mode = opts.mode ?? 'payment';
  const form = new URLSearchParams();
  form.set('mode', mode);
  form.set('success_url', config.successUrl);
  form.set('cancel_url', config.cancelUrl);
  form.set('line_items[0][price]', opts.priceId);
  form.set('line_items[0][quantity]', String(opts.quantity ?? 1));
  if (opts.customerEmail) form.set('customer_email', opts.customerEmail);
  for (const [k, v] of Object.entries(opts.metadata)) {
    form.set(`metadata[${k}]`, v);
  }

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Stripe checkout failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { url?: string; id?: string };
  if (!json.url) {
    throw new Error(`Stripe checkout response missing url (session ${json.id ?? 'unknown'})`);
  }
  return { url: json.url };
}

/**
 * Verify a Stripe webhook signature header against the raw request body.
 *
 * Stripe signs `{timestamp}.{rawBody}` with HMAC-SHA256 and sends the result as
 * `t=<timestamp>,v1=<hex>`. We allow up to 5 minutes of clock skew to tolerate
 * delivery delays. Returns `false` on any mismatch — never throws.
 */
export async function verifyWebhookSignature(
  config: StripeConfig,
  payload: string,
  signature: string,
): Promise<boolean> {
  if (!config.webhookSecret || !signature) return false;

  // Parse `t=...,v1=...`
  const parts = signature.split(',');
  let timestamp: string | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === 't') timestamp = val;
    else if (key === 'v1') v1 = val;
  }
  if (!timestamp || !v1) return false;

  // Reject stale timestamps (replay protection). 5 min window.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const ageMs = Math.abs(Date.now() - ts * 1000);
  if (ageMs > 5 * 60 * 1000) return false;

  const expected = createHmac('sha256', config.webhookSecret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');

  // Constant-time compare.
  if (expected.length !== v1.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    return false;
  }
}

export interface StripeEvent {
  type: string;
  data: { object: any };
}

/**
 * Verify + parse a raw webhook body into a minimal Stripe event object. Returns
 * `null` if the signature is invalid or the body isn't valid JSON — never throws.
 */
export async function constructStripeEvent(
  config: StripeConfig,
  payload: string,
  signature: string,
): Promise<StripeEvent | null> {
  const ok = await verifyWebhookSignature(config, payload, signature);
  if (!ok) return null;
  try {
    const parsed = JSON.parse(payload) as { type?: string; data?: { object?: any } };
    if (typeof parsed.type !== 'string' || !parsed.data) return null;
    return { type: parsed.type, data: { object: parsed.data.object ?? {} } };
  } catch {
    return null;
  }
}
