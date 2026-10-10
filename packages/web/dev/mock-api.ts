/* eslint-disable */
// companybrain v2 — in-memory mock of docs/v2/API.md for web development.
//
//   npx tsx packages/web/dev/mock-api.ts          (port 8787; vite proxies /api here)
//
// Env:
//   MOCK_PORT=8787            port
//   MOCK_NEEDS_SETUP=1        start empty (first-run wizard)
//   MOCK_TZ=Asia/Kolkata      org/member timezone; "morning" picks a zone where it's ~9:30 am now
//   MOCK_LIVE_MS=30000        how often a simulated teammate/agent does something (0 = never)
//   MOCK_TTS=1                /api/briefing/audio returns a short WAV instead of 204
//   MOCK_LATENCY=120          artificial latency (ms) per request

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import type {
  ApiKey, AuditEvent, Briefing, CalendarFeed, InboxItem, Lead, LiveEvent, Meeting, Member,
  MemberPrefs, Notification, OrgSettings, ParsedQuickAdd, Priority, Project, ProjectSummary,
  Recurrence, Report, Task, TaskActivity, TaskDraft, TaskStatus, TaskView, TeamPulse,
} from '../../types/src/index.ts';
import { createMockGame } from './mock-game.ts';

const PORT = Number(process.env.MOCK_PORT ?? 8787);
const LIVE_MS = Number(process.env.MOCK_LIVE_MS ?? 30000);
const LATENCY = Number(process.env.MOCK_LATENCY ?? 120);
const NOW0 = Date.now();
const H = 3600_000;
const D = 86400_000;
const M = 60_000;

// ─── time helpers ────────────────────────────────────────────────────────────

function tzOffsetMin(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(ts / 1000) * 1000) / M);
}
function localMidnight(ts: number, tz: string): number {
  const off = tzOffsetMin(ts, tz) * M;
  const local = ts + off;
  return local - (((local % D) + D) % D) - off;
}
function localHour(ts: number, tz: string): number {
  const off = tzOffsetMin(ts, tz) * M;
  return (((ts + off) % D) + D) % D / H;
}
function pickTz(): string {
  const want = process.env.MOCK_TZ ?? 'Asia/Kolkata';
  if (want !== 'morning') return want;
  const zones = ['Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver', 'America/Chicago',
    'America/New_York', 'America/Sao_Paulo', 'Atlantic/Azores', 'Europe/London', 'Europe/Berlin', 'Europe/Athens',
    'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo',
    'Australia/Sydney', 'Pacific/Auckland'];
  let best = zones[0]!; let bestD = 99;
  for (const z of zones) { const d = Math.abs(localHour(NOW0, z) - 9.5); if (d < bestD) { bestD = d; best = z; } }
  return best;
}
const TZ = pickTz();
const today0 = () => localMidnight(Date.now(), TZ);
const at = (day: number, h: number, m = 0) => localMidnight(NOW0, TZ) + day * D + (h * 60 + m) * M;
const allDayAt = (day: number) => at(day, 18, 0);

// ─── ids ─────────────────────────────────────────────────────────────────────

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function rid(prefix: string, n = 12): string {
  const b = randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALNUM[b[i]! % ALNUM.length];
  return `${prefix}_${s}`;
}

// ─── state ───────────────────────────────────────────────────────────────────

const ORG_ID = 'org_vexocore01';
let org: OrgSettings | null = null;
let members: Member[] = [];
let projects: Project[] = [];
let tasks: Task[] = [];
let activity: TaskActivity[] = [];
let meetings: Meeting[] = [];
let feeds: CalendarFeed[] = [];
let notifications: Notification[] = [];
let inbox: InboxItem[] = [];
let leads: Lead[] = [];
let keys: ApiKey[] = [];
let audit: AuditEvent[] = [];
const sessions = new Map<string, string>(); // token → memberId
const passwords = new Map<string, string>(); // memberId → password
let waState: { status: 'disconnected' | 'pairing' | 'connected'; qr: string | null; phone: string | null; since: number } =
  { status: 'disconnected', qr: null, phone: null, since: 0 };

const defaultPrefs = (): MemberPrefs => ({
  briefingVoice: 'auto', voiceName: null, digestHour: 8, notifyPush: true, notifyWhatsapp: true,
  notifyEmail: false, quietStart: 22, quietEnd: 7,
  theme: (process.env.MOCK_THEME as MemberPrefs['theme']) ?? 'tactical', sound: true,
});

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1]![0] : (p[0]?.[1] ?? ''))).toUpperCase();
}

function mkMember(id: string, name: string, role: Member['role'], extra: Partial<Member> = {}): Member {
  return {
    id, orgId: ORG_ID, kind: 'human', role, name, email: null, phone: null, title: null,
    initials: initials(name), color: '#3b6ff6', avatarUrl: null, timezone: TZ, active: true,
    prefs: defaultPrefs(), agent: null, createdAt: NOW0 - 120 * D, updatedAt: NOW0 - 2 * D, ...extra,
  };
}

