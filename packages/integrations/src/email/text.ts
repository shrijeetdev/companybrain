// Email body helpers: HTML → text, and quoted-reply / signature stripping.

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Very small HTML → plain text converter (no DOM). Drops quoted blocks (blockquote, gmail_quote). */
export function htmlToText(html: string): string {
  let h = html;
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, '');
  // Quoted history in replies.
  h = h.replace(/<blockquote\b[\s\S]*?<\/blockquote\s*>/gi, '');
  h = h.replace(/<div[^>]*class=["'][^"']*(gmail_quote|moz-cite-prefix|yahoo_quoted)[^"']*["'][\s\S]*$/i, '');
  h = h.replace(/<div[^>]*id=["'](divRplyFwdMsg|appendonsend)["'][\s\S]*$/i, '');
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<li\b[^>]*>/gi, '\n• ');
  h = h.replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|section|article|header|footer)\s*>/gi, '\n');
  h = h.replace(/<(p|div|h[1-6]|tr|table|ul|ol)\b[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, '');
  h = decodeEntities(h);
  return h
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CUT_PATTERNS: RegExp[] = [
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^-{2,}\s*Forwarded message\s*-{2,}/i,
  /^_{10,}\s*$/, // Outlook separator
  /^--\s*$/, // RFC 3676 signature delimiter ("-- ")
  /^Sent from my (iPhone|iPad|Android|mobile|Samsung|Galaxy|BlackBerry)/i,
  /^Get Outlook for (iOS|Android)/i,
  /^Sent from (Mail|Outlook|Yahoo Mail|Gmail) for/i,
];

/**
 * Strip quoted replies and signatures from a plain-text email body using simple heuristics:
 * everything from "On … wrote:", "-----Original Message-----", an Outlook "From:/Sent:" header
 * block, or a "-- " signature delimiter onward is dropped, as are '>'-quoted lines.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (CUT_PATTERNS.some((re) => re.test(line))) break;
    // "On Mon, 1 Jan 2026 at 10:00, Raj <raj@x.com> wrote:" — may wrap onto the next line.
    if (/^On\s.+\swrote:$/i.test(line)) break;
    if (/^On\s.+/i.test(line) && !/wrote:/i.test(line) && /^\S*.*wrote:$/i.test((lines[i + 1] ?? '').trim()) && line.length < 200) {
      const joined = `${line} ${(lines[i + 1] ?? '').trim()}`;
      if (/^On\s.+\swrote:$/i.test(joined)) break;
    }
    // Localised variants commonly seen: "Am … schrieb …:", "Le … a écrit :", "El … escribió:"
    if (/^(Am\s.+schrieb.+|Le\s.+a écrit\s?|El\s.+escribió)\s?:$/i.test(line)) break;
    // Outlook-style header block: "From: X" followed within 4 lines by "Sent:"/"Date:".
    if (/^From:\s/i.test(line)) {
      const next = lines.slice(i + 1, i + 5).map((l) => l.trim());
      if (next.some((l) => /^(Sent|Date):\s/i.test(l))) break;
    }
    if (line.startsWith('>')) continue;
    out.push(raw.replace(/\s+$/, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Best plain-text body: prefer text, else html→text; then strip quotes/signatures. */
export function bestBody(text: string | null | undefined, html: string | null | undefined): string {
  const base = text && text.trim() ? text : html ? htmlToText(html) : '';
  return stripQuotedReply(base);
}
