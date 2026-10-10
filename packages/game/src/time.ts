// Time-zone helpers built on Intl (no deps). Day keys are member-local "YYYY-MM-DD".

const fmtCache = new Map<string, Intl.DateTimeFormat>();

export function safeTz(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  if (fmtCache.has(tz)) return tz;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface LocalParts { year: number; month: number; day: number; hour: number; minute: number; second: number }

export function localParts(ts: number, tz: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of fmt(safeTz(tz)).formatToParts(new Date(ts))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 1970, month: out.month ?? 1, day: out.day ?? 1,
    hour: (out.hour ?? 0) % 24, minute: out.minute ?? 0, second: out.second ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(ts: number, tz: string): string {
  const p = localParts(ts, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localHour(ts: number, tz: string): number {
  return localParts(ts, tz).hour;
}

function parseDay(day: string): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

/** 0 = Sunday … 6 = Saturday for a day key. */
export function weekdayOf(day: string): number {
  const [y, m, d] = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = parseDay(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Offset (ms) of tz at instant ts: local wall clock − UTC. */
function tzOffset(ts: number, tz: string): number {
  const p = localParts(ts, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Epoch ms of local midnight starting `day` in tz. */
export function startOfDay(day: string, tz: string): number {
  const z = safeTz(tz);
  const [y, m, d] = parseDay(day);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffset(guess, z);
  t = guess - tzOffset(t, z);
  return t;
}

export function isWeekend(day: string): boolean {
  const w = weekdayOf(day);
  return w === 0 || w === 6;
}

/** True when every day strictly between `from` and `to` is a weekend day (streak survives). */
export function onlyWeekendsBetween(from: string, to: string): boolean {
  let d = addDays(from, 1);
  let guard = 0;
  while (d < to && guard++ < 400) {
    if (!isWeekend(d)) return false;
    d = addDays(d, 1);
  }
  return guard < 400;
}

/** Monday (day key) of the week containing `day`. */
export function mondayOf(day: string): string {
  const w = weekdayOf(day);
  return addDays(day, -((w + 6) % 7));
}

export function firstOfMonth(day: string): string {
  return `${day.slice(0, 8)}01`;
}
