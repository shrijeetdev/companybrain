import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedQuickAdd, Priority, Recurrence } from '@companybrain/types';
import { parseQuickAdd, zonedToUtc } from '../src/index';

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';
/** Wednesday 14 Oct 2026, 10:00 local in each zone. */
const NOW_IST = Date.parse('2026-10-14T10:00:00+05:30');
const NOW_NY = Date.parse('2026-10-14T10:00:00-04:00');
/** Saturday before US DST ends (Sun 1 Nov 2026, 02:00 EDT → 01:00 EST). */
const NOW_NY_FALL = Date.parse('2026-10-31T12:00:00-04:00');
/** Saturday before US DST starts (Sun 14 Mar 2027, 02:00 EST → 03:00 EDT). */
const NOW_NY_SPRING = Date.parse('2027-03-13T12:00:00-05:00');

/** Independent ground truth: format an instant as "YYYY-MM-DD HH:mm" in `tz` via Intl. */
function local(ms: number, tz: string): string {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms))) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

interface Case {
  text: string;
  tz?: string;
  now?: number;
  defaultHour?: number;
  title?: string;
  /** local "YYYY-MM-DD HH:mm" or null */
  due?: string | null;
  /** absolute ISO instant (for DST checks) */
  dueUtc?: string;
  allDay?: boolean;
  priority?: Priority | null;
  assignees?: string[];
  project?: string | null;
  tags?: string[];
  rec?: Recurrence | null;
  reminders?: number[] | null;
  /** expected token texts as "kind:text" */
  tokens?: string[];
}

function run(c: Case): ParsedQuickAdd {
  const tz = c.tz ?? IST;
  const now = c.now ?? (tz === NY ? NOW_NY : NOW_IST);
  const r = parseQuickAdd(c.text, { now, timezone: tz, ...(c.defaultHour !== undefined ? { defaultHour: c.defaultHour } : {}) });
  if (c.title !== undefined) assert.equal(r.title, c.title, 'title');
  if (c.due !== undefined) assert.equal(r.dueAt === null ? null : local(r.dueAt, tz), c.due, 'dueAt');
  if (c.dueUtc !== undefined) assert.equal(r.dueAt === null ? null : new Date(r.dueAt).toISOString(), c.dueUtc, 'dueAt (UTC)');
  if (c.allDay !== undefined) assert.equal(r.dueAllDay, c.allDay, 'dueAllDay');
  if (c.priority !== undefined) assert.equal(r.priority, c.priority, 'priority');
  if (c.assignees !== undefined) assert.deepEqual(r.assigneeHints, c.assignees, 'assigneeHints');
  if (c.project !== undefined) assert.equal(r.projectHint, c.project, 'projectHint');
  if (c.tags !== undefined) assert.deepEqual(r.tags, c.tags, 'tags');
  if (c.rec !== undefined) assert.deepEqual(r.recurrence, c.rec, 'recurrence');
  if (c.reminders !== undefined) assert.deepEqual(r.reminderOffsets, c.reminders, 'reminderOffsets');
  if (c.tokens !== undefined) assert.deepEqual(r.tokens.map((t) => `${t.kind}:${c.text.slice(t.start, t.end)}`), c.tokens, 'tokens');
  // Invariants for every case: tokens sorted, non-overlapping, in bounds; never an empty title for non-blank input.
  let prev = 0;
  for (const t of r.tokens) {
    assert.ok(t.start >= prev && t.end > t.start && t.end <= c.text.length, `token span ${t.start}-${t.end}`);
    prev = t.end;
  }
  if (c.text.trim()) assert.ok(r.title.length > 0, 'title not empty');
  return r;
}

