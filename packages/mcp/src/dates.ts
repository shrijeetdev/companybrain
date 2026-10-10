// Time-zone helpers built on Intl (no dependencies). All instants are epoch ms (UTC).

const DAY = 86_400_000;

interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

const partsFmtCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    partsFmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Valid IANA zone? Falls back to UTC otherwise. */
export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export function zonedParts(ms: number, tz: string): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(ms))) out[p.type] = p.value;
  return {
    year: Number(out.year), month: Number(out.month), day: Number(out.day),
    hour: Number(out.hour) % 24, minute: Number(out.minute), second: Number(out.second),
    weekday: WEEKDAYS.indexOf(out.weekday ?? 'Sun'),
  };
}

/** Offset of `tz` from UTC at instant `ms`, in ms (e.g. +19800000 for Asia/Kolkata). */
export function tzOffsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (ms - (ms % 1000 + 1000) % 1000);
}

/** Wall-clock time in `tz` → epoch ms (handles DST by re-checking the offset). */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string, second = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let result = guess - tzOffsetMs(guess, tz);
  const off2 = tzOffsetMs(result, tz);
  const alt = guess - off2;
  if (alt !== result) result = alt;
  return result;
}

export function startOfDay(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return zonedToUtc(p.year, p.month, p.day, 0, 0, tz);
}

export function addDays(ms: number, days: number): number {
  return ms + days * DAY;
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

/** "2026-10-12T17:00:00+05:30" — ISO 8601 in the member's zone. */
export function isoLocal(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  const off = Math.round(tzOffsetMs(ms, tz) / 60_000);
  const sign = off >= 0 ? '+' : '-';
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon 12 Oct 17:00" (year added when not the current year). `dateOnly` drops the time. */
export function humanDate(ms: number, tz: string, now: number, dateOnly = false): string {
  const p = zonedParts(ms, tz);
  const n = zonedParts(now, tz);
  let s = `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
  if (p.year !== n.year) s += ` ${p.year}`;
  if (!dateOnly) s += ` ${pad(p.hour)}:${pad(p.minute)}`;
  return s;
}

/** "3 h ago", "2 d ago", "just now". */
export function relativeAgo(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export type ParsedIso =
  | { kind: 'instant'; ms: number }
  | { kind: 'local'; year: number; month: number; day: number; hour: number; minute: number; second: number }
  | { kind: 'date'; year: number; month: number; day: number };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

/** Parse an ISO 8601 date / date-time. Returns null when the string isn't ISO. */
export function parseIso(input: string): ParsedIso | null {
  const s = input.trim();
  let m = ISO_DATE.exec(s);
  if (m) {
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!validYmd(year, month, day)) return null;
    return { kind: 'date', year, month, day };
  }
  m = ISO_DATETIME.exec(s);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number) as [number, number, number, number, number, number];
  if (!validYmd(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  if (m[7]) {
    const ms = Date.parse(s.replace(' ', 'T'));
    return Number.isFinite(ms) ? { kind: 'instant', ms } : null;
  }
  return { kind: 'local', year, month, day, hour, minute, second };
}

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
