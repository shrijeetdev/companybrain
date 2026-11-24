import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
// .ics (iCalendar) import — turn a calendar export into task shells.
//
// Deliberately dependency-free: the .ics spec is sprawling, but the subset we care
// about (VEVENT blocks with SUMMARY/DTSTART/DTEND/DESCRIPTION/LOCATION/UID) is small
// and regular. We handle the two real-world DTSTART shapes (UTC suffix and TZID
// parameter) pragmatically; anything exotic falls back to Date's parser rather than
// throwing.

import type { Task, TaskDay } from '@companybrain/types';

/** A single VEVENT lifted out of an .ics file, with values already typed/coerced. */
export interface ParsedEvent {
  uid: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
}

/** Unescaped, unfolded single .ics line. .ics folds long lines by inserting CRLF + space. */
function unfoldLines(icsText: string): string[] {
  // Normalise CRLF/CR to \n, then join continuation lines (a line beginning with a
  // space or tab is a continuation of the previous line per RFC 5545).
  const normalised = icsText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalised.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.filter((l) => l.length > 0);
}

/** Undo .ics text escaping (commas, semicolons, newlines, quotes). */
function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Split a content line like `DTSTART;TZID=America/New_York:20260101T100000` into its
 * name, parameters, and value. Property names and parameters are case-insensitive.
 */
function parseContentLine(line: string): { name: string; params: Record<string, string>; value: string } {
  // The value is everything after the first unquoted colon. Parameters sit between
  // the name and that colon, separated by ';', and may contain quoted values that
  // themselves contain ':' or ';' (e.g. TZID values rarely do, but be safe).
  let valueStart = -1;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      valueStart = i;
      break;
    }
  }
  if (valueStart === -1) return { name: '', params: {}, value: '' };

  const head = line.slice(0, valueStart);
  const value = line.slice(valueStart + 1);
  const [nameRaw, ...paramParts] = head.split(';');
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq > -1) {
      const k = part.slice(0, eq).toUpperCase();
      let v = part.slice(eq + 1);
      v = v.replace(/^"(.*)"$/, '$1'); // strip surrounding quotes
      params[k] = v;
    }
  }
  return { name: (nameRaw ?? '').toUpperCase(), params, value };
}

/**
 * Parse an .ics datetime value into a JS Date.
 *
 * Handles:
 *  - `20260101T100000Z`           — UTC, the most common form from export tools
 *  - `20260101T100000`            — floating local time
 *  - `20260101`                   — date-only (all-day events)
 *  - `20260101T100000` w/ TZID    — named timezone (we read it as wall-clock local
 *                                    since we ship no tz database; the wall time is
 *                                    preserved, which is what matters for "what day")
 */