const cases: [string, Case[]][] = [
  ['realistic sentences', [
    { text: 'Send Acme proposal tomorrow 5pm @priya #website !high', title: 'Send Acme proposal', due: '2026-10-15 17:00', allDay: false, priority: 'high', assignees: ['priya'], project: 'website', tags: [],
      tokens: ['date:tomorrow', 'date:5pm', 'assignee:@priya', 'project:#website', 'priority:!high'] },
    { text: 'call mom every sunday 7pm', title: 'Call mom', due: '2026-10-18 19:00', allDay: false, rec: { freq: 'weekly', interval: 1, byWeekday: [0] } },
    { text: 'Pay rent on the 1st every month remind me 1 day before', title: 'Pay rent', due: '2026-11-01 18:00', allDay: true, rec: { freq: 'monthly', interval: 1 }, reminders: [1440],
      tokens: ['date:on the 1st', 'recurrence:every month', 'reminder:remind me 1 day before'] },
    { text: 'review PR #frontend @claude by eod', title: 'Review PR', due: '2026-10-14 18:00', allDay: false, project: 'frontend', assignees: ['claude'] },
    { text: 'Q3 board deck due next friday p1 @shrijeet @priya', title: 'Q3 board deck', due: '2026-10-23 18:00', allDay: true, priority: 'high', assignees: ['shrijeet', 'priya'] },
    { text: 'buy milk', title: 'Buy milk', due: null, allDay: false, priority: null, assignees: [], project: null, tags: [], rec: null, reminders: null, tokens: [] },
    { text: 'Send Acme proposal tomorrow 5pm @priya #website !high', tz: NY, due: '2026-10-15 17:00', dueUtc: '2026-10-15T21:00:00.000Z' },
    { text: 'Send Acme proposal tomorrow 5pm @priya #website !high', dueUtc: '2026-10-15T11:30:00.000Z' },
    { text: 'call bob fri 5pm about the contract', title: 'Call bob about the contract', due: '2026-10-16 17:00' },
    { text: 'Standup every weekday 9:30am #eng', title: 'Standup', due: '2026-10-15 09:30', rec: { freq: 'weekdays', interval: 1, byWeekday: [1, 2, 3, 4, 5] }, project: 'eng' },
  ]],
  ['times inside titles (anchor rule)', [
    { text: 'meeting notes from 3pm call', title: 'Meeting notes from 3pm call', due: null, tokens: [] },
    { text: '3pm call with bob', title: 'Call with bob', due: '2026-10-14 15:00', allDay: false },
    { text: 'call bob at 3pm', title: 'Call bob', due: '2026-10-14 15:00' },
    { text: 'call bob 9am', title: 'Call bob', due: '2026-10-15 09:00' },
    { text: 'midnight snack', title: 'Midnight snack', due: null },
    { text: 'plan date night', title: 'Plan date night', due: null },
    { text: 'buy sun cream', title: 'Buy sun cream', due: null },
    { text: 'Upgrade node to 18.20', title: 'Upgrade node to 18.20', due: null },
    { text: 'review the 3rd draft', title: 'Review the 3rd draft', due: null },
    { text: "prep for tomorrow's offsite", title: "Prep for tomorrow's offsite", due: null },
  ]],
  ['relative dates', [
    { text: 'file taxes today', title: 'File taxes', due: '2026-10-14 18:00', allDay: true },
    { text: 'watch film tonight', title: 'Watch film', due: '2026-10-14 20:00', allDay: false },
    { text: 'tonight at 9 dinner with sam', title: 'Dinner with sam', due: '2026-10-14 21:00' },
    { text: 'gym tmrw', title: 'Gym', due: '2026-10-15 18:00', allDay: true },
    { text: 'TOMORROW: renew passport', title: 'Renew passport', due: '2026-10-15 18:00' },
    { text: 'dentist day after tomorrow', title: 'Dentist', due: '2026-10-16 18:00', allDay: true },
    { text: 'submit report friday', title: 'Submit report', due: '2026-10-16 18:00', allDay: true },
    { text: 'submit report wednesday', title: 'Submit report', due: '2026-10-21 18:00' },
    { text: 'submit report this wednesday', due: '2026-10-14 18:00' },
    { text: 'submit report next monday', due: '2026-10-19 18:00' },
    { text: 'submit report next wednesday', due: '2026-10-21 18:00' },
    { text: 'demo this fri', title: 'Demo', due: '2026-10-16 18:00' },
    { text: 'demo friday next week', title: 'Demo', due: '2026-10-23 18:00' },
    { text: 'check oven in 2 hours', title: 'Check oven', due: '2026-10-14 12:00', allDay: false },
    { text: 'follow up in 3 days', title: 'Follow up', due: '2026-10-17 18:00', allDay: true },
    { text: 'ping in half an hour', title: 'Ping', due: '2026-10-14 10:30' },
    { text: 'plan sprint next week', title: 'Plan sprint', due: '2026-10-19 18:00', allDay: true },
    { text: 'wrap up end of week', title: 'Wrap up', due: '2026-10-16 18:00' },
    { text: 'wrap up by eow', title: 'Wrap up', due: '2026-10-16 18:00' },
    { text: 'invoices eom', title: 'Invoices', due: '2026-10-31 18:00', allDay: true },
    { text: 'invoices by end of month', title: 'Invoices', due: '2026-10-31 18:00' },
    { text: 'clean garage this weekend', title: 'Clean garage', due: '2026-10-17 18:00' },
    { text: 'prepare slides for tomorrow', title: 'Prepare slides', due: '2026-10-15 18:00' },
    { text: 'renew domain two weeks from now', title: 'Renew domain', due: '2026-10-28 18:00' },
  ]],
  ['times', [
    { text: 'deploy 17:30', title: 'Deploy', due: '2026-10-14 17:30', allDay: false },
    { text: 'standup at 9', title: 'Standup', due: '2026-10-15 09:00' },
    { text: 'call at 5', title: 'Call', due: '2026-10-14 17:00' },
    { text: 'lunch by noon', title: 'Lunch', due: '2026-10-14 12:00' },
    { text: 'backup at midnight', title: 'Backup', due: '2026-10-15 00:00' },
    { text: 'call bob tomorrow morning', title: 'Call bob', due: '2026-10-15 09:00', allDay: false },
    { text: 'gym tomorrow morning at 6', title: 'Gym', due: '2026-10-15 06:00' },
    { text: 'review tomorrow afternoon', due: '2026-10-15 14:00' },
    { text: 'drinks friday evening', title: 'Drinks', due: '2026-10-16 18:00', allDay: false },
    { text: 'read in the evening', title: 'Read', due: '2026-10-14 18:00' },
    { text: 'run 7:15 am tomorrow', title: 'Run', due: '2026-10-15 07:15' },
    { text: 'deploy tomorrow at 2:30 p.m.', title: 'Deploy', due: '2026-10-15 14:30' },
    { text: 'ship @5pm', title: 'Ship', due: '2026-10-14 17:00', assignees: [] },
  ]],
  ['absolute dates', [
    { text: 'launch Oct 20', title: 'Launch', due: '2026-10-20 18:00', allDay: true },
    { text: 'launch Oct 12', title: 'Launch', due: '2027-10-12 18:00' },
    { text: 'launch on 3rd of November 2027 at 4pm', title: 'Launch', due: '2027-11-03 16:00' },
    { text: 'launch 20 December', title: 'Launch', due: '2026-12-20 18:00' },
    { text: 'board meeting 2026-10-12', title: 'Board meeting', due: '2026-10-12 18:00', allDay: true },
    { text: 'sync 2026-11-02T15:00Z', title: 'Sync', dueUtc: '2026-11-02T15:00:00.000Z', allDay: false },
    { text: 'dentist on 12/11', title: 'Dentist', due: '2026-11-12 18:00' },
    { text: 'dentist on 12/11', tz: NY, due: '2026-12-11 18:00' },
    { text: 'party 25/12', tz: NY, title: 'Party', due: '2026-12-25 18:00' },
    { text: 'party 20/10', title: 'Party', due: '2026-10-20 18:00' },
    { text: 'renew visa 13/1/2027', tz: NY, title: 'Renew visa', due: '2027-01-13 18:00' },
    { text: 'pay bills on the 15th', title: 'Pay bills', due: '2026-10-15 18:00' },
    { text: 'pay bills on the 10th', title: 'Pay bills', due: '2026-11-10 18:00' },
  ]],
  ['priority', [
    { text: 'fix prod !urgent', title: 'Fix prod', priority: 'urgent' },
    { text: 'fix prod !!!', title: 'Fix prod', priority: 'urgent' },
    { text: 'fix prod p0', title: 'Fix prod', priority: 'urgent' },
    { text: 'fix prod urgent', title: 'Fix prod', priority: 'urgent' },
    { text: 'fix prod ASAP', title: 'Fix prod', priority: 'urgent' },
    { text: 'URGENT: fix login', title: 'Fix login', priority: 'urgent' },
    { text: 'Urgent care appointment friday', title: 'Urgent care appointment', priority: null, due: '2026-10-16 18:00' },
    { text: 'fix important bug', title: 'Fix important bug', priority: null },
    { text: 'renew lease !high', title: 'Renew lease', priority: 'high' },
    { text: 'renew lease !!', title: 'Renew lease', priority: 'high' },
    { text: 'renew lease P1', title: 'Renew lease', priority: 'high' },
    { text: 'renew lease high priority', title: 'Renew lease', priority: 'high' },
    { text: 'renew lease important', title: 'Renew lease', priority: 'high' },
    { text: 'tidy docs !med', title: 'Tidy docs', priority: 'medium' },
    { text: 'tidy docs !medium', priority: 'medium' },
    { text: 'tidy docs p2', priority: 'medium' },
    { text: 'water plants !low', title: 'Water plants', priority: 'low' },
    { text: 'water plants p3', priority: 'low' },
    { text: 'Ship it!!!', title: 'Ship it!!!', priority: null },
  ]],
  ['assignees, projects, tags', [
    { text: 'draft memo for @priya', title: 'Draft memo', assignees: ['priya'], tokens: ['assignee:for @priya'] },
    { text: 'assign to raj review the deck', title: 'Review the deck', assignees: ['raj'] },
    { text: 'Talk to @priya about Q3', title: 'Talk to priya about Q3', assignees: ['priya'] },
    { text: '@a.b-c @d_e. sync', title: 'Sync', assignees: ['a.b-c', 'd_e'] },
    { text: 'email bob@acme.com re invoice', title: 'Email bob@acme.com re invoice', assignees: [] },
    { text: 'x #alpha #beta +gamma +beta', title: 'X', project: 'alpha', tags: ['beta', 'gamma'] },
    { text: 'fix bug #123', title: 'Fix bug #123', project: null },
    { text: 'learn C++ basics', title: 'Learn C++ basics', tags: [] },
  ]],
  ['recurrence', [
    { text: 'standup every day', title: 'Standup', rec: { freq: 'daily', interval: 1 }, due: '2026-10-14 18:00', allDay: true },
    { text: 'daily standup', title: 'Standup', rec: { freq: 'daily', interval: 1 } },
    { text: 'water plants every day at 8am', title: 'Water plants', due: '2026-10-15 08:00', allDay: false },
    { text: 'timesheet weekdays', rec: { freq: 'weekdays', interval: 1, byWeekday: [1, 2, 3, 4, 5] } },
    { text: 'review every monday', rec: { freq: 'weekly', interval: 1, byWeekday: [1] }, due: '2026-10-19 18:00' },
    { text: 'gym every mon and thu', title: 'Gym', rec: { freq: 'weekly', interval: 1, byWeekday: [1, 4] }, due: '2026-10-15 18:00' },
    { text: 'yoga every tue, wed & fri 7am', title: 'Yoga', rec: { freq: 'weekly', interval: 1, byWeekday: [2, 3, 5] }, due: '2026-10-16 07:00' },
    { text: 'weekly report', title: 'Report', rec: { freq: 'weekly', interval: 1 } },
    { text: 'payroll every 2 weeks', title: 'Payroll', rec: { freq: 'weekly', interval: 2 } },
    { text: 'payroll biweekly on friday', title: 'Payroll', rec: { freq: 'weekly', interval: 2, byWeekday: [5] } },
    { text: 'backup monthly', rec: { freq: 'monthly', interval: 1 } },
    { text: 'invoice every month on the 1st', title: 'Invoice', rec: { freq: 'monthly', interval: 1 }, due: '2026-11-01 18:00' },
    { text: 'rent every 1st', title: 'Rent', rec: { freq: 'monthly', interval: 1 }, due: '2026-11-01 18:00' },
    { text: 'board review quarterly', rec: { freq: 'monthly', interval: 3 } },
    { text: 'renew license yearly', title: 'Renew license', rec: { freq: 'yearly', interval: 1 } },
    { text: 'stretch every other day', rec: { freq: 'daily', interval: 2 } },
    { text: 'chess on mondays and thursdays', title: 'Chess', rec: { freq: 'weekly', interval: 1, byWeekday: [1, 4] } },
  ]],
  ['reminders', [
    { text: 'call tomorrow 5pm remind me 30m before', title: 'Call', reminders: [30] },
    { text: 'call tomorrow 5pm remind 1h before', reminders: [60] },
    { text: 'launch friday remind me 2 days before', title: 'Launch', reminders: [2880] },
    { text: 'call tomorrow 5pm remind me 1 day and 2 hours before', reminders: [120, 1440] },
    { text: 'call tomorrow 5pm remind me at 9am', title: 'Call', reminders: [480] },
    { text: 'flight friday 8am remind at 9am', title: 'Flight', due: '2026-10-16 08:00', reminders: [1380] },
    { text: 'pay card remind me at 9am', title: 'Pay card', due: '2026-10-15 09:00', reminders: [0] },
    { text: 'demo tomorrow remind me the day before', reminders: [1440] },
  ]],
  ['options + robustness', [
    { text: 'x tomorrow', defaultHour: 9, due: '2026-10-15 09:00', allDay: true },
    { text: 'x tomorrow', tz: 'Not/AZone', title: 'X' },
    { text: '', title: '', due: null, tokens: [] },
    { text: '   ', title: '', due: null },
    { text: '!!!', title: '!!!', priority: 'urgent' },
    { text: 'by noon', title: 'by noon', due: '2026-10-14 12:00' },
    { text: '@@@ ### +++ !!!!', title: '@@@ ### +++', priority: 'urgent' },
    { text: '🔥🔥 launch party 🎉 tomorrow', title: '🔥🔥 launch party 🎉', due: '2026-10-15 18:00' },
    { text: ')(*&^%$ 99:99 32/13 every at by on', title: ')(*&^%$ 99:99 32/13 every at by on', due: null },
  ]],
  ['DST boundaries (America/New_York)', [
    { text: 'x tomorrow 5pm', tz: NY, now: NOW_NY_FALL, due: '2026-11-01 17:00', dueUtc: '2026-11-01T22:00:00.000Z' },
    { text: 'x tomorrow 1:30am', tz: NY, now: NOW_NY_FALL, due: '2026-11-01 01:30', dueUtc: '2026-11-01T05:30:00.000Z' },
    { text: 'x in 24 hours', tz: NY, now: NOW_NY_FALL, due: '2026-11-01 11:00', dueUtc: '2026-11-01T16:00:00.000Z' },
    { text: 'x in 1 day', tz: NY, now: NOW_NY_FALL, due: '2026-11-01 18:00', dueUtc: '2026-11-01T23:00:00.000Z', allDay: true },
    { text: 'church every sunday 9am', tz: NY, now: NOW_NY_FALL, dueUtc: '2026-11-01T14:00:00.000Z' },
    { text: 'x tomorrow 5pm remind me at 9am', tz: NY, now: NOW_NY_FALL, reminders: [480] },
    { text: 'x tomorrow 2:30am', tz: NY, now: NOW_NY_SPRING, due: '2027-03-14 03:30', dueUtc: '2027-03-14T07:30:00.000Z' },
    { text: 'x tomorrow 9am', tz: NY, now: NOW_NY_SPRING, dueUtc: '2027-03-14T13:00:00.000Z' },
    { text: 'x monday 9am', tz: NY, now: NOW_NY_SPRING, dueUtc: '2027-03-15T13:00:00.000Z' },
    { text: 'x tomorrow', tz: NY, now: NOW_NY_SPRING, dueUtc: '2027-03-14T22:00:00.000Z' },
  ]],
];