function seed(): void {
  org = {
    id: ORG_ID, name: 'Vexocore', timezone: TZ, logo: null, workdayStart: 9, workdayEnd: 18,
    defaultReminderOffsets: [1440, 60, 0], escalateAfterMin: 1440, agentStaleAfterMin: 240,
    intakeAutoAck: true, currency: 'INR', createdAt: NOW0 - 200 * D, updatedAt: NOW0 - 5 * D,
  };
  members = [
    mkMember('mem_shrijeet01', 'Shrijeet Mehta', 'owner', { email: 'owner@vexocore.test', phone: '+919820011001', title: 'Founder & CEO', color: '#3b6ff6' }),
    mkMember('mem_priya0001', 'Priya Nair', 'admin', { email: 'priya@vexocore.test', phone: '+919820011002', title: 'Head of Operations', color: '#e0559a' }),
    mkMember('mem_raj000001', 'Raj Malhotra', 'manager', { email: 'raj@vexocore.test', phone: '+919820011003', title: 'Engineering Lead', color: '#0ea5a4' }),
    mkMember('mem_ananya001', 'Ananya Iyer', 'member', { email: 'ananya@vexocore.test', phone: '+919820011004', title: 'Product Designer', color: '#f59e0b' }),
    mkMember('mem_kabir0001', 'Kabir Shah', 'member', { email: 'kabir@vexocore.test', phone: '+919820011005', title: 'Growth & Sales', color: '#16a34a' }),
    mkMember('mem_meera0001', 'Meera Kapoor', 'member', { email: 'meera@vexocore.test', phone: '+919820011006', title: 'Content Lead', color: '#8b5cf6' }),
    mkMember('mem_claude001', 'Claude', 'agent', {
      kind: 'agent', title: 'AI writer & researcher', color: '#d97757', initials: 'CL',
      agent: { provider: 'claude', description: 'Drafts posts, research briefs and code reviews.', lastSeenAt: NOW0 - 12 * M, supervisorId: 'mem_shrijeet01' },
    }),
    mkMember('mem_chatgpt01', 'ChatGPT', 'agent', {
      kind: 'agent', title: 'AI support desk', color: '#10a37f', initials: 'GP',
      agent: { provider: 'chatgpt', description: 'Answers customer tickets and summarizes calls.', lastSeenAt: NOW0 - 6.5 * H, supervisorId: 'mem_priya0001' },
    }),
    mkMember('mem_cursor001', 'Cursor', 'agent', {
      kind: 'agent', title: 'AI engineer', color: '#1f2937', initials: 'CU',
      agent: { provider: 'cursor', description: 'Ships changes to the website and app repos.', lastSeenAt: NOW0 - 3 * M, supervisorId: 'mem_raj000001' },
    }),
  ];
  for (const m of members) if (m.kind === 'human') passwords.set(m.id, 'demo1234');

  const P = (id: string, name: string, emoji: string, color: string, description: string, leadId: string, memberIds: string[], dueAt: number | null): Project => ({
    id, orgId: ORG_ID, name, emoji, color, description, status: 'active', leadId, memberIds, dueAt,
    createdBy: 'mem_shrijeet01', createdAt: NOW0 - 60 * D, updatedAt: NOW0 - D,
  });
  projects = [
    P('prj_website01', 'Website relaunch', '🌐', '#3b6ff6', 'New marketing site, pricing and checkout.', 'mem_raj000001', ['mem_raj000001', 'mem_ananya001', 'mem_meera0001', 'mem_cursor001', 'mem_shrijeet01'], at(18, 18)),
    P('prj_launch001', 'Vexo Pulse launch', '🚀', '#7c5cff', 'Q4 product launch — press, content, launch day.', 'mem_shrijeet01', ['mem_shrijeet01', 'mem_meera0001', 'mem_raj000001', 'mem_claude001', 'mem_priya0001'], at(9, 10)),
    P('prj_acme0001', 'Acme onboarding', '🤝', '#10b981', 'Enterprise onboarding for Acme Corp.', 'mem_priya0001', ['mem_priya0001', 'mem_shrijeet01', 'mem_chatgpt01', 'mem_cursor001'], at(25, 18)),
    P('prj_growth01', 'Growth engine', '📈', '#f59e0b', 'Referrals, lifecycle email and outbound.', 'mem_kabir0001', ['mem_kabir0001', 'mem_ananya001', 'mem_claude001', 'mem_chatgpt01'], null),
  ];

  type Seed = {
    t: string; p?: string; a: string[]; s?: TaskStatus; pr?: Priority; due?: [number, number, number?] | ['allday', number] | null;
    tags?: string[]; src?: Task['source']['channel']; notes?: string; subs?: [string, boolean][]; rec?: Recurrence;
    wait?: Task['waitingOn']; doneAgo?: number; idle?: number; by?: string;
  };
  const S = 'mem_shrijeet01', PR = 'mem_priya0001', RJ = 'mem_raj000001', AN = 'mem_ananya001', KB = 'mem_kabir0001', ME = 'mem_meera0001', CL = 'mem_claude001', GP = 'mem_chatgpt01', CU = 'mem_cursor001';
  const seeds: Seed[] = [
    { t: 'Send Acme proposal v2', p: 'prj_acme0001', a: [S], pr: 'high', due: [-1, 17], tags: ['sales'], src: 'quick_add', notes: 'Include the **revised pricing** and the onboarding timeline.\n- 12-month term\n- Dedicated success manager', subs: [['Pricing table', true], ['Case study: Northwind', false], ['Legal review', false]] },
    { t: 'Approve October payroll', a: [S], pr: 'urgent', due: ['allday', -2], tags: ['finance'], src: 'email', by: PR },
    { t: 'Review homepage hero copy', p: 'prj_website01', a: [ME, S], s: 'review', pr: 'medium', due: [-1, 12], src: 'manual', by: ME },
    { t: 'Fix checkout 500 on Safari', p: 'prj_website01', a: [CU], s: 'in_progress', pr: 'urgent', due: [-1, 19], tags: ['bug'], src: 'mcp', by: RJ, idle: 20 * M },
    { t: 'Prep investor update deck', p: 'prj_launch001', a: [S], s: 'in_progress', pr: 'high', due: [0, 13], src: 'quick_add', subs: [['Metrics slide', true], ['Runway', true], ['Asks', false]] },
    { t: 'Call Raj about launch budget', p: 'prj_launch001', a: [S], pr: 'medium', due: [0, 11, 30], src: 'voice' },
    { t: 'Sign NDA for Bluefin Labs', a: [S], pr: 'low', due: ['allday', 0], src: 'whatsapp', by: KB },
    { t: 'Inbox zero', a: [S], pr: 'none', due: [0, 18], rec: { freq: 'weekdays', interval: 1 }, src: 'recurring' },
    { t: 'Draft launch blog post', p: 'prj_launch001', a: [CL], s: 'in_progress', pr: 'high', due: [0, 18], tags: ['content'], src: 'mcp', by: ME, idle: 35 * M, notes: 'Angle: "the brain that never forgets". 900–1200 words, 3 customer quotes.' },
    { t: 'Ship pricing page A/B test', p: 'prj_website01', a: [CU, RJ], s: 'in_progress', pr: 'high', due: [0, 16], tags: ['experiment'], src: 'manual', by: RJ, idle: 8 * M },
    { t: 'Reply to Acme support tickets', p: 'prj_acme0001', a: [GP], s: 'in_progress', pr: 'medium', due: [0, 12], src: 'api', by: PR, idle: 6.5 * H },
    { t: 'Finalize Q4 OKRs', a: [PR], pr: 'high', due: [0, 17], tags: ['planning'], by: S },
    { t: 'Design onboarding emails', p: 'prj_growth01', a: [AN], s: 'in_progress', pr: 'medium', due: ['allday', 0], by: KB },
    { t: 'QA new onboarding flow', p: 'prj_growth01', a: [AN, CU], s: 'review', pr: 'high', due: [0, 14], by: KB },
    { t: 'Get signed SOW from Acme', p: 'prj_acme0001', a: [S], pr: 'high', due: [2, 17], src: 'email', wait: { name: 'Laura Chen · Acme', contact: 'laura@acme.com', channel: 'email', nudgeEveryHours: 48, lastNudgedAt: NOW0 - 20 * H, since: NOW0 - 3 * D } },
    { t: 'Logo files from Studio Nine', p: 'prj_website01', a: [AN], s: 'blocked', pr: 'medium', due: [1, 12], wait: { name: 'Studio Nine', contact: '+919811122233', channel: 'whatsapp', nudgeEveryHours: 24, lastNudgedAt: NOW0 - 5 * H, since: NOW0 - 2 * D } },
    { t: 'Invoice payment from Northwind', a: [S], pr: 'medium', due: [3, 18], tags: ['finance'], wait: { name: 'Rahul · Northwind', contact: '+919833344455', channel: 'whatsapp', nudgeEveryHours: 72, lastNudgedAt: null, since: NOW0 - D } },
    { t: 'Record product walkthrough video', p: 'prj_launch001', a: [ME], pr: 'medium', due: [1, 11], by: S },
    { t: '1:1 notes for Kabir', a: [S], pr: 'low', due: ['allday', 1] },
    { t: 'Migrate blog to new CMS', p: 'prj_website01', a: [CU], pr: 'medium', due: [1, 18], src: 'mcp', by: RJ },
    { t: 'Prepare Acme kickoff agenda', p: 'prj_acme0001', a: [PR], pr: 'high', due: [1, 10], by: S },
    { t: 'Press kit for Vexo Pulse', p: 'prj_launch001', a: [ME, CL], pr: 'high', due: ['allday', 3], tags: ['press'], by: S },
    { t: 'Competitor pricing research', p: 'prj_growth01', a: [CL], pr: 'medium', due: ['allday', 4], src: 'mcp', by: KB },
    { t: 'Set up referral program', p: 'prj_growth01', a: [KB], pr: 'medium', due: ['allday', 5] },
    { t: 'Security review of API keys', p: 'prj_website01', a: [RJ], s: 'review', pr: 'high', due: [2, 15], tags: ['security'] },
    { t: 'Weekly metrics review', a: [S, PR], pr: 'medium', due: [3, 10], rec: { freq: 'weekly', interval: 1, byWeekday: [1] }, src: 'recurring' },
    { t: 'Screen 5 designer candidates', a: [AN, PR], pr: 'medium', due: ['allday', 4], tags: ['hiring'] },
    { t: 'Update Acme data import script', p: 'prj_acme0001', a: [CU], pr: 'low', due: ['allday', 6], src: 'mcp' },
    { t: 'Plan team offsite in Goa', a: [PR], pr: 'low', due: ['allday', 14], tags: ['team'] },
    { t: 'Annual pricing revision', p: 'prj_growth01', a: [KB, S], pr: 'medium', due: ['allday', 21] },
    { t: 'Launch day run-of-show', p: 'prj_launch001', a: [RJ, ME], pr: 'high', due: [9, 9] },
    { t: 'Explore podcast sponsorships', p: 'prj_growth01', a: [KB], pr: 'low', due: null },
    { t: 'Refresh brand guidelines', p: 'prj_website01', a: [AN], pr: 'none', due: null },
    { t: 'Summarize customer interviews', p: 'prj_growth01', a: [GP], pr: 'medium', due: null, src: 'api', idle: 9 * H },
    { t: 'Write help-center articles', p: 'prj_acme0001', a: [GP, ME], pr: 'low', due: null, idle: 7 * H },
    { t: 'Lead list: 50 D2C brands', p: 'prj_growth01', a: [KB], s: 'in_progress', pr: 'medium', due: ['allday', 2], tags: ['sales'] },
    { t: 'Publish September changelog', p: 'prj_website01', a: [ME], s: 'done', pr: 'low', due: [-1, 12], doneAgo: 26 * H },
    { t: 'Set up WhatsApp intake', a: [RJ], s: 'done', pr: 'high', due: [0, 10], doneAgo: 2 * H },
    { t: 'Fix mobile nav overlap', p: 'prj_website01', a: [CU], s: 'done', pr: 'medium', due: [0, 9], doneAgo: 55 * M, src: 'mcp' },
    { t: 'Draft Acme welcome email', p: 'prj_acme0001', a: [CL], s: 'done', pr: 'medium', due: [-1, 18], doneAgo: 3 * H, src: 'mcp' },
    { t: 'Send NDA to Bluefin', a: [KB], s: 'done', pr: 'medium', due: [-2, 12], doneAgo: 2 * D },
    { t: 'Book launch venue', p: 'prj_launch001', a: [PR], s: 'done', pr: 'high', due: [-3, 17], doneAgo: 3 * D },
    { t: 'Collect testimonials from beta users', p: 'prj_launch001', a: [KB, CL], s: 'done', pr: 'medium', due: [-1, 17], doneAgo: 20 * H },
  ];
  tasks = seeds.map((s, i) => {
    let dueAt: number | null = null; let dueAllDay = false;
    if (s.due) {
      if (s.due[0] === 'allday') { dueAt = allDayAt(s.due[1]); dueAllDay = true; }
      else dueAt = at(s.due[0], s.due[1], s.due[2] ?? 0);
    }
    const createdAt = NOW0 - (4 + (i % 9)) * D - i * 37 * M;
    const status = s.s ?? 'todo';
    const completedAt = status === 'done' ? NOW0 - (s.doneAgo ?? H) : null;
    const lastActivityAt = completedAt ?? NOW0 - (s.idle ?? (0.4 + (i % 3) * 0.6) * H);
    return {
      id: `task_seed${String(i).padStart(4, '0')}x`, orgId: ORG_ID, projectId: s.p ?? null, title: s.t, notes: s.notes ?? '',
      status, priority: s.pr ?? 'none', assigneeIds: s.a, creatorId: s.by ?? S, dueAt, dueAllDay, reminderOffsets: null,
      recurrence: s.rec ?? null, recurrenceParentId: null, waitingOn: s.wait ?? null, tags: s.tags ?? [],
      subtasks: (s.subs ?? []).map(([title, done], j) => ({ id: `sub_${i}x${j}seed`, title, done, doneAt: done ? NOW0 - 5 * H : null, doneBy: done ? S : null })),
      source: { channel: s.src ?? 'manual', ref: null, from: s.src === 'whatsapp' ? '+919820011005' : s.src === 'email' ? 'priya@vexocore.test' : null },
      order: i * 1024, startedAt: status === 'in_progress' || status === 'review' ? NOW0 - D : null,
      completedAt, completedBy: completedAt ? s.a[0]! : null, lastActivityAt, createdAt, updatedAt: lastActivityAt,
    };
  });
  // activity
  for (const t of tasks) act(t.id, t.creatorId, 'created', `created this task${t.source.channel !== 'manual' ? ` via ${t.source.channel.replace('_', '-')}` : ''}`, t.createdAt);
  const byTitle = (title: string) => tasks.find((t) => t.title === title)!;
  const blog = byTitle('Draft launch blog post');
  act(blog.id, ME, 'comment', '@Claude please keep it under 1200 words and use the Acme quote.', NOW0 - 5 * H);
  act(blog.id, CL, 'status', 'moved to In progress', NOW0 - 4.5 * H);
  act(blog.id, CL, 'handoff', 'Outline done (6 sections). First draft of intro + "why now" written — 640 words. Next: customer quotes section; waiting on Meera for the Acme quote approval.', NOW0 - 35 * M);
  const sow = byTitle('Get signed SOW from Acme');
  act(sow.id, 'system', 'nudge_sent', 'Nudged Laura Chen · Acme by email', NOW0 - 20 * H);
  const proposal = byTitle('Send Acme proposal v2');
  act(proposal.id, PR, 'comment', '@Shrijeet Laura asked for this by EOD — can I help with the case study?', NOW0 - 26 * H);
  act(proposal.id, 'system', 'reminder_sent', 'Reminder sent 1 hour before due', NOW0 - 26 * H);
  act(proposal.id, CL, 'handoff', 'Drafted the Northwind case study (in notes). Needs a quote from their CTO.', NOW0 - 22 * H);
  const safari = byTitle('Fix checkout 500 on Safari');
  act(safari.id, CU, 'handoff', 'Root cause: Intl.Segmenter missing on Safari 16. Shipping a polyfill + server fallback. PR #482 open, tests green.', NOW0 - 20 * M);
  const hero = byTitle('Review homepage hero copy');
  act(hero.id, ME, 'comment', '@Shrijeet two options in the doc — I prefer B ("Nothing slips").', NOW0 - 28 * H);
  const support = byTitle('Reply to Acme support tickets');
  act(support.id, GP, 'handoff', 'Answered 14 of 22 tickets. Remaining 8 need billing access.', NOW0 - 6.5 * H);

  // meetings
  const mt = (title: string, day: number, h: number, m: number, dur: number, extra: Partial<Meeting> = {}): Meeting => ({
    id: rid('mtg'), orgId: ORG_ID, ownerId: S, title, startAt: at(day, h, m), endAt: at(day, h, m) + dur * M, allDay: false,
    location: null, url: null, attendeeIds: [S], notes: '', source: 'manual', externalId: null, feedId: null,
    createdAt: NOW0 - 5 * D, updatedAt: NOW0 - 5 * D, ...extra,
  });
  meetings = [
    mt('Team standup', 0, 10, 0, 15, { ownerId: null, attendeeIds: [S, PR, RJ, AN, KB, ME], url: 'https://meet.google.com/abc-defg-hij', source: 'ics' }),
    mt('Q4 launch sync with Raj', 0, 15, 0, 45, { attendeeIds: [S, RJ], location: 'Board room' }),
    mt('Acme onboarding call', 0, 17, 30, 30, { attendeeIds: [S, PR], url: 'https://zoom.us/j/123456789' }),
    mt('Design review', 1, 11, 0, 60, { attendeeIds: [S, AN, RJ] }),
    mt('Investor call — Sequoia', 2, 14, 0, 30, { url: 'https://zoom.us/j/987654321' }),
    mt('Weekly metrics review', 3, 10, 0, 45, { attendeeIds: [S, PR, KB] }),
    mt('Lunch with Laura (Acme)', 4, 13, 0, 75, { location: 'Bombay Canteen' }),
    mt('Launch rehearsal', 5, 16, 0, 90, { ownerId: null, attendeeIds: [S, RJ, ME, PR] }),
    mt('Hiring sync', -1, 12, 0, 30, { attendeeIds: [S, PR, AN] }),
  ];
  feeds = [{ id: 'feed_google001', orgId: ORG_ID, memberId: S, name: 'Google Calendar', urlMasked: 'https://calendar.google.com/…/basic.ics', lastSyncAt: NOW0 - 9 * M, lastError: null, createdAt: NOW0 - 30 * D }];

  // notifications for everyone (owner gets the rich set)
  const n = (memberId: string, kind: Notification['kind'], title: string, body: string, ago: number, read: boolean, taskTitle?: string, urgent = false): Notification => {
    const t = taskTitle ? byTitle(taskTitle) : null;
    return { id: rid('ntf'), orgId: ORG_ID, memberId, kind, title, body, taskId: t?.id ?? null, meetingId: null, link: t ? `/tasks/${t.id}` : kind === 'intake_new' ? '/inbox' : null, urgent, readAt: read ? NOW0 - ago + M : null, createdAt: NOW0 - ago };
  };
  notifications = [
    n(S, 'task_overdue', 'Overdue: Send Acme proposal v2', 'Was due yesterday at 5:00 PM.', 40 * M, false, 'Send Acme proposal v2', true),
    n(S, 'agent_stale', 'ChatGPT has gone quiet', 'No update on "Reply to Acme support tickets" for 6h.', 25 * M, false, 'Reply to Acme support tickets'),
    n(S, 'task_mention', 'Meera mentioned you', '"two options in the doc — I prefer B"', 2 * H, false, 'Review homepage hero copy'),
    n(S, 'intake_new', 'New WhatsApp message', 'Rohan (Bluefin Labs): "Can you send over the revised quote…"', 50 * M, false),
    n(S, 'task_completed', 'Cursor completed a task', 'Fix mobile nav overlap', 55 * M, true, 'Fix mobile nav overlap'),
    n(S, 'meeting_soon', 'Team standup in 10 min', 'Google Meet · 6 attendees', 5 * H, true),
    n(S, 'task_assigned', 'Priya assigned you a task', 'Approve October payroll', 2 * D, true, 'Approve October payroll'),
    n(S, 'digest', 'Your morning digest', '4 due today · 3 overdue · 3 meetings', 9 * H, true),
  ];

  // inbox
  const ib = (channel: InboxItem['channel'], from: string, fromName: string | null, subject: string | null, text: string, ago: number, suggestion: TaskDraft | null, extra: Partial<InboxItem> = {}): InboxItem => ({
    id: rid('inb'), orgId: ORG_ID, channel, from, fromName, subject, text, externalId: rid('ext'), memberId: null, status: 'new',
    suggestion, taskId: null, receivedAt: NOW0 - ago, createdAt: NOW0 - ago, ...extra,
  });
  inbox = [
    ib('whatsapp', '+919820099887', 'Rohan · Bluefin Labs', null, 'Hi! Can you send over the revised quote by Friday? Also need the latest deck for our board meeting 🙏', 50 * M,
      { title: 'Send revised quote + deck to Bluefin Labs', dueAt: at(nextWeekday(5), 17), priority: 'high', tags: ['sales'], assigneeIds: [KB] }),
    ib('email', 'laura@acme.com', 'Laura Chen', 'Re: SOW timeline', 'Thanks Shrijeet — legal has a few redlines on section 4 (liability cap). Could your team review and send back a clean copy by Tuesday? Happy to jump on a call.', 2.2 * H,
      { title: 'Review Acme SOW redlines (section 4)', dueAt: at(nextWeekday(2), 12), priority: 'high', projectId: 'prj_acme0001', assigneeIds: [S] }),
    ib('whatsapp', '+919820011005', 'Kabir Shah', null, 'remind me to call Northwind tomorrow 11am about the renewal', 3.5 * H,
      { title: 'Call Northwind about the renewal', dueAt: at(1, 11), priority: 'medium', assigneeIds: [KB] }, { memberId: KB }),
    ib('email', 'hello@studionine.design', 'Studio Nine', 'Logo concepts v3 attached', 'Hey team, attaching v3 of the logo concepts with the softer gradient you asked for. Let us know which direction to finalize.', 5 * H,
      { title: 'Pick a logo direction from Studio Nine v3', priority: 'medium', projectId: 'prj_website01', assigneeIds: [AN] }),
    ib('email', 'noreply@stripe.com', 'Stripe', 'Your payout is on the way', 'A payout of ₹4,82,300 is on the way to your bank account.', 26 * H, null, { status: 'dismissed' }),
  ];

  // leads
  const ld = (name: string, company: string, stage: Lead['stage'], value: number | null, ownerId: string, ago: number, source: Lead['source'] = 'manual'): Lead => ({
    id: rid('lead'), orgId: ORG_ID, name, company, email: `${name.split(' ')[0]!.toLowerCase()}@${company.toLowerCase().replace(/[^a-z]/g, '')}.com`,
    phone: '', stage, value, notes: '', ownerId, source, createdBy: KB, createdAt: NOW0 - ago, updatedAt: NOW0 - ago / 2,
  });
  leads = [
    ld('Rohan Desai', 'Bluefin Labs', 'proposal', 48000, KB, 9 * D, 'whatsapp'),
    ld('Laura Chen', 'Acme Corp', 'won', 120000, S, 40 * D, 'email'),
    ld('Arjun Rao', 'Northwind', 'meeting', 36000, KB, 6 * D),
    ld('Sara Kim', 'Lumen Health', 'contacted', 22000, KB, 4 * D),
    ld('Vikram Joshi', 'Cartwheel', 'new', 15000, KB, 1 * D, 'whatsapp'),
    ld('Nina Patel', 'Orbit Foods', 'new', 9000, PR, 2 * D, 'email'),
    ld('Tom Becker', 'Helix Robotics', 'proposal', 64000, S, 12 * D),
    ld('Isha Kulkarni', 'Paperplane', 'lost', 12000, KB, 30 * D),
    ld('Dev Menon', 'Gridline', 'contacted', 28000, KB, 3 * D),
  ];

  keys = [
    { id: 'key_claude0001', orgId: ORG_ID, memberId: CL, name: 'Claude Desktop', prefix: 'cb_live_Hq3k', scopes: ['read', 'write'], createdBy: S, createdAt: NOW0 - 20 * D, lastUsedAt: NOW0 - 12 * M, expiresAt: null, revokedAt: null },
    { id: 'key_cursor0001', orgId: ORG_ID, memberId: CU, name: 'Cursor (website repo)', prefix: 'cb_live_9zLm', scopes: ['read', 'write'], createdBy: RJ, createdAt: NOW0 - 14 * D, lastUsedAt: NOW0 - 3 * M, expiresAt: null, revokedAt: null },
    { id: 'key_chatgpt001', orgId: ORG_ID, memberId: GP, name: 'ChatGPT Actions', prefix: 'cb_live_p0Wd', scopes: ['read', 'write'], createdBy: PR, createdAt: NOW0 - 10 * D, lastUsedAt: NOW0 - 6.5 * H, expiresAt: null, revokedAt: null },
  ];

  audit = [
    { id: rid('aud'), orgId: ORG_ID, actorId: PR, type: 'task.updated', entity: 'task', entityId: tasks[11]!.id, summary: 'Priya changed priority of "Finalize Q4 OKRs" to High', before: { priority: 'medium' }, after: { priority: 'high' }, undoable: true, undoneAt: null, undoneBy: null, at: NOW0 - 3 * H },
    { id: rid('aud'), orgId: ORG_ID, actorId: CU, type: 'task.completed', entity: 'task', entityId: byTitle('Fix mobile nav overlap').id, summary: 'Cursor completed "Fix mobile nav overlap"', before: { status: 'in_progress' }, after: { status: 'done' }, undoable: true, undoneAt: null, undoneBy: null, at: NOW0 - 55 * M },
    { id: rid('aud'), orgId: ORG_ID, actorId: S, type: 'member.updated', entity: 'member', entityId: RJ, summary: 'Shrijeet made Raj a Manager', before: { role: 'member' }, after: { role: 'manager' }, undoable: true, undoneAt: null, undoneBy: null, at: NOW0 - 2 * D },
    { id: rid('aud'), orgId: ORG_ID, actorId: S, type: 'api_key.created', entity: 'api_key', entityId: 'key_claude0001', summary: 'Shrijeet created API key "Claude Desktop" for Claude', before: null, after: null, undoable: false, undoneAt: null, undoneBy: null, at: NOW0 - 20 * D },
  ];
}

