// Tests for the productivity-methods engine. Pure functions, no DB.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '@companybrain/types';
import {
  eisenhower, moscow, abcde, gtd, twoMinute, eatThatFrog,
  threeThree, pareto, timeBlocking, pomodoro, METHODS, METHOD_LIST,
} from '../src/methods.js';

function makeTask(partial: Partial<Task>): Task {
  return {
    id: partial.id ?? `t_${Math.random().toString(36).slice(2, 8)}`,
    orgId: 'org_test',
    emoji: partial.emoji ?? '',
    title: partial.title ?? 'Task',
    list: partial.list ?? 'Inbox',
    day: partial.day ?? 'today',
    priority: partial.priority ?? null,
    recurring: partial.recurring ?? false,
    recur: partial.recur ?? null,
    assignees: partial.assignees ?? [],
    createdBy: 'user_test',
    subtasks: partial.subtasks ?? [],
    comments: partial.comments ?? [],
    dueAt: partial.dueAt ?? null,
    createdAt: partial.createdAt ?? Date.now(),
  };
}

test('eisenhower: classifies into 4 quadrants by urgency × importance', () => {
  const now = Date.now();
  const tasks = [
    makeTask({ id: 'q1', title: 'Urgent important', priority: 'high', day: 'today' }),
    makeTask({ id: 'q2', title: 'Important not urgent', priority: 'high', day: 'upcoming' }),
    makeTask({ id: 'q3', title: 'Urgent not important', priority: 'low', day: 'today' }),
    makeTask({ id: 'q4', title: 'Neither', priority: 'low', day: 'upcoming' }),
  ];
  const r = eisenhower(tasks, now);
  assert.equal(r.q1.length, 1);
  assert.equal(r.q2.length, 1);
  assert.equal(r.q3.length, 1);
  assert.equal(r.q4.length, 1);
  assert.equal(r.q1[0]!.id, 'q1');
  assert.equal(r.q2[0]!.id, 'q2');
});

test('eisenhower: skips completed tasks', () => {
  const tasks = [
    makeTask({ id: 'done', title: 'Done', priority: 'high', day: 'today', subtasks: [{ id: 's1', title: 'x', done: true }] }),
    makeTask({ id: 'open', title: 'Open', priority: 'high', day: 'today' }),
  ];
  const r = eisenhower(tasks);
  assert.equal(r.q1.length, 1);
  assert.equal(r.q1[0]!.id, 'open');
});

test('moscow: high→must, med→should, low→could, overdue-null→wont', () => {
  const now = Date.now();
  const tasks = [
    makeTask({ id: 'm', priority: 'high' }),
    makeTask({ id: 's', priority: 'med' }),
    makeTask({ id: 'c', priority: 'low' }),
    makeTask({ id: 'w', priority: null, dueAt: now - 1000 }),
  ];
  const r = moscow(tasks, now);
  assert.equal(r.must.length, 1);
  assert.equal(r.should.length, 1);
  assert.equal(r.could.length, 1);
  assert.equal(r.wont.length, 1);
});

test('abcde: ranks A-E and sorts most important first', () => {
  const now = Date.now();
  const tasks = [
    makeTask({ id: 'e', priority: 'low' }),
    makeTask({ id: 'a', priority: 'high', dueAt: now - 1000 }),
    makeTask({ id: 'b', priority: 'high' }),
  ];
  const r = abcde(tasks, now);
  assert.equal(r.ranked[0]!.rank, 'A');
  assert.equal(r.ranked[0]!.task.id, 'a');
  assert.equal(r.ranked[r.ranked.length - 1]!.rank, 'E');
});

test('gtd: groups by @tag and infers from emoji', () => {
  const tasks = [
    makeTask({ id: 'call1', title: '@call John', emoji: '' }),
    makeTask({ id: 'call2', title: 'Ring Sarah', emoji: '📞' }),
    makeTask({ id: 'mail', title: 'Send brief', emoji: '📧' }),
    makeTask({ id: 'none', title: 'Plan Q3', emoji: '' }),
  ];
  const r = gtd(tasks);
  assert.equal(r.contexts['@call'].length, 2);
  assert.equal(r.contexts['@email'].length, 1);
  assert.equal(r.inbox.length, 1);
  assert.equal(r.inbox[0]!.id, 'none');
});

