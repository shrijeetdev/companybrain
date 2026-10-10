// @companybrain/nlp — natural-language quick-add parser.
//
// Pure (no I/O), deterministic given `now` + `timezone`, runs in Node and the browser.
// The grammar is documented in ../README.md. Shape of the algorithm:
//
//   1. Recognizers run in a fixed order over a "mask" of the input. Every recognized span is
//      claimed (recorded as a token and blanked out in the mask) so later recognizers can't
//      re-use it. Order: reminders → recurrence → assignees → project/tags → priority →
//      unambiguous dates → unambiguous times → ambiguous pieces (fixpoint) → chrono fallback.
//   2. "Ambiguous" pieces (bare "5pm", "fri", "12/10", "the 15th", "morning", bare "urgent")
//      are only accepted when anchored: at the start/end of what's left of the text, or
//      directly next to an accepted date/recurrence token. This keeps "meeting notes from 3pm
//      call" a plain title.
//   3. Calendar math happens on civil dates; the final wall-clock time is converted to an
//      instant with the IANA timezone (DST-safe, see ./time.ts).
//   4. The title is the original text minus claimed spans, tidied.

import * as chrono from 'chrono-node';
import type { ParsedQuickAdd, Priority, Recurrence } from '@companybrain/types';
import {
  addDays,
  addMonths,
  cmpCD,
  daysInMonth,
  dow,
  isValidCD,
  resolveTimeZone,
  wallClock,
  zonedToUtc,
  type CD,
} from './time';

export { resolveTimeZone, zonedToUtc, wallClock, offsetMinutes } from './time';
export type { CD } from './time';

export interface ParseOptions {
  /** Reference time (epoch ms). */
  now: number;
  /** IANA timezone used to interpret "tomorrow 5pm" etc. */
  timezone: string;
  /** Hour (0-23, local) used for "tomorrow" without a time when a time is needed; default 18. */
  defaultHour?: number;
}

type TokenKind = ParsedQuickAdd['tokens'][number]['kind'];
type Token = ParsedQuickAdd['tokens'][number];

interface TimeOfDay {
  h: number;
  mi: number;
  /** meridiem given, or unambiguous 24h ("17:30", "09:00"), or a word ("noon", "morning") */
  explicit: boolean;
  /** "at 5" → 17:00 by the 1–6 ⇒ PM heuristic; a "morning" hint undoes it */
  guessedPm: boolean;
  /** "eod" / "end of day" → defaultHour, never rolls to tomorrow */
  eod?: boolean;
}

/** Numeric d/m order: MM/DD for America/* and US/* timezones, DD/MM everywhere else. */
export function prefersMonthFirst(timezone: string): boolean {
  return /^(America|US)\//i.test(timezone);
}

// ─── Lexicon ────────────────────────────────────────────────────────────────

const S = String.raw;
const rx = (src: string): RegExp => new RegExp(src, 'giu');

/** Start boundary: not preceded by a letter/digit/underscore. */
const B = S`(?<![\p{L}\p{N}_])`;
/** End boundary. */
const E = S`(?![\p{L}\p{N}_])`;
/** End boundary for date words — also rejects possessives ("tomorrow's"). */
const EP = S`(?![\p{L}\p{N}_'’])`;
/** End boundary for times — also rejects "10:30:45". */
const TE = S`(?![\p{L}\p{N}_:])`;

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
/** A count followed by its separator. Words need a real space so "and" ≠ "an d". */
const NUM_SP = S`(?:\d{1,3}\s*|(?:an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+)`;

function num(s: string | undefined): number {
  if (!s) return NaN;
  const t = s.trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return NUM_WORDS[t] ?? NaN;
}

const U_MIN = 'minutes|minute|mins|min|m';
const U_H = 'hours|hour|hrs|hr|h';
const U_D = 'days|day|d';
const U_W = 'weeks|week|wks|wk|w';
const U_MO = 'months|month|mos|mo';
const U_Y = 'years|year|yrs|yr|y';

type Unit = 'min' | 'h' | 'd' | 'w' | 'mo' | 'y';
function unitOf(u: string): Unit {
  const t = u.toLowerCase();
  if (/^(minutes?|mins?|m)$/.test(t)) return 'min';
  if (/^(hours?|hrs?|h)$/.test(t)) return 'h';
  if (/^(days?|d)$/.test(t)) return 'd';
  if (/^(weeks?|wks?|w)$/.test(t)) return 'w';
  if (/^(months?|mos?)$/.test(t)) return 'mo';
  return 'y';
}
const UNIT_MINUTES: Record<Unit, number> = { min: 1, h: 60, d: 1440, w: 10080, mo: 43200, y: 525600 };