function nextWeekday(dow: number): number {
  const d = new Date(localMidnight(NOW0, TZ) + 12 * H + tzOffsetMin(NOW0, TZ) * M).getUTCDay();
  let diff = (dow - d + 7) % 7; if (diff === 0) diff = 7; return diff;
}

function act(taskId: string, actorId: string, kind: TaskActivity['kind'], text: string, atTs = Date.now(), data: Record<string, unknown> | null = null): TaskActivity {
  const a: TaskActivity = { id: rid('act'), orgId: ORG_ID, taskId, actorId, kind, text, data, at: atTs };
  activity.push(a);
  return a;
}

if (process.env.MOCK_NEEDS_SETUP === '1') { /* empty until setup */ } else seed();

const game = createMockGame({
  orgId: ORG_ID,
  members: () => members,
  tasks: () => tasks.map(view),
  projects: () => projects,
  today0: () => today0(),
  dayKey: () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(Date.now()),
  publish: (e, ids) => publish(e, ids),
});
if (org) game.seedFeed();

// ─── derived views ───────────────────────────────────────────────────────────

function view(t: Task): TaskView {
  const now = Date.now();
  const open = t.status !== 'done' && t.status !== 'cancelled';
  const t0 = today0();
  const isOverdue = open && t.dueAt !== null && (t.dueAllDay ? t.dueAt < t0 : t.dueAt < now);
  const isDueToday = t.dueAt !== null && t.dueAt >= t0 && t.dueAt < t0 + D;
  const hasAgent = t.assigneeIds.some((id) => members.find((m) => m.id === id)?.kind === 'agent');
  const isStale = open && hasAgent && now - t.lastActivityAt > (org?.agentStaleAfterMin ?? 240) * M;
  return { ...t, isOverdue, isDueToday, isStale, commentCount: activity.filter((a) => a.taskId === t.id && (a.kind === 'comment' || a.kind === 'handoff')).length };
}

function summary(p: Project): ProjectSummary {
  const ts = tasks.filter((t) => t.projectId === p.id && t.status !== 'cancelled');
  const vs = ts.map(view);
  const done = ts.filter((t) => t.status === 'done').length;
  return {
    ...p,
    counts: { total: ts.length, open: ts.length - done, done, overdue: vs.filter((v) => v.isOverdue).length, dueThisWeek: vs.filter((v) => v.dueAt && v.dueAt < today0() + 7 * D && v.status !== 'done').length },
    progress: ts.length ? done / ts.length : 0,
  };
}

// ─── SSE ─────────────────────────────────────────────────────────────────────

