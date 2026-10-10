// Next-occurrence math for recurring tasks, in the task owner's time zone.

import type { Recurrence } from '@companybrain/types';
import { addLocalDays, addLocalMonths, localParts } from '@companybrain/db';
import { bad, int, isObj, oneOf, optTime } from './validate.js';

export function validateRecurrence(v: unknown): Recurrence | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v)) bad('recurrence must be an object');
  const freq = oneOf(v.freq, 'recurrence.freq', ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const);
  const interval = v.interval === undefined ? 1 : int(v.interval, 'recurrence.interval', 1, 365);
  const out: Recurrence = { freq, interval };
  if (v.byWeekday !== undefined && v.byWeekday !== null) {
    if (!Array.isArray(v.byWeekday) || v.byWeekday.length > 7) bad('recurrence.byWeekday must be an array of 0-6');
    const days = [...new Set(v.byWeekday.map((d) => int(d, 'recurrence.byWeekday', 0, 6)))].sort();
    if (days.length) out.byWeekday = days;
  }
  if (v.until !== undefined) out.until = optTime(v.until, 'recurrence.until');
  return out;
}

function step(t: number, r: Recurrence, tz: string): number {
  const n = Math.max(1, r.interval || 1);
  switch (r.freq) {
    case 'daily':
      return addLocalDays(t, n, tz);
    case 'weekdays': {
      let c = t;
      for (let i = 0; i < 7; i++) {
        c = addLocalDays(c, 1, tz);
        const wd = localParts(c, tz).weekday;
        if (wd >= 1 && wd <= 5) return c;
      }
      return c;
    }
    case 'weekly': {
      const days = r.byWeekday?.length ? r.byWeekday : null;
      if (!days) return addLocalDays(t, 7 * n, tz);
      const cur = localParts(t, tz).weekday;
      for (let i = 1; i <= 7; i++) {
        const c = addLocalDays(t, i, tz);
        const wd = localParts(c, tz).weekday;
        if (days.includes(wd)) return wd <= cur ? addLocalDays(c, 7 * (n - 1), tz) : c; // wrapped into a new week
      }
      return addLocalDays(t, 7 * n, tz);
    }
    case 'monthly':
      return addLocalMonths(t, n, tz);
    case 'yearly':
      return addLocalMonths(t, 12 * n, tz);
  }
}

/**
 * The next due time after `base`, skipping occurrences that are already in the past
 * (so a daily task completed 3 days late does not spawn 3 overdue copies). null = series ended.
 */
export function nextOccurrence(base: number, r: Recurrence, tz: string, now: number): number | null {
  let next = step(base, r, tz);
  for (let i = 0; i < 5000 && next <= now; i++) next = step(next, r, tz);
  if (r.until && next > r.until) return null;
  return next;
}
