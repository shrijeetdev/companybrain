// Inbound-email sender authentication (anti-spoofing).
//
// An email's From header is trivially forged. Before intake treats a message as "from" a team
// member (creating tasks as them, running `list` / `done N`), the receiving mail system must have
// verified it: DMARC pass, or a DKIM/SPF pass for a domain aligned with the From domain.
//
// Sources, by intake path:
//   IMAP     — the TOPMOST `Authentication-Results` header (the one the receiving mailbox provider
//              prepended; anything below it may have been written by the sender). When
//              EMAIL_AUTHSERV_ID is set (e.g. `mx.google.com`), that header's authserv-id must match.
//   Webhooks — provider fields (Postmark Headers / X-Spam-Tests / Received-SPF, SendGrid `SPF` +
//              `dkim`, Mailgun `X-Mailgun-Spf` / `X-Mailgun-Dkim-Check-Result` + DKIM-Signature,
//              or an explicit `authenticated: true` from your own forwarder, e.g. a Cloudflare
//              Email Worker that checked the message itself).
//
// All parsing here is linear and bounded (header values are capped before parsing).

/** Cap for an Authentication-Results value (multi-signature headers can exceed 1 KB). */
export const MAX_AUTH_RESULTS = 4096;
/** Cap for any other single header value. */
export const MAX_HEADER_VALUE = 1024;

export interface EmailAuthOptions {
  /** Required authserv-id of the topmost Authentication-Results header (EMAIL_AUTHSERV_ID). */
  authservId?: string | null;
  /** EMAIL_TRUST_UNVERIFIED_SENDERS=true — UNSAFE escape hatch: treat every sender as verified. */
  trustUnverifiedSenders?: boolean;
}

export interface AuthResult {
  method: string;
  result: string;
  props: Record<string, string>;
}

/** Remove RFC 5322 comments "(…)" (nested, linear). */
function stripComments(s: string): string {
  let depth = 0;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '\\' && depth > 0) {
      i++;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && depth > 0) depth--;
    else if (depth === 0) out += c;
  }
  return out;
}

/** Parse one Authentication-Results header value (RFC 8601). */
export function parseAuthenticationResults(value: string): { authservId: string; results: AuthResult[] } {
  const v = stripComments(value.slice(0, MAX_AUTH_RESULTS).replace(/\r?\n[ \t]*/g, ' '));
  const parts = v.split(';');
  const authservId = (parts[0] ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const results: AuthResult[] = [];
  for (const part of parts.slice(1)) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const first = tokens[0];
    if (!first) continue;
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const method = first.slice(0, eq).split('/')[0]!.toLowerCase();
    const result = first.slice(eq + 1).toLowerCase();
    const props: Record<string, string> = {};
    for (const t of tokens.slice(1)) {
      const e = t.indexOf('=');
      if (e <= 0) continue;
      const key = t.slice(0, e).toLowerCase();
      if (!key.includes('.')) continue; // reason=… etc.
      props[key] = t.slice(e + 1).replace(/^"|"$/g, '').toLowerCase();
    }
    results.push({ method, result, props });
  }
  return { authservId, results };
}

/** Domain part of an address / "@domain" / bare domain, lowercased; null when empty. */
export function domainOf(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase().replace(/^<|>$/g, '');
  const at = s.lastIndexOf('@');
  const d = (at >= 0 ? s.slice(at + 1) : s).replace(/\.$/, '');
  return d && d.includes('.') ? d : null;
}

/** Relaxed alignment: the authenticated domain is the From domain or a parent of it. */
export function aligned(authDomain: string | null, fromDomain: string | null): boolean {
  if (!authDomain || !fromDomain) return false;
  return authDomain === fromDomain || fromDomain.endsWith(`.${authDomain}`);
}

/** Does a parsed Authentication-Results header vouch for this From address? */
export function resultsVouchFor(results: AuthResult[], from: string): boolean {
  const fd = domainOf(from);
  if (!fd) return false;
  for (const r of results) {
    if (r.result !== 'pass') continue;
    if (r.method === 'dmarc') {
      const hf = r.props['header.from'];
      if (!hf || domainOf(hf) === fd) return true;
    } else if (r.method === 'dkim') {
      if (aligned(domainOf(r.props['header.d']), fd) || aligned(domainOf(r.props['header.i']), fd)) return true;
    } else if (r.method === 'spf') {
      if (aligned(domainOf(r.props['smtp.mailfrom']), fd)) return true;
    }
  }
  return false;
}

/**
 * Verdict from the topmost Authentication-Results header value (the first one in header order).
 * `null`/missing header → not authenticated.
 */
export function authenticatedByHeader(topmost: string | null | undefined, from: string, opts: EmailAuthOptions = {}): boolean {
  if (!topmost) return false;
  const ar = parseAuthenticationResults(topmost);
  const want = opts.authservId?.trim().toLowerCase();
  if (want && ar.authservId !== want) return false;
  return resultsVouchFor(ar.results, from);
}

/** `d=` of a DKIM-Signature header value. */
export function dkimSignatureDomain(sig: string | null | undefined): string | null {
  if (!sig) return null;
  for (const tag of sig.slice(0, MAX_AUTH_RESULTS).split(';')) {
    const eq = tag.indexOf('=');
    if (eq > 0 && tag.slice(0, eq).trim().toLowerCase() === 'd') return domainOf(tag.slice(eq + 1).replace(/\s+/g, ''));
  }
  return null;
}

/** First "pass" in a Received-SPF value, with its envelope-from domain. */
export function receivedSpfPassDomain(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.slice(0, MAX_HEADER_VALUE).trim();
  if (!/^pass\b/i.test(s)) return null;
  const at = s.toLowerCase().indexOf('envelope-from=');
  if (at < 0) return null;
  const rest = s.slice(at + 'envelope-from='.length).replace(/^["<\s]+/, '');
  const end = rest.search(/[\s;">]/);
  return domainOf(end < 0 ? rest : rest.slice(0, end));
}
