// Time-zone helpers built on Intl (no tz database shipped).

export interface Wall {
  y: number;
  m: number; // 1-12
  d: number;
  h: number;
  mi: number;
  s: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const validCache = new Map<string, boolean>();

export function isValidTimeZone(tz: string): boolean {
  const hit = validCache.get(tz);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0);
    ok = true;
  } catch {
    ok = false;
  }
  validCache.set(tz, ok);
  return ok;
}

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Wall-clock components of instant `ts` in `tz`. */
export function utcToWall(ts: number, tz: string): Wall {
  if (tz === 'UTC') {
    const d = new Date(ts);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
  }
  const parts = formatter(tz).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const h = get('hour');
  return { y: get('year'), m: get('month'), d: get('day'), h: h === 24 ? 0 : h, mi: get('minute'), s: get('second') };
}

/** Offset (ms) of `tz` from UTC at instant `ts` (e.g. +19800000 for Asia/Kolkata). */
export function tzOffsetMs(ts: number, tz: string): number {
  if (tz === 'UTC') return 0;
  const base = Math.floor(ts / 1000) * 1000;
  const w = utcToWall(base, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - base;
}

/** Convert wall-clock time in `tz` to a UTC instant (handles DST transitions). */
export function wallToUtc(w: Wall, tz: string): number {
  const naive = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  if (tz === 'UTC') return naive;
  const o1 = tzOffsetMs(naive, tz);
  let guess = naive - o1;
  const o2 = tzOffsetMs(guess, tz);
  if (o2 !== o1) guess = naive - o2;
  return guess;
}

// Windows time-zone names used by Outlook/Exchange ICS exports → IANA.
const WINDOWS_TZ: Record<string, string> = {
  'Dateline Standard Time': 'Etc/GMT+12',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Alaskan Standard Time': 'America/Anchorage',
  'Pacific Standard Time': 'America/Los_Angeles',
  'US Mountain Standard Time': 'America/Phoenix',
  'Mountain Standard Time': 'America/Denver',
  'Central Standard Time': 'America/Chicago',
  'Central America Standard Time': 'America/Guatemala',
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/Indiana/Indianapolis',
  'Atlantic Standard Time': 'America/Halifax',
  'Newfoundland Standard Time': 'America/St_Johns',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Argentina Standard Time': 'America/Buenos_Aires',
  'SA Pacific Standard Time': 'America/Bogota',
  'Mexico Standard Time': 'America/Mexico_City',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  UTC: 'UTC',
  'Coordinated Universal Time': 'UTC',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kiev',
  'GTB Standard Time': 'Europe/Bucharest',
  'Russian Standard Time': 'Europe/Moscow',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Egypt Standard Time': 'Africa/Cairo',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'W. Central Africa Standard Time': 'Africa/Lagos',
  'E. Africa Standard Time': 'Africa/Nairobi',
  'Arab Standard Time': 'Asia/Riyadh',
  'Arabian Standard Time': 'Asia/Dubai',
  'Iran Standard Time': 'Asia/Tehran',
  'Pakistan Standard Time': 'Asia/Karachi',
  'India Standard Time': 'Asia/Kolkata',
  'Sri Lanka Standard Time': 'Asia/Colombo',
  'Nepal Standard Time': 'Asia/Kathmandu',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'Singapore Standard Time': 'Asia/Singapore',
  'China Standard Time': 'Asia/Shanghai',
  'Taipei Standard Time': 'Asia/Taipei',
  'W. Australia Standard Time': 'Australia/Perth',
  'Korea Standard Time': 'Asia/Seoul',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Central Standard Time': 'Australia/Darwin',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'New Zealand Standard Time': 'Pacific/Auckland',
};

/** Resolve an ICS TZID to an IANA zone Intl understands, or null. */
export function resolveTzid(tzid: string | null | undefined): string | null {
  if (!tzid) return null;
  const t = tzid.trim().slice(0, 128).replace(/^"(.*)"$/, '$1');
  if (!t) return null;
  if (/^(utc|gmt|z|etc\/utc|etc\/gmt)$/i.test(t)) return 'UTC';
  if (isValidTimeZone(t)) return t;
  const win = WINDOWS_TZ[t];
  if (win) return win;
  // "/mozilla.org/20050126_1/America/New_York", "/citadel.org/…/Europe/Berlin" → trailing Area/City.
  const m = /([A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)$/.exec(t);
  if (m) {
    const segs = m[1]!.split('/');
    for (let i = 0; i < segs.length - 1; i++) {
      const cand = segs.slice(i).join('/');
      if (isValidTimeZone(cand)) return cand;
    }
  }
  return null;
}
