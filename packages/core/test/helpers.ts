// Test harness: in-memory DB, fake clock, recording Outbound, quick bootstrap of an org + members.

import type { Actor, AuditEvent, CalendarFetcher, Llm, Member, Outbound, Role } from '@companybrain/types';
import { openDatabase, type Db } from '@companybrain/db';
import { createCore, type Core } from '../src/index.ts';

/** Mon 12 Oct 2026, 09:00 UTC */
export const T0 = Date.UTC(2026, 9, 12, 9, 0);
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export class FakeClock {
  now = T0;
  fn = () => this.now;
  advance(ms: number) {
    this.now += ms;
  }
  set(t: number) {
    this.now = t;
  }
}

export interface Sent {
  channel: 'whatsapp' | 'email' | 'push';
  to: string;
  text: string;
  subject?: string;
}

export class FakeOutbound implements Outbound {
  sent: Sent[] = [];
  configured = { whatsapp: true, email: true, push: true };
  goneEndpoints = new Set<string>();
  async whatsapp(to: string, text: string) {
    if (!this.configured.whatsapp) return false;
    this.sent.push({ channel: 'whatsapp', to, text });
    return true;
  }
  async email(to: string, subject: string, text: string) {
    if (!this.configured.email) return false;
    this.sent.push({ channel: 'email', to, subject, text });
    return true;
  }
  async push(sub: { endpoint: string }, payload: { title: string; body: string }) {
    if (!this.configured.push) return 'failed' as const;
    if (this.goneEndpoints.has(sub.endpoint)) return 'gone' as const;
    this.sent.push({ channel: 'push', to: sub.endpoint, text: `${payload.title}: ${payload.body}` });
    return 'sent' as const;
  }
  status() {
    return { ...this.configured };
  }
  to(handle: string) {
    return this.sent.filter((s) => s.to === handle);
  }
  clear() {
    this.sent = [];
  }
}

export const silentLog = { info() {}, warn() {}, error() {} };

export interface Env {
  db: Db;
  core: Core;
  s: Core['services'];
  clock: FakeClock;
  out: FakeOutbound;
  audits: AuditEvent[];
  tick: () => Promise<number>;
}

export function makeEnv(opts: { db?: Db; clock?: FakeClock; llm?: Llm | null; calendar?: CalendarFetcher; out?: FakeOutbound } = {}): Env {
  const db = opts.db ?? openDatabase(':memory:', { secret: 'test-secret' });
  const clock = opts.clock ?? new FakeClock();
  const out = opts.out ?? new FakeOutbound();
  const audits: AuditEvent[] = [];
  const core = createCore({ db, outbound: out, clock: clock.fn, log: silentLog, llm: opts.llm ?? null, calendar: opts.calendar, onAudit: (e) => void audits.push(e) });
  return { db, core, s: core.services, clock, out, audits, tick: () => core.scheduler.tick() };
}

export function actorOf(m: Member, via: Actor['via'] = 'session'): Actor {
  return { orgId: m.orgId, memberId: m.id, role: m.role, kind: m.kind, via };
}

export interface Team {
  owner: Member;
  ownerA: Actor;
  token: string;
  add(name: string, role?: Role, extra?: Partial<{ email: string; phone: string; timezone: string }>): Promise<{ m: Member; a: Actor }>;
  addAgent(name: string, supervisorId?: string): Promise<{ m: Member; a: Actor }>;
}

let seq = 0;
export async function bootstrap(env: Env, opts: { orgName?: string; tz?: string; email?: string } = {}): Promise<Team> {
  const res = await env.s.auth.setup({ orgName: opts.orgName ?? 'Acme', name: 'Shrijeet Owner', email: opts.email ?? `owner${++seq}@acme.io`, password: 'correct horse', timezone: opts.tz ?? 'UTC' });
  const ownerA = (await env.s.auth.resolveSession(res.token))!;
  // Quiet hours off by default in tests (enabled explicitly where tested).
  const owner = await env.s.members.update(ownerA, res.member.id, { prefs: { quietStart: null, quietEnd: null, digestHour: null } });
  return {
    owner,
    ownerA,
    token: res.token,
    async add(name, role = 'member', extra = {}) {
      const m0 = await env.s.members.create(ownerA, { kind: 'human', role, name, email: extra.email ?? `${name.toLowerCase().replace(/\s+/g, '.')}.${++seq}@acme.io`, password: 'password123', phone: extra.phone ?? null, timezone: extra.timezone });
      const m = await env.s.members.update(ownerA, m0.id, { prefs: { quietStart: null, quietEnd: null, digestHour: null } });
      return { m, a: actorOf(m) };
    },
    async addAgent(name, supervisorId) {
      const m = await env.s.members.create(ownerA, { kind: 'agent', role: 'agent', name, agent: { provider: 'claude', description: 'test agent', supervisorId: supervisorId ?? owner.id } });
      return { m, a: { ...actorOf(m, 'api_key'), scopes: ['read', 'write'] } };
    },
  };
}

/** Run scheduler ticks while advancing the fake clock in steps up to `ms`. */
export async function advance(env: Env, ms: number, step = 5 * MIN) {
  const end = env.clock.now + ms;
  while (env.clock.now < end) {
    env.clock.advance(Math.min(step, end - env.clock.now));
    await env.tick();
  }
}
