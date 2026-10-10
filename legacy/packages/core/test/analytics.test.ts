// Tests for the pure analytics computations. No DB, no bootstrap — we feed in
// hand-built arrays and assert on the numbers. Run with:
//   node --import tsx --test packages/core/test/analytics.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Loop, Task, Lead } from '@companybrain/types';
import { computeReport } from '../src/analytics';

const NOW = Date.UTC(2026, 6, 4, 12, 0, 0); // 2026-07-04T12:00:00Z — fixed clock for deterministic tests
const DAY = 86_400_000;
const HOUR = 3_600_000;

// Override Date.now for the duration of these tests so "in window" math is deterministic.
const realNow = Date.now;
Date.now = () => NOW;

function makeLoop(over: Partial<Loop> = {}): Loop {
  return {
    id: 'loop_1', orgId: 'org', title: 'L', why: '', side: 'yours', status: 'open',
    channel: 'email', createdBy: 'u1', assignedTo: [], createdAt: NOW - 10 * DAY,
    updatedAt: NOW - 1 * DAY, ...over,
  };
}

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 'task_1', orgId: 'org', emoji: '•', title: 'T', list: 'Inbox', day: 'today',
    priority: null, recurring: false, assignees: ['u1'], createdBy: 'u1',
    createdAt: NOW - 1 * DAY, ...over,
  };
}

function makeLead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'lead_1', orgId: 'org', name: 'Lead', company: 'Co', title: '', phone: '', email: '',
    stage: 'new', source: 'manual', what: '', createdBy: 'u1', assignedTo: [],
    createdAt: NOW - 1 * DAY, ...over,
  };
}

test.after(() => { Date.now = realNow; });

test('empty input yields a well-formed zeroed report', () => {
  const r = computeReport({ loops: [], tasks: [], leads: [] });
  assert.equal(r.loops.total, 0);
  assert.equal(r.loops.closed, 0);
  assert.equal(r.loops.onTimeRate, 0);
  assert.equal(r.tasks.total, 0);
  assert.equal(r.leads.total, 0);
  assert.equal(r.productivity.focusHours, 0);
  assert.equal(r.productivity.velocityTrend.length, 7);
  assert.deepEqual(r.leaderboard, []);
  assert.equal(r.summary.headline.includes('0%'), true);
});

test('defaults windowDays to 30 and stamps generatedAt', () => {
  const r = computeReport({ loops: [], tasks: [], leads: [] });
  assert.equal(r.windowDays, 30);
  assert.equal(r.generatedAt, NOW);
});

test('basic loop status counts', () => {
  const loops = [
    makeLoop({ id: 'a', status: 'open' }),
    makeLoop({ id: 'b', status: 'closed' }),
    makeLoop({ id: 'c', status: 'snoozed' }),
    makeLoop({ id: 'd', status: 'overdue' }),
  ];
  const r = computeReport({ loops, tasks: [], leads: [] });
  assert.equal(r.loops.total, 4);
  assert.equal(r.loops.open, 1);
  assert.equal(r.loops.closed, 1);
  assert.equal(r.loops.snoozed, 1);
  assert.equal(r.loops.overdue, 1);
});

test('on-time rate: closed within 72h count as on time', () => {
  const loops = [
    // on time: resolved 10h after capture, inside the window
    makeLoop({ id: 'a', status: 'closed', createdAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY + 10 * HOUR }),
    // late: resolved 100h after capture
    makeLoop({ id: 'b', status: 'closed', createdAt: NOW - 10 * DAY, updatedAt: NOW - 10 * DAY + 100 * HOUR }),
  ];
  const r = computeReport({ loops, tasks: [], leads: [] });
  assert.equal(r.loops.closed, 2);
  assert.equal(r.loops.onTimeRate, 50); // 1 of 2
});

test('avgCloseHours averages resolved-loop duration', () => {
  const loops = [
    makeLoop({ id: 'a', status: 'closed', createdAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY + 10 * HOUR }), // 10h
    makeLoop({ id: 'b', status: 'closed', createdAt: NOW - 4 * DAY, updatedAt: NOW - 4 * DAY + 30 * HOUR }), // 30h
  ];
  const r = computeReport({ loops, tasks: [], leads: [] });
  assert.equal(r.loops.avgCloseHours, 20); // mean(10,30)
});

