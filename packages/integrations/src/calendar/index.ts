// CalendarFetcher: SSRF-safe ICS download + parse + recurrence expansion.

import type { CalendarFetcher } from '@companybrain/types';
import { parseIcs } from './ics';
import { safeFetchText, type Resolver, type Transport } from './ssrf';

export interface CalendarFetcherDeps {
  resolve?: Resolver;
  transport?: Transport;
  now?: () => number;
}

export function createCalendarFetcher(deps: CalendarFetcherDeps = {}): CalendarFetcher {
  return {
    async fetch(url: string) {
      const text = await safeFetchText(url, { resolve: deps.resolve, transport: deps.transport });
      if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 4096))) throw new Error('Not an iCalendar (.ics) feed');
      return parseIcs(text, { now: (deps.now ?? Date.now)() });
    },
  };
}

export { parseIcs, type IcsEvent, type ParseIcsOptions } from './ics';
export { safeFetchText, vetUrl, isBlockedAddress, normalizeFeedUrl, SsrfError, type Resolver, type Transport } from './ssrf';