const WD_FULL = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const WD_ABBR = 'mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat|sun';
const WD = S`(?:${WD_FULL}|${WD_ABBR})`;
const WD_PLURAL = 'mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays';
const LIST_SEP = S`(?:\s*,\s*and\s+|\s*,\s*|\s+and\s+|\s*&\s*|\s*\/\s*)`;
const WD_LIST = S`${WD}s?${E}(?:${LIST_SEP}${WD}s?${E})*`;
const WD_INDEX: Record<string, number> = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
function weekdayNum(s: string): number {
  return WD_INDEX[s.toLowerCase().slice(0, 2)] ?? -1;
}
function weekdayList(s: string): number[] {
  const out = new Set<number>();
  for (const m of s.matchAll(rx(WD))) {
    const n = weekdayNum(m[0]);
    if (n >= 0) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

const MONTH = S`(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)`;
const MONTH_INDEX = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function monthNum(s: string): number {
  return MONTH_INDEX.indexOf(s.toLowerCase().slice(0, 3)) + 1;
}

/** Prepositions consumed together with a date. */
const PREP_WORDS = S`(?:due\s+(?:by|on|before)|due|by|before|on|until|till|til)`;
const PREP_D = S`(?:${PREP_WORDS}\s+)?`;
/** Prepositions consumed together with a time. */
const TPREP = S`(?:(?:due\s+)?(?:(?:at|by|before|around|until|till)\s+|@\s*)|due\s+)`;
const TIME_CORE = S`(?:\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\d{1,2}:\d{2}|noon|midday|midnight)`;

// Reminders
const DUR = S`(?:half\s+an?\s+hour|${NUM_SP}(?:${U_MIN}|${U_H}|${U_D}|${U_W})${E})`;
const RE_REM_DUR = rx(S`${B}remind(?:\s+me)?(?:\s+about\s+(?:it|this))?\s+(${DUR}(?:${LIST_SEP}${DUR})*)\s+(?:before(?:hand)?|prior|ahead|earlier|in\s+advance)${E}`);
const RE_DUR_ITEM = rx(S`(half\s+an?\s+hour)|(${NUM_SP})(${U_MIN}|${U_H}|${U_D}|${U_W})${E}`);
const RE_REM_DAY_BEFORE = rx(S`${B}remind(?:\s+me)?\s+(?:on\s+)?the\s+(day|week)\s+before${E}`);
const RE_REM_AT = rx(S`${B}remind(?:\s+me)?\s+(?:at|@)\s*(${TIME_CORE}|\d{1,2}(?![\p{N}:.]))(?:\s+(the\s+day\s+before|on\s+the\s+day|(${NUM_SP})days?\s+before))?${TE}`);

// Recurrence
const EVERY = S`(?:every|each)`;
const REC_UNIT = S`(days?|weekdays?|workdays?|business\s+days?|weeks?|fortnight|months?|years?|weekends?)`;
const RE_REC_EVERY_UNIT = rx(S`${B}${EVERY}\s+(?:(other)\s+|(${NUM_SP}))?${REC_UNIT}(?:\s+on\s+(${WD_LIST}))?${E}`);
const RE_REC_EVERY_WD = rx(S`${B}${EVERY}\s+(?:(other)\s+)?(${WD_LIST})`);
const RE_REC_EVERY_NTH = rx(S`${B}${EVERY}\s+(\d{1,2})(?:st|nd|rd|th)(?:\s+(?:day\s+)?of\s+(?:the|each|every)\s+month)?${E}`);
const RE_REC_PLURAL = rx(S`${B}(?:on\s+)?((?:${WD_PLURAL})(?:${LIST_SEP}(?:${WD_PLURAL}))*)${E}`);
const RE_REC_WEEKDAYS = rx(S`${B}(?:on\s+)?(?:weekdays|workdays|business\s+days)${E}`);
const RE_REC_WEEKENDS = rx(S`${B}(?:on\s+)?weekends${E}`);
const RE_REC_ADVERB = rx(S`${B}(daily|everyday|nightly|weekly|bi-?weekly|fortnightly|monthly|bi-?monthly|quarterly|yearly|annually)(?:\s+on\s+(${WD_LIST}))?${E}`);

// People / projects / tags
const RE_AT_NAME = rx(S`(?:${B}for\s+)?(?<![\p{L}\p{N}_.@])@([\p{L}\p{N}_][\p{L}\p{N}_.\-]*)`);
const RE_ASSIGN = rx(S`${B}assign(?:ed)?(?:\s+(?:it|this))?\s+to\s+@?([\p{L}][\p{L}\p{N}_.\-]*)`);
const RE_HASH = rx(S`(?<![\p{L}\p{N}_&#/\\])#([\p{L}\p{N}_][\p{L}\p{N}_\-/.]*)`);
const RE_PLUS = rx(S`(?<![\p{L}\p{N}_+])\+([\p{L}][\p{L}\p{N}_\-]*)`);
/** Words before an @mention that make it part of the sentence ("talk to @priya"). */
const KEEP_NAME_AFTER = /(?:^|[^\p{L}])(to|with|from|cc|ask|ping|call|email|tell|message|text|remind|meet|thank)\s*$/iu;

// Priority
const RE_PRI_BANG = rx(S`(?<!\S)!(urgent|high|hi|medium|med|normal|low|lo)${E}`);
const RE_PRI_EXCL = rx(S`(?<!\S)(!{2,})(?!\S)`);
const RE_PRI_P = rx(S`(?<![\p{L}\p{N}_\-])[pP]([0-3])(?![\p{L}\p{N}_\-])`);
const RE_PRI_PHRASE = rx(S`${B}(?:(urgent|high|medium|med|normal|low)[\s\-]+priority|prio(?:rity)?\s*[:=]?\s*(urgent|high|medium|med|normal|low|p[0-3]))${E}`);
const RE_PRI_BARE = rx(S`${B}(urgent(?:ly)?|asap|a\.s\.a\.p\.?|important)${E}!*`);

// Dates (unambiguous)
const RE_ISO = rx(S`${B}${PREP_D}(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+\-]\d{2}:?\d{2})?)?(?![\p{L}\p{N}_\-:])`);
const RE_NUMERIC_Y = rx(S`${B}${PREP_D}(\d{1,2})([\/.\-])(\d{1,2})\2(\d{4}|\d{2})(?![\p{N}\/.\-])`);
const RE_MONTH_DAY = rx(S`${B}${PREP_D}(?:(?:${WD}),?\s+)?(${MONTH})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?${EP}(?!:)`);
const RE_DAY_MONTH = rx(S`${B}${PREP_D}(?:(?:${WD}),?\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTH})\.?(?:,?\s+(\d{4}))?${EP}`);
const RE_DAY_AFTER_TOMORROW = rx(S`${B}${PREP_D}(?:(?:the\s+)?day\s+after\s+(?:tomorrow|tmrw)|overmorrow)${EP}`);
const RE_TODAY_TOMORROW = rx(S`${B}${PREP_D}(today|tdy|tomorrow|tmrw|tmr|tmw|tomorow|2moro|2mrw)${EP}`);
const RE_TONIGHT = rx(S`${B}${PREP_D}(?:tonight|tonite|this\s+(morning|afternoon|evening|night))${EP}`);
const RE_IN_N = rx(S`${B}(?:due\s+)?in\s+(${NUM_SP}|half\s+an?\s+)(${U_MIN}|${U_H}|${U_D}|${U_W}|${U_MO}|${U_Y})${E}`);
const RE_N_FROM_NOW = rx(S`${B}(${NUM_SP})(days?|weeks?|months?)\s+from\s+(?:now|today)${E}`);
const RE_PERIOD = rx(S`${B}${PREP_D}(?:the\s+)?(?:end\s+of\s+(?:the\s+)?(?:(this|next)\s+)?(week|month|year)|(eow|eom|eoy)|(this|next)\s+(week|month|year))${EP}`);
const RE_WEEKEND = rx(S`${B}(?:(?:${PREP_WORDS}|over|during)\s+)?(?:the\s+)?(?:(this|next)\s+)?weekend${EP}`);
const RE_WD_FULL = rx(S`${B}${PREP_D}(?:(this|next|coming|the\s+coming)\s+)?(${WD_FULL})(?:\s+(next|this)\s+week)?${EP}`);
const RE_WD_ABBR_PREP = rx(S`${B}(?:${PREP_WORDS}\s+(?:(this|next|coming)\s+)?|(this|next|coming)\s+)(${WD_ABBR})\.?${EP}`);
const RE_WD_TIME_PAIR = rx(S`${B}(${WD_ABBR})\.?\s+(\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\d{1,2}:\d{2})${TE}`);
const RE_ORDINAL_PREP =rx(S`${B}${PREP_WORDS}\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)${EP}`);
const RE_NUMERIC_PREP = rx(S`${B}${PREP_WORDS}\s+(\d{1,2})\/(\d{1,2})(?![\p{N}\/])`);

// Times (unambiguous)
const RE_EOD = rx(S`${B}(?:(?:due\s+)?(?:at|by|before|until|till)\s+)?(?:the\s+)?(?:eod|cob|end\s+of\s+(?:the\s+)?(?:business\s+)?day|close\s+of\s+(?:business|play))${EP}`);
const RE_TIME_PREP = rx(S`${B}${TPREP}(${TIME_CORE})${TE}`);
const RE_HOUR_PREP = rx(S`${B}${TPREP}(\d{1,2})(?![\p{L}\p{N}_:.\/%])`);
const RE_DAYPART_PREP = rx(S`${B}(?:in\s+the|by(?:\s+the)?|during\s+the)\s+(morning|afternoon|evening|night)${EP}`);

// Ambiguous (anchor rule)
const RE_A_WD = rx(S`${B}(${WD_ABBR})\.?${EP}`);
const RE_A_ORDINAL = rx(S`${B}the\s+(\d{1,2})(?:st|nd|rd|th)${EP}`);
const RE_A_NUMERIC = rx(S`(?<![\p{L}\p{N}_\/.\-])(\d{1,2})\/(\d{1,2})(?![\p{N}\/])`);
const RE_A_TIME = rx(S`(?<![\p{L}\p{N}_:.\/])(${TIME_CORE})${TE}`);
const RE_A_DAYPART = rx(S`${B}(morning|afternoon|evening|night)${EP}`);
const RE_A_WEEKEND = rx(S`${B}weekend${EP}`);

const DAYPART: Record<string, { h: number; pm: boolean }> = {
  morning: { h: 9, pm: false },
  afternoon: { h: 14, pm: true },
  evening: { h: 18, pm: true },
  night: { h: 20, pm: true },
};

// ─── Small helpers ──────────────────────────────────────────────────────────

const MASK = '\u0000';
const FILLER = /[\s\u0000,.;:!?()[\]{}"'“”‘’\-–—]/u;
const PRIORITY_WORD: Record<string, Priority> = {
  urgent: 'urgent', high: 'high', hi: 'high', medium: 'medium', med: 'medium', normal: 'medium',
  low: 'low', lo: 'low', p0: 'urgent', p1: 'high', p2: 'medium', p3: 'low',
};

export function parseTimeOfDay(s: string): TimeOfDay | null {
  const t = s.toLowerCase().replace(/\s+/g, '');
  if (t === 'noon' || t === 'midday') return { h: 12, mi: 0, explicit: true, guessedPm: false };
  if (t === 'midnight') return { h: 0, mi: 0, explicit: true, guessedPm: false };
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(a\.?m\.?|p\.?m\.?)?$/.exec(t);
  if (!m || !m[1]) return null;
  let h = parseInt(m[1], 10);
  const mi = m[2] ? parseInt(m[2], 10) : 0;
  if (mi > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].startsWith('p') ? 12 : 0);
    return { h, mi, explicit: true, guessedPm: false };
  }
  if (h > 23) return null;
  if (h === 0 || h >= 13 || (m[1].length === 2 && m[1].startsWith('0'))) return { h, mi, explicit: true, guessedPm: false };
  if (h <= 6) return { h: h + 12, mi, explicit: false, guessedPm: true };
  return { h, mi, explicit: false, guessedPm: false };
}

function emptyResult(title: string): ParsedQuickAdd {
  return {
    title: title.trim().replace(/\s+/g, ' '),
    dueAt: null,
    dueAllDay: false,
    priority: null,
    assigneeHints: [],
    projectHint: null,
    tags: [],
    recurrence: null,
    reminderOffsets: null,
    tokens: [],
  };
}

// ─── Parse context ──────────────────────────────────────────────────────────

class Ctx {
  mask: string;
  tokens: Token[] = [];
  /** token start → text to keep in the title instead of removing the token */
  keep = new Map<number, string>();

  date: CD | null = null;
  instant: number | null = null;
  time: TimeOfDay | null = null;
  softTime: TimeOfDay | null = null;
  pmHint = false;
  amHint = false;

  priority: Priority | null = null;
  assignees: string[] = [];
  project: string | null = null;
  tags: string[] = [];
  recurrence: Recurrence | null = null;
  recDay: number | null = null;
  reminderOffsets: number[] = [];
  reminderAt: { time: TimeOfDay; daysBefore: number | null }[] = [];

  constructor(
    readonly raw: string,
    readonly now: number,
    readonly tz: string,
    readonly today: CD,
    readonly monthFirst: boolean,
  ) {
    this.mask = raw;
  }

  get haveDate(): boolean {
    return this.date !== null || this.instant !== null;
  }
  get haveTime(): boolean {
    return this.time !== null || this.instant !== null;
  }

  isFree(start: number, end: number): boolean {
    return end > start && !this.mask.slice(start, end).includes(MASK);
  }

  claim(start: number, end: number, kind: TokenKind): void {
    this.tokens.push({ start, end, kind });
    this.mask = this.mask.slice(0, start) + MASK.repeat(end - start) + this.mask.slice(end);
  }

  /**
   * Run `re` over the current mask. `fn` returns the token kind to claim the whole match,
   * `[kind, start, end]` to claim a sub-span, or null to leave the match alone.
   */
  each(re: RegExp, fn: (m: RegExpExecArray, start: number, end: number) => TokenKind | [TokenKind, number, number] | null): boolean {
    let any = false;
    re.lastIndex = 0;
    for (const m of [...this.mask.matchAll(re)]) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (!this.isFree(start, end)) continue;
      const r = fn(m as RegExpExecArray, start, end);
      if (!r) continue;
      const [kind, s, e] = typeof r === 'string' ? [r, start, end] : r;
      if (!this.isFree(s, e)) continue;
      this.claim(s, e, kind);
      any = true;
    }
    return any;
  }

  leading(start: number): boolean {
    for (let i = 0; i < start; i++) if (!FILLER.test(this.mask[i]!)) return false;
    return true;
  }

  trailing(end: number): boolean {
    for (let i = end; i < this.mask.length; i++) if (!FILLER.test(this.mask[i]!)) return false;
    return true;
  }

  /** Directly next to an accepted date/time/recurrence token (only spaces, commas or other tokens between). */
  adjacent(start: number, end: number): boolean {
    for (const t of this.tokens) {
      if (t.kind !== 'date' && t.kind !== 'recurrence') continue;
      if (t.end <= start && /^[\s,\u0000]*$/u.test(this.mask.slice(t.end, start))) return true;
      if (t.start >= end && /^[\s,\u0000]*$/u.test(this.mask.slice(end, t.start))) return true;
    }
    return false;
  }

  anchored(start: number, end: number): boolean {
    return this.leading(start) || this.trailing(end) || this.adjacent(start, end);
  }

  at(cd: CD, t: { h: number; mi: number }): number {
    return zonedToUtc(cd, t.h, t.mi, this.tz);
  }

  /** First civil date ≥ today matching `pred`; with a time, today only counts if still ahead. */
  firstOn(pred: (cd: CD) => boolean, time: { h: number; mi: number } | null): CD {
    let cd = this.today;
    if (time && this.at(cd, time) <= this.now) cd = addDays(cd, 1);
    for (let i = 0; i < 800; i++) {
      if (pred(cd)) return cd;
      cd = addDays(cd, 1);
    }
    return cd;
  }

  setDate(cd: CD | null): boolean {
    if (!cd || this.haveDate) return false;
    this.date = cd;
    return true;
  }

  setTime(t: TimeOfDay | null): boolean {
    if (!t || this.haveTime) return false;
    this.time = t;
    return true;
  }

  setPriority(p: Priority | undefined): void {
    if (p && !this.priority) this.priority = p;
  }

  setRecurrence(r: Recurrence): boolean {
    if (this.recurrence) return false;
    this.recurrence = r;
    return true;
  }
}

