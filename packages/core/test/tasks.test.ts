import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LiveEvent, Member, Project } from '@companybrain/types';
import { extractMentions, resolveMemberHint, resolveProjectHint } from '../src/index.ts';
import { DAY, HOUR, T0, bootstrap, makeEnv } from './helpers.ts';

test('task CRUD, activity log, derived flags, audit snapshots', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya, a: priyaA } = await team.add('Priya Shah');
  const t = await env.s.tasks.create(team.ownerA, { title: '  Send Acme proposal ', dueAt: T0 + 2 * HOUR, priority: 'high', assigneeIds: [priya.id], tags: ['#sales'], subtasks: [{ title: 'Draft' }] });
  assert.equal(t.title, 'Send Acme proposal');
  assert.deepEqual(t.tags, ['sales']);
  assert.equal(t.isDueToday, true);
  assert.equal(t.isOverdue, false);
  assert.equal(t.subtasks.length, 1);
  assert.equal(t.status, 'todo');

  const self = await env.s.tasks.create(priyaA, { title: 'My own thing' });
  assert.deepEqual(self.assigneeIds, [priya.id], 'default assignee = actor');

  await assert.rejects(env.s.tasks.create(team.ownerA, { title: '' }), (e: any) => e.code === 'bad_request');
  await assert.rejects(env.s.tasks.create(team.ownerA, { title: 'x', assigneeIds: ['mem_doesnotexist'] }), (e: any) => e.code === 'bad_request');
  await assert.rejects(env.s.tasks.create(team.ownerA, { title: 'x', priority: 'super' as never }), (e: any) => e.code === 'bad_request');

  const u = await env.s.tasks.update(priyaA, t.id, { status: 'in_progress', dueAt: T0 - HOUR });
  assert.equal(u.status, 'in_progress');
  assert.ok(u.startedAt);
  assert.equal(u.isOverdue, true);
  const sub = await env.s.tasks.updateSubtask(priyaA, t.id, t.subtasks[0]!.id, { done: true });
  assert.equal(sub.subtasks[0]!.done, true);
  assert.equal(sub.subtasks[0]!.doneBy, priya.id);
  const done = await env.s.tasks.complete(priyaA, t.id);
  assert.equal(done.status, 'done');
  assert.equal(done.completedBy, priya.id);
  assert.equal(done.isOverdue, false);
  const again = await env.s.tasks.complete(priyaA, t.id);
  assert.equal(again.updatedAt, done.updatedAt, 'completing twice is a no-op');
  const reopened = await env.s.tasks.reopen(priyaA, t.id);
  assert.equal(reopened.completedAt, null);

  const kinds = (await env.s.tasks.activity(team.ownerA, t.id)).map((a) => a.kind);
  assert.deepEqual(kinds, ['created', 'due_changed', 'status', 'subtask', 'status', 'status']);

  const types = env.audits.filter((e) => e.entityId === t.id).map((e) => e.type);
  assert.deepEqual(types, ['task.created', 'task.updated', 'task.updated', 'task.completed', 'task.reopened']);
  const subEv = env.audits.filter((e) => e.entityId === t.id)[2]!;
  assert.equal((subEv.before as any).subtasks[0].done, false);
  assert.equal((subEv.after as any).subtasks[0].done, true);
  const completedEv = env.audits.find((e) => e.type === 'task.completed')!;
  for (const k of ['status', 'dueAt', 'priority', 'assigneeIds', 'completedBy', 'completedAt', 'createdAt', 'creatorId', 'projectId', 'subtasks']) {
    assert.ok(k in (completedEv.after as object), `snapshot has ${k}`);
  }
  assert.equal((completedEv.before as any).status, 'in_progress');

  // creator notified on completion by someone else
  assert.ok((await env.s.notifications.list(team.ownerA)).some((n) => n.kind === 'task_completed'));

  await env.s.tasks.remove(team.ownerA, t.id);
  await assert.rejects(env.s.tasks.get(team.ownerA, t.id), (e: any) => e.code === 'not_found');
});