test('closedInWindow only counts loops closed (via updatedAt) inside the window', () => {
  const loops = [
    // closed yesterday — inside the 30-day window
    makeLoop({ id: 'a', status: 'closed', updatedAt: NOW - 1 * DAY }),
    // closed 40 days ago — outside the window
    makeLoop({ id: 'b', status: 'closed', updatedAt: NOW - 40 * DAY }),
  ];
  const r = computeReport({ loops, tasks: [], leads: [] });
  assert.equal(r.loops.closed, 2);
  assert.equal(r.loops.closedInWindow, 1);
});

test('tasks: completion is all-subtasks-done; tasksPerDay and completionRate', () => {
  // 2 tasks created in-window: one complete, one not.
  const tasks = [
    makeTask({ id: 't1', createdAt: NOW - 1 * DAY, subtasks: [{ id: 's', title: '', done: true }] }),
    makeTask({ id: 't2', createdAt: NOW - 1 * DAY, subtasks: [{ id: 's', title: '', done: false }] }),
    // no subtasks → never counts as complete
    makeTask({ id: 't3', createdAt: NOW - 1 * DAY, subtasks: [] }),
    // created outside window
    makeTask({ id: 't4', createdAt: NOW - 60 * DAY, subtasks: [{ id: 's', title: '', done: true }] }),
  ];
  const r = computeReport({ loops: [], tasks, leads: [], windowDays: 30 });
  assert.equal(r.tasks.createdInWindow, 3); // t4 is outside the window
  assert.equal(r.tasks.completedInWindow, 1); // only t1, and only because it's in-window
  assert.equal(r.tasks.completionRate, 33); // 1/3 of in-window creations
  assert.equal(r.productivity.tasksPerDay, 0.1); // 3 completions total / 30 days, rounded to 1dp
});

test('tasks: overdue counts incomplete tasks past dueAt', () => {
  const tasks = [
    makeTask({ id: 't1', dueAt: NOW - DAY, subtasks: [{ id: 's', title: '', done: false }] }), // overdue
    makeTask({ id: 't2', dueAt: NOW + DAY, subtasks: [{ id: 's', title: '', done: false }] }), // not yet
    makeTask({ id: 't3', dueAt: NOW - DAY, subtasks: [{ id: 's', title: '', done: true }] }),  // complete, not overdue
  ];
  const r = computeReport({ loops: [], tasks, leads: [] });
  assert.equal(r.tasks.overdue, 1);
});

test('tasks: byPriority buckets null → none', () => {
  const tasks = [
    makeTask({ id: '1', priority: 'high' }),
    makeTask({ id: '2', priority: 'med' }),
    makeTask({ id: '3', priority: 'low' }),
    makeTask({ id: '4', priority: null }),
  ];
  const r = computeReport({ loops: [], tasks, leads: [] });
  assert.deepEqual(r.tasks.byPriority, { high: 1, med: 1, low: 1, none: 1 });
});

test('leads: pipeline/conversion and wonInWindow', () => {
  const leads = [
    makeLead({ id: 'l1', stage: 'won', createdAt: NOW - 1 * DAY }),
    makeLead({ id: 'l2', stage: 'lost', createdAt: NOW - 1 * DAY }),
    makeLead({ id: 'l3', stage: 'meeting', createdAt: NOW - 1 * DAY }),
    makeLead({ id: 'l4', stage: 'won', createdAt: NOW - 60 * DAY }), // outside window
  ];
  const r = computeReport({ loops: [], tasks: [], leads: [], windowDays: 30 });
  // leads array passed empty above to isolate; recompute with the leads
  const r2 = computeReport({ loops: [], tasks: [], leads, windowDays: 30 });
  assert.equal(r2.leads.total, 4);
  assert.equal(r2.leads.won, 2);
  assert.equal(r2.leads.lost, 1);
  assert.equal(r2.leads.pipeline, 1);
  assert.equal(r2.leads.conversionRate, 67); // 2 / (2+1) = 66.67 → 67
  assert.equal(r2.leads.wonInWindow, 1); // only l1; l4 is outside the window
  assert.equal(r2.leads.pipelineValue, 0); // no value field modelled yet
});

test('productivity: focusHours sums time entries; velocityTrend is 7 long', () => {
  const timeEntries = [
    { id: 'te1', orgId: 'org', taskId: 't', userId: 'u1', startedAt: NOW, duration: 3600 },   // 1h
    { id: 'te2', orgId: 'org', taskId: 't', userId: 'u1', startedAt: NOW, duration: 1800 },   // 0.5h
  ] as any;
  const r = computeReport({ loops: [], tasks: [], leads: [], timeEntries });
  assert.equal(r.productivity.focusHours, 1.5); // 5400s
  assert.equal(r.productivity.velocityTrend.length, 7);
});