let count = 0;
for (const [group, list] of cases) {
  for (const c of list) {
    count++;
    test(`${group}: ${JSON.stringify(c.text)}${c.tz ? ` [${c.tz}]` : ''}`, () => {
      run(c);
    });
  }
}

test('case table has at least 80 cases', () => {
  assert.ok(count >= 80, `only ${count} cases`);
});

test('never throws on non-string / hostile input', () => {
  const bad: unknown[] = [null, undefined, 42, {}, 'a'.repeat(20_000), '@'.repeat(5000), 'every '.repeat(2000), '1/'.repeat(3000)];
  for (const b of bad) {
    const r = parseQuickAdd(b as string, { now: NOW_IST, timezone: IST });
    assert.equal(typeof r.title, 'string');
  }
  const r = parseQuickAdd('x tomorrow', { now: Number.NaN, timezone: 42 as unknown as string, defaultHour: 99 });
  assert.equal(r.title, 'X');
});

test('deterministic for fixed now + timezone', () => {
  const a = parseQuickAdd('Q3 board deck due next friday p1 @shrijeet', { now: NOW_NY, timezone: NY });
  const b = parseQuickAdd('Q3 board deck due next friday p1 @shrijeet', { now: NOW_NY, timezone: NY });
  assert.deepEqual(a, b);
});

test('zonedToUtc: ambiguous → earlier, gap → shifted forward', () => {
  assert.equal(new Date(zonedToUtc({ y: 2026, m: 11, d: 1 }, 1, 30, NY)).toISOString(), '2026-11-01T05:30:00.000Z');
  assert.equal(new Date(zonedToUtc({ y: 2027, m: 3, d: 14 }, 2, 30, NY)).toISOString(), '2027-03-14T07:30:00.000Z');
  assert.equal(new Date(zonedToUtc({ y: 2026, m: 10, d: 14 }, 0, 0, IST)).toISOString(), '2026-10-13T18:30:00.000Z');
});

test('performance: 1000 parses < 1s', () => {
  const inputs = cases.flatMap(([, l]) => l.map((c) => c.text));
  // warm up
  for (const t of inputs) parseQuickAdd(t, { now: NOW_IST, timezone: IST });
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) parseQuickAdd(inputs[i % inputs.length]!, { now: NOW_NY, timezone: NY });
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `1000 parses took ${ms.toFixed(0)}ms`);
});
