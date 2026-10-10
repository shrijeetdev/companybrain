import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { createCalendarFetcher, parseIcs } from '../src/index';
import { isBlockedAddress, vetUrl, safeFetchText, nodeTransport, SsrfError, type Resolver, type Transport } from '../src/calendar/ssrf';
import { wallToUtc } from '../src/calendar/tz';

const publicResolver: Resolver = async () => [{ address: '93.184.216.34', family: 4 }];
const DAY = 86_400_000;

// ── SSRF guard ───────────────────────────────────────────────────────────────

test('isBlockedAddress: private, loopback, link-local, CGNAT, multicast, IPv6 local forms', () => {
  for (const ip of [
    '127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '100.127.255.255', '0.0.0.0', '224.0.0.1', '239.255.255.250', '255.255.255.255', '198.18.0.1', '192.0.2.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1',
    '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '::127.0.0.1', 'fe80::1%eth0', 'not-an-ip',
  ]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '2002:0808:0808::1']) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
});

test('vetUrl: rejects private literals incl. decimal/hex/octal encodings and IPv6 loopback', async () => {
  for (const u of [
    'http://127.0.0.1/cal.ics',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://0x7f.0.0.1/',
    'http://017700000001/',
    'http://127.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[0:0:0:0:0:0:0:1]:8080/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.1.2.3/',
    'https://[fd00::1]/',
    'http://localhost/',
    'http://foo.localhost/',
    'http://printer.local/',
  ]) {
    await assert.rejects(vetUrl(u, publicResolver), SsrfError, u);
  }
});

test('vetUrl: scheme / credential checks and webcal → https', async () => {
  await assert.rejects(vetUrl('file:///etc/passwd', publicResolver), /Only http/);
  await assert.rejects(vetUrl('ftp://example.com/x', publicResolver), /Only http/);
  await assert.rejects(vetUrl('gopher://example.com/', publicResolver), /Only http/);
  await assert.rejects(vetUrl('http://user:pw@example.com/', publicResolver), /Credentials/);
  await assert.rejects(vetUrl('not a url', publicResolver), /Invalid URL/);
  const t = await vetUrl('webcal://calendar.example.com/feed.ics', publicResolver);
  assert.equal(t.url.protocol, 'https:');
  assert.equal(t.url.toString(), 'https://calendar.example.com/feed.ics');
  assert.equal(t.address, '93.184.216.34');
  const t2 = await vetUrl('WEBCALS://calendar.example.com/a.ics', publicResolver);
  assert.equal(t2.url.protocol, 'https:');
});

test('vetUrl: every resolved address must be public (DNS returning a private IP is rejected)', async () => {
  const mixed: Resolver = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '10.0.0.7', family: 4 },
  ];
  await assert.rejects(vetUrl('https://evil.example.com/', mixed), /non-public/);
  const v6loop: Resolver = async () => [{ address: '::1', family: 6 }];
  await assert.rejects(vetUrl('https://evil6.example.com/', v6loop), /non-public/);
  const none: Resolver = async () => [];
  await assert.rejects(vetUrl('https://nx.example.com/', none), /resolve/);
  const fail: Resolver = async () => {
    throw new Error('ENOTFOUND');
  };
  await assert.rejects(vetUrl('https://nx.example.com/', fail), /resolve/);
});