// ─── Calendar helpers ───────────────────────────────────────────────────────

/** Days from `today` to the Monday of next week (always 1..7). */
function daysToNextMonday(today: CD): number {
  return (8 - dow(today)) % 7 || 7;
}

/**
 * bare / "coming": next occurrence strictly after today.
 * "this": next occurrence including today.
 * "next": that weekday in next calendar week (weeks start Monday).
 */
function weekdayDate(today: CD, wd: number, mod: string | undefined): CD {
  const m = (mod ?? '').toLowerCase().replace(/\s+/g, ' ');
  if (m === 'next') return addDays(addDays(today, daysToNextMonday(today)), (wd + 6) % 7);
  let diff = (wd - dow(today) + 7) % 7;
  if (diff === 0 && m !== 'this') diff = 7;
  return addDays(today, diff);
}

function endOfWeek(today: CD): CD {
  const t = dow(today);
  return addDays(today, t === 6 ? 6 : t === 0 ? 5 : 5 - t);
}

function thisWeekendSaturday(today: CD): CD {
  const t = dow(today);
  return t === 0 ? addDays(today, -1) : addDays(today, 6 - t);
}

/** Next date (≥ today) whose day-of-month is `d`, skipping months that are too short. */
function nextDayOfMonth(today: CD, d: number): CD | null {
  if (d < 1 || d > 31) return null;
  for (let i = 0; i < 14; i++) {
    const base = addMonths({ y: today.y, m: today.m, d: 1 }, i);
    if (d <= daysInMonth(base.y, base.m)) {
      const cd = { y: base.y, m: base.m, d };
      if (cmpCD(cd, today) >= 0) return cd;
    }
  }
  return null;
}