test('list views and filters', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: p } = await team.add('Priya');
  const mk = (title: string, extra: object = {}) => env.s.tasks.create(team.ownerA, { title, ...extra });
  await mk('overdue', { dueAt: T0 - DAY });
  await mk('today', { dueAt: T0 + 3 * HOUR });
  await mk('later', { dueAt: T0 + 3 * DAY });
  await mk('waiting', { waitingOn: { name: 'Raj', contact: null, channel: 'other', nudgeEveryHours: null } });
  await mk('priya', { assigneeIds: [p.id], tags: ['ops'] });
  const done = await mk('done');
  await env.s.tasks.complete(team.ownerA, done.id);
  const titles = async (q: object) => (await env.s.tasks.list(team.ownerA, q)).map((t) => t.title).sort();
  assert.deepEqual(await titles({ view: 'today' }), ['overdue', 'today']);
  assert.deepEqual(await titles({ view: 'overdue' }), ['overdue']);
  assert.deepEqual(await titles({ view: 'upcoming' }), ['later']);
  assert.deepEqual(await titles({ view: 'waiting' }), ['waiting']);
  assert.deepEqual(await titles({ view: 'done' }), ['done']);
  assert.deepEqual(await titles({ assigneeId: p.id }), ['priya']);
  assert.deepEqual(await titles({ tag: 'OPS' }), ['priya']);
  assert.deepEqual(await titles({ search: 'wait' }), ['waiting']);
  assert.equal((await titles({})).length, 5, 'done excluded by default');
  assert.equal((await titles({ includeDone: true })).length, 6);
  assert.deepEqual(await titles({ status: ['done'] }), ['done']);
  await assert.rejects(env.s.tasks.list(team.ownerA, { view: 'bogus' as never }), (e: any) => e.code === 'bad_request');
});

test('comments, @mentions and hand-offs notify the right people', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya, a: priyaA } = await team.add('Priya Shah');
  const { m: raj } = await team.add('Raj Kumar');
  const t = await env.s.tasks.create(team.ownerA, { title: 'Ship it', assigneeIds: [priya.id] });
  const a = await env.s.tasks.comment(priyaA, t.id, 'Almost there — @raj can you review? cc @nobody');
  assert.equal(a.kind, 'comment');
  const rajN = await env.s.notifications.list({ ...team.ownerA, memberId: raj.id, role: 'member' });
  assert.equal(rajN.length, 1);
  assert.equal(rajN[0]!.kind, 'task_mention');
  const ownerN = await env.s.notifications.list(team.ownerA);
  assert.ok(ownerN.some((n) => n.kind === 'task_comment'), 'creator gets comment notification');
  assert.ok(!(await env.s.notifications.list(priyaA)).some((n) => n.kind === 'task_comment'), 'author not notified');
  const h = await env.s.tasks.comment(priyaA, t.id, 'Handing over to Raj', 'handoff');
  assert.equal(h.kind, 'handoff');
  assert.equal((await env.s.tasks.get(team.ownerA, t.id)).commentCount, 2);
  await env.s.notifications.markRead(team.ownerA, 'all');
  assert.equal(await env.s.notifications.unreadCount(team.ownerA), 0);
});

test('quick add: title passthrough, default assignee, source; preview does not create', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya, a: priyaA } = await team.add('Priya');
  const pv = await env.s.tasks.preview(priyaA, 'Water the plants');
  assert.equal(pv.draft.title.length > 0, true);
  assert.ok(Array.isArray(pv.unresolved));
  assert.equal((await env.s.tasks.list(priyaA)).length, 0);
  const t = await env.s.tasks.quickAdd(priyaA, 'Water the plants', { priority: 'low' });
  assert.match(t.title, /Water the plants/);
  assert.deepEqual(t.assigneeIds, [priya.id]);
  assert.equal(t.source.channel, 'quick_add');
  assert.equal(t.priority, 'low');
});

