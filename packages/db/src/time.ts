// Time-zone helpers built on Intl (no dependencies). All times are epoch ms (UTC);
// "local" means wall-clock in an IANA time zone.

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0 = Sunday .. 6 = Saturday */
  weekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
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
      weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Safe tz: falls back to UTC for invalid names. */
export function safeTz(tz: string | null | undefined): string {
  return tz && isValidTimezone(tz) ? tz : 'UTC';
}

export function localParts(ts: number, tz: string): LocalParts {
  const parts = formatter(safeTz(tz)).formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  };
}

/** Offset (ms) of `tz` from UTC at instant `ts` (positive east of Greenwich). */
export function tzOffset(ts: number, tz: string): number {
  const p = localParts(ts, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Convert a wall-clock time in `tz` to epoch ms. Month is 1-based; values may overflow (Date.UTC normalizes). */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string, second = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const off1 = tzOffset(guess - tzOffset(guess, tz), tz);
  let t = guess - off1;
  const off2 = tzOffset(t, tz);
  if (off2 !== off1) t = guess - off2;
  return t;
}

/** Start (00:00 local) of the local day containing ts, shifted by `addDays`. */
export function startOfLocalDay(ts: number, tz: string, addDays = 0): number {
  const p = localParts(ts, tz);
  return zonedToUtc(p.year, p.month, p.day + addDays, 0, 0, tz);
}

/** A given local hour on the local day containing ts (shifted by addDays). */
export function atLocalHour(ts: number, tz: string, hour: number, minute = 0, addDays = 0): number {
  const p = localParts(ts, tz);
  return zonedToUtc(p.year, p.month, p.day + addDays, hour, minute, tz);
}

/** "YYYY-MM-DD" of ts in tz. */
export function localDateKey(ts: number, tz: string): string {
  const p = localParts(ts, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Same local wall-clock time, `days` later. */
export function addLocalDays(ts: number, days: number, tz: string): number {
  const p = localParts(ts, tz);
  return zonedToUtc(p.year, p.month, p.day + days, p.hour, p.minute, tz, p.second);
}

/** Same local wall-clock time, `months` later (day clamped to month length). */
export function addLocalMonths(ts: number, months: number, tz: string): number {
  const p = localParts(ts, tz);
  const target = new Date(Date.UTC(p.year, p.month - 1 + months, 1));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth() + 1;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return zonedToUtc(y, m, Math.min(p.day, dim), p.hour, p.minute, tz, p.second);
}

/** "3 PM", "3:30 PM" in tz. */
export function spokenTime(ts: number, tz: string): string {
  const p = localParts(ts, tz);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const ampm = p.hour < 12 ? 'AM' : 'PM';
  return p.minute === 0 ? `${h12} ${ampm}` : `${h12}:${String(p.minute).padStart(2, '0')} ${ampm}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Short human due label relative to now, e.g. "today 5 PM", "tomorrow", "Mon 12 Oct 9 AM". */
export function dueLabel(ts: number, now: number, tz: string, allDay: boolean): string {
  const dayDiff = Math.round((startOfLocalDay(ts, tz) - startOfLocalDay(now, tz)) / 86_400_000);
  const time = allDay ? '' : ` ${spokenTime(ts, tz)}`;
  if (dayDiff === 0) return `today${time}`;
  if (dayDiff === 1) return `tomorrow${time}`;
  if (dayDiff === -1) return `yesterday${time}`;
  const p = localParts(ts, tz);
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}${time}`;
}