test('safeFetchText: redirects are re-validated (redirect to private IP rejected), max 3 hops', async () => {
  const toPrivate: Transport = async (target) =>
    target.url.hostname === 'cal.example.com'
      ? { status: 302, headers: { location: 'http://169.254.169.254/latest' }, body: Buffer.alloc(0) }
      : { status: 200, headers: {}, body: Buffer.from('secret') };
  await assert.rejects(safeFetchText('https://cal.example.com/a.ics', { resolve: publicResolver, transport: toPrivate }), SsrfError);

  const toInternalName: Transport = async () => ({ status: 301, headers: { location: 'http://internal.example/' }, body: Buffer.alloc(0) });
  const resolver: Resolver = async (h) => (h === 'internal.example' ? [{ address: '192.168.0.10', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]);
  await assert.rejects(safeFetchText('https://cal.example.com/a.ics', { resolve: resolver, transport: toInternalName }), /non-public/);

  let hops = 0;
  const loop: Transport = async () => ({ status: 302, headers: { location: `/hop${++hops}` }, body: Buffer.alloc(0) });
  await assert.rejects(safeFetchText('https://cal.example.com/a.ics', { resolve: publicResolver, transport: loop }), /Too many redirects/);
  assert.equal(hops, 4); // initial + 3 redirects followed

  let n = 0;
  const ok: Transport = async (t) =>
    ++n < 3 ? { status: 302, headers: { location: `https://cal${n}.example.com/x` }, body: Buffer.alloc(0) } : { status: 200, headers: {}, body: Buffer.from(`final:${t.url.host}`) };
  assert.equal(await safeFetchText('https://cal.example.com/a.ics', { resolve: publicResolver, transport: ok }), 'final:cal2.example.com');

  const big: Transport = async () => ({ status: 200, headers: {}, body: Buffer.alloc(6 * 1024 * 1024) });
  await assert.rejects(safeFetchText('https://cal.example.com/a.ics', { resolve: publicResolver, transport: big }), /too large/);
  const notFound: Transport = async () => ({ status: 404, headers: {}, body: Buffer.alloc(0) });
  await assert.rejects(safeFetchText('https://cal.example.com/a.ics', { resolve: publicResolver, transport: notFound }), /HTTP 404/);
});

test('nodeTransport pins the connection to the vetted IP, decompresses, enforces size cap', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/gz') {
      res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/calendar' });
      res.end(zlib.gzipSync(`host=${req.headers.host}`));
    } else if (req.url === '/big') {
      res.writeHead(200);
      res.end(Buffer.alloc(2048, 'a'));
    } else {
      res.writeHead(200);
      res.end(`host=${req.headers.host}`);
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  try {
    // "pinned.invalid" never resolves via DNS; the custom lookup forces 127.0.0.1.
    const target = { url: new URL(`http://pinned.invalid:${port}/`), address: '127.0.0.1', family: 4 as const };
    const signal = AbortSignal.timeout(5000);
    const r = await nodeTransport(target, { maxBytes: 1024, signal });
    assert.equal(r.status, 200);
    assert.equal(r.body.toString(), `host=pinned.invalid:${port}`);
    const gz = await nodeTransport({ ...target, url: new URL(`http://pinned.invalid:${port}/gz`) }, { maxBytes: 1024, signal });
    assert.equal(gz.body.toString(), `host=pinned.invalid:${port}`);
    await assert.rejects(nodeTransport({ ...target, url: new URL(`http://pinned.invalid:${port}/big`) }, { maxBytes: 1024, signal }), /too large/);
  } finally {
    server.close();
  }
});