test('hint resolution: names, first names, emails, unique prefixes; fuzzy projects', () => {
  const m = (id: string, name: string, email: string | null) => ({ id, name, email }) as Member;
  const members = [m('mem_1aaaaaa', 'Priya Shah', 'priya@acme.io'), m('mem_2aaaaaa', 'Raj Kumar', 'raj.k@acme.io'), m('mem_3aaaaaa', 'Rajesh Iyer', 'rajesh@acme.io'), m('mem_4aaaaaa', 'Claude', null)];
  assert.equal(resolveMemberHint('priya', members, null)?.id, 'mem_1aaaaaa');
  assert.equal(resolveMemberHint('@PRIYA', members, null)?.id, 'mem_1aaaaaa');
  assert.equal(resolveMemberHint('pri', members, null)?.id, 'mem_1aaaaaa', 'unique prefix');
  assert.equal(resolveMemberHint('raj', members, null)?.id, 'mem_2aaaaaa', 'exact first name beats prefix');
  assert.equal(resolveMemberHint('raje', members, null)?.id, 'mem_3aaaaaa');
  assert.equal(resolveMemberHint('ra', members, null), null, 'ambiguous prefix');
  assert.equal(resolveMemberHint('raj.k', members, null)?.id, 'mem_2aaaaaa', 'email local part');
  assert.equal(resolveMemberHint('rajkumar', members, null)?.id, 'mem_2aaaaaa', 'name without spaces');
  assert.equal(resolveMemberHint('claude', members, null)?.id, 'mem_4aaaaaa');
  assert.equal(resolveMemberHint('me', members, 'mem_3aaaaaa')?.id, 'mem_3aaaaaa');
  assert.equal(resolveMemberHint('zed', members, null), null);
  const p = (id: string, name: string) => ({ id, name }) as Project;
  const projects = [p('proj_1aaaaaa', 'Website Redesign'), p('proj_2aaaaaa', 'Q4 Launch'), p('proj_3aaaaaa', 'web-app')];
  assert.equal(resolveProjectHint('website-redesign', projects)?.id, 'proj_1aaaaaa');
  assert.equal(resolveProjectHint('#q4launch', projects)?.id, 'proj_2aaaaaa');
  assert.equal(resolveProjectHint('webapp', projects)?.id, 'proj_3aaaaaa');
  assert.equal(resolveProjectHint('web', projects), null, 'ambiguous');
  assert.equal(resolveProjectHint('redesign', projects)?.id, 'proj_1aaaaaa', 'unique substring');
  assert.deepEqual(extractMentions('hi @priya and @raj.k, mail a@b.io'), ['priya', 'raj.k']);
});

