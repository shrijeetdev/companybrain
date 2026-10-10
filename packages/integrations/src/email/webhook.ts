// Generic inbound-email webhook parser: Postmark, SendGrid Inbound Parse, Mailgun routes,
// Cloudflare Email Workers (forwarded as JSON), and similar `{from,to,subject,text,html}` shapes.

import { createHash } from 'node:crypto';
import type { InboundMessage } from '@companybrain/types';
import { bestBody, MAX_HTML_BODY, MAX_TEXT_BODY } from './text';
import {
  aligned,
  authenticatedByHeader,
  dkimSignatureDomain,
  domainOf,
  MAX_AUTH_RESULTS,
  MAX_HEADER_VALUE,
  receivedSpfPassDomain,
  type EmailAuthOptions,
} from './auth';

/** RFC 5321 path limit; a From header longer than this is truncated before parsing. */
export const MAX_FROM = 320;
/** Raw header blocks (SendGrid `headers`, Mailgun `message-headers`) are capped before parsing. */
const MAX_HEADER_BLOCK = 64 * 1024;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

const ADDR_STOP = new Set([' ', '\t', '\r', '\n', '<', '>', '"', "'", ',', ';', ':']);

/** local@domain.tld with exactly one '@', a dot inside the domain, no separators. Linear. */
function validAddress(a: string): boolean {
  if (a.length < 5 || a.length > 254) return false;
  for (const ch of a) if (ADDR_STOP.has(ch)) return false;
  const at = a.indexOf('@');
  if (at <= 0 || at !== a.lastIndexOf('@')) return false;
  const domain = a.slice(at + 1);
  const dot = domain.indexOf('.');
  return dot > 0 && !domain.endsWith('.');
}

/**
 * Parse "Raj Kumar <raj@x.com>" / "raj@x.com" / '"Kumar, Raj" <raj@x.com>' → address + name.
 * No backtracking regexes: input is capped at MAX_FROM chars and scanned with indexOf/split.
 */
