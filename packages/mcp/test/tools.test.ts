import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AppError, type Actor } from '@companybrain/types';
import { createMcpServer, MCP_INSTRUCTIONS, TOOL_NAMES } from '../src/index.ts';
import { createFakeServices, NOW, type FakeOptions } from './fake-services.ts';

async function connect(actorKind: 'claude' | 'claudeRead' | 'guest' = 'claude', opts: FakeOptions = {}) {
  const fake = createFakeServices(opts);
  const actor: Actor =
    actorKind === 'claudeRead' ? { ...fake.actors.claude, scopes: ['read'] }
    : actorKind === 'guest' ? { orgId: fake.actors.claude.orgId, memberId: 'mem_guest0001', role: 'guest', kind: 'human', via: 'session' }
    : fake.actors.claude;
  const server = createMcpServer(fake.services, actor, { clock: () => NOW });
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as CallToolResult;
  return { fake, client, server, call };
}

const text = (r: CallToolResult) => r.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
const data = (r: CallToolResult) => r.structuredContent as Record<string, any>;

describe('server metadata', () => {
  test('initialize returns name, version and instructions', async () => {
    const { client } = await connect();
    assert.equal(client.getServerVersion()?.name, 'companybrain');
    assert.equal(client.getServerVersion()?.version, '2.0.0');
    const instr = client.getInstructions() ?? '';
    assert.equal(instr, MCP_INSTRUCTIONS);
    for (const word of ['get_my_work', 'add_comment', 'handoff', 'complete_task', 'create_task', 'quick_add', 'time zone']) {
      assert.ok(instr.includes(word), `instructions mention ${word}`);
    }
  });

  test('tools/list has every tool with object input schemas and descriptions', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
    for (const t of tools) {
      assert.equal(t.inputSchema.type, 'object', t.name);
      assert.ok((t.description ?? '').length > 40, `${t.name} has a rich description`);
      for (const [k, v] of Object.entries(t.inputSchema.properties ?? {})) {
        assert.equal(typeof v, 'object', `${t.name}.${k}`);
      }
    }
    const create = tools.find((t) => t.name === 'create_task')!;
    assert.deepEqual(create.inputSchema.required, ['title']);
    assert.ok((create.inputSchema.properties as any).due.description.includes('ISO 8601'));
    assert.equal(tools.find((t) => t.name === 'get_my_work')!.annotations?.readOnlyHint, true);
    assert.equal(tools.find((t) => t.name === 'create_task')!.annotations?.readOnlyHint, false);
  });
});

describe('get_my_work', () => {
  test('groups tasks and restores notes', async () => {
    const { call, fake } = await connect();
    const r = await call('get_my_work');
    assert.ok(!r.isError, text(r));
    const d = data(r);
    const titles = (k: string) => d[k].map((t: any) => t.title);
    assert.deepEqual(titles('overdue'), ['Send Acme proposal']);
    assert.deepEqual(titles('inProgress'), ['Draft blog post']);
    assert.deepEqual(titles('today'), ['Review pricing page']);
    assert.deepEqual(titles('upcoming'), ['Prepare Q4 report']);
    assert.deepEqual(titles('blocked'), ['Fix signup bug']);
    assert.equal(d.laterCount, 1);
    assert.equal(d.member.timezone, 'Asia/Kolkata');
    assert.equal(d.unreadNotifications, 1);
    // Only notes by others in the last 48 h.
    assert.equal(d.recentNotes.length, 1);
    assert.equal(d.recentNotes[0].kind, 'handoff');
    assert.equal(d.recentNotes[0].by.name, 'Priya Sharma');
    assert.equal(d.recentNotes[0].task.id, fake.ids.today);
    // Own last note on in-progress work, even when older than 48 h.
    assert.equal(d.inProgress[0].myLastNote.text, 'Outline done; next: write intro section.');
    const t = text(r);
    for (const s of ['OVERDUE (1)', 'IN PROGRESS (1)', 'DUE TODAY (1)', 'UPCOMING', 'BLOCKED (1)', 'NOTES FOR YOU', 'your last note', 'Unread notifications: 1']) {
      assert.ok(t.includes(s), `text includes ${s}\n${t}`);
    }
    assert.ok(!t.includes('Priya only task'));
    assert.match(t, /due Sat 10 Oct 17:00 \(today\)/);
  });
});

