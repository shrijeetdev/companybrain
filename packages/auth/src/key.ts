import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Role } from '@companybrain/types';
import type { Auth, AuthUser, Capability, LoginResult, Principal } from './port';
import { LOCAL_ORG_ID } from './local';
import { CAPS_BY_ROLE, normalizeRole, initialsFor } from './capabilities';

type RawUser = {
  id?: string;
  userId?: string;
  orgId?: string;
  role?: string;
  name?: string;
  email?: string;
  initials?: string;
  key?: string;
};

type Session = {
  token: string;
  userId: string;
  orgId: string;
  role: Role;
  expiresAt: number;
};

const DEFAULT_USERS: RawUser[] = [
  { id: 'user_local', role: 'ceo', name: 'You', email: 'you@companybrain.local', initials: 'YO' },
  { id: 'user_ceo', role: 'ceo', name: 'James Carter', email: 'james@companybrain.local', initials: 'JC' },
  { id: 'user_monty', role: 'manager', name: 'Monty Singh', email: 'monty@companybrain.local', initials: 'MS' },
  { id: 'user_emp', role: 'employee', name: 'Alex Kumar', email: 'alex@companybrain.local', initials: 'AK' },
  { id: 'user_client', role: 'client', name: 'Dana Carter', email: 'dana@client.local', initials: 'DC' },
];

function timingSafeMatch(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseUsers(raw: string | undefined, orgId: string): { users: AuthUser[]; perUserKeys: Map<string, string> } {
  const parsed = (() => {
    if (!raw?.trim()) return DEFAULT_USERS;
    try {
      const val = JSON.parse(raw);
      if (Array.isArray(val)) return val as RawUser[];
      if (val && Array.isArray((val as { users?: unknown[] }).users)) return (val as { users: RawUser[] }).users;
      return DEFAULT_USERS;
    } catch {
      return DEFAULT_USERS;
    }
  })();

  const users: AuthUser[] = [];
  const perUserKeys = new Map<string, string>();

  for (const u of parsed) {
    const id = (u.userId ?? u.id ?? '').trim() || `user_${Math.random().toString(36).slice(2, 8)}`;
    const name = (u.name ?? id.replace(/^user_/, '').replace(/[_-]/g, ' ')).trim();
    const user: AuthUser = {
      userId: id,
      orgId: (u.orgId ?? orgId).trim() || orgId,
      role: normalizeRole(u.role),
      name,
      email: u.email?.trim() || undefined,
      initials: (u.initials?.trim() || initialsFor(name)).slice(0, 3).toUpperCase(),
    };
    users.push(user);
    if (typeof u.key === 'string' && u.key.trim()) perUserKeys.set(user.userId, u.key.trim());
  }

  if (!users.length) {
    users.push({ userId: 'user_local', orgId, role: 'ceo', name: 'You', email: 'you@companybrain.local', initials: 'YO' });
  }

  return { users, perUserKeys };
}

export class KeyAuth implements Auth {
  mode = 'key' as const;

  private readonly orgId: string;
  private readonly globalKey: string;
  private readonly sessionTtlMs: number;
  private readonly users: AuthUser[];
  private readonly userMap: Map<string, AuthUser>;
  private readonly userByEmail: Map<string, AuthUser>;
  private readonly perUserKeys: Map<string, string>;
  private readonly sessions = new Map<string, Session>();

  constructor() {
    this.orgId = process.env.COMPANYBRAIN_ORG_ID?.trim() || LOCAL_ORG_ID;
    this.globalKey = process.env.COMPANYBRAIN_ACCESS_KEY?.trim() || '';
    const ttlHours = Number(process.env.COMPANYBRAIN_SESSION_TTL_HOURS ?? 168);
    this.sessionTtlMs = (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 168) * 60 * 60 * 1000;

    const parsed = parseUsers(process.env.COMPANYBRAIN_USERS, this.orgId);
    this.users = parsed.users;
    this.userMap = new Map(this.users.map((u) => [u.userId, u]));
    this.userByEmail = new Map(this.users.filter((u) => !!u.email).map((u) => [String(u.email).toLowerCase(), u]));
    this.perUserKeys = parsed.perUserKeys;
  }

  async init() {}

  async authenticate(token?: string): Promise<Principal | null> {
    this.cleanupExpired();
    if (!token) return null;
    const sess = this.sessions.get(token);
    if (!sess) return null;
    if (sess.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return { userId: sess.userId, orgId: sess.orgId, role: sess.role };
  }

  async current(): Promise<Principal> {
    const first = this.users[0] ?? { userId: 'user_local', orgId: this.orgId, role: 'ceo' as Role };
    return { userId: first.userId, orgId: first.orgId, role: first.role };
  }

  can(principal: Principal, capability: Capability): boolean {
    return CAPS_BY_ROLE[principal.role]?.has(capability) ?? false;
  }

  listUsers(): AuthUser[] {
    return this.users.map((u) => ({ ...u }));
  }

  getUser(userId: string): AuthUser | null {
    const u = this.userMap.get(userId);
    return u ? { ...u } : null;
  }

  async login(userIdOrEmail: string, key: string): Promise<LoginResult | null> {
    this.cleanupExpired();
    const lookup = (userIdOrEmail ?? '').trim();
    const secret = (key ?? '').trim();
    if (!lookup || !secret) return null;

    const byId = this.userMap.get(lookup);
    const byEmail = this.userByEmail.get(lookup.toLowerCase());
    const user = byId ?? byEmail ?? null;
    if (!user) return null;

    const expected = this.perUserKeys.get(user.userId) ?? this.globalKey;
    if (!expected || !timingSafeMatch(secret, expected)) return null;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + this.sessionTtlMs;
    this.sessions.set(token, { token, userId: user.userId, orgId: user.orgId, role: user.role, expiresAt });

    return {
      token,
      user: { ...user },
      principal: { userId: user.userId, orgId: user.orgId, role: user.role },
      expiresAt,
    };
  }

  async logout(token: string): Promise<void> {
    if (!token) return;
    this.sessions.delete(token);
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [token, sess] of this.sessions) {
      if (sess.expiresAt <= now) this.sessions.delete(token);
    }
  }
}
