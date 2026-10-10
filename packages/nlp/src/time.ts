// Civil-date arithmetic + IANA timezone conversion. Pure, DST-safe, no deps.
//
// A "civil date" (CD) is a calendar day with no timezone attached. All calendar arithmetic
// ("tomorrow", "next friday", "+3 days") happens on civil dates; only the final wall-clock
// time is converted to an instant with `zonedToUtc`, which uses Intl offset computation and
// therefore follows the timezone's real DST rules.

export interface CD {
  y: number;
  /** 1-12 */
  m: number;
  /** 1-31 */
  d: number;
}

export interface Wall extends CD {
  h: number;
  mi: number;
  s: number;
}

const DAY_MS = 86_400_000;

function fromUtcDay(ms: number): CD {
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function utcDay(cd: CD): number {
  return Date.UTC(cd.y, cd.m - 1, cd.d);
}

export function addDays(cd: CD, n: number): CD {
  return fromUtcDay(utcDay(cd) + n * DAY_MS);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Add months, clamping the day to the target month's length (Jan 31 + 1 month → Feb 28). */
export function addMonths(cd: CD, n: number): CD {
  const idx = cd.y * 12 + (cd.m - 1) + n;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { y, m, d: Math.min(cd.d, daysInMonth(y, m)) };
}

/** Day of week, 0 = Sunday … 6 = Saturday. */
export function dow(cd: CD): number {
  return new Date(utcDay(cd)).getUTCDay();
}

export function cmpCD(a: CD, b: CD): number {
  return utcDay(a) - utcDay(b);
}

export function isValidCD(y: number, m: number, d: number): boolean {
  return Number.isInteger(y) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

// ─── Timezones ──────────────────────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Returns `tz` if the runtime knows it, else "UTC". Never throws. */
export function resolveTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz.trim()) return 'UTC';
  try {
    formatter(tz.trim());
    return tz.trim();
  } catch {
    return 'UTC';
  }
}

/** Wall-clock reading of instant `ms` in `tz`. */
export function wallClock(ms: number, tz: string): Wall {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    y: out.year ?? 1970,
    m: out.month ?? 1,
    d: out.day ?? 1,
    h: (out.hour ?? 0) % 24, // some engines report midnight as 24
    mi: out.minute ?? 0,
    s: out.second ?? 0,
  };
}

/** UTC offset of `tz` at instant `ms`, in minutes (IST → 330, EDT → -240). */
export function offsetMinutes(ms: number, tz: string): number {
  const base = Math.floor(ms / 1000) * 1000;
  const w = wallClock(base, tz);
  return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - base) / 60_000);
}

/**
 * Instant for local wall-clock `cd h:mi` in `tz`.
 * - Ambiguous times (DST fall-back) resolve to the EARLIER instant.
 * - Non-existent times (DST spring-forward gap) shift forward by the gap (02:30 → 03:30).
 */
export function zonedToUtc(cd: CD, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(cd.y, cd.m - 1, cd.d, h, mi);
  const before = offsetMinutes(guess - DAY_MS / 2, tz);
  const after = offsetMinutes(guess + DAY_MS / 2, tz);
  const candidates: number[] = [];
  for (const off of before === after ? [before] : [before, after]) {
    const t = guess - off * 60_000;
    const w = wallClock(t, tz);
    if (w.y === cd.y && w.m === cd.m && w.d === cd.d && w.h === h && w.mi === mi) candidates.push(t);
  }
  if (candidates.length) return Math.min(...candidates);
  return guess - before * 60_000;
}
