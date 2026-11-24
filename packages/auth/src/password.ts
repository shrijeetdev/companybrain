// Real multi-user auth: email/username + password, backed by a SQLite `users`
// table. This is the recommended production mode — it replaces the shared
// access-key model with per-person accounts and an admin (role `ceo`) who can
// create, edit, and remove users, and reset anyone's password.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Role } from '@companybrain/types';
import type {
  Auth,
  AuthUser,
  Capability,
  CreateUserInput,
  LoginResult,
  Principal,
  UpdateUserInput,
} from './port';
import { LOCAL_ORG_ID } from './local';
import { CAPS_BY_ROLE, normalizeRole, initialsFor } from './capabilities';
import { hashPassword, verifyPassword } from './hash';

type UserRow = {
  id: string;
  org_id: string;
  email: string;
  username: string | null;
  name: string;
  initials: string;
  role: string;
  password_hash: string;
  active: number;
  created_at: number;
  created_by: string | null;
  updated_at: number;
};

type Session = { token: string; userId: string; orgId: string; role: Role; expiresAt: number };

function rowToUser(row: UserRow): AuthUser {
  return {
    userId: row.id,
    orgId: row.org_id,
    role: normalizeRole(row.role),
    name: row.name,
    email: row.email,
    initials: row.initials,
    username: row.username ?? undefined,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

export class PasswordAuth implements Auth {
  mode = 'password' as const;

  private readonly db: Database.Database;
  private readonly orgId: string;
  private readonly sessionTtlMs: number;
  private readonly sessions = new Map<string, Session>();
  private readonly failedLogins = new Map<string, { count: number; lockedUntil: number }>();
  private lastCleanup = 0;

  constructor() {
    this.orgId = process.env.COMPANYBRAIN_ORG_ID?.trim() || LOCAL_ORG_ID;
    const ttlHours = Number(process.env.COMPANYBRAIN_SESSION_TTL_HOURS ?? 168);
    this.sessionTtlMs = (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 168) * 60 * 60 * 1000;

    const fromEnv = process.env.COMPANYBRAIN_DB_PATH;
    const dir = join(homedir(), '.companybrain');
    mkdirSync(dir, { recursive: true });
    const filePath = fromEnv ?? join(dir, 'companybrain.sqlite');

    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        username TEXT UNIQUE,
        name TEXT NOT NULL,
        initials TEXT,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        created_by TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
      -- Sessions survive restarts and redeploys (only a hash of the token is stored).
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      -- One-time "set your password" invites (only a hash of the token is stored).
      CREATE TABLE IF NOT EXISTS auth_invites (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
  }

  async init() {
    this.seedAdminIfNeeded();
  }

  private seedAdminIfNeeded() {
    const email = (process.env.COMPANYBRAIN_ADMIN_EMAIL ?? '').trim().toLowerCase();
    const password = process.env.COMPANYBRAIN_ADMIN_PASSWORD ?? '';

    if (!email || !password) {
      const { c } = this.db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
      if (c === 0) {
        console.warn(
          '[companybrain] PasswordAuth: no users exist yet and COMPANYBRAIN_ADMIN_EMAIL / ' +
          'COMPANYBRAIN_ADMIN_PASSWORD are not set. Set both env vars and restart to bootstrap the first admin.',
        );
      }
      return;
    }

    // Only seed if this specific admin email doesn't already exist
    const existing = this.db.prepare('SELECT id FROM users WHERE lower(email)=?').get(email) as { id: string } | undefined;
    if (existing) return;

    const name = (process.env.COMPANYBRAIN_ADMIN_NAME ?? 'Admin').trim() || 'Admin';
    this.insertUser({ email, name, role: 'ceo', password, username: undefined }, null);
    console.log(`[companybrain] Seeded initial admin user: ${email} (role: ceo)`);
  }

  private insertUser(input: CreateUserInput, createdBy: string | null): AuthUser {
    const id = `user_${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    const role = normalizeRole(input.role);
    const initials = initialsFor(input.name);
    // No password given = the person sets their own through an invite link. Until then the
    // account holds a random hash nobody knows, so it cannot be signed in to.
    const passwordHash = hashPassword(input.password || randomBytes(32).toString('base64url'));
    // Username-only accounts get a reserved, never-deliverable placeholder (RFC 2606 .invalid).
    const email = (input.email?.trim() || `${input.username!.trim().toLowerCase()}@pending.invalid`).toLowerCase();
    this.db.prepare(`
      INSERT INTO users (id, org_id, email, username, name, initials, role, password_hash, active, created_at, created_by, updated_at)
      VALUES (?,?,?,?,?,?,?,?,1,?,?,?)
    `).run(
      id,
      this.orgId,
      email,
      input.username?.trim().toLowerCase() || null,
      input.name.trim(),
      initials,
      role,
      passwordHash,
      now,
      createdBy,
      now,
    );
    return rowToUser(this.getRow(id)!);
  }

  private getRow(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow | undefined;
  }

  private findByIdentifier(identifier: string): UserRow | undefined {
    const v = identifier.trim().toLowerCase();
    return this.db.prepare('SELECT * FROM users WHERE lower(email)=? OR lower(username)=?').get(v, v) as UserRow | undefined;
  }

  async authenticate(token?: string): Promise<Principal | null> {
    this.cleanupExpired();
    if (!token) return null;
    let sess = this.sessions.get(token);
    if (!sess) {
      const row = this.db.prepare('SELECT user_id, org_id, expires_at FROM auth_sessions WHERE token_hash=?')
        .get(sha256(token)) as { user_id: string; org_id: string; expires_at: number } | undefined;
      if (!row) return null;
      sess = { token, userId: row.user_id, orgId: row.org_id, role: 'employee', expiresAt: row.expires_at };
      this.sessions.set(token, sess);
    }
    if (sess.expiresAt <= Date.now()) {
      this.dropSession(token);
      return null;
    }
    // Disabled or deleted users lose access at once; role changes apply on the next request.
    const user = this.getRow(sess.userId);
    if (!user || user.active !== 1) {
      this.dropSession(token);
      return null;
    }
    sess.role = normalizeRole(user.role);
    return { userId: sess.userId, orgId: sess.orgId, role: sess.role };
  }

  private dropSession(token: string) {
    this.sessions.delete(token);
    this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(sha256(token));
  }

  private dropSessionsForUser(userId: string) {
    for (const [token, sess] of this.sessions) {
      if (sess.userId === userId) this.sessions.delete(token);
    }
    this.db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(userId);
  }

  private startSession(row: UserRow): LoginResult {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + this.sessionTtlMs;
    const role = normalizeRole(row.role);
    this.sessions.set(token, { token, userId: row.id, orgId: row.org_id, role, expiresAt });
    this.db.prepare('INSERT INTO auth_sessions (token_hash, user_id, org_id, expires_at) VALUES (?,?,?,?)')
      .run(sha256(token), row.id, row.org_id, expiresAt);
    return {
      token,
      user: rowToUser(row),
      principal: { userId: row.id, orgId: row.org_id, role },
      expiresAt,
    };
  }

  // --- invites: admin makes a one-time link, the teammate sets their own password ---
  createInvite(userId: string, ttlHours = 72): { token: string; expiresAt: number } {
    const row = this.getRow(userId);
    if (!row) throw new Error('user not found');
    this.db.prepare('DELETE FROM auth_invites WHERE user_id=?').run(userId);
    const token = randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;
    this.db.prepare('INSERT INTO auth_invites (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha256(token), userId, expiresAt);
    return { token, expiresAt };
  }

  peekInvite(token: string): { name: string } | null {
    const inv = this.db.prepare('SELECT user_id, expires_at FROM auth_invites WHERE token_hash=?')
      .get(sha256(token ?? '')) as { user_id: string; expires_at: number } | undefined;
    if (!inv || inv.expires_at <= Date.now()) return null;
    const row = this.getRow(inv.user_id);
    if (!row || row.active !== 1) return null;
    return { name: row.name };
  }

  acceptInvite(token: string, newPassword: string): LoginResult | null {
    const hash = sha256(token ?? '');
    const inv = this.db.prepare('SELECT user_id, expires_at FROM auth_invites WHERE token_hash=?')
      .get(hash) as { user_id: string; expires_at: number } | undefined;
    if (!inv || inv.expires_at <= Date.now()) return null;
    const row = this.getRow(inv.user_id);
    if (!row || row.active !== 1) return null;
    this.setPassword(row.id, newPassword);
    this.db.prepare('DELETE FROM auth_invites WHERE user_id=?').run(row.id);
    return this.startSession(this.getRow(row.id)!);
  }

  async current(): Promise<Principal> {
    const row = this.db.prepare('SELECT * FROM users WHERE org_id=? ORDER BY created_at ASC LIMIT 1').get(this.orgId) as UserRow | undefined;
    if (row) return { userId: row.id, orgId: row.org_id, role: normalizeRole(row.role) };
    return { userId: 'user_local', orgId: this.orgId, role: 'ceo' };
  }

  can(principal: Principal, capability: Capability): boolean {
    return CAPS_BY_ROLE[principal.role]?.has(capability) ?? false;
  }

  listUsers(): AuthUser[] {
    const rows = this.db.prepare('SELECT * FROM users WHERE org_id=? ORDER BY created_at ASC').all(this.orgId) as UserRow[];
    return rows.map(rowToUser);
  }

  getUser(userId: string): AuthUser | null {
    const row = this.getRow(userId);
    return row ? rowToUser(row) : null;
  }

  async login(identifier: string, password: string): Promise<LoginResult | null> {
    this.cleanupExpired();
    const id = (identifier ?? '').trim();
    const pw = password ?? '';
    if (!id || !pw) return null;

    // Lock an account name for 15 minutes after 8 wrong passwords, whatever IP they come from.
    const key = id.toLowerCase();
    const fail = this.failedLogins.get(key);
    if (fail && fail.lockedUntil > Date.now()) return null;

    const row = this.findByIdentifier(id);
    // Unknown users still pay for a hash, so response time doesn't reveal which accounts exist.
    const ok = row ? verifyPassword(pw, row.password_hash) : (verifyPassword(pw, DUMMY_HASH), false);
    if (!row || row.active !== 1 || !ok) {
      const count = (fail && fail.lockedUntil <= Date.now() && fail.count >= 8 ? 0 : fail?.count ?? 0) + 1;
      this.failedLogins.set(key, { count, lockedUntil: count >= 8 ? Date.now() + 15 * 60 * 1000 : 0 });
      if (this.failedLogins.size > 5000) this.failedLogins.clear();
      return null;
    }
    this.failedLogins.delete(key);

    return this.startSession(row);
  }

  async logout(token: string): Promise<void> {
    if (!token) return;
    this.dropSession(token);
  }

  private cleanupExpired() {
    const now = Date.now();
    // Runs on every request, so only sweep once a minute.
    if (now - this.lastCleanup < 60_000) return;
    this.lastCleanup = now;
    for (const [token, sess] of this.sessions) {
      if (sess.expiresAt <= now) this.sessions.delete(token);
    }
    this.db.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').run(now);
    this.db.prepare('DELETE FROM auth_invites WHERE expires_at<=?').run(now);
  }

  // --- admin-only user management (feature-detected by the server layer) ---

  private emailTaken(email: string, excludeId?: string): boolean {
    const row = this.db.prepare('SELECT id FROM users WHERE lower(email)=?').get(email.trim().toLowerCase()) as { id: string } | undefined;
    return !!row && row.id !== excludeId;
  }

  private usernameTaken(username: string, excludeId?: string): boolean {
    const row = this.db.prepare('SELECT id FROM users WHERE lower(username)=?').get(username.trim().toLowerCase()) as { id: string } | undefined;
    return !!row && row.id !== excludeId;
  }

  createUser(input: CreateUserInput, createdBy: string): AuthUser {
    if (!input.email?.trim() && !input.username?.trim()) throw new Error('email or username is required');
    if (input.email?.trim() && this.emailTaken(input.email)) throw new Error('a user with this email already exists');
    if (input.username && this.usernameTaken(input.username)) throw new Error('a user with this username already exists');
    return this.insertUser(input, createdBy);
  }

  updateUser(id: string, patch: UpdateUserInput): AuthUser {
    const row = this.getRow(id);
    if (!row) throw new Error('user not found');

    const name = patch.name?.trim() || row.name;
    const email = (patch.email?.trim() || row.email).toLowerCase();
    if (patch.email && this.emailTaken(email, id)) throw new Error('a user with this email already exists');

    let username = row.username;
    if (patch.username !== undefined) {
      username = patch.username?.trim().toLowerCase() || null;
      if (username && this.usernameTaken(username, id)) throw new Error('a user with this username already exists');
    }

    const role = patch.role ? normalizeRole(patch.role) : normalizeRole(row.role);
    const active = patch.active !== undefined ? (patch.active ? 1 : 0) : row.active;
    const initials = patch.name ? initialsFor(name) : row.initials;

    if ((role !== 'ceo' || active !== 1) && normalizeRole(row.role) === 'ceo' && row.active === 1) {
      const otherAdmins = this.db.prepare("SELECT COUNT(*) as c FROM users WHERE role='ceo' AND active=1 AND id!=?").get(id) as { c: number };
      if (otherAdmins.c === 0) throw new Error(role !== 'ceo' ? 'cannot demote the last admin' : 'cannot disable the last admin');
    }

    this.db.prepare(`
      UPDATE users SET name=?, email=?, username=?, role=?, active=?, initials=?, updated_at=? WHERE id=?
    `).run(name, email, username, role, active, initials, Date.now(), id);
    if (active !== 1) this.dropSessionsForUser(id);

    return rowToUser(this.getRow(id)!);
  }

  setPassword(id: string, newPassword: string): void {
    const row = this.getRow(id);
    if (!row) throw new Error('user not found');
    const passwordHash = hashPassword(newPassword);
    this.db.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').run(passwordHash, Date.now(), id);
    this.dropSessionsForUser(id);
  }

  deleteUser(id: string): void {
    const row = this.getRow(id);
    if (!row) throw new Error('user not found');
    if (normalizeRole(row.role) === 'ceo') {
      const otherAdmins = this.db.prepare("SELECT COUNT(*) as c FROM users WHERE role='ceo' AND active=1 AND id!=?").get(id) as { c: number };
      if (otherAdmins.c === 0) throw new Error('cannot delete the last admin user');
    }
    this.db.prepare('DELETE FROM users WHERE id=?').run(id);
    this.db.prepare('DELETE FROM auth_invites WHERE user_id=?').run(id);
    this.dropSessionsForUser(id);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// A real scrypt hash of a random string, used only to make unknown-user logins as slow as real ones.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));