// ── ICS parsing ──────────────────────────────────────────────────────────────

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0); // Sat 10 Oct 2026 12:00Z

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//EN',
  'X-WR-TIMEZONE:Asia/Kolkata',
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:STANDARD',
  'DTSTART:19701101T020000',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'END:STANDARD',
  'END:VTIMEZONE',
  // TZID + folding + escapes + nested VALARM
  'BEGIN:VEVENT',
  'UID:ny-1@test',
  'DTSTART;TZID=America/New_York:20261012T090000',
  'DTEND;TZID=America/New_York:20261012T100000',
  'SUMMARY:Quarterly review with the ',
  ' Acme team',
  'DESCRIPTION:Agenda:\\n1. Numbers\\, plans\\; risks',
  'LOCATION:Room 4\\, HQ',
  'URL:https://meet.example.com/abc',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'DESCRIPTION:Reminder text that must not leak',
  'TRIGGER:-PT15M',
  'END:VALARM',
  'END:VEVENT',
  // floating time → calendar X-WR-TIMEZONE (Asia/Kolkata), DURATION
  'BEGIN:VEVENT',
  'UID:floating@test',
  'DTSTART:20261011T150000',
  'DURATION:PT1H30M',
  'SUMMARY:Floating',
  'URL:javascript:alert(1)',
  'END:VEVENT',
  // Windows tz name
  'BEGIN:VEVENT',
  'UID:win@test',
  'DTSTART;TZID="India Standard Time":20261013T110000',
  'DTEND;TZID="India Standard Time":20261013T113000',
  'SUMMARY:Outlook meeting',
  'END:VEVENT',
  // all-day
  'BEGIN:VEVENT',
  'UID:allday@test',
  'DTSTART;VALUE=DATE:20261015',
  'SUMMARY:Offsite',
  'END:VEVENT',
  // weekly BYDAY + EXDATE across the London DST change (25 Oct 2026)
  'BEGIN:VEVENT',
  'UID:weekly@test',
  'DTSTART;TZID=Europe/London:20261005T100000',
  'DTEND;TZID=Europe/London:20261005T103000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10',
  'EXDATE;TZID=Europe/London:20261014T100000',
  'SUMMARY:Sync',
  'END:VEVENT',
  // daily with UNTIL + an overridden instance
  'BEGIN:VEVENT',
  'UID:daily@test',
  'DTSTART:20261008T080000Z',
  'DURATION:PT30M',
  'RRULE:FREQ=DAILY;UNTIL=20261011T080000Z',
  'SUMMARY:Standup',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:daily@test',
  'RECURRENCE-ID:20261010T080000Z',
  'DTSTART:20261010T090000Z',
  'DTEND:20261010T093000Z',
  'SUMMARY:Standup (moved)',
  'END:VEVENT',
  // monthly 2nd Tuesday
  'BEGIN:VEVENT',
  'UID:monthly@test',
  'DTSTART;TZID=America/Los_Angeles:20260113T170000',
  'DTEND;TZID=America/Los_Angeles:20260113T180000',
  'RRULE:FREQ=MONTHLY;BYDAY=2TU',
  'SUMMARY:Board call',
  'END:VEVENT',
  // yearly all-day
  'BEGIN:VEVENT',
  'UID:bday@test',
  'DTSTART;VALUE=DATE:19901101',
  'DTEND;VALUE=DATE:19901102',
  'RRULE:FREQ=YEARLY',
  'SUMMARY:Raj birthday',
  'END:VEVENT',
  // cancelled + out of window
  'BEGIN:VEVENT',
  'UID:cancel@test',
  'DTSTART:20261012T100000Z',
  'STATUS:CANCELLED',
  'SUMMARY:Cancelled',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:old@test',
  'DTSTART:20250101T100000Z',
  'SUMMARY:Old',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:far@test',
  'DTSTART:20270101T100000Z',
  'SUMMARY:Far',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

test('ICS: TZID conversion, folding, escapes, VALARM isolation, URL sanitising', () => {
  const evs = parseIcs(ICS, { now: NOW });
  const ny = evs.find((e) => e.uid === 'ny-1@test')!;
  assert.equal(ny.startAt, Date.UTC(2026, 9, 12, 13, 0)); // 09:00 EDT
  assert.equal(ny.endAt, Date.UTC(2026, 9, 12, 14, 0));
  assert.equal(ny.title, 'Quarterly review with the Acme team');
  assert.equal(ny.notes, 'Agenda:\n1. Numbers, plans; risks');
  assert.equal(ny.location, 'Room 4, HQ');
  assert.equal(ny.url, 'https://meet.example.com/abc');
  assert.equal(ny.allDay, false);

  const fl = evs.find((e) => e.uid === 'floating@test')!;
  assert.equal(fl.startAt, Date.UTC(2026, 9, 11, 9, 30)); // 15:00 IST
  assert.equal(fl.endAt - fl.startAt, 90 * 60_000);
  assert.equal(fl.url, null);

  const win = evs.find((e) => e.uid === 'win@test')!;
  assert.equal(win.startAt, Date.UTC(2026, 9, 13, 5, 30));
});