const clients = new Set<{ res: http.ServerResponse; memberId: string }>();
function publish(e: LiveEvent, memberIds?: string[]): void {
  for (const c of clients) {
    if (memberIds && !memberIds.includes(c.memberId)) continue;
    c.res.write(`data: ${JSON.stringify(e)}\n\n`);
  }
}
setInterval(() => publish({ type: 'ping', at: Date.now() }), 25_000);

function notify(memberId: string, n: Omit<Notification, 'id' | 'orgId' | 'memberId' | 'readAt' | 'createdAt'>): void {
  const full: Notification = { ...n, id: rid('ntf'), orgId: ORG_ID, memberId, readAt: null, createdAt: Date.now() };
  notifications.unshift(full);
  publish({ type: 'notification', notification: full }, [memberId]);
}

function upsertTask(t: Task): TaskView {
  t.updatedAt = Date.now();
  const v = view(t);
  publish({ type: 'task.upserted', task: v });
  return v;
}

function logAudit(actorId: string, type: string, entity: AuditEvent['entity'], entityId: string, summaryText: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  const id = rid('aud');
  audit.unshift({ id, orgId: ORG_ID, actorId, type, entity, entityId, summary: summaryText, before, after, undoable: before !== null, undoneAt: null, undoneBy: null, at: Date.now() });
  return id;
}

// Simulated teammates and agents.
const liveScript: (() => void)[] = [
  () => {
    const t = tasks.find((x) => x.title === 'Draft launch blog post');
    if (!t) return;
    t.lastActivityAt = Date.now();
    const a = act(t.id, 'mem_claude001', 'handoff', pick(['Customer quotes section drafted (3 quotes). Moving on to the CTA and meta description.', 'Draft complete — 1,140 words. Ready for review by Meera.', 'Added a comparison table vs. spreadsheets. Tightened intro to 120 words.']));
    publish({ type: 'activity', activity: a });
    const m = members.find((x) => x.id === 'mem_claude001'); if (m?.agent) m.agent.lastSeenAt = Date.now();
    upsertTask(t);
  },
  () => {
    const t = tasks.find((x) => x.status !== 'done' && x.assigneeIds.includes('mem_cursor001') && x.status === 'todo') ?? tasks.find((x) => x.title === 'Ship pricing page A/B test');
    if (!t) return;
    t.status = t.status === 'todo' ? 'in_progress' : 'review';
    t.lastActivityAt = Date.now();
    publish({ type: 'activity', activity: act(t.id, 'mem_cursor001', 'status', `moved to ${t.status === 'review' ? 'Review' : 'In progress'}`) });
    const m = members.find((x) => x.id === 'mem_cursor001'); if (m?.agent) m.agent.lastSeenAt = Date.now();
    upsertTask(t);
  },
  () => {
    const item: InboxItem = {
      id: rid('inb'), orgId: ORG_ID, channel: 'whatsapp', from: '+919876501234', fromName: pick(['Neha · Orbit Foods', 'Aman · Cartwheel', 'Zoya · Lumen Health']), subject: null,
      text: pick(['Can we move our call to Thursday 4pm? Also please share the onboarding checklist.', 'Hey, quick one — is the API available on the starter plan? Need an answer before Monday.', 'Loved the demo! Can you send pricing for 25 seats?']),
      externalId: rid('ext'), memberId: null, status: 'new',
      suggestion: { title: pick(['Reply with onboarding checklist', 'Answer API availability question', 'Send pricing for 25 seats']), priority: 'medium', dueAt: at(1, 12) },
      taskId: null, receivedAt: Date.now(), createdAt: Date.now(),
    };
    inbox.unshift(item);
    publish({ type: 'inbox.new', item });
    notify('mem_shrijeet01', { kind: 'intake_new', title: 'New WhatsApp message', body: `${item.fromName}: "${item.text.slice(0, 60)}…"`, taskId: null, meetingId: null, link: '/inbox', urgent: false });
  },
  () => {
    const t = tasks.find((x) => x.status !== 'done' && x.assigneeIds.some((a) => ['mem_priya0001', 'mem_kabir0001', 'mem_ananya001', 'mem_meera0001'].includes(a)) && !x.waitingOn);
    if (!t) return;
    const before = t.status;
    t.status = 'done'; t.completedAt = Date.now(); t.completedBy = t.assigneeIds[0]!; t.lastActivityAt = Date.now();
    publish({ type: 'activity', activity: act(t.id, t.completedBy, 'status', 'completed this task') });
    logAudit(t.completedBy, 'task.completed', 'task', t.id, `${members.find((m) => m.id === t.completedBy)?.name.split(' ')[0]} completed "${t.title}"`, { status: before }, { status: 'done' });
    upsertTask(t);
    notify('mem_shrijeet01', { kind: 'task_completed', title: `${members.find((m) => m.id === t.completedBy)?.name.split(' ')[0]} completed a task`, body: t.title, taskId: t.id, meetingId: null, link: `/tasks/${t.id}`, urgent: false });
  },
];
liveScript.push(() => game.squadTick());
let liveI = 0;
if (LIVE_MS > 0) setInterval(() => { if (!org || clients.size === 0) return; liveScript[liveI++ % liveScript.length]!(); }, LIVE_MS);

function pick<T>(xs: T[]): T { return xs[Math.floor(Math.random() * xs.length)]!; }

