import { randomBytes, randomInt } from 'node:crypto';
import type { Actor, Member, Priority, Subtask } from '@companybrain/types';
import { SYSTEM_MEMBER_ID } from '@companybrain/types';
import { safeTz } from './time';

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

/** Crypto-backed uniform [0,1). */
export function cryptoRandom(): number {
  return randomInt(0, 2 ** 32) / 2 ** 32;
}

/** FNV-1a 32-bit hash (deterministic seeds). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function systemActor(orgId: string): Actor {
  return { orgId, memberId: SYSTEM_MEMBER_ID, role: 'owner', kind: 'human', via: 'system' };
}

export interface MemberInfo {
  id: string;
  name: string;
  kind: 'human' | 'agent';
  role: Member['role'];
  tz: string;
  member: Member;
}

export function toInfo(m: Member): MemberInfo {
  return { id: m.id, name: m.name, kind: m.kind, role: m.role, tz: safeTz(m.timezone), member: m };
}

/** Defensive view of a task snapshot from an audit event. */
export interface TaskSnap {
  id: string;
  projectId: string | null;
  title: string;
  status: string;
  priority: Priority;
  assigneeIds: string[];
  creatorId: string | null;
  dueAt: number | null;
  subtasks: Pick<Subtask, 'id' | 'title' | 'done' | 'doneBy'>[];
  createdAt: number | null;
  completedAt: number | null;
  completedBy: string | null;
}

const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function taskSnap(r: Record<string, unknown> | null | undefined, fallbackId: string): TaskSnap | null {
  if (!r || typeof r !== 'object') return null;
  const pr = str(r.priority) as Priority | null;
  const subs = Array.isArray(r.subtasks) ? r.subtasks : [];
  return {
    id: str(r.id) ?? fallbackId,
    projectId: str(r.projectId),
    title: str(r.title) ?? 'Untitled mission',
    status: str(r.status) ?? 'todo',
    priority: pr && PRIORITIES.includes(pr) ? pr : 'none',
    assigneeIds: Array.isArray(r.assigneeIds) ? r.assigneeIds.filter((x): x is string => typeof x === 'string') : [],
    creatorId: str(r.creatorId),
    dueAt: num(r.dueAt),
    subtasks: subs
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => ({ id: str(s.id) ?? '', title: str(s.title) ?? '', done: s.done === true, doneBy: str(s.doneBy) }))
      .filter((s) => s.id),
    createdAt: num(r.createdAt),
    completedAt: num(r.completedAt),
    completedBy: str(r.completedBy),
  };
}

export function fmtXp(xp: number): string {
  return xp >= 0 ? `+${xp} XP` : `−${Math.abs(xp)} XP`;
}
