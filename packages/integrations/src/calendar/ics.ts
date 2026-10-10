// Dependency-free iCalendar (RFC 5545) parser for VEVENTs, with TZID handling via Intl and
// RRULE expansion (DAILY/WEEKLY/MONTHLY/YEARLY; INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY,
// BYMONTH, BYSETPOS, WKST), EXDATE, RDATE and RECURRENCE-ID overrides, limited to a window.

import { createHash } from 'node:crypto';
import { resolveTzid, wallToUtc, type Wall } from './tz';

export interface IcsEvent {
  uid: string;
  title: string;
  startAt: number;
  endAt: number;
  allDay: boolean;
  location: string | null;
  url: string | null;
  notes: string;
}

export interface ParseIcsOptions {
  /** Reference "now" (default Date.now()). Window = [now - 1 day, now + 30 days]. */
  now?: number;
  windowStart?: number;
  windowEnd?: number;
  /** Max events returned (default 5000). */
  maxEvents?: number;
}

const DAY = 86_400_000;
const MAX_TITLE = 500;
const MAX_NOTES = 10_000;
const MAX_PERIODS = 50_000;

// ── Lexing ───────────────────────────────────────────────────────────────────

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Unfold RFC 5545 continuation lines (CRLF followed by a space or tab). */
export function unfoldLines(text: string): string[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out.filter((l) => l.trim().length > 0);
}

/** Split `NAME;P1=a;P2="x:y":value` respecting quoted parameter values. */
export function parseContentLine(line: string): Prop | null {
  let inQuotes = false;
  const segs: string[] = [];
  let cur = '';
  let valueStart = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
    } else if (!inQuotes && ch === ';') {
      segs.push(cur);
      cur = '';
    } else if (!inQuotes && ch === ':') {
      segs.push(cur);
      valueStart = i + 1;
      break;
    } else cur += ch;
  }
  if (valueStart < 0) return null;
  const [nameRaw, ...paramParts] = segs;
  const name = (nameRaw ?? '').trim().toUpperCase();
  if (!name) return null;
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    params[p.slice(0, eq).trim().toUpperCase()] = p.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  return { name, params, value: line.slice(valueStart) };
}

/** Undo TEXT escaping: \n \N \, \; \\ */
export function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

// ── Date values ──────────────────────────────────────────────────────────────

interface DateVal {
  allDay: boolean;
  wall: Wall;
  /** IANA zone the wall time is expressed in ('UTC' for Z values and all-day dates). */
  tz: string;
  ms: number;
}

/**
 * Parse a DATE or DATE-TIME. TZID → that zone; trailing Z → UTC; floating → `defaultTz`.
 * All-day dates are represented as 00:00 UTC of that calendar date.
 */
export function parseDateValue(value: string, params: Record<string, string>, defaultTz: string): DateVal | null {
  const v = value.trim();
  const dm = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dm || params.VALUE?.toUpperCase() === 'DATE') {
    const m2 = dm ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m2) return null;
    const wall: Wall = { y: +m2[1]!, m: +m2[2]!, d: +m2[3]!, h: 0, mi: 0, s: 0 };
    if (!validWall(wall)) return null;
    return { allDay: true, wall, tz: 'UTC', ms: Date.UTC(wall.y, wall.m - 1, wall.d) };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
  if (!m) {
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t);
    const wall: Wall = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
    return { allDay: false, wall, tz: 'UTC', ms: t };
  }
  const wall: Wall = { y: +m[1]!, m: +m[2]!, d: +m[3]!, h: +m[4]!, mi: +m[5]!, s: m[6] ? +m[6] : 0 };
  if (!validWall(wall)) return null;
  const tz = m[7] ? 'UTC' : (resolveTzid(params.TZID) ?? defaultTz);
  return { allDay: false, wall, tz, ms: wallToUtc(wall, tz) };
}

function validWall(w: Wall): boolean {
  return w.y >= 1900 && w.y <= 2200 && w.m >= 1 && w.m <= 12 && w.d >= 1 && w.d <= 31 && w.h <= 23 && w.mi <= 59 && w.s <= 60;
}