// ─── quick-add parsing (simple regex mock of @companybrain/nlp) ──────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function parse(text: string): ParsedQuickAdd {
  const tokens: ParsedQuickAdd['tokens'] = [];
  const out: ParsedQuickAdd = { title: '', dueAt: null, dueAllDay: false, priority: null, assigneeHints: [], projectHint: null, tags: [], recurrence: null, reminderOffsets: null, tokens };
  const take = (re: RegExp, kind: ParsedQuickAdd['tokens'][number]['kind'], fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index + (m[0].length - m[0].trimStart().length);
      const end = m.index + m[0].length;
      if (tokens.some((t) => start < t.end && end > t.start)) continue;
      tokens.push({ start, end: m.index + m[0].length, kind }); fn(m);
    }
  };
  take(/(^|\s)@([\p{L}\d_.-]+)/giu, 'assignee', (m) => out.assigneeHints.push(m[2]!.toLowerCase()));
  take(/(^|\s)#([\p{L}\d_-]+)/giu, 'project', (m) => { if (!out.projectHint) out.projectHint = m[2]!.toLowerCase(); else out.tags.push(m[2]!.toLowerCase()); });
  take(/(^|\s)(!{1,3}(?:urgent|high|medium|med|low)?|!{1,3})(?=\s|$)/gi, 'priority', (m) => {
    const v = m[2]!.replace(/!/g, '').toLowerCase();
    out.priority = v === 'urgent' ? 'urgent' : v === 'high' ? 'high' : v === 'low' ? 'low' : v.startsWith('med') ? 'medium' : m[2]!.length >= 3 ? 'urgent' : m[2]!.length === 2 ? 'high' : 'high';
  });
  take(/(^|\s)(every\s+(?:day|weekday|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|daily|weekly|monthly)\b/gi, 'recurrence', (m) => {
    const v = m[2]!.toLowerCase();
    const dow = WEEKDAYS.findIndex((d) => v.includes(d));
    out.recurrence = dow >= 0 ? { freq: 'weekly', interval: 1, byWeekday: [dow] } : v.includes('weekday') ? { freq: 'weekdays', interval: 1 } : v.includes('day') || v === 'daily' ? { freq: 'daily', interval: 1 } : v.includes('week') ? { freq: 'weekly', interval: 1 } : v.includes('month') ? { freq: 'monthly', interval: 1 } : { freq: 'yearly', interval: 1 };
  });
  take(/(^|\s)(remind me\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours?)\s+before)\b/gi, 'reminder', (m) => {
    const n = Number(m[3]); out.reminderOffsets = [/^h/i.test(m[4]!) ? n * 60 : n];
  });
  let day: number | null = null; let hour: number | null = null; let minute = 0;
  take(/(^|\s)(today|tonight|tomorrow|tmrw|tmr|next week|(?:next\s+|on\s+)?(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?|in\s+\d+\s+days?)\b/gi, 'date', (m) => {
    const v = m[2]!.toLowerCase();
    if (v === 'today') day = 0; else if (v === 'tonight') { day = 0; hour = 20; } else if (/^tom|^tmr/.test(v)) day = 1; else if (v === 'next week') day = 7;
    else if (v.startsWith('in')) day = Number(v.match(/\d+/)![0]);
    else { const w = WEEKDAYS.findIndex((d) => v.replace(/^(next|on)\s+/, '').startsWith(d.slice(0, 3))); day = nextWeekday(w); }
  });
  take(/(^|\s)((?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)|at\s+(\d{1,2}):(\d{2})|noon|midnight)\b/gi, 'date', (m) => {
    const v = m[2]!.toLowerCase();
    if (v === 'noon') { hour = 12; return; } if (v === 'midnight') { hour = 23; minute = 59; return; }
    if (m[3]) { let h = Number(m[3]); const ap = m[5]!.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; hour = h; minute = Number(m[4] ?? 0); }
    else { hour = Number(m[6]); minute = Number(m[7]); }
  });
  if (day !== null || hour !== null) {
    const d = day ?? (hour !== null && at(0, hour, minute) < Date.now() ? 1 : 0);
    if (hour === null) { out.dueAt = allDayAt(d); out.dueAllDay = true; } else out.dueAt = at(d, hour, minute);
  }
  tokens.sort((a, b) => a.start - b.start);
  let title = ''; let i = 0;
  for (const t of tokens) { title += text.slice(i, t.start); i = t.end; }
  title += text.slice(i);
  out.title = title.replace(/\s+/g, ' ').trim();
  return out;
}

function resolve(p: ParsedQuickAdd): { draft: TaskDraft; unresolved: string[] } {
  const unresolved: string[] = [];
  const assigneeIds: string[] = [];
  for (const h of p.assigneeHints) {
    if (h === 'me') { assigneeIds.push('mem_shrijeet01'); continue; }
    const m = members.find((x) => x.active && (x.name.toLowerCase().startsWith(h) || x.name.toLowerCase().split(' ').some((w) => w.startsWith(h))));
    if (m) assigneeIds.push(m.id); else unresolved.push(`@${h}`);
  }
  let projectId: string | null = null;
  if (p.projectHint) {
    const pr = projects.find((x) => x.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(p.projectHint!.replace(/[^a-z0-9]/g, '')));
    if (pr) projectId = pr.id; else unresolved.push(`#${p.projectHint}`);
  }
  return {
    draft: { title: p.title, dueAt: p.dueAt, dueAllDay: p.dueAllDay, priority: p.priority ?? undefined, assigneeIds, projectId, tags: p.tags, recurrence: p.recurrence, reminderOffsets: p.reminderOffsets },
    unresolved,
  };
}

// ─── task creation ───────────────────────────────────────────────────────────

function createTask(actorId: string, input: Partial<Task> & { title: string }, channel: Task['source']['channel'] = 'manual'): Task {
  const now = Date.now();
  const t: Task = {
    id: rid('task'), orgId: ORG_ID, projectId: input.projectId ?? null, title: input.title, notes: input.notes ?? '', status: input.status ?? 'todo',
    priority: input.priority ?? 'none', assigneeIds: input.assigneeIds?.length ? input.assigneeIds : [actorId], creatorId: actorId,
    dueAt: input.dueAt ?? null, dueAllDay: input.dueAllDay ?? false, reminderOffsets: input.reminderOffsets ?? null, recurrence: input.recurrence ?? null,
    recurrenceParentId: null, waitingOn: input.waitingOn ?? null, tags: input.tags ?? [], subtasks: input.subtasks ?? [],
    source: { channel, ref: null, from: null, ...(input.source ?? {}) }, order: Math.min(0, ...tasks.map((x) => x.order)) - 1024,
    startedAt: null, completedAt: null, completedBy: null, lastActivityAt: now, createdAt: now, updatedAt: now,
  };
  tasks.push(t);
  act(t.id, actorId, 'created', 'created this task');
  logAudit(actorId, 'task.created', 'task', t.id, `${firstName(actorId)} created "${t.title}"`, null, { title: t.title });
  for (const a of t.assigneeIds) if (a !== actorId) notify(a, { kind: 'task_assigned', title: `${firstName(actorId)} assigned you a task`, body: t.title, taskId: t.id, meetingId: null, link: `/tasks/${t.id}`, urgent: false });
  return t;
}
const firstName = (id: string) => members.find((m) => m.id === id)?.name.split(' ')[0] ?? 'Someone';

// ─── briefing ────────────────────────────────────────────────────────────────

function fmtTime(ts: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(ts).replace(':00', '');
}
function briefing(me: Member): Briefing {
  const vs = tasks.map(view);
  const mine = vs.filter((t) => t.assigneeIds.includes(me.id) && t.status !== 'done' && t.status !== 'cancelled');
  const overdue = mine.filter((t) => t.isOverdue && !t.waitingOn);
  const today = mine.filter((t) => t.isDueToday && !t.isOverdue && !t.waitingOn).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  const upcoming = mine.filter((t) => !t.isOverdue && !t.isDueToday && t.dueAt && t.dueAt < today0() + 8 * D && !t.waitingOn).sort((a, b) => a.dueAt! - b.dueAt!);
  const waitingOn = mine.filter((t) => t.waitingOn);
  const t0 = today0();
  const mtgs = meetings.filter((m) => m.startAt >= t0 && m.startAt < t0 + D && (m.ownerId === null || m.ownerId === me.id || m.attendeeIds.includes(me.id))).sort((a, b) => a.startAt - b.startAt);
  const h = localHour(Date.now(), me.timezone);
  const first = me.name.split(' ')[0];
  const greeting = `${h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${first}`;
  const isMgr = ['owner', 'admin', 'manager'].includes(me.role);
  const team: TeamPulse[] = isMgr ? members.filter((m) => m.kind === 'human' && m.active).map((m) => {
    const theirs = vs.filter((t) => t.assigneeIds.includes(m.id));
    const open = theirs.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    return {
      member: m, open: open.length, overdue: open.filter((t) => t.isOverdue).length, dueToday: open.filter((t) => t.isDueToday).length,
      doneToday: theirs.filter((t) => t.completedAt && t.completedAt >= t0).length, doneThisWeek: theirs.filter((t) => t.completedAt && t.completedAt >= t0 - 6 * D).length,
      inProgress: open.filter((t) => t.status === 'in_progress'),
    };
  }) : [];
  const agents = members.filter((m) => m.kind === 'agent' && m.active).map((m) => {
    const theirs = vs.filter((t) => t.assigneeIds.includes(m.id) && t.status !== 'done' && t.status !== 'cancelled');
    return { member: m, inProgress: theirs.filter((t) => t.status === 'in_progress' || t.status === 'review'), stale: theirs.filter((t) => t.isStale) };
  });
  const tac = me.prefs.theme !== 'classic';
  const W = tac ? { task: 'mission', tasks: 'missions', overdue: 'critical', meeting: 'briefing', meetings: 'briefings' } : { task: 'task', tasks: 'tasks', overdue: 'overdue', meeting: 'meeting', meetings: 'meetings' };
  const n = (k: number, one: string, many: string) => (k === 1 ? `one ${one}` : `${k} ${many}`);
  const parts: string[] = [];
  parts.push(tac ? `Incoming transmission. ${greeting}, here is your situation report.` : `${greeting}.`);
  parts.push(`You have ${today.length ? n(today.length, W.task, W.tasks) : `no ${W.tasks}`} due today${overdue.length ? `, and ${overdue.length === 1 ? `one is ${W.overdue}` : `${overdue.length} are ${W.overdue}`}, starting with “${overdue[0]!.title}”` : ''}.`);
  if (mtgs.length) parts.push(`You have ${n(mtgs.length, W.meeting, W.meetings)}: ${mtgs.slice(0, 2).map((m) => `${m.title} at ${fmtTime(m.startAt)}`).join(', then ')}.`);
  if (waitingOn.length) parts.push(`You're waiting on ${waitingOn.slice(0, 2).map((t) => t.waitingOn!.name.split(' · ')[0]).join(' and ')}.`);
  const busiest = team.filter((p) => p.member.id !== me.id).sort((a, b) => b.doneThisWeek - a.doneThisWeek)[0];
  if (busiest && busiest.doneThisWeek) parts.push(`${busiest.member.name.split(' ')[0]} closed ${n(busiest.doneThisWeek, W.task, W.tasks)} this week.`);
  const working = agents.find((a) => a.inProgress.length && !a.stale.length);
  if (working) parts.push(`${working.member.name} is working on “${working.inProgress[0]!.title}”.`);
  const stale = agents.find((a) => a.stale.length);
  if (stale) parts.push(`Heads up: ${stale.member.name} has gone quiet on “${stale.stale[0]!.title}”.`);
  parts.push(overdue.length ? (tac ? `Recommend you clear the critical ${W.task} first. Over and out.` : `Let's start with the overdue one.`) : (tac ? 'All clear. Over and out.' : 'Have a great day.'));
  const headline = overdue.length ? `${overdue.length} overdue · ${today.length} due today · ${mtgs.length} meeting${mtgs.length === 1 ? '' : 's'}`
    : today.length ? `${today.length} due today · ${mtgs.length} meeting${mtgs.length === 1 ? '' : 's'} · you're on track`
      : `A clear day — ${mtgs.length} meeting${mtgs.length === 1 ? '' : 's'}`;
  return {
    memberId: me.id, generatedAt: Date.now(), greeting, spoken: parts.join(' '), headline,
    myTasks: { overdue, today, upcoming }, meetings: mtgs, waitingOn, team, agents,
    unreadNotifications: notifications.filter((n) => n.memberId === me.id && !n.readAt).length,
    inboxNew: inbox.filter((i) => i.status === 'new').length,
  };
}

// ─── reports ─────────────────────────────────────────────────────────────────

function report(days: number): Report {
  let seedN = 7;
  const rnd = () => { seedN = (seedN * 9301 + 49297) % 233280; return seedN / 233280; };
  const daily: Report['daily'] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today0() - i * D + 12 * H);
    const wk = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const base = wk ? 1 : 5 + Math.round((days - i) / days * 3);
    daily.push({ date: d.toISOString().slice(0, 10), created: Math.max(0, Math.round(base + rnd() * 4 - 1)), completed: Math.max(0, Math.round(base + rnd() * 4 - 1.5)) });
  }
  const created = daily.reduce((s, d) => s + d.created, 0);
  const completed = daily.reduce((s, d) => s + d.completed, 0);
  const byMember = members.filter((m) => m.active).map((m, i) => ({ memberId: m.id, completed: Math.round(completed * [0.16, 0.14, 0.15, 0.1, 0.09, 0.11, 0.12, 0.05, 0.08][i % 9]!), overdue: tasks.map(view).filter((t) => t.isOverdue && t.assigneeIds.includes(m.id)).length, onTimeRate: 0.62 + ((i * 37) % 35) / 100 }));
  const agentDone = byMember.filter((b) => members.find((m) => m.id === b.memberId)?.kind === 'agent').reduce((s, b) => s + b.completed, 0);
  return {
    windowDays: days, generatedAt: Date.now(),
    totals: { created, completed, overdueNow: tasks.map(view).filter((t) => t.isOverdue).length, onTimeRate: 0.84, avgCycleHours: 31.5 },
    daily, byMember,
    byProject: [...projects.map((p) => ({ projectId: p.id, open: summary(p).counts.open, completed: Math.round(completed * 0.18) })), { projectId: null, open: tasks.filter((t) => !t.projectId && t.status !== 'done').length, completed: Math.round(completed * 0.2) }],
    humansVsAgents: { humans: completed - agentDone, agents: agentDone },
  };
}

// ─── HTTP plumbing ───────────────────────────────────────────────────────────

class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
type Ctx = { req: http.IncomingMessage; res: http.ServerResponse; url: URL; params: Record<string, string>; body: any; me: Member | null };
type Handler = (c: Ctx) => unknown | Promise<unknown>;
const routes: { method: string; re: RegExp; keys: string[]; auth: boolean; h: Handler }[] = [];
function route(method: string, path: string, h: Handler, auth = true): void {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, auth, h });
}
const need = <T>(v: T | undefined | null, what = 'Not found'): T => { if (v === undefined || v === null) throw new HttpError(404, 'not_found', what); return v; };
const isMgr = (m: Member) => ['owner', 'admin', 'manager'].includes(m.role);
const isAdmin = (m: Member) => ['owner', 'admin'].includes(m.role);
const forbid = (ok: boolean) => { if (!ok) throw new HttpError(403, 'forbidden', 'You do not have permission to do that.'); };
function cookie(req: http.IncomingMessage, name: string): string | null {
  const m = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function startSession(res: http.ServerResponse, memberId: string): void {
  const token = randomBytes(24).toString('hex');
  sessions.set(token, memberId);
  res.setHeader('Set-Cookie', `cb_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`);
}

// ─── routes: public ──────────────────────────────────────────────────────────

route('GET', '/health', () => ({ ok: true, version: '2.0.0-mock', uptime: process.uptime() }), false);
route('GET', '/api/auth/state', (c) => ({ needsSetup: !org, authenticated: !!c.me, member: c.me ?? undefined, org: c.me ? org : undefined }), false);
route('POST', '/api/auth/setup', (c) => {
  if (org) throw new HttpError(409, 'conflict', 'Already set up');
  const { orgName, name, email, password, timezone } = c.body;
  if (!orgName || !name || !email || !password || String(password).length < 8) throw new HttpError(400, 'bad_request', 'Please fill in every field (password ≥ 8 characters).');
  org = { id: ORG_ID, name: orgName, timezone, logo: null, workdayStart: 9, workdayEnd: 18, defaultReminderOffsets: [1440, 60, 0], escalateAfterMin: 1440, agentStaleAfterMin: 240, intakeAutoAck: true, currency: 'USD', createdAt: Date.now(), updatedAt: Date.now() };
  const m = mkMember(rid('mem'), name, 'owner', { email, timezone, createdAt: Date.now() });
  members.push(m); passwords.set(m.id, password);
  startSession(c.res, m.id);
  return { member: m };
}, false);
route('POST', '/api/auth/login', (c) => {
  const id = String(c.body.identifier ?? '').toLowerCase().trim();
  const m = members.find((x) => x.kind === 'human' && x.active && (x.email === id || x.phone === id));
  if (!m || passwords.get(m.id) !== c.body.password) throw new HttpError(401, 'unauthorized', 'That email and password don’t match.');
  startSession(c.res, m.id);
  return { member: m };
}, false);
route('POST', '/api/auth/logout', (c) => {
  const t = cookie(c.req, 'cb_session'); if (t) sessions.delete(t);
  c.res.setHeader('Set-Cookie', 'cb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  return { ok: true };
}, false);

// ─── routes: me & briefing ───────────────────────────────────────────────────

route('GET', '/api/me', (c) => c.me);
route('PATCH', '/api/me', (c) => {
  const me = c.me!;
  const { name, phone, title, timezone, color, avatarUrl, prefs } = c.body;
  Object.assign(me, Object.fromEntries(Object.entries({ name, phone, title, timezone, color, avatarUrl }).filter(([, v]) => v !== undefined)));
  if (name) me.initials = initials(name);
  if (prefs) me.prefs = { ...me.prefs, ...prefs };
  me.updatedAt = Date.now();
  publish({ type: 'member.upserted', member: me });
  return me;
});
route('POST', '/api/me/password', (c) => {
  if (passwords.get(c.me!.id) !== c.body.current) throw new HttpError(400, 'bad_request', 'Current password is incorrect.');
  if (String(c.body.next ?? '').length < 8) throw new HttpError(400, 'bad_request', 'New password must be at least 8 characters.');
  passwords.set(c.me!.id, c.body.next); return { ok: true };
});
route('GET', '/api/briefing', (c) => briefing(c.me!));
route('POST', '/api/briefing/audio', (c) => {
  if (process.env.MOCK_TTS !== '1') { c.res.writeHead(204); c.res.end(); return undefined; }
  // 1.5 s of a soft sine "ding" as a stand-in for real TTS audio.
  const rate = 16000, secs = 1.5, n = rate * secs; const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 440) * 6000 * Math.exp(-i / rate * 2)), 44 + i * 2);
  c.res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': buf.length }); c.res.end(buf); return undefined;
});