test('twoMinute: flags quick verbs', () => {
  const tasks = [
    makeTask({ id: 'quick', title: 'Call mom' }),
    makeTask({ id: 'quick2', title: 'Reply to email' }),
    makeTask({ id: 'big', title: 'Write annual report' }),
  ];
  const r = twoMinute(tasks);
  assert.equal(r.twoMinute.length, 2);
  assert.equal(r.longer.length, 1);
});

test('eatThatFrog: returns highest priority + overdue task', () => {
  const now = Date.now();
  const tasks = [
    makeTask({ id: 'low', title: 'Low', priority: 'low' }),
    makeTask({ id: 'frog', title: 'Critical', priority: 'high', dueAt: now - 1000 }),
    makeTask({ id: 'high', title: 'Important', priority: 'high' }),
  ];
  const r = eatThatFrog(tasks, now);
  assert.ok(r.frog);
  assert.equal(r.frog!.id, 'frog');
  assert.ok(r.why.includes('frog'));
});

test('eatThatFrog: returns null frog with empty input', () => {
  const r = eatThatFrog([]);
  assert.equal(r.frog, null);
});

test('threeThree: returns max 3 deep, 3 medium, 3 small', () => {
  const tasks = [
    ...Array.from({ length: 5 }, (_, i) => makeTask({ id: `d${i}`, priority: 'high' })),
    ...Array.from({ length: 5 }, (_, i) => makeTask({ id: `m${i}`, priority: 'med' })),
    ...Array.from({ length: 5 }, (_, i) => makeTask({ id: `s${i}`, priority: 'low' })),
  ];
  const r = threeThree(tasks);
  assert.equal(r.deep.length, 3);
  assert.equal(r.medium.length, 3);
  assert.equal(r.small.length, 3);
});

test('pareto: vital set is ~20% of tasks, at least 1', () => {
  const tasks = Array.from({ length: 10 }, (_, i) =>
    makeTask({ id: `t${i}`, priority: i < 2 ? 'high' : 'low', subtasks: i < 2 ? [{ id: 's', title: 'x', done: false }] : [] })
  );
  const r = pareto(tasks);
  assert.equal(r.vital.length, 2); // ceil(10*0.2)=2
  assert.equal(r.useful.length, 8);
});

test('timeBlocking: produces ordered blocks starting at 09:00', () => {
  const tasks = [
    makeTask({ id: 'deep', title: 'Write spec', priority: 'high' }),
    makeTask({ id: 'meet', title: 'Standup sync' }),
    makeTask({ id: 'admin', title: 'File expenses' }),
  ];
  const r = timeBlocking(tasks);
  assert.ok(r.length >= 1);
  assert.equal(r[0]!.start, '09:00');
  // Meetings land after deep work
  const meetBlock = r.find((b) => b.task.id === 'meet');
  assert.ok(meetBlock);
  assert.equal(meetBlock!.blockType, 'meeting');
});

test('pomodoro: estimates sessions by word count + subtasks', () => {
  const tasks = [
    makeTask({ id: 'short', title: 'Pay bill', subtasks: [] }),
    makeTask({ id: 'long', title: 'Write the comprehensive quarterly business review document with executive summary financial analysis and strategic recommendations', subtasks: [{ id: 's', title: 'x', done: false }, { id: 's2', title: 'y', done: false }] }),
  ];
  const r = pomodoro(tasks);
  const short = r.find((row) => row.task.id === 'short')!;
  const long = r.find((row) => row.task.id === 'long')!;
  assert.equal(short.sessions, 1); // <=5 words, 0 subtasks
  assert.ok(long.sessions >= 5, `expected >=5 got ${long.sessions}`); // >15 words → 4 + 2 subtasks
  assert.equal(long.minutes, long.sessions * 25);
});

test('METHODS registry: all 10 methods present with metadata', () => {
  const ids = Object.keys(METHODS);
  assert.equal(ids.length, 10);
  for (const id of ids) {
    const entry = METHODS[id as keyof typeof METHODS]!;
    assert.ok(entry.meta.name);
    assert.ok(entry.meta.icon);
    assert.ok(entry.meta.description);
    assert.equal(entry.meta.id, id);
  }
});

test('METHOD_LIST: returns array of all metadata', () => {
  assert.equal(METHOD_LIST.length, 10);
  assert.ok(METHOD_LIST.every((m) => typeof m.name === 'string'));
});

test('METHODS registry: run() dispatches and returns structured result', () => {
  const tasks = [makeTask({ id: 't1', priority: 'high', day: 'today' })];
  const r = METHODS.eisenhower.run(tasks) as { q1: Task[] };
  assert.equal(r.q1.length, 1);
});