/** ISO 8601 duration (P1W, P1DT2H30M, -PT15M) → ms, or null. */
export function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(v.trim());
  if (!m || v.trim().toUpperCase().endsWith('T') || /^[+-]?P$/i.test(v.trim())) return null;
  const ms = ((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 24 * 3600 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

// ── RRULE ────────────────────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count: number | null;
  until: { value: string; params: Record<string, string> } | null;
  byDay: { ord: number; wd: number }[];
  byMonthDay: number[];
  byMonth: number[];
  bySetPos: number[];
  wkst: number;
}

export function parseRRule(v: string): RRule | null {
  const parts: Record<string, string> = {};
  for (const kv of v.split(';')) {
    const eq = kv.indexOf('=');
    if (eq > 0) parts[kv.slice(0, eq).trim().toUpperCase()] = kv.slice(eq + 1).trim();
  }
  const freq = parts.FREQ?.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;
  const ints = (s: string | undefined) =>
    (s ?? '')
      .split(',')
      .map((x) => Number.parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n !== 0);
  const byDay: RRule['byDay'] = [];
  for (const tok of (parts.BYDAY ?? '').split(',')) {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(tok.trim());
    if (m) byDay.push({ ord: m[1] ? Number.parseInt(m[1], 10) : 0, wd: WEEKDAYS[m[2]!.toUpperCase()]! });
  }
  const interval = Number.parseInt(parts.INTERVAL ?? '1', 10);
  const count = parts.COUNT ? Number.parseInt(parts.COUNT, 10) : null;
  return {
    freq,
    interval: Number.isFinite(interval) && interval > 0 ? Math.min(interval, 1000) : 1,
    count: count !== null && Number.isFinite(count) && count > 0 ? count : null,
    until: parts.UNTIL ? { value: parts.UNTIL, params: {} } : null,
    byDay,
    byMonthDay: ints(parts.BYMONTHDAY).filter((n) => n >= -31 && n <= 31),
    byMonth: ints(parts.BYMONTH).filter((n) => n >= 1 && n <= 12),
    bySetPos: ints(parts.BYSETPOS).filter((n) => n >= -366 && n <= 366),
    wkst: WEEKDAYS[(parts.WKST ?? 'MO').toUpperCase()] ?? 1,
  };
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

/** Days of month (y, m) selected by the rule's BYMONTHDAY / BYDAY / BYSETPOS (or `dflt`). */
function monthDays(y: number, m: number, rule: RRule, dflt: number): number[] {
  const dim = daysInMonth(y, m);
  let days: number[] | null = null;
  if (rule.byMonthDay.length) {
    days = rule.byMonthDay.map((n) => (n > 0 ? n : dim + n + 1)).filter((d) => d >= 1 && d <= dim);
  }
  if (rule.byDay.length) {
    const sel = new Set<number>();
    for (const { ord, wd } of rule.byDay) {
      const all: number[] = [];
      for (let d = 1; d <= dim; d++) if (weekday(y, m, d) === wd) all.push(d);
      if (ord === 0) all.forEach((d) => sel.add(d));
      else {
        const pick = ord > 0 ? all[ord - 1] : all[all.length + ord];
        if (pick !== undefined) sel.add(pick);
      }
    }
    days = days ? days.filter((d) => sel.has(d)) : [...sel];
  }
  if (!days) days = dflt <= dim ? [dflt] : [];
  days = [...new Set(days)].sort((a, b) => a - b);
  if (rule.bySetPos.length && days.length) {
    const picked = rule.bySetPos.map((p) => (p > 0 ? days![p - 1] : days![days!.length + p])).filter((d): d is number => d !== undefined);
    days = [...new Set(picked)].sort((a, b) => a - b);
  }
  return days;
}

/** Yields candidate dates [y, m, d] period by period, starting from period index `k0`. */
function* candidateDates(rule: RRule, start: Wall, k0: number): Generator<[number, number, number]> {
  const base = Date.UTC(start.y, start.m - 1, start.d);
  for (let k = k0; k < k0 + MAX_PERIODS; k++) {
    if (rule.freq === 'DAILY') {
      const t = new Date(base + k * rule.interval * DAY);
      const y = t.getUTCFullYear();
      const m = t.getUTCMonth() + 1;
      const d = t.getUTCDate();
      if (rule.byMonth.length && !rule.byMonth.includes(m)) continue;
      if (rule.byDay.length && !rule.byDay.some((b) => b.wd === t.getUTCDay())) continue;
      if (rule.byMonthDay.length && !monthDays(y, m, { ...rule, byDay: [], bySetPos: [] }, d).includes(d)) continue;
      yield [y, m, d];
    } else if (rule.freq === 'WEEKLY') {
      const startWd = new Date(base).getUTCDay();
      const weekStart = base - ((startWd - rule.wkst + 7) % 7) * DAY + k * rule.interval * 7 * DAY;
      const wds = rule.byDay.length ? [...new Set(rule.byDay.map((b) => b.wd))] : [startWd];
      const offsets = wds.map((wd) => (wd - rule.wkst + 7) % 7).sort((a, b) => a - b);
      for (const off of offsets) {
        const t = new Date(weekStart + off * DAY);
        const m = t.getUTCMonth() + 1;
        if (rule.byMonth.length && !rule.byMonth.includes(m)) continue;
        yield [t.getUTCFullYear(), m, t.getUTCDate()];
      }
    } else if (rule.freq === 'MONTHLY') {
      const idx = start.m - 1 + k * rule.interval;
      const y = start.y + Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      if (rule.byMonth.length && !rule.byMonth.includes(m)) continue;
      for (const d of monthDays(y, m, rule, start.d)) yield [y, m, d];
    } else {
      const y = start.y + k * rule.interval;
      const months = rule.byMonth.length ? [...rule.byMonth].sort((a, b) => a - b) : [start.m];
      const hasDaySel = rule.byMonthDay.length > 0 || (rule.byDay.length > 0 && rule.byMonth.length > 0);
      for (const m of months) {
        const days = hasDaySel ? monthDays(y, m, rule, start.d) : start.d <= daysInMonth(y, m) ? [start.d] : [];
        for (const d of days) yield [y, m, d];
      }
    }
  }
}

function approxPeriodMs(rule: RRule): number {
  const unit = rule.freq === 'DAILY' ? DAY : rule.freq === 'WEEKLY' ? 7 * DAY : rule.freq === 'MONTHLY' ? 31 * DAY : 366 * DAY;
  return unit * rule.interval;
}

// ── Event assembly ───────────────────────────────────────────────────────────

interface RawEvent {
  props: Map<string, Prop>;
  multi: Map<string, Prop[]>; // EXDATE, RDATE
}

function single(ev: RawEvent, name: string): Prop | undefined {
  return ev.props.get(name);
}

function safeUrl(v: string | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function dateList(props: Prop[] | undefined, defaultTz: string): DateVal[] {
  const out: DateVal[] = [];
  for (const p of props ?? []) {
    if (p.params.VALUE?.toUpperCase() === 'PERIOD') continue;
    for (const part of p.value.split(',')) {
      const d = parseDateValue(part, p.params, defaultTz);
      if (d) out.push(d);
    }
  }
  return out;
}

const dateKey = (w: Wall) => `${w.y}-${w.m}-${w.d}`;

/** Parse an ICS document and return the event instances overlapping the window. */
export function parseIcs(text: string, opts: ParseIcsOptions = {}): IcsEvent[] {
  const now = opts.now ?? Date.now();
  const winStart = opts.windowStart ?? now - DAY;
  const winEnd = opts.windowEnd ?? now + 30 * DAY;
  const maxEvents = opts.maxEvents ?? 5000;

  const lines = unfoldLines(text);
  let calTz = 'UTC';
  const raw: RawEvent[] = [];
  const stack: string[] = [];
  let cur: RawEvent | null = null;

  for (const line of lines) {
    const p = parseContentLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      const comp = p.value.trim().toUpperCase();
      stack.push(comp);
      if (comp === 'VEVENT' && stack.length >= 1 && !cur) cur = { props: new Map(), multi: new Map() };
      continue;
    }
    if (p.name === 'END') {
      const comp = p.value.trim().toUpperCase();
      // Pop to the matching BEGIN (tolerates sloppy nesting).
      const idx = stack.lastIndexOf(comp);
      if (idx >= 0) stack.length = idx;
      if (comp === 'VEVENT' && cur) {
        raw.push(cur);
        cur = null;
      }
      continue;
    }
    const top = stack[stack.length - 1];
    if (top === 'VCALENDAR' && p.name === 'X-WR-TIMEZONE') {
      calTz = resolveTzid(p.value) ?? calTz;
      continue;
    }
    if (cur && top === 'VEVENT') {
      if (p.name === 'EXDATE' || p.name === 'RDATE') {
        const list = cur.multi.get(p.name) ?? [];
        list.push(p);
        cur.multi.set(p.name, list);
      } else if (!cur.props.has(p.name)) {
        cur.props.set(p.name, p);
      }
    }
  }

  // Overrides: UID → set of RECURRENCE-ID instants they replace.
  const overridden = new Map<string, Set<number>>();
  for (const ev of raw) {
    const rid = single(ev, 'RECURRENCE-ID');
    const uid = single(ev, 'UID')?.value.trim();
    if (!rid || !uid) continue;
    const d = parseDateValue(rid.value, rid.params, calTz);
    if (!d) continue;
    const set = overridden.get(uid) ?? new Set<number>();
    set.add(d.ms);
    overridden.set(uid, set);
  }

  const out: IcsEvent[] = [];
  const inWindow = (s: number, e: number) => Math.max(e, s + 1) > winStart && s < winEnd;

  for (const ev of raw) {
    if (out.length >= maxEvents) break;
    const status = single(ev, 'STATUS')?.value.trim().toUpperCase();
    if (status === 'CANCELLED') continue;
    const dtStartProp = single(ev, 'DTSTART');
    if (!dtStartProp) continue;
    const start = parseDateValue(dtStartProp.value, dtStartProp.params, calTz);
    if (!start) continue;

    const title = unescapeText(single(ev, 'SUMMARY')?.value ?? '').trim().slice(0, MAX_TITLE) || 'Untitled event';
    const notes = unescapeText(single(ev, 'DESCRIPTION')?.value ?? '').trim().slice(0, MAX_NOTES);
    const location = unescapeText(single(ev, 'LOCATION')?.value ?? '').trim().slice(0, MAX_TITLE) || null;
    const url = safeUrl(single(ev, 'URL')?.value);
    const uidRaw = single(ev, 'UID')?.value.trim();
    const uid = uidRaw || `gen-${createHash('sha1').update(`${start.ms}|${title}`).digest('hex').slice(0, 16)}`;

    let duration = 0;
    const dtEndProp = single(ev, 'DTEND');
    const durProp = single(ev, 'DURATION');
    if (dtEndProp) {
      const end = parseDateValue(dtEndProp.value, dtEndProp.params, calTz);
      if (end) duration = Math.max(0, end.ms - start.ms);
    } else if (durProp) {
      duration = Math.max(0, parseDuration(durProp.value) ?? 0);
    } else if (start.allDay) {
      duration = DAY;
    }

    const base = { title, notes, location, url, allDay: start.allDay };
    const rid = single(ev, 'RECURRENCE-ID');
    if (rid) {
      // An overridden instance of a recurring series.
      const r = parseDateValue(rid.value, rid.params, calTz);
      if (r && inWindow(start.ms, start.ms + duration)) out.push({ uid: `${uid}/${r.ms}`, startAt: start.ms, endAt: start.ms + duration, ...base });
      continue;
    }

    const rruleProp = single(ev, 'RRULE');
    const rule = rruleProp ? parseRRule(rruleProp.value) : null;
    const rdates = dateList(ev.multi.get('RDATE'), start.tz);
    if (!rule && rdates.length === 0) {
      if (inWindow(start.ms, start.ms + duration)) out.push({ uid, startAt: start.ms, endAt: start.ms + duration, ...base });
      continue;
    }

    // Recurring: expand.
    const exdates = dateList(ev.multi.get('EXDATE'), start.tz);
    const exMs = new Set(exdates.filter((d) => !d.allDay || start.allDay).map((d) => d.ms));
    const exDays = new Set(exdates.filter((d) => d.allDay && !start.allDay).map((d) => dateKey(d.wall)));
    const skip = overridden.get(uid) ?? new Set<number>();
    const seen = new Set<number>();
    const emit = (ms: number, wall: Wall) => {
      if (seen.has(ms) || exMs.has(ms) || exDays.has(dateKey(wall)) || skip.has(ms)) return;
      seen.add(ms);
      if (inWindow(ms, ms + duration) && out.length < maxEvents) out.push({ uid: `${uid}/${ms}`, startAt: ms, endAt: ms + duration, ...base });
    };

    if (rule) {
      let untilMs: number | null = null;
      let untilDay: number | null = null;
      if (rule.until) {
        const u = parseDateValue(rule.until.value, {}, start.tz);
        if (u?.allDay) untilDay = Date.UTC(u.wall.y, u.wall.m - 1, u.wall.d);
        else if (u) untilMs = u.ms;
      }
      // Without COUNT we can skip whole periods that end before the window.
      let k0 = 0;
      if (rule.count === null) {
        const behind = winStart - duration - start.ms;
        if (behind > 0) k0 = Math.max(0, Math.floor(behind / approxPeriodMs(rule)) - 2);
      }
      const startNaive = Date.UTC(start.wall.y, start.wall.m - 1, start.wall.d, start.wall.h, start.wall.mi, start.wall.s);
      let count = 0;
      if (k0 === 0) {
        // RFC 5545: DTSTART is always the first instance (and counts toward COUNT).
        emit(start.ms, start.wall);
        count = 1;
      }
      for (const [y, m, d] of candidateDates(rule, start.wall, k0)) {
        if (rule.count !== null && count >= rule.count) break;
        const wall: Wall = { y, m, d, h: start.wall.h, mi: start.wall.mi, s: start.wall.s };
        const naive = Date.UTC(y, m - 1, d, wall.h, wall.mi, wall.s);
        if (naive <= startNaive) continue;
        const ms = start.allDay ? Date.UTC(y, m - 1, d) : wallToUtc(wall, start.tz);
        if (untilMs !== null && ms > untilMs) break;
        if (untilDay !== null && Date.UTC(y, m - 1, d) > untilDay) break;
        if (ms >= winEnd) break;
        count++;
        emit(ms, wall);
        if (out.length >= maxEvents) break;
      }
    } else {
      emit(start.ms, start.wall);
    }
    for (const r of rdates) emit(r.ms, r.wall);
  }

  out.sort((a, b) => a.startAt - b.startAt);
  return out;
}