// ─── routes: tasks ───────────────────────────────────────────────────────────

route('GET', '/api/tasks', (c) => {
  const q = c.url.searchParams; const me = c.me!;
  let vs = tasks.map(view);
  const assignee = q.get('assigneeId');
  if (assignee === 'me') vs = vs.filter((t) => t.assigneeIds.includes(me.id));
  else if (assignee === 'unassigned') vs = vs.filter((t) => t.assigneeIds.length === 0);
  else if (assignee) vs = vs.filter((t) => t.assigneeIds.includes(assignee));
  const pid = q.get('projectId');
  if (pid === 'none') vs = vs.filter((t) => !t.projectId); else if (pid) vs = vs.filter((t) => t.projectId === pid);
  const st = q.get('status'); if (st) { const ss = st.split(','); vs = vs.filter((t) => ss.includes(t.status)); }
  const tag = q.get('tag'); if (tag) vs = vs.filter((t) => t.tags.includes(tag));
  const pr = q.get('priority'); if (pr) { const ps = pr.split(','); vs = vs.filter((t) => ps.includes(t.priority)); }
  const since = Number(q.get('completedSince') ?? NaN);
  if (Number.isFinite(since)) vs = vs.filter((t) => (t.status !== 'done' && t.status !== 'cancelled') || (t.completedAt ?? t.updatedAt) >= since);
  const search = q.get('search')?.toLowerCase(); if (search) vs = vs.filter((t) => t.title.toLowerCase().includes(search));
  const v = q.get('view');
  const includeDone = q.get('includeDone') === 'true' || q.get('includeDone') === '1' || v === 'done' || !!st;
  if (!includeDone) vs = vs.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  if (v === 'today') vs = vs.filter((t) => t.isDueToday || t.isOverdue);
  if (v === 'overdue') vs = vs.filter((t) => t.isOverdue);
  if (v === 'waiting') vs = vs.filter((t) => t.waitingOn);
  if (v === 'done') vs = vs.filter((t) => t.status === 'done');
  if (v === 'agents') vs = vs.filter((t) => t.assigneeIds.some((a) => members.find((m) => m.id === a)?.kind === 'agent'));
  if (v === 'upcoming') vs = vs.filter((t) => t.dueAt && t.dueAt >= today0() + D);
  return vs.sort((a, b) => a.order - b.order);
});
route('POST', '/api/tasks', (c) => {
  if (!c.body.title?.trim()) throw new HttpError(400, 'bad_request', 'Title is required');
  const t = createTask(c.me!.id, { ...c.body, subtasks: (c.body.subtasks ?? []).map((s: { title: string }) => ({ id: rid('sub'), title: s.title, done: false, doneAt: null, doneBy: null })) }, c.body.source?.channel ?? 'manual');
  return upsertTask(t);
});
route('POST', '/api/tasks/preview', (c) => { const parsed = parse(String(c.body.text ?? '')); return { parsed, ...resolve(parsed) }; });
route('POST', '/api/tasks/quick', (c) => {
  const parsed = parse(String(c.body.text ?? ''));
  const { draft } = resolve(parsed);
  if (!draft.title) throw new HttpError(400, 'bad_request', 'Give the task a title');
  const d = c.body.defaults ?? {};
  const t = createTask(c.me!.id, { ...d, ...Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length))), title: draft.title } as Partial<Task> & { title: string }, 'quick_add');
  const out = upsertTask(t); game.onCreate(c.me!.id, out); return out;
});
route('POST', '/api/tasks/bulk', (c) => {
  const ok: string[] = []; const failed: { id: string; error: string }[] = [];
  for (const id of c.body.ids as string[]) {
    const t = tasks.find((x) => x.id === id); if (!t) { failed.push({ id, error: 'not found' }); continue; }
    const op = c.body.op;
    if (op.kind === 'complete') { t.status = 'done'; t.completedAt = Date.now(); t.completedBy = c.me!.id; }
    else if (op.kind === 'delete') { tasks = tasks.filter((x) => x.id !== id); publish({ type: 'task.deleted', taskId: id }); ok.push(id); continue; }
    else if (op.kind === 'assign') t.assigneeIds = Array.isArray(op.value) ? op.value : [op.value];
    else if (op.kind === 'move') t.projectId = op.value ?? null;
    else if (op.kind === 'status') { t.status = op.value; if (op.value === 'done') { t.completedAt = Date.now(); t.completedBy = c.me!.id; } }
    t.lastActivityAt = Date.now(); upsertTask(t); ok.push(id);
  }
  logAudit(c.me!.id, `task.bulk_${c.body.op.kind}`, 'task', ok[0] ?? '', `${firstName(c.me!.id)} bulk-${c.body.op.kind === 'delete' ? 'deleted' : 'updated'} ${ok.length} tasks`, null, null);
  return { ok, failed };
});
const getTask = (id: string) => need(tasks.find((t) => t.id === id), 'Task not found');
route('GET', '/api/tasks/:id', (c) => view(getTask(c.params.id!)));
route('PATCH', '/api/tasks/:id', (c) => {
  const t = getTask(c.params.id!); const me = c.me!;
  const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c.body)) {
    if (v === undefined) continue;
    before[k] = (t as any)[k]; after[k] = v;
    if (k === 'waitingOn') t.waitingOn = v ? { ...(v as object), since: t.waitingOn?.since ?? Date.now(), lastNudgedAt: t.waitingOn?.lastNudgedAt ?? null } as Task['waitingOn'] : null;
    else (t as any)[k] = v;
  }
  if (c.body.status) {
    if (c.body.status === 'done') { t.completedAt = Date.now(); t.completedBy = me.id; } else { t.completedAt = null; t.completedBy = null; }
    if (c.body.status === 'in_progress' && !t.startedAt) t.startedAt = Date.now();
    act(t.id, me.id, 'status', `moved to ${({ todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', review: 'Review', done: 'Done', cancelled: 'Cancelled' } as const)[c.body.status as TaskStatus]}`);
  } else if (c.body.dueAt !== undefined) act(t.id, me.id, 'due_changed', c.body.dueAt ? 'changed the due date' : 'removed the due date');
  else if (c.body.priority) act(t.id, me.id, 'priority', `set priority to ${c.body.priority}`);
  else if (c.body.assigneeIds) act(t.id, me.id, 'assigned', 'changed assignees');
  else if (c.body.order === undefined) act(t.id, me.id, 'edited', `edited ${Object.keys(c.body).join(', ')}`);
  t.lastActivityAt = Date.now();
  if (c.body.order === undefined) logAudit(me.id, 'task.updated', 'task', t.id, `${firstName(me.id)} updated "${t.title}" (${Object.keys(after).join(', ')})`, before, after);
  return upsertTask(t);
});
route('DELETE', '/api/tasks/:id', (c) => {
  const t = getTask(c.params.id!); tasks = tasks.filter((x) => x.id !== t.id);
  const auditId = logAudit(c.me!.id, 'task.deleted', 'task', t.id, `${firstName(c.me!.id)} deleted "${t.title}"`, t as unknown as Record<string, unknown>, null);
  publish({ type: 'task.deleted', taskId: t.id }); return { auditId };
});
route('POST', '/api/tasks/:id/complete', (c) => {
  const t = getTask(c.params.id!); const before = t.status; const wasOverdue = view(t).isOverdue;
  if (before === 'done') return view(t);
  t.status = 'done'; t.completedAt = Date.now(); t.completedBy = c.me!.id; t.lastActivityAt = Date.now();
  act(t.id, c.me!.id, 'status', 'completed this task');
  logAudit(c.me!.id, 'task.completed', 'task', t.id, `${firstName(c.me!.id)} completed "${t.title}"`, { status: before }, { status: 'done' });
  if (t.recurrence && t.dueAt) {
    const step = t.recurrence.freq === 'daily' ? D : t.recurrence.freq === 'weekdays' ? D : t.recurrence.freq === 'weekly' ? 7 * D : 30 * D;
    let next = t.dueAt + step; while (t.recurrence.freq === 'weekdays' && [0, 6].includes(new Date(next + tzOffsetMin(next, TZ) * M).getUTCDay())) next += D;
    const n = createTask(t.creatorId, { ...t, id: undefined as never, status: 'todo', dueAt: next, subtasks: [] } as Partial<Task> & { title: string }, 'recurring');
    n.recurrenceParentId = t.id; upsertTask(n);
  }
  const out = upsertTask(t);
  game.onComplete(c.me!.id, out, wasOverdue);
  return out;
});
route('POST', '/api/tasks/:id/reopen', (c) => {
  const t = getTask(c.params.id!); t.status = 'todo'; t.completedAt = null; t.completedBy = null; t.lastActivityAt = Date.now();
  act(t.id, c.me!.id, 'status', 'reopened this task'); const out = upsertTask(t); game.onReopen(c.me!.id, out); return out;
});
route('POST', '/api/tasks/:id/nudge', (c) => {
  const t = getTask(c.params.id!); if (!t.waitingOn) throw new HttpError(400, 'bad_request', 'This task is not waiting on anyone.');
  t.waitingOn.lastNudgedAt = Date.now(); t.lastActivityAt = Date.now();
  publish({ type: 'activity', activity: act(t.id, c.me!.id, 'nudge_sent', `Nudged ${t.waitingOn.name} by ${t.waitingOn.channel === 'whatsapp' ? 'WhatsApp' : t.waitingOn.channel}`) });
  return upsertTask(t);
});
route('POST', '/api/tasks/:id/subtasks', (c) => {
  const t = getTask(c.params.id!); t.subtasks.push({ id: rid('sub'), title: String(c.body.title), done: false, doneAt: null, doneBy: null });
  act(t.id, c.me!.id, 'subtask', `added subtask "${c.body.title}"`); return upsertTask(t);
});
route('PATCH', '/api/tasks/:id/subtasks/:subId', (c) => {
  const t = getTask(c.params.id!); const s = need(t.subtasks.find((x) => x.id === c.params.subId));
  if (c.body.title !== undefined) s.title = c.body.title;
  if (c.body.done !== undefined) { s.done = c.body.done; s.doneAt = c.body.done ? Date.now() : null; s.doneBy = c.body.done ? c.me!.id : null; }
  const out = upsertTask(t); if (c.body.done === true) game.onSubtask(c.me!.id, out); return out;
});
route('PUT', '/api/tasks/:id/subtasks/order', (c) => {
  const t = getTask(c.params.id!); const ids: string[] = Array.isArray(c.body.ids) ? c.body.ids : [];
  const byId = new Map(t.subtasks.map((s) => [s.id, s]));
  if (ids.length !== byId.size || ids.some((x) => !byId.has(x))) throw new HttpError(400, 'bad_request', 'ids must list exactly the current subtasks of this task');
  t.subtasks = ids.map((x) => byId.get(x)!); return upsertTask(t);
});
route('DELETE', '/api/tasks/:id/subtasks/:subId', (c) => { const t = getTask(c.params.id!); t.subtasks = t.subtasks.filter((s) => s.id !== c.params.subId); return upsertTask(t); });
route('GET', '/api/tasks/:id/activity', (c) => { getTask(c.params.id!); return activity.filter((a) => a.taskId === c.params.id).sort((a, b) => a.at - b.at); });
route('POST', '/api/tasks/:id/comments', (c) => {
  const t = getTask(c.params.id!); const text = String(c.body.text ?? '').trim(); if (!text) throw new HttpError(400, 'bad_request', 'Say something first');
  const a = act(t.id, c.me!.id, c.body.kind === 'handoff' ? 'handoff' : 'comment', text);
  t.lastActivityAt = Date.now(); publish({ type: 'activity', activity: a }); upsertTask(t);
  for (const m of members) if (m.id !== c.me!.id && text.toLowerCase().includes('@' + m.name.split(' ')[0]!.toLowerCase()))
    notify(m.id, { kind: 'task_mention', title: `${firstName(c.me!.id)} mentioned you`, body: `"${text.slice(0, 80)}"`, taskId: t.id, meetingId: null, link: `/tasks/${t.id}`, urgent: false });
  return a;
});