test('ICS: all-day events', () => {
  const evs = parseIcs(ICS, { now: NOW });
  const ad = evs.find((e) => e.uid === 'allday@test')!;
  assert.equal(ad.allDay, true);
  assert.equal(ad.startAt, Date.UTC(2026, 9, 15));
  assert.equal(ad.endAt, Date.UTC(2026, 9, 16));
  const bday = evs.filter((e) => e.uid.startsWith('bday@test/'));
  assert.deepEqual(
    bday.map((e) => [e.startAt, e.endAt, e.allDay]),
    [[Date.UTC(2026, 10, 1), Date.UTC(2026, 10, 2), true]],
  );
});

test('ICS: RRULE weekly BYDAY with EXDATE and COUNT across DST', () => {
  const evs = parseIcs(ICS, { now: NOW }).filter((e) => e.uid.startsWith('weekly@test/'));
  // Series: Oct 5,7,9,12,14(EXDATE),16,19,21,23,26 (COUNT=10). Window starts Oct 9 12:00Z.
  assert.deepEqual(
    evs.map((e) => new Date(e.startAt).toISOString()),
    [
      '2026-10-12T09:00:00.000Z',
      '2026-10-16T09:00:00.000Z',
      '2026-10-19T09:00:00.000Z',
      '2026-10-21T09:00:00.000Z',
      '2026-10-23T09:00:00.000Z',
      '2026-10-26T10:00:00.000Z', // GMT after 25 Oct
    ],
  );
  assert.ok(evs.every((e) => e.endAt - e.startAt === 30 * 60_000));
  assert.equal(new Set(evs.map((e) => e.uid)).size, evs.length);
});

test('ICS: DAILY UNTIL + RECURRENCE-ID override; MONTHLY 2nd Tuesday; cancelled & out-of-window skipped', () => {
  const evs = parseIcs(ICS, { now: NOW });
  const daily = evs.filter((e) => e.uid.startsWith('daily@test/'));
  assert.deepEqual(
    daily.map((e) => [e.title, new Date(e.startAt).toISOString()]),
    [
      ['Standup (moved)', '2026-10-10T09:00:00.000Z'],
      ['Standup', '2026-10-11T08:00:00.000Z'],
    ],
  );
  assert.equal(daily[0]!.uid, `daily@test/${Date.UTC(2026, 9, 10, 8)}`);
  const monthly = evs.filter((e) => e.uid.startsWith('monthly@test/'));
  assert.deepEqual(
    monthly.map((e) => new Date(e.startAt).toISOString()),
    ['2026-10-14T00:00:00.000Z'], // Tue 13 Oct 17:00 PDT
  );
  const uids = evs.map((e) => e.uid);
  assert.ok(!uids.some((u) => u.startsWith('cancel@')));
  assert.ok(!uids.some((u) => u.startsWith('old@')));
  assert.ok(!uids.some((u) => u.startsWith('far@')));
  // sorted by start
  assert.deepEqual([...evs].sort((a, b) => a.startAt - b.startAt), evs);
});

test('ICS: robust to garbage, LF-only line endings and missing fields', () => {
  assert.deepEqual(parseIcs('', { now: NOW }), []);
  assert.deepEqual(parseIcs('garbage\nmore garbage', { now: NOW }), []);
  const evs = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261011T100000Z\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:no start\nEND:VEVENT\nEND:VCALENDAR', { now: NOW });
  assert.equal(evs.length, 1);
  assert.equal(evs[0]!.title, 'Untitled event');
  assert.match(evs[0]!.uid, /^gen-/);
  assert.equal(evs[0]!.endAt, evs[0]!.startAt);
});