describe('task tools', () => {
  test('list_tasks with name resolution and filters', async () => {
    const { call, fake } = await connect();
    let r = await call('list_tasks', { assignee: 'priya' });
    assert.ok(!r.isError, text(r));
    assert.deepEqual(data(r).tasks.map((t: any) => t.title), ['Priya only task']);
    assert.equal(data(r).query.assigneeId, 'mem_priya0001');
    r = await call('list_tasks', { assignee: 'me', project: '#website' });
    assert.deepEqual(data(r).tasks.map((t: any) => t.title), ['Draft blog post']);
    assert.equal(data(r).tasks[0].project.name, 'Website');
    r = await call('list_tasks', { view: 'overdue' });
    assert.equal(data(r).count, 1);
    const listCall = fake.calls.filter((c) => c.method === 'tasks.list').at(-1)!;
    assert.equal((listCall.args[1] as any).view, 'overdue');
    assert.equal((listCall.args[1] as any).limit, 25);
    r = await call('list_tasks', { limit: 500 });
    assert.equal(r.isError, true, 'limit > 100 rejected by schema');
  });

  test('ambiguous and unknown names give a clear error listing candidates', async () => {
    const { call } = await connect();
    let r = await call('list_tasks', { assignee: 'pr' });
    assert.equal(r.isError, true);
    assert.match(text(r), /"pr" matches more than one member/);
    assert.match(text(r), /Priya Sharma \(mem_priya0001\)/);
    assert.match(text(r), /Prakash Rao \(mem_prakash01\)/);
    r = await call('create_task', { title: 'X', project: 'web' });
    assert.equal(r.isError, true);
    assert.match(text(r), /matches more than one project: Website \(proj_website01\); Web App \(proj_webapp001\)/);
    r = await call('create_task', { title: 'X', assignees: ['Zed'] });
    assert.equal(r.isError, true);
    assert.match(text(r), /No team member matches "Zed"/);
    // Exact name wins over prefix ambiguity; email and word-prefix work too.
    r = await call('create_task', { title: 'Y', project: 'Web App', assignees: ['priya@acme.test', 'patel'] });
    assert.ok(!r.isError, text(r));
    assert.equal(data(r).task.project.id, 'proj_webapp001');
    assert.deepEqual(data(r).task.assignees.map((a: any) => a.id), ['mem_priya0001', 'mem_raj00001']);
  });

  test('get_task returns details + activity', async () => {
    const { call, fake } = await connect();
    const r = await call('get_task', { taskId: fake.ids.today });
    assert.ok(!r.isError, text(r));
    assert.equal(data(r).task.title, 'Review pricing page');
    assert.ok(data(r).activity.some((a: any) => a.kind === 'handoff'));
    assert.match(text(r), /Priya Sharma \[handoff\]: Check the new enterprise tier copy/);
  });

  test('create_task: ISO local, ISO instant, date-only and natural-language due dates', async () => {
    const { call, fake } = await connect();
    let r = await call('create_task', { title: 'Local time', due: '2026-10-12T17:00', priority: 'high', tags: ['#sales'], reminders: [60], subtasks: ['a', 'b'], notes: 'n' });
    assert.ok(!r.isError, text(r));
    let input = fake.calls.filter((c) => c.method === 'tasks.create').at(-1)!.args[1] as any;
    assert.equal(input.dueAt, Date.parse('2026-10-12T17:00:00+05:30'));
    assert.equal(input.dueAllDay, false);
    assert.deepEqual(input.assigneeIds, ['mem_claude001'], 'defaults to caller');
    assert.deepEqual(input.tags, ['sales']);
    assert.deepEqual(input.reminderOffsets, [60]);
    assert.deepEqual(input.subtasks, [{ title: 'a' }, { title: 'b' }]);
    assert.equal(input.source.channel, 'mcp');
    assert.equal(data(r).task.due, '2026-10-12T17:00:00+05:30');

    r = await call('create_task', { title: 'Instant', due: '2026-10-12T11:30:00Z', assignees: [] });
    input = fake.calls.filter((c) => c.method === 'tasks.create').at(-1)!.args[1] as any;
    assert.equal(input.dueAt, Date.parse('2026-10-12T11:30:00Z'));
    assert.deepEqual(input.assigneeIds, []);

    r = await call('create_task', { title: 'All day', due: '2026-10-15' });
    input = fake.calls.filter((c) => c.method === 'tasks.create').at(-1)!.args[1] as any;
    assert.equal(input.dueAllDay, true);
    assert.equal(input.dueAt, Date.parse('2026-10-15T18:00:00+05:30'), 'end of workday in member tz');
    assert.equal(data(r).task.due, '2026-10-15');

    r = await call('create_task', { title: 'NL', due: 'tomorrow 5pm' });
    assert.ok(!r.isError, text(r));
    input = fake.calls.filter((c) => c.method === 'tasks.create').at(-1)!.args[1] as any;
    assert.equal(input.dueAt, Date.parse('2026-10-11T17:00:00+05:30'));

    r = await call('create_task', { title: 'Bad', due: 'when pigs fly' });
    assert.equal(r.isError, true);
    assert.match(text(r), /Could not understand the date "when pigs fly"/);
    r = await call('create_task', { title: 'Bad', due: '2026-02-30' });
    assert.equal(r.isError, true, 'invalid ISO date not silently accepted');
  });

  test('quick_add passes text through and defaults assignee to caller', async () => {
    const { call, fake } = await connect();
    let r = await call('quick_add', { text: 'Call vendor tomorrow 10am #sales !high' });
    assert.ok(!r.isError, text(r));
    assert.equal(data(r).task.title, 'Call vendor');
    assert.equal(data(r).task.priority, 'high');
    assert.deepEqual(data(r).task.assignees.map((a: any) => a.id), ['mem_claude001']);
    r = await call('quick_add', { text: 'Send Acme proposal @priya' });
    assert.deepEqual(data(r).task.assignees.map((a: any) => a.id), ['mem_priya0001']);
    const qa = fake.calls.filter((c) => c.method === 'tasks.quickAdd').at(-1)!;
    assert.equal((qa.args[2] as any).assigneeIds, undefined);
  });

  test('update_task: status, due, add/remove assignees, clear due, project none', async () => {
    const { call, fake } = await connect();
    const tid = fake.ids.today;
    let r = await call('update_task', { taskId: tid, status: 'in_progress', addAssignees: ['Raj'], due: 'in 2 days' });
    assert.ok(!r.isError, text(r));
    assert.equal(data(r).task.status, 'in_progress');
    assert.deepEqual(data(r).task.assignees.map((a: any) => a.id), ['mem_claude001', 'mem_raj00001']);
    assert.equal(data(r).task.dueAt, NOW + 2 * 86_400_000);
    r = await call('update_task', { taskId: tid, removeAssignees: ['me'], due: 'none', project: 'none' });
    assert.ok(!r.isError, text(r));
    const patch = fake.calls.filter((c) => c.method === 'tasks.update').at(-1)!.args[2] as any;
    assert.deepEqual(patch, { dueAt: null, dueAllDay: false, assigneeIds: ['mem_raj00001'], projectId: null });
    r = await call('update_task', { taskId: tid });
    assert.equal(r.isError, true);
    assert.match(text(r), /Nothing to update/);
  });

  test('complete_task with a final note', async () => {
    const { call, fake } = await connect();
    const r = await call('complete_task', { taskId: fake.ids.inProgress, note: 'Published at https://x' });
    assert.ok(!r.isError, text(r));
    assert.equal(data(r).task.status, 'done');
    assert.equal(data(r).noteSaved, true);
    const methods = fake.calls.map((c) => c.method);
    assert.ok(methods.indexOf('tasks.comment') < methods.indexOf('tasks.complete'), 'note saved before completing');
  });

  test('add_comment and handoff', async () => {
    const { call, fake } = await connect();
    let r = await call('add_comment', { taskId: fake.ids.inProgress, text: 'Wrote intro.' });
    assert.ok(!r.isError, text(r));
    assert.equal(data(r).activity.kind, 'comment');
    r = await call('handoff', { taskId: fake.ids.inProgress, note: 'Ready for review', to: 'Priya', status: 'review' });
    assert.ok(!r.isError, text(r));
    assert.deepEqual(data(r).task.assignees.map((a: any) => a.id), ['mem_priya0001']);
    assert.equal(data(r).task.status, 'review');
    assert.equal(data(r).activity.kind, 'handoff');
    assert.match(text(r), /Handed off to Priya Sharma, status → review/);
    r = await call('handoff', { taskId: fake.ids.today, note: 'Pairing', to: 'raj', keepCurrentAssignees: true });
    assert.deepEqual(data(r).task.assignees.map((a: any) => a.id), ['mem_claude001', 'mem_raj00001']);
  });

  test('handoff: note is kept even when reassignment fails', async () => {
    const { call, fake } = await connect('claude', { failOn: { 'tasks.update': new AppError('forbidden', 'cannot reassign') } });
    const r = await call('handoff', { taskId: fake.ids.today, note: 'Over to Priya', to: 'Priya' });
    assert.equal(r.isError, true);
    assert.match(text(r), /Hand-off note was saved, but updating the task failed/);
    assert.ok(fake.activity.some((a) => a.text === 'Over to Priya' && a.kind === 'handoff'));
  });
});