function parseIcsDate(value: string, _params: Record<string, string>): Date {
  const v = value.trim();
  // Date-only: YYYYMMDD
  if (/^\d{8}$/.test(v)) {
    return new Date(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00`);
  }
  // Date-Time with UTC 'Z'
  const utcMatch = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    // Anchored regex guarantees every group captured, so the captures are defined.
    const [, y, mo, d, h, mi, s] = utcMatch as RegExpMatchArray;
    return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!));
  }
  // Floating / TZID local time: treat as local wall-clock.
  const localMatch = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch) {
    const [, y, mo, d, h, mi, s] = localMatch as RegExpMatchArray;
    return new Date(+y!, +mo! - 1, +d!, +h!, +mi!, +s!);
  }
  // Last resort: hand it to the native parser. Better than throwing.
  const fallback = new Date(v);
  return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

/**
 * Parse an .ics document into structured events. Unfolds lines first, then walks
 * the VEVENT blocks. Events without a usable start time are skipped, since a task
 * with no due date isn't useful for the calendar-import path.
 */
export function parseIcs(icsText: string): ParsedEvent[] {
  const lines = unfoldLines(icsText);
  const events: ParsedEvent[] = [];
  let inEvent = false;
  // Accumulate raw lines per event and parse them at the block's end; this keeps
  // the block-walking logic simple and order-independent within an event.
  let current: Map<string, { value: string; params: Record<string, string> }> | null = null;

  for (const line of lines) {
    const { name, value } = parseContentLine(line);

    if (name === 'BEGIN' && value === 'VEVENT') {
      inEvent = true;
      current = new Map();
      continue;
    }
    if (name === 'END' && value === 'VEVENT') {
      if (inEvent && current) {
        const ev = buildEvent(current);
        if (ev) events.push(ev);
      }
      inEvent = false;
      current = null;
      continue;
    }
    if (inEvent && current) {
      // Last-write-wins for repeated props; DTSTART/DTEND are what we care about and
      // almost always appear once. Keep the parsed params (e.g. TZID) alongside.
      current.set(name, { value, params: parseContentLine(line).params });
    }
  }

  return events;
}

/** Assemble a ParsedEvent from the accumulated property map of a VEVENT block. */
function buildEvent(props: Map<string, { value: string; params: Record<string, string> }>): ParsedEvent | null {
  const summaryRaw = props.get('SUMMARY')?.value ?? '';
  const summary = unescapeIcs(summaryRaw).trim();
  const startRaw = props.get('DTSTART');
  const endRaw = props.get('DTEND') ?? props.get('DURATION');
  const uid = (props.get('UID')?.value ?? '').trim();
  const descriptionRaw = props.get('DESCRIPTION')?.value;
  const locationRaw = props.get('LOCATION')?.value;

  if (!startRaw) return null; // no start time → can't place the task on a day

  const start = parseIcsDate(startRaw.value, startRaw.params);
  const end = endRaw ? parseIcsDate(endRaw.value, endRaw.params) : start;

  return {
    uid: uid || `${start.getTime()}-${summary}`,
    summary: summary || 'Untitled event',
    description: descriptionRaw ? unescapeIcs(descriptionRaw) : undefined,
    start,
    end,
    location: locationRaw ? unescapeIcs(locationRaw) : undefined,
  };
}

/** Classify a due date into the Task.day buckets used elsewhere in the app. */
function dayFromStart(start: Date): TaskDay {
  const startOf = (d: Date): number => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };
  const today = startOf(new Date());
  const startDay = startOf(start);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const diff = Math.round((startDay - today) / oneDayMs);
  if (diff <= 0) return 'today';     // today or already past → land on today
  if (diff === 1) return 'tomorrow';
  return 'upcoming';
}

/**
 * Convert parsed events into partial Task objects ready for the task store.
 *
 * Title comes from the event summary; dueAt is the event start (ms epoch); day is
 * inferred from the start date relative to "now". Calendar imports default to the
 * "calendar" list / channel flavour — the parent can override before persisting.
 */
export function icsToTasks(
  events: ParsedEvent[],
  orgId: string,
  actorId: string,
): Partial<Task>[] {
  const now = Date.now();
  return events.map((ev) => ({
    orgId,
    title: ev.summary,
    day: dayFromStart(ev.start),
    dueAt: ev.start.getTime(),
    list: 'Calendar',
    createdBy: actorId,
    assignees: [actorId],
    createdAt: now,
  }));
}

/**
 * Fetch a remote .ics file (e.g. a published Google/Outlook calendar URL) and return
 * its raw text. Uses the global fetch. Throws on non-2xx so the caller can surface
 * the import failure — unlike voice, a calendar import that can't be read is an
 * error worth reporting.
 */
export async function downloadIcsFromUrl(url: string): Promise<string> {
  // Only public https calendars: a signed-in user must not be able to make the server
  // fetch internal addresses (cloud metadata, localhost admin ports, the LAN).
  let parsed: URL;
  try {
    parsed = new URL(url.trim().replace(/^webcal:/i, 'https:'));
  } catch {
    throw new Error('That calendar link is not a valid URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('Calendar links must start with https://');
  if (parsed.username || parsed.password) throw new Error('Calendar links cannot contain a username or password');
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('Could not find that calendar host');
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error('That calendar host is not allowed');

  const response = await fetch(parsed, {
    headers: { Accept: 'text/calendar, application/octet-stream, text/plain, */*' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to download the calendar: HTTP ${response.status}`);
  }
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) throw new Error('That calendar file is too large (over 2 MB)');
  return text;
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (isIP(ip) === 6) {
    if (ip === '::' || ip === '::1') return true;
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(ip);
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const a = parts[0]!;
  const b = parts[1]!;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}
