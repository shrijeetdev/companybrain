// Real multi-user auth: email/username + password, backed by a SQLite `users`
// table. This is the recommended production mode — it replaces the shared
// access-key model with per-person accounts and an admin (role `ceo`) who can
// create, edit, and remove users, and reset anyone's password.

import { randomBytes, randomUUID } from 'node:crypto';
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

/**
 * Reject bootstrap passwords a stranger could guess. Returns a reason string when the
 * password is unacceptable, or null when it passes. Deliberately simple: length plus a
 * short list of the passwords that actually show up in leaked deployments.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'passw0rd', 'admin', 'admin123', 'administrator', 'letmein',
  'welcome', 'changeme', 'secret', 'qwerty', 'iloveyou', 'monkey', 'dragon', 'test',
  '12345678', '123456789', '1234567890', '1234@1234', '1234@1234work', 'companybrain',
]);

export function describeWeakPassword(password: string): string | null {
  const pw = password.trim();
  if (pw.length < 12) return 'is shorter than 12 characters';
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'is a commonly used password';
  if (/^(.)\1+$/.test(pw)) return 'is a single repeated character';
  if (new Set(pw).size < 5) return 'uses fewer than 5 distinct characters';
  return null;
}

export class PasswordAuth implements Auth {
  mode = 'password' as const;

  private readonly db: Database.Database;
  private readonly orgId: string;
  private readonly sessionTtlMs: number;
  private readonly sessions = new Map<string, Session>();

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

    // A bootstrap admin is the most valuable account in the system and its password often
    // ends up pasted into a host's env settings (or, worse, a committed file). Refuse to
    // create it with a guessable one rather than seeding a weak admin and hoping someone
    // rotates it later. This blocks seeding only — existing installs are untouched.
    const weak = describeWeakPassword(password);
    if (weak) {
      console.error(
        `[companybrain] PasswordAuth: refusing to seed the initial admin — COMPANYBRAIN_ADMIN_PASSWORD ${weak}. ` +
        'Generate one with `node -e "console.log(require(\'node:crypto\').randomBytes(24).toString(\'base64url\'))"` and restart.',
      );
      return;
    }

    const name = (process.env.COMPANYBRAIN_ADMIN_NAME ?? 'Admin').trim() || 'Admin';
    this.insertUser({ email, name, role: 'ceo', password, username: undefined }, null);
    console.log(`[companybrain] Seeded initial admin user: ${email} (role: ceo)`);
  }

  private insertUser(input: CreateUserInput, createdBy: string | null): AuthUser {
    const id = `user_${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    const role = normalizeRole(input.role);
    const initials = initialsFor(input.name);
    const passwordHash = hashPassword(input.password);
    this.db.prepare(`
      INSERT INTO users (id, org_id, email, username, name, initials, role, password_hash, active, created_at, created_by, updated_at)
      VALUES (?,?,?,?,?,?,?,?,1,?,?,?)
    `).run(
      id,
      this.orgId,
      input.email.trim().toLowerCase(),
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
    const sess = this.sessions.get(token);
    if (!sess) return null;
    if (sess.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return { userId: sess.userId, orgId: sess.orgId, role: sess.role };
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

    const row = this.findByIdentifier(id);
    if (!row || row.active !== 1) return null;
    if (!verifyPassword(pw, row.password_hash)) return null;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + this.sessionTtlMs;
    const role = normalizeRole(row.role);
    this.sessions.set(token, { token, userId: row.id, orgId: row.org_id, role, expiresAt });

    return {
      token,
      user: rowToUser(row),
      principal: { userId: row.id, orgId: row.org_id, role },
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
    if (this.emailTaken(input.email)) throw new Error('a user with this email already exists');
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

    if (role !== 'ceo' && normalizeRole(row.role) === 'ceo') {
      const otherAdmins = this.db.prepare("SELECT COUNT(*) as c FROM users WHERE role='ceo' AND active=1 AND id!=?").get(id) as { c: number };
      if (otherAdmins.c === 0) throw new Error('cannot demote the last admin');
    }

    this.db.prepare(`
      UPDATE users SET name=?, email=?, username=?, role=?, active=?, initials=?, updated_at=? WHERE id=?
    `).run(name, email, username, role, active, initials, Date.now(), id);

    return rowToUser(this.getRow(id)!);
  }

  setPassword(id: string, newPassword: string): void {
    const row = this.getRow(id);
    if (!row) throw new Error('user not found');
    const passwordHash = hashPassword(newPassword);
    this.db.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').run(passwordHash, Date.now(), id);
    for (const [token, sess] of this.sessions) {
      if (sess.userId === id) this.sessions.delete(token);
    }
  }

  deleteUser(id: string): void {
    const row = this.getRow(id);
    if (!row) throw new Error('user not found');
    if (normalizeRole(row.role) === 'ceo') {
      const otherAdmins = this.db.prepare("SELECT COUNT(*) as c FROM users WHERE role='ceo' AND active=1 AND id!=?").get(id) as { c: number };
      if (otherAdmins.c === 0) throw new Error('cannot delete the last admin user');
    }
    this.db.prepare('DELETE FROM users WHERE id=?').run(id);
    for (const [token, sess] of this.sessions) {
      if (sess.userId === id) this.sessions.delete(token);
    }
  }
}