describe('other read tools', () => {
  test('list_projects, list_team, get_briefing, list_meetings, get_notifications, search', async () => {
    const { call, fake } = await connect();
    let r = await call('list_projects');
    assert.ok(!r.isError, text(r));
    assert.equal(data(r).projects.length, 3);
    assert.equal(data(r).projects[0].lead.name, 'Raj Patel');

    r = await call('list_team');
    assert.ok(!r.isError, text(r));
    const claude = data(r).members.find((m: any) => m.id === 'mem_claude001');
    assert.equal(claude.isYou, true);
    assert.equal(claude.agent.provider, 'claude');
    assert.equal(claude.agent.supervisor.name, 'Shrijeet Kumar');
    assert.match(text(r), /AI agents \(1\):\n- Claude \(you\) \[mem_claude001\] · AI agent \(claude\) · last seen 2 h ago/);
    r = await call('list_team', { kind: 'agent' });
    assert.equal(data(r).members.length, 1);

    r = await call('get_briefing');
    assert.ok(!r.isError, text(r));
    assert.match(text(r), /Good afternoon, Claude/);
    assert.equal(data(r).myTasks.overdue.length, 1);
    assert.equal(data(r).meetings[0].start, '2026-10-10T15:00:00+05:30');

    r = await call('list_meetings');
    assert.ok(!r.isError, text(r));
    assert.equal(data(r).meetings.length, 1);
    const range = fake.calls.find((c) => c.method === 'meetings.list')!.args[1] as any;
    assert.equal(range.from, Date.parse('2026-10-10T00:00:00+05:30'), 'starts at local midnight');
    assert.equal(range.to - range.from, 7 * 86_400_000);
    assert.equal(range.memberId, 'me');
    assert.match(text(r), /Sync with Raj @ Zoom · with Raj Patel, Claude \(you\)/);

    r = await call('get_notifications');
    assert.equal(data(r).notifications.length, 1);
    r = await call('get_notifications', { markRead: true });
    assert.equal(data(r).markedRead, 1);
    r = await call('get_notifications');
    assert.equal(data(r).notifications.length, 0);
    assert.match(text(r), /No unread notifications/);

    r = await call('search', { query: 'acme' });
    assert.ok(!r.isError, text(r));
    assert.equal(data(r).tasks[0].title, 'Send Acme proposal');
  });
});