test('leaderboard: no users → empty (never synthetic names)', () => {
  const r = computeReport({ loops: [], tasks: [], leads: [] });
  assert.deepEqual(r.leaderboard, []);
});

test('leaderboard: points formula and descending sort', () => {
  // u1: 1 task done (3pts) + 1 loop closed (2pts) = 5pts
  // u2: 2 tasks done (6pts) + 50 focus minutes (2pts) = 8pts
  // u3: nothing = 0pts
  const loops = [makeLoop({ id: 'l1', status: 'closed', assignedTo: ['u1'] })];
  const tasks = [
    makeTask({ id: 't1', assignees: ['u1'], subtasks: [{ id: 's', title: '', done: true }] }),
    makeTask({ id: 't2', assignees: ['u2'], subtasks: [{ id: 's', title: '', done: true }] }),
    makeTask({ id: 't3', assignees: ['u2'], subtasks: [{ id: 's', title: '', done: true }] }),
  ];
  const timeEntries = [
    { id: 'te1', orgId: 'org', taskId: 't', userId: 'u2', startedAt: NOW, duration: 50 * 60 },
  ] as any;
  const users = [
    { userId: 'u1', name: 'Alex' },
    { userId: 'u2', name: 'Sam' },
    { userId: 'u3', name: 'Dana' },
  ];
  const r = computeReport({ loops, tasks, leads: [], timeEntries, users });
  assert.equal(r.leaderboard.length, 3);
  const [first, second, third] = r.leaderboard;
  assert.equal(first.userId, 'u2'); // 8pts
  assert.equal(first.points, 8);
  assert.equal(second.userId, 'u1'); // 5pts
  assert.equal(second.points, 5);
  assert.equal(third.userId, 'u3'); // 0pts
  assert.equal(third.points, 0);
});

test('summary is built from real numbers, not hardcoded', () => {
  const loops = [
    makeLoop({ id: 'a', status: 'closed', createdAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY + 10 * HOUR }),
  ];
  const tasks = [
    makeTask({ id: 't1', createdAt: NOW - 1 * DAY, subtasks: [{ id: 's', title: '', done: true }] }),
  ];
  const leads = [makeLead({ id: 'l1', stage: 'won', createdAt: NOW - 1 * DAY })];
  const r = computeReport({ loops, tasks, leads, windowDays: 30 });
  // 1 closed loop resolved in 10h → 100% on time.
  assert.equal(r.summary.headline, '100% of loops closed on time this period.');
  assert.equal(r.summary.sub, '1 tasks completed, 1 leads won.');
});

test('windowDays controls the lookback (10-day window)', () => {
  // A loop created 20 days ago is "in window" at 30 days but not at 10.
  const tasks = [
    makeTask({ id: 'old', createdAt: NOW - 20 * DAY, subtasks: [{ id: 's', title: '', done: true }] }),
    makeTask({ id: 'new', createdAt: NOW - 2 * DAY, subtasks: [{ id: 's', title: '', done: true }] }),
  ];
  const wide = computeReport({ loops: [], tasks, leads: [], windowDays: 30 });
  const narrow = computeReport({ loops: [], tasks, leads: [], windowDays: 10 });
  assert.equal(wide.tasks.completedInWindow, 2);
  assert.equal(narrow.tasks.completedInWindow, 1);
});

test('bestDay reflects the weekday with the most completions', () => {
  // Spread completions across distinct weekdays; the busiest wins.
  const tasks = [
    makeTask({ id: 't1', createdAt: Date.UTC(2026, 6, 1), subtasks: [{ id: 's', title: '', done: true }] }), // Wed
    makeTask({ id: 't2', createdAt: Date.UTC(2026, 6, 2), subtasks: [{ id: 's', title: '', done: true }] }), // Thu
    makeTask({ id: 't3', createdAt: Date.UTC(2026, 6, 2), subtasks: [{ id: 's', title: '', done: true }] }), // Thu (x2)
  ];
  const r = computeReport({ loops: [], tasks, leads: [], windowDays: 30 });
  assert.equal(r.productivity.bestDay, 'Thursday');
});
