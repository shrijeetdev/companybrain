// Offline license keys.
//
// A license key is a signed, self-contained token: the org + plan + seats +
// expiry, plus an HMAC-SHA256 signature over that payload, all packed into a
// readable `CB-...-...-...-...` string. Validating a key never calls out to a
// server — anyone holding the shared `secret` (kept server-side) can confirm a
// key is genuine and unexpired. This is what makes the self-host "Lifetime"
// tier work: a customer gets a key once and it validates forever offline.
//
// Wire format:  CB-{base32(jsonPayload)}-{base32(hmacSig)}
//   - base32 (RFC 4648 alphabet, no padding) keeps keys URL/file-safe and
//     readable; the payload is the raw JSON UTF-8 bytes.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getPlan, type PlanId } from './plans';

export interface LicenseKey {
  orgId: string;
  plan: PlanId;
  seats: number;
  issuedAt: number;
  /** Unix ms. `null` means the license never expires (the Lifetime tier). */
  expiresAt: number | null;
  signature: string;
}

export interface GenerateLicenseOpts {
  orgId: string;
  plan: PlanId;
  seats: number;
  /** Server-side secret used to sign the key. Never ship this to clients. */
  secret: string;
  /** Unix ms. Omit / pass null for a perpetual (Lifetime) license. */
  expiresAt?: number | null;
  /** Override the issue timestamp (defaults to now). Mainly for tests. */
  issuedAt?: number;
}

const PREFIX = 'CB';

// ─── base32 (RFC 4648, no padding) ────────────────────────────────────────────
// Implemented locally rather than pulling in a dependency; we only need encode
// of arbitrary bytes and decode back to bytes.

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]!;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

function base32Decode(input: string): Uint8Array | null {
  const clean = input.replace(/=+$/, '').toUpperCase();
  if (!/^[A-Z2-7]*$/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function hmacHex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Sign a license and pack it into a `CB-XXXX-XXXX-XXXX-XXXX`-style key.
 *
 * The key embeds the org, plan, seat count, and expiry, plus an HMAC-SHA256
 * signature over the JSON payload. Returns a single readable string.
 */
export function generateLicense(opts: GenerateLicenseOpts): string {
  if (!opts.orgId) throw new Error('generateLicense: orgId is required');
  if (!opts.secret) throw new Error('generateLicense: secret is required');
  // Guard against unknown plan ids — fall back gracefully but still sign.
  const plan = getPlan(opts.plan);
  const seats = Math.max(1, Math.floor(opts.seats));
  const issuedAt = opts.issuedAt ?? Date.now();

  const payload = {
    o: opts.orgId,
    p: plan.id,
    s: seats,
    i: issuedAt,
    e: opts.expiresAt ?? null,
  };
  const payloadJson = JSON.stringify(payload);
  const sig = hmacHex(opts.secret, payloadJson);

  const payloadB32 = base32Encode(Buffer.from(payloadJson, 'utf8'));
  const sigB32 = base32Encode(Buffer.from(sig, 'utf8'));

  return `${PREFIX}-${payloadB32}-${sigB32}`;
}

/** Parse a key into its LicenseKey fields WITHOUT verifying the signature. Use for display only. */
export function parseLicense(key: string): LicenseKey | null {
  const parts = key.trim().toUpperCase().split('-');
  // [CB, ...payloadChunks..., ...sigChunks...] — payload/sig are unsplit base32
  if (parts.length < 3 || parts[0] !== PREFIX) return null;

  // Re-glue the payload and sig: the human-readable "-XXXX-XXXX" grouping is
  // cosmetic. We split on every dash, so everything between PREFIX and the last
  // chunk is payload, and the final chunk is the signature. To be robust to
  // arbitrary dash placement we instead find the boundary by attempting a parse:
  // signature is always the last segment, payload is the middle.
  const middle = parts.slice(1); // drop CB
  if (middle.length < 2) return null;

  // Strategy: try every split point where the right side decodes to valid sig
  // bytes; pick the one whose payload JSON parses. In practice keys have exactly
  // two middle segments, but this keeps us tolerant of re-grouped dashes.
  for (let split = 1; split < middle.length; split++) {
    const payloadStr = middle.slice(0, split).join('');
    const sigStr = middle.slice(split).join('');

    const payloadBytes = base32Decode(payloadStr);
    if (!payloadBytes) continue;

    let payloadJson: string;
    try {
      payloadJson = Buffer.from(payloadBytes).toString('utf8');
      JSON.parse(payloadJson); // validate it's real JSON
    } catch {
      continue;
    }

    const parsed = JSON.parse(payloadJson) as {
      o: unknown; p: unknown; s: unknown; i: unknown; e: unknown;
    };
    if (
      typeof parsed.o !== 'string' ||
      typeof parsed.p !== 'string' ||
      typeof parsed.s !== 'number' ||
      typeof parsed.i !== 'number' ||
      (parsed.e !== null && typeof parsed.e !== 'number')
    ) {
      continue;
    }

    return {
      orgId: parsed.o,
      plan: parsed.p as PlanId,
      seats: parsed.s,
      issuedAt: parsed.i,
      expiresAt: parsed.e as number | null,
      signature: sigStr,
    };
  }
  return null;
}

/**
 * Validate a license key: correct signature (constant-time) AND not expired.
 * Returns the parsed LicenseKey on success, or `null` if the key is forged,
 * malformed, or past its expiry. Never throws.
 */
export function validateLicense(key: string, secret: string): LicenseKey | null {
  if (!key || !secret) return null;

  // Re-derive the payload string + signature bytes by reparsing, then recompute
  // the HMAC over the canonical JSON and compare in constant time.
  const parts = key.trim().toUpperCase().split('-');
  if (parts.length < 3 || parts[0] !== PREFIX) return null;
  const middle = parts.slice(1);
  if (middle.length < 2) return null;

  for (let split = 1; split < middle.length; split++) {
    const payloadStr = middle.slice(0, split).join('');
    const sigStr = middle.slice(split).join('');

    const payloadBytes = base32Decode(payloadStr);
    const sigBytes = base32Decode(sigStr);
    if (!payloadBytes || !sigBytes) continue;

    let payloadJson: string;
    let parsed: { o: unknown; p: unknown; s: unknown; i: unknown; e: unknown };
    try {
      payloadJson = Buffer.from(payloadBytes).toString('utf8');
      parsed = JSON.parse(payloadJson);
    } catch {
      continue;
    }
    if (
      typeof parsed.o !== 'string' ||
      typeof parsed.p !== 'string' ||
      typeof parsed.s !== 'number' ||
      typeof parsed.i !== 'number' ||
      (parsed.e !== null && typeof parsed.e !== 'number')
    ) {
      continue;
    }

    // Recompute the expected signature over the canonical JSON and compare.
    const expectedSigHex = hmacHex(secret, payloadJson);
    const actualSigHex = Buffer.from(sigBytes).toString('utf8'); // we stored sig as hex-string bytes
    if (!constantTimeHexEqual(expectedSigHex, actualSigHex)) continue;

    // Signature checks out — now enforce expiry.
    const expiresAt = parsed.e as number | null;
    if (expiresAt !== null && expiresAt <= Date.now()) return null;

    return {
      orgId: parsed.o,
      plan: parsed.p as PlanId,
      seats: parsed.s,
      issuedAt: parsed.i,
      expiresAt,
      signature: sigStr,
    };
  }
  return null;
}
