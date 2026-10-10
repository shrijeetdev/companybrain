// Orgs, members, sessions, API keys, kv. Every method is org-scoped except the few that resolve
// a credential (session token hash, API key hash, login email) — those return the row's orgId.

import type BetterSqlite3 from 'better-sqlite3';
import type { ApiKey, ApiScope, Member, MemberKind, MemberPrefs, OrgSettings, Role } from '@companybrain/types';
import { defaultPrefs, normEmail, phoneDigits } from '../util.js';

type SQL = BetterSqlite3.Database;
type Row = Record<string, any>;

export const json = (v: unknown): string | null => (v === null || v === undefined ? null : JSON.stringify(v));
export function parseJson<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// ─── orgs ────────────────────────────────────────────────────────────────────

function rowToOrg(r: Row): OrgSettings {
  return {
    id: r.id,
    name: r.name,
    timezone: r.timezone,
    logo: r.logo ?? null,
    workdayStart: r.workday_start,
    workdayEnd: r.workday_end,
    defaultReminderOffsets: parseJson<number[]>(r.default_reminder_offsets, [1440, 60, 0]),
    escalateAfterMin: r.escalate_after_min ?? null,
    agentStaleAfterMin: r.agent_stale_after_min,
    intakeAutoAck: !!r.intake_auto_ack,
    currency: typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency) ? r.currency : 'USD',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function orgRepo(db: SQL) {
  const save = db.prepare(`UPDATE orgs SET name=@name, timezone=@timezone, logo=@logo, workday_start=@workdayStart, workday_end=@workdayEnd,
    default_reminder_offsets=@offsets, escalate_after_min=@escalateAfterMin, agent_stale_after_min=@agentStaleAfterMin, intake_auto_ack=@ack, currency=@currency, updated_at=@updatedAt WHERE id=@id`);
  const params = (o: OrgSettings) => ({ ...o, offsets: JSON.stringify(o.defaultReminderOffsets), ack: o.intakeAutoAck ? 1 : 0, currency: o.currency || 'USD' });
  return {
    /** All orgs (system-level: scheduler bootstrap / single-org routing). */
    list(): OrgSettings[] {
      return (db.prepare('SELECT * FROM orgs ORDER BY created_at').all() as Row[]).map(rowToOrg);
    },
    get(orgId: string): OrgSettings | null {
      const r = db.prepare('SELECT * FROM orgs WHERE id=?').get(orgId) as Row | undefined;
      return r ? rowToOrg(r) : null;
    },
    insert(o: OrgSettings): void {
      db.prepare(`INSERT INTO orgs (id, name, timezone, logo, workday_start, workday_end, default_reminder_offsets, escalate_after_min, agent_stale_after_min, intake_auto_ack, currency, created_at, updated_at)
        VALUES (@id, @name, @timezone, @logo, @workdayStart, @workdayEnd, @offsets, @escalateAfterMin, @agentStaleAfterMin, @ack, @currency, @createdAt, @updatedAt)`).run(params(o));
    },
    save(o: OrgSettings): void {
      save.run(params(o));
    },
  };
}

// ─── members ─────────────────────────────────────────────────────────────────

function rowToMember(r: Row): Member {
  const kind = r.kind as MemberKind;
  const prefs: MemberPrefs = { ...defaultPrefs(kind), ...parseJson<Partial<MemberPrefs>>(r.prefs, {}) };
  return {
    id: r.id,
    orgId: r.org_id,
    kind,
    role: r.role as Role,
    name: r.name,
    email: r.email ?? null,
    phone: r.phone ?? null,
    title: r.title ?? null,
    initials: r.initials,
    color: r.color,
    avatarUrl: r.avatar_url ?? null,
    timezone: r.timezone,
    active: !!r.active,
    prefs,
    agent: kind === 'agent'
      ? { provider: r.agent_provider ?? 'custom', description: r.agent_description ?? '', lastSeenAt: r.agent_last_seen_at ?? null, supervisorId: r.agent_supervisor_id ?? null }
      : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function memberParams(m: Member) {
  return {
    id: m.id,
    orgId: m.orgId,
    kind: m.kind,
    role: m.role,
    name: m.name,
    email: m.email,
    emailLc: normEmail(m.email),
    phone: m.phone,
    phoneDigits: phoneDigits(m.phone),
    title: m.title,
    initials: m.initials,
    color: m.color,
    avatarUrl: m.avatarUrl,
    timezone: m.timezone,
    active: m.active ? 1 : 0,
    prefs: JSON.stringify(m.prefs),
    agentProvider: m.agent?.provider ?? null,
    agentDescription: m.agent?.description ?? null,
    agentLastSeenAt: m.agent?.lastSeenAt ?? null,
    agentSupervisorId: m.agent?.supervisorId ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export function memberRepo(db: SQL) {
  return {
    list(orgId: string, opts: { includeInactive?: boolean; kind?: MemberKind } = {}): Member[] {
      let sql = 'SELECT * FROM members WHERE org_id=@orgId';
      if (!opts.includeInactive) sql += ' AND active=1';
      if (opts.kind) sql += ' AND kind=@kind';
      sql += ' ORDER BY kind, name COLLATE NOCASE';
      return (db.prepare(sql).all({ orgId, kind: opts.kind ?? null }) as Row[]).map(rowToMember);
    },
    get(orgId: string, id: string): Member | null {
      const r = db.prepare('SELECT * FROM members WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r ? rowToMember(r) : null;
    },
    getMany(orgId: string, ids: string[]): Member[] {
      if (!ids.length) return [];
      return (db.prepare('SELECT * FROM members WHERE org_id=? AND id IN (SELECT value FROM json_each(?))').all(orgId, JSON.stringify(ids)) as Row[]).map(rowToMember);
    },
    insert(m: Member, passwordHash: string | null): void {
      db.prepare(`INSERT INTO members (id, org_id, kind, role, name, email, email_lc, phone, phone_digits, title, initials, color, avatar_url, timezone, active, prefs, password_hash,
          agent_provider, agent_description, agent_last_seen_at, agent_supervisor_id, created_at, updated_at)
        VALUES (@id, @orgId, @kind, @role, @name, @email, @emailLc, @phone, @phoneDigits, @title, @initials, @color, @avatarUrl, @timezone, @active, @prefs, @passwordHash,
          @agentProvider, @agentDescription, @agentLastSeenAt, @agentSupervisorId, @createdAt, @updatedAt)`).run({ ...memberParams(m), passwordHash });
    },
    save(m: Member): void {
      db.prepare(`UPDATE members SET role=@role, name=@name, email=@email, email_lc=@emailLc, phone=@phone, phone_digits=@phoneDigits, title=@title, initials=@initials,
          color=@color, avatar_url=@avatarUrl, timezone=@timezone, active=@active, prefs=@prefs, agent_provider=@agentProvider, agent_description=@agentDescription,
          agent_last_seen_at=@agentLastSeenAt, agent_supervisor_id=@agentSupervisorId, updated_at=@updatedAt
        WHERE org_id=@orgId AND id=@id`).run(memberParams(m));
    },
    getPasswordHash(orgId: string, id: string): string | null {
      const r = db.prepare('SELECT password_hash FROM members WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r?.password_hash ?? null;
    },
    setPasswordHash(orgId: string, id: string, hash: string, at: number): void {
      db.prepare('UPDATE members SET password_hash=?, updated_at=? WHERE org_id=? AND id=?').run(hash, at, orgId, id);
    },
    /** Login lookup by email (credential resolution; returns the row's org). Active humans only. */
    findForLogin(identifier: string): { member: Member; passwordHash: string } | null {
      const e = normEmail(identifier);
      if (!e) return null;
      const r = db.prepare("SELECT * FROM members WHERE email_lc=? AND kind='human' AND active=1 AND password_hash IS NOT NULL ORDER BY created_at LIMIT 1").get(e) as Row | undefined;
      return r ? { member: rowToMember(r), passwordHash: r.password_hash } : null;
    },
    findByEmail(orgId: string, email: string): Member | null {
      const e = normEmail(email);
      if (!e) return null;
      const r = db.prepare('SELECT * FROM members WHERE org_id=? AND email_lc=? ORDER BY active DESC, created_at LIMIT 1').get(orgId, e) as Row | undefined;
      return r ? rowToMember(r) : null;
    },
    /**
     * Exact E.164 match: all digits including the country code must be equal. No suffix /
     * "last 10 digits" matching — +44 7700 900123 must never match +1 …7700900123.
     */
    findByPhone(orgId: string, phone: string): Member[] {
      const d = phoneDigits(phone);
      if (!d) return [];
      return (db.prepare('SELECT * FROM members WHERE org_id=? AND active=1 AND phone_digits=?').all(orgId, d) as Row[]).map(rowToMember);
    },
    countActive(orgId: string, role: Role): number {
      return (db.prepare('SELECT COUNT(*) c FROM members WHERE org_id=? AND role=? AND active=1').get(orgId, role) as Row).c;
    },
    /** System-level: is there any active human owner in any org (first-run detection). */
    anyActiveOwner(): boolean {
      return !!db.prepare("SELECT 1 FROM members WHERE role='owner' AND kind='human' AND active=1 LIMIT 1").get();
    },
    touchAgentSeen(orgId: string, id: string, at: number): void {
      db.prepare("UPDATE members SET agent_last_seen_at=? WHERE org_id=? AND id=? AND kind='agent'").run(at, orgId, id);
    },
  };
}

// ─── sessions ────────────────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  orgId: string;
  memberId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number;
  ip: string | null;
  userAgent: string | null;
}

export function sessionRepo(db: SQL) {
  return {
    insert(s: SessionRow): void {
      db.prepare(`INSERT INTO sessions (id, org_id, member_id, token_hash, created_at, expires_at, last_used_at, ip, user_agent)
        VALUES (@id, @orgId, @memberId, @tokenHash, @createdAt, @expiresAt, @lastUsedAt, @ip, @userAgent)`).run(s);
    },
    /** Credential resolution by token hash. */
    findByHash(tokenHash: string): SessionRow | null {
      const r = db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(tokenHash) as Row | undefined;
      return r
        ? { id: r.id, orgId: r.org_id, memberId: r.member_id, tokenHash: r.token_hash, createdAt: r.created_at, expiresAt: r.expires_at, lastUsedAt: r.last_used_at, ip: r.ip, userAgent: r.user_agent }
        : null;
    },
    touch(orgId: string, id: string, expiresAt: number, lastUsedAt: number): void {
      db.prepare('UPDATE sessions SET expires_at=?, last_used_at=? WHERE org_id=? AND id=?').run(expiresAt, lastUsedAt, orgId, id);
    },
    deleteByHash(tokenHash: string): void {
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
    },
    delete(orgId: string, id: string): void {
      db.prepare('DELETE FROM sessions WHERE org_id=? AND id=?').run(orgId, id);
    },
    deleteForMember(orgId: string, memberId: string): number {
      return db.prepare('DELETE FROM sessions WHERE org_id=? AND member_id=?').run(orgId, memberId).changes;
    },
    countForMember(orgId: string, memberId: string): number {
      return (db.prepare('SELECT COUNT(*) c FROM sessions WHERE org_id=? AND member_id=?').get(orgId, memberId) as Row).c;
    },
    /** Housekeeping (system-level). */
    deleteExpired(now: number): number {
      return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes;
    },
  };
}

// ─── api keys ────────────────────────────────────────────────────────────────

function rowToKey(r: Row): ApiKey {
  return {
    id: r.id,
    orgId: r.org_id,
    memberId: r.member_id,
    name: r.name,
    prefix: r.prefix,
    scopes: parseJson<ApiScope[]>(r.scopes, []),
    createdBy: r.created_by,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at ?? null,
    expiresAt: r.expires_at ?? null,
    revokedAt: r.revoked_at ?? null,
  };
}

export function apiKeyRepo(db: SQL) {
  return {
    insert(k: ApiKey, keyHash: string): void {
      db.prepare(`INSERT INTO api_keys (id, org_id, member_id, name, prefix, key_hash, scopes, created_by, created_at, last_used_at, expires_at, revoked_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(k.id, k.orgId, k.memberId, k.name, k.prefix, keyHash, JSON.stringify(k.scopes), k.createdBy, k.createdAt, k.lastUsedAt, k.expiresAt, k.revokedAt);
    },
    /** Credential resolution by key hash. */
    findByHash(keyHash: string): ApiKey | null {
      const r = db.prepare('SELECT * FROM api_keys WHERE key_hash=?').get(keyHash) as Row | undefined;
      return r ? rowToKey(r) : null;
    },
    get(orgId: string, id: string): ApiKey | null {
      const r = db.prepare('SELECT * FROM api_keys WHERE org_id=? AND id=?').get(orgId, id) as Row | undefined;
      return r ? rowToKey(r) : null;
    },
    list(orgId: string, memberIds?: string[]): ApiKey[] {
      const rows = memberIds
        ? db.prepare('SELECT * FROM api_keys WHERE org_id=? AND member_id IN (SELECT value FROM json_each(?)) ORDER BY created_at DESC').all(orgId, JSON.stringify(memberIds))
        : db.prepare('SELECT * FROM api_keys WHERE org_id=? ORDER BY created_at DESC').all(orgId);
      return (rows as Row[]).map(rowToKey);
    },
    revoke(orgId: string, id: string, at: number): void {
      db.prepare('UPDATE api_keys SET revoked_at=? WHERE org_id=? AND id=? AND revoked_at IS NULL').run(at, orgId, id);
    },
    revokeForMember(orgId: string, memberId: string, at: number): number {
      return db.prepare('UPDATE api_keys SET revoked_at=? WHERE org_id=? AND member_id=? AND revoked_at IS NULL').run(at, orgId, memberId).changes;
    },
    touch(orgId: string, id: string, at: number): void {
      db.prepare('UPDATE api_keys SET last_used_at=? WHERE org_id=? AND id=?').run(at, orgId, id);
    },
  };
}

// ─── kv ──────────────────────────────────────────────────────────────────────

/** Small org-scoped settings store. orgId '' = deployment-wide. */
export function kvRepo(db: SQL) {
  return {
    get<T = unknown>(orgId: string, key: string): T | null {
      const r = db.prepare('SELECT value FROM kv WHERE org_id=? AND key=?').get(orgId, key) as Row | undefined;
      return r ? parseJson<T | null>(r.value, null) : null;
    },
    set(orgId: string, key: string, value: unknown, at = Date.now()): void {
      db.prepare('INSERT INTO kv (org_id, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(org_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
        .run(orgId, key, JSON.stringify(value), at);
    },
    delete(orgId: string, key: string): void {
      db.prepare('DELETE FROM kv WHERE org_id=? AND key=?').run(orgId, key);
    },
  };
}