describe('errors and scopes', () => {
  test('read-only key: reads work, every write tool returns a clean isError without calling core', async () => {
    const { call, fake } = await connect('claudeRead');
    const ok = await call('get_my_work');
    assert.ok(!ok.isError);
    const before = fake.calls.length;
    const writes: [string, Record<string, unknown>][] = [
      ['create_task', { title: 'x' }], ['quick_add', { text: 'x' }], ['update_task', { taskId: fake.ids.today, status: 'done' }],
      ['complete_task', { taskId: fake.ids.today }], ['add_comment', { taskId: fake.ids.today, text: 'x' }],
      ['handoff', { taskId: fake.ids.today, note: 'x' }],
    ];
    for (const [name, args] of writes) {
      const r = await call(name, args);
      assert.equal(r.isError, true, name);
      assert.match(text(r), /read-only \(scope: read\)/, name);
      assert.equal(data(r).error.reason, 'read_only_key');
    }
    assert.equal(fake.calls.slice(before).filter((c) => !c.method.startsWith('auth')).length, 0);
    const n = await call('get_notifications', { markRead: true });
    assert.ok(!n.isError);
    assert.match(text(n), /Not marked as read: this API key is read-only/);
  });

  test('AppError mapping: not_found, forbidden by role, internal; server keeps working', async () => {
    const { call } = await connect('guest');
    let r = await call('get_task', { taskId: 'task_doesnotexist' });
    assert.equal(r.isError, true);
    assert.match(text(r), /^Not found: task task_doesnotexist not found/);
    assert.equal(data(r).error.code, 'not_found');
    r = await call('create_task', { title: 'x', assignees: [] });
    assert.equal(r.isError, true);
    assert.match(text(r), /Not allowed: guests cannot change tasks\. Your role \(guest\)/);

    const c2 = await connect('claude', { failOn: { 'briefing.get': new Error('boom'), 'search.search': new AppError('rate_limited', 'slow down') } });
    const origError = console.error;
    console.error = () => {};
    try {
      r = await c2.call('get_briefing');
    } finally {
      console.error = origError;
    }
    assert.equal(r.isError, true);
    assert.match(text(r), /unexpected error: boom/);
    r = await c2.call('search', { query: 'x' });
    assert.match(text(r), /^Rate limited: slow down/);
    r = await c2.call('get_my_work');
    assert.ok(!r.isError, 'server still healthy');
  });

  test('schema validation errors come back as isError results', async () => {
    const { call } = await connect();
    const r = await call('create_task', { title: '' });
    assert.equal(r.isError, true);
    assert.match(text(r), /title/i);
  });
});