/** Month/day with optional year; without a year a past date rolls to next year. */
function monthDay(today: CD, m: number, d: number, y?: number): CD | null {
  if (y !== undefined) return isValidCD(y, m, d) ? { y, m, d } : null;
  for (let yy = today.y; yy < today.y + 9; yy++) {
    if (isValidCD(yy, m, d) && cmpCD({ y: yy, m, d }, today) >= 0) return { y: yy, m, d };
  }
  return null;
}

function fullYear(s: string): number {
  const y = parseInt(s, 10);
  return s.length <= 2 ? 2000 + y : y;
}

/** Numeric a/b: MM/DD or DD/MM by locale preference, swapping when only the other reading is valid. */
function numericDate(ctx: Ctx, a: number, b: number, y?: number): CD | null {
  const [m1, d1] = ctx.monthFirst ? [a, b] : [b, a];
  return monthDay(ctx.today, m1, d1, y) ?? monthDay(ctx.today, d1, m1, y);
}

// ─── Recognizers ────────────────────────────────────────────────────────────

function durMinutes(text: string): number[] {
  const out: number[] = [];
  RE_DUR_ITEM.lastIndex = 0;
  for (const m of text.matchAll(RE_DUR_ITEM)) {
    if (m[1]) out.push(30);
    else {
      const n = num(m[2]);
      if (Number.isFinite(n) && m[3]) out.push(n * UNIT_MINUTES[unitOf(m[3])]);
    }
  }
  return out;
}

function recognizeReminders(ctx: Ctx): void {
  ctx.each(RE_REM_DUR, (m) => {
    const mins = durMinutes(m[1] ?? '');
    if (!mins.length) return null;
    ctx.reminderOffsets.push(...mins);
    return 'reminder';
  });
  ctx.each(RE_REM_DAY_BEFORE, (m) => {
    ctx.reminderOffsets.push((m[1] ?? '').toLowerCase() === 'week' ? 10080 : 1440);
    return 'reminder';
  });
  ctx.each(RE_REM_AT, (m) => {
    const time = parseTimeOfDay(m[1] ?? '');
    if (!time) return null;
    const q = (m[2] ?? '').toLowerCase();
    const daysBefore = !q ? null : q.startsWith('the day') ? 1 : q.startsWith('on the day') ? 0 : num(m[3]);
    ctx.reminderAt.push({ time, daysBefore: Number.isFinite(daysBefore as number) || daysBefore === null ? daysBefore : null });
    return 'reminder';
  });
}

