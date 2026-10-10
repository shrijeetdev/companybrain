// Time helpers. All instants are epoch ms (UTC); everything is displayed in the member's
// IANA timezone (set once after login via setTimezone), never the browser's.

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

let currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function setTimezone(tz: string | null | undefined): void {
  if (!tz) return;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); currentTz = tz; } catch { /* keep */ }
}
export function getTimezone(): string { return currentTz; }
export function browserTimezone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions, tz = currentTz): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) { f = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: tz }); fmtCache.set(key, f); }
  return f;
}

export interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }
export function zoned(ts: number, tz = currentTz): ZonedParts {
  const key = tz + '|parts';
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' });
    fmtCache.set(key, f);
  }
  const p = f.formatToParts(ts);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '0';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { year: +get('year'), month: +get('month'), day: +get('day'), hour: +get('hour') % 24, minute: +get('minute'), weekday: wd };
}

function offsetMs(ts: number, tz: string): number {
  const z = zoned(ts, tz);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute);
  return asUtc - Math.floor(ts / MIN) * MIN;
}

/** Epoch ms of local midnight (in tz) for the day containing ts. */
export function startOfDay(ts: number, tz = currentTz): number {
  const z = zoned(ts, tz);
  const guess = Date.UTC(z.year, z.month - 1, z.day) - offsetMs(ts, tz);
  // correct for DST transitions between guess and ts
  return Date.UTC(z.year, z.month - 1, z.day) - offsetMs(guess, tz);
}
/** Local wall-clock time on the day of `dayTs` → epoch ms. */
export function atTime(dayTs: number, hour: number, minute = 0, tz = currentTz): number {
  const d0 = startOfDay(dayTs, tz);
  const z = zoned(d0 + 12 * HOUR, tz);
  const naive = Date.UTC(z.year, z.month - 1, z.day, hour, minute);
  return naive - offsetMs(naive - offsetMs(naive, tz), tz);
}
/** Wall-clock date/time in tz → epoch ms. month is 1-based. */
export function fromWall(year: number, month: number, day: number, hour = 12, minute = 0, tz = currentTz): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  return naive - offsetMs(naive - offsetMs(naive, tz), tz);
}
export function addDays(ts: number, n: number, tz = currentTz): number {
  // move by calendar days keeping wall time
  const z = zoned(ts, tz);
  const d = startOfDay(ts, tz) + n * DAY + 12 * HOUR;
  return atTime(d, z.hour, z.minute, tz);
}
export function dayIndex(ts: number, now = Date.now(), tz = currentTz): number {
  return Math.round((startOfDay(ts, tz) - startOfDay(now, tz)) / DAY);
}
export function dayKey(ts: number, tz = currentTz): string {
  const z = zoned(ts, tz);
  return `${z.year}-${String(z.month).padStart(2, '0')}-${String(z.day).padStart(2, '0')}`;
}

export function fmtTime(ts: number, tz = currentTz): string {
  const z = zoned(ts, tz);
  const s = fmt({ hour: 'numeric', minute: '2-digit' }, tz).format(ts);
  return z.minute === 0 ? s.replace(/:00/, '') : s;
}
export function fmtDate(ts: number, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }, tz = currentTz): string {
  return fmt(opts, tz).format(ts);
}
export function fmtLongDate(ts: number, tz = currentTz): string {
  return fmt({ weekday: 'long', month: 'long', day: 'numeric' }, tz).format(ts);
}
export function fmtWeekday(ts: number, tz = currentTz): string {
  return fmt({ weekday: 'short' }, tz).format(ts);
}

/** "Today", "Tomorrow", "Yesterday", "Mon", "Oct 21". */
export function relDay(ts: number, now = Date.now(), tz = currentTz): string {
  const d = dayIndex(ts, now, tz);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1 && d < 7) return fmtDate(ts, { weekday: 'long' }, tz);
  if (d < 0 && d > -7) return `Last ${fmtDate(ts, { weekday: 'short' }, tz)}`;
  const sameYear = zoned(ts, tz).year === zoned(now, tz).year;
  return fmtDate(ts, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }, tz);
}

export function fmtDue(dueAt: number, allDay: boolean, now = Date.now(), tz = currentTz): string {
  const day = relDay(dueAt, now, tz);
  return allDay ? day : `${day}, ${fmtTime(dueAt, tz)}`;
}

/** "just now", "5m ago", "3h ago", "2d ago" / "in 5m", "in 3h". */
export function ago(ts: number, now = Date.now()): string {
  const diff = now - ts;
  const abs = Math.abs(diff);
  const s = abs < MIN ? 'just now'
    : abs < HOUR ? `${Math.round(abs / MIN)}m`
      : abs < DAY ? `${Math.round(abs / HOUR)}h`
        : abs < 30 * DAY ? `${Math.round(abs / DAY)}d`
          : fmtDate(ts, { month: 'short', day: 'numeric' });
  if (s === 'just now' || abs >= 30 * DAY) return s;
  return diff >= 0 ? `${s} ago` : `in ${s}`;
}

export function fmtDuration(ms: number): string {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

export function greetingFor(ts = Date.now(), tz = currentTz): string {
  const h = zoned(ts, tz).hour;
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const TIMEZONES: string[] = (() => {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn('timeZone');
  } catch { /* ignore */ }
  return ['UTC', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
})();