test('permissions: guests read-only, agents update only their own tasks, members cannot delete others', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: mgr, a: mgrA } = await team.add('Mia', 'manager');
  const { a: memA, m: mem } = await team.add('Max');
  const { m: guest, a: guestA } = await team.add('Gus', 'guest');
  const { m: bot, a: botA } = await team.addAgent('Claude', mgr.id);
  const proj = await env.s.projects.create(mgrA, { name: 'Website', memberIds: [mem.id, guest.id] });
  await assert.rejects(env.s.projects.create(memA, { name: 'X' }), (e: any) => e.code === 'forbidden');
  const pt = await env.s.tasks.create(mgrA, { title: 'Project task', projectId: proj.id, assigneeIds: [mem.id] });
  const botTask = await env.s.tasks.create(mgrA, { title: 'For the bot', projectId: proj.id, assigneeIds: [bot.id] });
  const privateTask = await env.s.tasks.create(mgrA, { title: 'Private', assigneeIds: [mgr.id] });

  // guest: sees project work, cannot mutate
  assert.ok((await env.s.tasks.list(guestA)).some((t) => t.id === pt.id));
  await assert.rejects(env.s.tasks.update(guestA, pt.id, { title: 'x' }), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.tasks.comment(guestA, pt.id, 'hi'), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.tasks.create(guestA, { title: 'x' }), (e: any) => e.code === 'forbidden');

  // agent: sees all non-private work; updates only its own; comments on anything visible
  const botVisible = (await env.s.tasks.list(botA)).map((t) => t.id);
  assert.ok(botVisible.includes(pt.id) && botVisible.includes(botTask.id));
  assert.ok(!botVisible.includes(privateTask.id), 'private (no-project) tasks hidden from agents');
  await assert.rejects(env.s.tasks.get(botA, privateTask.id), (e: any) => e.code === 'not_found');
  await env.s.tasks.update(botA, botTask.id, { status: 'in_progress' });
  await assert.rejects(env.s.tasks.update(botA, pt.id, { status: 'done' }), (e: any) => e.code === 'forbidden');
  await env.s.tasks.comment(botA, pt.id, 'I can help with this');
  const created = await env.s.tasks.create(botA, { title: 'Bot made this' });
  assert.equal(created.creatorId, bot.id);

  // member: edits visible work; cannot delete someone else's task; cannot see private tasks
  await env.s.tasks.update(memA, pt.id, { status: 'review' });
  await assert.rejects(env.s.tasks.remove(memA, pt.id), (e: any) => e.code === 'forbidden');
  await assert.rejects(env.s.tasks.get(memA, privateTask.id), (e: any) => e.code === 'not_found');
});

test('org isolation: a second org cannot read or modify the first org\'s data', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const proj = await env.s.projects.create(team.ownerA, { name: 'Secret' });
  const t = await env.s.tasks.create(team.ownerA, { title: 'Org A task', projectId: proj.id });
  const lead = await env.s.leads.create(team.ownerA, { name: 'Dana' });
  const ev = (await env.s.audit.list(team.ownerA)).find((e) => e.type === 'task.created')!;

  // A second org in the same DB (multi-tenant safety even though deployments are single-org).
  const now = env.clock.now;
  env.db.orgs.insert({ id: 'org_otherorg1', name: 'Evil', timezone: 'UTC', logo: null, workdayStart: 9, workdayEnd: 18, defaultReminderOffsets: [60], escalateAfterMin: null, agentStaleAfterMin: 240, intakeAutoAck: false, createdAt: now, updatedAt: now });
  const evil = await env.s.members.create({ orgId: 'org_otherorg1', memberId: 'system', role: 'owner', kind: 'human', via: 'system' }, { kind: 'human', role: 'owner', name: 'Eve', email: 'eve@evil.io', password: 'password123' });
  const eve = { orgId: 'org_otherorg1', memberId: evil.id, role: 'owner' as const, kind: 'human' as const, via: 'session' as const };

  assert.equal((await env.s.tasks.list(eve, { view: 'all' })).length, 0);
  await assert.rejects(env.s.tasks.get(eve, t.id), (e: any) => e.code === 'not_found');
  await assert.rejects(env.s.tasks.update(eve, t.id, { title: 'pwned' }), (e: any) => e.code === 'not_found');
  await assert.rejects(env.s.tasks.comment(eve, t.id, 'hi'), (e: any) => e.code === 'not_found');
  await assert.rejects(env.s.projects.get(eve, proj.id), (e: any) => e.code === 'not_found');
  await assert.rejects(env.s.projects.update(eve, proj.id, { name: 'x' }), (e: any) => e.code === 'not_found');
  await assert.rejects(env.s.leads.update(eve, lead.id, { name: 'x' }), (e: any) => e.code === 'not_found');
  await assert.rejects(env.s.audit.undo(eve, ev.id), (e: any) => e.code === 'not_found');
  assert.equal((await env.s.audit.list(eve)).filter((e) => e.entityId === t.id).length, 0);
  const bulk = await env.s.tasks.bulk(eve, [t.id], { kind: 'delete' });
  assert.deepEqual(bulk.ok, []);
  assert.equal(bulk.failed.length, 1);
  await assert.rejects(env.s.tasks.create(eve, { title: 'x', assigneeIds: [team.owner.id] }), (e: any) => e.code === 'bad_request');
  await assert.rejects(env.s.tasks.create(eve, { title: 'x', projectId: proj.id }), (e: any) => e.code === 'bad_request');
  await assert.rejects(env.s.members.get(eve, team.owner.id), (e: any) => e.code === 'not_found');
  assert.equal((await env.s.search.search(eve, 'Org A')).tasks.length, 0);
  assert.equal((await env.s.tasks.get(team.ownerA, t.id)).title, 'Org A task', 'untouched');
});