function recognizeRecurrence(ctx: Ctx): void {
  ctx.each(RE_REC_EVERY_NTH, (m) => {
    const d = num(m[1]);
    if (!(d >= 1 && d <= 31) || ctx.recurrence) return null;
    ctx.setRecurrence({ freq: 'monthly', interval: 1 });
    ctx.recDay = d;
    return 'recurrence';
  });
  ctx.each(RE_REC_EVERY_UNIT, (m) => {
    if (ctx.recurrence) return null;
    const interval = m[1] ? 2 : m[2] ? num(m[2]) : 1;
    if (!(interval >= 1)) return null;
    const unit = (m[3] ?? '').toLowerCase().replace(/\s+/g, ' ');
    const byWeekday = m[4] ? weekdayList(m[4]) : undefined;
    let r: Recurrence;
    if (/^(weekdays?|workdays?|business days?)$/.test(unit)) r = { freq: 'weekdays', interval: 1, byWeekday: [1, 2, 3, 4, 5] };
    else if (/^weekends?$/.test(unit)) r = { freq: 'weekly', interval, byWeekday: [0, 6] };
    else if (unit.startsWith('day')) r = { freq: 'daily', interval };
    else if (unit.startsWith('week')) r = { freq: 'weekly', interval, ...(byWeekday ? { byWeekday } : {}) };
    else if (unit === 'fortnight') r = { freq: 'weekly', interval: 2 * interval, ...(byWeekday ? { byWeekday } : {}) };
    else if (unit.startsWith('month')) r = { freq: 'monthly', interval };
    else r = { freq: 'yearly', interval };
    ctx.setRecurrence(r);
    return 'recurrence';
  });
  ctx.each(RE_REC_EVERY_WD, (m) => {
    if (ctx.recurrence) return null;
    const days = weekdayList(m[2] ?? '');
    if (!days.length) return null;
    ctx.setRecurrence({ freq: 'weekly', interval: m[1] ? 2 : 1, byWeekday: days });
    return 'recurrence';
  });
  ctx.each(RE_REC_WEEKDAYS, () => (ctx.setRecurrence({ freq: 'weekdays', interval: 1, byWeekday: [1, 2, 3, 4, 5] }) ? 'recurrence' : null));
  ctx.each(RE_REC_WEEKENDS, () => (ctx.setRecurrence({ freq: 'weekly', interval: 1, byWeekday: [0, 6] }) ? 'recurrence' : null));
  ctx.each(RE_REC_PLURAL, (m) => {
    const days = weekdayList(m[1] ?? '');
    return days.length && ctx.setRecurrence({ freq: 'weekly', interval: 1, byWeekday: days }) ? 'recurrence' : null;
  });
  ctx.each(RE_REC_ADVERB, (m) => {
    const w = (m[1] ?? '').toLowerCase().replace('-', '');
    const byWeekday = m[2] ? weekdayList(m[2]) : undefined;
    const wk = (interval: number): Recurrence => ({ freq: 'weekly', interval, ...(byWeekday ? { byWeekday } : {}) });
    const table: Record<string, Recurrence> = {
      daily: { freq: 'daily', interval: 1 },
      everyday: { freq: 'daily', interval: 1 },
      nightly: { freq: 'daily', interval: 1 },
      weekly: wk(1),
      biweekly: wk(2),
      fortnightly: wk(2),
      monthly: { freq: 'monthly', interval: 1 },
      bimonthly: { freq: 'monthly', interval: 2 },
      quarterly: { freq: 'monthly', interval: 3 },
      yearly: { freq: 'yearly', interval: 1 },
      annually: { freq: 'yearly', interval: 1 },
    };
    const r = table[w];
    return r && ctx.setRecurrence(r) ? 'recurrence' : null;
  });
}

function trimName(name: string): string {
  return name.replace(/[.\-]+$/u, '');
}

function addUnique(list: string[], v: string): void {
  if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
}

function recognizePeople(ctx: Ctx): void {
  ctx.each(RE_ASSIGN, (m, start) => {
    const name = trimName(m[1] ?? '');
    if (!name) return null;
    addUnique(ctx.assignees, name);
    return ['assignee', start, start + m[0].length - ((m[1] ?? '').length - name.length)];
  });
  ctx.each(RE_AT_NAME, (m, start, end) => {
    const rawName = m[1] ?? '';
    const name = trimName(rawName);
    if (!name || /^\d{1,2}(?::\d{2})?(?:am|pm)?$/i.test(name) || /^\d+$/.test(name)) return null;
    addUnique(ctx.assignees, name);
    const tokEnd = end - (rawName.length - name.length);
    const hasFor = /^for\s/i.test(m[0]);
    if (!hasFor && KEEP_NAME_AFTER.test(ctx.mask.slice(0, start))) ctx.keep.set(start, name);
    return ['assignee', start, tokEnd];
  });
}

function recognizeProjectsAndTags(ctx: Ctx): void {
  ctx.each(RE_HASH, (m, start, end) => {
    const rawName = m[1] ?? '';
    const name = rawName.replace(/[.\-/]+$/u, '');
    if (!name || /^\d+$/.test(name)) return null; // "#123" is an issue reference, not a project
    const tokEnd = end - (rawName.length - name.length);
    if (ctx.project === null) {
      ctx.project = name;
      return ['project', start, tokEnd];
    }
    if (ctx.project.toLowerCase() !== name.toLowerCase()) addUnique(ctx.tags, name);
    return ['tag', start, tokEnd];
  });
  ctx.each(RE_PLUS, (m, start, end) => {
    const rawName = m[1] ?? '';
    const name = rawName.replace(/[\-]+$/u, '');
    if (!name) return null;
    addUnique(ctx.tags, name);
    return ['tag', start, end - (rawName.length - name.length)];
  });
}

function recognizePriority(ctx: Ctx): void {
  ctx.each(RE_PRI_BANG, (m) => {
    ctx.setPriority(PRIORITY_WORD[(m[1] ?? '').toLowerCase()]);
    return 'priority';
  });
  ctx.each(RE_PRI_EXCL, (m) => {
    ctx.setPriority((m[1] ?? '').length >= 3 ? 'urgent' : 'high');
    return 'priority';
  });
  ctx.each(RE_PRI_P, (m) => {
    ctx.setPriority(PRIORITY_WORD[`p${m[1]}`]);
    return 'priority';
  });
  ctx.each(RE_PRI_PHRASE, (m) => {
    ctx.setPriority(PRIORITY_WORD[(m[1] ?? m[2] ?? '').toLowerCase()]);
    return 'priority';
  });
}