describe('per-call actor (stdio key re-resolution)', () => {
  test('a key revoked mid-session yields an unauthorized tool error, not a crash', async () => {
    const fake = createFakeServices();
    let revoked = false;
    const server = createMcpServer(fake.services, fake.actors.claude, {
      clock: () => NOW,
      getActor: async () => {
        if (revoked) throw new Error('the API key is no longer valid');
        return fake.actors.claude;
      },
    });
    const client = new Client({ name: 'test', version: '1.0.0' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    let r = (await client.callTool({ name: 'list_projects', arguments: {} })) as CallToolResult;
    assert.ok(!r.isError);
    revoked = true;
    r = (await client.callTool({ name: 'list_projects', arguments: {} })) as CallToolResult;
    assert.equal(r.isError, true);
    assert.match(text(r), /Not authenticated: the API key is no longer valid/);
  });
});

describe('Tactical Ops rewards and stats', () => {
  test('complete_task appends a reward line (rescue bonus on an overdue task)', async () => {
    const { call, fake } = await connect();
    const r = await call('complete_task', { taskId: fake.ids.overdue });
    assert.ok(!r.isError, text(r));
    assert.match(text(r), /\n🎖️ \+55 XP · rescue bonus \+15 · \+5 coins$/);
    assert.deepEqual(data(r).rewards.map((x: any) => x.kind), ['mission_complete', 'rescue_bonus']);
  });

  test('update_task to done shows on-time bonus and level-up; other updates show no rewards', async () => {
    const { call, fake } = await connect();
    let r = await call('update_task', { taskId: fake.ids.today, priority: 'high' });
    assert.ok(!text(r).includes('XP'));
    assert.equal(data(r).rewards, undefined);
    assert.ok(!fake.calls.some((c) => c.method === 'game.rewards'), 'no reward lookup unless completing');
    const c = await call('create_task', { title: 'Hit level five', due: 'tomorrow 5pm' });
    r = await call('update_task', { taskId: data(c).task.id, status: 'done' });
    assert.ok(!r.isError, text(r));
    assert.match(text(r), /🎖️ \+60 XP · on-time bonus \+20 · LEVEL UP → 5 \(Sergeant\) · \+5 coins/);
  });

  test('handoff with status done reports rewards', async () => {
    const { call, fake } = await connect();
    const r = await call('handoff', { taskId: fake.ids.today, note: 'Shipped, closing.', status: 'done' });
    assert.ok(!r.isError, text(r));
    assert.match(text(r), /🎖️ \+60 XP · on-time bonus \+20/);
  });

  test('rewards older than ~10 s or for other tasks are ignored', async () => {
    const { call, fake } = await connect();
    fake.rewards.push({ id: 'rwd_old', orgId: 'org_test0001', memberId: 'mem_claude001', kind: 'mission_complete', xp: 40, coins: 0, label: 'old', taskId: fake.ids.inProgress, at: NOW - 60_000 });
    fake.services.tasks.complete = async (_a, id) => ({ ...(await fake.services.tasks.get(_a, id)), status: 'done' });
    const r = await call('complete_task', { taskId: fake.ids.inProgress });
    assert.ok(!r.isError, text(r));
    assert.ok(!text(r).includes('XP'), text(r));
  });

  test('a game error never fails the completion', async () => {
    const { call, fake } = await connect('claude', { failOn: { 'game.rewards': new Error('game db locked') } });
    const origError = console.error;
    console.error = () => {};
    let r: CallToolResult;
    try {
      r = await call('complete_task', { taskId: fake.ids.today });
    } finally {
      console.error = origError;
    }
    assert.ok(!r.isError, text(r));
    assert.match(text(r), /^Completed: Review pricing page/);
    assert.ok(!text(r).includes('XP'));
    assert.equal(fake.tasks.find((t) => t.id === fake.ids.today)!.status, 'done');
  });

  test('get_my_stats: profile, today progress, challenges (works with a read-only key)', async () => {
    const { call } = await connect('claudeRead');
    const r = await call('get_my_stats');
    assert.ok(!r.isError, text(r));
    const d = data(r);
    assert.equal(d.profile.level, 4);
    assert.equal(d.profile.rank, 'Corporal');
    assert.equal(d.profile.xpToNextLevel, 90);
    assert.equal(d.profile.streak, 6);
    assert.equal(d.profile.unopenedCrates, 2);
    assert.equal(d.today.pct, 25);
    assert.deepEqual(d.challenges.map((c: any) => [c.title, c.pct, c.done]), [['Clear 3 missions', 33, false], ['Leave 2 intel notes', 100, true]]);
    const t = text(r);
    assert.match(t, /^Corporal · Level 4 · 1240 XP \(90 XP to level 5, next rank Sergeant at level 5\)/);
    assert.match(t, /Streak 6 days \(best 9\) · 85 coins · 2 unopened crates/);
    assert.match(t, /Today: 25% of missions done \(1\/4, 1 overdue\) · this week 60%/);
    assert.match(t, /- \[ \] Clear 3 missions — 1\/3 \(\+50 XP\)/);
    assert.match(t, /- \[x\] Leave 2 intel notes — 2\/2/);
  });
});
