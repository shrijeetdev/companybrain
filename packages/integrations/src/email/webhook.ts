// Generic inbound-email webhook parser: Postmark, SendGrid Inbound Parse, Mailgun routes,
// Cloudflare Email Workers (forwarded as JSON), and similar `{from,to,subject,text,html}` shapes.

import { createHash } from 'node:crypto';
import type { InboundMessage } from '@companybrain/types';
import { bestBody } from './text';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Parse "Raj Kumar <raj@x.com>" / "raj@x.com" / '"Kumar, Raj" <raj@x.com>' → address + name. */
export function parseAddress(raw: string | null | undefined): { address: string; name: string | null } | null {
  if (!raw) return null;
  const s = raw.trim();
  const angle = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(s);
  if (angle) {
    const name = angle[1]!.trim().replace(/^"(.*)"$/, '$1').trim();
    return { address: angle[2]!.toLowerCase(), name: name || null };
  }
  const bare = /([^\s<>"',;:]+@[^\s<>"',;:]+\.[^\s<>"',;:]+)/.exec(s);
  if (!bare) return null;
  return { address: bare[1]!.toLowerCase(), name: null };
}

/** Find a header value in a raw header block ("Name: value\r\n…"), unfolding continuations. */
function headerFromRaw(raw: string | null, name: string): string | null {
  if (!raw) return null;
  const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ');
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im');
  return re.exec(unfolded)?.[1]?.trim() ?? null;
}

function parseDate(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const s = str(v);
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
}

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
    };
  }
  // Mailgun routes (forward/store): "body-plain", "stripped-text", "Message-Id", "message-headers".
  if ('body-plain' in b || 'stripped-text' in b || 'body-html' in b || 'message-headers' in b) {
    let mid = str(b['Message-Id']) ?? str(b['message-id']);
    if (!mid) {
      const mh = b['message-headers'];
      let pairs: unknown = mh;
      if (typeof mh === 'string') {
        try {
          pairs = JSON.parse(mh);
        } catch {
          pairs = null;
        }
      }
      if (Array.isArray(pairs)) {
        const p = pairs.find((x) => Array.isArray(x) && typeof x[0] === 'string' && x[0].toLowerCase() === 'message-id');
        mid = Array.isArray(p) ? str(p[1]) : null;
      }
    }
    return {
      from: str(b.from) ?? str(b.From) ?? str(b.sender),
      subject: str(b.subject) ?? str(b.Subject),
      text: str(b['stripped-text']) ?? str(b['body-plain']),
      html: str(b['stripped-html']) ?? str(b['body-html']),
      messageId: mid,
      date: parseDate(b.timestamp) ?? parseDate(b.Date),
    };
  }
  // SendGrid Inbound Parse (fields posted as form/JSON: from, subject, text, html, headers string, envelope).
  // Cloudflare Email Workers / generic: from, to, subject, text, html, messageId, date.
  const headers = str(b.headers);
  let from = str(b.from);
  if (!from && isObj(b.from)) from = str(b.from.address) ?? str(b.from.email);
  if (!from && str(b.envelope)) {
    try {
      const env = JSON.parse(b.envelope as string) as Obj;
      from = str(env.from);
    } catch {
      /* ignore */
    }
  } else if (!from && isObj(b.envelope)) {
    from = str(b.envelope.from);
  }
  const fromName = isObj(b.from) ? str(b.from.name) : null;
  return {
    from,
    fromName,
    subject: str(b.subject),
    text: str(b.text) ?? str(b.plain) ?? str(b.body),
    html: str(b.html),
    messageId: str(b.messageId) ?? str(b.message_id) ?? str(b['Message-ID']) ?? headerFromRaw(headers, 'Message-ID'),
    date: parseDate(b.date) ?? parseDate(headerFromRaw(headers, 'Date')),
  };
}

/** Normalize a provider webhook body into an InboundMessage. null when unusable. */
export function parseInboundEmailWebhook(body: unknown): InboundMessage | null {
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
  const subject = e.subject?.trim() || null;
  const text = bestBody(e.text, e.html) || subject || '';
  if (!text) return null;
  return {
    channel: 'email',
    from: addr.address,
    fromName: e.fromName?.trim() || addr.name,
    subject,
    text,
    externalId: cleanMessageId(e.messageId) ?? fallbackId(addr.address, subject, text),
    receivedAt: e.date ?? Date.now(),
  };
}