function recognizeDates(ctx: Ctx): void {
  const { today } = ctx;

  ctx.each(RE_ISO, (m) => {
    const y = num(m[1]), mo = num(m[2]), d = num(m[3]);
    if (ctx.haveDate || !isValidCD(y, mo, d)) return null;
    if (m[4] !== undefined) {
      const h = num(m[4]), mi = num(m[5]);
      if (h > 23 || mi > 59) return null;
      if (m[6]) {
        const z = m[6].toUpperCase();
        let off = 0;
        if (z !== 'Z') {
          const zm = /^([+-])(\d{2}):?(\d{2})$/.exec(z);
          if (!zm) return null;
          off = (zm[1] === '-' ? -1 : 1) * (num(zm[2]) * 60 + num(zm[3]));
        }
        ctx.instant = Date.UTC(y, mo - 1, d, h, mi) - off * 60_000;
        return 'date';
      }
      ctx.date = { y, m: mo, d };
      ctx.time = { h, mi, explicit: true, guessedPm: false };
      return 'date';
    }
    return ctx.setDate({ y, m: mo, d }) ? 'date' : null;
  });

  ctx.each(RE_NUMERIC_Y, (m) => ctx.setDate(numericDate(ctx, num(m[1]), num(m[3]), fullYear(m[4] ?? ''))) ? 'date' : null);

  ctx.each(RE_MONTH_DAY, (m) =>
    ctx.setDate(monthDay(today, monthNum(m[1] ?? ''), num(m[2]), m[3] ? num(m[3]) : undefined)) ? 'date' : null,
  );
  ctx.each(RE_DAY_MONTH, (m) =>
    ctx.setDate(monthDay(today, monthNum(m[2] ?? ''), num(m[1]), m[3] ? num(m[3]) : undefined)) ? 'date' : null,
  );

  ctx.each(RE_DAY_AFTER_TOMORROW, () => (ctx.setDate(addDays(today, 2)) ? 'date' : null));
  ctx.each(RE_TODAY_TOMORROW, (m) => {
    const w = (m[1] ?? '').toLowerCase();
    return ctx.setDate(w === 'today' || w === 'tdy' ? today : addDays(today, 1)) ? 'date' : null;
  });
  ctx.each(RE_TONIGHT, (m) => {
    if (!ctx.setDate(today)) return null;
    const part = DAYPART[(m[1] ?? 'night').toLowerCase()] ?? { h: 20, pm: true };
    ctx.softTime = { h: part.h, mi: 0, explicit: true, guessedPm: false };
    if (part.pm) ctx.pmHint = true;
    else ctx.amHint = true;
    return 'date';
  });

  ctx.each(RE_IN_N, (m) => {
    if (ctx.haveDate) return null;
    const n = /^half/i.test(m[1] ?? '') ? 0.5 : num(m[1]);
    if (!(n > 0)) return null;
    const unit = unitOf(m[2] ?? '');
    if (unit === 'min' || unit === 'h' || !Number.isInteger(n)) {
      if (ctx.haveTime) return null;
      ctx.instant = ctx.now + Math.round(n * UNIT_MINUTES[unit] * 60_000);
      return 'date';
    }
    const cd = unit === 'd' ? addDays(today, n) : unit === 'w' ? addDays(today, 7 * n) : addMonths(today, unit === 'mo' ? n : 12 * n);
    return ctx.setDate(cd) ? 'date' : null;
  });
  ctx.each(RE_N_FROM_NOW, (m) => {
    const n = num(m[1]);
    if (!(n > 0)) return null;
    const u = (m[2] ?? '').toLowerCase();
    const cd = u.startsWith('day') ? addDays(today, n) : u.startsWith('week') ? addDays(today, 7 * n) : addMonths(today, n);
    return ctx.setDate(cd) ? 'date' : null;
  });

  // Weekdays run before "next week" so "monday next week" stays one phrase.
  ctx.each(RE_WD_FULL, (m) => {
    const wd = weekdayNum(m[2] ?? '');
    const mod = m[3] ? (m[3].toLowerCase() === 'next' ? 'next' : 'this') : m[1];
    return ctx.setDate(weekdayDate(today, wd, mod)) ? 'date' : null;
  });
  ctx.each(RE_WD_ABBR_PREP, (m) => ctx.setDate(weekdayDate(today, weekdayNum(m[3] ?? ''), m[1] ?? m[2])) ? 'date' : null);
  // "fri 5pm" anywhere: an abbreviated weekday directly followed by a clock time.
  ctx.each(RE_WD_TIME_PAIR, (m) => {
    const t = parseTimeOfDay(m[2] ?? '');
    if (!t || ctx.haveDate || ctx.haveTime) return null;
    ctx.setDate(weekdayDate(today, weekdayNum(m[1] ?? ''), undefined));
    ctx.setTime(t);
    return 'date';
  });

  ctx.each(RE_PERIOD, (m) => {
    let cd: CD;
    if (m[2] || m[3]) {
      // end of (this|next)? week|month|year, eow/eom/eoy
      const what = m[3] ? { eow: 'week', eom: 'month', eoy: 'year' }[(m[3] ?? '').toLowerCase()] : (m[2] ?? '').toLowerCase();
      const next = (m[1] ?? '').toLowerCase() === 'next';
      if (what === 'week') cd = next ? addDays(addDays(today, daysToNextMonday(today)), 4) : endOfWeek(today);
      else if (what === 'month') {
        const base = next ? addMonths({ ...today, d: 1 }, 1) : today;
        cd = { y: base.y, m: base.m, d: daysInMonth(base.y, base.m) };
      } else cd = { y: today.y + (next ? 1 : 0), m: 12, d: 31 };
    } else {
      const mod = (m[4] ?? '').toLowerCase();
      const what = (m[5] ?? '').toLowerCase();
      if (what === 'week') cd = mod === 'next' ? addDays(today, daysToNextMonday(today)) : endOfWeek(today);
      else if (what === 'month') cd = mod === 'next' ? addMonths({ ...today, d: 1 }, 1) : { ...today, d: daysInMonth(today.y, today.m) };
      else cd = mod === 'next' ? { y: today.y + 1, m: 1, d: 1 } : { y: today.y, m: 12, d: 31 };
    }
    return ctx.setDate(cd) ? 'date' : null;
  });

  ctx.each(RE_WEEKEND, (m) => {
    if (/^weekend$/i.test(m[0])) return null; // bare "weekend" is ambiguous
    const sat = thisWeekendSaturday(today);
    const cd = (m[1] ?? '').toLowerCase() === 'next' ? addDays(sat, 7) : cmpCD(sat, today) < 0 ? today : sat;
    return ctx.setDate(cd) ? 'date' : null;
  });

  ctx.each(RE_ORDINAL_PREP, (m) => (ctx.setDate(nextDayOfMonth(today, num(m[1]))) ? 'date' : null));
  ctx.each(RE_NUMERIC_PREP, (m) => (ctx.setDate(numericDate(ctx, num(m[1]), num(m[2]))) ? 'date' : null));
}