// ─── routes: projects ────────────────────────────────────────────────────────

route('GET', '/api/projects', (c) => projects.filter((p) => c.url.searchParams.get('includeArchived') === '1' || p.status !== 'archived').map(summary));
route('POST', '/api/projects', (c) => {
  forbid(isMgr(c.me!) || c.me!.role === 'member');
  if (!c.body.name?.trim()) throw new HttpError(400, 'bad_request', 'Name is required');
  const p: Project = { id: rid('prj'), orgId: ORG_ID, name: c.body.name, emoji: c.body.emoji ?? '📁', color: c.body.color ?? '#3b6ff6', description: c.body.description ?? '', status: 'active', leadId: c.body.leadId ?? c.me!.id, memberIds: c.body.memberIds ?? [c.me!.id], dueAt: c.body.dueAt ?? null, createdBy: c.me!.id, createdAt: Date.now(), updatedAt: Date.now() };
  projects.push(p); logAudit(c.me!.id, 'project.created', 'project', p.id, `${firstName(c.me!.id)} created project "${p.name}"`, null, { name: p.name });
  publish({ type: 'project.upserted', project: p }); return summary(p);
});
route('GET', '/api/projects/:id', (c) => summary(need(projects.find((p) => p.id === c.params.id))));
route('PATCH', '/api/projects/:id', (c) => {
  const p = need(projects.find((x) => x.id === c.params.id)); const before = { ...p };
  Object.assign(p, c.body, { updatedAt: Date.now() });
  logAudit(c.me!.id, 'project.updated', 'project', p.id, `${firstName(c.me!.id)} updated project "${p.name}"`, before as unknown as Record<string, unknown>, c.body);
  publish({ type: 'project.upserted', project: p }); return summary(p);
});
route('DELETE', '/api/projects/:id', (c) => { projects = projects.filter((p) => p.id !== c.params.id); c.res.writeHead(204); c.res.end(); return undefined; });

// ─── routes: members & keys & org ────────────────────────────────────────────

route('GET', '/api/members', (c) => {
  const q = c.url.searchParams; let ms = members;
  if (q.get('includeInactive') !== '1') ms = ms.filter((m) => m.active);
  const kind = q.get('kind'); if (kind) ms = ms.filter((m) => m.kind === kind);
  return ms;
});
route('POST', '/api/members', (c) => {
  const b = c.body; forbid(isAdmin(c.me!) || (b.kind === 'agent' && isMgr(c.me!)));
  if (!b.name?.trim()) throw new HttpError(400, 'bad_request', 'Name is required');
  if (b.kind === 'human' && (!b.email || String(b.password ?? '').length < 8)) throw new HttpError(400, 'bad_request', 'Email and a password (≥ 8 chars) are required');
  const palette = ['#3b6ff6', '#e0559a', '#0ea5a4', '#f59e0b', '#16a34a', '#8b5cf6', '#ef4444', '#06b6d4'];
  const m = mkMember(rid('mem'), b.name, b.kind === 'agent' ? 'agent' : b.role, {
    kind: b.kind, email: b.email ?? null, phone: b.phone ?? null, title: b.title ?? null, timezone: b.timezone ?? TZ, color: palette[members.length % palette.length]!, createdAt: Date.now(),
    agent: b.kind === 'agent' ? { provider: b.agent?.provider ?? 'custom', description: b.agent?.description ?? '', lastSeenAt: null, supervisorId: b.agent?.supervisorId ?? c.me!.id } : null,
  });
  members.push(m); if (b.password) passwords.set(m.id, b.password);
  logAudit(c.me!.id, 'member.created', 'member', m.id, `${firstName(c.me!.id)} added ${m.name}`, null, { name: m.name });
  publish({ type: 'member.upserted', member: m }); return m;
});
route('GET', '/api/members/:id', (c) => need(members.find((m) => m.id === c.params.id)));
route('PATCH', '/api/members/:id', (c) => {
  const m = need(members.find((x) => x.id === c.params.id)); forbid(isAdmin(c.me!) || (m.kind === 'agent' && isMgr(c.me!)) || m.id === c.me!.id);
  const before = { role: m.role, active: m.active, name: m.name };
  const { prefs, agent, ...rest } = c.body;
  Object.assign(m, rest, { updatedAt: Date.now() });
  if (rest.name) m.initials = initials(rest.name);
  if (prefs) m.prefs = { ...m.prefs, ...prefs };
  if (agent && m.agent) m.agent = { ...m.agent, ...agent };
  logAudit(c.me!.id, 'member.updated', 'member', m.id, `${firstName(c.me!.id)} updated ${m.name}${rest.role ? ` (role → ${rest.role})` : ''}`, before, rest);
  publish({ type: 'member.upserted', member: m }); return m;
});
route('DELETE', '/api/members/:id', (c) => {
  forbid(isAdmin(c.me!)); const m = need(members.find((x) => x.id === c.params.id)); m.active = false;
  for (const k of keys) if (k.memberId === m.id && !k.revokedAt) k.revokedAt = Date.now();
  logAudit(c.me!.id, 'member.deactivated', 'member', m.id, `${firstName(c.me!.id)} deactivated ${m.name}`, { active: true }, { active: false });
  c.res.writeHead(204); c.res.end(); return undefined;
});
route('POST', '/api/members/:id/password', (c) => { forbid(isAdmin(c.me!)); passwords.set(c.params.id!, c.body.password); return { ok: true }; });
route('GET', '/api/keys', (c) => { const mid = c.url.searchParams.get('memberId'); return keys.filter((k) => (!mid || k.memberId === mid) && (isMgr(c.me!) || k.memberId === c.me!.id)); });
route('POST', '/api/keys', (c) => {
  const target = need(members.find((m) => m.id === c.body.memberId)); forbid(target.id === c.me!.id || (target.kind === 'agent' && isMgr(c.me!)));
  const raw = 'cb_live_' + randomBytes(24).toString('base64url');
  const k: ApiKey = { id: rid('key'), orgId: ORG_ID, memberId: target.id, name: c.body.name || 'API key', prefix: raw.slice(0, 12), scopes: c.body.scopes?.length ? c.body.scopes : ['read'], createdBy: c.me!.id, createdAt: Date.now(), lastUsedAt: null, expiresAt: c.body.expiresAt ?? null, revokedAt: null };
  keys.push(k); logAudit(c.me!.id, 'api_key.created', 'api_key', k.id, `${firstName(c.me!.id)} created API key "${k.name}" for ${target.name}`, null, null);
  return { key: k, raw };
});
route('DELETE', '/api/keys/:id', (c) => { const k = need(keys.find((x) => x.id === c.params.id)); k.revokedAt = Date.now(); c.res.writeHead(204); c.res.end(); return undefined; });
route('GET', '/api/org', () => org);
route('PATCH', '/api/org', (c) => { forbid(isAdmin(c.me!)); const before = { ...org! }; Object.assign(org!, c.body, { updatedAt: Date.now() }); logAudit(c.me!.id, 'org.updated', 'org', org!.id, `${firstName(c.me!.id)} updated organization settings`, before as unknown as Record<string, unknown>, c.body); return org; });

// ─── routes: meetings & feeds ────────────────────────────────────────────────

