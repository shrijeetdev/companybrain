// Email body helpers: HTML → text, and quoted-reply / signature stripping.
//
// Everything here runs on attacker-controlled input (any inbound email), so every function is
// linear in its input: inputs are capped first, and no regex can backtrack super-linearly.

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

/**
 * Input caps (applied before any parsing, so attacker-sized bodies can't stall the event loop).
 * Longer input is truncated, never rejected.
 */
export const MAX_TEXT_BODY = 200 * 1024;
export const MAX_HTML_BODY = 300 * 1024;
/** Quote/signature heuristics are only tried on lines up to this length (real ones are short). */
const MAX_HEURISTIC_LINE = 300;

export function decodeEntities(s: string): string {
  // Bounded quantifiers, and '&' can never occur inside a match → linear.
  return s.replace(/&(#x[0-9a-f]{1,8}|#\d{1,8}|[a-z]{1,10});/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const SKIP_CONTENT = new Set(['script', 'style', 'head', 'title']);
const BLOCK_CLOSE = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'ul', 'ol', 'section', 'article', 'header', 'footer']);
const BLOCK_OPEN = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'ul', 'ol']);
/** A div carrying one of these (in its class or id) starts the quoted history of a reply. */
const QUOTE_MARKERS = ['gmail_quote', 'moz-cite-prefix', 'yahoo_quoted', 'divrplyfwdmsg', 'appendonsend'];

const isNameChar = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/**
 * Small HTML → plain text converter (no DOM). Drops comments, script/style/head/title content and
 * quoted reply history (blockquote, gmail_quote & co). One forward pass driven by indexOf, never
 * revisiting input — linear whatever the input looks like.
 */
export function htmlToText(input: string): string {
  const html = input.length > MAX_HTML_BODY ? input.slice(0, MAX_HTML_BODY) : input;
  const lower = html.toLowerCase();
  const n = html.length;
  const out: string[] = [];
  /** Position just past the first `</name…>` at or after `from`; n when absent (drop the rest). */
  const skipPastClose = (name: string, from: number): number => {
    const c = lower.indexOf(`</${name}`, from);
    if (c < 0) return n;
    const gt = lower.indexOf('>', c);
    return gt < 0 ? n : gt + 1;
  };
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      out.push(html.slice(i));
      break;
    }
    if (lt > i) out.push(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      if (end < 0) break; // unterminated comment: drop the rest
      i = end + 3;
      continue;
    }
    const gt = html.indexOf('>', lt + 1);
    if (gt < 0) {
      // No '>' anywhere after this point, so there are no more tags: the rest is text.
      out.push(html.slice(lt));
      break;
    }
    let p = lt + 1;
    const closing = html.charCodeAt(p) === 47; // '/'
    if (closing) p++;
    const nameStart = p;
    while (p < gt && isNameChar(html.charCodeAt(p))) p++;
    const name = lower.slice(nameStart, p);
    i = gt + 1;
    if (!name) continue; // "<>", "<!doctype …>", "<?xml …>", "< x>": drop the tag
    if (closing) {
      if (BLOCK_CLOSE.has(name)) out.push('\n');
      continue;
    }
    if (SKIP_CONTENT.has(name) || name === 'blockquote') {
      i = skipPastClose(name, i);
      continue;
    }
    if (name === 'div') {
      const attrs = lower.slice(p, Math.min(gt, p + 4096));
      if (QUOTE_MARKERS.some((m) => attrs.includes(m))) break; // quoted history: drop the rest
    }
    if (name === 'br') out.push('\n');
    else if (name === 'li') out.push('\n• ');
    else if (BLOCK_OPEN.has(name)) out.push('\n');
  }
  return decodeEntities(out.join(''))
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
export function stripQuotedReply(input: string): string {
  const text = input.length > MAX_TEXT_BODY ? input.slice(0, MAX_TEXT_BODY) : input;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    // Header-ish lines are short; long lines are body text (and the patterns below are not linear).
    if (line.length <= MAX_HEURISTIC_LINE) {
      if (CUT_PATTERNS.some((re) => re.test(line))) break;
      // "On Mon, 1 Jan 2026 at 10:00, Raj <raj@x.com> wrote:" — may wrap onto the next line.
      if (/^On\s.+\swrote:$/i.test(line)) break;
      const next = (lines[i + 1] ?? '').trim();
      if (next.length <= MAX_HEURISTIC_LINE && /^On\s/i.test(line) && !/wrote:/i.test(line) && /wrote:$/i.test(next)) {
        const joined = `${line} ${next}`;
        if (/^On\s.+\swrote:$/i.test(joined)) break;
      }
      // Localised variants commonly seen: "Am … schrieb …:", "Le … a écrit :", "El … escribió:"
      if (/^(Am\s.+schrieb.+|Le\s.+a écrit\s?|El\s.+escribió)\s?:$/i.test(line)) break;
      // Outlook-style header block: "From: X" followed within 4 lines by "Sent:"/"Date:".
      if (/^From:\s/i.test(line)) {
        const block = lines.slice(i + 1, i + 5).map((l) => l.trim());
        if (block.some((l) => /^(Sent|Date):\s/i.test(l))) break;
      }
    }
    if (line.startsWith('>')) continue;
    out.push(raw.trimEnd());
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Best plain-text body: prefer text, else html→text; then strip quotes/signatures. Inputs are capped. */
export function bestBody(text: string | null | undefined, html: string | null | undefined): string {
  const t = text && text.trim() ? text.slice(0, MAX_TEXT_BODY) : '';
  const base = t || (html ? htmlToText(html.slice(0, MAX_HTML_BODY)) : '');
  return stripQuotedReply(base);
}