function recognizeTimes(ctx: Ctx, defaultHour: number): void {
  ctx.each(RE_EOD, () => (ctx.setTime({ h: defaultHour, mi: 0, explicit: true, guessedPm: false, eod: true }) ? 'date' : null));
  ctx.each(RE_TIME_PREP, (m) => (ctx.setTime(parseTimeOfDay(m[1] ?? '')) ? 'date' : null));
  ctx.each(RE_HOUR_PREP, (m) => (ctx.setTime(parseTimeOfDay(m[1] ?? '')) ? 'date' : null));
  ctx.each(RE_DAYPART_PREP, (m) => (applyDaypart(ctx, m[1] ?? '') ? 'date' : null));
}

/** "morning"/"evening"…: sets the time, or — when a time is already known — refines AM/PM. */
function applyDaypart(ctx: Ctx, word: string): boolean {
  const part = DAYPART[word.toLowerCase()];
  if (!part) return false;
  if (ctx.instant !== null) return false;
  if (ctx.time) {
    if (part.pm) ctx.pmHint = true;
    else ctx.amHint = true;
    return true;
  }
  ctx.time = { h: part.h, mi: 0, explicit: true, guessedPm: false };
  return true;
}

/** Bare "urgent"/"asap"/"important": trailing, or leading and followed by a separator ("URGENT: …"). */
function bareModifierOk(ctx: Ctx, start: number, end: number): boolean {
  if (ctx.trailing(end)) return true;
  if (!ctx.leading(start)) return false;
  const rest = ctx.mask.slice(end).replace(/^[\s\u0000]+/u, '');
  return /^[:,\-–—!|]/u.test(rest) || rest === '';
}

function recognizeAmbiguous(ctx: Ctx): void {
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    // Abbreviated weekdays are never taken from the start ("sun cream", "sat with bob").
    changed = ctx.each(RE_A_WD, (m, s, e) =>
      !ctx.haveDate && (ctx.trailing(e) || ctx.adjacent(s, e)) &&ctx.setDate(weekdayDate(ctx.today, weekdayNum(m[1] ?? ''), undefined)) ? 'date' : null,
    ) || changed;
    changed = ctx.each(RE_A_ORDINAL, (m, s, e) =>
      !ctx.haveDate && ctx.anchored(s, e) && ctx.setDate(nextDayOfMonth(ctx.today, num(m[1]))) ? 'date' : null,
    ) || changed;
    changed = ctx.each(RE_A_NUMERIC, (m, s, e) =>
      !ctx.haveDate && ctx.anchored(s, e) && ctx.setDate(numericDate(ctx, num(m[1]), num(m[2]))) ? 'date' : null,
    ) || changed;
    changed = ctx.each(RE_A_WEEKEND, (_m, s, e) => {
      if (ctx.haveDate || !ctx.anchored(s, e)) return null;
      const sat = thisWeekendSaturday(ctx.today);
      return ctx.setDate(cmpCD(sat, ctx.today) < 0 ? ctx.today : sat) ? 'date' : null;
    }) || changed;
    changed = ctx.each(RE_A_TIME, (m, s, e) => {
      if (ctx.haveTime) return null;
      // Word times ("midnight snack") are only taken at the end or next to a date.
      const isWord = /^[a-z]/i.test(m[1] ?? '');
      const ok = isWord ? ctx.trailing(e) || ctx.adjacent(s, e) : ctx.anchored(s, e);
      return ok && ctx.setTime(parseTimeOfDay(m[1] ?? '')) ? 'date' : null;
    }) || changed;
    changed = ctx.each(RE_A_DAYPART, (m, s, e) => {
      const word = (m[1] ?? '').toLowerCase();
      const ok = ctx.adjacent(s, e) || (word !== 'night' && !ctx.haveTime && ctx.trailing(e));
      return ok && applyDaypart(ctx, word) ? 'date' : null;
    }) || changed;
    changed = ctx.each(RE_PRI_BARE, (m, s, e) => {
      if (!bareModifierOk(ctx, s, e)) return null;
      const w = (m[1] ?? '').toLowerCase();
      ctx.setPriority(w === 'important' ? 'high' : 'urgent');
      return 'priority';
    }) || changed;
    if (!changed) break;
  }
}

/** Long-tail absolute dates ("3rd of November next year", "two weeks from tomorrow") via chrono. */
function chronoFallback(ctx: Ctx): void {
  if (ctx.haveDate || ctx.haveTime) return;
  const text = ctx.mask.replace(/\u0000/g, ' ');
  if (!/[a-z]{3}/i.test(text)) return;
  const w = wallClock(ctx.now, ctx.tz);
  // A system-local Date whose wall clock equals the target timezone's: chrono does its
  // calendar math on local getters, so this keeps it in the user's timezone.
  const ref = new Date(w.y, w.m - 1, w.d, w.h, w.mi);
  const parser = ctx.monthFirst ? chrono.en.casual : chrono.en.GB;
  let results: chrono.ParsedResult[];
  try {
    results = parser.parse(text, ref, { forwardDate: true });
  } catch {
    return;
  }
  for (const r of results) {
    const st = r.start;
    if (!st.isCertain('day') || !st.isCertain('month')) continue;
    if (!/[a-z]{2}/i.test(r.text)) continue; // purely numeric ("1/2") is too risky
    let start = r.index;
    const end = r.index + r.text.length;
    if (!ctx.isFree(start, end)) continue;
    const prep = /(?:^|\s)((?:due\s+)?(?:by|on|before|until|due)\s+)$/i.exec(ctx.mask.slice(0, start));
    if (!prep && !ctx.leading(start) && !ctx.trailing(end)) continue;
    if (prep?.[1]) start -= prep[1].length;
    const y = st.get('year') ?? ctx.today.y;
    const m = st.get('month') ?? 0;
    const d = st.get('day') ?? 0;
    let cd: CD | null = isValidCD(y, m, d) ? { y, m, d } : null;
    if (cd && !st.isCertain('year') && cmpCD(cd, ctx.today) < 0) cd = monthDay(ctx.today, m, d);
    if (!cd) continue;
    ctx.date = cd;
    if (st.isCertain('hour')) ctx.time = { h: st.get('hour') ?? 0, mi: st.get('minute') ?? 0, explicit: true, guessedPm: false };
    ctx.claim(start, end, 'date');
    return;
  }
}