route('GET', '/api/meetings', (c) => {
  const q = c.url.searchParams; const from = Number(q.get('from') ?? 0); const to = Number(q.get('to') ?? Number.MAX_SAFE_INTEGER);
  return meetings.filter((m) => m.startAt < to && m.endAt > from).sort((a, b) => a.startAt - b.startAt);
});
route('POST', '/api/meetings', (c) => {
  const b = c.body; if (!b.title || !b.startAt || !b.endAt) throw new HttpError(400, 'bad_request', 'Title, start and end are required');
  const m: Meeting = { id: rid('mtg'), orgId: ORG_ID, ownerId: c.me!.id, title: b.title, startAt: b.startAt, endAt: b.endAt, allDay: !!b.allDay, location: b.location ?? null, url: b.url ?? null, attendeeIds: b.attendeeIds ?? [c.me!.id], notes: b.notes ?? '', source: 'manual', externalId: null, feedId: null, createdAt: Date.now(), updatedAt: Date.now() };
  meetings.push(m); publish({ type: 'meeting.upserted', meeting: m }); return m;
});
route('PATCH', '/api/meetings/:id', (c) => { const m = need(meetings.find((x) => x.id === c.params.id)); Object.assign(m, c.body, { updatedAt: Date.now() }); publish({ type: 'meeting.upserted', meeting: m }); return m; });
route('DELETE', '/api/meetings/:id', (c) => { meetings = meetings.filter((m) => m.id !== c.params.id); c.res.writeHead(204); c.res.end(); return undefined; });
route('GET', '/api/calendar-feeds', (c) => feeds.filter((f) => f.memberId === c.me!.id));
route('POST', '/api/calendar-feeds', (c) => {
  const url = String(c.body.url ?? ''); if (!/^https?:\/\//.test(url)) throw new HttpError(400, 'bad_request', 'That doesn’t look like a calendar URL.');
  const f: CalendarFeed = { id: rid('feed'), orgId: ORG_ID, memberId: c.me!.id, name: c.body.name || 'Calendar', urlMasked: url.replace(/^(https?:\/\/[^/]+\/).*(\/[^/]*)$/, '$1…$2'), lastSyncAt: Date.now(), lastError: null, createdAt: Date.now() };
  feeds.push(f); return f;
});
route('DELETE', '/api/calendar-feeds/:id', (c) => { feeds = feeds.filter((f) => f.id !== c.params.id); c.res.writeHead(204); c.res.end(); return undefined; });
route('POST', '/api/calendar-feeds/:id/sync', (c) => { const f = need(feeds.find((x) => x.id === c.params.id)); f.lastSyncAt = Date.now(); return f; });

// ─── routes: notifications & push ────────────────────────────────────────────

route('GET', '/api/notifications', (c) => {
  const q = c.url.searchParams; let ns = notifications.filter((n) => n.memberId === c.me!.id);
  if (q.get('unread') === '1') ns = ns.filter((n) => !n.readAt);
  return ns.slice(0, Number(q.get('limit') ?? 50));
});
route('GET', '/api/notifications/count', (c) => ({ unread: notifications.filter((n) => n.memberId === c.me!.id && !n.readAt).length }));
route('POST', '/api/notifications/read', (c) => {
  for (const n of notifications) if (n.memberId === c.me!.id && !n.readAt && (c.body.ids === 'all' || c.body.ids.includes(n.id))) n.readAt = Date.now();
  return { ok: true };
});
route('GET', '/api/push/vapid', () => ({ publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' }));
route('POST', '/api/push/subscribe', () => ({ ok: true }));
route('POST', '/api/push/unsubscribe', () => ({ ok: true }));

// ─── routes: inbox, leads, reports, audit, search ────────────────────────────

route('GET', '/api/inbox', (c) => { const s = c.url.searchParams.get('status'); return inbox.filter((i) => !s || i.status === s).sort((a, b) => b.receivedAt - a.receivedAt); });
route('POST', '/api/inbox/:id/convert', (c) => {
  const item = need(inbox.find((i) => i.id === c.params.id)); const draft = { ...(item.suggestion ?? { title: item.subject ?? item.text.slice(0, 80) }), ...c.body };
  const t = createTask(c.me!.id, { ...draft, source: { channel: item.channel, ref: item.externalId, from: item.from } } as Partial<Task> & { title: string }, item.channel);
  item.status = 'converted'; item.taskId = t.id; return upsertTask(t);
});
route('POST', '/api/inbox/:id/dismiss', (c) => { const item = need(inbox.find((i) => i.id === c.params.id)); item.status = 'dismissed'; return { ok: true }; });
route('GET', '/api/leads', () => leads);
route('POST', '/api/leads', (c) => {
  if (!c.body.name?.trim()) throw new HttpError(400, 'bad_request', 'Name is required');
  const l: Lead = { id: rid('lead'), orgId: ORG_ID, name: c.body.name, company: c.body.company ?? '', email: c.body.email ?? '', phone: c.body.phone ?? '', stage: c.body.stage ?? 'new', value: c.body.value ?? null, notes: c.body.notes ?? '', ownerId: c.body.ownerId ?? c.me!.id, source: 'manual', createdBy: c.me!.id, createdAt: Date.now(), updatedAt: Date.now() };
  leads.push(l); return l;
});
route('PATCH', '/api/leads/:id', (c) => { const l = need(leads.find((x) => x.id === c.params.id)); Object.assign(l, c.body, { updatedAt: Date.now() }); return l; });
route('DELETE', '/api/leads/:id', (c) => { leads = leads.filter((l) => l.id !== c.params.id); c.res.writeHead(204); c.res.end(); return undefined; });
route('GET', '/api/reports', (c) => report(Math.min(90, Math.max(7, Number(c.url.searchParams.get('days') ?? 30)))));
route('GET', '/api/audit', (c) => { const q = c.url.searchParams; return audit.filter((a) => (!q.get('entity') || a.entity === q.get('entity')) && (!q.get('entityId') || a.entityId === q.get('entityId'))).slice(0, Number(q.get('limit') ?? 100)); });
route('POST', '/api/audit/:id/undo', (c) => {
  const e = need(audit.find((a) => a.id === c.params.id)); if (!e.undoable || e.undoneAt) throw new HttpError(409, 'conflict', 'This change can’t be undone.');
  if (e.entity === 'task' && e.before) { const t = tasks.find((x) => x.id === e.entityId); if (t) { Object.assign(t, e.before); if (e.before.status && e.before.status !== 'done') { t.completedAt = null; t.completedBy = null; } upsertTask(t); } else if (e.type === 'task.deleted') { tasks.push(e.before as unknown as Task); upsertTask(e.before as unknown as Task); } }
  if (e.entity === 'member' && e.before) { const m = members.find((x) => x.id === e.entityId); if (m) Object.assign(m, e.before); }
  e.undoneAt = Date.now(); e.undoneBy = c.me!.id; return e;
});
route('GET', '/api/search', (c) => {
  const q = (c.url.searchParams.get('q') ?? '').toLowerCase().trim();
  if (!q) return { tasks: [], projects: [], members: [] };
  return {
    tasks: tasks.filter((t) => t.title.toLowerCase().includes(q) || t.tags.some((g) => g.includes(q))).slice(0, 8).map(view),
    projects: projects.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5),
    members: members.filter((m) => m.active && m.name.toLowerCase().includes(q)).slice(0, 5),
  };
});

// ─── routes: game ────────────────────────────────────────────────────────────

route('GET', '/api/game/hud', (c) => game.hud(c.me!));
route('GET', '/api/game/profile', (c) => game.profile(c.url.searchParams.get('memberId') ?? c.me!.id));
route('GET', '/api/game/leaderboard', (c) => game.leaderboard((c.url.searchParams.get('period') ?? 'week') as 'week'));
route('GET', '/api/game/achievements', (c) => game.achievements(c.url.searchParams.get('memberId') ?? c.me!.id));
route('GET', '/api/game/challenges', (c) => game.challenges(c.me!.id));
route('GET', '/api/game/crates', (c) => game.crates(c.me!.id));
route('POST', '/api/game/crates/:id/open', (c) => { try { return game.openCrate(c.me!.id, c.params.id!); } catch { throw new HttpError(404, 'not_found', 'Crate not found'); } });
route('GET', '/api/game/inventory', (c) => game.inventory(c.me!.id));
route('POST', '/api/game/equip', (c) => game.equip(c.me!.id, c.body));
route('GET', '/api/game/feed', (c) => game.feed(Number(c.url.searchParams.get('limit') ?? 20)));
route('GET', '/api/game/rewards', (c) => game.rewards(c.me!.id, Number(c.url.searchParams.get('limit') ?? 20)));

// ─── routes: oauth consent ───────────────────────────────────────────────────

route('GET', '/api/oauth/client', (c) => {
  const id = c.url.searchParams.get('client_id') ?? '';
  if (!id) throw new HttpError(400, 'bad_request', 'Missing client_id');
  const name = /chatgpt|openai/i.test(id) ? 'ChatGPT' : /cursor/i.test(id) ? 'Cursor' : 'Claude';
  const redirectUri = c.url.searchParams.get('redirect_uri') ?? (name === 'ChatGPT' ? 'https://chatgpt.com/connector_platform_oauth_redirect' : 'https://claude.ai/api/mcp/auth_callback');
  return { name, redirectUri, redirectHost: new URL(redirectUri).host };
});
route('POST', '/api/oauth/approve', (c) => {
  const q = c.body.query ?? {}; const redirect = q.redirect_uri ?? 'https://claude.ai/api/mcp/auth_callback';
  const u = new URL(redirect);
  if (c.body.approve) { u.searchParams.set('code', rid('code', 24)); } else u.searchParams.set('error', 'access_denied');
  if (q.state) u.searchParams.set('state', q.state);
  if (c.body.approve) logAudit(c.me!.id, 'oauth.approved', 'api_key', rid('key'), `${firstName(c.me!.id)} connected an AI app (${(c.body.scopes ?? []).join(' + ')})`, null, null);
  return { redirectTo: u.toString() };
});

// ─── routes: integrations ────────────────────────────────────────────────────

function fakeQr(): string {
  const n = 29; const cells: string[] = []; const rnd = randomBytes(n * n);
  const finder = (x: number, y: number) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => x >= fx! && x < fx! + 7 && y >= fy! && y < fy! + 7);
  const finderOn = (x: number, y: number) => { for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) { const dx = x - fx!, dy = y - fy!; if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4); } return false; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (finder(x, y) ? finderOn(x, y) : rnd[y * n + x]! > 128) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#111">${cells.join('')}</g></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
function waStatus() {
  if (waState.status === 'pairing' && Date.now() - waState.since > 9000) waState = { status: 'connected', qr: null, phone: '+91 98200 55501', since: Date.now() };
  else if (waState.status === 'pairing' && Date.now() - waState.since > 4500 && waState.qr) waState.qr = waState.qr; // keep
  return { status: waState.status, qr: waState.qr, phone: waState.phone ?? undefined };
}
route('GET', '/api/integrations', (c) => {
  const host = c.req.headers['x-forwarded-host'] ?? c.req.headers.host ?? 'localhost:5173';
  waStatus();
  return {
    whatsapp: { mode: 'qr', connected: waState.status === 'connected', phone: waState.phone },
    email: { inbound: true, outbound: true, address: 'brain@vexocore.test' },
    push: true, llm: { provider: 'anthropic' }, tts: { provider: process.env.MOCK_TTS === '1' ? 'openai' : null },
    mcpUrl: `http://${host}/mcp`,
  };
});
route('POST', '/api/integrations/whatsapp/qr/start', (c) => { forbid(isAdmin(c.me!)); waState = { status: 'pairing', qr: fakeQr(), phone: null, since: Date.now() }; return { qr: waState.qr, status: 'pairing' }; });
route('GET', '/api/integrations/whatsapp/qr/status', () => waStatus());
route('POST', '/api/integrations/whatsapp/qr/logout', () => { waState = { status: 'disconnected', qr: null, phone: null, since: Date.now() }; return { ok: true }; });
route('POST', '/api/integrations/test', (c) => {
  const ch = c.body.channel;
  if (ch === 'whatsapp' && waState.status !== 'connected') return { ok: false, error: 'WhatsApp is not connected yet.' };
  return { ok: true };
});

// ─── server ──────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const token = cookie(req, 'cb_session');
  const me = token && sessions.has(token) ? members.find((m) => m.id === sessions.get(token) && m.active) ?? null : null;

  if (url.pathname === '/api/stream') {
    if (!me) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'unauthorized', message: 'Sign in' } })); return; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 3000\n\ndata: ${JSON.stringify({ type: 'ping', at: Date.now() })}\n\n`);
    const client = { res, memberId: me.id }; clients.add(client);
    req.on('close', () => clients.delete(client));
    return;
  }

  const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
  const send = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (!r) return send(404, { error: { code: 'not_found', message: `No route ${req.method} ${url.pathname}` } });
  try {
    if (r.auth && !me) throw new HttpError(401, 'unauthorized', 'Please sign in.');
    if (req.method !== 'GET' && token && req.headers['x-cb-client'] !== 'web') throw new HttpError(403, 'forbidden', 'Missing X-CB-Client header (CSRF).');
    const chunks: Buffer[] = []; for await (const ch of req) chunks.push(ch as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) : {};
    const m = r.re.exec(url.pathname)!; const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
    if (LATENCY) await new Promise((ok) => setTimeout(ok, LATENCY * (0.5 + Math.random())));
    const out = await r.h({ req, res, url, params, body, me });
    if (!res.headersSent) send(200, out);
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: { code: e.code, message: e.message } });
    console.error(e); send(500, { error: { code: 'internal', message: String(e) } });
  }
});
server.listen(PORT, () => console.log(`[mock-api] http://127.0.0.1:${PORT}  tz=${TZ}  needsSetup=${!org}  login owner@vexocore.test / demo1234`));