test('undo: create → delete, delete → restore, update → restore fields; single use', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya, a: priyaA } = await team.add('Priya');
  const t = await env.s.tasks.create(team.ownerA, { title: 'Original', assigneeIds: [priya.id], dueAt: T0 + DAY });
  await env.s.tasks.comment(team.ownerA, t.id, 'note');
  await env.s.tasks.update(team.ownerA, t.id, { title: 'Renamed', priority: 'urgent' });
  const upd = (await env.s.audit.list(team.ownerA, { entity: 'task', entityId: t.id })).find((e) => e.type === 'task.updated')!;
  await env.s.audit.undo(team.ownerA, upd.id);
  const restored = await env.s.tasks.get(team.ownerA, t.id);
  assert.equal(restored.title, 'Original');
  assert.equal(restored.priority, 'none');
  await assert.rejects(env.s.audit.undo(team.ownerA, upd.id), (e: any) => e.code === 'conflict', 'single use');

  // someone else's change: members can't undo it
  await assert.rejects(env.s.audit.undo(priyaA, upd.id), (e: any) => e.code === 'conflict' || e.code === 'forbidden');

  await env.s.tasks.remove(team.ownerA, t.id);
  const del = (await env.s.audit.list(team.ownerA, { entity: 'task', entityId: t.id })).find((e) => e.type === 'task.deleted')!;
  await env.s.audit.undo(team.ownerA, del.id);
  const back = await env.s.tasks.get(team.ownerA, t.id);
  assert.deepEqual(back.assigneeIds, [priya.id]);
  assert.equal(back.commentCount, 1, 'activity survives delete + restore');
  assert.ok(env.db.jobs.list(team.owner.orgId, { status: 'pending', keyPrefix: `task.overdue:${t.id}` }).length === 1, 'reminders rescheduled');

  const c = await env.s.tasks.create(team.ownerA, { title: 'Oops' });
  const cre = (await env.s.audit.list(team.ownerA, { entity: 'task', entityId: c.id }))[0]!;
  await env.s.audit.undo(team.ownerA, cre.id);
  await assert.rejects(env.s.tasks.get(team.ownerA, c.id), (e: any) => e.code === 'not_found');

  const memberEvent = (await env.s.audit.list(team.ownerA, { entity: 'member' })).find((e) => e.type === 'member.created')!;
  await assert.rejects(env.s.audit.undo(team.ownerA, memberEvent.id), (e: any) => e.code === 'bad_request', 'not undoable');
});