export function parseAddress(raw: string | null | undefined): { address: string; name: string | null } | null {
  if (!raw) return null;
  const s = raw.slice(0, MAX_FROM).trim();
  if (s.endsWith('>')) {
    const lt = s.lastIndexOf('<');
    if (lt >= 0) {
      const inner = s.slice(lt + 1, -1).trim().toLowerCase();
      if (validAddress(inner)) {
        let name = s.slice(0, lt).trim();
        if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).trim();
        return { address: inner, name: name || null };
      }
    }
  }
  for (const tok of s.split(/[\s<>"',;:]+/)) {
    if (tok && validAddress(tok)) return { address: tok.toLowerCase(), name: null };
  }
  return null;
}

/** Raw header block → [lowercased name, value][] in order (folded lines joined). Linear. */
function headersFromRaw(raw: string | null): [string, string][] {
  if (!raw) return [];
  const out: [string, string][] = [];
  for (const line of raw.slice(0, MAX_HEADER_BLOCK).split(/\r?\n/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      const last = out[out.length - 1]!;
      if (last[1].length < MAX_AUTH_RESULTS) last[1] += ' ' + line.trim();
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    out.push([line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()]);
  }
  return out;
}

const cap = (v: string | null, n = MAX_HEADER_VALUE): string | null => (v && v.length > n ? v.slice(0, n) : v);

function parseDate(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const s = str(v)?.slice(0, 200);
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n < 1e12 ? Math.round(n * 1000) : n;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function cleanMessageId(id: string | null): string | null {
  if (!id) return null;
  const t = id.trim();
  return t ? t : null;
}

function fallbackId(from: string, subject: string | null, text: string): string {
  return `sha256:${createHash('sha256').update(`${from}\n${subject ?? ''}\n${text}`).digest('hex').slice(0, 32)}`;
}

interface Extracted {
  from: string | null;
  fromName?: string | null;
  subject: string | null;
  text: string | null;
  html: string | null;
  messageId: string | null;
  date: number | null;
  /** Provider-specific sender-authentication verdict for a given From address. */
  verify(from: string, opts: EmailAuthOptions): boolean;
}

const first = (hs: [string, string][], name: string) => hs.find(([k]) => k === name)?.[1] ?? null;

function extract(b: Obj): Extracted | null {
  // Postmark: PascalCase fields.
  if ('From' in b || 'FromFull' in b || 'TextBody' in b || 'HtmlBody' in b) {
    const full = isObj(b.FromFull) ? b.FromFull : null;
    const headers = Array.isArray(b.Headers) ? (b.Headers as unknown[]) : [];
    const midHeader = headers.find((h) => isObj(h) && typeof h.Name === 'string' && h.Name.toLowerCase() === 'message-id') as Obj | undefined;
    return {
      from: str(full?.Email) ?? str(b.From),
      fromName: str(full?.Name) ?? str(b.FromName),
      subject: str(b.Subject),
      text: str(b.StrippedTextReply) ?? str(b.TextBody),
      html: str(b.HtmlBody),
      messageId: str(midHeader?.Value) ?? str(b.MessageID),
      date: parseDate(b.Date),
      verify(from, opts) {
        const hs: [string, string][] = headers
          .filter((h): h is Obj => isObj(h) && typeof h.Name === 'string' && typeof h.Value === 'string')
          .slice(0, 500)
          .map((h) => [(h.Name as string).toLowerCase(), (h.Value as string).slice(0, MAX_AUTH_RESULTS)]);
        if (authenticatedByHeader(first(hs, 'authentication-results'), from, opts)) return true;
        // SpamAssassin's DKIM_VALID_AU = a valid DKIM signature from the author's (From) domain.
        if ((first(hs, 'x-spam-tests') ?? '').split(/[\s,]+/).includes('DKIM_VALID_AU')) return true;
        return aligned(receivedSpfPassDomain(first(hs, 'received-spf')), domainOf(from));
      },
    };
  }
  // Mailgun routes (forward/store): "body-plain", "stripped-text", "Message-Id", "message-headers".
  if ('body-plain' in b || 'stripped-text' in b || 'body-html' in b || 'message-headers' in b) {
    const mh = b['message-headers'];
    let pairs: unknown = mh;
    if (typeof mh === 'string') {
      try {
        pairs = JSON.parse(mh.slice(0, MAX_HEADER_BLOCK * 4));
      } catch {
        pairs = null;
      }
    }
    const hs: [string, string][] = Array.isArray(pairs)
      ? pairs
          .slice(0, 500)
          .filter((x): x is [string, string] => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string')
          .map(([k, v]) => [k.toLowerCase(), v.slice(0, MAX_AUTH_RESULTS)])
      : [];
    const mid = str(b['Message-Id']) ?? str(b['message-id']) ?? str(first(hs, 'message-id'));
    const sender = str(b.sender);
    return {
      from: str(b.from) ?? str(b.From) ?? sender,
      subject: str(b.subject) ?? str(b.Subject),
      text: str(b['stripped-text']) ?? str(b['body-plain']),
      html: str(b['stripped-html']) ?? str(b['body-html']),
      messageId: mid,
      date: parseDate(b.timestamp) ?? parseDate(b.Date),
      verify(from, opts) {
        if (authenticatedByHeader(first(hs, 'authentication-results'), from, opts)) return true;
        const fd = domainOf(from);
        const spf = (str(b['X-Mailgun-Spf']) ?? first(hs, 'x-mailgun-spf') ?? '').trim().toLowerCase();
        if (spf === 'pass' && aligned(domainOf(sender), fd)) return true;
        const dkim = (str(b['X-Mailgun-Dkim-Check-Result']) ?? first(hs, 'x-mailgun-dkim-check-result') ?? '').trim().toLowerCase();
        return dkim === 'pass' && aligned(dkimSignatureDomain(first(hs, 'dkim-signature')), fd);
      },
    };
  }
  // SendGrid Inbound Parse (fields posted as form/JSON: from, subject, text, html, headers string, envelope).
  // Cloudflare Email Workers / generic: from, to, subject, text, html, messageId, date.
  const hs = headersFromRaw(str(b.headers));
  let envelopeFrom: string | null = null;
  if (str(b.envelope)) {
    try {
      const env = JSON.parse((b.envelope as string).slice(0, MAX_HEADER_VALUE * 8)) as unknown;
      envelopeFrom = isObj(env) ? str(env.from) : null;
    } catch {
      /* ignore */
    }
  } else if (isObj(b.envelope)) {
    envelopeFrom = str(b.envelope.from);
  }
  let from = str(b.from);
  if (!from && isObj(b.from)) from = str(b.from.address) ?? str(b.from.email);
  if (!from) from = envelopeFrom;
  const fromName = isObj(b.from) ? str(b.from.name) : null;
  return {
    from,
    fromName,
    subject: str(b.subject),
    text: str(b.text) ?? str(b.plain) ?? str(b.body),
    html: str(b.html),
    messageId: str(b.messageId) ?? str(b.message_id) ?? str(b['Message-ID']) ?? str(first(hs, 'message-id')),
    date: parseDate(b.date) ?? parseDate(first(hs, 'date')),
    verify(fromAddr, opts) {
      // A forwarder you control (e.g. a Cloudflare Email Worker) that verified the message itself.
      if (b.authenticated === true) return true;
      if (authenticatedByHeader(first(hs, 'authentication-results'), fromAddr, opts)) return true;
      const fd = domainOf(fromAddr);
      // SendGrid Inbound Parse: `SPF` = "pass" (envelope sender), `dkim` = "{@a.com : pass, @b.com : fail}".
      if (str(b.SPF)?.trim().toLowerCase() === 'pass' && aligned(domainOf(envelopeFrom), fd)) return true;
      const dkim = str(b.dkim)?.slice(0, MAX_AUTH_RESULTS) ?? '';
      for (const part of dkim.replace(/[{}]/g, '').split(',')) {
        const [dom, res] = part.split(':').map((x) => x.trim().toLowerCase());
        if (res === 'pass' && aligned(domainOf(dom), fd)) return true;
      }
      return false;
    },
  };
}

/**
 * Normalize a provider webhook body into an InboundMessage. null when unusable.
 * `authenticated` is true only when the provider vouches for the From address (see ./auth.ts),
 * or when `opts.trustUnverifiedSenders` is set (unsafe).
 */
export function parseInboundEmailWebhook(body: unknown, opts: EmailAuthOptions = {}): InboundMessage | null {
  let b: unknown = body;
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      return null;
    }
  }
  if (!isObj(b)) return null;
  const e = extract(b);
  if (!e) return null;
  const addr = parseAddress(e.from);
  if (!addr) return null;
  const subject = cap(e.subject)?.trim() || null;
  const text = bestBody(cap(e.text, MAX_TEXT_BODY), cap(e.html, MAX_HTML_BODY)) || subject || '';
  if (!text) return null;
  let authenticated = !!opts.trustUnverifiedSenders;
  if (!authenticated) {
    try {
      authenticated = e.verify(addr.address, opts);
    } catch {
      authenticated = false;
    }
  }
  return {
    channel: 'email',
    from: addr.address,
    fromName: cap(e.fromName ?? null, 200)?.trim() || addr.name,
    subject,
    text,
    externalId: cleanMessageId(cap(e.messageId)) ?? fallbackId(addr.address, subject, text),
    receivedAt: e.date ?? Date.now(),
    authenticated,
  };
}