test('ICS: RRULE edge cases — weekly INTERVAL, monthly BYMONTHDAY=-1, BYSETPOS, long-running daily', () => {
  const cal = (body: string[]) => ['BEGIN:VCALENDAR', ...body, 'END:VCALENDAR'].join('\n');
  const biweekly = parseIcs(cal(['BEGIN:VEVENT', 'UID:b', 'DTSTART:20260101T100000Z', 'RRULE:FREQ=WEEKLY;INTERVAL=2', 'END:VEVENT']), { now: NOW });
  // Thursdays every 2 weeks from Thu Jan 1 2026: Oct 8 = +40w, Oct 22 = +42w, Nov 5 = +44w.
  assert.deepEqual(biweekly.map((e) => new Date(e.startAt).toISOString().slice(0, 10)), ['2026-10-22', '2026-11-05']);
  const eom = parseIcs(cal(['BEGIN:VEVENT', 'UID:e', 'DTSTART;VALUE=DATE:20260131', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1', 'END:VEVENT']), { now: NOW });
  assert.deepEqual(eom.map((e) => new Date(e.startAt).toISOString().slice(0, 10)), ['2026-10-31']);
  const lastWorkday = parseIcs(
    cal(['BEGIN:VEVENT', 'UID:l', 'DTSTART:20260130T090000Z', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', 'END:VEVENT']),
    { now: NOW },
  );
  assert.deepEqual(lastWorkday.map((e) => new Date(e.startAt).toISOString().slice(0, 10)), ['2026-10-30']);
  const daily = parseIcs(cal(['BEGIN:VEVENT', 'UID:d', 'DTSTART:19900101T070000Z', 'RRULE:FREQ=DAILY', 'END:VEVENT']), { now: NOW });
  assert.equal(daily.length, 31); // Oct 10 07:00 … Nov 9 07:00 (window = Oct 9 12:00Z … Nov 9 12:00Z)
  assert.equal(new Date(daily[0]!.startAt).toISOString(), '2026-10-10T07:00:00.000Z');
});

test('wallToUtc handles DST in both hemispheres', () => {
  assert.equal(wallToUtc({ y: 2026, m: 7, d: 1, h: 12, mi: 0, s: 0 }, 'America/New_York'), Date.UTC(2026, 6, 1, 16));
  assert.equal(wallToUtc({ y: 2026, m: 1, d: 1, h: 12, mi: 0, s: 0 }, 'America/New_York'), Date.UTC(2026, 0, 1, 17));
  assert.equal(wallToUtc({ y: 2026, m: 1, d: 1, h: 12, mi: 0, s: 0 }, 'Australia/Sydney'), Date.UTC(2026, 0, 1, 1));
  assert.equal(wallToUtc({ y: 2026, m: 1, d: 1, h: 12, mi: 0, s: 0 }, 'Asia/Kolkata'), Date.UTC(2026, 0, 1, 6, 30));
});

test('createCalendarFetcher: end-to-end with injected resolver + transport', async () => {
  const transport: Transport = async () => ({ status: 200, headers: {}, body: Buffer.from(ICS) });
  const f = createCalendarFetcher({ resolve: publicResolver, transport, now: () => NOW });
  const evs = await f.fetch('webcal://calendar.example.com/me.ics');
  assert.ok(evs.length >= 10);
  for (const e of evs) {
    assert.equal(typeof e.uid, 'string');
    assert.ok(e.endAt >= e.startAt);
    assert.ok(e.startAt < NOW + 30 * DAY);
  }
  const html: Transport = async () => ({ status: 200, headers: {}, body: Buffer.from('<html>login</html>') });
  await assert.rejects(createCalendarFetcher({ resolve: publicResolver, transport: html }).fetch('https://x.example.com/a'), /Not an iCalendar/);
  await assert.rejects(createCalendarFetcher({ resolve: publicResolver, transport }).fetch('http://127.0.0.1/a.ics'), SsrfError);
});