// ─── Resolution ─────────────────────────────────────────────────────────────

function recurrencePredicate(ctx: Ctx): (cd: CD) => boolean {
  const r = ctx.recurrence;
  if (!r) return () => true;
  if (r.freq === 'weekdays') return (cd) => dow(cd) >= 1 && dow(cd) <= 5;
  if (r.freq === 'weekly' && r.byWeekday?.length) {
    const set = new Set(r.byWeekday);
    return (cd) => set.has(dow(cd));
  }
  if (r.freq === 'monthly' && ctx.recDay !== null) {
    const day = ctx.recDay;
    return (cd) => cd.d === day;
  }
  return () => true;
}

function resolveDue(ctx: Ctx, defaultHour: number): { dueAt: number | null; allDay: boolean } {
  let time = ctx.time;
  if (time && !time.eod) {
    if (ctx.amHint && time.guessedPm) time = { ...time, h: time.h - 12 };
    else if (ctx.pmHint && !time.explicit && time.h < 12) time = { ...time, h: time.h + 12 };
  }
  const dflt = { h: defaultHour, mi: 0 };
  if (ctx.instant !== null) return { dueAt: ctx.instant, allDay: false };
  if (ctx.date) {
    if (time) return { dueAt: ctx.at(ctx.date, time.eod ? dflt : time), allDay: false };
    if (ctx.softTime) {
      let t = ctx.at(ctx.date, ctx.softTime);
      if (t <= ctx.now && cmpCD(ctx.date, ctx.today) === 0) t = Math.max(t, ctx.at(ctx.date, { h: 23, mi: 59 }));
      return { dueAt: t, allDay: false };
    }
    return { dueAt: ctx.at(ctx.date, dflt), allDay: true };
  }
  const pred = recurrencePredicate(ctx);
  if (time) {
    if (time.eod && !ctx.recurrence) {
      const t = ctx.at(ctx.today, dflt);
      return { dueAt: t > ctx.now ? t : ctx.at(ctx.today, { h: 23, mi: 59 }), allDay: false };
    }
    const t = time.eod ? dflt : time;
    return { dueAt: ctx.at(ctx.firstOn(pred, t), t), allDay: false };
  }
  if (ctx.recurrence) return { dueAt: ctx.at(ctx.firstOn(pred, null), dflt), allDay: true };
  return { dueAt: null, allDay: false };
}

// ─── Title ──────────────────────────────────────────────────────────────────

const SENT = '\u0001';
const DANGLING = new RegExp(
  S`(^|[\s(])(?:by|at|on|due|before|until|till|for|to|from|every|each|and|&|@)\s*\u0001(?=[\s\u0001]*(?:$|[,.;:!?)\]]))`,
  'giu',
);

function buildTitle(ctx: Ctx): string {
  const toks = [...ctx.tokens].sort((a, b) => a.start - b.start);
  let out = '';
  let i = 0;
  for (const t of toks) {
    out += ctx.raw.slice(i, t.start);
    const kept = ctx.keep.get(t.start);
    out += kept !== undefined ? kept : SENT;
    i = t.end;
  }
  out += ctx.raw.slice(i);
  for (let guard = 0; guard < 10; guard++) {
    const next = out.replace(DANGLING, `$1${SENT}`);
    if (next === out) break;
    out = next;
  }
  let t = out
    .replace(/\u0001/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)\]])/g, '$1')
    .replace(/([(\[])\s+/g, '$1')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s,;:.\-–—&|/]+/u, '')
    .replace(/[\s,;:\-–—&|/]+$/u, '')
    .trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ─── Entry point ────────────────────────────────────────────────────────────

function parseImpl(raw: string, opts: ParseOptions): ParsedQuickAdd {
  const tz = resolveTimeZone(opts?.timezone);
  const now = typeof opts?.now === 'number' && Number.isFinite(opts.now) ? opts.now : Date.now();
  const dh = opts?.defaultHour;
  const defaultHour = typeof dh === 'number' && Number.isInteger(dh) && dh >= 0 && dh <= 23 ? dh : 18;
  const w = wallClock(now, tz);
  const ctx = new Ctx(raw, now, tz, { y: w.y, m: w.m, d: w.d }, prefersMonthFirst(tz));

  recognizeReminders(ctx);
  recognizeRecurrence(ctx);
  recognizePeople(ctx);
  recognizeProjectsAndTags(ctx);
  recognizePriority(ctx);
  recognizeDates(ctx);
  recognizeTimes(ctx, defaultHour);
  recognizeAmbiguous(ctx);
  chronoFallback(ctx);

  let { dueAt, allDay } = resolveDue(ctx, defaultHour);

  // Reminders
  const offsets = [...ctx.reminderOffsets];
  for (const r of ctx.reminderAt) {
    if (dueAt === null) {
      // "remind me at 9am" with no due date: the reminder time becomes the due time.
      dueAt = ctx.at(ctx.firstOn(recurrencePredicate(ctx), r.time), r.time);
      allDay = false;
      offsets.push(0);
      continue;
    }
    const due = wallClock(dueAt, tz);
    const dueCd = { y: due.y, m: due.m, d: due.d };
    let at = ctx.at(addDays(dueCd, -(r.daysBefore ?? 0)), r.time);
    if (r.daysBefore === null && at > dueAt) at = ctx.at(addDays(dueCd, -1), r.time);
    const off = Math.round((dueAt - at) / 60_000);
    if (off >= 0) offsets.push(off);
  }
  const reminderOffsets = offsets.length ? [...new Set(offsets)].sort((a, b) => a - b) : null;

  let title = buildTitle(ctx);
  if (!title) title = raw.trim().replace(/\s+/g, ' ');

  return {
    title,
    dueAt,
    dueAllDay: dueAt !== null && allDay,
    priority: ctx.priority,
    assigneeHints: ctx.assignees,
    projectHint: ctx.project,
    tags: ctx.tags,
    recurrence: ctx.recurrence,
    reminderOffsets,
    tokens: [...ctx.tokens].sort((a, b) => a.start - b.start),
  };
}

/**
 * Parse a quick-add line ("Send Acme proposal tomorrow 5pm @priya #website !high").
 * Pure and deterministic for a given `now` + `timezone`. Never throws.
 */
export function parseQuickAdd(text: string, opts: ParseOptions): ParsedQuickAdd {
  const raw = typeof text === 'string' ? text : text == null ? '' : String(text);
  try {
    return parseImpl(raw, opts);
  } catch {
    return emptyResult(raw);
  }
}