test('projects: summaries with counts and progress; lead can edit; delete + undo relinks tasks', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: lead, a: leadA } = await team.add('Lena');
  const p = await env.s.projects.create(team.ownerA, { name: 'Launch', leadId: lead.id, emoji: '🚀' });
  const a = await env.s.tasks.create(team.ownerA, { title: 'a', projectId: p.id, dueAt: T0 - HOUR });
  await env.s.tasks.create(team.ownerA, { title: 'b', projectId: p.id, dueAt: T0 + DAY });
  const c = await env.s.tasks.create(team.ownerA, { title: 'c', projectId: p.id });
  await env.s.tasks.complete(team.ownerA, c.id);
  const s = await env.s.projects.get(team.ownerA, p.id);
  assert.deepEqual(s.counts, { total: 3, open: 2, done: 1, overdue: 1, dueThisWeek: 1 });
  assert.equal(s.progress, 0.333);
  await env.s.projects.update(leadA, p.id, { description: 'Q4 launch' });
  await env.s.projects.remove(team.ownerA, p.id);
  assert.equal((await env.s.tasks.get(team.ownerA, a.id)).projectId, null);
  const ev = (await env.s.audit.list(team.ownerA, { entity: 'project' })).find((e) => e.type === 'project.deleted')!;
  await env.s.audit.undo(team.ownerA, ev.id);
  assert.equal((await env.s.tasks.get(team.ownerA, a.id)).projectId, p.id);
  assert.equal((await env.s.projects.list(team.ownerA)).length, 1);
});

test('live events are targeted to members who can see the task', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { m: priya, a: priyaA } = await team.add('Priya');
  const { m: max } = await team.add('Max');
  const got: Record<string, LiveEvent[]> = { [priya.id]: [], [max.id]: [] };
  env.s.live.subscribe(team.owner.orgId, priya.id, (e) => got[priya.id]!.push(e));
  env.s.live.subscribe(team.owner.orgId, max.id, (e) => got[max.id]!.push(e));
  const t = await env.s.tasks.create(team.ownerA, { title: 'For Priya', assigneeIds: [priya.id] });
  assert.ok(got[priya.id]!.some((e) => e.type === 'task.upserted' && e.task.id === t.id));
  assert.ok(got[priya.id]!.some((e) => e.type === 'notification'));
  assert.equal(got[max.id]!.length, 0, 'private task not broadcast to others');
  await env.s.tasks.complete(priyaA, t.id);
  assert.ok(got[priya.id]!.some((e) => e.type === 'activity'));
});

test('bulk operations report per-item failures', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const a = await env.s.tasks.create(team.ownerA, { title: 'a' });
  const b = await env.s.tasks.create(team.ownerA, { title: 'b' });
  const r = await env.s.tasks.bulk(team.ownerA, [a.id, b.id, 'task_missing00'], { kind: 'status', value: 'blocked' });
  assert.deepEqual(r.ok.sort(), [a.id, b.id].sort());
  assert.equal(r.failed[0]!.id, 'task_missing00');
  const r2 = await env.s.tasks.bulk(team.ownerA, [a.id], { kind: 'status', value: 'nope' });
  assert.equal(r2.failed.length, 1);
  const r3 = await env.s.tasks.bulk(team.ownerA, [a.id, b.id], { kind: 'complete' });
  assert.equal(r3.ok.length, 2);
});

test('search and reports respect visibility', async () => {
  const env = makeEnv();
  const team = await bootstrap(env);
  const { a: maxA } = await team.add('Max');
  const t = await env.s.tasks.create(team.ownerA, { title: 'Quarterly numbers', dueAt: T0 + HOUR });
  env.clock.advance(2 * HOUR);
  await env.s.tasks.complete(team.ownerA, t.id);
  await env.s.tasks.create(team.ownerA, { title: 'Another', dueAt: T0 - DAY });
  assert.equal((await env.s.search.search(team.ownerA, 'quarter')).tasks.length, 1);
  assert.equal((await env.s.search.search(maxA, 'quarter')).tasks.length, 0);
  assert.equal((await env.s.search.search(team.ownerA, 'max')).members.length, 1);
  const r = await env.s.reports.get(team.ownerA, 7);
  assert.equal(r.daily.length, 7);
  assert.equal(r.totals.created, 2);
  assert.equal(r.totals.completed, 1);
  assert.equal(r.totals.overdueNow, 1);
  assert.equal(r.totals.onTimeRate, 0);
  assert.equal(r.humansVsAgents.humans, 1);
  assert.equal((await env.s.reports.get(maxA, 7)).totals.created, 0);
});
