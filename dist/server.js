#!/usr/bin/env -S npx tsx
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// packages/auth/src/local.ts
var LOCAL_ORG_ID, LOCAL_USER_ID, LocalAuth;
var init_local = __esm({
  "packages/auth/src/local.ts"() {
    "use strict";
    LOCAL_ORG_ID = "org_local";
    LOCAL_USER_ID = "user_local";
    LocalAuth = class {
      mode = "local";
      principal;
      user;
      constructor(role = "ceo") {
        this.principal = { userId: LOCAL_USER_ID, orgId: LOCAL_ORG_ID, role };
        this.user = {
          ...this.principal,
          name: "You",
          email: "you@companybrain.local",
          initials: "YO"
        };
      }
      async init() {
      }
      async authenticate() {
        return this.principal;
      }
      async current() {
        return this.principal;
      }
      listUsers() {
        return [{ ...this.user }];
      }
      getUser(userId) {
        return userId === this.user.userId ? { ...this.user } : null;
      }
      /** single local user can do everything */
      can(_principal, _capability) {
        return true;
      }
    };
  }
});

// packages/auth/src/capabilities.ts
function normalizeRole(raw) {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "ceo" || v === "admin" || v === "owner") return "ceo";
  if (v === "manager" || v === "mgr" || v === "hr") return "manager";
  if (v === "employee" || v === "emp" || v === "member" || v === "staff") return "employee";
  if (v === "client") return "client";
  if (v === "agent" || v === "ai" || v === "ai-agent") return "agent";
  return "employee";
}
function initialsFor(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "US";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}
var CAPS_BY_ROLE;
var init_capabilities = __esm({
  "packages/auth/src/capabilities.ts"() {
    "use strict";
    CAPS_BY_ROLE = {
      ceo: /* @__PURE__ */ new Set([
        "loop.read",
        "loop.write",
        "task.read",
        "task.write",
        "lead.read",
        "lead.write",
        "autonomy.configure",
        "killswitch.toggle",
        "org.admin"
      ]),
      manager: /* @__PURE__ */ new Set([
        "loop.read",
        "loop.write",
        "task.read",
        "task.write",
        "lead.read",
        "lead.write",
        "autonomy.configure",
        "killswitch.toggle"
      ]),
      employee: /* @__PURE__ */ new Set([
        "loop.read",
        "loop.write",
        "task.read",
        "task.write",
        "lead.read",
        "lead.write"
      ]),
      client: /* @__PURE__ */ new Set([
        "loop.read",
        "task.read",
        "lead.read"
      ]),
      agent: /* @__PURE__ */ new Set([
        "loop.read",
        "loop.write",
        "task.read",
        "task.write",
        "lead.read",
        "lead.write"
      ])
    };
  }
});

// packages/auth/src/key.ts
import { randomBytes, timingSafeEqual } from "node:crypto";
function timingSafeMatch(input, expected) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
function parseUsers(raw, orgId) {
  const parsed = (() => {
    if (!raw?.trim()) return DEFAULT_USERS;
    try {
      const val = JSON.parse(raw);
      if (Array.isArray(val)) return val;
      if (val && Array.isArray(val.users)) return val.users;
      return DEFAULT_USERS;
    } catch {
      return DEFAULT_USERS;
    }
  })();
  const users = [];
  const perUserKeys = /* @__PURE__ */ new Map();
  for (const u of parsed) {
    const id = (u.userId ?? u.id ?? "").trim() || `user_${Math.random().toString(36).slice(2, 8)}`;
    const name = (u.name ?? id.replace(/^user_/, "").replace(/[_-]/g, " ")).trim();
    const user = {
      userId: id,
      orgId: (u.orgId ?? orgId).trim() || orgId,
      role: normalizeRole(u.role),
      name,
      email: u.email?.trim() || void 0,
      initials: (u.initials?.trim() || initialsFor(name)).slice(0, 3).toUpperCase()
    };
    users.push(user);
    if (typeof u.key === "string" && u.key.trim()) perUserKeys.set(user.userId, u.key.trim());
  }
  if (!users.length) {
    users.push({ userId: "user_local", orgId, role: "ceo", name: "You", email: "you@companybrain.local", initials: "YO" });
  }
  return { users, perUserKeys };
}
var DEFAULT_USERS, KeyAuth;
var init_key = __esm({
  "packages/auth/src/key.ts"() {
    "use strict";
    init_local();
    init_capabilities();
    DEFAULT_USERS = [
      { id: "user_local", role: "ceo", name: "You", email: "you@companybrain.local", initials: "YO" },
      { id: "user_ceo", role: "ceo", name: "James Carter", email: "james@companybrain.local", initials: "JC" },
      { id: "user_monty", role: "manager", name: "Monty Singh", email: "monty@companybrain.local", initials: "MS" },
      { id: "user_emp", role: "employee", name: "Alex Kumar", email: "alex@companybrain.local", initials: "AK" },
      { id: "user_client", role: "client", name: "Dana Carter", email: "dana@client.local", initials: "DC" }
    ];
    KeyAuth = class {
      mode = "key";
      orgId;
      globalKey;
      sessionTtlMs;
      users;
      userMap;
      userByEmail;
      perUserKeys;
      sessions = /* @__PURE__ */ new Map();
      constructor() {
        this.orgId = process.env.COMPANYBRAIN_ORG_ID?.trim() || LOCAL_ORG_ID;
        this.globalKey = process.env.COMPANYBRAIN_ACCESS_KEY?.trim() || "";
        const ttlHours = Number(process.env.COMPANYBRAIN_SESSION_TTL_HOURS ?? 168);
        this.sessionTtlMs = (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 168) * 60 * 60 * 1e3;
        const parsed = parseUsers(process.env.COMPANYBRAIN_USERS, this.orgId);
        this.users = parsed.users;
        this.userMap = new Map(this.users.map((u) => [u.userId, u]));
        this.userByEmail = new Map(this.users.filter((u) => !!u.email).map((u) => [String(u.email).toLowerCase(), u]));
        this.perUserKeys = parsed.perUserKeys;
      }
      async init() {
      }
      async authenticate(token) {
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
      async current() {
        const first = this.users[0] ?? { userId: "user_local", orgId: this.orgId, role: "ceo" };
        return { userId: first.userId, orgId: first.orgId, role: first.role };
      }
      can(principal, capability) {
        return CAPS_BY_ROLE[principal.role]?.has(capability) ?? false;
      }
      listUsers() {
        return this.users.map((u) => ({ ...u }));
      }
      getUser(userId) {
        const u = this.userMap.get(userId);
        return u ? { ...u } : null;
      }
      async login(userIdOrEmail, key) {
        this.cleanupExpired();
        const lookup = (userIdOrEmail ?? "").trim();
        const secret = (key ?? "").trim();
        if (!lookup || !secret) return null;
        const byId = this.userMap.get(lookup);
        const byEmail = this.userByEmail.get(lookup.toLowerCase());
        const user = byId ?? byEmail ?? null;
        if (!user) return null;
        const expected = this.perUserKeys.get(user.userId) ?? this.globalKey;
        if (!expected || !timingSafeMatch(secret, expected)) return null;
        const token = randomBytes(32).toString("base64url");
        const expiresAt = Date.now() + this.sessionTtlMs;
        this.sessions.set(token, { token, userId: user.userId, orgId: user.orgId, role: user.role, expiresAt });
        return {
          token,
          user: { ...user },
          principal: { userId: user.userId, orgId: user.orgId, role: user.role },
          expiresAt
        };
      }
      async logout(token) {
        if (!token) return;
        this.sessions.delete(token);
      }
      cleanupExpired() {
        const now2 = Date.now();
        for (const [token, sess] of this.sessions) {
          if (sess.expiresAt <= now2) this.sessions.delete(token);
        }
      }
    };
  }
});

// packages/auth/src/hash.ts
import { randomBytes as randomBytes2, scryptSync, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
function hashPassword(password) {
  const salt = randomBytes2(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, KEY_LENGTH);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual2(actual, expected);
}
var KEY_LENGTH;
var init_hash = __esm({
  "packages/auth/src/hash.ts"() {
    "use strict";
    KEY_LENGTH = 64;
  }
});

// packages/auth/src/password.ts
import { randomBytes as randomBytes3, randomUUID } from "node:crypto";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
import { mkdirSync as mkdirSync2 } from "node:fs";
import Database2 from "better-sqlite3";
function rowToUser(row) {
  return {
    userId: row.id,
    orgId: row.org_id,
    role: normalizeRole(row.role),
    name: row.name,
    email: row.email,
    initials: row.initials,
    username: row.username ?? void 0,
    active: row.active === 1,
    createdAt: row.created_at
  };
}
var PasswordAuth;
var init_password = __esm({
  "packages/auth/src/password.ts"() {
    "use strict";
    init_local();
    init_capabilities();
    init_hash();
    PasswordAuth = class {
      mode = "password";
      db;
      orgId;
      sessionTtlMs;
      sessions = /* @__PURE__ */ new Map();
      constructor() {
        this.orgId = process.env.COMPANYBRAIN_ORG_ID?.trim() || LOCAL_ORG_ID;
        const ttlHours = Number(process.env.COMPANYBRAIN_SESSION_TTL_HOURS ?? 168);
        this.sessionTtlMs = (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 168) * 60 * 60 * 1e3;
        const fromEnv = process.env.COMPANYBRAIN_DB_PATH;
        const dir = join2(homedir2(), ".companybrain");
        mkdirSync2(dir, { recursive: true });
        const filePath = fromEnv ?? join2(dir, "companybrain.sqlite");
        this.db = new Database2(filePath);
        this.db.pragma("journal_mode = WAL");
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
      seedAdminIfNeeded() {
        const email = (process.env.COMPANYBRAIN_ADMIN_EMAIL ?? "").trim().toLowerCase();
        const password = process.env.COMPANYBRAIN_ADMIN_PASSWORD ?? "";
        if (!email || !password) {
          const { c } = this.db.prepare("SELECT COUNT(*) as c FROM users").get();
          if (c === 0) {
            console.warn(
              "[companybrain] PasswordAuth: no users exist yet and COMPANYBRAIN_ADMIN_EMAIL / COMPANYBRAIN_ADMIN_PASSWORD are not set. Set both env vars and restart to bootstrap the first admin."
            );
          }
          return;
        }
        const existing = this.db.prepare("SELECT id FROM users WHERE lower(email)=?").get(email);
        if (existing) return;
        const name = (process.env.COMPANYBRAIN_ADMIN_NAME ?? "Admin").trim() || "Admin";
        this.insertUser({ email, name, role: "ceo", password, username: void 0 }, null);
        console.log(`[companybrain] Seeded initial admin user: ${email} (role: ceo)`);
      }
      insertUser(input, createdBy) {
        const id = `user_${randomUUID().slice(0, 8)}`;
        const now2 = Date.now();
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
          now2,
          createdBy,
          now2
        );
        return rowToUser(this.getRow(id));
      }
      getRow(id) {
        return this.db.prepare("SELECT * FROM users WHERE id=?").get(id);
      }
      findByIdentifier(identifier) {
        const v = identifier.trim().toLowerCase();
        return this.db.prepare("SELECT * FROM users WHERE lower(email)=? OR lower(username)=?").get(v, v);
      }
      async authenticate(token) {
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
      async current() {
        const row = this.db.prepare("SELECT * FROM users WHERE org_id=? ORDER BY created_at ASC LIMIT 1").get(this.orgId);
        if (row) return { userId: row.id, orgId: row.org_id, role: normalizeRole(row.role) };
        return { userId: "user_local", orgId: this.orgId, role: "ceo" };
      }
      can(principal, capability) {
        return CAPS_BY_ROLE[principal.role]?.has(capability) ?? false;
      }
      listUsers() {
        const rows = this.db.prepare("SELECT * FROM users WHERE org_id=? ORDER BY created_at ASC").all(this.orgId);
        return rows.map(rowToUser);
      }
      getUser(userId) {
        const row = this.getRow(userId);
        return row ? rowToUser(row) : null;
      }
      async login(identifier, password) {
        this.cleanupExpired();
        const id = (identifier ?? "").trim();
        const pw = password ?? "";
        if (!id || !pw) return null;
        const row = this.findByIdentifier(id);
        if (!row || row.active !== 1) return null;
        if (!verifyPassword(pw, row.password_hash)) return null;
        const token = randomBytes3(32).toString("base64url");
        const expiresAt = Date.now() + this.sessionTtlMs;
        const role = normalizeRole(row.role);
        this.sessions.set(token, { token, userId: row.id, orgId: row.org_id, role, expiresAt });
        return {
          token,
          user: rowToUser(row),
          principal: { userId: row.id, orgId: row.org_id, role },
          expiresAt
        };
      }
      async logout(token) {
        if (!token) return;
        this.sessions.delete(token);
      }
      cleanupExpired() {
        const now2 = Date.now();
        for (const [token, sess] of this.sessions) {
          if (sess.expiresAt <= now2) this.sessions.delete(token);
        }
      }
      // --- admin-only user management (feature-detected by the server layer) ---
      emailTaken(email, excludeId) {
        const row = this.db.prepare("SELECT id FROM users WHERE lower(email)=?").get(email.trim().toLowerCase());
        return !!row && row.id !== excludeId;
      }
      usernameTaken(username, excludeId) {
        const row = this.db.prepare("SELECT id FROM users WHERE lower(username)=?").get(username.trim().toLowerCase());
        return !!row && row.id !== excludeId;
      }
      createUser(input, createdBy) {
        if (this.emailTaken(input.email)) throw new Error("a user with this email already exists");
        if (input.username && this.usernameTaken(input.username)) throw new Error("a user with this username already exists");
        return this.insertUser(input, createdBy);
      }
      updateUser(id, patch) {
        const row = this.getRow(id);
        if (!row) throw new Error("user not found");
        const name = patch.name?.trim() || row.name;
        const email = (patch.email?.trim() || row.email).toLowerCase();
        if (patch.email && this.emailTaken(email, id)) throw new Error("a user with this email already exists");
        let username = row.username;
        if (patch.username !== void 0) {
          username = patch.username?.trim().toLowerCase() || null;
          if (username && this.usernameTaken(username, id)) throw new Error("a user with this username already exists");
        }
        const role = patch.role ? normalizeRole(patch.role) : normalizeRole(row.role);
        const active = patch.active !== void 0 ? patch.active ? 1 : 0 : row.active;
        const initials = patch.name ? initialsFor(name) : row.initials;
        if (role !== "ceo" && normalizeRole(row.role) === "ceo") {
          const otherAdmins = this.db.prepare("SELECT COUNT(*) as c FROM users WHERE role='ceo' AND active=1 AND id!=?").get(id);
          if (otherAdmins.c === 0) throw new Error("cannot demote the last admin");
        }
        this.db.prepare(`
      UPDATE users SET name=?, email=?, username=?, role=?, active=?, initials=?, updated_at=? WHERE id=?
    `).run(name, email, username, role, active, initials, Date.now(), id);
        return rowToUser(this.getRow(id));
      }
      setPassword(id, newPassword) {
        const row = this.getRow(id);
        if (!row) throw new Error("user not found");
        const passwordHash = hashPassword(newPassword);
        this.db.prepare("UPDATE users SET password_hash=?, updated_at=? WHERE id=?").run(passwordHash, Date.now(), id);
        for (const [token, sess] of this.sessions) {
          if (sess.userId === id) this.sessions.delete(token);
        }
      }
      deleteUser(id) {
        const row = this.getRow(id);
        if (!row) throw new Error("user not found");
        if (normalizeRole(row.role) === "ceo") {
          const otherAdmins = this.db.prepare("SELECT COUNT(*) as c FROM users WHERE role='ceo' AND active=1 AND id!=?").get(id);
          if (otherAdmins.c === 0) throw new Error("cannot delete the last admin user");
        }
        this.db.prepare("DELETE FROM users WHERE id=?").run(id);
        for (const [token, sess] of this.sessions) {
          if (sess.userId === id) this.sessions.delete(token);
        }
      }
    };
  }
});

// packages/auth/src/supabase.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
var ROLE_CAPABILITIES, SupabaseAuth;
var init_supabase = __esm({
  "packages/auth/src/supabase.ts"() {
    "use strict";
    ROLE_CAPABILITIES = {
      ceo: ["loop.read", "loop.write", "task.read", "task.write", "lead.read", "lead.write", "autonomy.configure", "killswitch.toggle", "org.admin"],
      manager: ["loop.read", "loop.write", "task.read", "task.write", "lead.read", "lead.write", "autonomy.configure"],
      employee: ["loop.read", "loop.write", "task.read", "task.write", "lead.read"],
      client: ["loop.read", "task.read", "lead.read"],
      agent: ["loop.read", "loop.write", "task.read", "task.write", "lead.read", "lead.write"]
    };
    SupabaseAuth = class {
      client;
      adminClient = null;
      defaultOrgId;
      defaultRole;
      mode = "key";
      constructor(opts) {
        this.client = createClient2(opts.url, opts.anonKey);
        this.adminClient = opts.serviceRoleKey ? createClient2(opts.url, opts.serviceRoleKey) : null;
        this.defaultOrgId = opts.defaultOrgId ?? "org_default";
        this.defaultRole = opts.defaultRole ?? "employee";
      }
      async init() {
      }
      async authenticate(token) {
        if (!token) return null;
        try {
          const { data: { user }, error } = await this.client.auth.getUser(token);
          if (error || !user) return null;
          const profile = await this.getUserProfile(user.id);
          if (!profile) {
            return {
              userId: user.id,
              orgId: this.defaultOrgId,
              role: this.defaultRole
            };
          }
          return {
            userId: profile.userId,
            orgId: profile.orgId,
            role: profile.role
          };
        } catch {
          return null;
        }
      }
      async current() {
        return {
          userId: "user_local",
          orgId: "org_local",
          role: "ceo"
        };
      }
      can(principal, capability) {
        const caps = ROLE_CAPABILITIES[principal.role] ?? [];
        return caps.includes(capability);
      }
      async listUsers() {
        if (!this.adminClient) {
          const p = await this.current();
          return [this.principalToUser(p)];
        }
        try {
          const { data, error } = await this.adminClient.auth.admin.listUsers();
          if (error || !data?.users) return [];
          return data.users.map((user) => ({
            userId: user.id,
            orgId: this.defaultOrgId,
            role: this.defaultRole,
            name: user.user_metadata?.name ?? user.email?.split("@")[0] ?? user.id,
            email: user.email,
            initials: this.getInitials(user.user_metadata?.name ?? user.email)
          }));
        } catch {
          return [];
        }
      }
      async getUser(userId) {
        const profile = await this.getUserProfile(userId);
        if (!profile) return null;
        return {
          userId: profile.userId,
          orgId: profile.orgId,
          role: profile.role,
          name: profile.name,
          email: profile.email,
          initials: this.getInitials(profile.name)
        };
      }
      async login(userIdOrEmail, key) {
        if (!this.client) return null;
        try {
          const { data, error } = await this.client.auth.signInWithPassword({
            email: userIdOrEmail,
            password: key
          });
          if (error || !data?.user || !data?.session) {
            const { data: phoneData, error: phoneError } = await this.client.auth.signInWithPassword({
              phone: userIdOrEmail,
              password: key
            });
            if (phoneError || !phoneData?.user || !phoneData?.session) {
              return null;
            }
            return this.createLoginResult(phoneData.user.id, phoneData.session.access_token, phoneData.session.expires_at ?? 0);
          }
          return this.createLoginResult(data.user.id, data.session.access_token, data.session.expires_at ?? 0);
        } catch {
          return null;
        }
      }
      async logout(token) {
        if (!this.client) return;
        try {
          await this.client.auth.admin.signOut(token);
        } catch {
        }
      }
      async createLoginResult(userId, token, expiresAt) {
        const profile = await this.getUserProfile(userId);
        const principal = {
          userId,
          orgId: profile?.orgId ?? this.defaultOrgId,
          role: profile?.role ?? this.defaultRole
        };
        const user = {
          ...principal,
          name: profile?.name ?? userId,
          email: profile?.email,
          initials: this.getInitials(profile?.name)
        };
        return {
          token,
          user,
          principal,
          expiresAt: (expiresAt ?? 0) * 1e3
          // Convert to milliseconds
        };
      }
      async getUserProfile(userId) {
        if (!this.adminClient) return null;
        try {
          const { data, error } = await this.adminClient.from("users").select("id, org_id, role, name, email").eq("id", userId).single();
          if (error || !data) return null;
          return {
            userId: data.id,
            orgId: data.org_id ?? this.defaultOrgId,
            role: data.role ?? this.defaultRole,
            name: data.name ?? userId,
            email: data.email
          };
        } catch {
          return null;
        }
      }
      principalToUser(principal) {
        const name = principal.userId.replace(/^user[_-]?/i, "").replace(/[_-]+/g, " ").trim() || principal.userId;
        return {
          userId: principal.userId,
          orgId: principal.orgId,
          role: principal.role,
          name,
          initials: this.getInitials(name)
        };
      }
      getInitials(name) {
        if (!name) return "??";
        const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
        if (!parts.length) return "??";
        return parts.map((p) => (p[0] ?? "").toUpperCase()).join("");
      }
    };
  }
});

// packages/auth/src/index.ts
var src_exports = {};
__export(src_exports, {
  CAPS_BY_ROLE: () => CAPS_BY_ROLE,
  KeyAuth: () => KeyAuth,
  LOCAL_ORG_ID: () => LOCAL_ORG_ID,
  LOCAL_USER_ID: () => LOCAL_USER_ID,
  LocalAuth: () => LocalAuth,
  PasswordAuth: () => PasswordAuth,
  SupabaseAuth: () => SupabaseAuth,
  createAuth: () => createAuth,
  initialsFor: () => initialsFor,
  normalizeRole: () => normalizeRole
});
function createAuth() {
  const forced = (process.env.COMPANYBRAIN_AUTH_MODE ?? "").trim().toLowerCase();
  if (forced === "local") return new LocalAuth();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    return new SupabaseAuth({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    });
  }
  if (forced === "password" || !!process.env.COMPANYBRAIN_ADMIN_EMAIL) {
    return new PasswordAuth();
  }
  if (forced === "key" || !!process.env.COMPANYBRAIN_ACCESS_KEY || !!process.env.COMPANYBRAIN_USERS) {
    return new KeyAuth();
  }
  return new LocalAuth();
}
var init_src = __esm({
  "packages/auth/src/index.ts"() {
    "use strict";
    init_local();
    init_key();
    init_password();
    init_supabase();
    init_local();
    init_key();
    init_password();
    init_supabase();
    init_capabilities();
  }
});

// packages/server/src/middleware/validation.ts
var validation_exports = {};
__export(validation_exports, {
  AssignSchema: () => AssignSchema,
  AutonomySchema: () => AutonomySchema,
  CreateLeadSchema: () => CreateLeadSchema,
  CreateLoopSchema: () => CreateLoopSchema,
  CreateTaskSchema: () => CreateTaskSchema,
  CreateUserSchema: () => CreateUserSchema,
  ExtractCardSchema: () => ExtractCardSchema,
  LoginSchema: () => LoginSchema,
  MoveTaskSchema: () => MoveTaskSchema,
  QuickAddLeadSchema: () => QuickAddLeadSchema,
  SetLeadStageSchema: () => SetLeadStageSchema,
  SetPasswordSchema: () => SetPasswordSchema,
  SnoozeLoopSchema: () => SnoozeLoopSchema,
  UpdateUserSchema: () => UpdateUserSchema,
  ValidationError: () => ValidationError,
  WebhookFanInSchema: () => WebhookFanInSchema,
  validateBody: () => validateBody,
  validateQuery: () => validateQuery
});
import { z } from "zod";
function validateBody(schema) {
  return async (req, reply) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        details[path || "_root"] = issue.message;
      }
      return reply.code(400).send({ error: "Validation failed", details });
    }
    req.validatedBody = result.data;
  };
}
function validateQuery(schema) {
  return async (req, reply) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        details[path || "_root"] = issue.message;
      }
      return reply.code(400).send({ error: "Validation failed", details });
    }
    req.validatedQuery = result.data;
  };
}
var ValidationError, CreateLoopSchema, SnoozeLoopSchema, AssignSchema, CreateTaskSchema, MoveTaskSchema, CreateLeadSchema, SetLeadStageSchema, QuickAddLeadSchema, ExtractCardSchema, AutonomySchema, LoginSchema, CreateUserSchema, UpdateUserSchema, SetPasswordSchema, WebhookFanInSchema;
var init_validation = __esm({
  "packages/server/src/middleware/validation.ts"() {
    "use strict";
    ValidationError = class extends Error {
      statusCode = 400;
      details;
      constructor(details) {
        super("Validation failed");
        this.details = details;
      }
    };
    CreateLoopSchema = z.object({
      title: z.string().trim().min(1, "title is required").max(500),
      why: z.string().trim().max(1e3).optional().default(""),
      side: z.enum(["yours", "theirs"]).optional().default("yours"),
      channel: z.enum(["email", "slack", "whatsapp", "telegram", "calendar", "github", "manual"]).optional().default("manual")
    });
    SnoozeLoopSchema = z.object({
      hours: z.number().int().min(1).max(720).optional().default(24)
    });
    AssignSchema = z.object({
      userIds: z.array(z.string().trim().min(1)).min(1).max(20)
    });
    CreateTaskSchema = z.object({
      title: z.string().trim().min(1, "title is required").max(500),
      emoji: z.string().max(8).optional().default(""),
      day: z.enum(["today", "tomorrow", "upcoming"]).optional().default("today"),
      priority: z.enum(["low", "med", "high"]).nullable().optional().default(null),
      list: z.string().trim().max(200).optional().default("Inbox"),
      recurring: z.boolean().optional().default(false),
      recur: z.enum(["Daily", "Weekly", "Monthly"]).nullable().optional().default(null)
    });
    MoveTaskSchema = z.object({
      day: z.enum(["today", "tomorrow", "upcoming"]).optional().default("today")
    });
    CreateLeadSchema = z.object({
      name: z.string().trim().min(1, "name is required").max(200),
      company: z.string().trim().max(200).optional().default(""),
      title: z.string().trim().max(200).optional().default(""),
      phone: z.string().trim().max(50).optional().default(""),
      email: z.string().trim().email().max(200).optional().default(""),
      what: z.string().trim().max(500).optional().default(""),
      source: z.enum(["email", "slack", "whatsapp", "telegram", "calendar", "github", "manual"]).optional().default("manual")
    });
    SetLeadStageSchema = z.object({
      stage: z.enum(["new", "contacted", "meeting", "proposal", "won", "lost"])
    });
    QuickAddLeadSchema = z.object({
      phone: z.string().trim().max(50).optional().default(""),
      note: z.string().trim().min(1, "note is required").max(2e3)
    });
    ExtractCardSchema = z.object({
      imageBase64: z.string().max(1e7).optional(),
      text: z.string().trim().max(5e3).optional()
    }).refine((d) => d.imageBase64 || d.text, { message: "imageBase64 or text is required" });
    AutonomySchema = z.object({
      action: z.enum(["createTasks", "sendReminders", "draftReplies", "chase", "joinMeetings"]),
      level: z.enum(["off", "ask", "auto"])
    });
    LoginSchema = z.object({
      userId: z.string().trim().min(1),
      key: z.string().trim().min(1)
    });
    CreateUserSchema = z.object({
      email: z.string().trim().email().max(200),
      username: z.string().trim().min(3).max(50).optional(),
      name: z.string().trim().min(1).max(200),
      role: z.enum(["ceo", "manager", "employee", "client", "agent"]),
      password: z.string().min(8, "password must be at least 8 characters").max(200)
    });
    UpdateUserSchema = z.object({
      name: z.string().trim().min(1).max(200).optional(),
      email: z.string().trim().email().max(200).optional(),
      username: z.string().trim().min(3).max(50).nullable().optional(),
      role: z.enum(["ceo", "manager", "employee", "client", "agent"]).optional(),
      active: z.boolean().optional()
    });
    SetPasswordSchema = z.object({
      password: z.string().min(8, "password must be at least 8 characters").max(200)
    });
    WebhookFanInSchema = z.object({
      from: z.string().trim().max(200).optional().default("unknown"),
      text: z.string().trim().min(1, "text is required").max(1e4),
      ref: z.string().trim().max(500).optional()
    });
  }
});

// packages/server/src/middleware/rate-limit.ts
var rateLimitConfig, webhookRateLimitConfig, authRateLimitConfig;
var init_rate_limit = __esm({
  "packages/server/src/middleware/rate-limit.ts"() {
    "use strict";
    rateLimitConfig = {
      max: 100,
      timeWindow: "1 minute",
      keyGenerator: (req) => {
        return req.ip ?? req.headers["x-forwarded-for"] ?? "unknown";
      },
      errorResponseBuilder: (_req, context) => ({
        error: "Too many requests",
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1e3)}s.`,
        retryAfter: Math.ceil(context.ttl / 1e3)
      })
    };
    webhookRateLimitConfig = {
      max: 30,
      timeWindow: "1 minute",
      keyGenerator: (req) => {
        return req.ip ?? req.headers["x-forwarded-for"] ?? "unknown";
      },
      errorResponseBuilder: () => ({
        error: "Too many webhook requests",
        message: "Rate limit exceeded for webhook endpoint."
      })
    };
    authRateLimitConfig = {
      max: 10,
      timeWindow: "1 minute",
      keyGenerator: (req) => {
        return req.ip ?? req.headers["x-forwarded-for"] ?? "unknown";
      },
      errorResponseBuilder: () => ({
        error: "Too many auth attempts",
        message: "Rate limit exceeded for authentication. Try again later."
      })
    };
  }
});

// packages/server/src/middleware/webhook-verify.ts
import { createHmac, timingSafeEqual as timingSafeEqual3 } from "node:crypto";
function verifyWhatsAppSignature(body, signature, appSecret) {
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
  try {
    return timingSafeEqual3(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
function whatsappSignatureVerify() {
  return async (req, reply) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) return;
    const signature = req.headers["x-hub-signature-256"];
    if (!signature) {
      return reply.code(401).send({ error: "Missing webhook signature" });
    }
    const rawBody = JSON.stringify(req.body);
    if (!verifyWhatsAppSignature(rawBody, signature, appSecret)) {
      return reply.code(403).send({ error: "Invalid webhook signature" });
    }
  };
}
function genericWebhookVerify(options = {}) {
  const { headerName = "x-webhook-signature", secretEnvVar } = options;
  return async (req, reply) => {
    const secret = secretEnvVar ? process.env[secretEnvVar] : void 0;
    if (!secret) return;
    const signature = req.headers[headerName];
    if (!signature) {
      return reply.code(401).send({ error: "Missing webhook signature" });
    }
    const rawBody = JSON.stringify(req.body);
    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      const valid = timingSafeEqual3(Buffer.from(expected), Buffer.from(signature));
      if (!valid) {
        return reply.code(403).send({ error: "Invalid webhook signature" });
      }
    } catch {
      return reply.code(403).send({ error: "Invalid webhook signature" });
    }
  };
}
var init_webhook_verify = __esm({
  "packages/server/src/middleware/webhook-verify.ts"() {
    "use strict";
  }
});

// packages/server/src/middleware/logger.ts
import pino from "pino";
function createChildLogger(name) {
  return logger.child({ module: name });
}
var level, logger;
var init_logger = __esm({
  "packages/server/src/middleware/logger.ts"() {
    "use strict";
    level = process.env.COMPANYBRAIN_LOG_LEVEL ?? "info";
    logger = pino({
      level,
      transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } : void 0,
      serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res
      },
      formatters: {
        level: (label) => ({ level: label })
      },
      timestamp: pino.stdTimeFunctions.isoTime
    });
  }
});

// packages/server/src/middleware/rbac.ts
function requireRole(...allowedRoles) {
  return async (req, reply) => {
    const principal = req.principal;
    if (!principal) {
      return reply.code(401).send({ error: "Authentication required" });
    }
    if (!allowedRoles.includes(principal.role)) {
      return reply.code(403).send({
        error: "Insufficient permissions",
        required: allowedRoles,
        current: principal.role
      });
    }
  };
}
function requireMinRole(minRole) {
  return async (req, reply) => {
    const principal = req.principal;
    if (!principal) {
      return reply.code(401).send({ error: "Authentication required" });
    }
    const userLevel = ROLE_HIERARCHY[principal.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
    if (userLevel < requiredLevel) {
      return reply.code(403).send({
        error: "Insufficient permissions",
        required: `At least ${minRole}`,
        current: principal.role
      });
    }
  };
}
function requireCapability(...capabilities) {
  return async (req, reply) => {
    const principal = req.principal;
    if (!principal) {
      return reply.code(401).send({ error: "Authentication required" });
    }
    const { createAuth: createAuth2 } = await Promise.resolve().then(() => (init_src(), src_exports));
    const auth = createAuth2();
    const missing = capabilities.filter((cap) => !auth.can(principal, cap));
    if (missing.length > 0) {
      return reply.code(403).send({
        error: "Missing capabilities",
        missing,
        current: principal.role
      });
    }
  };
}
function getPrincipal(req) {
  return req.principal ?? null;
}
function isAdmin(principal) {
  return principal.role === "ceo" || principal.role === "manager";
}
function canModifyUser(principal, targetUserId) {
  if (principal.userId === targetUserId) return true;
  return isAdmin(principal);
}
var ROLE_HIERARCHY;
var init_rbac = __esm({
  "packages/server/src/middleware/rbac.ts"() {
    "use strict";
    ROLE_HIERARCHY = {
      agent: 0,
      client: 1,
      employee: 2,
      manager: 3,
      ceo: 4
    };
  }
});

// packages/server/src/middleware/sentry.ts
import * as Sentry from "@sentry/node";
function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN not set, error tracking disabled");
    return;
  }
  if (initialized) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.npm_package_version ?? "0.1.0",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
    beforeSend(event) {
      if (process.env.NODE_ENV !== "production") {
        return null;
      }
      if (event.exception?.values?.[0]?.type === "ResizeObserver loop") {
        return null;
      }
      return event;
    }
  });
  initialized = true;
  console.log("[sentry] Error tracking initialized");
}
function captureException2(error, context) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}
function captureMessage2(message, level2 = "info") {
  if (!initialized) return;
  Sentry.captureMessage(message, level2);
}
async function flushSentry() {
  if (!initialized) return;
  await Sentry.flush(2e3);
}
var initialized;
var init_sentry = __esm({
  "packages/server/src/middleware/sentry.ts"() {
    "use strict";
    initialized = false;
  }
});

// packages/server/src/middleware/metrics.ts
function setMetric(name, value, help = "", type = "gauge") {
  metrics.set(name, { name, help, type, value });
}
function incrementMetric(name, help = "", type = "counter") {
  const existing = metrics.get(name);
  if (existing) {
    existing.value++;
  } else {
    metrics.set(name, { name, help, type, value: 1 });
  }
}
function initMetrics() {
  if (metricsEnabled) return;
  metricsEnabled = true;
  setMetric("companybrain_info", 1, "Company Brain version info", "gauge");
  setMetric("companybrain_uptime_seconds", process.uptime(), "Application uptime in seconds", "gauge");
  setMetric("companybrain_memory_heap_used_bytes", process.memoryUsage().heapUsed, "Heap memory used in bytes", "gauge");
  setMetric("companybrain_memory_rss_bytes", process.memoryUsage().rss, "Resident Set Size in bytes", "gauge");
  setInterval(() => {
    setMetric("companybrain_uptime_seconds", process.uptime());
    setMetric("companybrain_memory_heap_used_bytes", process.memoryUsage().heapUsed);
    setMetric("companybrain_memory_rss_bytes", process.memoryUsage().rss);
  }, 1e4);
  console.log("[metrics] Prometheus metrics initialized");
}
function recordRequest(method, path, statusCode) {
  incrementMetric("companybrain_http_requests_total", "Total HTTP requests", "counter");
  incrementMetric(`companybrain_http_requests_${statusCode}_total`, `HTTP ${statusCode} responses`, "counter");
  incrementMetric(`companybrain_http_requests_${method}_total`, `HTTP ${method} requests`, "counter");
}
function recordLoopCreated() {
  incrementMetric("companybrain_loops_created_total", "Total loops created", "counter");
}
function recordTaskCreated() {
  incrementMetric("companybrain_tasks_created_total", "Total tasks created", "counter");
}
function recordLeadCreated() {
  incrementMetric("companybrain_leads_created_total", "Total leads created", "counter");
}
function renderMetrics() {
  const lines = [];
  lines.push("# HELP companybrain_info Company Brain version info");
  lines.push("# TYPE companybrain_info gauge");
  lines.push("companybrain_info 1");
  lines.push("# HELP companybrain_uptime_seconds Application uptime in seconds");
  lines.push("# TYPE companybrain_uptime_seconds gauge");
  lines.push(`companybrain_uptime_seconds ${process.uptime()}`);
  lines.push("# HELP companybrain_memory_heap_used_bytes Heap memory used in bytes");
  lines.push("# TYPE companybrain_memory_heap_used_bytes gauge");
  lines.push(`companybrain_memory_heap_used_bytes ${process.memoryUsage().heapUsed}`);
  lines.push("# HELP companybrain_memory_rss_bytes Resident Set Size in bytes");
  lines.push("# TYPE companybrain_memory_rss_bytes gauge");
  lines.push(`companybrain_memory_rss_bytes ${process.memoryUsage().rss}`);
  lines.push("# HELP companybrain_http_requests_total Total HTTP requests");
  lines.push("# TYPE companybrain_http_requests_total counter");
  lines.push(`companybrain_http_requests_total ${metrics.get("companybrain_http_requests_total")?.value ?? 0}`);
  lines.push("# HELP companybrain_loops_created_total Total loops created");
  lines.push("# TYPE companybrain_loops_created_total counter");
  lines.push(`companybrain_loops_created_total ${metrics.get("companybrain_loops_created_total")?.value ?? 0}`);
  lines.push("# HELP companybrain_tasks_created_total Total tasks created");
  lines.push("# TYPE companybrain_tasks_created_total counter");
  lines.push(`companybrain_tasks_created_total ${metrics.get("companybrain_tasks_created_total")?.value ?? 0}`);
  lines.push("# HELP companybrain_leads_created_total Total leads created");
  lines.push("# TYPE companybrain_leads_created_total counter");
  lines.push(`companybrain_leads_created_total ${metrics.get("companybrain_leads_created_total")?.value ?? 0}`);
  return lines.join("\n") + "\n";
}
var metricsEnabled, metrics;
var init_metrics = __esm({
  "packages/server/src/middleware/metrics.ts"() {
    "use strict";
    metricsEnabled = false;
    metrics = /* @__PURE__ */ new Map();
  }
});

// packages/server/src/middleware/index.ts
var middleware_exports = {};
__export(middleware_exports, {
  ValidationError: () => ValidationError,
  authRateLimitConfig: () => authRateLimitConfig,
  canModifyUser: () => canModifyUser,
  captureException: () => captureException2,
  captureMessage: () => captureMessage2,
  createChildLogger: () => createChildLogger,
  flushSentry: () => flushSentry,
  genericWebhookVerify: () => genericWebhookVerify,
  getPrincipal: () => getPrincipal,
  initMetrics: () => initMetrics,
  initSentry: () => initSentry,
  isAdmin: () => isAdmin,
  logger: () => logger,
  rateLimitConfig: () => rateLimitConfig,
  recordLeadCreated: () => recordLeadCreated,
  recordLoopCreated: () => recordLoopCreated,
  recordRequest: () => recordRequest,
  recordTaskCreated: () => recordTaskCreated,
  renderMetrics: () => renderMetrics,
  requireCapability: () => requireCapability,
  requireMinRole: () => requireMinRole,
  requireRole: () => requireRole,
  schemas: () => validation_exports,
  validateBody: () => validateBody,
  validateQuery: () => validateQuery,
  verifyWhatsAppSignature: () => verifyWhatsAppSignature,
  webhookRateLimitConfig: () => webhookRateLimitConfig,
  whatsappSignatureVerify: () => whatsappSignatureVerify
});
var init_middleware = __esm({
  "packages/server/src/middleware/index.ts"() {
    "use strict";
    init_validation();
    init_validation();
    init_rate_limit();
    init_webhook_verify();
    init_logger();
    init_rbac();
    init_sentry();
    init_metrics();
  }
});

// cli/bin/companybrain.ts
import { spawn } from "node:child_process";
import { platform } from "node:os";

// packages/db/src/index.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

// packages/db/src/sqlite.ts
import Database from "better-sqlite3";
var DDL = `
CREATE TABLE IF NOT EXISTS loops  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, side TEXT, status TEXT, updated_at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, day TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, stage TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, type TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings  (org_id TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, status TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS time_entries (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, task_id TEXT NOT NULL, user_id TEXT NOT NULL, started_at INTEGER, ended_at INTEGER, duration INTEGER, note TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS custom_fields (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, field_name TEXT NOT NULL, field_type TEXT NOT NULL DEFAULT 'text', field_value TEXT NOT NULL, created_at INTEGER);
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'disconnected', credentials TEXT NOT NULL DEFAULT '{}', created_at INTEGER, updated_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_loops_org  ON loops(org_id, side);
CREATE INDEX IF NOT EXISTS idx_tasks_org  ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_org  ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id, at);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id, status, at);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_entity ON custom_fields(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_org ON custom_fields(org_id);
CREATE INDEX IF NOT EXISTS idx_connections_org_channel ON connections(org_id, channel);
`;
var SqliteDatabase = class {
  db;
  loops;
  tasks;
  leads;
  events;
  settings;
  approvals;
  timeEntries;
  customFields;
  connections;
  constructor(filePath) {
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    const db = this.db;
    this.loops = {
      async list(orgId, side) {
        const rows = side ? db.prepare("SELECT doc FROM loops WHERE org_id=? AND side=? ORDER BY updated_at DESC").all(orgId, side) : db.prepare("SELECT doc FROM loops WHERE org_id=? ORDER BY updated_at DESC").all(orgId);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM loops WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      },
      async insert(loop) {
        db.prepare("INSERT INTO loops (id, org_id, side, status, updated_at, doc) VALUES (?,?,?,?,?,?)").run(loop.id, loop.orgId, loop.side, loop.status, loop.updatedAt, JSON.stringify(loop));
        return loop;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`loop ${id} not found`);
        const next = { ...cur, ...patch, updatedAt: Date.now() };
        db.prepare("UPDATE loops SET side=?, status=?, updated_at=?, doc=? WHERE id=?").run(next.side, next.status, next.updatedAt, JSON.stringify(next), id);
        return next;
      },
      async remove(id) {
        db.prepare("DELETE FROM loops WHERE id=?").run(id);
      }
    };
    this.tasks = {
      async list(orgId) {
        const rows = db.prepare("SELECT doc FROM tasks WHERE org_id=?").all(orgId);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM tasks WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      },
      async insert(task) {
        db.prepare("INSERT INTO tasks (id, org_id, day, doc) VALUES (?,?,?,?)").run(task.id, task.orgId, task.day, JSON.stringify(task));
        return task;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`task ${id} not found`);
        const next = { ...cur, ...patch };
        db.prepare("UPDATE tasks SET day=?, doc=? WHERE id=?").run(next.day, JSON.stringify(next), id);
        return next;
      },
      async remove(id) {
        db.prepare("DELETE FROM tasks WHERE id=?").run(id);
      }
    };
    this.leads = {
      async list(orgId) {
        const rows = db.prepare("SELECT doc FROM leads WHERE org_id=?").all(orgId);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM leads WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      },
      async insert(lead) {
        db.prepare("INSERT INTO leads (id, org_id, stage, doc) VALUES (?,?,?,?)").run(lead.id, lead.orgId, lead.stage, JSON.stringify(lead));
        return lead;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`lead ${id} not found`);
        const next = { ...cur, ...patch };
        db.prepare("UPDATE leads SET stage=?, doc=? WHERE id=?").run(next.stage, JSON.stringify(next), id);
        return next;
      },
      async remove(id) {
        db.prepare("DELETE FROM leads WHERE id=?").run(id);
      }
    };
    this.events = {
      async append(event) {
        db.prepare("INSERT INTO events (id, org_id, type, at, doc) VALUES (?,?,?,?,?)").run(event.id, event.orgId, event.type, event.at, JSON.stringify(event));
        return event;
      },
      async list(orgId, limit = 100) {
        const rows = db.prepare("SELECT doc FROM events WHERE org_id=? ORDER BY at DESC LIMIT ?").all(orgId, limit);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM events WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      }
    };
    this.settings = {
      async getAutonomy(orgId) {
        const row = db.prepare("SELECT doc FROM settings WHERE org_id=?").get(orgId);
        return row ? JSON.parse(row.doc) : null;
      },
      async setAutonomy(orgId, settings) {
        db.prepare("INSERT INTO settings (org_id, doc) VALUES (?,?) ON CONFLICT(org_id) DO UPDATE SET doc=excluded.doc").run(orgId, JSON.stringify(settings));
      }
    };
    this.approvals = {
      async insert(approval) {
        db.prepare("INSERT INTO approvals (id, org_id, status, at, doc) VALUES (?,?,?,?,?)").run(approval.id, approval.orgId, approval.status, approval.createdAt, JSON.stringify(approval));
        return approval;
      },
      async list(orgId, status) {
        const rows = status ? db.prepare("SELECT doc FROM approvals WHERE org_id=? AND status=? ORDER BY at DESC").all(orgId, status) : db.prepare("SELECT doc FROM approvals WHERE org_id=? ORDER BY at DESC").all(orgId);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM approvals WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`approval ${id} not found`);
        const next = { ...cur, ...patch };
        db.prepare("UPDATE approvals SET status=?, doc=? WHERE id=?").run(next.status, JSON.stringify(next), id);
        return next;
      }
    };
    this.timeEntries = {
      async insert(entry) {
        db.prepare("INSERT INTO time_entries (id, org_id, task_id, user_id, started_at, ended_at, duration, note, doc) VALUES (?,?,?,?,?,?,?,?,?)").run(entry.id, entry.orgId, entry.taskId, entry.userId, entry.startedAt, entry.endedAt ?? null, entry.duration ?? null, entry.note ?? null, JSON.stringify(entry));
        return entry;
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM time_entries WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      },
      async listByTask(taskId) {
        const rows = db.prepare("SELECT doc FROM time_entries WHERE task_id=? ORDER BY started_at DESC").all(taskId);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async listByUser(userId, orgId) {
        const rows = db.prepare("SELECT doc FROM time_entries WHERE user_id=? AND org_id=? ORDER BY started_at DESC").all(userId, orgId);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`time entry ${id} not found`);
        const next = { ...cur, ...patch };
        db.prepare("UPDATE time_entries SET ended_at=?, duration=?, note=?, doc=? WHERE id=?").run(next.endedAt ?? null, next.duration ?? null, next.note ?? null, JSON.stringify(next), id);
        return next;
      },
      async delete(id) {
        db.prepare("DELETE FROM time_entries WHERE id=?").run(id);
      }
    };
    this.customFields = {
      async insert(field) {
        db.prepare("INSERT INTO custom_fields (id, org_id, entity_type, entity_id, field_name, field_type, field_value, created_at) VALUES (?,?,?,?,?,?,?,?)").run(field.id, field.orgId, field.entityType, field.entityId, field.fieldName, field.fieldType, field.fieldValue, field.createdAt);
        return field;
      },
      async get(id) {
        const row = db.prepare("SELECT * FROM custom_fields WHERE id=?").get(id);
        return row ? rowToCustomField(row) : null;
      },
      async listByEntity(entityType, entityId) {
        const rows = db.prepare("SELECT * FROM custom_fields WHERE entity_type=? AND entity_id=? ORDER BY created_at ASC").all(entityType, entityId);
        return rows.map(rowToCustomField);
      },
      async listByOrg(orgId, entityType) {
        const rows = entityType ? db.prepare("SELECT * FROM custom_fields WHERE org_id=? AND entity_type=? ORDER BY created_at ASC").all(orgId, entityType) : db.prepare("SELECT * FROM custom_fields WHERE org_id=? ORDER BY created_at ASC").all(orgId);
        return rows.map(rowToCustomField);
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`custom field ${id} not found`);
        const next = { ...cur, ...patch };
        db.prepare("UPDATE custom_fields SET field_value=?, field_name=?, field_type=? WHERE id=?").run(next.fieldValue, next.fieldName, next.fieldType, id);
        return next;
      },
      async delete(id) {
        db.prepare("DELETE FROM custom_fields WHERE id=?").run(id);
      },
      async deleteByEntity(entityType, entityId) {
        db.prepare("DELETE FROM custom_fields WHERE entity_type=? AND entity_id=?").run(entityType, entityId);
      }
    };
    const connectionRepo = {
      async list(orgId) {
        const rows = db.prepare("SELECT id, org_id, channel, status, credentials, created_at, updated_at FROM connections WHERE org_id=? ORDER BY channel ASC").all(orgId);
        return rows.map(rowToConnection);
      },
      async get(orgId, channel) {
        const row = db.prepare("SELECT id, org_id, channel, status, credentials, created_at, updated_at FROM connections WHERE org_id=? AND channel=?").get(orgId, channel);
        return row ? rowToConnection(row) : null;
      },
      async upsert(orgId, channel, patch) {
        const existing = await connectionRepo.get(orgId, channel);
        const now2 = Date.now();
        if (existing) {
          const merged = { ...existing, ...patch, channel, updatedAt: now2 };
          db.prepare("UPDATE connections SET status=?, credentials=?, updated_at=? WHERE org_id=? AND channel=?").run(merged.status, JSON.stringify(merged.credentials), now2, orgId, channel);
          return merged;
        }
        const conn = {
          id: `conn_${channel}_${Date.now()}`,
          orgId,
          channel,
          status: patch.status ?? "disconnected",
          credentials: patch.credentials ?? {},
          createdAt: patch.createdAt ?? now2,
          updatedAt: now2
        };
        db.prepare("INSERT INTO connections (id, org_id, channel, status, credentials, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").run(conn.id, conn.orgId, conn.channel, conn.status, JSON.stringify(conn.credentials), conn.createdAt, conn.updatedAt);
        return conn;
      },
      async delete(orgId, channel) {
        db.prepare("DELETE FROM connections WHERE org_id=? AND channel=?").run(orgId, channel);
      }
    };
    this.connections = connectionRepo;
  }
  async init() {
    this.db.exec(DDL);
  }
  async close() {
    this.db.close();
  }
};
function rowToCustomField(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fieldName: row.field_name,
    fieldType: row.field_type,
    fieldValue: row.field_value,
    createdAt: row.created_at
  };
}
function rowToConnection(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    channel: row.channel,
    status: row.status,
    credentials: typeof row.credentials === "string" ? JSON.parse(row.credentials) : row.credentials ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// packages/db/src/supabase.ts
import { createClient } from "@supabase/supabase-js";
var SupabaseDatabase = class {
  client;
  adminClient = null;
  loops;
  tasks;
  leads;
  events;
  settings;
  approvals;
  timeEntries;
  customFields;
  connections = {
    async list() {
      return [];
    },
    async get() {
      return null;
    },
    async upsert() {
      throw new Error("Connections not supported in Supabase mode yet");
    },
    async delete() {
    }
  };
  constructor(opts) {
    this.client = createClient(opts.url, opts.anonKey);
    this.adminClient = opts.serviceRoleKey ? createClient(opts.url, opts.serviceRoleKey) : null;
    const db = this.adminClient ?? this.client;
    this.loops = {
      async list(orgId, side) {
        let query = db.from("loops").select("*").eq("org_id", orgId);
        if (side) query = query.eq("side", side);
        const { data, error } = await query.order("updated_at", { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToLoop);
      },
      async get(id) {
        const { data, error } = await db.from("loops").select("*").eq("id", id).single();
        if (error || !data) return null;
        return rowToLoop(data);
      },
      async insert(loop) {
        const { error } = await db.from("loops").insert(loopToRow(loop));
        if (error) throw error;
        return loop;
      },
      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`loop ${id} not found`);
        const next = { ...current, ...patch, updatedAt: Date.now() };
        const { error } = await db.from("loops").update(loopToRow(next)).eq("id", id);
        if (error) throw error;
        return next;
      },
      async remove(id) {
        const { error } = await db.from("loops").delete().eq("id", id);
        if (error) throw error;
      }
    };
    this.tasks = {
      async list(orgId) {
        const { data, error } = await db.from("tasks").select("*").eq("org_id", orgId);
        if (error) throw error;
        return (data ?? []).map(rowToTask);
      },
      async get(id) {
        const { data, error } = await db.from("tasks").select("*").eq("id", id).single();
        if (error || !data) return null;
        return rowToTask(data);
      },
      async insert(task) {
        const { error } = await db.from("tasks").insert(taskToRow(task));
        if (error) throw error;
        return task;
      },
      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`task ${id} not found`);
        const next = { ...current, ...patch };
        const { error } = await db.from("tasks").update(taskToRow(next)).eq("id", id);
        if (error) throw error;
        return next;
      },
      async remove(id) {
        const { error } = await db.from("tasks").delete().eq("id", id);
        if (error) throw error;
      }
    };
    this.leads = {
      async list(orgId) {
        const { data, error } = await db.from("leads").select("*").eq("org_id", orgId);
        if (error) throw error;
        return (data ?? []).map(rowToLead);
      },
      async get(id) {
        const { data, error } = await db.from("leads").select("*").eq("id", id).single();
        if (error || !data) return null;
        return rowToLead(data);
      },
      async insert(lead) {
        const { error } = await db.from("leads").insert(leadToRow(lead));
        if (error) throw error;
        return lead;
      },
      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`lead ${id} not found`);
        const next = { ...current, ...patch };
        const { error } = await db.from("leads").update(leadToRow(next)).eq("id", id);
        if (error) throw error;
        return next;
      },
      async remove(id) {
        const { error } = await db.from("leads").delete().eq("id", id);
        if (error) throw error;
      }
    };
    this.events = {
      async append(event) {
        const { error } = await db.from("events").insert(eventToRow(event));
        if (error) throw error;
        return event;
      },
      async list(orgId, limit = 100) {
        const { data, error } = await db.from("events").select("*").eq("org_id", orgId).order("at", { ascending: false }).limit(limit);
        if (error) throw error;
        return (data ?? []).map(rowToEvent);
      },
      async get(id) {
        const { data, error } = await db.from("events").select("*").eq("id", id).single();
        if (error || !data) return null;
        return rowToEvent(data);
      }
    };
    this.settings = {
      async getAutonomy(orgId) {
        const { data, error } = await db.from("settings").select("*").eq("org_id", orgId).single();
        if (error || !data) return null;
        return JSON.parse(data.doc);
      },
      async setAutonomy(orgId, settings) {
        const { error } = await db.from("settings").upsert({ org_id: orgId, doc: JSON.stringify(settings) }, { onConflict: "org_id" });
        if (error) throw error;
      }
    };
    this.approvals = {
      async insert(approval) {
        const { error } = await db.from("approvals").insert(approvalToRow(approval));
        if (error) throw error;
        return approval;
      },
      async list(orgId, status) {
        let query = db.from("approvals").select("*").eq("org_id", orgId);
        if (status) query = query.eq("status", status);
        const { data, error } = await query.order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToApproval);
      },
      async get(id) {
        const { data, error } = await db.from("approvals").select("*").eq("id", id).single();
        if (error || !data) return null;
        return rowToApproval(data);
      },
      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`approval ${id} not found`);
        const next = { ...current, ...patch };
        const { error } = await db.from("approvals").update(approvalToRow(next)).eq("id", id);
        if (error) throw error;
        return next;
      }
    };
    this.timeEntries = {
      async insert(entry) {
        const { error } = await db.from("time_entries").insert(timeEntryToRow(entry));
        if (error) throw error;
        return entry;
      },
      async get(id) {
        const { data, error } = await db.from("time_entries").select("*").eq("id", id).single();
        if (error || !data) return null;
        return rowToTimeEntry(data);
      },
      async listByTask(taskId) {
        const { data, error } = await db.from("time_entries").select("*").eq("task_id", taskId).order("started_at", { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToTimeEntry);
      },
      async listByUser(userId, orgId) {
        const { data, error } = await db.from("time_entries").select("*").eq("user_id", userId).eq("org_id", orgId).order("started_at", { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToTimeEntry);
      },
      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`time entry ${id} not found`);
        const next = { ...current, ...patch };
        const { error } = await db.from("time_entries").update(timeEntryToRow(next)).eq("id", id);
        if (error) throw error;
        return next;
      },
      async delete(id) {
        const { error } = await db.from("time_entries").delete().eq("id", id);
        if (error) throw error;
      }
    };
    this.customFields = {
      async insert(field) {
        const { error } = await db.from("custom_fields").insert(customFieldToRow(field));
        if (error) throw error;
        return field;
      },
      async get(id) {
        const { data, error } = await db.from("custom_fields").select("*").eq("id", id).single();
        if (error || !data) return null;
        return rowToCustomField2(data);
      },
      async listByEntity(entityType, entityId) {
        const { data, error } = await db.from("custom_fields").select("*").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: true });
        if (error) throw error;
        return (data ?? []).map(rowToCustomField2);
      },
      async listByOrg(orgId, entityType) {
        let query = db.from("custom_fields").select("*").eq("org_id", orgId);
        if (entityType) query = query.eq("entity_type", entityType);
        const { data, error } = await query.order("created_at", { ascending: true });
        if (error) throw error;
        return (data ?? []).map(rowToCustomField2);
      },
      async update(id, patch) {
        const current = await this.get(id);
        if (!current) throw new Error(`custom field ${id} not found`);
        const next = { ...current, ...patch };
        const { error } = await db.from("custom_fields").update(customFieldToRow(next)).eq("id", id);
        if (error) throw error;
        return next;
      },
      async delete(id) {
        const { error } = await db.from("custom_fields").delete().eq("id", id);
        if (error) throw error;
      },
      async deleteByEntity(entityType, entityId) {
        const { error } = await db.from("custom_fields").delete().eq("entity_type", entityType).eq("entity_id", entityId);
        if (error) throw error;
      }
    };
  }
  async init() {
  }
  async close() {
  }
};
function rowToLoop(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    why: row.why ?? "",
    side: row.side,
    status: row.status,
    channel: row.channel,
    sourceRef: row.source_ref ?? void 0,
    replyTo: row.reply_to ?? void 0,
    ownerId: row.owner_id ?? void 0,
    createdBy: row.created_by,
    assignedTo: JSON.parse(row.assigned_to ?? "[]"),
    dueAt: row.due_at ?? void 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function loopToRow(loop) {
  return {
    id: loop.id,
    org_id: loop.orgId,
    title: loop.title,
    why: loop.why,
    side: loop.side,
    status: loop.status,
    channel: loop.channel,
    source_ref: loop.sourceRef ?? null,
    reply_to: loop.replyTo ?? null,
    owner_id: loop.ownerId ?? null,
    created_by: loop.createdBy,
    assigned_to: JSON.stringify(loop.assignedTo),
    due_at: loop.dueAt ?? null,
    created_at: loop.createdAt,
    updated_at: loop.updatedAt
  };
}
function rowToTask(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    emoji: row.emoji ?? "",
    title: row.title,
    list: row.list ?? "Inbox",
    day: row.day,
    priority: row.priority,
    recurring: row.recurring ?? false,
    recur: row.recur,
    assignees: JSON.parse(row.assignees ?? "[]"),
    createdBy: row.created_by,
    subtasks: JSON.parse(row.subtasks ?? "[]"),
    comments: JSON.parse(row.comments ?? "[]"),
    dueAt: row.due_at ?? void 0,
    createdAt: row.created_at
  };
}
function taskToRow(task) {
  return {
    id: task.id,
    org_id: task.orgId,
    emoji: task.emoji,
    title: task.title,
    list: task.list,
    day: task.day,
    priority: task.priority,
    recurring: task.recurring,
    recur: task.recur,
    assignees: JSON.stringify(task.assignees),
    created_by: task.createdBy,
    subtasks: JSON.stringify(task.subtasks ?? []),
    comments: JSON.stringify(task.comments ?? []),
    due_at: task.dueAt ?? null,
    created_at: task.createdAt
  };
}
function rowToLead(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    company: row.company ?? "",
    title: row.title ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    stage: row.stage,
    source: row.source,
    what: row.what ?? "",
    createdBy: row.created_by,
    assignedTo: JSON.parse(row.assigned_to ?? "[]"),
    createdAt: row.created_at
  };
}
function leadToRow(lead) {
  return {
    id: lead.id,
    org_id: lead.orgId,
    name: lead.name,
    company: lead.company,
    title: lead.title,
    phone: lead.phone,
    email: lead.email,
    stage: lead.stage,
    source: lead.source,
    what: lead.what,
    created_by: lead.createdBy,
    assigned_to: JSON.stringify(lead.assignedTo),
    created_at: lead.createdAt
  };
}
function rowToEvent(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    type: row.type,
    entityId: row.entity_id,
    actorId: row.actor_id,
    undo: row.undo ? JSON.parse(row.undo) : null,
    reversible: row.reversible ?? true,
    channel: row.channel ?? void 0,
    at: row.at
  };
}
function eventToRow(event) {
  return {
    id: event.id,
    org_id: event.orgId,
    type: event.type,
    entity_id: event.entityId,
    actor_id: event.actorId,
    undo: event.undo ? JSON.stringify(event.undo) : null,
    reversible: event.reversible,
    channel: event.channel ?? null,
    at: event.at
  };
}
function rowToApproval(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    action: row.action,
    loopId: row.loop_id ?? void 0,
    title: row.title,
    status: row.status,
    createdAt: row.created_at
  };
}
function approvalToRow(approval) {
  return {
    id: approval.id,
    org_id: approval.orgId,
    action: approval.action,
    loop_id: approval.loopId ?? null,
    title: approval.title,
    status: approval.status,
    created_at: approval.createdAt
  };
}
function rowToTimeEntry(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    taskId: row.task_id,
    userId: row.user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? void 0,
    duration: row.duration ?? void 0,
    note: row.note ?? void 0
  };
}
function timeEntryToRow(entry) {
  return {
    id: entry.id,
    org_id: entry.orgId,
    task_id: entry.taskId,
    user_id: entry.userId,
    started_at: entry.startedAt,
    ended_at: entry.endedAt ?? null,
    duration: entry.duration ?? null,
    note: entry.note ?? null
  };
}
function rowToCustomField2(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fieldName: row.field_name,
    fieldType: row.field_type,
    fieldValue: row.field_value,
    createdAt: row.created_at
  };
}
function customFieldToRow(field) {
  return {
    id: field.id,
    org_id: field.orgId,
    entity_type: field.entityType,
    entity_id: field.entityId,
    field_name: field.fieldName,
    field_type: field.fieldType,
    field_value: field.fieldValue,
    created_at: field.createdAt
  };
}

// packages/db/src/index.ts
function createDatabase(opts = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    return new SupabaseDatabase({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    });
  }
  const fromEnv = process.env.COMPANYBRAIN_DB_PATH;
  const dir = join(homedir(), ".companybrain");
  mkdirSync(dir, { recursive: true });
  return new SqliteDatabase(opts.sqlitePath ?? fromEnv ?? join(dir, "companybrain.sqlite"));
}

// packages/queue/src/in-process.ts
var InProcessQueue = class {
  handlers = /* @__PURE__ */ new Map();
  timers = /* @__PURE__ */ new Set();
  started = false;
  async init() {
  }
  on(name, handler) {
    this.handlers.set(name, handler);
  }
  async run(name, data) {
    const handler = this.handlers.get(name);
    if (!handler) {
      console.warn(`[queue] no handler registered for "${name}" \u2014 dropping job`);
      return;
    }
    try {
      await handler(data);
    } catch (err) {
      console.error(`[queue] job "${name}" failed:`, err);
    }
  }
  async enqueue(name, data, opts = {}) {
    const fire = () => void this.run(name, data);
    if (opts.delayMs && opts.delayMs > 0) {
      const t = setTimeout(() => {
        this.timers.delete(t);
        fire();
      }, opts.delayMs);
      this.timers.add(t);
    } else {
      queueMicrotask(fire);
    }
  }
  async schedule(name, data, everyMs) {
    const t = setInterval(() => void this.run(name, data), everyMs);
    this.timers.add(t);
  }
  async start() {
    this.started = true;
  }
  async close() {
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers.clear();
    this.started = false;
  }
};

// packages/queue/src/index.ts
function createQueue() {
  return new InProcessQueue();
}

// packages/core/src/index.ts
init_src();

// packages/core/src/context.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var consoleMessenger = {
  async send({ channel, to, text }) {
    console.log(`[messenger:noop] would send via ${channel} \u2192 ${to}: ${text}`);
  }
};
var templateDrafter = {
  async draftReply({ title }) {
    return `Thanks \u2014 we\u2019ve logged \u201C${title}\u201D and someone will get back to you shortly. \u{1F91D}`;
  }
};
var newId = (prefix) => `${prefix}_${randomUUID2().slice(0, 8)}`;
var now = () => Date.now();
async function record(ctx, input) {
  const event = {
    id: newId("evt"),
    orgId: input.orgId,
    type: input.type,
    entityId: input.entityId,
    actorId: input.actorId,
    reversible: input.reversible ?? true,
    undo: input.undo ?? null,
    channel: input.channel,
    at: now()
  };
  return ctx.db.events.append(event);
}

// packages/core/src/autonomy.ts
var DEFAULT_AUTONOMY = {
  draftReplies: "auto",
  chase: "auto",
  sendReminders: "auto",
  createTasks: "off",
  joinMeetings: "off"
};
var ACTION_JOB = {
  draftReplies: "replyLoop",
  chase: "chaseLoop",
  sendReminders: "sendReminder"
};
async function resolveAutonomy(db, orgId) {
  const stored = await db.settings.getAutonomy(orgId);
  return { ...DEFAULT_AUTONOMY, ...stored ?? {} };
}
async function dispatch(ctx, action, loopId, orgId, delayMs = 0) {
  const job = ACTION_JOB[action];
  if (!job || !loopId) return;
  await ctx.queue.enqueue(job, { loopId, orgId }, delayMs > 0 ? { delayMs } : void 0);
}
async function queueForApproval(ctx, action, opts) {
  const approval = {
    id: newId("appr"),
    orgId: opts.orgId,
    action,
    loopId: opts.loopId,
    title: opts.title,
    status: "pending",
    createdAt: now()
  };
  await ctx.db.approvals.insert(approval);
  await record(ctx, { orgId: opts.orgId, type: "approval.created", entityId: approval.id, actorId: "agent_scout" });
  return approval;
}
async function gateAction(ctx, action, opts) {
  const level2 = (await resolveAutonomy(ctx.db, opts.orgId))[action];
  if (level2 === "auto") await dispatch(ctx, action, opts.loopId, opts.orgId, opts.delayMs);
  else if (level2 === "ask") await queueForApproval(ctx, action, opts);
  return level2;
}
function makeAutonomy(ctx) {
  return {
    get: (orgId) => resolveAutonomy(ctx.db, orgId),
    async set(orgId, action, level2) {
      const next = { ...await resolveAutonomy(ctx.db, orgId), [action]: level2 };
      await ctx.db.settings.setAutonomy(orgId, next);
      await record(ctx, { orgId, type: "autonomy.changed", entityId: orgId, actorId: "user_local" });
      return next;
    },
    /** Gate an action through the org's autonomy config. */
    gate: (action, opts) => gateAction(ctx, action, opts)
  };
}
function makeApprovals(ctx) {
  return {
    list: (orgId, status = "pending") => ctx.db.approvals.list(orgId, status),
    async approve(id) {
      const a = await ctx.db.approvals.get(id);
      if (!a) throw new Error(`approval ${id} not found`);
      if (a.status === "pending") await dispatch(ctx, a.action, a.loopId, a.orgId);
      const next = await ctx.db.approvals.update(id, { status: "approved" });
      await record(ctx, { orgId: a.orgId, type: "approval.approved", entityId: id, actorId: "user_local" });
      return next;
    },
    async dismiss(id) {
      const a = await ctx.db.approvals.get(id);
      if (!a) throw new Error(`approval ${id} not found`);
      const next = await ctx.db.approvals.update(id, { status: "dismissed" });
      await record(ctx, { orgId: a.orgId, type: "approval.dismissed", entityId: id, actorId: "user_local" });
      return next;
    }
  };
}

// packages/core/src/loops.ts
var CHASE_DELAY_MS = 6e4;
function makeLoops(ctx) {
  return {
    list(orgId, side) {
      return ctx.db.loops.list(orgId, side);
    },
    get(id) {
      return ctx.db.loops.get(id);
    },
    /** Turn anything that needs a human into a tracked loop, and schedule the chase. */
    async capture(input) {
      const loop = {
        id: newId("loop"),
        orgId: input.orgId,
        title: input.title,
        why: input.why,
        side: input.side,
        status: "open",
        channel: input.channel,
        sourceRef: input.sourceRef,
        replyTo: input.replyTo,
        ownerId: input.ownerId,
        dueAt: input.dueAt ?? null,
        createdBy: input.actorId,
        assignedTo: input.ownerId ? [input.ownerId] : [input.actorId],
        createdAt: now(),
        updatedAt: now()
      };
      await ctx.db.loops.insert(loop);
      await record(ctx, {
        orgId: loop.orgId,
        type: "loop.captured",
        entityId: loop.id,
        actorId: input.actorId,
        channel: loop.channel,
        undo: { delete: loop.id }
      });
      if (loop.side === "theirs") {
        await gateAction(ctx, "chase", { orgId: loop.orgId, loopId: loop.id, title: `Chase: ${loop.title}`, delayMs: CHASE_DELAY_MS });
      }
      return loop;
    },
    async close(id, actorId) {
      const prev = await ctx.db.loops.get(id);
      if (!prev) throw new Error(`loop ${id} not found`);
      const loop = await ctx.db.loops.update(id, { status: "closed" });
      await record(ctx, {
        orgId: loop.orgId,
        type: "loop.closed",
        entityId: loop.id,
        actorId,
        undo: { restoreStatus: prev.status }
      });
      return loop;
    },
    async snooze(id, actorId, untilAt) {
      const loop = await ctx.db.loops.update(id, { status: "snoozed", dueAt: untilAt });
      await record(ctx, { orgId: loop.orgId, type: "loop.snoozed", entityId: loop.id, actorId });
      await ctx.queue.enqueue("sendReminder", { loopId: loop.id, orgId: loop.orgId }, { delayMs: Math.max(0, untilAt - now()) });
      return loop;
    }
  };
}

// packages/core/src/tasks.ts
function makeTasks(ctx) {
  return {
    list(orgId) {
      return ctx.db.tasks.list(orgId);
    },
    async create(input) {
      const task = {
        id: newId("task"),
        orgId: input.orgId,
        emoji: input.emoji ?? "\u2705",
        title: input.title,
        list: input.list ?? "Inbox",
        day: input.day ?? "today",
        priority: input.priority ?? null,
        recurring: Boolean(input.recur),
        recur: input.recur ?? null,
        assignees: input.assignees ?? [input.actorId],
        createdBy: input.actorId,
        dueAt: input.dueAt ?? null,
        createdAt: now()
      };
      await ctx.db.tasks.insert(task);
      await record(ctx, { orgId: task.orgId, type: "task.created", entityId: task.id, actorId: input.actorId, undo: { delete: task.id } });
      return task;
    },
    async move(id, day, actorId) {
      const prev = await ctx.db.tasks.get(id);
      if (!prev) throw new Error(`task ${id} not found`);
      const task = await ctx.db.tasks.update(id, { day });
      await record(ctx, { orgId: task.orgId, type: "task.moved", entityId: id, actorId, undo: { restoreDay: prev.day } });
      return task;
    },
    async complete(id, actorId) {
      const task = await ctx.db.tasks.update(id, { day: "today" });
      await record(ctx, { orgId: task.orgId, type: "task.completed", entityId: id, actorId });
      return task;
    }
  };
}

// packages/core/src/leads.ts
var STAGE_ORDER = ["new", "contacted", "meeting", "proposal", "won", "lost"];
function makeLeads(ctx) {
  return {
    list(orgId) {
      return ctx.db.leads.list(orgId);
    },
    async create(input) {
      const lead = {
        id: newId("lead"),
        orgId: input.orgId,
        name: input.name,
        company: input.company ?? "",
        title: input.title ?? "",
        phone: input.phone ?? "",
        email: input.email ?? "",
        stage: "new",
        source: input.source ?? "manual",
        what: input.what ?? "",
        createdBy: input.actorId,
        assignedTo: input.assignedTo ?? [input.actorId],
        createdAt: now()
      };
      await ctx.db.leads.insert(lead);
      await record(ctx, { orgId: lead.orgId, type: "lead.created", entityId: lead.id, actorId: input.actorId, channel: lead.source, undo: { delete: lead.id } });
      return lead;
    },
    async advance(id, actorId) {
      const cur = await ctx.db.leads.get(id);
      if (!cur) throw new Error(`lead ${id} not found`);
      const idx = STAGE_ORDER.indexOf(cur.stage);
      const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.indexOf("won"))];
      const lead = await ctx.db.leads.update(id, { stage: next });
      await record(ctx, { orgId: lead.orgId, type: "lead.advanced", entityId: id, actorId, undo: { restoreStage: cur.stage } });
      return lead;
    },
    /** Move a lead directly to any stage — used by pipeline drag-and-drop. */
    async setStage(id, stage, actorId) {
      const cur = await ctx.db.leads.get(id);
      if (!cur) throw new Error(`lead ${id} not found`);
      if (!STAGE_ORDER.includes(stage)) throw new Error(`invalid stage ${stage}`);
      if (cur.stage === stage) return cur;
      const lead = await ctx.db.leads.update(id, { stage });
      await record(ctx, { orgId: lead.orgId, type: "lead.advanced", entityId: id, actorId, undo: { restoreStage: cur.stage } });
      return lead;
    },
    /**
     * "Quick-add from a phone number + rough note" → a structured lead.
     * The AI extraction is stubbed here; the server injects the real LLM call server-side.
     */
    async quickAddFromNote(input, extract) {
      const guessed = extract ? await extract(input.note) : { name: input.note.split(/\s+/).slice(0, 2).join(" ") || "New lead", what: input.note };
      return this.create({
        orgId: input.orgId,
        actorId: input.actorId,
        name: guessed.name ?? "New lead",
        company: guessed.company,
        title: guessed.title,
        phone: input.phone,
        email: guessed.email,
        source: "whatsapp",
        what: guessed.what ?? input.note
      });
    }
  };
}

// packages/core/src/agents.ts
var AGENT_ROSTER = [
  { id: "agent_scout", name: "Scout", emoji: "\u{1F52D}", role: "Watches channels, captures loops", autonomy: "auto", done: 142, pending: 3 },
  { id: "agent_atlas", name: "Atlas", emoji: "\u{1F5FA}\uFE0F", role: "Plans projects, breaks down tasks", autonomy: "ask", done: 38, pending: 1 },
  { id: "agent_ledger", name: "Ledger", emoji: "\u{1F4D2}", role: "Chases leads, drafts follow-ups", autonomy: "ask", done: 64, pending: 5 }
];
function makeAgents() {
  return {
    roster() {
      return AGENT_ROSTER;
    }
  };
}

// packages/core/src/time-tracking.ts
function makeTimeTracking(ctx) {
  return {
    /**
     * Start tracking time on a task.
     * If there's already an active entry for this task, stop it first.
     */
    async start(input) {
      const active = await this.getActive(input.taskId);
      if (active) {
        await this.stop(active.id);
      }
      const entry = {
        id: newId("time"),
        orgId: input.orgId,
        taskId: input.taskId,
        userId: input.userId,
        startedAt: now(),
        note: input.note
      };
      await ctx.db.timeEntries.insert(entry);
      return entry;
    },
    /**
     * Stop tracking time on a task.
     */
    async stop(entryId) {
      const entry = await ctx.db.timeEntries.get(entryId);
      if (!entry) throw new Error(`time entry ${entryId} not found`);
      if (entry.endedAt) throw new Error(`time entry ${entryId} already stopped`);
      const endedAt = now();
      const duration = Math.floor((endedAt - entry.startedAt) / 1e3);
      return ctx.db.timeEntries.update(entryId, {
        endedAt,
        duration
      });
    },
    /**
     * Get active (running) time entry for a task.
     */
    async getActive(taskId) {
      const entries = await ctx.db.timeEntries.listByTask(taskId);
      return entries.find((e) => !e.endedAt) ?? null;
    },
    /**
     * Get all time entries for a task.
     */
    async listByTask(taskId) {
      return ctx.db.timeEntries.listByTask(taskId);
    },
    /**
     * Get all time entries for a user.
     */
    async listByUser(userId, orgId) {
      return ctx.db.timeEntries.listByUser(userId, orgId);
    },
    /**
     * Get total time spent on a task (in seconds).
     */
    async getTotalTime(taskId) {
      const entries = await ctx.db.timeEntries.listByTask(taskId);
      return entries.reduce((total, e) => total + (e.duration ?? 0), 0);
    },
    /**
     * Get total time for a user today.
     */
    async getTodayTime(userId, orgId) {
      const entries = await ctx.db.timeEntries.listByUser(userId, orgId);
      const todayStart = /* @__PURE__ */ new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayMs = todayStart.getTime();
      return entries.filter((e) => e.startedAt >= todayMs).reduce((total, e) => total + (e.duration ?? 0), 0);
    },
    /**
     * Update a time entry (edit note, adjust end time).
     */
    async update(entryId, patch) {
      const entry = await ctx.db.timeEntries.get(entryId);
      if (!entry) throw new Error(`time entry ${entryId} not found`);
      const updates = {};
      if (patch.note !== void 0) updates.note = patch.note;
      if (patch.endedAt !== void 0) {
        updates.endedAt = patch.endedAt;
        updates.duration = Math.floor((patch.endedAt - entry.startedAt) / 1e3);
      }
      return ctx.db.timeEntries.update(entryId, updates);
    },
    /**
     * Delete a time entry.
     */
    async delete(entryId) {
      await ctx.db.timeEntries.delete(entryId);
    },
    /**
     * Format duration for display.
     */
    formatDuration(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor(seconds % 3600 / 60);
      const s = seconds % 60;
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    }
  };
}

// packages/core/src/bulk.ts
function makeBulkOps(ctx) {
  return {
    /**
     * Close multiple loops at once.
     */
    async closeLoops(ids, actorId) {
      const result = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          await ctx.db.loops.update(id, { status: "closed", updatedAt: Date.now() });
          await record(ctx, { orgId: (await ctx.db.loops.get(id))?.orgId ?? "", type: "loop.closed", entityId: id, actorId });
          result.succeeded.push(id);
        } catch (e) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },
    /**
     * Snooze multiple loops.
     */
    async snoozeLoops(ids, hours, actorId) {
      const result = { succeeded: [], failed: [], total: ids.length };
      const untilAt = Date.now() + Math.max(1, hours) * 60 * 60 * 1e3;
      for (const id of ids) {
        try {
          await ctx.db.loops.update(id, { status: "snoozed", updatedAt: untilAt });
          result.succeeded.push(id);
        } catch (e) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },
    /**
     * Move multiple tasks to a different day.
     */
    async moveTasks(ids, day, actorId) {
      const result = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          const prev = await ctx.db.tasks.get(id);
          if (!prev) throw new Error("task not found");
          await ctx.db.tasks.update(id, { day });
          await record(ctx, { orgId: prev.orgId, type: "task.moved", entityId: id, actorId, undo: { restoreDay: prev.day } });
          result.succeeded.push(id);
        } catch (e) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },
    /**
     * Complete multiple tasks.
     */
    async completeTasks(ids, actorId) {
      const result = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          const task = await ctx.db.tasks.get(id);
          if (!task) throw new Error("task not found");
          await ctx.db.tasks.update(id, { day: "today" });
          await record(ctx, { orgId: task.orgId, type: "task.completed", entityId: id, actorId });
          result.succeeded.push(id);
        } catch (e) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },
    /**
     * Delete multiple tasks.
     */
    async deleteTasks(ids, actorId) {
      const result = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          const task = await ctx.db.tasks.get(id);
          if (!task) throw new Error("task not found");
          await ctx.db.tasks.remove(id);
          result.succeeded.push(id);
        } catch (e) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },
    /**
     * Advance multiple leads to next stage.
     */
    async advanceLeads(ids, actorId) {
      const result = { succeeded: [], failed: [], total: ids.length };
      const stageOrder = ["new", "contacted", "meeting", "proposal", "won"];
      for (const id of ids) {
        try {
          const lead = await ctx.db.leads.get(id);
          if (!lead) throw new Error("lead not found");
          const currentIdx = stageOrder.indexOf(lead.stage);
          const nextStage = stageOrder[Math.min(currentIdx + 1, stageOrder.length - 1)];
          await ctx.db.leads.update(id, { stage: nextStage });
          await record(ctx, { orgId: lead.orgId, type: "lead.advanced", entityId: id, actorId });
          result.succeeded.push(id);
        } catch (e) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },
    /**
     * Assign multiple entities to a user.
     */
    async assignMany(entityType, ids, userIds, actorId) {
      const result = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          if (entityType === "loop") {
            await ctx.db.loops.update(id, { assignedTo: userIds });
          } else if (entityType === "task") {
            await ctx.db.tasks.update(id, { assignees: userIds });
          } else if (entityType === "lead") {
            await ctx.db.leads.update(id, { assignedTo: userIds });
          }
          result.succeeded.push(id);
        } catch (e) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    },
    /**
     * Delete multiple entities.
     */
    async deleteMany(entityType, ids, actorId) {
      const result = { succeeded: [], failed: [], total: ids.length };
      for (const id of ids) {
        try {
          if (entityType === "loop") {
            await ctx.db.loops.remove(id);
          } else if (entityType === "task") {
            await ctx.db.tasks.remove(id);
          } else if (entityType === "lead") {
            await ctx.db.leads.remove(id);
          }
          result.succeeded.push(id);
        } catch (e) {
          result.failed.push({ id, error: e.message });
        }
      }
      return result;
    }
  };
}

// packages/core/src/recurring.ts
function makeRecurring(ctx) {
  return {
    /**
     * Process all recurring tasks and create new instances where needed.
     * Should be called daily (e.g., by a cron job or worker).
     */
    async processDaily(orgId) {
      let created = 0;
      let skipped = 0;
      const tasks = await ctx.db.tasks.list(orgId);
      const recurringTasks = tasks.filter((t) => t.recurring && t.recur);
      for (const task of recurringTasks) {
        const shouldCreate = this.shouldCreateToday(task.recur);
        if (!shouldCreate) {
          skipped++;
          continue;
        }
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const existingToday = tasks.find(
          (t) => t.title === task.title && t.createdBy === task.createdBy && new Date(t.createdAt).toISOString().split("T")[0] === today
        );
        if (existingToday) {
          skipped++;
          continue;
        }
        await ctx.db.tasks.insert({
          id: newId("task"),
          orgId: task.orgId,
          emoji: task.emoji,
          title: task.title,
          list: task.list,
          day: "today",
          priority: task.priority,
          recurring: true,
          recur: task.recur,
          assignees: task.assignees,
          createdBy: task.createdBy,
          subtasks: [],
          comments: [],
          dueAt: null,
          createdAt: now()
        });
        await record(ctx, {
          orgId: task.orgId,
          type: "task.created",
          entityId: task.id,
          actorId: task.createdBy
        });
        created++;
      }
      return { created, skipped };
    },
    /**
     * Check if a recurring task should be created today.
     */
    shouldCreateToday(recur) {
      const today = /* @__PURE__ */ new Date();
      const dayOfWeek = today.getDay();
      const dayOfMonth = today.getDate();
      switch (recur) {
        case "Daily":
          return true;
        case "Weekly":
          return true;
        // Base task is weekly, check on creation day
        case "Monthly":
          return dayOfMonth === 1;
        // Create on 1st of month
        case "Weekdays":
          return dayOfWeek >= 1 && dayOfWeek <= 5;
        case "Weekends":
          return dayOfWeek === 0 || dayOfWeek === 6;
        default:
          return false;
      }
    },
    /**
     * Get next run date for a recurring task.
     */
    getNextRun(recur) {
      const now2 = /* @__PURE__ */ new Date();
      switch (recur) {
        case "Daily":
          return new Date(now2.getTime() + 24 * 60 * 60 * 1e3);
        case "Weekly":
          return new Date(now2.getTime() + 7 * 24 * 60 * 60 * 1e3);
        case "Monthly": {
          const next = new Date(now2);
          next.setMonth(next.getMonth() + 1);
          next.setDate(1);
          return next;
        }
        case "Weekdays": {
          const next = new Date(now2);
          do {
            next.setDate(next.getDate() + 1);
          } while (next.getDay() === 0 || next.getDay() === 6);
          return next;
        }
        case "Weekends": {
          const next = new Date(now2);
          do {
            next.setDate(next.getDate() + 1);
          } while (next.getDay() !== 0 && next.getDay() !== 6);
          return next;
        }
        default:
          return new Date(now2.getTime() + 24 * 60 * 60 * 1e3);
      }
    },
    /**
     * Format schedule for display.
     */
    formatSchedule(recur) {
      switch (recur) {
        case "Daily":
          return "Every day";
        case "Weekly":
          return "Every week";
        case "Monthly":
          return "Every month";
        case "Weekdays":
          return "Weekdays only";
        case "Weekends":
          return "Weekends only";
        default:
          return recur;
      }
    }
  };
}

// packages/core/src/subtasks.ts
function makeSubtasks(ctx) {
  return {
    /**
     * Add a subtask to a task (appends to Task.subtasks array).
     */
    async add(taskId, title) {
      const task = await ctx.db.tasks.get(taskId);
      if (!task) throw new Error(`task ${taskId} not found`);
      const subtask = { id: newId("sub"), title, done: false };
      const subtasks = [...task.subtasks ?? [], subtask];
      await ctx.db.tasks.update(taskId, { subtasks });
      return subtask;
    },
    /**
     * Complete a subtask.
     */
    async complete(taskId, subtaskId) {
      const task = await ctx.db.tasks.get(taskId);
      if (!task) throw new Error(`task ${taskId} not found`);
      const subtasks = (task.subtasks ?? []).map(
        (s) => s.id === subtaskId ? { ...s, done: true } : s
      );
      await ctx.db.tasks.update(taskId, { subtasks });
      const allDone = subtasks.every((s) => s.done);
      if (allDone && subtasks.length > 0) {
        await record(ctx, {
          orgId: task.orgId,
          type: "task.completed",
          entityId: taskId,
          actorId: "system"
        });
      }
    },
    /**
     * Remove a subtask.
     */
    async remove(taskId, subtaskId) {
      const task = await ctx.db.tasks.get(taskId);
      if (!task) throw new Error(`task ${taskId} not found`);
      const subtasks = (task.subtasks ?? []).filter((s) => s.id !== subtaskId);
      await ctx.db.tasks.update(taskId, { subtasks });
    },
    /**
     * Toggle a subtask done state.
     */
    async toggle(taskId, subtaskId) {
      const task = await ctx.db.tasks.get(taskId);
      if (!task) throw new Error(`task ${taskId} not found`);
      const subtasks = (task.subtasks ?? []).map(
        (s) => s.id === subtaskId ? { ...s, done: !s.done } : s
      );
      await ctx.db.tasks.update(taskId, { subtasks });
    },
    /**
     * List subtasks for a task.
     */
    async list(taskId) {
      const task = await ctx.db.tasks.get(taskId);
      return task?.subtasks ?? [];
    },
    /**
     * Get progress percentage.
     */
    getProgress(subtasks) {
      if (subtasks.length === 0) return 0;
      const done = subtasks.filter((s) => s.done).length;
      return Math.round(done / subtasks.length * 100);
    }
  };
}

// packages/core/src/ai.ts
function makeAi(ctx) {
  const suggestions = /* @__PURE__ */ new Map();
  async function getSuggestions(entityType, entityId) {
    const results = [];
    if (entityType === "task") {
      const task = await ctx.db.tasks.get(entityId);
      if (task) {
        if (task.dueAt && task.dueAt < Date.now()) {
          results.push({
            id: `sug_${Date.now()}_overdue`,
            type: "priority",
            entityType,
            entityId,
            reason: "Task is overdue \u2014 consider bumping priority",
            confidence: 0.9,
            createdAt: Date.now()
          });
        }
        const subtasks = task.subtasks ?? [];
        if (subtasks.length > 0 && subtasks.every((s) => s.done)) {
          results.push({
            id: `sug_${Date.now()}_done`,
            type: "close",
            entityType,
            entityId,
            reason: "All subtasks complete \u2014 ready to close",
            confidence: 0.95,
            createdAt: Date.now()
          });
        }
      }
    }
    if (entityType === "loop") {
      const loop = await ctx.db.loops.get(entityId);
      if (loop) {
        const age = Date.now() - loop.createdAt;
        const threeDays = 3 * 24 * 60 * 60 * 1e3;
        if (loop.status === "open" && age > threeDays) {
          results.push({
            id: `sug_${Date.now()}_stale`,
            type: "follow_up",
            entityType,
            entityId,
            reason: "Loop open for 3+ days \u2014 consider following up",
            confidence: 0.7,
            createdAt: Date.now()
          });
        }
      }
    }
    for (const s of results) {
      suggestions.set(s.id, s);
    }
    return results;
  }
  async function autoAssign(taskId) {
    const task = await ctx.db.tasks.get(taskId);
    if (!task || task.assignees?.length) return null;
    const allTasks = await ctx.db.tasks.list(task.orgId);
    const recentTasks = allTasks.filter((t) => t.assignees?.length && t.subtasks?.some((s) => s.done)).slice(-20);
    const counts = /* @__PURE__ */ new Map();
    for (const t of recentTasks) {
      for (const a of t.assignees ?? []) {
        counts.set(a, (counts.get(a) ?? 0) + 1);
      }
    }
    let best = null;
    let bestCount = 0;
    for (const [assignee, count] of counts) {
      if (count > bestCount) {
        best = assignee;
        bestCount = count;
      }
    }
    if (best) {
      await ctx.db.tasks.update(taskId, { assignees: [best] });
    }
    return best;
  }
  async function getPatterns(orgId) {
    const tasks = await ctx.db.tasks.list(orgId);
    const loops = await ctx.db.loops.list(orgId);
    const assigneeCounts = /* @__PURE__ */ new Map();
    for (const t of tasks) {
      for (const a of t.assignees ?? []) {
        assigneeCounts.set(a, (assigneeCounts.get(a) ?? 0) + 1);
      }
    }
    const channelCounts = /* @__PURE__ */ new Map();
    for (const l of loops) {
      channelCounts.set(l.channel, (channelCounts.get(l.channel) ?? 0) + 1);
    }
    return {
      topAssignees: [...assigneeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      topChannels: [...channelCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      taskCompletionRate: tasks.length > 0 ? tasks.filter((t) => t.subtasks?.some((s) => s.done)).length / tasks.length : 0,
      totalLoops: loops.length,
      totalTasks: tasks.length
    };
  }
  async function dismiss(suggestionId) {
    suggestions.delete(suggestionId);
  }
  return { getSuggestions, autoAssign, getPatterns, dismiss };
}

// packages/core/src/undo.ts
async function undoEvent(ctx, eventId) {
  const ev = await ctx.db.events.get(eventId);
  if (!ev) throw notReversible(`event ${eventId} not found`);
  if (!ev.reversible || !ev.undo) throw notReversible(`event ${eventId} is not reversible`);
  const u = ev.undo;
  if (u.delete) {
    const id = u.delete;
    if (id.startsWith("loop_")) await ctx.db.loops.remove(id);
    else if (id.startsWith("task_")) await ctx.db.tasks.remove(id);
    else if (id.startsWith("lead_")) await ctx.db.leads.remove(id);
    else throw notReversible(`don't know how to delete ${id}`);
  } else if (u.restoreStatus) {
    await ctx.db.loops.update(ev.entityId, { status: u.restoreStatus });
  } else if (u.restoreDay) {
    await ctx.db.tasks.update(ev.entityId, { day: u.restoreDay });
  } else if (u.restoreStage) {
    await ctx.db.leads.update(ev.entityId, { stage: u.restoreStage });
  } else {
    throw notReversible(`event ${eventId} has no known undo action`);
  }
  await record(ctx, { orgId: ev.orgId, type: "event.undone", entityId: eventId, actorId: "user_local", reversible: false });
  return { undone: eventId, type: ev.type };
}
function notReversible(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// packages/core/src/workers.ts
function registerWorkers(ctx) {
  ctx.queue.on("replyLoop", async ({ loopId, orgId }) => {
    const loop = await ctx.db.loops.get(loopId);
    if (!loop || loop.status === "closed") return;
    if (!loop.replyTo) {
      console.warn(`[worker] replyLoop ${loopId}: no replyTo address \u2014 skipping send`);
      return;
    }
    const text = await ctx.drafter.draftReply({ title: loop.title, why: loop.why, channel: loop.channel });
    await ctx.messenger.send({ channel: loop.channel, to: loop.replyTo, text });
    await record(ctx, { orgId, type: "reply.sent", entityId: loopId, actorId: "agent_scout", channel: loop.channel });
    console.log(`[worker] replied to ${loop.replyTo} for loop ${loopId}`);
  });
  ctx.queue.on("chaseLoop", async ({ loopId, orgId }) => {
    const loop = await ctx.db.loops.get(loopId);
    if (!loop || loop.status === "closed") return;
    if (loop.replyTo) {
      await ctx.messenger.send({ channel: loop.channel, to: loop.replyTo, text: `Just following up on: ${loop.title} \u{1F642}` });
    }
    await record(ctx, { orgId, type: "reminder.sent", entityId: loopId, actorId: "agent_scout", channel: loop.channel });
    console.log(`[worker] chased loop ${loopId}: "${loop.title}"`);
  });
  ctx.queue.on("sendReminder", async ({ loopId, orgId }) => {
    const loop = await ctx.db.loops.get(loopId);
    if (!loop || loop.status === "closed") return;
    await record(ctx, { orgId, type: "reminder.sent", entityId: loopId, actorId: "agent_scout" });
    console.log(`[worker] reminder fired for loop ${loopId}`);
  });
  ctx.queue.on("sendBriefing", async ({ orgId }) => {
    const open = await ctx.db.loops.list(orgId);
    const yours = open.filter((l) => l.side === "yours" && l.status !== "closed").length;
    console.log(`[worker] briefing for ${orgId}: ${yours} loop(s) in your court`);
    await record(ctx, { orgId, type: "briefing.delivered", entityId: orgId, actorId: "agent_scout" });
  });
  ctx.queue.on("autoSweep", async ({ orgId }) => {
    const open = await ctx.db.loops.list(orgId);
    console.log(`[worker] nightly sweep for ${orgId}: ${open.length} loop(s) reviewed`);
  });
}

// packages/core/src/seed.ts
init_src();
async function seedIfEmpty(core) {
  const existing = await core.loops.list(LOCAL_ORG_ID);
  if (existing.length > 0) return;
  const org = LOCAL_ORG_ID;
  const me = LOCAL_USER_ID;
  await core.loops.capture({ orgId: org, actorId: me, title: "Reply to Priya re: contract", why: "She asked 2 days ago", side: "yours", channel: "email" });
  await core.loops.capture({ orgId: org, actorId: me, title: "Waiting on design files from Sam", why: "Promised Monday", side: "theirs", channel: "slack" });
  await core.loops.capture({ orgId: org, actorId: me, title: "Confirm Thursday demo time", why: "WhatsApp from lead", side: "yours", channel: "whatsapp" });
  await core.tasks.create({ orgId: org, actorId: me, emoji: "\u{1F4DD}", title: "Draft Q3 plan", day: "today", priority: "high" });
  await core.tasks.create({ orgId: org, actorId: me, emoji: "\u{1F4DE}", title: "Call supplier", day: "tomorrow", priority: "med" });
  await core.leads.create({ orgId: org, actorId: me, name: "Aisha Khan", company: "Northwind", title: "Head of Ops", phone: "+971500000000", what: "Interested in team plan" });
}

// packages/core/src/methods.ts
var methods_exports = {};
__export(methods_exports, {
  METHODS: () => METHODS,
  METHOD_LIST: () => METHOD_LIST,
  abcde: () => abcde,
  eatThatFrog: () => eatThatFrog,
  eisenhower: () => eisenhower,
  gtd: () => gtd,
  moscow: () => moscow,
  pareto: () => pareto,
  pomodoro: () => pomodoro,
  threeThree: () => threeThree,
  timeBlocking: () => timeBlocking,
  twoMinute: () => twoMinute
});
var MS_PER_DAY = 864e5;
function isUrgent(t, now2 = Date.now()) {
  if (t.day === "today") return true;
  if (t.dueAt && t.dueAt - now2 <= MS_PER_DAY) return true;
  return false;
}
function isImportant(t) {
  return t.priority === "high";
}
function isOverdue(t, now2 = Date.now()) {
  if (!t.dueAt) return false;
  return t.dueAt < now2;
}
function isComplete(t) {
  if (!t.subtasks || t.subtasks.length === 0) return false;
  return t.subtasks.every((s) => s.done);
}
function eisenhower(tasks, now2 = Date.now()) {
  const open = tasks.filter((t) => !isComplete(t));
  const result = { q1: [], q2: [], q3: [], q4: [] };
  for (const t of open) {
    const u = isUrgent(t, now2);
    const i = isImportant(t);
    if (u && i) result.q1.push(t);
    else if (!u && i) result.q2.push(t);
    else if (u && !i) result.q3.push(t);
    else result.q4.push(t);
  }
  return result;
}
function moscow(tasks, now2 = Date.now()) {
  const open = tasks.filter((t) => !isComplete(t));
  const result = { must: [], should: [], could: [], wont: [] };
  for (const t of open) {
    if (t.priority === "high") result.must.push(t);
    else if (t.priority === "med") result.should.push(t);
    else if (t.priority === "low") result.could.push(t);
    else if (isOverdue(t, now2)) result.wont.push(t);
    else result.could.push(t);
  }
  return result;
}
var RANK_WEIGHT = { A: 0, B: 1, C: 2, D: 3, E: 4 };
function abcde(tasks, now2 = Date.now()) {
  const open = tasks.filter((t) => !isComplete(t));
  const ranked = open.map((task) => {
    let rank;
    if (task.priority === "high" && isOverdue(task, now2)) rank = "A";
    else if (task.priority === "high") rank = "B";
    else if (task.priority === "med" && task.day === "today") rank = "C";
    else if (task.priority === "med") rank = "D";
    else rank = "E";
    return { task, rank };
  });
  ranked.sort((a, b) => (RANK_WEIGHT[a.rank] ?? 9) - (RANK_WEIGHT[b.rank] ?? 9));
  return { ranked };
}
var GTD_CONTEXTS = ["@email", "@call", "@computer", "@errands", "@home", "@anywhere"];
var EMOJI_TO_CONTEXT = {
  "\u{1F4DE}": "@call",
  "\u260E\uFE0F": "@call",
  "\u{1F4BB}": "@computer",
  "\u{1F5A5}\uFE0F": "@computer",
  "\u2709\uFE0F": "@email",
  "\u{1F4E7}": "@email",
  "\u{1F697}": "@errands",
  "\u{1F6D2}": "@errands",
  "\u{1F3E0}": "@home",
  "\u{1F3E1}": "@home"
};
function inferContext(task) {
  const lower = task.title.toLowerCase();
  for (const ctx of GTD_CONTEXTS) {
    if (lower.includes(ctx)) return ctx;
  }
  if (task.emoji && EMOJI_TO_CONTEXT[task.emoji]) return EMOJI_TO_CONTEXT[task.emoji];
  return null;
}
function gtd(tasks) {
  const open = tasks.filter((t) => !isComplete(t));
  const contexts = {
    "@email": [],
    "@call": [],
    "@computer": [],
    "@errands": [],
    "@home": [],
    "@anywhere": []
  };
  const inbox = [];
  for (const t of open) {
    const ctx = inferContext(t);
    if (ctx) contexts[ctx].push(t);
    else inbox.push(t);
  }
  return { contexts, inbox };
}
var QUICK_VERBS = ["call", "email", "reply", "send", "pay", "file", "book", "text", "sign", "approve", "confirm"];
function twoMinute(tasks) {
  const open = tasks.filter((t) => !isComplete(t));
  const twoMinute2 = [];
  const longer = [];
  for (const t of open) {
    const lower = t.title.toLowerCase();
    const isQuick = QUICK_VERBS.some((v) => lower.includes(v));
    if (isQuick) twoMinute2.push(t);
    else longer.push(t);
  }
  return { twoMinute: twoMinute2, longer };
}
function frogScore(t, now2) {
  const pWeight = t.priority === "high" ? 3 : t.priority === "med" ? 2 : t.priority === "low" ? 1 : 0;
  let uWeight = 0;
  if (isOverdue(t, now2)) uWeight = 3;
  else if (t.day === "today") uWeight = 2;
  else if (t.day === "tomorrow") uWeight = 1;
  return pWeight * 3 + uWeight;
}
function eatThatFrog(tasks, now2 = Date.now()) {
  const open = tasks.filter((t) => !isComplete(t));
  if (open.length === 0) return { frog: null, why: "No open tasks \u2014 nothing to eat." };
  let best = open[0];
  let bestScore = frogScore(best, now2);
  for (const t of open) {
    const s = frogScore(t, now2);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  const reasons = [];
  if (best.priority === "high") reasons.push("highest priority");
  if (isOverdue(best, now2)) reasons.push("overdue");
  else if (best.day === "today") reasons.push("due today");
  const why = reasons.length > 0 ? `Your frog: the task that is ${reasons.join(" and ")}. Do it first.` : "Your frog: the highest-impact task right now. Do it first.";
  return { frog: best, why };
}
function threeThree(tasks) {
  const open = tasks.filter((t) => !isComplete(t));
  const deep = open.filter((t) => t.priority === "high").slice(0, 3);
  const deepIds = new Set(deep.map((t) => t.id));
  const remaining = open.filter((t) => !deepIds.has(t.id));
  const medium = remaining.filter((t) => t.priority === "med").slice(0, 3);
  const mediumIds = new Set(medium.map((t) => t.id));
  const small = remaining.filter((t) => !mediumIds.has(t.id) && (t.priority === "low" || t.priority === null)).slice(0, 3);
  return { deep, medium, small };
}
function paretoScore(t) {
  const p = t.priority === "high" ? 3 : t.priority === "med" ? 2 : t.priority === "low" ? 1 : 0;
  const subtasks = t.subtasks?.length ?? 0;
  const recurring = t.recurring ? 2 : 0;
  return p * 2 + subtasks + recurring;
}
function pareto(tasks) {
  const open = tasks.filter((t) => !isComplete(t));
  if (open.length === 0) return { vital: [], useful: [] };
  const sorted = [...open].sort((a, b) => paretoScore(b) - paretoScore(a));
  const vitalCount = Math.max(1, Math.ceil(open.length * 0.2));
  return { vital: sorted.slice(0, vitalCount), useful: sorted.slice(vitalCount) };
}
var toClock = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
function timeBlocking(tasks) {
  const open = tasks.filter((t) => !isComplete(t));
  const meeting = open.filter((t) => {
    const lower = t.title.toLowerCase();
    return lower.includes("call") || lower.includes("meet") || lower.includes("sync") || lower.includes("standup");
  });
  const meetingIds = new Set(meeting.map((t) => t.id));
  const deep = open.filter((t) => !meetingIds.has(t.id) && t.priority === "high");
  const deepIds = new Set(deep.map((t) => t.id));
  const admin = open.filter((t) => !meetingIds.has(t.id) && !deepIds.has(t.id));
  const blocks = [];
  let clock = 9 * 60;
  const place = (list, blockType) => {
    for (const task of list) {
      const dur = 30;
      blocks.push({ start: toClock(clock), end: toClock(clock + dur), task, blockType });
      clock += dur;
    }
  };
  place(deep, "deep");
  place(admin.slice(0, 4), "admin");
  place(meeting, "meeting");
  place(admin.slice(4), "admin");
  return blocks.slice(0, 18);
}
function pomodoro(tasks) {
  const open = tasks.filter((t) => !isComplete(t));
  return open.map((task) => {
    const words = task.title.trim().split(/\s+/).filter(Boolean).length;
    let sessions = 1;
    if (words > 15) sessions = 4;
    else if (words > 10) sessions = 3;
    else if (words > 5) sessions = 2;
    const subtaskCount = task.subtasks?.length ?? 0;
    sessions += subtaskCount;
    return { task, sessions, minutes: sessions * 25 };
  });
}
var METHODS = {
  eisenhower: {
    meta: { id: "eisenhower", name: "Eisenhower Matrix", icon: "\u{1F532}", description: "Sort by urgent vs important into 4 quadrants." },
    run: (tasks) => eisenhower(tasks)
  },
  moscow: {
    meta: { id: "moscow", name: "MoSCoW", icon: "\u{1F3AF}", description: "Must / Should / Could / Won\u2019t \u2014 prioritize by commitment." },
    run: (tasks) => moscow(tasks)
  },
  abcde: {
    meta: { id: "abcde", name: "ABCDE Method", icon: "\u{1F524}", description: "Rank A (critical) through E (eliminate)." },
    run: (tasks) => abcde(tasks)
  },
  gtd: {
    meta: { id: "gtd", name: "Getting Things Done", icon: "\u{1F5C2}\uFE0F", description: "Group tasks by context (@call, @computer, @email\u2026)." },
    run: (tasks) => gtd(tasks)
  },
  twominute: {
    meta: { id: "twominute", name: "2-Minute Rule", icon: "\u26A1", description: "Flag quick tasks you can knock out right now." },
    run: (tasks) => twoMinute(tasks)
  },
  frog: {
    meta: { id: "frog", name: "Eat That Frog", icon: "\u{1F438}", description: "The one highest-impact task to do first today." },
    run: (tasks) => eatThatFrog(tasks)
  },
  threethree: {
    meta: { id: "threethree", name: "3-3-3 Method", icon: "3\uFE0F\u20E3", description: "3 deep + 3 medium + 3 small tasks for a focused day." },
    run: (tasks) => threeThree(tasks)
  },
  pareto: {
    meta: { id: "pareto", name: "80/20 Rule", icon: "\u{1F4CA}", description: "The vital 20% of tasks driving 80% of value." },
    run: (tasks) => pareto(tasks)
  },
  timeblock: {
    meta: { id: "timeblock", name: "Time Blocking", icon: "\u{1F5D3}\uFE0F", description: "Lay tasks out across a 9am\u20136pm workday." },
    run: (tasks) => timeBlocking(tasks)
  },
  pomodoro: {
    meta: { id: "pomodoro", name: "Pomodoro Estimate", icon: "\u{1F345}", description: "Estimate focus sessions (25 min) per task." },
    run: (tasks) => pomodoro(tasks)
  }
};
var METHOD_LIST = Object.values(METHODS).map((m) => m.meta);

// packages/core/src/analytics.ts
var analytics_exports = {};
__export(analytics_exports, {
  computeReport: () => computeReport
});
var MS_PER_HOUR = 36e5;
var MS_PER_DAY2 = 864e5;
var SECONDS_PER_HOUR = 3600;
var ON_TIME_HOURS = 72;
var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function isTaskComplete(task) {
  return !!task.subtasks && task.subtasks.length > 0 && task.subtasks.every((s) => s.done);
}
function round(n) {
  return Math.round(n);
}
function computeLoops(loops, windowStart) {
  let open = 0;
  let closed = 0;
  let snoozed = 0;
  let overdue = 0;
  let closedInWindow = 0;
  let onTime = 0;
  let totalCloseMs = 0;
  for (const l of loops) {
    const status = l.status;
    if (status === "open") open++;
    else if (status === "snoozed") snoozed++;
    else if (status === "overdue") overdue++;
    if (status === "closed") {
      closed++;
      if (l.updatedAt >= windowStart) closedInWindow++;
      const closeMs = l.updatedAt - l.createdAt;
      totalCloseMs += closeMs;
      if (closeMs <= ON_TIME_HOURS * MS_PER_HOUR) onTime++;
    }
  }
  const avgCloseHours = closed > 0 ? totalCloseMs / closed / MS_PER_HOUR : 0;
  const onTimeRate = closed > 0 ? round(onTime / closed * 100) : 0;
  return {
    total: loops.length,
    open,
    closed,
    closedInWindow,
    onTimeRate,
    snoozed,
    overdue,
    avgCloseHours: round(avgCloseHours * 10) / 10
    // one decimal place
  };
}
function computeTasks(tasks, windowStart, now2) {
  let completedInWindow = 0;
  let createdInWindow = 0;
  let overdue = 0;
  const byPriority = { high: 0, med: 0, low: 0, none: 0 };
  for (const t of tasks) {
    const p = t.priority ?? null;
    if (p === "high") byPriority.high++;
    else if (p === "med") byPriority.med++;
    else if (p === "low") byPriority.low++;
    else byPriority.none++;
    if (t.createdAt >= windowStart) createdInWindow++;
    if (isTaskComplete(t)) {
      if (t.createdAt >= windowStart) completedInWindow++;
    } else if (t.dueAt != null && t.dueAt < now2) {
      overdue++;
    }
  }
  const completionRate = createdInWindow > 0 ? round(completedInWindow / createdInWindow * 100) : 0;
  return { total: tasks.length, completedInWindow, createdInWindow, completionRate, overdue, byPriority };
}
function computeLeads(leads, windowStart) {
  let won = 0;
  let lost = 0;
  let pipeline = 0;
  let wonInWindow = 0;
  for (const lead of leads) {
    const stage = lead.stage;
    if (stage === "won") {
      won++;
      if (lead.createdAt >= windowStart) wonInWindow++;
    } else if (stage === "lost") {
      lost++;
    } else {
      pipeline++;
    }
  }
  const conversionRate = won + lost > 0 ? round(won / (won + lost) * 100) : 0;
  return {
    total: leads.length,
    won,
    lost,
    pipeline,
    wonInWindow,
    conversionRate,
    // pipelineValue is a placeholder: Lead currently has no monetary/value field. Returns 0
    // rather than a fabricated number so the UI degrades honestly until value is modelled.
    pipelineValue: 0
  };
}
function computeProductivity(tasks, timeEntries, windowStart, now2, windowDays) {
  const focusSeconds = (timeEntries ?? []).reduce((sum, e) => sum + (e.duration ?? 0), 0);
  const focusHours = round(focusSeconds / SECONDS_PER_HOUR * 10) / 10;
  const trend = [0, 0, 0, 0, 0, 0, 0];
  const dayBuckets = new Array(7).fill(0);
  const completedByCreatedAt = tasks.filter(isTaskComplete);
  for (const t of completedByCreatedAt) {
    const dow = new Date(t.createdAt).getDay();
    if (dayBuckets[dow] === void 0) dayBuckets[dow] = 0;
    dayBuckets[dow]++;
    const ageDays = Math.floor((now2 - t.createdAt) / MS_PER_DAY2);
    if (ageDays >= 0 && ageDays <= 6) {
      const idx = 6 - ageDays;
      const slot = trend[idx];
      if (slot !== void 0) trend[idx] = slot + 1;
    }
  }
  const tasksPerDay = windowDays > 0 ? round(completedByCreatedAt.length / windowDays * 10) / 10 : 0;
  let bestDay = "\u2014";
  let bestCount = -1;
  for (let i = 0; i < 7; i++) {
    const count = dayBuckets[i] ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestDay = WEEKDAYS[i] ?? "\u2014";
    }
  }
  if (bestCount <= 0) bestDay = "\u2014";
  return { focusHours, tasksPerDay, velocityTrend: trend, bestDay };
}
function computeLeaderboard(users, loops, tasks, timeEntries) {
  if (!users || users.length === 0) return [];
  const focusMinutes = /* @__PURE__ */ new Map();
  for (const e of timeEntries ?? []) {
    const minutes = Math.floor((e.duration ?? 0) / 60);
    focusMinutes.set(e.userId, (focusMinutes.get(e.userId) ?? 0) + minutes);
  }
  const tasksDone = /* @__PURE__ */ new Map();
  for (const t of tasks) {
    if (!isTaskComplete(t)) continue;
    for (const uid of t.assignees) tasksDone.set(uid, (tasksDone.get(uid) ?? 0) + 1);
  }
  const loopsClosed = /* @__PURE__ */ new Map();
  for (const l of loops) {
    if (l.status !== "closed") continue;
    for (const uid of l.assignedTo) loopsClosed.set(uid, (loopsClosed.get(uid) ?? 0) + 1);
  }
  const rows = users.map((u) => {
    const done = tasksDone.get(u.userId) ?? 0;
    const closed = loopsClosed.get(u.userId) ?? 0;
    const minutes = focusMinutes.get(u.userId) ?? 0;
    const points = done * 3 + closed * 2 + Math.floor(minutes / 25);
    return { userId: u.userId, name: u.name, points, tasksDone: done, loopsClosed: closed, focusMinutes: minutes };
  });
  rows.sort((a, b) => b.points - a.points || b.tasksDone - a.tasksDone);
  return rows;
}
function buildSummary(loops, tasks, leads, windowDays) {
  const period = windowDays >= 30 ? "this period" : `over the last ${windowDays} days`;
  const headline = `${loops.onTimeRate}% of loops closed on time ${period}.`;
  const sub = `${tasks.completedInWindow} tasks completed, ${leads.wonInWindow} leads won.`;
  return { headline, sub };
}
function computeReport(input) {
  const { loops = [], tasks = [], leads = [], timeEntries, users, windowDays = 30 } = input ?? {};
  const now2 = Date.now();
  const windowStart = now2 - windowDays * MS_PER_DAY2;
  const loopsReport = computeLoops(loops, windowStart);
  const tasksReport = computeTasks(tasks, windowStart, now2);
  const leadsReport = computeLeads(leads, windowStart);
  const productivity = computeProductivity(tasks, timeEntries, windowStart, now2, windowDays);
  const leaderboard = computeLeaderboard(users, loops, tasks, timeEntries);
  const summary = buildSummary(loopsReport, tasksReport, leadsReport, windowDays);
  return {
    windowDays,
    generatedAt: now2,
    loops: loopsReport,
    tasks: tasksReport,
    leads: leadsReport,
    productivity,
    leaderboard,
    summary
  };
}

// packages/core/src/index.ts
function createCoreFromPorts(ports) {
  const ctx = {
    db: ports.db,
    queue: ports.queue,
    auth: ports.auth,
    messenger: ports.messenger ?? consoleMessenger,
    drafter: ports.drafter ?? templateDrafter
  };
  return {
    ctx,
    loops: makeLoops(ctx),
    tasks: makeTasks(ctx),
    leads: makeLeads(ctx),
    agents: makeAgents(),
    autonomy: makeAutonomy(ctx),
    approvals: makeApprovals(ctx),
    timeTracking: makeTimeTracking(ctx),
    bulk: makeBulkOps(ctx),
    recurring: makeRecurring(ctx),
    subtasks: makeSubtasks(ctx),
    ai: makeAi(ctx),
    events: {
      list: (orgId, limit) => ctx.db.events.list(orgId, limit),
      undo: (eventId) => undoEvent(ctx, eventId)
    }
  };
}
async function bootstrap(opts = {}) {
  const db = createDatabase(opts.db);
  const queue = createQueue();
  const auth = createAuth();
  await db.init();
  await queue.init();
  await auth.init();
  const core = createCoreFromPorts({ db, queue, auth, messenger: opts.messenger, drafter: opts.drafter });
  registerWorkers(core.ctx);
  return {
    core,
    db,
    queue,
    auth,
    async startWorkers() {
      await queue.start();
    },
    async shutdown() {
      await queue.close();
      await db.close();
    }
  };
}

// packages/server/src/server.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { join as join5 } from "node:path";
import { existsSync as existsSync2 } from "node:fs";

// packages/integrations/src/pipeline.ts
function needsHuman(msg) {
  const t = msg.text.trim().toLowerCase();
  if (!t) return false;
  if (["ok", "\u{1F44D}", "thanks", "thank you", "noted"].includes(t)) return false;
  return true;
}
async function ingest(core, msg) {
  if (!needsHuman(msg)) return null;
  const loop = await core.loops.capture({
    orgId: msg.orgId,
    actorId: "agent_scout",
    title: summarize(msg.text),
    why: `${msg.channel} from ${msg.from}`,
    side: "yours",
    channel: msg.channel,
    sourceRef: msg.ref,
    // remember who to reply to on this channel (the sender's phone for WhatsApp)
    replyTo: msg.from,
    ownerId: msg.ownerId
  });
  await core.autonomy.gate("draftReplies", { orgId: msg.orgId, loopId: loop.id, title: `Auto-reply: ${loop.title}` });
  return loop.id;
}
function summarize(text) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, 6).join(" ") + (words.length > 6 ? "\u2026" : "");
}

// packages/integrations/src/whatsapp/cloud-api.ts
var cloud_api_exports = {};
__export(cloud_api_exports, {
  parseInbound: () => parseInbound,
  sendText: () => sendText,
  verifyWebhook: () => verifyWebhook,
  whatsappConfigFromEnv: () => whatsappConfigFromEnv
});
var GRAPH = "https://graph.facebook.com/v21.0";
function whatsappConfigFromEnv(env = process.env) {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  const verifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!phoneNumberId || !accessToken || !verifyToken) return null;
  return { phoneNumberId, accessToken, verifyToken };
}
function verifyWebhook(cfg, query) {
  if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === cfg.verifyToken) {
    return query["hub.challenge"] ?? "";
  }
  return null;
}
function parseInbound(orgId, body) {
  const out = [];
  const entries = body?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      for (const m of value?.messages ?? []) {
        const text = m?.text?.body ?? m?.button?.text ?? "";
        out.push({ orgId, channel: "whatsapp", from: m?.from ?? "unknown", text, ref: m?.id });
      }
    }
  }
  return out;
}
async function sendText(cfg, to, body) {
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } })
  });
  if (!res.ok) {
    throw new Error(`WhatsApp sendText failed: ${res.status} ${await res.text()}`);
  }
}

// packages/integrations/src/messenger.ts
function createMessenger(cfg) {
  return {
    async send(msg) {
      switch (msg.channel) {
        case "whatsapp":
          if (!cfg.whatsapp) {
            console.log(`[messenger] WhatsApp send-credentials not set \u2192 would reply to ${msg.to}: ${msg.text}`);
            return;
          }
          await sendText(cfg.whatsapp, msg.to, msg.text);
          return;
        // email / slack / telegram fan in here as they're added.
        default:
          console.log(`[messenger] no sender wired for channel "${msg.channel}" \u2192 ${msg.to}: ${msg.text}`);
      }
    }
  };
}

// packages/integrations/src/llm.ts
import Anthropic from "@anthropic-ai/sdk";
var LEAD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    company: { type: "string" },
    title: { type: "string" },
    email: { type: "string" },
    what: { type: "string" }
  },
  required: ["name", "company", "title", "email", "what"]
};
function guess(note) {
  return { name: note.split(/\s+/).slice(0, 2).join(" ") || "New lead", what: note };
}
function createLlm(env = process.env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  return {
    async extractLead(note) {
      try {
        const response = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 1024,
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: LEAD_SCHEMA }
          },
          messages: [
            {
              role: "user",
              content: `Extract structured lead fields from this note. Use an empty string for anything not stated.

Note: ${note}`
            }
          ]
        });
        const block = response.content.find((b) => b.type === "text");
        if (!block || block.type !== "text") return guess(note);
        const parsed = JSON.parse(block.text);
        return { ...parsed, what: parsed.what || note };
      } catch {
        return guess(note);
      }
    },
    async draftReply(input) {
      const fallback = `Thanks \u2014 we\u2019ve logged \u201C${input.title}\u201D and someone will get back to you shortly. \u{1F91D}`;
      try {
        const response = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 256,
          output_config: { effort: "low" },
          system: "You write the first auto-acknowledgement a business sends back when a message arrives on WhatsApp/SMS/email. One or two warm, professional sentences. Confirm receipt and that a human will follow up. No greeting line, no signature, no placeholders. Plain text only.",
          messages: [
            {
              role: "user",
              content: `Inbound on ${input.channel}. We logged it as: "${input.title}" (${input.why}). Write the acknowledgement reply.`
            }
          ]
        });
        const block = response.content.find((b) => b.type === "text");
        return block && block.type === "text" ? block.text.trim() || fallback : fallback;
      } catch {
        return fallback;
      }
    }
  };
}

// packages/integrations/src/whatsapp/baileys.ts
import { homedir as homedir3 } from "node:os";
import { join as join3 } from "node:path";
import qrcode from "qrcode-terminal";
import baileysPkg, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";
var makeWASocket = baileysPkg?.default ?? baileysPkg;
var silentLogger = {
  level: "silent",
  child: () => silentLogger,
  trace() {
  },
  debug() {
  },
  info() {
  },
  warn() {
  },
  error() {
  },
  fatal() {
  }
};
var toJid = (to) => to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
var numberFromJid = (jid) => jid.split("@")[0] ?? jid;
function createBaileysChannel(opts) {
  let sock = null;
  const authDir = opts.authDir ?? join3(homedir3(), ".companybrain", "wa");
  const messenger2 = {
    async send(msg) {
      if (msg.channel !== "whatsapp") {
        console.log(`[baileys] no sender wired for channel "${msg.channel}" \u2192 ${msg.to}`);
        return;
      }
      if (!sock) throw new Error("WhatsApp socket not connected yet (scan the QR first)");
      await sock.sendMessage(toJid(msg.to), { text: msg.text });
    }
  };
  async function start(core) {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({ version, auth: state, logger: silentLogger, printQRInTerminal: false, browser: ["companybrain", "Chrome", "1.0"] });
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        console.log("\n[whatsapp] open WhatsApp \u2192 Settings \u2192 Linked devices \u2192 Link a device, then scan:\n");
        qrcode.generate(qr, { small: true });
      }
      if (connection === "open") console.log("[whatsapp] connected \u2713");
      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message ?? "";
        const loggedOut = code === DisconnectReason.loggedOut;
        console.log(`[whatsapp] connection closed (code=${code ?? "?"} ${reason})${loggedOut ? " \u2014 logged out, delete ~/.companybrain/wa to re-pair" : " \u2014 reconnecting in 3s\u2026"}`);
        if (!loggedOut) setTimeout(() => void start(core).catch((e) => console.error("[whatsapp] reconnect failed:", e)), 3e3);
      }
    });
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        if (m.key.fromMe || !m.message) continue;
        const text = m.message.conversation ?? m.message.extendedTextMessage?.text ?? "";
        if (!text) continue;
        const from = numberFromJid(m.key.remoteJid ?? "");
        await ingest(core, { orgId: opts.orgId, channel: "whatsapp", from, text, ref: m.key.id ?? void 0 });
      }
    });
  }
  async function stop() {
    try {
      sock?.end(void 0);
    } catch {
    }
    sock = null;
  }
  return { messenger: messenger2, start, stop };
}

// packages/integrations/src/input/index.ts
var input_exports = {};
__export(input_exports, {
  deleteAttachment: () => deleteAttachment,
  downloadIcsFromUrl: () => downloadIcsFromUrl,
  getAttachmentPath: () => getAttachmentPath,
  icsToTasks: () => icsToTasks,
  listAttachments: () => listAttachments,
  parseIcs: () => parseIcs,
  parseTasksFromTranscript: () => parseTasksFromTranscript,
  saveAttachment: () => saveAttachment,
  transcribeAudio: () => transcribeAudio
});

// packages/integrations/src/input/voice.ts
var OPENAI_AUDIO_URL = "https://api.openai.com/v1/audio/transcriptions";
async function transcribeAudio(audioBuffer, mimeType) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[voice] OPENAI_API_KEY not set \u2014 transcription disabled, returning empty text");
    return "";
  }
  const ext = mimeToExtension(mimeType, "mp3");
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType ?? "audio/mpeg" }), `audio.${ext}`);
  try {
    const response = await fetch(OPENAI_AUDIO_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    });
    if (!response.ok) {
      const detail = await safeReadText(response);
      console.warn(`[voice] Whisper API returned ${response.status}: ${detail}`);
      return "";
    }
    const data = await response.json();
    return data.text?.trim() ?? "";
  } catch (err) {
    console.warn("[voice] transcription failed, returning empty text:", err);
    return "";
  }
}
function parseTasksFromTranscript(text) {
  if (!text) return [];
  const normalised = text.replace(/\s+/g, " ").trim();
  const cuePattern = /\b(?:remind me to|add (?:a )?task(?: to)?|i need to|todo\s*:|to-do\s*:|don't forget to|make sure (?:to|i))\b/gi;
  const clauses = normalised.split(/(?:[.!?]\s+|\band then\b|\n+|(?:,\s*)(?=\b(?:remind|add|i need|todo|to-do|don't|make sure)\b))/i).map((c) => c.trim()).filter(Boolean);
  const titles = [];
  for (const clause of clauses) {
    const match = cuePattern.exec(clause);
    if (!match) continue;
    let title = clause.slice(match.index + match[0].length).trim();
    title = title.replace(/^[\s,;:.\-–—]+/, "").trim();
    title = title.replace(/[\s,;:]+$/, "");
    if (title) titles.push(title.charAt(0).toUpperCase() + title.slice(1));
    cuePattern.lastIndex = 0;
  }
  return [...new Set(titles)];
}
function mimeToExtension(mime, fallback) {
  if (!mime) return fallback;
  const map = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/flac": "flac"
  };
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? mime.trim().toLowerCase();
  return map[base] ?? fallback;
}
async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "<unreadable response body>";
  }
}

// packages/integrations/src/input/calendar-import.ts
function unfoldLines(icsText) {
  const normalised = icsText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalised.split("\n");
  const out = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("	")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.filter((l) => l.length > 0);
}
function unescapeIcs(value) {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
function parseContentLine(line) {
  let valueStart = -1;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      valueStart = i;
      break;
    }
  }
  if (valueStart === -1) return { name: "", params: {}, value: "" };
  const head = line.slice(0, valueStart);
  const value = line.slice(valueStart + 1);
  const [nameRaw, ...paramParts] = head.split(";");
  const params = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq > -1) {
      const k = part.slice(0, eq).toUpperCase();
      let v = part.slice(eq + 1);
      v = v.replace(/^"(.*)"$/, "$1");
      params[k] = v;
    }
  }
  return { name: (nameRaw ?? "").toUpperCase(), params, value };
}
function parseIcsDate(value, _params) {
  const v = value.trim();
  if (/^\d{8}$/.test(v)) {
    return /* @__PURE__ */ new Date(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00`);
  }
  const utcMatch = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    const [, y, mo, d, h, mi, s] = utcMatch;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }
  const localMatch = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch) {
    const [, y, mo, d, h, mi, s] = localMatch;
    return new Date(+y, +mo - 1, +d, +h, +mi, +s);
  }
  const fallback = new Date(v);
  return Number.isNaN(fallback.getTime()) ? /* @__PURE__ */ new Date(0) : fallback;
}
function parseIcs(icsText) {
  const lines = unfoldLines(icsText);
  const events = [];
  let inEvent = false;
  let current = null;
  for (const line of lines) {
    const { name, value } = parseContentLine(line);
    if (name === "BEGIN" && value === "VEVENT") {
      inEvent = true;
      current = /* @__PURE__ */ new Map();
      continue;
    }
    if (name === "END" && value === "VEVENT") {
      if (inEvent && current) {
        const ev = buildEvent(current);
        if (ev) events.push(ev);
      }
      inEvent = false;
      current = null;
      continue;
    }
    if (inEvent && current) {
      current.set(name, { value, params: parseContentLine(line).params });
    }
  }
  return events;
}
function buildEvent(props) {
  const summaryRaw = props.get("SUMMARY")?.value ?? "";
  const summary = unescapeIcs(summaryRaw).trim();
  const startRaw = props.get("DTSTART");
  const endRaw = props.get("DTEND") ?? props.get("DURATION");
  const uid = (props.get("UID")?.value ?? "").trim();
  const descriptionRaw = props.get("DESCRIPTION")?.value;
  const locationRaw = props.get("LOCATION")?.value;
  if (!startRaw) return null;
  const start = parseIcsDate(startRaw.value, startRaw.params);
  const end = endRaw ? parseIcsDate(endRaw.value, endRaw.params) : start;
  return {
    uid: uid || `${start.getTime()}-${summary}`,
    summary: summary || "Untitled event",
    description: descriptionRaw ? unescapeIcs(descriptionRaw) : void 0,
    start,
    end,
    location: locationRaw ? unescapeIcs(locationRaw) : void 0
  };
}
function dayFromStart(start) {
  const startOf = (d) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };
  const today = startOf(/* @__PURE__ */ new Date());
  const startDay = startOf(start);
  const oneDayMs = 24 * 60 * 60 * 1e3;
  const diff = Math.round((startDay - today) / oneDayMs);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  return "upcoming";
}
function icsToTasks(events, orgId, actorId) {
  const now2 = Date.now();
  return events.map((ev) => ({
    orgId,
    title: ev.summary,
    day: dayFromStart(ev.start),
    dueAt: ev.start.getTime(),
    list: "Calendar",
    createdBy: actorId,
    assignees: [actorId],
    createdAt: now2
  }));
}
async function downloadIcsFromUrl(url) {
  const response = await fetch(url, {
    headers: { Accept: "text/calendar, application/octet-stream, text/plain, */*" }
  });
  if (!response.ok) {
    throw new Error(`Failed to download .ics from ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

// packages/integrations/src/input/attachments.ts
import { mkdirSync as mkdirSync3, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { join as join4 } from "node:path";
import { randomUUID as randomUUID3 } from "node:crypto";
function attachmentsRoot() {
  const base = process.env.COMPANYBRAIN_HOME ?? join4(homedir4(), ".companybrain");
  return join4(base, "attachments");
}
function taskDir(orgId, taskId) {
  return join4(attachmentsRoot(), orgId, taskId);
}
function indexPath(orgId, taskId) {
  return join4(taskDir(orgId, taskId), "index.json");
}
function readIndex(orgId, taskId) {
  const path = indexPath(orgId, taskId);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeIndex(orgId, taskId, records) {
  const dir = taskDir(orgId, taskId);
  mkdirSync3(dir, { recursive: true });
  writeFileSync(indexPath(orgId, taskId), JSON.stringify(records, null, 2), "utf8");
}
async function saveAttachment(opts) {
  const { taskId, filename, mimeType, data, orgId } = opts;
  const id = randomUUID3();
  const dir = taskDir(orgId, taskId);
  mkdirSync3(dir, { recursive: true });
  const storedFilename = `${id}-${sanitizeFilename(filename)}`;
  const storedPath = join4(dir, storedFilename);
  writeFileSync(storedPath, data);
  const record2 = {
    id,
    taskId,
    orgId,
    filename,
    mimeType,
    size: data.byteLength,
    storedPath,
    createdAt: Date.now()
  };
  const records = readIndex(orgId, taskId);
  records.push(record2);
  writeIndex(orgId, taskId, records);
  return record2;
}
function getAttachmentPath(orgId, attachmentId) {
  const orgRoot = join4(attachmentsRoot(), orgId);
  if (!existsSync(orgRoot)) return "";
  for (const taskId of safeReaddir(orgRoot)) {
    const records = readIndex(orgId, taskId);
    const hit = records.find((r) => r.id === attachmentId);
    if (hit) return hit.storedPath;
  }
  return "";
}
async function listAttachments(taskId) {
  const root = attachmentsRoot();
  if (!existsSync(root)) return [];
  for (const orgId of safeReaddir(root)) {
    const dir = taskDir(orgId, taskId);
    if (existsSync(dir)) {
      return readIndex(orgId, taskId);
    }
  }
  return [];
}
async function deleteAttachment(orgId, attachmentId) {
  const orgRoot = join4(attachmentsRoot(), orgId);
  if (!existsSync(orgRoot)) return;
  for (const taskId of safeReaddir(orgRoot)) {
    const records = readIndex(orgId, taskId);
    const hit = records.find((r) => r.id === attachmentId);
    if (!hit) continue;
    try {
      if (existsSync(hit.storedPath)) unlinkSync(hit.storedPath);
    } catch {
    }
    writeIndex(orgId, taskId, records.filter((r) => r.id !== attachmentId));
    return;
  }
}
function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
function sanitizeFilename(name) {
  const leaf = name.replace(/[/\\]+/g, "_").replace(/^\.+/, "");
  return leaf.slice(0, 180) || "attachment";
}

// packages/server/src/server.ts
init_src();

// packages/server/src/web-ui.ts
function renderUi() {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>companybrain</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --bg:#f0f2f7; --bg2:#e8eaf0;
  --surface:#ffffff; --surface2:#f5f6fb;
  --glass:rgba(255,255,255,.8); --glassThin:rgba(255,255,255,.72);
  --glassBorder:rgba(0,0,0,.08); --glassHi:rgba(255,255,255,.95);
  --text:#111827; --muted:#6b7280; --faint:#9ca3af;
  --accent:#3e7bfa; --accent2:#5b93ff;
  --accentSoft:rgba(62,123,250,.1); --accentGlow:rgba(62,123,250,.2);
  --blue:#3e7bfa; --blue2:#5b93ff; --blueSoft:rgba(62,123,250,.15);
  --green:#10b981; --greenSoft:rgba(16,185,129,.1);
  --amber:#f59e0b; --amberSoft:rgba(245,158,11,.12);
  --red:#ef4444; --redSoft:rgba(239,68,68,.12);
  --teal:#14b8a6; --tealSoft:rgba(20,184,166,.12);
  --violet:#7c3aed; --violetSoft:rgba(124,58,237,.12);
  --scroll:rgba(0,0,0,.1);
  --shadow:0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.05);
  --shadow-md:0 2px 8px rgba(0,0,0,.1);
  --shadow-lg:0 8px 32px rgba(0,0,0,.12);
  --nav-w:220px;
  --b1c:rgba(62,123,250,.1); --b2c:rgba(20,184,166,.08); --b3c:rgba(245,158,11,.06);
  --m1c:rgba(62,123,250,.08); --m2c:rgba(20,184,166,.06); --m3c:rgba(124,58,237,.08);
}
[data-theme="dark"] {
  --bg:#0a0b0f; --bg2:#111318;
  --surface:rgba(20,20,26,.62); --surface2:rgba(255,255,255,.04);
  --glass:rgba(20,20,26,.7); --glassThin:rgba(15,17,23,.62);
  --glassBorder:rgba(255,255,255,.1); --glassHi:rgba(255,255,255,.12);
  --text:#eef0f5; --muted:#9a9aa8; --faint:#6b6b78;
  --scroll:rgba(160,160,180,.22);
  --shadow:0 4px 16px rgba(0,0,0,.25);
  --shadow-md:0 6px 20px rgba(0,0,0,.3);
  --shadow-lg:0 8px 32px rgba(0,0,0,.4);
  --b1c:rgba(62,123,250,.28); --b2c:rgba(91,141,239,.22); --b3c:rgba(232,161,58,.14);
  --m1c:rgba(22,207,152,.22); --m2c:rgba(91,141,239,.18); --m3c:rgba(124,79,208,.18);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{margin:0;padding:0;height:100%;overflow:hidden;}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Hanken Grotesk',system-ui,sans-serif;font-size:14px;line-height:1.45;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-thumb{background:var(--scroll);border-radius:8px;border:2px solid transparent;background-clip:padding-box;}
::-webkit-scrollbar-track{background:transparent;}
input,button,textarea{font-family:inherit;}
input:focus,textarea:focus{outline:none;}
button{cursor:pointer;}

@keyframes cbFade{from{opacity:0}to{opacity:1}}
@keyframes cbFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes cbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}
@keyframes cbSpin{to{transform:rotate(360deg)}}
@keyframes cbDrift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(var(--dx,30px),var(--dy,-24px)) scale(1.12)}}
@keyframes cbMesh{0%{transform:translate(-3%,-2%) scale(1.12) rotate(0deg)}33%{transform:translate(3%,2%) scale(1.22) rotate(4deg)}66%{transform:translate(-2%,3%) scale(1.18) rotate(-3deg)}100%{transform:translate(-3%,-2%) scale(1.12) rotate(0deg)}}
@keyframes cbSlideIn{from{transform:translateX(100%);opacity:0}to{transform:none;opacity:1}}
@keyframes cbSlideUp{from{opacity:0;transform:translate(-50%,14px) scale(.98)}to{opacity:1;transform:translate(-50%,0) scale(1)}}

#app{position:relative;width:100%;height:100vh;display:flex;flex-direction:column;overflow:hidden;}

/* bg blobs */
#bg-blobs{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;}
.blob{position:absolute;border-radius:50%;filter:blur(40px);}
.blob1{top:-12%;left:8%;width:46%;height:60%;background:radial-gradient(circle,var(--b1c,rgba(62,123,250,.28)),transparent 68%);--dx:40px;--dy:30px;animation:cbDrift 19s ease-in-out infinite;}
.blob2{top:30%;right:-6%;width:42%;height:58%;background:radial-gradient(circle,var(--b2c,rgba(91,141,239,.22)),transparent 68%);--dx:-32px;--dy:26px;animation:cbDrift 23s ease-in-out infinite;}
.blob3{bottom:-16%;left:34%;width:40%;height:52%;background:radial-gradient(circle,var(--b3c,rgba(232,161,58,.14)),transparent 68%);--dx:28px;--dy:-22px;animation:cbDrift 27s ease-in-out infinite;}
#mesh{position:absolute;inset:-25%;background:radial-gradient(38% 44% at 24% 28%,var(--m1c,rgba(22,207,152,.22)),transparent 64%),radial-gradient(40% 42% at 78% 26%,var(--m2c,rgba(91,141,239,.18)),transparent 66%),radial-gradient(44% 46% at 62% 82%,var(--m3c,rgba(124,79,208,.18)),transparent 66%);animation:cbMesh 28s ease-in-out infinite;pointer-events:none;}
#grain{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:.02;mix-blend-mode:soft-light;background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');background-size:170px 170px;}
[data-theme="dark"] #grain{opacity:.04;}

#shell{position:relative;z-index:1;display:flex;flex:1;min-height:0;}

/* sidebar */
#sidebar{width:var(--nav-w);flex-shrink:0;display:flex;flex-direction:column;padding:16px 12px 14px;gap:2px;border-right:1px solid var(--glassBorder);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);}
.logo-row{display:flex;align-items:center;gap:9px;padding:2px 8px 12px;}
.logo-text{font-family:&quot;JetBrains Mono&quot;,monospace;font-weight:600;font-size:14px;letter-spacing:-.3px;}
.logo-text span{color:var(--accent);}
.logo-sub{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;color:var(--faint);margin-top:3px;letter-spacing:.4px;}
.sidebar-search{padding:0 2px 10px;position:relative;}
.sidebar-search input{width:100%;background:rgba(255,255,255,.06);border:1px solid var(--glassBorder);border-radius:10px;padding:8px 10px 8px 30px;font-size:12px;color:var(--text);}
.sidebar-search input::placeholder{color:var(--faint);}
.ss-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.4;}
.nav-item{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;color:var(--muted);transition:background .15s,color .15s;user-select:none;min-height:40px;}
.nav-item:hover{background:var(--bg2);color:var(--text);}
.nav-item.active{background:var(--accentSoft);color:var(--accent);}
.nav-item .ni{width:17px;height:17px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.nav-badge{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--accent);color:#fff;font-size:10px;font-weight:700;font-family:&quot;JetBrains Mono&quot;,monospace;display:flex;align-items:center;justify-content:center;}
.sidebar-bot{margin-top:auto;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--glassBorder);padding-top:10px;}
.agent-status{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:11px;background:var(--surface2);border:1px solid var(--glassBorder);}
.agent-dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:cbPulse 2.4s ease-in-out infinite;}
.agent-label{font-size:11px;font-weight:500;line-height:1.2;}
.agent-sublabel{font-size:9px;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;margin-top:2px;}
.role-switcher{padding:0 2px;}
.role-sw-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:8px;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;padding:0 9px;}
.role-chips{display:flex;gap:4px;flex-wrap:wrap;padding:0 4px;}
.role-chip{padding:4px 9px;border-radius:7px;border:1px solid var(--glassBorder);background:transparent;font-size:10.5px;font-weight:600;color:var(--faint);cursor:pointer;transition:all .15s;min-height:28px;}
.role-chip.on{background:var(--accentSoft);color:var(--accent);border-color:rgba(62,123,250,.3);}
.role-chip:hover:not(.on){background:rgba(255,255,255,.05);color:var(--muted);}

/* theme picker */
.theme-picker{position:relative;}
.theme-btn{display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:9px;border:1px solid var(--glassBorder);background:transparent;font-size:11px;font-weight:500;color:var(--faint);width:100%;min-height:36px;}
.theme-btn:hover{background:var(--bg2);color:var(--text);}
.theme-panel{position:absolute;bottom:calc(100% + 6px);left:0;right:0;background:var(--surface);backdrop-filter:blur(20px);border:1px solid var(--glassBorder);border-radius:14px;padding:12px 10px;display:none;z-index:50;box-shadow:var(--shadow-lg);}
.theme-panel.open{display:block;animation:cbFadeUp .15s ease;}
.theme-panel-lbl{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;padding:0 2px;}
.theme-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;}
.theme-swatch{height:30px;border-radius:9px;cursor:pointer;border:2px solid transparent;transition:border-color .15s;}
.theme-swatch.on{border-color:var(--accent);}

/* main */
#main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}
#topbar{display:none;align-items:center;gap:10px;padding:11px 16px;flex-shrink:0;border-bottom:1px solid var(--glassBorder);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);}
#topbar .logo-text{font-size:15px;}
#notif-btn{position:relative;width:40px;height:40px;border-radius:10px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-left:auto;}
#notif-btn:hover{background:rgba(255,255,255,.08);}
#notif-count{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--red);color:#fff;font-size:9px;font-weight:700;font-family:&quot;JetBrains Mono&quot;,monospace;display:none;align-items:center;justify-content:center;}
#content{flex:1;overflow-y:auto;min-height:0;padding:24px clamp(14px,4vw,28px) 100px;}
#content>div{max-width:1100px;margin:0 auto;animation:cbFadeUp .3s ease;}

/* notifications panel */
#notif-panel{position:fixed;top:0;right:0;width:340px;height:100%;background:rgba(12,13,18,.96);backdrop-filter:blur(24px);border-left:1px solid var(--glassBorder);z-index:100;transform:translateX(100%);transition:transform .25s cubic-bezier(.4,0,.2,1);overflow-y:auto;padding:20px 16px;}
#notif-panel.open{transform:none;}
.notif-head{display:flex;align-items:center;gap:10px;margin-bottom:18px;}
.notif-title{font-size:15px;font-weight:700;flex:1;}
.notif-close{width:36px;height:36px;border-radius:9px;border:1px solid var(--glassBorder);background:transparent;color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;}

/* section header */
.sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap;}
.sec-title{font-size:22px;font-weight:700;letter-spacing:-.5px;}
.sec-sub{font-size:12.5px;color:var(--muted);margin-top:3px;}
.head-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}

/* glass card */
.gc{background:var(--surface);border:1px solid var(--glassBorder);box-shadow:var(--shadow);border-radius:16px;}
[data-theme="dark"] .gc{backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);box-shadow:inset 0 1px 0 var(--glassHi),0 4px 16px rgba(0,0,0,.14);}

/* briefing panel */
.brief-card{padding:18px 20px;border-radius:18px;margin-bottom:22px;}
.brief-header{display:flex;align-items:center;gap:11px;margin-bottom:13px;}
.brief-brain{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 14px var(--accentGlow);flex-shrink:0;}
.brief-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;font-weight:600;color:var(--accent);letter-spacing:.8px;text-transform:uppercase;}
.brief-title{font-size:13px;font-weight:500;margin-top:2px;color:var(--text);line-height:1.4;}
.brief-sw{display:flex;gap:2px;margin-left:auto;}
.brief-sw-btn{padding:5px 9px;border:none;border-radius:7px;background:transparent;font-size:10px;font-weight:600;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.3px;min-height:28px;}
.brief-sw-btn.on{background:rgba(255,255,255,.1);color:var(--text);}
.brief-stats{display:flex;gap:9px;flex-wrap:wrap;}
.brief-stat{flex:1;min-width:80px;padding:10px 13px;border-radius:11px;background:var(--bg2);border:1px solid var(--glassBorder);}
[data-theme="dark"] .brief-stat{background:rgba(255,255,255,.04);}
.brief-stat-val{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:20px;font-weight:700;}
.brief-stat-lbl{font-size:10px;color:var(--muted);margin-top:2px;}

/* CEO KPI row */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:10px;margin-bottom:20px;}
.kpi-card{padding:14px 15px;border-radius:14px;}
.kpi-val{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:26px;font-weight:700;line-height:1;}
.kpi-lbl{font-size:11px;color:var(--muted);margin-top:7px;}

/* role-specific panels */
.role-panel{padding:16px 18px;border-radius:16px;margin-bottom:18px;border-left:3px solid var(--accent);}
.role-panel-lbl{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;font-weight:600;color:var(--accent);letter-spacing:.7px;text-transform:uppercase;margin-bottom:8px;}
.role-panel-title{font-size:14px;font-weight:600;margin-bottom:4px;}
.role-panel-sub{font-size:12px;color:var(--muted);line-height:1.5;}
.role-stats{display:flex;gap:18px;margin-top:12px;padding-top:11px;border-top:1px solid var(--glassBorder);}
.role-stat-val{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:18px;font-weight:700;}
.role-stat-lbl{font-size:10px;color:var(--muted);margin-top:2px;}

/* accountability */
.acct-row{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;}
.acct-avatar{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;border:2px solid var(--glass);box-shadow:0 1px 3px rgba(31,38,135,.2);flex-shrink:0;}
.acct-stack{display:flex;align-items:center;}
.acct-stack .acct-avatar{margin-left:-7px;}
.acct-stack .acct-avatar:first-child{margin-left:0;}
.acct-txt{font-size:10.5px;color:var(--faint);white-space:nowrap;}
.acct-btn{font-size:10.5px;color:var(--accent);background:transparent;border:none;padding:0;cursor:pointer;}
.acct-btn:hover{text-decoration:underline;}

/* loop cards */
.loops-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;}
.col-head{display:flex;align-items:center;gap:8px;margin-bottom:5px;padding:0 2px;}
.col-dot{width:9px;height:9px;border-radius:3px;}
.col-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;}
.col-count{margin-left:auto;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:12px;color:var(--muted);}
.col-hint{font-size:10.5px;color:var(--faint);display:block;margin:-2px 0 10px 17px;}
.loop-card{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:14px;margin-bottom:10px;animation:cbFadeUp .3s ease both;}
.loop-card .check-btn{width:22px;height:22px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:border-color .15s,background .15s;min-height:22px;}
.loop-card .check-btn:hover{border-color:var(--green);background:rgba(55,192,138,.1);}
.loop-info{flex:1;min-width:0;}
.loop-title-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;}
.loop-title-row .loop-title{flex:1;min-width:0;}
.loop-title{font-size:14px;font-weight:600;line-height:1.35;}
.loop-meta{font-size:12px;color:var(--muted);margin-top:2px;}
.loop-chan{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;font-weight:600;letter-spacing:.4px;color:var(--faint);text-transform:uppercase;}
.loop-actions{display:flex;align-items:center;gap:16px;margin-top:10px;}
.age-pill{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:7px;white-space:nowrap;flex-shrink:0;}
.age-fresh{background:var(--greenSoft);color:var(--green);}
.age-mid{background:var(--amberSoft);color:var(--amber);}
.age-old{background:var(--redSoft);color:var(--red);}
.link-btn{font-size:11.5px;font-weight:500;color:var(--muted);background:transparent;border:none;padding:0;cursor:pointer;min-height:28px;}
.link-btn:hover{color:var(--text);}
.link-btn.teal{color:var(--teal);}

/* quick-add bar */
#qbar{position:fixed;left:var(--nav-w);right:0;bottom:0;padding:12px clamp(14px,4vw,28px);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border-top:1px solid var(--glassBorder);display:flex;gap:10px;z-index:20;}
#qbar input{flex:1;min-width:0;background:rgba(255,255,255,.07);border:1px solid var(--glassBorder);border-radius:12px;padding:11px 14px;font-size:14px;color:var(--text);}
#qbar input::placeholder{color:var(--faint);}
#qbar button{background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;border-radius:12px;padding:11px 20px;font-size:13px;font-weight:600;color:#fff;box-shadow:0 4px 14px var(--accentGlow);min-height:44px;}
.qhint{font-size:11px;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;align-self:center;white-space:nowrap;}

/* segments */
.seg-bar{display:flex;gap:4px;padding:4px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--glassBorder);width:fit-content;margin-bottom:18px;flex-wrap:wrap;}
.seg-btn{padding:7px 14px;border-radius:9px;border:none;background:transparent;font-size:13px;font-weight:500;color:var(--muted);min-height:36px;}
.seg-btn.on{background:rgba(255,255,255,.1);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.2);}

/* task/lead cards */
.item-card{display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-radius:14px;margin-bottom:9px;}
.item-card .check-btn{width:20px;height:20px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:border-color .15s;min-height:20px;}
.item-card .check-btn:hover{border-color:var(--blue);}
.emoji-ic{font-size:18px;line-height:1;flex-shrink:0;margin-top:1px;}
.item-title{font-size:13.5px;font-weight:600;line-height:1.3;}
.item-sub{font-size:12px;color:var(--muted);margin-top:3px;}
.stage-pill{font-size:11px;font-weight:600;padding:3px 10px;border-radius:8px;white-space:nowrap;}
.task-overdue{border-left:3px solid var(--red) !important;border-top-left-radius:11px !important;border-bottom-left-radius:11px !important;}
.task-due-soon{border-left:3px solid var(--amber) !important;border-top-left-radius:11px !important;border-bottom-left-radius:11px !important;}
.lead-avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;font-weight:700;}

/* lead detail drawer */
.lead-detail{display:none;padding:12px 14px 14px;border-top:1px solid var(--glassBorder);margin-top:2px;animation:cbFadeUp .2s ease;width:100%;}
.lead-detail.open{display:block;}
.lead-detail-row{display:flex;gap:8px;margin-bottom:7px;font-size:12px;}
.lead-detail-lbl{color:var(--faint);min-width:80px;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;padding-top:1px;}
.lead-detail-val{color:var(--text);font-weight:500;}
.lead-action-strip{display:flex;gap:7px;margin-top:10px;flex-wrap:wrap;}
.lead-action-btn{padding:8px 12px;border-radius:9px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.04);color:var(--muted);font-size:12px;font-weight:500;min-height:36px;}
.lead-action-btn:hover{background:rgba(255,255,255,.08);color:var(--text);}
.lead-action-btn.primary{background:var(--accentSoft);color:var(--accent);border-color:rgba(62,123,250,.3);}
.lead-timeline{position:relative;margin-top:12px;padding-left:16px;}
.lead-timeline::before{content:'';position:absolute;left:5px;top:4px;bottom:4px;width:1.5px;background:var(--glassBorder);}
.lead-tl-item{position:relative;padding-left:16px;margin-bottom:12px;}
.lead-tl-item::before{content:'';position:absolute;left:-10.5px;top:4px;width:9px;height:9px;border-radius:50%;background:var(--bg);border:2px solid var(--accent);}
.lead-tl-text{font-size:12px;line-height:1.4;}
.lead-tl-when{font-size:10px;color:var(--faint);margin-top:2px;font-family:&quot;JetBrains Mono&quot;,monospace;}

/* agent / autonomy */
.agent-card{padding:16px 18px;border-radius:15px;margin-bottom:10px;}
.agent-name{font-size:14px;font-weight:700;}
.agent-role{font-size:12px;color:var(--muted);margin-top:2px;}
.auto-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.3px;}
.auto-auto{background:var(--greenSoft);color:var(--green);}
.auto-ask{background:var(--amberSoft);color:var(--amber);}
.auto-off{background:rgba(120,120,140,.12);color:var(--faint);}
.prog-wrap{flex:1;height:5px;border-radius:5px;background:rgba(255,255,255,.08);overflow:hidden;}
.prog-fill{height:100%;border-radius:5px;transition:width .4s ease;}
.hire-btn{display:flex;align-items:center;gap:10px;padding:13px 15px;border-radius:14px;border:1px dashed rgba(120,120,160,.3);color:var(--accent);font-size:12.5px;font-weight:600;background:transparent;width:100%;margin-top:6px;cursor:pointer;min-height:48px;}
.hire-btn:hover{background:var(--accentSoft);border-color:rgba(62,123,250,.4);}
.auto-card{padding:15px 17px;border-radius:15px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.auto-info{flex:1;min-width:180px;}
.auto-label{font-size:14px;font-weight:600;}
.auto-desc{font-size:12px;color:var(--muted);margin-top:3px;}
.lvls{display:flex;gap:3px;padding:3px;border-radius:10px;background:rgba(0,0,0,.2);border:1px solid var(--glassBorder);}
.lvl{padding:6px 13px;border-radius:7px;border:none;background:transparent;font-size:12px;font-weight:600;color:var(--muted);min-height:36px;}
.lvl.on{background:rgba(255,255,255,.12);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.25);}
.approve-card{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:14px;margin-bottom:9px;}
.approve-title{font-size:13px;font-weight:600;}
.approve-action{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;color:var(--faint);margin-top:3px;}
.approve-btn{padding:8px 16px;border-radius:9px;border:none;font-size:12px;font-weight:600;min-height:36px;}
.approve-btn.ok{background:linear-gradient(135deg,var(--green),#3ee3b0);color:#fff;}
.approve-btn.no{background:rgba(240,85,107,.14);color:var(--red);}

/* leads */
.lead-stage-new{background:rgba(150,150,170,.12);color:var(--muted);}
.lead-stage-contacted{background:var(--blueSoft);color:var(--blue);}
.lead-stage-meeting{background:rgba(124,92,255,.15);color:#9b7bff;}
.lead-stage-proposal{background:var(--amberSoft);color:var(--amber);}
.lead-stage-won{background:var(--greenSoft);color:var(--green);}
.lead-stage-lost{background:rgba(100,100,120,.1);color:var(--faint);}

/* events */
.event-card{padding:12px 16px;border-radius:13px;margin-bottom:8px;display:flex;align-items:center;gap:12px;}
.event-type{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:12px;font-weight:600;color:var(--accent);}
.event-meta{font-size:11.5px;color:var(--muted);margin-top:2px;}
.event-icon{width:34px;height:34px;border-radius:10px;background:var(--surface2);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
.date-sep{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;padding:8px 0 6px;display:flex;align-items:center;gap:10px;}
.date-sep::before,.date-sep::after{content:'';flex:1;height:1px;background:var(--glassBorder);}
.undo-btn{margin-left:auto;padding:6px 12px;border-radius:8px;border:1px solid var(--glassBorder);background:transparent;color:var(--muted);font-size:12px;font-weight:500;min-height:32px;}
.undo-btn:hover{background:rgba(255,255,255,.06);color:var(--text);}
.rev-badge{margin-left:auto;font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:7px;background:var(--blueSoft);color:var(--blue);}

/* command palette */
#cmd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:300;display:none;align-items:flex-start;justify-content:center;padding-top:14vh;}
#cmd-overlay.open{display:flex;}
#cmd-box{width:100%;max-width:530px;border-radius:18px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.5);border:1px solid var(--glassBorder);}
#cmd-search{width:100%;padding:16px 18px;background:rgba(16,17,22,.98);border:none;font-size:15px;color:var(--text);border-bottom:1px solid var(--glassBorder);}
#cmd-results{max-height:360px;overflow-y:auto;background:rgba(12,13,18,.97);}
.cmd-group{padding:8px 18px 2px;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;color:var(--faint);letter-spacing:.6px;text-transform:uppercase;}
.cmd-item{display:flex;align-items:center;gap:12px;padding:10px 18px;cursor:pointer;font-size:13px;border-radius:0;min-height:44px;}
.cmd-item:hover,.cmd-item.sel{background:var(--accentSoft);}
.cmd-item-ic{width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
.cmd-item-label{font-weight:500;flex:1;}
.cmd-item-hint{font-size:10px;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,.06);border:1px solid var(--glassBorder);}

/* mobile bottom nav \u2014 44px hit targets */
#botnav{display:none;position:fixed;left:0;right:0;bottom:0;background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border-top:1px solid var(--glassBorder);padding:4px 0 max(6px,env(safe-area-inset-bottom));z-index:30;}
#botnav button{flex:1;border:none;background:transparent;padding:0;min-height:48px;font-size:10px;font-weight:600;color:var(--muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}
#botnav button.on{color:var(--accent);}
#botnav .bn-ic{font-size:18px;line-height:1;}

/* toast */
#toast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%) translateY(20px);opacity:0;pointer-events:none;transition:all .25s ease;z-index:200;max-width:min(92vw,420px);}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto;}
#toast .toast-inner{display:flex;align-items:center;gap:10px;padding:11px 15px;border-radius:13px;background:rgba(26,26,46,.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.1);box-shadow:0 14px 40px rgba(0,0,0,.35);color:#fff;font-size:13px;}
#toast .toast-undo{background:var(--accentSoft);color:var(--accent);border:none;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;margin-left:6px;}

/* buttons */
.btn-primary{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:11px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:600;box-shadow:0 4px 14px var(--accentGlow);min-height:40px;}
.btn-ghost{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:10px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.05);color:var(--muted);font-size:12.5px;font-weight:500;min-height:36px;}
.btn-ghost:hover{background:rgba(255,255,255,.08);color:var(--text);}
.btn-danger{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:11px;border:none;background:var(--red);color:#fff;font-size:13px;font-weight:600;min-height:40px;}

/* dark mode toggle */
.dark-toggle{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:9px;border:1px solid var(--glassBorder);background:transparent;font-size:11px;font-weight:500;color:var(--muted);width:100%;min-height:34px;cursor:pointer;}
.dark-toggle:hover{background:var(--bg2);color:var(--text);}
.topbar-dark-toggle{width:36px;height:36px;border-radius:9px;border:1px solid var(--glassBorder);background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);margin-left:auto;}
.topbar-dark-toggle:hover{background:var(--bg2);color:var(--text);}

/* empty / spinner */
.empty{color:var(--faint);text-align:center;padding:40px 0;font-size:13px;}
.empty-dashed{padding:30px 18px;text-align:center;border-radius:14px;border:1px dashed rgba(255,255,255,.1);color:var(--faint);font-size:12.5px;margin-top:4px;}
.spin{width:20px;height:20px;border:2.5px solid rgba(255,255,255,.12);border-top-color:var(--accent);border-radius:50%;animation:cbSpin .8s linear infinite;margin:40px auto;display:block;}

/* kanban board */
.kanban-wrap{margin-top:4px;}.overdue-strip{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:11px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);margin-bottom:14px;}.overdue-strip-count{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:13px;font-weight:700;color:var(--red);}.overdue-strip-label{font-size:12.5px;color:var(--red);flex:1;}.kanban-board{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}.kanban-col{min-width:0;}.kanban-col-head{display:flex;align-items:center;gap:7px;padding:0 2px 10px;}.kanban-col-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0;}.kanban-col-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);}.kanban-col-count{margin-left:auto;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;color:var(--faint);}.kanban-col-body{display:flex;flex-direction:column;gap:7px;min-height:80px;}.kanban-task-card{padding:11px 13px;border-radius:12px;}.kanban-task-card.overdue{border-left:3px solid var(--red);border-top-left-radius:9px;border-bottom-left-radius:9px;}.kanban-task-card.due-soon{border-left:3px solid var(--amber);border-top-left-radius:9px;border-bottom-left-radius:9px;}.kanban-task-row{display:flex;align-items:flex-start;gap:8px;}.kanban-check{width:17px;height:17px;border-radius:50%;border:2px solid var(--glassBorder);background:transparent;flex-shrink:0;margin-top:2px;cursor:pointer;transition:border-color .15s,background .15s;min-height:17px;}.kanban-check:hover{border-color:var(--green);background:var(--greenSoft);}.kanban-task-emoji{font-size:13px;flex-shrink:0;margin-top:1px;}.kanban-task-title{font-size:13px;font-weight:600;color:var(--text);line-height:1.3;flex:1;}.kanban-task-sub{font-size:10.5px;color:var(--muted);margin-top:3px;}.kanban-task-foot{display:flex;align-items:center;gap:6px;margin-top:7px;flex-wrap:wrap;}.priority-pill{font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;font-family:&quot;JetBrains Mono&quot;,monospace;white-space:nowrap;}.priority-high{background:var(--redSoft);color:var(--red);}.priority-med{background:var(--amberSoft);color:var(--amber);}.priority-low{background:var(--greenSoft);color:var(--green);}.kanban-add-btn{display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:10px;border:1.5px dashed var(--glassBorder);background:transparent;color:var(--faint);font-size:12px;width:100%;cursor:pointer;margin-top:5px;min-height:34px;transition:all .15s;}.kanban-add-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accentSoft);}

/* pipeline board */
.pipeline-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;-webkit-overflow-scrolling:touch;margin-top:4px;}.pipeline-board::-webkit-scrollbar{height:4px;}.pipeline-col{min-width:210px;width:210px;flex-shrink:0;}.pipeline-col-head{display:flex;align-items:center;gap:6px;padding:0 2px 10px;}.pipeline-stage-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}.pipeline-stage-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);}.pipeline-col-count{margin-left:auto;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;color:var(--faint);}.pipeline-col-body{display:flex;flex-direction:column;gap:7px;min-height:80px;}.pipeline-lead-card{padding:11px 12px;border-radius:12px;cursor:pointer;transition:transform .15s,box-shadow .15s;}.pipeline-lead-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-md);}.pipeline-lead-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;color:#fff;}.pipeline-lead-name{font-size:12.5px;font-weight:600;color:var(--text);line-height:1.3;}.pipeline-lead-sub{font-size:10.5px;color:var(--muted);margin-top:2px;}.pipeline-lead-foot{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap;}.plead-adv-btn{padding:4px 9px;border-radius:6px;border:1px solid var(--glassBorder);background:var(--surface2);color:var(--muted);font-size:10.5px;font-weight:500;min-height:26px;cursor:pointer;transition:all .15s;text-decoration:none;}.plead-adv-btn:hover{background:var(--accentSoft);color:var(--accent);border-color:rgba(62,123,250,.3);}

/* bento grid */
.bento-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:13px;margin-top:4px;}.bento-card{border-radius:18px;padding:20px;min-height:170px;display:flex;flex-direction:column;position:relative;overflow:hidden;cursor:pointer;transition:transform .2s,box-shadow .2s;}.bento-card:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg);}.bento-hero{grid-column:span 2;min-height:190px;}.bento-card-emoji{font-size:26px;margin-bottom:auto;}.bento-card-name{font-size:15px;font-weight:700;line-height:1.3;color:#fff;}.bento-card-desc{font-size:11.5px;opacity:.8;margin-top:4px;color:#fff;line-height:1.4;}.bento-card-foot{display:flex;align-items:center;gap:8px;margin-top:12px;}.bento-prog-bar{flex:1;height:3px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden;}.bento-prog-fill{height:100%;border-radius:3px;background:rgba(255,255,255,.75);}.bento-pct{font-size:10px;font-weight:700;color:rgba(255,255,255,.8);font-family:&quot;JetBrains Mono&quot;,monospace;}.bento-status{font-size:9.5px;font-weight:700;padding:3px 8px;border-radius:5px;background:rgba(255,255,255,.2);color:#fff;font-family:&quot;JetBrains Mono&quot;,monospace;}.bento-new-card{border-radius:18px;padding:20px;min-height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:2px dashed var(--glassBorder);cursor:pointer;transition:all .2s;color:var(--faint);background:transparent;}.bento-new-card:hover{border-color:var(--accent);color:var(--accent);background:var(--accentSoft);}

/* modals */
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:blur(4px);z-index:200;display:none;align-items:center;justify-content:center;padding:16px;}.modal-backdrop.open{display:flex;}.modal-box{background:var(--surface);border:1px solid var(--glassBorder);border-radius:20px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;box-shadow:var(--shadow-lg);animation:cbModalUp .2s ease;}.modal-head{display:flex;align-items:center;gap:12px;padding:18px 18px 0;}.modal-title{font-size:15px;font-weight:700;flex:1;}.modal-close{width:30px;height:30px;border-radius:7px;border:1px solid var(--glassBorder);background:transparent;color:var(--muted);font-size:16px;cursor:pointer;}.modal-body{padding:16px 18px 4px;}.modal-foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 18px 18px;}.modal-field{margin-bottom:13px;}.modal-label{display:block;font-size:10px;font-weight:600;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;text-transform:uppercase;margin-bottom:5px;}.modal-input,.modal-select{width:100%;padding:9px 12px;border-radius:9px;border:1px solid var(--glassBorder);background:var(--bg2);color:var(--text);font-size:13px;font-family:inherit;}[data-theme="dark"] .modal-input,[data-theme="dark"] .modal-select{background:rgba(255,255,255,.06);}.modal-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accentSoft);outline:none;}@keyframes cbModalUp{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}

/* sheets / modals on mobile */
.sheet-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);z-index:90;display:none;}
.sheet-backdrop.open{display:block;}

@media (max-width:700px){
  #sidebar{display:none;}
  #topbar{display:flex;}
  #botnav{display:flex;}
  #qbar{left:0;bottom:60px;}
  #content{padding:16px 14px 150px;}
  #notif-panel{width:100%;}
  .loops-grid{grid-template-columns:1fr;}
  .kpi-grid{grid-template-columns:repeat(2,1fr);}
  .kanban-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;}
  .kanban-col{min-width:230px;flex-shrink:0;}
  .bento-hero{grid-column:span 1;}
}
@media(min-width:900px){.bento-grid{grid-template-columns:repeat(3,1fr);}}

/* drag-and-drop + project/agent extras */
.kanban-task-card[draggable="true"]{cursor:grab;}
.kanban-task-card.dragging{opacity:.4;}
.kanban-col-body.drag-over{background:var(--accentSoft);border-radius:12px;outline:2px dashed var(--accent);outline-offset:-2px;}
.pipeline-lead-card[draggable="true"]{cursor:grab;}
.pipeline-lead-card.dragging{opacity:.4;}
.pipeline-col-body.drag-over{background:var(--accentSoft);border-radius:12px;outline:2px dashed var(--accent);outline-offset:-2px;}
.proj-color-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.proj-color-swatch{width:28px;height:28px;border-radius:50%;border:2px solid transparent;cursor:pointer;flex-shrink:0;transition:transform .12s;}
.proj-color-swatch:hover{transform:scale(1.12);}
.proj-color-swatch.on{border-color:var(--text);box-shadow:0 0 0 2px var(--surface),0 0 0 4px var(--accent);}
.proj-upload-row{display:flex;align-items:center;gap:10px;}
.proj-upload-preview{width:52px;height:52px;border-radius:12px;background-size:cover;background-position:center;border:1px solid var(--glassBorder);flex-shrink:0;background-color:var(--bg2);}
.proj-detail-hero{border-radius:16px;padding:22px;min-height:110px;display:flex;flex-direction:column;justify-content:flex-end;margin-bottom:14px;position:relative;}
.proj-detail-emoji{font-size:30px;margin-bottom:8px;}
.proj-detail-name{font-size:19px;font-weight:700;color:#fff;}
.proj-detail-row{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.proj-stepper-btn{width:28px;height:28px;border-radius:8px;border:1px solid var(--glassBorder);background:var(--bg2);color:var(--text);font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:28px;}
.proj-stepper-btn:hover{background:var(--accentSoft);color:var(--accent);border-color:rgba(62,123,250,.3);}
.agent-card.custom{border-left:3px solid var(--accent);}
.agent-remove-btn{margin-left:auto;background:transparent;border:none;color:var(--faint);cursor:pointer;font-size:16px;padding:2px 6px;border-radius:6px;flex-shrink:0;}
.agent-remove-btn:hover{color:var(--red);background:var(--redSoft);}
.emoji-pick-row{display:flex;gap:6px;flex-wrap:wrap;}
.emoji-pick-btn{width:34px;height:34px;border-radius:9px;border:1.5px solid var(--glassBorder);background:var(--bg2);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:34px;transition:all .12s;}
.emoji-pick-btn.on{border-color:var(--accent);background:var(--accentSoft);}
</style>
</head>
<body>
<div id="app">
  <div id="bg-blobs"><div id="mesh"></div><div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div></div>
  <div id="grain"></div>

  <div id="shell">
    <nav id="sidebar">
      <div class="logo-row">
        <div><div class="logo-text">company<span>brain</span></div><div class="logo-sub">v1 &middot; forget-nothing</div></div>
      </div>
      <div class="sidebar-search">
        <svg class="ss-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="sidebar-search-input" placeholder="Search\u2026" autocomplete="off"/>
      </div>
      <div id="side-nav"></div>
      <div class="sidebar-bot">
        <div class="role-switcher">
          <div class="role-sw-label">View as</div>
          <div class="role-chips" id="role-chips">
            <button class="role-chip on" data-role="ceo">CEO</button>
            <button class="role-chip" data-role="mgr">Mgr</button>
            <button class="role-chip" data-role="emp">Emp</button>
            <button class="role-chip" data-role="client">Client</button>
          </div>
        </div>
        <button class="dark-toggle" id="dark-toggle-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <span id="dark-toggle-label">Dark mode</span>
        </button>
        <div class="theme-picker" id="theme-picker">
          <button class="theme-btn" id="theme-toggle-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            Wallpaper
          </button>
          <div class="theme-panel" id="theme-panel">
            <div class="theme-panel-lbl">Choose theme</div>
            <div class="theme-swatches" id="theme-swatches"></div>
          </div>
        </div>
        <div class="agent-status">
          <div class="agent-dot"></div>
          <div><div class="agent-label">Agent online</div><div class="agent-sublabel">watching all channels</div></div>
        </div>
        <div class="agent-status" id="session-user-card">
          <div style="width:18px;height:18px;border-radius:6px;background:var(--accentSoft);display:flex;align-items:center;justify-content:center;color:var(--accent);font-size:11px;font-weight:700;">\u{1F464}</div>
          <div style="flex:1;min-width:0;"><div class="agent-label" id="session-user-name">Guest</div><div class="agent-sublabel" id="session-user-role">not signed in</div></div>
          <button class="btn-ghost" id="logout-btn" style="padding:4px 8px;min-height:28px;font-size:10.5px;display:none;">Logout</button>
        </div>
      </div>
    </nav>

    <main id="main">
      <div id="topbar">
        <div class="logo-text">company<span style="color:var(--accent)">brain</span></div>
        <button class="topbar-dark-toggle" id="topbar-dark-toggle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <div id="notif-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span id="notif-count"></span>
        </div>
        <button class="topbar-dark-toggle" id="topbar-logout-btn" title="Sign out" style="display:none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>
      <div id="content"><div id="view"><div class="spin"></div></div></div>
    </main>
  </div>

  <form id="qbar" style="display:none">
    <input id="qfield" autocomplete="off"/>
    <span class="qhint">\u2318K</span>
    <button type="submit">Add</button>
  </form>

  <div id="botnav"></div>

  <div class="modal-backdrop" id="more-sheet" style="align-items:flex-end;padding:0;">
    <div style="background:var(--surface);border-radius:20px 20px 0 0;width:100%;padding:12px 16px 32px;border:1px solid var(--glassBorder);">
      <div style="width:36px;height:4px;border-radius:4px;background:var(--glassBorder);margin:0 auto 16px;"></div>
      <div id="more-sheet-items" style="display:flex;flex-direction:column;gap:2px;"></div>
    </div>
  </div>

  <div class="modal-backdrop" id="task-modal">
    <div class="modal-box">
      <div class="modal-head"><span id="task-modal-emoji" style="font-size:22px;cursor:pointer;" title="Pick emoji">\u{1F4DD}</span><span class="modal-title">New task</span><button class="modal-close" id="task-modal-close">\xD7</button></div>
      <div class="modal-body">
        <div class="modal-field"><label class="modal-label">Title</label><input class="modal-input" id="task-modal-title" placeholder="What needs doing?" autocomplete="off"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="modal-field"><label class="modal-label">When</label><select class="modal-select" id="task-modal-when"><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="upcoming">Upcoming</option></select></div><div class="modal-field"><label class="modal-label">Priority</label><select class="modal-select" id="task-modal-priority"><option value="">None</option><option value="low">Low</option><option value="med">Medium</option><option value="high">High</option></select></div></div>
        <div class="modal-field"><label class="modal-label">List / Project</label><input class="modal-input" id="task-modal-list" placeholder="Inbox" autocomplete="off"/></div>
        <div class="modal-field"><label class="modal-label">Repeat</label><select class="modal-select" id="task-modal-repeat"><option value="">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
      </div>
      <div class="modal-foot"><button class="btn-ghost" id="task-modal-cancel">Cancel</button><button class="btn-primary" id="task-modal-save">Save task</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="lead-modal">
    <div class="modal-box">
      <div class="modal-head"><span style="font-size:20px;">\u{1F91D}</span><span class="modal-title">New lead</span><button class="modal-close" id="lead-modal-close">\xD7</button></div>
      <div class="modal-body">
        <div style="display:flex;gap:3px;padding:3px;border-radius:9px;background:var(--bg2);border:1px solid var(--glassBorder);margin-bottom:14px;"><button class="capture-tab on" id="lead-tab-type" style="flex:1;padding:7px;border-radius:7px;border:none;background:var(--surface);font-size:12px;font-weight:600;color:var(--text);cursor:pointer;min-height:34px;box-shadow:var(--shadow-md);">&#9997; Type details</button><button class="capture-tab" id="lead-tab-photo" style="flex:1;padding:7px;border-radius:7px;border:none;background:transparent;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;min-height:34px;">&#128247; Scan card</button></div>
        <div id="lead-type-form"><div class="modal-field"><label class="modal-label">Name *</label><input class="modal-input" id="lead-name" placeholder="John Smith" autocomplete="off"/></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="modal-field"><label class="modal-label">Phone</label><input class="modal-input" id="lead-phone" placeholder="+91 98765 00000"/></div><div class="modal-field"><label class="modal-label">Email</label><input class="modal-input" id="lead-email" placeholder="john@acme.com"/></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="modal-field"><label class="modal-label">Company</label><input class="modal-input" id="lead-company" placeholder="Acme Inc."/></div><div class="modal-field"><label class="modal-label">Title</label><input class="modal-input" id="lead-title" placeholder="CEO"/></div></div><div class="modal-field"><label class="modal-label">Notes</label><textarea class="modal-input" id="lead-notes" rows="2" placeholder="Met at conference, interested in services" style="resize:vertical;"></textarea></div></div>
        <div id="lead-photo-form" style="display:none;"><div id="lead-upload-area" style="padding:28px 20px;border-radius:12px;border:2px dashed var(--glassBorder);text-align:center;cursor:pointer;transition:all .15s;"><div style="font-size:32px;margin-bottom:10px;">&#128247;</div><div style="font-size:13px;font-weight:600;color:var(--text);">Tap to upload business card</div><div style="font-size:11.5px;color:var(--faint);margin-top:4px;">AI will extract name, phone, email and company</div><input type="file" id="lead-card-file" accept="image/*" style="display:none;"/></div><div id="lead-extracted" style="display:none;margin-top:12px;padding:12px;border-radius:10px;background:var(--bg2);border:1px solid var(--glassBorder);"><div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:8px;font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.4px;">EXTRACTED</div><div id="lead-extracted-fields"></div></div></div>
      </div>
      <div class="modal-foot"><button class="btn-ghost" id="lead-modal-cancel">Cancel</button><button class="btn-primary" id="lead-modal-save">Save lead</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="proj-modal">
    <div class="modal-box">
      <div class="modal-head"><span style="font-size:20px;" id="proj-modal-icon">\u{1F4E6}</span><span class="modal-title" id="proj-modal-title">New project</span><button class="modal-close" id="proj-modal-close">\xD7</button></div>
      <div class="modal-body">
        <div class="modal-field"><label class="modal-label">Choose a template</label><div id="proj-template-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;"></div></div>
        <div class="modal-field"><label class="modal-label">Or pick a custom color</label><div class="proj-color-row" id="proj-color-row"></div></div>
        <div class="modal-field"><label class="modal-label">Or upload a custom image</label><div class="proj-upload-row"><div class="proj-upload-preview" id="proj-upload-preview"></div><input type="file" id="proj-image-file" accept="image/*" style="display:none;"/><button class="btn-ghost" id="proj-image-btn" type="button">Upload image</button><button class="btn-ghost" id="proj-image-clear" type="button" style="display:none;">Remove</button></div></div>
        <div class="modal-field"><label class="modal-label">Emoji</label><div class="emoji-pick-row" id="proj-emoji-row"></div></div>
        <div class="modal-field"><label class="modal-label">Project name</label><input class="modal-input" id="proj-modal-name" placeholder="My new project" autocomplete="off"/></div>
        <div class="modal-field"><label class="modal-label">Description (optional)</label><textarea class="modal-input" id="proj-modal-desc" rows="2" placeholder="What is this project about?" style="resize:vertical;"></textarea></div>
      </div>
      <div class="modal-foot"><button class="btn-danger" id="proj-modal-delete" style="display:none;margin-right:auto;">Delete</button><button class="btn-ghost" id="proj-modal-cancel">Cancel</button><button class="btn-primary" id="proj-modal-save">Create project</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="proj-detail-modal">
    <div class="modal-box">
      <div class="modal-head"><span class="modal-title">Project</span><button class="modal-close" id="proj-detail-close">\xD7</button></div>
      <div class="modal-body" id="proj-detail-body"></div>
      <div class="modal-foot"><button class="btn-danger" id="proj-detail-delete" style="margin-right:auto;">Delete</button><button class="btn-ghost" id="proj-detail-edit">Edit</button><button class="btn-primary" id="proj-detail-close-btn">Close</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="agent-modal">
    <div class="modal-box">
      <div class="modal-head"><span style="font-size:20px;">\u{1F916}</span><span class="modal-title" id="agent-modal-title">Hire a new agent</span><button class="modal-close" id="agent-modal-close">\xD7</button></div>
      <div class="modal-body">
        <div class="modal-field"><label class="modal-label">Emoji</label><div class="emoji-pick-row" id="agent-emoji-row"></div></div>
        <div class="modal-field"><label class="modal-label">Agent name</label><input class="modal-input" id="agent-modal-name" placeholder="e.g. Nova" autocomplete="off"/></div>
        <div class="modal-field"><label class="modal-label">Role / what it does</label><input class="modal-input" id="agent-modal-role" placeholder="e.g. Drafts weekly reports"/></div>
        <div class="modal-field"><label class="modal-label">Autonomy</label><div class="lvls" id="agent-modal-autonomy"><button type="button" class="lvl" data-lvl="off">Off</button><button type="button" class="lvl" data-lvl="ask">Ask</button><button type="button" class="lvl" data-lvl="auto">Auto</button></div></div>
      </div>
      <div class="modal-foot"><button class="btn-danger" id="agent-modal-delete" style="display:none;margin-right:auto;">Remove</button><button class="btn-ghost" id="agent-modal-cancel">Cancel</button><button class="btn-primary" id="agent-modal-save">Hire agent</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="auth-modal">
    <div class="modal-box" style="max-width:430px;">
      <div class="modal-head"><span style="font-size:20px;">\u{1F510}</span><span class="modal-title">Sign in to companybrain</span></div>
      <div class="modal-body">
        <div style="font-size:12px;color:var(--muted);line-height:1.45;margin-bottom:12px;">Sign in with your email or username. Your role and permissions are assigned by the server.</div>
        <div class="modal-field"><label class="modal-label">Email or username</label><input class="modal-input" id="auth-identifier" type="text" placeholder="you@company.com" autocomplete="username" autocapitalize="none" spellcheck="false"/></div>
        <div class="modal-field"><label class="modal-label">Password</label><input class="modal-input" id="auth-password" type="password" placeholder="Enter password" autocomplete="current-password"/></div>
        <div id="auth-error" style="display:none;font-size:12px;color:var(--red);margin-top:4px;"></div>
      </div>
      <div class="modal-foot"><button class="btn-primary" id="auth-login-btn">Sign in</button></div>
    </div>
  </div>

  <!-- command palette -->
  <div id="cmd-overlay">
    <div id="cmd-box">
      <input id="cmd-search" placeholder="Search or jump to\u2026" autocomplete="off" spellcheck="false"/>
      <div id="cmd-results"></div>
    </div>
  </div>

  <!-- notifications panel -->
  <div id="notif-panel">
    <div class="notif-head">
      <div class="notif-title">Notifications</div>
      <button class="notif-close" id="notif-close">\xD7</button>
    </div>
    <div id="notif-list"><div class="spin"></div></div>
  </div>

  <!-- toast -->
  <div id="toast"><div class="toast-inner"><span id="toast-msg"></span></div></div>
</div>
<script>
(function(){
  function showErr(e){
    var m=e&&e.message?e.message:String(e);
    document.getElementById('view').innerHTML='<div style="padding:24px;color:#ff6b6b;font-family:monospace;font-size:13px;white-space:pre-wrap">JS error: '+m+'</div>';
  }
  try {
  var tab='loops', side='yours', taskDay='today', leadView='all', activeRole='ceo', loopCount=0;
  var me=null, appStarted=false;
  var h0=new Date().getHours();
  var briefMode=h0<12?'am':h0<17?'pm':'eve';

  var TABS=[
    {id:'loops',  ic:'\u{1F501}', label:'Loops'},
    {id:'tasks',  ic:'\u2705',  label:'Tasks'},
    {id:'leads',  ic:'\u{1F91D}', label:'Leads'},
    {id:'projects', ic:'\u{1F4E6}', label:'Projects'},
    {id:'agents', ic:'\u{1F916}', label:'Agents'},
    {id:'methods', ic:'\u{1F9ED}', label:'Methods'},
    {id:'team',   ic:'\u{1F465}', label:'Team'},
    {id:'brain',  ic:'\u{1F9E0}', label:'Brain'},
    {id:'reports',ic:'\u{1F4CA}', label:'Reports'},
    {id:'settings', ic:'\u2699\uFE0F', label:'Settings'},
    {id:'events', ic:'\u{1F4DC}', label:'Activity'},
  ];

  var SVG={
    loops:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    tasks:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    leads:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    projects:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="2" y="12" width="6" height="6" rx="1"/><rect x="9" y="12" width="6" height="6" rx="1"/></svg>',
    agents:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4M8 13h.01M16 13h.01"/></svg>',
    methods:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    team:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    brain:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.14Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.14Z"/></svg>',
    reports:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    settings:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.1 5A9 9 0 0 1 21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9"/></svg>',
    events:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3M12 2v3"/></svg>',
  };

  var ACTIONS=[
    {k:'draftReplies', label:'Draft replies', desc:'Acknowledge inbound messages automatically'},
    {k:'chase',        label:'Chase loops',   desc:'Nudge when the ball is in their court'},
    {k:'sendReminders',label:'Send reminders',desc:'Remind on snoozed loops before they slip'},
    {k:'createTasks',  label:'Create tasks',  desc:'Turn asks in messages into tasks'},
    {k:'joinMeetings', label:'Join meetings', desc:'Attend and take notes autonomously'},
  ];

  var EVENT_ICONS={
    'loop.created':'\u{1F504}','loop.closed':'\u2705','loop.snoozed':'\u{1F634}','loop.captured':'\u{1F504}','loop.reopened':'\u21A9\uFE0F',
    'task.created':'\u{1F4DD}','task.completed':'\u2714\uFE0F','task.moved':'\u27A1\uFE0F',
    'lead.created':'\u{1F91D}','lead.advanced':'\u{1F4C8}',
    'briefing.delivered':'\u{1F9E0}','agent.action':'\u{1F916}',
    'approval.approved':'\u2705','approval.dismissed':'\u{1F6AB}','event.undone':'\u21A9\uFE0F'
  };

  var THEMES=[
    {id:'default', label:'Default', b1:'rgba(62,123,250,.28)', b2:'rgba(91,141,239,.22)', b3:'rgba(232,161,58,.14)', m1:'rgba(22,207,152,.22)', m2:'rgba(91,141,239,.18)', m3:'rgba(124,79,208,.18)', swatch:'linear-gradient(135deg,#3e7bfa,#16b7ae)'},
    {id:'aurora',  label:'Aurora',  b1:'rgba(22,207,152,.3)',   b2:'rgba(62,123,250,.2)',  b3:'rgba(62,123,250,.12)',m1:'rgba(22,207,152,.25)', m2:'rgba(62,123,250,.2)',  m3:'rgba(55,192,138,.18)', swatch:'linear-gradient(135deg,#16cf98,#3e7bfa)'},
    {id:'blush',   label:'Blush',   b1:'rgba(240,85,107,.22)',  b2:'rgba(232,161,58,.18)', b3:'rgba(62,123,250,.1)',m1:'rgba(240,85,107,.2)',  m2:'rgba(232,161,58,.16)', m3:'rgba(91,141,239,.16)',swatch:'linear-gradient(135deg,#f0556b,#e8a13a)'},
    {id:'mist',    label:'Mist',    b1:'rgba(91,141,239,.26)',  b2:'rgba(22,183,174,.2)',  b3:'rgba(62,123,250,.14)', m1:'rgba(22,183,174,.22)', m2:'rgba(91,141,239,.18)', m3:'rgba(62,123,250,.16)', swatch:'linear-gradient(135deg,#3e7bfa,#16b7ae)'},
    {id:'sage',    label:'Sage',    b1:'rgba(55,192,138,.26)',  b2:'rgba(22,207,152,.2)',  b3:'rgba(91,141,239,.14)', m1:'rgba(55,192,138,.24)', m2:'rgba(22,207,152,.18)', m3:'rgba(91,141,239,.16)', swatch:'linear-gradient(135deg,#37c08a,#16cf98)'},
    {id:'sand',    label:'Sand',    b1:'rgba(232,161,58,.28)',  b2:'rgba(240,85,107,.16)', b3:'rgba(22,183,174,.14)', m1:'rgba(232,161,58,.24)', m2:'rgba(240,85,107,.16)', m3:'rgba(22,183,174,.16)', swatch:'linear-gradient(135deg,#e8a13a,#f0556b)'},
    {id:'frost',   label:'Frost',   b1:'rgba(91,141,239,.22)', b2:'rgba(62,123,250,.22)', b3:'rgba(22,183,174,.12)', m1:'rgba(91,141,239,.2)',  m2:'rgba(62,123,250,.18)', m3:'rgba(22,183,174,.16)', swatch:'linear-gradient(135deg,#5b93ff,#3e7bfa)'},
    {id:'dusk',    label:'Dusk',    b1:'rgba(124,79,208,.28)',  b2:'rgba(240,85,107,.18)', b3:'rgba(232,161,58,.12)', m1:'rgba(124,79,208,.24)', m2:'rgba(240,85,107,.16)', m3:'rgba(232,161,58,.14)', swatch:'linear-gradient(135deg,#7c4fd0,#f0556b)'},
  ];

  var PROJECT_PALETTES=[
    'linear-gradient(135deg,#3e7bfa,#7c3aed)',
    'linear-gradient(135deg,#10b981,#14b8a6)',
    'linear-gradient(135deg,#f59e0b,#ef4444)',
    'linear-gradient(135deg,#6366f1,#ec4899)',
    'linear-gradient(135deg,#0ea5e9,#06b6d4)',
    'linear-gradient(135deg,#8b5cf6,#d946ef)',
  ];
  var PROJECT_TEMPLATES=[
    {name:'Blank',         emoji:'\u{1F4C4}', bg:'linear-gradient(135deg,#6b7280,#374151)'},
    {name:'Social Media',  emoji:'\u{1F4F1}', bg:'linear-gradient(135deg,#ec4899,#8b5cf6)'},
    {name:'Product Launch',emoji:'\u{1F680}', bg:'linear-gradient(135deg,#3e7bfa,#7c3aed)'},
    {name:'Content Cal.',  emoji:'\u{1F4C5}', bg:'linear-gradient(135deg,#f59e0b,#ef4444)'},
    {name:'Client Onboard',emoji:'\u{1F91D}', bg:'linear-gradient(135deg,#10b981,#0ea5e9)'},
    {name:'Event',         emoji:'\u{1F389}', bg:'linear-gradient(135deg,#d946ef,#f59e0b)'},
  ];

  // Local user roster for accountability display in the single-user demo.
  var USERS={
    'user_local':{name:'You',initials:'YO',role:'ceo',color:'linear-gradient(140deg,var(--accent),var(--accent2))'},
    'user_ceo':{name:'James',initials:'JM',role:'ceo',color:'linear-gradient(140deg,#3e7bfa,#5b93ff)'},
    'user_mgr':{name:'Priya',initials:'PN',role:'mgr',color:'linear-gradient(140deg,#16b7ae,#54d8d0)'},
    'user_emp':{name:'Alex',initials:'AK',role:'emp',color:'linear-gradient(140deg,#e8932a,#f4b65e)'},
    'user_dev':{name:'Sam',initials:'SB',role:'emp',color:'linear-gradient(140deg,#f0556b,#f98598)'},
    'user_client':{name:'Dana',initials:'DC',role:'client',color:'linear-gradient(140deg,#7c4fd0,#9b6cf0)'}
  };

  var view=document.getElementById('view');
  var qbar=document.getElementById('qbar');
  var qfield=document.getElementById('qfield');
  var activeTheme=localStorage.getItem('cb-theme')||'default';
  var darkMode=localStorage.getItem('cb-dark')==='1';

  // \u2500\u2500 helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function esc(s){return (s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function api(path,opts){
    return fetch(path,opts).then(function(r){
      return r.text().then(function(t){
        var body=null;
        if(t){try{body=JSON.parse(t);}catch(_e){body=null;}}
        if(!r.ok){
          var e=new Error(body&&body.error?body.error:('HTTP '+r.status));
          e.status=r.status; e.body=body;
          if(r.status===401){
            appStarted=false;
            applySessionUser(null);
            openAuthModal('Session expired. Sign in again.');
          }
          throw e;
        }
        return body;
      });
    });
  }
  function post(path,body,method){return api(path,{method:method||'POST',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});}
  function ago(ts){
    var d=(Date.now()-ts)/1e3;
    if(d<60) return 'just now';
    if(d<3600) return Math.round(d/60)+'m';
    if(d<86400) return Math.round(d/3600)+'h';
    return Math.round(d/86400)+'d';
  }
  function ageCls(ts){
    var d=(Date.now()-ts)/86400e3;
    if(d<1) return 'age-fresh';
    if(d<3) return 'age-mid';
    return 'age-old';
  }
  function stageCls(s){return 'lead-stage-'+(s||'new');}
  function autoBadge(a){return '<span class="auto-badge auto-'+(a||'off')+'">'+(a||'off').toUpperCase()+'</span>';}
  function todayStr(){return new Date().toISOString().slice(0,10);}
  function dateLabel(ts){
    if(!ts) return '';
    var d=new Date(ts);
    return d.toLocaleDateString([],{month:'short',day:'numeric'});
  }
  function userFor(id){return USERS[id]||{name:(id||'').replace(/_/g,' ').replace(/^user /,''),initials:(id||'??').slice(-2).toUpperCase(),color:'linear-gradient(140deg,#6b6b78,#9a9aa8)'};}
  function avatarHtml(id,opts){
    opts=opts||{};
    var u=userFor(id);
    var sz=opts.size||22;
    var style='width:'+sz+'px;height:'+sz+'px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:'+Math.max(8,sz*0.4)+'px;font-weight:700;color:#fff;background:'+u.color+';border:2px solid var(--glass);box-shadow:0 1px 3px rgba(31,38,135,.2);flex-shrink:0;';
    return '<div class="acct-avatar" title="'+esc(u.name)+'" style="'+style+'">'+esc(u.initials)+'</div>';
  }
  function avatarStackHtml(ids,opts){
    opts=opts||{};
    var list=(ids||[]).slice(0,4);
    if(!list.length) return '';
    var html='<div class="acct-stack">';
    list.forEach(function(id){html+=avatarHtml(id,{size:opts.size||22});});
    html+='</div>';
    return html;
  }
  function progBar(done,total){
    var pct=total>0?Math.round(done/total*100):0;
    var col=pct>=80?'var(--green)':pct>=40?'var(--amber)':'var(--faint)';
    return '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--glassBorder);">'
      +'<span style="font-size:11px;color:var(--green);font-weight:600;white-space:nowrap;">'+done+' done</span>'
      +'<div class="prog-wrap"><div class="prog-fill" style="width:'+pct+'%;background:'+col+';"></div></div>'
      +'<span style="font-size:11px;color:var(--muted);white-space:nowrap;">'+Math.max(0,total-done)+' left</span>'
      +'<span style="font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;font-weight:600;color:var(--accent);width:32px;text-align:right;">'+pct+'%</span>'
      +'</div>';
  }
  function toast(msg,onUndo){
    var t=document.getElementById('toast');
    var inner=t.querySelector('.toast-inner');
    inner.innerHTML='<span id="toast-msg">'+esc(msg)+'</span>'+(onUndo?'<button class="toast-undo">Undo</button>':'');
    t.classList.add('show');
    if(onUndo) inner.querySelector('.toast-undo').onclick=function(){onUndo();t.classList.remove('show');};
    setTimeout(function(){t.classList.remove('show');},3200);
  }

  function roleFromApi(role){
    if(role==='manager') return 'mgr';
    if(role==='employee') return 'emp';
    if(role==='client') return 'client';
    return 'ceo';
  }
  function roleLabel(role){
    if(role==='manager') return 'Manager';
    if(role==='employee') return 'Employee';
    if(role==='client') return 'Client';
    if(role==='agent') return 'AI Agent';
    return 'CEO';
  }
  function updateSessionUi(){
    var n=document.getElementById('session-user-name');
    var r=document.getElementById('session-user-role');
    var lo=document.getElementById('logout-btn');
    var loTop=document.getElementById('topbar-logout-btn');
    if(me){
      if(n) n.textContent=me.name||me.userId||'User';
      if(r) r.textContent=(roleLabel(me.role)||'Member')+(me.email?' \xB7 '+me.email:'');
      if(lo) lo.style.display='inline-flex';
      if(loTop) loTop.style.display='inline-flex';
    }else{
      if(n) n.textContent='Guest';
      if(r) r.textContent='not signed in';
      if(lo) lo.style.display='none';
      if(loTop) loTop.style.display='none';
    }
  }
  function applySessionUser(user){
    me=user||null;
    if(me&&me.role) activeRole=roleFromApi(me.role);
    updateSessionUi();
  }
  function openAuthModal(msg){
    var m=document.getElementById('auth-modal');
    if(!m) return;
    var err=document.getElementById('auth-error');
    if(err){
      if(msg){err.style.display='block';err.textContent=msg;}
      else{err.style.display='none';err.textContent='';}
    }
    m.classList.add('open');
    var id=document.getElementById('auth-identifier');
    var pw=document.getElementById('auth-password');
    var target=id&&id.value?id:pw;
    if(target) setTimeout(function(){target.focus();},20);
  }
  function closeAuthModal(){
    var m=document.getElementById('auth-modal');
    if(m) m.classList.remove('open');
    var err=document.getElementById('auth-error');
    if(err){err.style.display='none';err.textContent='';}
    var pw=document.getElementById('auth-password');
    if(pw) pw.value='';
  }
  function loginWithPassword(){
    var id=document.getElementById('auth-identifier');
    var pw=document.getElementById('auth-password');
    var btn=document.getElementById('auth-login-btn');
    var identifier=id&&id.value?id.value.trim():'';
    var password=pw&&pw.value||'';
    if(!identifier){openAuthModal('Email or username is required');return;}
    if(!password){openAuthModal('Password is required');return;}
    if(btn){btn.disabled=true;btn.textContent='Signing in\u2026';}
    post('/api/auth/login',{userId:identifier,key:password}).then(function(res){
      applySessionUser(res&&res.user?res.user:null);
      closeAuthModal();
      startApp();
    }).catch(function(e){
      openAuthModal(e&&e.message?e.message:'Invalid email/username or password');
    }).finally(function(){
      if(btn){btn.disabled=false;btn.textContent='Sign in';}
    });
  }
  function ensureSession(){
    return api('/api/auth/me').then(function(s){
      if(s&&s.authenticated&&s.user){
        applySessionUser(s.user);
        return true;
      }
      applySessionUser(null);
      openAuthModal();
      return false;
    }).catch(function(){
      applySessionUser(null);
      openAuthModal();
      return false;
    });
  }
  function startApp(){
    if(appStarted) return;
    appStarted=true;
    buildNav();
    render();
    loadNotifications();
    setupSSE();
  }
  function logoutSession(){
    post('/api/auth/logout').catch(function(){}).then(function(){
      appStarted=false;
      applySessionUser(null);
      ensureSession().then(function(ok){ if(ok) startApp(); });
    });
  }

  // \u2500\u2500 theme \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function applyTheme(id){
    var t=THEMES.filter(function(x){return x.id===id;})[0]||THEMES[0];
    var r=document.documentElement.style;
    r.setProperty('--b1c',t.b1); r.setProperty('--b2c',t.b2); r.setProperty('--b3c',t.b3);
    r.setProperty('--m1c',t.m1); r.setProperty('--m2c',t.m2); r.setProperty('--m3c',t.m3);
    activeTheme=id; localStorage.setItem('cb-theme',id);
    document.querySelectorAll('.theme-swatch').forEach(function(s){s.classList.toggle('on',s.dataset.tid===id);});
  }
  function applyDark(on){
    darkMode=on;
    document.documentElement.dataset.theme=on?'dark':'light';
    localStorage.setItem('cb-dark',on?'1':'0');
    var lbl=document.getElementById('dark-toggle-label');
    if(lbl) lbl.textContent=on?'Light mode':'Dark mode';
  }
  applyDark(darkMode);
  function buildThemePicker(){
    var sw=document.getElementById('theme-swatches');
    if(!sw) return;
    sw.innerHTML=THEMES.map(function(t){
      return '<div class="theme-swatch'+(t.id===activeTheme?' on':'')+'" data-tid="'+t.id+'" title="'+t.label+'" style="background:'+t.swatch+'"></div>';
    }).join('');
    sw.querySelectorAll('.theme-swatch').forEach(function(s){s.onclick=function(){applyTheme(s.dataset.tid);};});
  }
  var themeBtn=document.getElementById('theme-toggle-btn');
  var themePanel=document.getElementById('theme-panel');
  if(themeBtn) themeBtn.onclick=function(e){e.stopPropagation();themePanel.classList.toggle('open');buildThemePicker();};
  document.addEventListener('click',function(e){if(themePanel&&!themePanel.contains(e.target)&&e.target!==themeBtn) themePanel.classList.remove('open');});
  applyTheme(activeTheme);
  var dtBtn=document.getElementById('dark-toggle-btn');
  var dtBtnTop=document.getElementById('topbar-dark-toggle');
  if(dtBtn) dtBtn.onclick=function(){applyDark(!darkMode);};
  if(dtBtnTop) dtBtnTop.onclick=function(){applyDark(!darkMode);};

  // \u2500\u2500 nav \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var BOT_TABS=['loops','tasks','leads','projects','agents'];
  var MORE_TABS=['team','methods','brain','reports','settings','events'];
  function buildNav(){
    var sn=document.getElementById('side-nav');
    sn.innerHTML=TABS.map(function(t){
      var badge=(t.id==='loops'&&loopCount>0)?'<span class="nav-badge">'+loopCount+'</span>':'';
      return '<div class="nav-item'+(t.id===tab?' active':'')+'" data-tab="'+t.id+'">'
        +'<span class="ni">'+SVG[t.id]+'</span>'+t.label+badge+'</div>';
    }).join('');
    sn.querySelectorAll('.nav-item').forEach(function(el){
      el.onclick=function(){tab=el.dataset.tab;buildNav();buildBotNav();render();};
    });
    buildBotNav();
    var rc=document.getElementById('role-chips');
    if(rc) rc.querySelectorAll('.role-chip').forEach(function(c){
      c.classList.toggle('on',c.dataset.role===activeRole);
      c.onclick=function(){activeRole=c.dataset.role;buildNav();if(tab==='loops') loadLoops();};
    });
  }
  function buildBotNav(){
    var bn=document.getElementById('botnav');
    if(bn){
      var tabsToShow=TABS.filter(function(t){return BOT_TABS.indexOf(t.id)>=0;});
      bn.innerHTML=tabsToShow.map(function(t){return '<button data-tab="'+t.id+'" class="'+(t.id===tab?'on':'')+'"><span class="bn-ic">'+t.ic+'</span>'+t.label+'</button>';}).join('')
        +'<button id="bn-more" class="'+(BOT_TABS.indexOf(tab)>=0?'':'on')+'"><span class="bn-ic">\u22EF</span>More</button>';
      bn.querySelectorAll('button[data-tab]').forEach(function(b){b.onclick=function(){tab=b.dataset.tab;buildNav();render();};});
      var moreBtn=document.getElementById('bn-more');
      if(moreBtn) moreBtn.onclick=function(){openMoreSheet();};
    }
    document.querySelectorAll('#side-nav .nav-item').forEach(function(el){el.classList.toggle('active',el.dataset.tab===tab);});
  }
  function openMoreSheet(){
    var m=document.getElementById('more-sheet');
    if(!m) return;
    var items=document.getElementById('more-sheet-items');
    var moreTabs=TABS.filter(function(t){return MORE_TABS.indexOf(t.id)>=0;});
    items.innerHTML=moreTabs.map(function(t){return '<button data-tab="'+t.id+'" style="display:flex;align-items:center;gap:12px;padding:12px 10px;border-radius:11px;border:none;background:'+(t.id===tab?'var(--accentSoft)':'transparent')+';color:'+(t.id===tab?'var(--accent)':'var(--text)')+';font-size:14px;font-weight:500;width:100%;cursor:pointer;min-height:48px;"><span style="font-size:20px;">'+t.ic+'</span>'+t.label+'</button>';}).join('');
    items.querySelectorAll('button[data-tab]').forEach(function(b){b.onclick=function(){tab=b.dataset.tab;m.classList.remove('open');buildNav();render();};});
    m.classList.add('open');
    m.onclick=function(e){if(e.target===m)m.classList.remove('open');};
  }

  // \u2500\u2500 segment bar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function segBar(opts,cur,onPick){
    var el=document.createElement('div'); el.className='seg-bar';
    el.innerHTML=opts.map(function(o){return '<button class="seg-btn'+(o.v===cur?' on':'')+'" data-v="'+o.v+'">'+o.label+'</button>';}).join('');
    el.querySelectorAll('.seg-btn').forEach(function(b){b.onclick=function(){onPick(b.dataset.v);};});
    return el;
  }

  // \u2500\u2500 render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function render(){
    var showBar=tab==='loops'||tab==='tasks'||tab==='leads';
    qbar.style.display=showBar?'flex':'none';
    qfield.placeholder=tab==='loops'?'Capture a loop\u2026':tab==='tasks'?'Add a task for today\u2026':'Add lead (name or paste a note)\u2026';
    view.innerHTML='<div class="spin"></div>';
    if(tab==='loops')       loadLoops();
    else if(tab==='tasks')  loadTasks();
    else if(tab==='leads')  loadLeads();
    else if(tab==='projects') loadProjects();
    else if(tab==='agents') loadAgents();
    else if(tab==='methods') loadMethods();
    else if(tab==='team')   loadTeam();
    else if(tab==='brain')  loadBrain();
    else if(tab==='reports') loadReports();
    else if(tab==='settings') loadSettings();
    else                    loadEvents();
  }

  // \u2500\u2500 role panel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function rolePanelHtml(yours, theirs){
    if(activeRole==='mgr') return '<div class="role-panel gc" style="border-left-color:var(--blue);">'
      +'<div class="role-sw-label" style="color:var(--blue);">MANAGER VIEW</div>'
      +'<div class="role-panel-title">Team summary</div>'
      +'<div class="role-panel-sub">You have '+yours.length+' loops in your court. '
      +(theirs.length?' '+theirs.length+' are waiting on your team.':' Your team has no open waiting loops.')+'</div>'
      +'<div class="role-stats">'
      +'<div><div class="role-stat-val" style="color:var(--blue)">'+yours.length+'</div><div class="role-stat-lbl">your actions</div></div>'
      +'<div><div class="role-stat-val" style="color:var(--teal)">'+theirs.length+'</div><div class="role-stat-lbl">team actions</div></div>'
      +'<div><div class="role-stat-val" style="color:var(--amber)">'+['user_emp','user_dev'].length+'</div><div class="role-stat-lbl">direct reports</div></div>'
      +'</div></div>';
    if(activeRole==='emp') return '<div class="role-panel gc" style="border-left-color:var(--green);">'
      +'<div class="role-sw-label" style="color:var(--green);">EMPLOYEE VIEW \u2014 MY WORK</div>'
      +'<div class="role-panel-title">Your court</div>'
      +'<div class="role-panel-sub">'+yours.length+' loops need your attention. Focus on the oldest ones first.</div>'
      +'<div class="role-stats">'
      +'<div><div class="role-stat-val" style="color:var(--green)">'+yours.length+'</div><div class="role-stat-lbl">open loops</div></div>'
      +'<div><div class="role-stat-val" style="color:var(--amber)">'+theirs.length+'</div><div class="role-stat-lbl">waiting on others</div></div>'
      +'<div><div class="role-stat-val" style="color:var(--faint)">\u2014</div><div class="role-stat-lbl">time tracked</div></div>'
      +'</div></div>';
    if(activeRole==='client') return '<div class="role-panel gc" style="border-left-color:var(--teal);">'
      +'<div class="role-sw-label" style="color:var(--teal);">CLIENT PORTAL \u2014 READ-ONLY</div>'
      +'<div class="role-panel-title">Your project</div>'
      +'<div class="role-panel-sub">'+theirs.length+' items in progress. We&#39;ll notify you when something needs your input.</div>'
      +'<div class="role-stats">'
      +'<div><div class="role-stat-val" style="color:var(--teal)">'+theirs.length+'</div><div class="role-stat-lbl">in progress</div></div>'
      +'<div><div class="role-stat-val" style="color:var(--green)">0</div><div class="role-stat-lbl">delivered</div></div>'
      +'</div></div>';
    return '';
  }

  // \u2500\u2500 loops \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loadLoops(){
    api('/api/loops').then(function(all){
      all=all||[];
      var yours=all.filter(function(l){return l.side==='yours';});
      var theirs=all.filter(function(l){return l.side==='theirs';});
      var escalating=all.filter(function(l){return (Date.now()-(l.updatedAt||l.createdAt||Date.now()))/86400e3>=3;}).length;
      loopCount=all.length; buildNav();

      var summary=all.length?all.length+' open loop'+(all.length!==1?'s':'')+' \xB7 '+escalating+' escalating':'Clean board. Nothing open right now.';
      var greetings={am:'Good morning.',pm:'Good afternoon.',eve:'Good evening.'};
      var modeIcons={am:'\u2600\uFE0F',pm:'\u{1F324}\uFE0F',eve:'\u{1F306}'};
      var kpiHtml=activeRole==='ceo'
        ?'<div class="kpi-grid">'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--amber)">'+yours.length+'</div><div class="kpi-lbl">to action</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--teal)">'+theirs.length+'</div><div class="kpi-lbl">waiting on others</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:'+(escalating?'var(--red)':'var(--green)')+'">'+escalating+'</div><div class="kpi-lbl">escalating</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--accent)">'+all.length+'</div><div class="kpi-lbl">total open</div></div>'
          +'</div>':rolePanelHtml(yours,theirs);

      var html='<div class="sec-head"><div><div class="sec-title">Open Loops</div>'
        +'<div class="sec-sub">Who owes the next move across every channel.</div></div>'
        +'<div class="head-actions"><button class="btn-ghost" id="sweep-btn">\u21BB Sweep now</button></div></div>'
        +kpiHtml
        +'<div class="brief-card gc">'
        +'<div class="brief-header"><div class="brief-brain">\u{1F9E0}</div>'
        +'<div><div class="brief-label">BRAIN \xB7 BRIEFING</div>'
        +'<div class="brief-title">'+modeIcons[briefMode]+' '+greetings[briefMode]+' '+summary+'</div></div>'
        +'<div class="brief-sw">'
        +'<button class="brief-sw-btn'+(briefMode==='am'?' on':'')+'" data-bm="am">AM</button>'
        +'<button class="brief-sw-btn'+(briefMode==='pm'?' on':'')+'" data-bm="pm">PM</button>'
        +'<button class="brief-sw-btn'+(briefMode==='eve'?' on':'')+'" data-bm="eve">EVE</button>'
        +'</div></div>'
        +'<div class="brief-stats">'
        +'<div class="brief-stat"><div class="brief-stat-val" style="color:var(--amber)">'+yours.length+'</div><div class="brief-stat-lbl">your court</div></div>'
        +'<div class="brief-stat"><div class="brief-stat-val" style="color:var(--teal)">'+theirs.length+'</div><div class="brief-stat-lbl">their court</div></div>'
        +'<div class="brief-stat" style="'+(escalating?'border-color:rgba(240,85,107,.25)':'')+'"><div class="brief-stat-val" style="color:'+(escalating?'var(--red)':'var(--green)')+'">'+escalating+'</div><div class="brief-stat-lbl">escalating</div></div>'
        +'</div></div>'
        +'<div class="loops-grid">'+loopCol('YOUR COURT','waiting on you','#e8a13a',yours)+loopCol('THEIR COURT','waiting on others','#2bc4bf',theirs)+'</div>';
      view.innerHTML=html;

      view.querySelectorAll('[data-bm]').forEach(function(b){b.onclick=function(){briefMode=b.dataset.bm;loadLoops();};});
      view.querySelectorAll('[data-close]').forEach(function(b){b.onclick=function(){post('/api/loops/'+b.dataset.close+'/close').then(function(){toast('Loop closed',function(){/* undo placeholder */});loadLoops();});};});
      view.querySelectorAll('[data-snooze]').forEach(function(b){b.onclick=function(){post('/api/loops/'+b.dataset.snooze+'/snooze',{hours:24}).then(function(){toast('Snoozed 24h');loadLoops();});};});
      view.querySelectorAll('[data-assign-loop]').forEach(function(b){b.onclick=function(){var uid=prompt('Assign to user ID (e.g. user_local, user_emp):','user_local');if(uid)post('/api/loops/'+b.dataset.assignLoop+'/assign',{userIds:[uid]}).then(function(){toast('Assigned');loadLoops();});};});
      var sw=document.getElementById('sweep-btn');
      if(sw) sw.onclick=function(){sw.disabled=true;toast('Sweeping channels\u2026');loadLoops();};
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load loops: '+(e&&e.message||e)+'</div>';});
  }
  function loopCol(label,hint,dotColor,items){
    var cards=items.length?items.map(function(l){
      var ageStr=ago(l.updatedAt||l.createdAt||Date.now());
      var cls=ageCls(l.updatedAt||l.createdAt||Date.now());
      var isTheirs=l.side==='theirs';
      var chan=(l.channel||'manual').toUpperCase().replace(/-/g,' ');
      var creator=l.createdBy?('captured by '+esc(userFor(l.createdBy).name)+' \xB7 '+ago(l.createdAt)):(l.createdAt?'captured '+ago(l.createdAt):'');
      var assignees=l.assignedTo&&l.assignedTo.length?l.assignedTo:[l.createdBy];
      return '<div class="loop-card gc">'
        +'<button class="check-btn" data-close="'+l.id+'" title="Mark done"></button>'
        +'<div class="loop-info">'
        +'<div class="loop-title-row"><div class="loop-title">'+esc(l.title)+'</div><span class="age-pill '+cls+'">'+ageStr+'</span></div>'
        +'<div class="loop-meta"><span class="loop-chan">'+chan+'</span>'+(l.why?' \xB7 '+esc(l.why):'')+'</div>'
        +'<div class="acct-row">'
        +avatarStackHtml(assignees,{size:22})
        +'<span class="acct-txt">'+(l.assignedTo&&l.assignedTo.length?'assigned':'owner')+'</span>'
        +'<button class="acct-btn" data-assign-loop="'+l.id+'">Assign</button>'
        +'</div>'
        +(creator?'<div class="loop-creator">'+creator+'</div>':'')
        +'<div class="loop-actions">'
        +(isTheirs?'<button class="link-btn teal" data-snooze="'+l.id+'">Nudge them</button>':'<button class="link-btn" data-snooze="'+l.id+'">Snooze</button>')
        +'<button class="link-btn" data-close="'+l.id+'" style="color:var(--faint)">Not a task</button>'
        +'</div></div></div>';
    }).join(''):('<div class="empty-dashed">'+(label==='YOUR COURT'?'Nothing in your court. Clean board.':'No one&#39;s keeping you waiting.')+'</div>');
    return '<div><div class="col-head"><span class="col-dot" style="background:'+dotColor+'"></span><span class="col-label">'+label+'</span><span class="col-count">'+items.length+'</span></div><span class="col-hint">'+hint+'</span>'+cards+'</div>';
  }

  // \u2500\u2500 tasks \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loadTasks(){
    api('/api/tasks').then(function(tasks){
      tasks=tasks||[];
      var today=todayStr();
      var tmr=new Date(); tmr.setDate(tmr.getDate()+1); var tmrStr=tmr.toISOString().slice(0,10);
      function isOverdue(t){return t.day&&t.day<today&&!t.completed;}
      var overdueAll=tasks.filter(isOverdue);
      var todayTasks=tasks.filter(function(t){return t.day===today||(!t.day&&!isOverdue(t));});
      var tmrTasks=tasks.filter(function(t){return t.day===tmrStr;});
      var upcomingTasks=tasks.filter(function(t){return t.day&&t.day>tmrStr;});
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Tasks</div><div class="sec-sub">Your board \u2014 what needs doing and when.</div></div><div class="head-actions"><button class="btn-primary" id="new-task-btn">+ New task</button></div></div>'
        +'<div class="kanban-wrap">'
        +(overdueAll.length?'<div class="overdue-strip"><span class="overdue-strip-count">'+overdueAll.length+'</span><span class="overdue-strip-label">overdue \u2014 move them or complete them</span></div>':'')
        +'<div class="kanban-board">'+kanbanCol('TODAY','#ef4444',todayTasks,'today')+kanbanCol('TOMORROW','#f59e0b',tmrTasks,'tomorrow')+kanbanCol('UPCOMING','#3e7bfa',upcomingTasks,'upcoming')+'</div></div>';
      var nt=document.getElementById('new-task-btn'); if(nt) nt.onclick=function(){openNewTaskModal();};
      ['today','tomorrow','upcoming'].forEach(function(d){var btn=document.getElementById('kadd-'+d);if(btn)btn.onclick=function(){openNewTaskModal(d);};});
      view.querySelectorAll('[data-done]').forEach(function(b){b.onclick=function(){post('/api/tasks/'+b.dataset.done+'/complete').then(function(){toast('Task completed');loadTasks();});};});
      view.querySelectorAll('[data-move]').forEach(function(b){b.onclick=function(){post('/api/tasks/'+b.dataset.move+'/move',{day:b.dataset.day}).then(function(){toast('Task moved');loadTasks();});};});
      wireTaskDragAndDrop();
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load tasks: '+(e&&e.message||e)+'</div>';});
  }
  function kanbanCol(label,dotColor,items,colDay){
    var cards=items.length?items.map(function(t){
      var od=t.day&&t.day<todayStr();
      var ds=!od&&isDueSoon(t);
      var pr=t.priority==='high'?'<span class="priority-pill priority-high">HIGH</span>':t.priority==='med'?'<span class="priority-pill priority-med">MED</span>':t.priority==='low'?'<span class="priority-pill priority-low">LOW</span>':'';
      return '<div class="kanban-task-card gc'+(od?' overdue':ds?' due-soon':'')+'" draggable="true" data-task-id="'+t.id+'"><div class="kanban-task-row"><button class="kanban-check" data-done="'+t.id+'"></button><span class="kanban-task-emoji">'+esc(t.emoji||'\u{1F4DD}')+'</span><div style="flex:1;min-width:0;"><div class="kanban-task-title">'+esc(t.title)+'</div><div class="kanban-task-sub">'+esc(t.list||'Inbox')+'</div></div></div><div class="kanban-task-foot">'+pr+(colDay!=='today'?'<button class="btn-ghost" data-move="'+t.id+'" data-day="today" style="font-size:10px;padding:3px 8px;min-height:24px;">\u2192 Today</button>':'')+'</div></div>';
    }).join(''):'<div class="empty-dashed" style="font-size:11px;padding:16px 12px;">No tasks for '+label.toLowerCase()+'.</div>';
    return '<div class="kanban-col"><div class="kanban-col-head"><span class="kanban-col-dot" style="background:'+dotColor+'"></span><span class="kanban-col-label">'+label+'</span><span class="kanban-col-count">'+items.length+'</span></div><div class="kanban-col-body" data-col-day="'+colDay+'">'+cards+'<button class="kanban-add-btn" id="kadd-'+colDay+'">+ Add</button></div></div>';
  }
  function wireTaskDragAndDrop(){
    var dragged=null;
    view.querySelectorAll('.kanban-task-card').forEach(function(card){
      card.addEventListener('dragstart',function(e){
        dragged=card;
        card.classList.add('dragging');
        try{e.dataTransfer.setData('text/plain',card.dataset.taskId);}catch(err){}
        e.dataTransfer.effectAllowed='move';
      });
      card.addEventListener('dragend',function(){
        card.classList.remove('dragging');
        view.querySelectorAll('.kanban-col-body.drag-over').forEach(function(c){c.classList.remove('drag-over');});
        dragged=null;
      });
    });
    view.querySelectorAll('.kanban-col-body').forEach(function(col){
      col.addEventListener('dragover',function(e){
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave',function(){col.classList.remove('drag-over');});
      col.addEventListener('drop',function(e){
        e.preventDefault();
        col.classList.remove('drag-over');
        var taskId=dragged?dragged.dataset.taskId:(e.dataTransfer?e.dataTransfer.getData('text/plain'):null);
        var day=col.dataset.colDay;
        if(!taskId||!day)return;
        post('/api/tasks/'+taskId+'/move',{day:day}).then(function(){toast('Task moved');loadTasks();});
      });
    });
  }
  function isDueSoon(t){return t.dueAt&&t.dueAt>Date.now()&&t.dueAt<Date.now()+86400e3;}

  // \u2500\u2500 leads \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var LEAD_STAGES=[{id:'new',label:'NEW',dot:'#9ca3af'},{id:'contacted',label:'CONTACTED',dot:'#3e7bfa'},{id:'meeting',label:'MEETING',dot:'#7c3aed'},{id:'proposal',label:'PROPOSAL',dot:'#f59e0b'},{id:'won',label:'WON',dot:'#10b981'},{id:'lost',label:'LOST',dot:'#ef4444'}];
  function loadLeads(){
    api('/api/leads').then(function(leads){
      leads=leads||[];
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Leads</div><div class="sec-sub">Pipeline \u2014 move each contact toward a close.</div></div><div class="head-actions"><button class="btn-primary" id="new-lead-btn">+ New lead</button></div></div><div class="pipeline-board">'
        +LEAD_STAGES.map(function(stage){var stageLeads=leads.filter(function(l){return(l.stage||'new')===stage.id;});return '<div class="pipeline-col"><div class="pipeline-col-head"><span class="pipeline-stage-dot" style="background:'+stage.dot+'"></span><span class="pipeline-stage-label">'+stage.label+'</span><span class="pipeline-col-count">'+stageLeads.length+'</span></div><div class="pipeline-col-body" data-stage="'+stage.id+'">'+(stageLeads.length?stageLeads.map(function(l){var initials=(l.name||'?').trim().split(/s+/).slice(0,2).map(function(w){return w[0].toUpperCase();}).join('');var hue=((l.name||'A').charCodeAt(0)*37)%360;var canAdv=stage.id!=='won'&&stage.id!=='lost';return '<div class="pipeline-lead-card gc" draggable="true" data-lead-id="'+l.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><div class="pipeline-lead-avatar" style="background:hsl('+hue+',35%,52%)">'+initials+'</div><div style="flex:1;min-width:0;"><div class="pipeline-lead-name">'+esc(l.name)+'</div>'+(l.company?'<div class="pipeline-lead-sub">'+esc(l.company)+'</div>':'')+'</div></div><div class="pipeline-lead-foot">'+(canAdv?'<button class="plead-adv-btn" data-advance="'+l.id+'">Advance \u2192</button>':'<span class="stage-pill lead-stage-'+stage.id+'">'+stage.label+'</span>')+(l.phone?'<a class="plead-adv-btn" href="https://wa.me/'+esc(l.phone.replace(/[^0-9]/g,''))+'" target="_blank" onclick="event.stopPropagation()">WA</a>':'')+'</div></div>';}).join(''):'<div style="font-size:11px;color:var(--faint);padding:10px 2px;">No leads here.</div>')+'</div></div>';}).join('')+'</div>';
      document.getElementById('new-lead-btn').onclick=function(){openNewLeadModal();};
      view.querySelectorAll('[data-advance]').forEach(function(b){b.onclick=function(e){e.stopPropagation();post('/api/leads/'+b.dataset.advance+'/advance').then(function(){toast('Advanced');loadLeads();});};});
      wireLeadDragAndDrop();
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load leads: '+(e&&e.message||e)+'</div>';});
  }
  function wireLeadDragAndDrop(){
    var dragged=null;
    view.querySelectorAll('.pipeline-lead-card').forEach(function(card){
      card.addEventListener('dragstart',function(e){
        dragged=card;
        card.classList.add('dragging');
        try{e.dataTransfer.setData('text/plain',card.dataset.leadId);}catch(err){}
        e.dataTransfer.effectAllowed='move';
      });
      card.addEventListener('dragend',function(){
        card.classList.remove('dragging');
        view.querySelectorAll('.pipeline-col-body.drag-over').forEach(function(c){c.classList.remove('drag-over');});
        dragged=null;
      });
    });
    view.querySelectorAll('.pipeline-col-body').forEach(function(col){
      col.addEventListener('dragover',function(e){
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave',function(){col.classList.remove('drag-over');});
      col.addEventListener('drop',function(e){
        e.preventDefault();
        col.classList.remove('drag-over');
        var leadId=dragged?dragged.dataset.leadId:(e.dataTransfer?e.dataTransfer.getData('text/plain'):null);
        var stage=col.dataset.stage;
        if(!leadId||!stage)return;
        post('/api/leads/'+leadId+'/stage',{stage:stage},'PUT').then(function(){toast('Lead moved');loadLeads();});
      });
    });
  }
  function loadLeadTimeline(leadId,containerId){
    var c=document.getElementById(containerId);
    if(!c) return;
    api('/api/events?entityId='+encodeURIComponent(leadId)).then(function(events){
      events=events||[];
      if(!events.length){c.innerHTML='<div class="lead-tl-item"><div class="lead-tl-text" style="color:var(--faint)">No activity yet.</div></div>';return;}
      c.innerHTML=events.map(function(e){
        var ic=EVENT_ICONS[e.type]||'\u{1F4DD}';
        return '<div class="lead-tl-item">'
          +'<div class="lead-tl-text">'+ic+' '+esc(e.type)+' by '+esc(userFor(e.actorId).name)+'</div>'
          +'<div class="lead-tl-when">'+new Date(e.at).toLocaleString()+'</div>'
          +'</div>';
      }).join('');
    }).catch(function(){c.innerHTML='<div class="lead-tl-item"><div class="lead-tl-text" style="color:var(--faint)">Could not load timeline.</div></div>';});
  }

  // \u2500\u2500 agents \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var AGENT_EMOJIS=['\u{1F916}','\u{1F52D}','\u{1F5FA}\uFE0F','\u{1F4D2}','\u{1F9ED}','\u{1F6F0}\uFE0F','\u{1F9E0}','\u26A1','\u{1F514}','\u{1F9E9}','\u{1F575}\uFE0F','\u{1F4E1}'];
  var agentEmojiPick='\u{1F916}';
  var editingAgentId=null;
  function customAgents(){
    try{return JSON.parse(localStorage.getItem('cb-custom-agents')||'[]');}catch(e){return [];}
  }
  function saveCustomAgents(list){
    localStorage.setItem('cb-custom-agents',JSON.stringify(list));
  }
  function loadAgents(){
    api('/api/agents').then(function(agents){
      agents=agents||[];
      var custom=customAgents();
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">AI Agents</div>'
        +'<div class="sec-sub">Your autonomous workforce \u2014 scoped, logged, fully reversible.</div></div></div>';
      var wrap=document.createElement('div');
      function agentCardHtml(a,isCustom){
        var done=a.done||0,pending=a.pending||0,total=done+pending;
        return '<div class="agent-card gc'+(isCustom?' custom':'')+'"'+(isCustom?' data-agent-id="'+a.id+'" style="cursor:pointer;"':'')+'>'
          +'<div style="display:flex;align-items:center;gap:13px;">'
          +'<div style="width:42px;height:42px;flex-shrink:0;border-radius:13px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 16px var(--accentGlow);">'+esc(a.emoji||'\u{1F916}')+'</div>'
          +'<div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:8px;"><span class="agent-name">'+esc(a.name)+'</span>'+autoBadge(a.autonomy)+'</div>'
          +'<div class="agent-role">'+esc(a.role)+'</div></div>'
          +(isCustom?'<button class="agent-remove-btn" data-remove-agent="'+a.id+'" title="Remove agent">\u2715</button>':'<span style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--green);flex-shrink:0;"><span style="width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px rgba(55,192,138,.18);"></span>online</span>')
          +'</div>'+progBar(done,total)+'</div>';
      }
      var cards=agents.map(function(a){return agentCardHtml(a,false);}).join('');
      cards+=custom.map(function(a){return agentCardHtml(a,true);}).join('');
      if(!agents.length&&!custom.length) cards='<div class="empty-dashed">No agents configured yet.</div>';
      cards+='<button class="hire-btn" id="hire-agent-btn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>Hire a new agent</button>';
      wrap.innerHTML=cards;
      view.appendChild(wrap);
      wrap.querySelector('#hire-agent-btn').onclick=function(){openAgentModal();};
      wrap.querySelectorAll('[data-agent-id]').forEach(function(el){
        el.onclick=function(e){
          if(e.target.closest('[data-remove-agent]'))return;
          openAgentModal(el.dataset.agentId);
        };
      });
      wrap.querySelectorAll('[data-remove-agent]').forEach(function(b){
        b.onclick=function(e){
          e.stopPropagation();
          var list=customAgents().filter(function(a){return a.id!==b.dataset.removeAgent;});
          saveCustomAgents(list);
          toast('Agent removed');
          loadAgents();
        };
      });
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load agents: '+(e&&e.message||e)+'</div>';});
  }
  function openAgentModal(agentId){
    var m=document.getElementById('agent-modal');
    if(!m)return;
    editingAgentId=agentId||null;
    var existing=agentId?customAgents().find(function(a){return a.id===agentId;}):null;
    document.getElementById('agent-modal-title').textContent=existing?'Edit agent':'Hire a new agent';
    document.getElementById('agent-modal-name').value=existing?existing.name:'';
    document.getElementById('agent-modal-role').value=existing?existing.role:'';
    document.getElementById('agent-modal-save').textContent=existing?'Save agent':'Hire agent';
    document.getElementById('agent-modal-delete').style.display=existing?'':'none';
    agentEmojiPick=existing?(existing.emoji||'\u{1F916}'):'\u{1F916}';
    renderAgentEmojiRow();
    var lvl=existing?(existing.autonomy||'ask'):'ask';
    m.querySelectorAll('#agent-modal-autonomy .lvl').forEach(function(b){b.classList.toggle('on',b.dataset.lvl===lvl);});
    m.classList.add('open');
    document.getElementById('agent-modal-name').focus();
  }
  function closeAgentModal(){
    var m=document.getElementById('agent-modal');
    if(m)m.classList.remove('open');
    editingAgentId=null;
  }
  function renderAgentEmojiRow(){
    var g=document.getElementById('agent-emoji-row');
    if(!g)return;
    g.innerHTML=AGENT_EMOJIS.map(function(em){return '<button type="button" class="emoji-pick-btn'+(em===agentEmojiPick?' on':'')+'" data-em="'+em+'">'+em+'</button>';}).join('');
    g.querySelectorAll('.emoji-pick-btn').forEach(function(b){b.onclick=function(){agentEmojiPick=b.dataset.em;renderAgentEmojiRow();};});
  }

  // \u2500\u2500 autonomy \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loadAuto(){
    Promise.all([api('/api/autonomy'),api('/api/approvals')]).then(function(res){
      var settings=res[0]||{}, approvals=(res[1]||[]).filter(function(a){return a.status==='pending';});
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Autonomy</div>'
        +'<div class="sec-sub">What the AI may do on its own \u2014 and what needs your approval first.</div></div></div>';
      if(approvals.length){
        var apWrap=document.createElement('div');
        apWrap.innerHTML='<div style="font-family:\\'JetBrains Mono\\',monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;margin:0 0 10px;">PENDING APPROVALS</div>'
          +approvals.map(function(ap){
            return '<div class="approve-card gc"><div style="flex:1;min-width:0;"><div class="approve-title">'+esc(ap.title)+'</div>'
              +'<div class="approve-action">'+esc(ap.action)+'</div></div>'
              +'<button class="approve-btn ok" data-approve="'+ap.id+'">Approve</button>'
              +'<button class="approve-btn no" data-dismiss="'+ap.id+'" style="margin-left:6px">Dismiss</button></div>';
          }).join('');
        apWrap.querySelectorAll('[data-approve]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.approve+'/approve').then(function(){toast('Approved');loadAuto();});};});
        apWrap.querySelectorAll('[data-dismiss]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.dismiss+'/dismiss').then(function(){toast('Dismissed');loadAuto();});};});
        view.appendChild(apWrap);
      }
      var autoWrap=document.createElement('div');
      autoWrap.innerHTML='<div style="font-family:\\'JetBrains Mono\\',monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;margin:18px 0 10px;">AUTONOMY SETTINGS</div>'
        +ACTIONS.map(function(a){
          var cur=settings[a.k]||'off';
          var lvls=['off','ask','auto'].map(function(lv){
            return '<button class="lvl'+(lv===cur?' on':'')+'" data-act="'+a.k+'" data-lvl="'+lv+'">'+(lv.charAt(0).toUpperCase()+lv.slice(1))+'</button>';
          }).join('');
          return '<div class="auto-card gc"><div class="auto-info"><div class="auto-label">'+a.label+'</div><div class="auto-desc">'+a.desc+'</div></div><div class="lvls">'+lvls+'</div></div>';
        }).join('');
      autoWrap.querySelectorAll('.lvl').forEach(function(b){b.onclick=function(){post('/api/autonomy',{action:b.dataset.act,level:b.dataset.lvl},'PUT').then(function(){toast('Autonomy updated');loadAuto();});};});
      view.appendChild(autoWrap);
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load autonomy: '+(e&&e.message||e)+'</div>';});
  }


  // \u2500\u2500 events \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loadEvents(){
    api('/api/events').then(function(events){
      events=events||[];
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Activity</div>'
        +'<div class="sec-sub">Everything the agent touched \u2014 logged and reversible.</div></div></div>';
      var wrap=document.createElement('div');
      if(!events.length){
        wrap.innerHTML='<div class="empty-dashed">No activity yet. Start capturing loops.</div>';
      } else {
        var lastDate='',rows='';
        events.forEach(function(e){
          var d=new Date(e.at);
          var dk=d.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});
          if(dk!==lastDate){rows+='<div class="date-sep">'+dk+'</div>';lastDate=dk;}
          var canUndo=e.reversible&&e.undo;
          var ic=EVENT_ICONS[e.type]||'\u{1F4DD}';
          var ts=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          rows+='<div class="event-card gc"><div class="event-icon">'+ic+'</div>'
            +'<div style="flex:1;min-width:0;"><div class="event-type">'+esc(e.type)+'</div>'
            +'<div class="event-meta">'+esc(userFor(e.actorId).name)+(e.channel?' \xB7 '+esc(e.channel):'')+'</div>'
            +'<div class="event-meta" style="margin-top:1px;font-family:\\'JetBrains Mono\\',monospace;font-size:10px;">'+ts+'</div></div>'
            +(canUndo?'<button class="undo-btn" data-undo="'+e.id+'">Undo</button>':e.reversible?'<span class="rev-badge">reversible</span>':'')
            +'</div>';
        });
        wrap.innerHTML=rows;
      }
      view.appendChild(wrap);
      view.querySelectorAll('[data-undo]').forEach(function(b){b.onclick=function(){post('/api/events/'+b.dataset.undo+'/undo').then(function(){toast('Undone');loadEvents();});};});
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load events: '+(e&&e.message||e)+'</div>';});
  }

  // \u2500\u2500 notifications panel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var notifPanel=document.getElementById('notif-panel');
  var notifBtn=document.getElementById('notif-btn');
  var notifCount=document.getElementById('notif-count');
  function loadNotifications(){
    api('/api/events').then(function(events){
      events=events||[];
      var recent=events.slice(0,20);
      var unread=events.filter(function(e){return Date.now()-e.at<86400e3;}).length;
      if(unread>0){notifCount.textContent=unread>9?'9+':unread;notifCount.style.display='flex';}
      else{notifCount.style.display='none';}
      var nl=document.getElementById('notif-list');
      if(!nl) return;
      nl.innerHTML=recent.length?recent.map(function(e){
        var ic=EVENT_ICONS[e.type]||'\u{1F4DD}';
        var ts=new Date(e.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--glassBorder);">'
          +'<div class="event-icon" style="flex-shrink:0;">'+ic+'</div>'
          +'<div style="flex:1;min-width:0;"><div class="event-type" style="font-size:11px;">'+esc(e.type)+'</div>'
          +'<div class="event-meta">'+esc(userFor(e.actorId).name)+' \xB7 '+ts+'</div></div></div>';
      }).join(''):'<div class="empty-dashed">No recent activity.</div>';
    });
  }
  if(notifBtn) notifBtn.onclick=function(){notifPanel.classList.toggle('open');if(notifPanel.classList.contains('open')) loadNotifications();};
  var notifClose=document.getElementById('notif-close');
  if(notifClose) notifClose.onclick=function(){notifPanel.classList.remove('open');};

  // \u2500\u2500 command palette \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var cmdOverlay=document.getElementById('cmd-overlay');
  var cmdSearch=document.getElementById('cmd-search');
  var cmdResults=document.getElementById('cmd-results');
  var cmdSel=0;
  var CMD_ITEMS=[
    {group:'Go to', ic:'\u{1F501}', label:'Loops',    hint:'1', fn:function(){switchTab('loops');}},
    {group:'Go to', ic:'\u2705',   label:'Tasks',    hint:'2', fn:function(){switchTab('tasks');}},
    {group:'Go to', ic:'\u{1F91D}', label:'Leads',    hint:'3', fn:function(){switchTab('leads');}},
    {group:'Go to', ic:'\u{1F916}', label:'Agents',   hint:'4', fn:function(){switchTab('agents');}},
    {group:'Go to', ic:'\u2699\uFE0F',label:'Autonomy', hint:'5', fn:function(){switchTab('auto');}},
    {group:'Go to', ic:'\u{1F4DC}', label:'Activity', hint:'6', fn:function(){switchTab('events');}},
    {group:'Actions',ic:'\u{1F501}',label:'Add loop',    hint:'', fn:function(){switchTab('loops');setTimeout(function(){qfield.focus();},80);}},
    {group:'Actions',ic:'\u2705',  label:'Add task',    hint:'', fn:function(){switchTab('tasks');setTimeout(function(){qfield.focus();},80);}},
    {group:'Actions',ic:'\u{1F91D}',label:'Add lead',    hint:'', fn:function(){switchTab('leads');setTimeout(function(){qfield.focus();},80);}},
    {group:'Actions',ic:'\u21BB',  label:'Sweep loops', hint:'', fn:function(){switchTab('loops');setTimeout(function(){var s=document.getElementById('sweep-btn');if(s) s.click();},300);}},
  ];
  function switchTab(t){tab=t;buildNav();buildBotNav();render();closePalette();}
  function openPalette(){cmdOverlay.classList.add('open');cmdSearch.value='';cmdSearch.focus();renderPalette('');}
  function closePalette(){cmdOverlay.classList.remove('open');}
  function renderPalette(q){
    q=q.toLowerCase();
    var items=q?CMD_ITEMS.filter(function(c){return c.label.toLowerCase().indexOf(q)>=0||c.group.toLowerCase().indexOf(q)>=0;}):CMD_ITEMS;
    if(!items.length){cmdResults.innerHTML='<div class="empty" style="padding:20px">No results</div>';return;}
    var lastGrp='',html='';
    items.forEach(function(c,i){
      if(c.group!==lastGrp){html+='<div class="cmd-group">'+c.group+'</div>';lastGrp=c.group;}
      html+='<div class="cmd-item'+(i===cmdSel?' sel':'')+'" data-ci="'+i+'">'
        +'<div class="cmd-item-ic">'+c.ic+'</div>'
        +'<span class="cmd-item-label">'+c.label+'</span>'
        +(c.hint?'<span class="cmd-item-hint">'+c.hint+'</span>':'')
        +'</div>';
    });
    cmdResults.innerHTML=html;
    cmdResults.querySelectorAll('.cmd-item').forEach(function(el){
      el.onclick=function(){items[parseInt(el.dataset.ci)].fn();};
    });
  }
  if(cmdSearch){
    cmdSearch.oninput=function(){cmdSel=0;renderPalette(cmdSearch.value);};
    cmdSearch.onkeydown=function(e){
      var els=cmdResults.querySelectorAll('.cmd-item');
      if(e.key==='ArrowDown'){cmdSel=Math.min(cmdSel+1,els.length-1);e.preventDefault();}
      else if(e.key==='ArrowUp'){cmdSel=Math.max(cmdSel-1,0);e.preventDefault();}
      else if(e.key==='Enter'){var sel=cmdResults.querySelector('.cmd-item.sel');if(sel) sel.click();}
      else if(e.key==='Escape'){closePalette();return;}
      renderPalette(cmdSearch.value);
    };
  }
  if(cmdOverlay) cmdOverlay.onclick=function(e){if(e.target===cmdOverlay) closePalette();};

  // \u2500\u2500 quick-add \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  document.getElementById('qbar').onsubmit=function(e){
    e.preventDefault();
    var v=qfield.value.trim(); if(!v) return;
    qfield.value='';
    if(tab==='loops') post('/api/loops',{title:v,side:side}).then(function(){toast('Loop captured');render();});
    else if(tab==='tasks') post('/api/tasks',{title:v,day:taskDay}).then(function(){toast('Task added');render();});
    else if(tab==='leads'){
      if(v.length>24||/[,@]/.test(v)) post('/api/leads/quick-add',{note:v}).then(function(){toast('Lead created from note');render();});
      else post('/api/leads',{name:v}).then(function(){toast('Lead created');render();});
    }
  };

  // \u2500\u2500 keyboard shortcuts \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  document.addEventListener('keydown',function(ev){
    var tag=(document.activeElement||{}).tagName||'';
    var inInput=tag==='INPUT'||tag==='TEXTAREA';
    if((ev.metaKey||ev.ctrlKey)&&ev.key==='k'){
      ev.preventDefault();
      if(cmdOverlay.classList.contains('open')){closePalette();}
      else{openPalette();}
      return;
    }
    if(inInput) return;
    if(ev.key==='Escape'){closePalette();notifPanel.classList.remove('open');if(document.activeElement)document.activeElement.blur();return;}
    var idx='123456'.indexOf(ev.key);
    if(idx>=0&&idx<TABS.length){tab=TABS[idx].id;buildNav();buildBotNav();render();}
  });

  // \u2500\u2500 sidebar search \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var ssi=document.getElementById('sidebar-search-input');
  if(ssi){ssi.oninput=function(){
    var q=ssi.value.toLowerCase();
    document.querySelectorAll('#side-nav .nav-item').forEach(function(el){
      el.style.display=(!q||el.textContent.toLowerCase().indexOf(q)>=0)?'':'none';
    });
  };}

  function setupSSE(){
    var es;
    try{es=new EventSource('/api/stream');}catch(e){return;}
    es.onmessage=function(ev){
      try{
        var evt=JSON.parse(ev.data);
        if(!evt.type) return;
        var reloadMap={'loop.created':'loops','loop.closed':'loops','loop.snoozed':'loops','task.created':'tasks','task.completed':'tasks','task.moved':'tasks','lead.created':'leads','lead.advanced':'leads','agent.action':'agents'};
        if(reloadMap[evt.type]===tab) render();
        loadNotifications();
      }catch(e){}
    };
  }
  var PROJECT_EMOJIS=['\u{1F4E6}','\u{1F4C4}','\u{1F4F1}','\u{1F680}','\u{1F4C5}','\u{1F91D}','\u{1F389}','\u{1F4BC}','\u{1F3AF}','\u{1F3A8}','\u{1F6E0}\uFE0F','\u{1F4CA}'];
  var PROJECT_COLORS=['#3e7bfa','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#6b7280','#14b8a6','#d946ef'];
  var selectedTemplate=0;
  var selectedColor=null;
  var selectedImage=null;
  var selectedEmoji=null;
  var editingProjectId=null;
  var viewingProjectId=null;
  function getProjects(){
    try{return JSON.parse(localStorage.getItem('cb-projects')||'[]');}catch(e){return [];}
  }
  function saveProjects(list){
    localStorage.setItem('cb-projects',JSON.stringify(list));
  }
  function projectCardBg(p){
    if(p.img) return 'url('+p.img+') center/cover no-repeat';
    return p.bg||PROJECT_PALETTES[0];
  }
  function loadProjects(){
    var projects=getProjects();
    var html='<div class="sec-head"><div><div class="sec-title">Projects</div><div class="sec-sub">Everything your team is building.</div></div><div class="head-actions"><button class="btn-primary" id="new-proj-btn">+ New project</button></div></div><div class="bento-grid">';
    projects.forEach(function(p,i){
      var bg=projectCardBg(p);
      var done=p.done||0;var total=p.total||0;
      var pct=total>0?Math.round(done/total*100):0;
      html+='<div class="bento-card'+(i===0?' bento-hero':'')+'" data-project-id="'+p.id+'" style="background:'+bg+';"><div class="bento-card-emoji">'+esc(p.emoji||'\u{1F4E6}')+'</div><div class="bento-card-name">'+esc(p.name)+'</div>'+(p.desc?'<div class="bento-card-desc">'+esc(p.desc)+'</div>':'')+'<div class="bento-card-foot">'+(total?'<div class="bento-prog-bar"><div class="bento-prog-fill" style="width:'+pct+'%"></div></div><span class="bento-pct">'+pct+'%</span>':'')+'<span class="bento-status">'+esc(p.status||'active')+'</span></div></div>';
    });
    html+='<button class="bento-new-card" id="bento-new-card-btn"><div style="font-size:28px;">+</div><div style="font-size:13px;font-weight:600;">New project</div></button></div>';
    view.innerHTML=html;
    var nbtn=document.getElementById('new-proj-btn');
    var nbtn2=document.getElementById('bento-new-card-btn');
    if(nbtn)nbtn.onclick=function(){openNewProjectModal();};
    if(nbtn2)nbtn2.onclick=function(){openNewProjectModal();};
    view.querySelectorAll('[data-project-id]').forEach(function(el){
      el.onclick=function(){openProjectDetail(el.dataset.projectId);};
    });
  }
  function openNewProjectModal(existingId){
    var m=document.getElementById('proj-modal');
    if(!m)return;
    editingProjectId=existingId||null;
    var existing=existingId?getProjects().find(function(p){return p.id===existingId;}):null;
    document.getElementById('proj-modal-title').textContent=existing?'Edit project':'New project';
    document.getElementById('proj-modal-save').textContent=existing?'Save changes':'Create project';
    document.getElementById('proj-modal-delete').style.display=existing?'':'none';
    document.getElementById('proj-modal-name').value=existing?existing.name:'';
    document.getElementById('proj-modal-desc').value=existing?(existing.desc||''):'';
    selectedTemplate=0;
    selectedColor=existing&&existing.color?existing.color:null;
    selectedImage=existing&&existing.img?existing.img:null;
    selectedEmoji=existing?(existing.emoji||null):null;
    renderTemplateGrid();
    renderProjColorRow();
    renderProjEmojiRow();
    updateProjImagePreview();
    m.classList.add('open');
    document.getElementById('proj-modal-name').focus();
  }
  function closeNewProjectModal(){
    var m=document.getElementById('proj-modal');
    if(m)m.classList.remove('open');
    editingProjectId=null;
  }
  function renderTemplateGrid(){
    var g=document.getElementById('proj-template-grid');
    if(!g)return;
    g.innerHTML=PROJECT_TEMPLATES.map(function(t,i){return '<div class="proj-tmpl-card" data-ti="'+i+'" style="aspect-ratio:3/2;border-radius:10px;display:flex;align-items:flex-end;padding:8px;cursor:pointer;border:2px solid transparent;background:'+t.bg+';transition:all .15s;"><span style="font-size:10.5px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.4);">'+t.emoji+' '+t.name+'</span></div>';}).join('');
    g.querySelectorAll('.proj-tmpl-card').forEach(function(el){
      el.onclick=function(){
        selectedTemplate=parseInt(el.dataset.ti);
        selectedColor=null;
        selectedImage=null;
        selectedEmoji=null;
        renderTemplateGrid();
        renderProjColorRow();
        renderProjEmojiRow();
        updateProjImagePreview();
      };
      el.classList.toggle('on',!selectedColor&&!selectedImage&&parseInt(el.dataset.ti)===selectedTemplate);
      el.style.borderColor=(!selectedColor&&!selectedImage&&parseInt(el.dataset.ti)===selectedTemplate)?'var(--accent)':'transparent';
    });
  }
  function renderProjColorRow(){
    var g=document.getElementById('proj-color-row');
    if(!g)return;
    g.innerHTML=PROJECT_COLORS.map(function(c){return '<div class="proj-color-swatch'+(selectedColor===c?' on':'')+'" data-c="'+c+'" style="background:'+c+';"></div>';}).join('');
    g.querySelectorAll('.proj-color-swatch').forEach(function(el){
      el.onclick=function(){
        selectedColor='linear-gradient(135deg,'+el.dataset.c+','+el.dataset.c+'cc)';
        selectedImage=null;
        renderTemplateGrid();
        renderProjColorRow();
        updateProjImagePreview();
      };
    });
  }
  function renderProjEmojiRow(){
    var g=document.getElementById('proj-emoji-row');
    if(!g)return;
    var cur=selectedEmoji||(PROJECT_TEMPLATES[selectedTemplate]&&PROJECT_TEMPLATES[selectedTemplate].emoji)||PROJECT_EMOJIS[0];
    g.innerHTML=PROJECT_EMOJIS.map(function(em){return '<button type="button" class="emoji-pick-btn'+(em===cur?' on':'')+'" data-em="'+em+'">'+em+'</button>';}).join('');
    g.querySelectorAll('.emoji-pick-btn').forEach(function(b){b.onclick=function(){selectedEmoji=b.dataset.em;renderProjEmojiRow();};});
  }
  function updateProjImagePreview(){
    var p=document.getElementById('proj-upload-preview');
    var clearBtn=document.getElementById('proj-image-clear');
    if(!p)return;
    if(selectedImage){
      p.style.backgroundImage='url('+selectedImage+')';
      if(clearBtn)clearBtn.style.display='';
    }else{
      p.style.backgroundImage='';
      if(clearBtn)clearBtn.style.display='none';
    }
  }
  function currentProjectBgForSave(){
    if(selectedColor) return selectedColor;
    return PROJECT_TEMPLATES[selectedTemplate].bg;
  }
  function openProjectDetail(id){
    var projects=getProjects();
    var p=projects.find(function(x){return x.id===id;});
    if(!p)return;
    viewingProjectId=id;
    var m=document.getElementById('proj-detail-modal');
    if(!m)return;
    var bg=projectCardBg(p);
    var done=p.done||0,total=p.total||0;
    var body=document.getElementById('proj-detail-body');
    body.innerHTML='<div class="proj-detail-hero" style="background:'+bg+';"><div class="proj-detail-emoji">'+esc(p.emoji||'\u{1F4E6}')+'</div><div class="proj-detail-name">'+esc(p.name)+'</div></div>'
      +(p.desc?'<div style="font-size:13px;color:var(--muted);margin-bottom:14px;line-height:1.5;">'+esc(p.desc)+'</div>':'')
      +'<div class="proj-detail-row"><span style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;">STATUS</span><select class="modal-select" id="proj-detail-status" style="width:auto;flex:1;"><option value="active"'+(p.status==='active'?' selected':'')+'>Active</option><option value="paused"'+(p.status==='paused'?' selected':'')+'>Paused</option><option value="done"'+(p.status==='done'?' selected':'')+'>Done</option></select></div>'
      +'<div class="proj-detail-row"><span style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;">PROGRESS</span><button class="proj-stepper-btn" id="proj-detail-total-minus">\u2212</button><span style="font-family:&quot;JetBrains Mono&quot;,monospace;font-size:13px;font-weight:600;min-width:56px;text-align:center;" id="proj-detail-progress-label">'+done+' / '+total+'</span><button class="proj-stepper-btn" id="proj-detail-total-plus">+</button></div>'
      +'<div class="proj-detail-row"><span style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;">DONE STEPS</span><button class="proj-stepper-btn" id="proj-detail-done-minus">\u2212</button><button class="proj-stepper-btn" id="proj-detail-done-plus">+</button></div>'
      +'<div style="font-size:10.5px;color:var(--faint);">Created '+new Date(p.createdAt||Date.now()).toLocaleDateString()+'</div>';
    function refreshProgress(){
      var cur=getProjects().find(function(x){return x.id===id;});
      if(!cur)return;
      document.getElementById('proj-detail-progress-label').textContent=(cur.done||0)+' / '+(cur.total||0);
    }
    function updateProject(patch){
      var list=getProjects();
      var idx=list.findIndex(function(x){return x.id===id;});
      if(idx<0)return;
      list[idx]=Object.assign({},list[idx],patch);
      saveProjects(list);
      refreshProgress();
    }
    document.getElementById('proj-detail-status').onchange=function(e){updateProject({status:e.target.value});};
    document.getElementById('proj-detail-total-plus').onclick=function(){var cur=getProjects().find(function(x){return x.id===id;});updateProject({total:(cur.total||0)+1});};
    document.getElementById('proj-detail-total-minus').onclick=function(){var cur=getProjects().find(function(x){return x.id===id;});updateProject({total:Math.max(cur.done||0,(cur.total||0)-1)});};
    document.getElementById('proj-detail-done-plus').onclick=function(){var cur=getProjects().find(function(x){return x.id===id;});updateProject({done:Math.min(cur.total||0,(cur.done||0)+1)});};
    document.getElementById('proj-detail-done-minus').onclick=function(){var cur=getProjects().find(function(x){return x.id===id;});updateProject({done:Math.max(0,(cur.done||0)-1)});};
    m.classList.add('open');
  }
  function closeProjectDetail(){
    var m=document.getElementById('proj-detail-modal');
    if(m)m.classList.remove('open');
    loadProjects();
    viewingProjectId=null;
  }
  function deleteProject(id){
    var list=getProjects().filter(function(p){return p.id!==id;});
    saveProjects(list);
  }
  function openNewTaskModal(day){
    var m=document.getElementById('task-modal');
    if(!m)return;
    document.getElementById('task-modal-title').value='';
    document.getElementById('task-modal-when').value=day||'today';
    m.classList.add('open');
    document.getElementById('task-modal-title').focus();
  }
  function closeNewTaskModal(){
    var m=document.getElementById('task-modal');
    if(m)m.classList.remove('open');
  }
  var leadModalData={};
  function openNewLeadModal(){
    leadModalData={};
    var m=document.getElementById('lead-modal');
    if(!m)return;
    ['lead-name','lead-phone','lead-email','lead-company','lead-title','lead-notes'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('lead-extracted').style.display='none';
    document.getElementById('lead-upload-area').style.display='block';
    m.classList.add('open');
    document.getElementById('lead-name').focus();
  }
  function closeNewLeadModal(){
    var m=document.getElementById('lead-modal');
    if(m)m.classList.remove('open');
  }
  function showTab(t){
    var isType=t==='type';
    document.getElementById('lead-tab-type').style.background=isType?'var(--surface)':'transparent';
    document.getElementById('lead-tab-type').style.fontWeight=isType?'600':'500';
    document.getElementById('lead-tab-type').style.color=isType?'var(--text)':'var(--muted)';
    document.getElementById('lead-tab-photo').style.background=!isType?'var(--surface)':'transparent';
    document.getElementById('lead-tab-photo').style.fontWeight=!isType?'600':'500';
    document.getElementById('lead-tab-photo').style.color=!isType?'var(--text)':'var(--muted)';
    document.getElementById('lead-type-form').style.display=isType?'block':'none';
    document.getElementById('lead-photo-form').style.display=!isType?'block':'none';
  }
  function processCardFile(file){
    var uploadArea=document.getElementById('lead-upload-area');
    uploadArea.innerHTML='<div style="font-size:13px;color:var(--muted);padding:8px;">Extracting fields...<span class="spin" style="display:inline-block;margin:0 8px;vertical-align:middle;"></span></div>';
    var reader=new FileReader();
    reader.onload=function(e){
      var base64=e.target.result.split(',')[1];
      post('/api/leads/extract-card',{imageBase64:base64}).then(function(data){
        data=data||{};leadModalData=data;
        showTab('type');
        if(data.name)document.getElementById('lead-name').value=data.name;
        if(data.phone)document.getElementById('lead-phone').value=data.phone;
        if(data.email)document.getElementById('lead-email').value=data.email;
        if(data.company)document.getElementById('lead-company').value=data.company;
        if(data.title)document.getElementById('lead-title').value=data.title;
        toast('Card scanned - review and save');
      }).catch(function(){toast('Could not extract - please type details');showTab('type');});
    };
    reader.readAsDataURL(file);
  }
  (function(){
    var m=document.getElementById('task-modal');
    if(m){
      document.getElementById('task-modal-close').onclick=closeNewTaskModal;
      document.getElementById('task-modal-cancel').onclick=closeNewTaskModal;
      m.onclick=function(e){if(e.target===m)closeNewTaskModal();};
      document.getElementById('task-modal-save').onclick=function(){
        var title=document.getElementById('task-modal-title').value.trim();
        if(!title)return;
        var day=document.getElementById('task-modal-when').value;
        var priority=document.getElementById('task-modal-priority').value;
        var list=document.getElementById('task-modal-list').value.trim();
        post('/api/tasks',{title:title,day:day,priority:priority||undefined,list:list||undefined}).then(function(){closeNewTaskModal();toast('Task added');loadTasks();});
      };
    }
    var ml=document.getElementById('lead-modal');
    if(ml){
      document.getElementById('lead-modal-close').onclick=closeNewLeadModal;
      document.getElementById('lead-modal-cancel').onclick=closeNewLeadModal;
      ml.onclick=function(e){if(e.target===ml)closeNewLeadModal();};
      document.getElementById('lead-tab-type').onclick=function(){showTab('type');};
      document.getElementById('lead-tab-photo').onclick=function(){showTab('photo');};
      var uploadArea=document.getElementById('lead-upload-area');
      var fileInput=document.getElementById('lead-card-file');
      if(uploadArea){uploadArea.onclick=function(){fileInput.click();};uploadArea.ondragover=function(e){e.preventDefault();uploadArea.style.borderColor='var(--accent)';};uploadArea.ondrop=function(e){e.preventDefault();uploadArea.style.borderColor='';if(e.dataTransfer.files[0])processCardFile(e.dataTransfer.files[0]);};}
      if(fileInput)fileInput.onchange=function(){if(fileInput.files[0])processCardFile(fileInput.files[0]);};
      document.getElementById('lead-modal-save').onclick=function(){
        var name=document.getElementById('lead-name').value.trim();
        if(!name){document.getElementById('lead-name').focus();return;}
        post('/api/leads',{name:name,phone:document.getElementById('lead-phone').value.trim()||undefined,email:document.getElementById('lead-email').value.trim()||undefined,company:document.getElementById('lead-company').value.trim()||undefined,title:document.getElementById('lead-title').value.trim()||undefined,what:document.getElementById('lead-notes').value.trim()||undefined}).then(function(){closeNewLeadModal();toast('Lead created');loadLeads();});
      };
    }
    var mp=document.getElementById('proj-modal');
    if(mp){
      document.getElementById('proj-modal-close').onclick=closeNewProjectModal;
      document.getElementById('proj-modal-cancel').onclick=closeNewProjectModal;
      mp.onclick=function(e){if(e.target===mp)closeNewProjectModal();};
      var projImgBtn=document.getElementById('proj-image-btn');
      var projImgFile=document.getElementById('proj-image-file');
      var projImgClear=document.getElementById('proj-image-clear');
      if(projImgBtn&&projImgFile){
        projImgBtn.onclick=function(){projImgFile.click();};
        projImgFile.onchange=function(){
          var file=projImgFile.files&&projImgFile.files[0];
          if(!file)return;
          var reader=new FileReader();
          reader.onload=function(e){
            selectedImage=e.target.result;
            selectedColor=null;
            updateProjImagePreview();
            renderTemplateGrid();
            renderProjColorRow();
          };
          reader.readAsDataURL(file);
        };
      }
      if(projImgClear) projImgClear.onclick=function(){selectedImage=null;projImgFile.value='';updateProjImagePreview();};
      document.getElementById('proj-modal-delete').onclick=function(){
        if(!editingProjectId)return;
        deleteProject(editingProjectId);
        closeNewProjectModal();
        toast('Project deleted');
        loadProjects();
      };
      document.getElementById('proj-modal-save').onclick=function(){
        var name=document.getElementById('proj-modal-name').value.trim();
        if(!name)return;
        var desc=document.getElementById('proj-modal-desc').value.trim();
        var emoji=selectedEmoji||PROJECT_TEMPLATES[selectedTemplate].emoji;
        var bg=currentProjectBgForSave();
        var projects=getProjects();
        if(editingProjectId){
          var idx=projects.findIndex(function(p){return p.id===editingProjectId;});
          if(idx>=0){
            projects[idx]=Object.assign({},projects[idx],{name:name,desc:desc,emoji:emoji,bg:bg,color:selectedColor,img:selectedImage});
          }
          toast('Project updated');
        }else{
          projects.unshift({id:Date.now().toString(),name:name,desc:desc,emoji:emoji,bg:bg,color:selectedColor,img:selectedImage,status:'active',done:0,total:0,createdAt:Date.now()});
          toast('Project created');
        }
        saveProjects(projects);
        closeNewProjectModal();
        loadProjects();
      };
    }
    var pdm=document.getElementById('proj-detail-modal');
    if(pdm){
      document.getElementById('proj-detail-close').onclick=closeProjectDetail;
      document.getElementById('proj-detail-close-btn').onclick=closeProjectDetail;
      pdm.onclick=function(e){if(e.target===pdm)closeProjectDetail();};
      document.getElementById('proj-detail-edit').onclick=function(){
        var id=viewingProjectId;
        closeProjectDetail();
        openNewProjectModal(id);
      };
      document.getElementById('proj-detail-delete').onclick=function(){
        if(!viewingProjectId)return;
        deleteProject(viewingProjectId);
        closeProjectDetail();
        toast('Project deleted');
      };
    }
    var agm=document.getElementById('agent-modal');
    if(agm){
      document.getElementById('agent-modal-close').onclick=closeAgentModal;
      document.getElementById('agent-modal-cancel').onclick=closeAgentModal;
      agm.onclick=function(e){if(e.target===agm)closeAgentModal();};
      agm.querySelectorAll('#agent-modal-autonomy .lvl').forEach(function(b){
        b.onclick=function(){agm.querySelectorAll('#agent-modal-autonomy .lvl').forEach(function(x){x.classList.remove('on');});b.classList.add('on');};
      });
      document.getElementById('agent-modal-delete').onclick=function(){
        if(!editingAgentId)return;
        var list=customAgents().filter(function(a){return a.id!==editingAgentId;});
        saveCustomAgents(list);
        closeAgentModal();
        toast('Agent removed');
        loadAgents();
      };
      document.getElementById('agent-modal-save').onclick=function(){
        var name=document.getElementById('agent-modal-name').value.trim();
        if(!name)return;
        var role=document.getElementById('agent-modal-role').value.trim()||'Custom agent';
        var lvlBtn=agm.querySelector('#agent-modal-autonomy .lvl.on');
        var autonomy=lvlBtn?lvlBtn.dataset.lvl:'ask';
        var list=customAgents();
        if(editingAgentId){
          var idx=list.findIndex(function(a){return a.id===editingAgentId;});
          if(idx>=0) list[idx]=Object.assign({},list[idx],{name:name,role:role,emoji:agentEmojiPick,autonomy:autonomy});
          toast('Agent updated');
        }else{
          list.push({id:'agent_custom_'+Date.now(),name:name,role:role,emoji:agentEmojiPick,autonomy:autonomy,done:0,pending:0});
          toast('Agent hired');
        }
        saveCustomAgents(list);
        closeAgentModal();
        loadAgents();
      };
    }
    var am=document.getElementById('auth-modal');
    if(am){
      var idInput=document.getElementById('auth-identifier');
      var pwInput=document.getElementById('auth-password');
      var loginBtn=document.getElementById('auth-login-btn');
      if(loginBtn) loginBtn.onclick=loginWithPassword;
      if(idInput) idInput.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();loginWithPassword();}};
      if(pwInput) pwInput.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();loginWithPassword();}};
    }
    var lo=document.getElementById('logout-btn');
    if(lo) lo.onclick=function(){logoutSession();};
    var loTop=document.getElementById('topbar-logout-btn');
    if(loTop) loTop.onclick=function(){logoutSession();};
  })();
  var teamView='ceo';
  function loadTeam(){
    var role=me&&me.role;
    var isManager=role==='ceo'||role==='manager';
    var subViews=[{id:'ceo',label:'CEO'},{id:'mgr',label:'Manager'},{id:'emp',label:'Employee'},{id:'client',label:'Client'},{id:'agents',label:'AI Agents'}];
    var html='<div class="sec-head"><div><div class="sec-title">Team</div><div class="sec-sub">Per-employee performance from time tracking.</div></div></div>';
    if(teamView==='agents'){loadAgents();return;}
    // Access guard: only managers/CEOs see team performance dashboards
    if(!isManager){
      html+='<div class="gc" style="padding:40px 24px;border-radius:16px;text-align:center;">'
        +'<div style="font-size:34px;margin-bottom:10px;">\u{1F512}</div>'
        +'<div style="font-size:15px;font-weight:700;">You don't have access</div>'
        +'<div style="font-size:12.5px;color:var(--muted);margin-top:6px;">Team performance dashboards are available to managers and CEOs.</div></div>';
      view.innerHTML=html;
      return;
    }
    html+='<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:20px;background:var(--bg2);border:1px solid var(--glassBorder);border-radius:12px;padding:3px;width:fit-content;">'+subViews.map(function(sv){return '<button class="team-sv-btn'+(sv.id===teamView?' on':'')+'" data-sv="'+sv.id+'" style="padding:7px 14px;border-radius:9px;border:none;background:'+(sv.id===teamView?'var(--surface)':'transparent')+';font-size:12.5px;font-weight:'+(sv.id===teamView?'600':'500')+';color:'+(sv.id===teamView?'var(--text)':'var(--muted)')+';min-height:36px;cursor:pointer;box-shadow:'+(sv.id===teamView?'var(--shadow-md)':'none')+';">'+sv.label+'</button>';}).join('')+'</div>';
    view.innerHTML=html+'<div class="spin"></div>';
    api('/api/team/performance').then(function(res){
      res=res||[];
      var people=Array.isArray(res)?res:(res.people||res.team||[]);
      people=people.slice().sort(function(a,b){return (b.points||0)-(a.points||0);});
      var detail='';
      if(teamView==='ceo'){
        // Aggregate KPIs across the team
        var totTasks=people.reduce(function(s,p){return s+(p.tasksDone||0);},0);
        var totLoops=people.reduce(function(s,p){return s+(p.loopsClosed||0);},0);
        var totFocus=people.reduce(function(s,p){return s+(p.focusMinutes||0);},0);
        detail='<div class="kpi-grid">'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--accent)">'+people.length+'</div><div class="kpi-lbl">team members</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--green)">'+totTasks+'</div><div class="kpi-lbl">tasks done (30d)</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--amber)">'+totLoops+'</div><div class="kpi-lbl">loops closed</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--teal)">'+Math.round(totFocus/60)+'h</div><div class="kpi-lbl">focus time</div></div>'
          +'</div>';
      }else if(teamView==='mgr'){
        detail='<div class="gc" style="padding:18px 20px;border-radius:16px;"><div style="font-size:14px;font-weight:700;margin-bottom:14px;">Workload overview</div>';
        if(people.length){
          var maxTasks=Math.max.apply(null,people.map(function(p){return p.tasksDone||0;}).concat([1]));
          detail+=people.map(function(p){
            var pct=Math.round(((p.tasksDone||0)/maxTasks)*100);
            return '<div style="margin-bottom:14px;"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;"><span>'+esc(p.name||'Unknown')+'</span><span style="color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;">'+(p.tasksDone||0)+' tasks</span></div><div style="height:5px;border-radius:5px;background:var(--bg2);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:var(--accent);border-radius:5px;"></div></div></div>';
          }).join('');
        }else{
          detail+='<div class="empty-dashed">No team data yet \u2014 connect time tracking.</div>';
        }
        detail+='</div>';
      }
      // Employee cards (real data) for ceo/mgr/emp views
      if(teamView==='ceo'||teamView==='mgr'||teamView==='emp'){
        detail+='<div class="gc" style="padding:18px 20px;border-radius:16px;"><div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:12px;">'+(teamView==='emp'?'YOUR STATS':'TEAM MEMBERS')+'</div>';
        if(people.length){
          detail+=people.map(function(p){
            var initials=(p.name||'?').trim().split(/s+/).slice(0,2).map(function(w){return w[0].toUpperCase();}).join('');
            var hue=((p.name||'A').charCodeAt(0)*37)%360;
            return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--glassBorder);">'
              +'<div style="width:36px;height:36px;border-radius:50%;background:hsl('+hue+',35%,52%);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">'+esc(initials)+'</div>'
              +'<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">'+esc(p.name||'Unknown')+(p.role?' <span style="color:var(--muted);font-weight:500;font-size:11px;">('+esc(p.role)+')</span>':'')+'</div>'
              +'<div style="font-size:11px;color:var(--muted);margin-top:2px;font-family:\\'JetBrains Mono\\',monospace;">'+(p.tasksDone||0)+' tasks \xB7 '+(p.loopsClosed||0)+' loops \xB7 '+Math.round((p.focusMinutes||0)/60)+'h focus</div></div>'
              +'<div style="font-family:\\'JetBrains Mono\\',monospace;font-size:12px;font-weight:600;color:var(--accent);">'+(p.points||0)+' pts</div></div>';
          }).join('');
        }else{
          detail+='<div class="empty-dashed">No team data yet \u2014 connect time tracking.</div>';
        }
        detail+='</div>';
      }
      if(teamView==='client'){
        detail='<div class="gc" style="padding:18px 20px;border-radius:16px;border-left:3px solid var(--teal);"><div style="font-size:11px;font-weight:700;color:var(--teal);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:8px;">CLIENT PORTAL - READ ONLY</div><div style="font-size:15px;font-weight:700;margin-bottom:4px;">Your project</div><div style="font-size:12.5px;color:var(--muted);">Project deliverables and progress will appear here once shared.</div></div>';
      }
      view.innerHTML=html+detail;
      view.querySelectorAll('[data-sv]').forEach(function(b){b.onclick=function(){teamView=b.dataset.sv;loadTeam();};});
    }).catch(function(e){
      view.innerHTML=html+'<div class="empty">Failed to load team data: '+(e&&e.message||e)+'</div>';
      view.querySelectorAll('[data-sv]').forEach(function(b){b.onclick=function(){teamView=b.dataset.sv;loadTeam();};});
    });
  }
  var BRAIN_ENTRIES=[
    {tag:'Sensitivity', text:'Stopped flagging invoice confirmation emails as open loops after 3 corrections.', when:Date.now()-86400e3*2},
    {tag:'Channel', text:'Linked WhatsApp group "Project Alpha" to project #P-004 based on recurring mentions.', when:Date.now()-86400e3*4},
    {tag:'People', text:'Recognised that "the client" in Slack usually refers to Dana Carter - auto-linking applied.', when:Date.now()-86400e3*7},
    {tag:'Loop pattern', text:'Emails from noreply@github.com marked as non-actionable by default.', when:Date.now()-86400e3*10},
    {tag:'Autonomy', text:'Confidence threshold raised from 70% to 85% for auto-creating tasks.', when:Date.now()-86400e3*14},
  ];
  function loadBrain(){
    var html='<div class="sec-head"><div><div class="sec-title">Company Brain</div><div class="sec-sub">What the AI has learned - and why. Every change is correctable.</div></div></div><div style="position:relative;padding-left:20px;"><div style="position:absolute;left:7px;top:6px;bottom:0;width:2px;background:var(--glassBorder);border-radius:2px;"></div>'
      +BRAIN_ENTRIES.map(function(e){return '<div style="position:relative;padding:0 0 20px 20px;"><div style="position:absolute;left:-14px;top:5px;width:10px;height:10px;border-radius:50%;background:var(--accent);border:2px solid var(--surface);box-shadow:0 0 0 3px var(--accentSoft);"></div><div style="display:inline-block;font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:var(--accentSoft);color:var(--accent);font-family:\\'JetBrains Mono\\',monospace;margin-bottom:5px;">'+esc(e.tag)+'</div><div style="font-size:13px;color:var(--text);line-height:1.5;">'+esc(e.text)+'</div><div style="font-size:10px;color:var(--faint);margin-top:4px;font-family:\\'JetBrains Mono\\',monospace;">'+ago(e.when)+' ago</div><button style="margin-top:6px;font-size:10.5px;color:var(--red);background:transparent;border:none;cursor:pointer;padding:0;" onclick="toast(\\'Correction saved. Brain will re-learn.\\')">\u21A9 Correct this</button></div>';}).join('')+'</div>';
    view.innerHTML=html;
  }
  // \u2500\u2500 methods (productivity) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function methodTaskCard(t){
    var pr=t.priority==='high'?'<span class="priority-pill priority-high">HIGH</span>':t.priority==='med'?'<span class="priority-pill priority-med">MED</span>':t.priority==='low'?'<span class="priority-pill priority-low">LOW</span>':'';
    return '<div class="kanban-task-card gc" data-mtask="'+esc(t.id||'')+'" style="cursor:pointer;">'
      +'<div class="kanban-task-row"><button class="kanban-check" data-mdone="'+esc(t.id||'')+'"></button>'
      +'<span class="kanban-task-emoji">'+esc(t.emoji||'\u{1F4DD}')+'</span>'
      +'<div style="flex:1;min-width:0;"><div class="kanban-task-title">'+esc(t.title||t.name||'Untitled')+'</div>'
      +(t.note||t.list?'<div class="kanban-task-sub">'+esc(t.note||t.list)+'</div>':'')+'</div></div>'
      +'<div class="kanban-task-foot">'+pr+'</div></div>';
  }
  function wireMethodTaskCards(){
    view.querySelectorAll('[data-mtask]').forEach(function(c){
      c.onclick=function(e){
        if(e.target.classList.contains('kanban-check'))return;
        toast('Opening task\u2026');
      };
    });
    view.querySelectorAll('[data-mdone]').forEach(function(b){
      b.onclick=function(e){
        e.stopPropagation();
        var id=b.dataset.mdone;
        if(!id)return;
        post('/api/tasks/'+id+'/complete').then(function(){toast('Task completed');}).catch(function(){});
      };
    });
  }
  function renderMethodResult(methodId, result, meta){
    result=result||{};
    function col(label, dotColor, tasks){
      tasks=tasks||[];
      var cards=tasks.length?tasks.map(methodTaskCard).join(''):'<div class="empty-dashed" style="font-size:11px;padding:14px 10px;">Nothing here.</div>';
      return '<div class="kanban-col"><div class="kanban-col-head"><span class="kanban-col-dot" style="background:'+dotColor+'"></span><span class="kanban-col-label">'+label+'</span><span class="kanban-col-count">'+tasks.length+'</span></div><div class="kanban-col-body">'+cards+'</div></div>';
    }
    function listSection(label, dotColor, tasks){
      tasks=tasks||[];
      var items=tasks.length?tasks.map(methodTaskCard).join(''):'<div class="empty-dashed" style="font-size:11px;padding:14px 10px;">Nothing here.</div>';
      return '<div class="gc" style="padding:14px 16px;border-radius:14px;margin-bottom:14px;">'
        +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px;"><span style="width:8px;height:8px;border-radius:2px;background:'+dotColor+';flex-shrink:0;"></span>'
        +'<span style="font-family:\\'JetBrains Mono\\',monospace;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);">'+label+'</span>'
        +'<span style="margin-left:auto;font-family:\\'JetBrains Mono\\',monospace;font-size:11px;color:var(--faint);">'+tasks.length+'</span></div>'
        +'<div style="display:flex;flex-direction:column;gap:7px;">'+items+'</div></div>';
    }
    var html='<div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;">'
      +'<button class="btn-ghost" id="methods-back" style="font-size:12px;padding:7px 12px;">\u2190 All methods</button>'
      +'<div style="font-size:16px;">'+esc((meta&&meta.icon)||'\u{1F9ED}')+'</div>'
      +'<div><div style="font-size:16px;font-weight:700;">'+esc((meta&&meta.name)||methodId)+'</div>'
      +'<div style="font-size:11px;color:var(--muted);margin-top:2px;">'+esc((meta&&meta.description)||'')+'</div></div></div>';

    if(methodId==='eisenhower'){
      html+='<div class="kanban-board" style="grid-template-columns:repeat(4,1fr);">'
        +col('Q1 \xB7 DO','#ef4444',result.q1||result.do)
        +col('Q2 \xB7 SCHEDULE','#3e7bfa',result.q2||result.schedule)
        +col('Q3 \xB7 DELEGATE','#f59e0b',result.q3||result.delegate)
        +col('Q4 \xB7 DROP','#9ca3af',result.q4||result.drop)
        +'</div>';
    }else if(methodId==='moscow'){
      html+=listSection('MUST HAVE','#ef4444',result.must||result.M)
        +listSection('SHOULD HAVE','#f59e0b',result.should||result.S)
        +listSection('COULD HAVE','#3e7bfa',result.could||result.C)
        +listSection('WON'T HAVE','#9ca3af',result.wont||result.W);
    }else if(methodId==='abcde'){
      var ranks=[{k:'A',col:'#ef4444'},{k:'B',col:'#f59e0b'},{k:'C',col:'#3e7bfa'},{k:'D',col:'#9ca3af'},{k:'E',col:'#6b7280'}];
      var tasks=result.tasks||result.ranked||[];
      html+='<div style="display:flex;flex-direction:column;gap:7px;">'+tasks.map(function(t){
        var rk=(t.rank||'').toString().toUpperCase().charAt(0);
        var rc=ranks.filter(function(r){return r.k===rk;})[0]||{col:'var(--faint)'};
        var c2=methodTaskCard(Object.assign({},t));
        return '<div style="display:flex;gap:10px;">'
          +'<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:'+rc.col+'22;color:#fff;font-weight:700;font-size:14px;font-family:\\'JetBrains Mono\\',monospace;flex-shrink:0;">'+esc(rk||'?')+'</span>'
          +'<div style="flex:1;min-width:0;">'+c2+'</div></div>';
      }).join('')+'</div>';
    }else if(methodId==='gtd'){
      var groups=result.contexts||result.groups||{};
      var inbox=result.inbox||[];
      var keys=Object.keys(groups);
      html+=(inbox.length?listSection('INBOX','#9ca3af',inbox):'')
        +keys.map(function(k){return listSection(k,'#3e7bfa',groups[k]||[]);}).join('');
      if(!inbox.length&&!keys.length)html+='<div class="empty-dashed">Your inbox is clear. Nothing to organize.</div>';
    }else if(methodId==='twominute'){
      html+='<div class="kanban-board" style="grid-template-columns:repeat(2,1fr);">'
        +col('DO NOW < 2 MIN','#10b981',result.doNow||result.quick||[])
        +col('LONGER','#3e7bfa',result.longer||result.longerTasks||[])
        +'</div>';
    }else if(methodId==='frog'){
      var f=result.frog||result.task;
      html+='<div class="gc" style="padding:22px;border-radius:16px;border-left:4px solid var(--red);margin-bottom:14px;">'
        +'<div style="font-size:11px;font-weight:700;color:var(--red);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;">\u{1F438} EAT THIS FROG FIRST</div>'
        +'<div style="font-size:18px;font-weight:700;margin-top:10px;">'+esc(f&&(f.title)||'No frog identified today')+'</div>'
        +(f&&(f.why||f.reason)?'<div style="font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.5;">'+esc(f.why||f.reason)+'</div>':'')
        +'</div>';
    }else if(methodId==='threethree'){
      html+='<div class="kanban-board" style="grid-template-columns:repeat(3,1fr);">'
        +col('DEEP WORK','#3e7bfa',(result.deep||[]).slice(0,3))
        +col('MEDIUM','#f59e0b',(result.medium||[]).slice(0,3))
        +col('SMALL','#10b981',(result.small||[]).slice(0,3))
        +'</div>';
    }else if(methodId==='pareto'){
      html+=listSection('VITAL 20%','#ef4444',result.vital||result.vital20||[])
        +listSection('USEFUL 80%','#9ca3af',result.useful||result.useful80||[]);
    }else if(methodId==='timeblock'){
      var blocks=result.blocks||[];
      html+='<div class="gc" style="padding:16px 18px;border-radius:16px;">';
      var colmap={deep:'var(--blue)',meeting:'var(--amber)',admin:'var(--faint)',call:'var(--teal)',focus:'var(--green)'};
      for(var h=9;h<=18;h++){
        var hh=(h<10?'0':'')+h;
        var slot=blocks.filter(function(b){return (b.start||9)<=h&&(b.end||19)>h;});
        html+='<div style="display:flex;align-items:stretch;gap:0;border-bottom:1px solid var(--glassBorder);min-height:32px;">'
          +'<div style="width:46px;font-family:\\'JetBrains Mono\\',monospace;font-size:10px;color:var(--muted);padding:6px 0;flex-shrink:0;">'+hh+':00</div>'
          +'<div style="flex:1;display:flex;flex-direction:column;gap:3px;padding:4px 0;">';
        if(slot.length){
          slot.forEach(function(b){
            var c=colmap[b.type]||'var(--faint)';
            html+='<div style="background:'+c+'22;border-radius:7px;padding:5px 9px;font-size:11.5px;font-weight:600;color:var(--text);">'+esc(b.title||b.type||'block')+'</div>';
          });
        }
        html+='</div></div>';
      }
      html+='</div>';
    }else if(methodId==='pomodoro'){
      var tasks=result.tasks||[];
      html+='<div class="gc" style="padding:16px 18px;border-radius:16px;">'
        +'<div style="font-size:12px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:12px;">\u{1F345} POMODORO PLAN</div>'
        +'<div style="display:flex;flex-direction:column;gap:8px;">'+(tasks.length?tasks.map(function(t){
          var sess=t.sessions||t.pomodoros||Math.ceil((t.minutes||25)/25);
          return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--glassBorder);">'
            +'<span style="font-size:16px;">\u{1F345}</span>'
            +'<div style="flex:1;font-size:13px;font-weight:600;">'+esc(t.title||'Task')+'</div>'
            +'<span style="font-family:\\'JetBrains Mono\\',monospace;font-size:12px;font-weight:600;color:var(--accent);">'+esc(sess)+' \xD7 <span style="color:var(--muted);font-weight:500;">('+(t.minutes||sess*25)+'m)</span></span></div>';
        }).join(''):'<div class="empty-dashed">No tasks to plan.</div>')+'</div></div>';
    }else{
      // Fallback: try to render known arrays
      var keys=Object.keys(result).filter(function(k){return Array.isArray(result[k]);});
      if(keys.length){
        html+=keys.map(function(k){return listSection(k.toUpperCase(),'#3e7bfa',result[k]);}).join('');
      }else{
        html+='<div class="gc" style="padding:18px;border-radius:16px;"><div style="font-size:13px;color:var(--muted);">No structured output for this method yet.</div></div>';
      }
    }
    view.innerHTML=html;
    var back=document.getElementById('methods-back');
    if(back) back.onclick=function(){tab='methods';buildNav();loadMethods();};
    wireMethodTaskCards();
  }
  function loadMethods(){
    api('/api/methods').then(function(res){
      var methods=(res&&res.methods)||[];
      if(!methods.length){
        view.innerHTML='<div class="sec-head"><div><div class="sec-title">Methods</div><div class="sec-sub">Productivity frameworks to triage and plan your work.</div></div></div>'
          +'<div class="empty-dashed">No methods available yet.</div>';
        return;
      }
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Methods</div><div class="sec-sub">Productivity frameworks \u2014 pick one to triage your tasks.</div></div></div>'
        +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">'+methods.map(function(m){
          return '<div class="gc method-card" data-method="'+esc(m.id)+'" style="padding:16px;border-radius:14px;cursor:pointer;transition:transform .15s,box-shadow .15s;">'
            +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">'
            +'<span style="width:38px;height:38px;border-radius:10px;background:var(--accentSoft);display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;">'+esc(m.icon||'\u{1F9ED}')+'</span>'
            +'<div style="font-size:14px;font-weight:700;">'+esc(m.name||m.id)+'</div></div>'
            +'<div style="font-size:12px;color:var(--muted);line-height:1.5;">'+esc(m.description||'')+'</div></div>';
        }).join('')+'</div>';
      view.querySelectorAll('.method-card').forEach(function(c){
        c.onclick=function(){
          view.innerHTML='<div class="spin"></div>';
          api('/api/methods/'+c.dataset.method).then(function(r){
            r=r||{};
            renderMethodResult(c.dataset.method, r.result, r.meta||{id:c.dataset.method});
          }).catch(function(e){view.innerHTML='<div class="empty">Failed to run method: '+(e&&e.message||e)+'</div>';});
        };
      });
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load methods: '+(e&&e.message||e)+'</div>';});
  }
  function loadReports(){
    view.innerHTML='<div class="spin"></div>';
    api('/api/reports?days=30').then(function(r){
      r=r||{};
      var loops=r.loops||{}, tasks=r.tasks||{}, leads=r.leads||{}, prod=r.productivity||{}, summary=r.summary||{}, lb=r.leaderboard||[];
      var month=new Date().toLocaleDateString([],{month:'long', year:'numeric'});
      var html='<div class="sec-head"><div><div class="sec-title">Reports</div><div class="sec-sub">30-day analytics \u2014 loops, tasks, leads, and productivity.</div></div></div>'
        +'<div style="padding:20px;border-radius:16px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;margin-bottom:16px;">'
        +'<div style="font-family:\\'JetBrains Mono\\',monospace;font-size:10px;opacity:.8;letter-spacing:.5px;text-transform:uppercase;">'+esc(month)+' \xB7 last 30 days</div>'
        +'<div style="font-size:18px;font-weight:700;margin-top:6px;">'+esc(summary.headline||('Strong month \u2014 '+loops.closedInWindow+' loops closed.'))+'</div>'
        +(summary.sub?'<div style="font-size:12.5px;opacity:.85;margin-top:4px;">'+esc(summary.sub)+'</div>':'')
        +'</div>'
        // KPI cards
        +'<div class="kpi-grid">'
        +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--accent);">'+(loops.closedInWindow||0)+'</div><div class="kpi-lbl">loops closed</div></div>'
        +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--green);">'+(tasks.completedInWindow||0)+'</div><div class="kpi-lbl">tasks done</div></div>'
        +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--teal);">'+(leads.won||0)+'</div><div class="kpi-lbl">leads won</div></div>'
        +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--amber);">'+(prod.focusHours||0)+'h</div><div class="kpi-lbl">focus hours</div></div>'
        +'</div>'
        // velocity sparkline + rates
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">'
        +'<div class="gc" style="padding:16px 18px;border-radius:16px;">'
        +'<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:4px;">7-DAY VELOCITY</div>'
        +velocitySparkline(prod.velocityTrend||[])
        +'</div>'
        +'<div class="gc" style="padding:16px 18px;border-radius:16px;">'
        +'<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:12px;">RATES</div>'
        +'<div style="display:flex;flex-direction:column;gap:10px;">'
        +rateRow('On-time close rate', (loops.onTimeRate||0), 'var(--green)')
        +rateRow('Lead conversion', (leads.conversionRate||0), 'var(--teal)')
        +rateRow('Task completion', (tasks.completionRate||0), 'var(--accent)')
        +'</div></div>'
        +'</div>'
        // leaderboard
        +'<div class="gc" style="padding:16px 18px;border-radius:16px;"><div style="font-size:12px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:12px;">LEADERBOARD</div>'
        +(lb.length?lb.slice().sort(function(a,b){return (b.points||0)-(a.points||0);}).map(function(p,i){
          var medals=['\u{1F947}','\u{1F948}','\u{1F949}'];
          var fm=(prod.bestDay&&p.name===prod.bestDay)?'\u2B50':'';
          return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--glassBorder);">'
            +'<span style="font-family:\\'JetBrains Mono\\',monospace;font-size:11px;font-weight:700;color:var(--faint);min-width:18px;">'+(i+1)+'</span>'
            +'<span style="font-size:16px;">'+(medals[i]||'')+'</span>'
            +'<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">'+esc(p.name||'Unknown')+'</div>'
            +'<div style="font-size:10.5px;color:var(--muted);margin-top:2px;font-family:\\'JetBrains Mono\\',monospace;">'
            +(p.tasksDone||0)+' tasks \xB7 '+(p.loopsClosed||0)+' loops \xB7 '+Math.round((p.focusMinutes||0)/60)+'h focus</div></div>'
            +'<span style="font-family:\\'JetBrains Mono\\',monospace;font-size:12px;font-weight:600;color:var(--accent);">'+(p.points||0)+' pts</span></div>';
        }).join(''):'<div class="empty-dashed">No leaderboard data yet \u2014 start closing loops and tasks.</div>')
        +'</div>';
      view.innerHTML=html;
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load reports: '+(e&&e.message||e)+'</div>';});
  }
  function velocitySparkline(trend){
    trend=trend||[];
    if(!trend.length) return '<div style="font-size:11px;color:var(--faint);padding:12px 0;">No velocity data yet.</div>';
    var max=Math.max.apply(null,trend.concat([1]));
    var w=140, h=40, barW=Math.floor(w/trend.length)-2;
    var bars=trend.map(function(v,i){
      var bh=Math.max(2,Math.round((v/max)*h));
      var x=i*(barW+2);
      var y=h-bh;
      return '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+bh+'" rx="2" fill="var(--accent)"/>';
    }).join('');
    return '<svg width="'+w+'" height="'+h+'" style="display:block;margin-top:6px;">'+bars+'</svg>'
      +'<div style="font-size:10.5px;color:var(--muted);margin-top:6px;font-family:\\'JetBrains Mono\\',monospace;">best day: '+esc(trend.indexOf(Math.max.apply(null,trend))>=0?'this week':'\u2014')+'</div>';
  }
  function rateRow(label, rate, color){
    var pct=Math.round((rate||0)*100);
    return '<div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span style="color:var(--text);">'+label+'</span><span style="color:'+color+';font-family:\\'JetBrains Mono\\',monospace;font-weight:600;">'+pct+'%</span></div>'
      +'<div style="height:5px;border-radius:5px;background:var(--bg2);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:5px;"></div></div></div>';
  }
  function loadSettings(){
    Promise.all([api('/api/autonomy'),api('/api/approvals'),api('/api/connections')]).then(function(res){
      var settings=res[0]||{};
      var approvals=(res[1]||[]).filter(function(a){return a.status==='pending';});
      var conns=res[2]||{};
      var isCeo=me&&me.role==='ceo';
      var connStatus=function(key){return(conns[key]||{}).status||'disconnected';};
      var connOk=function(key){var s=connStatus(key);return s==='connected';};

      // Build channel cards with real Connect buttons
      function channelCard(name,icon,key,desc,connectHtml,statusExtra){
        var st=connStatus(key);
        var ok=st==='connected';
        var statusLabel=st==='connecting'?'Connecting\u2026':st==='connected'?'Connected':st==='error'?'Error':'Not connected';
        var statusColor=ok?'var(--green)':st==='connecting'?'var(--amber)':st==='error'?'var(--red)':'var(--muted)';
        var subtext=statusExtra||statusLabel;
        return '<div class="gc" style="padding:14px 16px;border-radius:14px;margin-bottom:8px;">'
          +'<div style="display:flex;align-items:center;gap:11px;margin-bottom:8px;">'
          +'<div style="width:36px;height:36px;border-radius:10px;background:var(--bg2);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">'+icon+'</div>'
          +'<div style="flex:1;min-width:0;"><div style="font-size:13.5px;font-weight:700;">'+name+'</div><div style="font-size:11px;color:var(--muted);margin-top:1px;">'+esc(desc)+'</div></div>'
          +'<span style="font-size:9.5px;font-weight:700;padding:3px 9px;border-radius:6px;background:'+(ok?'var(--greenSoft)':st==='connecting'?'var(--amberSoft)':'var(--bg2)')+';color:'+statusColor+';font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.3px;">'+statusLabel.toUpperCase()+'</span>'
          +'</div>'
          +(ok?'<div style="font-size:11px;color:var(--faint);margin-bottom:8px;font-family:&quot;JetBrains Mono&quot;,monospace;">'+esc(subtext)+'</div>':'')
          +(ok&&isCeo?'<button class="btn-ghost conn-disconnect-btn" data-channel="'+key+'" style="font-size:11px;padding:6px 12px;">Disconnect</button>':'')
          +(!ok&&isCeo?'<div style="margin-top:4px;">'+connectHtml+'</div>':'')
          +(st==='connecting'&&isCeo?'<div style="font-size:11px;color:var(--amber);margin-top:6px;"><span class="spin" style="display:inline-block;width:12px;height:12px;border-width:2px;vertical-align:middle;margin-right:6px;"></span>Waiting for connection\u2026</div>':'')
          +'</div>';
      }

      var waCloudConn=channelCard('WhatsApp Business','\u{1F4F1}','whatsapp_cloud','Official Meta Cloud API for business messaging',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">'
        +'<input class="modal-input conn-input" data-field="phoneNumberId" placeholder="Phone Number ID"/>'
        +'<input class="modal-input conn-input" data-field="accessToken" type="password" placeholder="Access Token"/>'
        +'<input class="modal-input conn-input" data-field="webhookVerifyToken" placeholder="Verify Token (optional)"/>'
        +'<input class="modal-input conn-input" data-field="appSecret" type="password" placeholder="App Secret (optional)"/>'
        +'</div>'
        +'<button class="btn-primary conn-save-btn" data-channel="whatsapp_cloud" style="font-size:12px;padding:7px 14px;">Connect WhatsApp Cloud</button>'
        ,(conns.whatsapp_cloud||{}).phone||'');

      var waBaileysConn=channelCard('WhatsApp (QR)','\u{1F4F1}','whatsapp_baileys','Free \u2014 scan QR code with your personal WhatsApp',
        '<button class="btn-primary conn-start-btn" data-channel="whatsapp_baileys" style="font-size:12px;padding:7px 14px;">Start QR Pairing</button>'
        +'<div style="font-size:10.5px;color:var(--faint);margin-top:6px;">Opens terminal QR. Use for personal/dev accounts only.</div>'
      );

      var gmailConn=channelCard('Gmail','\u{1F4E7}','gmail','Read emails, auto-create tasks from messages',
        '<button class="btn-primary conn-gmail-btn" style="font-size:12px;padding:7px 14px;">\u{1F517} Connect with Google</button>'
        +'<div style="font-size:10.5px;color:var(--faint);margin-top:6px;">Requires GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET in server .env</div>'
        ,(conns.gmail||{}).email||'');

      var calendarConn=channelCard('Google Calendar','\u{1F4C5}','calendar','Sync events and deadlines',
        '<div style="font-size:11px;color:var(--muted);">Coming soon \u2014 uses same Google OAuth as Gmail</div>'
      );

      var slackConn=channelCard('Slack','\u{1F4AC}','slack','Watch channels, capture messages as loops',
        '<div style="font-size:11px;color:var(--muted);">Set SLACK_BOT_TOKEN in .env to enable</div>'
      );

      var telegramConn=channelCard('Telegram','\u2708\uFE0F','telegram','Bot messages become tracked loops',
        '<div style="font-size:11px;color:var(--muted);">Set TELEGRAM_BOT_TOKEN in .env to enable</div>'
      );

      var githubConn=channelCard('GitHub','\u{1F419}','github','Issues, PRs, and commits as open loops',
        '<div style="font-size:11px;color:var(--muted);">Set GITHUB_TOKEN + GITHUB_WEBHOOK_SECRET in .env to enable</div>'
      );

      var html='<div class="sec-head"><div><div class="sec-title">Settings</div><div class="sec-sub">Integrations, autonomy, and personalisation.</div></div></div>';
      html+='<div style="padding:16px 18px;border-radius:14px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);display:flex;align-items:center;gap:12px;margin-bottom:20px;"><div style="flex:1;"><div style="font-size:14px;font-weight:700;color:var(--red);">Kill switch</div><div style="font-size:12px;color:var(--red);opacity:.7;margin-top:2px;">Pause ALL autonomous actions immediately.</div></div><button class="btn-danger" onclick="toast(\\'All autonomous actions paused.\\')">Pause all</button></div>';
      if(approvals.length){
        html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:8px;">PENDING APPROVALS ('+approvals.length+')</div>'
          +approvals.map(function(ap){return '<div class="gc" style="padding:12px 14px;border-radius:13px;display:flex;align-items:center;gap:10px;margin-bottom:7px;"><div style="flex:1;"><div style="font-size:13px;font-weight:600;">'+esc(ap.title)+'</div><div style="font-family:\\'JetBrains Mono\\',monospace;font-size:10.5px;color:var(--faint);margin-top:2px;">'+esc(ap.action)+'</div></div><button class="approve-btn ok" data-approve="'+ap.id+'">Approve</button><button class="approve-btn no" data-dismiss="'+ap.id+'" style="margin-left:5px;">Dismiss</button></div>';}).join('');
      }
      html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin:16px 0 8px;">AUTONOMY</div>'
        +ACTIONS.map(function(a){var cur=settings[a.k]||'off';return '<div class="gc auto-card" style="padding:14px 16px;border-radius:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><div style="flex:1;min-width:160px;"><div style="font-size:13.5px;font-weight:600;">'+a.label+'</div><div style="font-size:11.5px;color:var(--muted);margin-top:3px;">'+a.desc+'</div></div><div class="lvls">'+['off','ask','auto'].map(function(lv){return '<button class="lvl'+(lv===cur?' on':'')+'" data-act="'+a.k+'" data-lvl="'+lv+'">'+(lv.charAt(0).toUpperCase()+lv.slice(1))+'</button>';}).join('')+'</div></div>';}).join('');
      html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin:16px 0 8px;">INTEGRATIONS</div>'
        +waCloudConn+waBaileysConn+gmailConn+calendarConn+slackConn+telegramConn+githubConn;
      html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin:16px 0 8px;">APPEARANCE</div>'
        +'<div class="gc" style="padding:14px 16px;border-radius:14px;display:flex;align-items:center;gap:12px;margin-bottom:8px;"><div style="flex:1;"><div style="font-size:13.5px;font-weight:600;">Dark mode</div><div style="font-size:11.5px;color:var(--muted);margin-top:3px;">Switch between light and dark interface.</div></div><button class="btn-ghost" id="settings-dark-toggle">'+(darkMode?'Switch to light':'Switch to dark')+'</button></div>'
        +'<div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;">Wallpaper</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">'
        +THEMES.map(function(t){return '<div style="cursor:pointer;" onclick="applyTheme(\\''+t.id+'\\')"><div style="aspect-ratio:3/2;border-radius:10px;background:'+t.swatch+';border:2px solid '+(activeTheme===t.id?'var(--accent)':'transparent')+';transition:all .15s;"></div><div style="text-align:center;font-size:10px;color:var(--muted);margin-top:4px;">'+t.label+'</div></div>';}).join('')+'</div>';
      html+=adminUsersPanelHtml();
      view.innerHTML=html;

      // Bind settings handlers
      var std=document.getElementById('settings-dark-toggle');
      if(std)std.onclick=function(){applyDark(!darkMode);loadSettings();};
      view.querySelectorAll('.lvl').forEach(function(b){b.onclick=function(){post('/api/autonomy',{action:b.dataset.act,level:b.dataset.lvl},'PUT').then(function(){toast('Saved');loadSettings();});};});
      view.querySelectorAll('[data-approve]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.approve+'/approve').then(function(){toast('Approved');loadSettings();});};});
      view.querySelectorAll('[data-dismiss]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.dismiss+'/dismiss').then(function(){toast('Dismissed');loadSettings();});};});

      // WhatsApp Cloud \u2014 save credentials
      view.querySelectorAll('.conn-save-btn').forEach(function(btn){
        btn.onclick=function(){
          var channel=btn.dataset.channel;
          var card=btn.closest('.gc');
          var fields={};
          card.querySelectorAll('.conn-input').forEach(function(inp){
            if(inp.value.trim()) fields[inp.dataset.field]=inp.value.trim();
          });
          if(!fields.phoneNumberId||!fields.accessToken){toast('Phone Number ID and Access Token are required');return;}
          btn.disabled=true;btn.textContent='Connecting\u2026';
          post('/api/connections/'+channel,fields).then(function(){toast('WhatsApp Cloud connected!');loadSettings();}).catch(function(e){toast(e.message||'Failed');btn.disabled=false;btn.textContent='Connect WhatsApp Cloud';});
        };
      });

      // WhatsApp Baileys \u2014 start QR
      view.querySelectorAll('.conn-start-btn').forEach(function(btn){
        btn.onclick=function(){
          btn.disabled=true;btn.textContent='Starting\u2026';
          post('/api/connections/whatsapp_baileys/start',{}).then(function(r){
            toast(r.message||'QR pairing started \u2014 check server console');
            loadSettings();
          }).catch(function(e){toast(e.message||'Failed');btn.disabled=false;btn.textContent='Start QR Pairing';});
        };
      });

      // Gmail \u2014 OAuth
      view.querySelectorAll('.conn-gmail-btn').forEach(function(btn){
        btn.onclick=function(){
          btn.disabled=true;btn.textContent='Loading\u2026';
          api('/api/connections/gmail/auth-url').then(function(r){
            if(r.error){toast(r.error);btn.disabled=false;btn.textContent='\u{1F517} Connect with Google';return;}
            if(r.authUrl) window.location.href=r.authUrl;
            else{toast('Failed to get auth URL');btn.disabled=false;btn.textContent='\u{1F517} Connect with Google';}
          }).catch(function(e){toast(e.message||'Failed');btn.disabled=false;btn.textContent='\u{1F517} Connect with Google';});
        };
      });

      // Disconnect buttons
      view.querySelectorAll('.conn-disconnect-btn').forEach(function(btn){
        btn.onclick=function(){
          if(!confirm('Disconnect this integration?')) return;
          post('/api/connections/'+btn.dataset.channel+'/disconnect',{}).then(function(){toast('Disconnected');loadSettings();});
        };
      });

      bindAdminUserUi();
    });
  }

  function adminUsersPanelHtml(){
    var roles=['client','employee','manager','ceo','agent'];
    var roleOpts=roles.map(function(r){return '<option value="'+r+'">'+roleLabel(r)+'</option>';}).join('');
    var html='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;margin:18px 0 8px;">USER MANAGEMENT</div>';
    if(!me||me.role!=='ceo'){
      return html+'<div class="gc" style="padding:14px 16px;border-radius:14px;color:var(--muted);font-size:12.5px;">Only CEO/admin users can manage accounts.</div>';
    }
    return html+'<div class="gc" style="padding:14px 16px;border-radius:14px;margin-bottom:10px;">'
      +'<div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">Create user</div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">'
      +'<input class="modal-input" id="admin-new-name" placeholder="Full name" autocomplete="off"/>'
      +'<input class="modal-input" id="admin-new-email" placeholder="Email" autocomplete="off"/>'
      +'<input class="modal-input" id="admin-new-username" placeholder="Username optional" autocomplete="off"/>'
      +'<select class="modal-select" id="admin-new-role">'+roleOpts+'</select>'
      +'<input class="modal-input" id="admin-new-password" type="password" placeholder="Temporary password" autocomplete="new-password"/>'
      +'<button class="btn-primary" id="admin-create-user">Create</button>'
      +'</div><div id="admin-user-msg" style="font-size:12px;color:var(--muted);margin-top:8px;"></div></div>'
      +'<div class="gc" style="padding:14px 16px;border-radius:14px;"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;"><div style="font-size:13.5px;font-weight:700;">Users</div><button class="btn-ghost" id="admin-refresh-users">Refresh</button></div><div id="admin-users-list"><div class="spin"></div></div></div>';
  }

  function adminMsg(msg,isErr){
    var el=document.getElementById('admin-user-msg');
    if(!el) return;
    el.style.color=isErr?'var(--red)':'var(--muted)';
    el.textContent=msg||'';
  }
  function bindAdminUserUi(){
    if(!me||me.role!=='ceo') return;
    var create=document.getElementById('admin-create-user');
    var refresh=document.getElementById('admin-refresh-users');
    if(refresh) refresh.onclick=loadAdminUsers;
    if(create) create.onclick=function(){
      var body={
        name:(document.getElementById('admin-new-name').value||'').trim(),
        email:(document.getElementById('admin-new-email').value||'').trim(),
        username:(document.getElementById('admin-new-username').value||'').trim()||undefined,
        role:document.getElementById('admin-new-role').value,
        password:document.getElementById('admin-new-password').value||''
      };
      if(!body.name||!body.email||!body.password){adminMsg('Name, email, and password are required',true);return;}
      post('/api/admin/users',body).then(function(){
        adminMsg('User created',false);
        ['admin-new-name','admin-new-email','admin-new-username','admin-new-password'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
        loadAdminUsers();
      }).catch(function(e){adminMsg(e&&e.message?e.message:'Could not create user',true);});
    };
    loadAdminUsers();
  }
  function loadAdminUsers(){
    var box=document.getElementById('admin-users-list');
    if(!box) return;
    box.innerHTML='<div class="spin"></div>';
    api('/api/admin/users').then(function(users){
      box.innerHTML=renderAdminUsers(users||[]);
      bindAdminUserRows();
    }).catch(function(e){box.innerHTML='<div style="font-size:12px;color:var(--red);">'+esc(e&&e.message?e.message:'Could not load users')+'</div>';});
  }
  function renderAdminUsers(users){
    if(!users.length) return '<div style="font-size:12px;color:var(--muted);">No users yet.</div>';
    var roles=['client','employee','manager','ceo','agent'];
    return users.map(function(u){
      var roleOpts=roles.map(function(r){return '<option value="'+r+'" '+(u.role===r?'selected':'')+'>'+roleLabel(r)+'</option>';}).join('');
      return '<div class="admin-user-row" data-user-id="'+esc(u.userId)+'" style="border-top:1px solid var(--glassBorder);padding:12px 0;display:grid;grid-template-columns:minmax(180px,1fr) 140px 120px 1fr auto;gap:8px;align-items:center;">'
        +'<div><div style="font-size:13px;font-weight:700;">'+esc(u.name)+'</div><div style="font-size:11px;color:var(--muted);">'+esc(u.email||'')+(u.username?' \xB7 '+esc(u.username):'')+'</div></div>'
        +'<select class="modal-select admin-role" style="min-height:34px;">'+roleOpts+'</select>'
        +'<select class="modal-select admin-active" style="min-height:34px;"><option value="true" '+(u.active===false?'':'selected')+'>Active</option><option value="false" '+(u.active===false?'selected':'')+'>Disabled</option></select>'
        +'<div style="display:flex;gap:6px;"><input class="modal-input admin-password" type="password" placeholder="New password" autocomplete="new-password" style="min-height:34px;"/><button class="btn-ghost admin-set-password">Set</button></div>'
        +'<div style="display:flex;gap:6px;"><button class="btn-ghost admin-save-user">Save</button><button class="btn-danger admin-delete-user">Delete</button></div>'
        +'</div>';
    }).join('');
  }
  function bindAdminUserRows(){
    document.querySelectorAll('.admin-user-row').forEach(function(row){
      var uid=row.dataset.userId;
      var save=row.querySelector('.admin-save-user');
      var del=row.querySelector('.admin-delete-user');
      var setPw=row.querySelector('.admin-set-password');
      if(save) save.onclick=function(){
        var role=row.querySelector('.admin-role').value;
        var active=row.querySelector('.admin-active').value==='true';
        post('/api/admin/users/'+encodeURIComponent(uid),{role:role,active:active},'PATCH').then(function(){toast('User updated');loadAdminUsers();}).catch(function(e){toast(e&&e.message?e.message:'Could not update user');});
      };
      if(setPw) setPw.onclick=function(){
        var input=row.querySelector('.admin-password');
        var pw=input&&input.value||'';
        if(!pw){toast('Enter a new password');return;}
        post('/api/admin/users/'+encodeURIComponent(uid)+'/password',{password:pw}).then(function(){toast('Password reset');if(input)input.value='';}).catch(function(e){toast(e&&e.message?e.message:'Could not reset password');});
      };
      if(del) del.onclick=function(){
        if(!confirm('Delete this user? This cannot be undone.')) return;
        post('/api/admin/users/'+encodeURIComponent(uid),null,'DELETE').then(function(){toast('User deleted');loadAdminUsers();}).catch(function(e){toast(e&&e.message?e.message:'Could not delete user');});
      };
    });
  }

  // \u2500\u2500 boot \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  updateSessionUi();
  ensureSession().then(function(ok){
    if(ok) startApp();
  }).catch(function(e){
    showErr(e);
  });
  } catch(e) { showErr(e); }
})();
</script>
</body>
</html>`;
}

// packages/server/src/server.ts
init_middleware();
function buildServer(deps) {
  const { core, auth } = deps;
  const app2 = Fastify({
    logger: {
      level: process.env.COMPANYBRAIN_LOG_LEVEL ?? "info",
      ...process.env.NODE_ENV !== "production" && {
        transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } }
      }
    },
    bodyLimit: 10 * 1024 * 1024,
    // 10MB for image uploads
    trustProxy: true
  });
  const allowedOrigins = (process.env.COMPANYBRAIN_CORS_ORIGINS ?? "").split(",").filter(Boolean);
  app2.register(cors, {
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });
  app2.register(rateLimit, rateLimitConfig);
  const publicDir = join5(import.meta.dirname ?? process.cwd(), "public");
  if (existsSync2(publicDir)) {
    app2.register(fastifyStatic, {
      root: publicDir,
      prefix: "/",
      decorateReply: false
    });
  }
  const sseClients = /* @__PURE__ */ new Set();
  function broadcast(event) {
    const line = "data: " + JSON.stringify(event) + "\n\n";
    for (const res of sseClients) {
      try {
        res.write(line);
      } catch {
        sseClients.delete(res);
      }
    }
  }
  const llm = createLlm();
  const authWithSessions = auth;
  const authRequiresSession = typeof authWithSessions.login === "function";
  const authSupportsUserManagement = typeof authWithSessions.createUser === "function";
  const resolvedAuthMode = auth.mode ?? (authRequiresSession ? "key" : "local");
  const listUsers = async () => {
    if (typeof authWithSessions.listUsers === "function") {
      const users = await authWithSessions.listUsers();
      if (Array.isArray(users) && users.length) return users.map((u) => sanitizeUser(u));
    }
    const p = await auth.current();
    return [principalToUser(p)];
  };
  const getUserById = async (userId) => {
    if (typeof authWithSessions.getUser === "function") {
      const user = await authWithSessions.getUser(userId);
      if (user) return sanitizeUser(user);
    }
    const users = await listUsers();
    return users.find((u) => u.userId === userId) ?? null;
  };
  const userFromPrincipal = async (p) => {
    const known = await getUserById(p.userId);
    return known ?? principalToUser(p);
  };
  const principalOf = async (req) => {
    const p = req.principal;
    return p ?? auth.current();
  };
  const params = (req) => req.params;
  const query = (req) => req.query;
  app2.get("/health", async () => ({
    ok: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    uptime: process.uptime()
  }));
  app2.get("/metrics", async (_req, reply) => {
    const { renderMetrics: renderMetrics2 } = await Promise.resolve().then(() => (init_middleware(), middleware_exports));
    return reply.type("text/plain").send(renderMetrics2());
  });
  app2.addHook("preHandler", async (req, reply) => {
    const url = req.raw.url ?? "";
    if (!url.startsWith("/api/")) return;
    if (url.startsWith("/api/auth/")) return;
    if (!authRequiresSession) {
      req.principal = await auth.current();
      return;
    }
    const token = readAuthToken(req);
    const principal = await auth.authenticate(token);
    if (!principal) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    req.principal = principal;
  });
  app2.get("/api/auth/users", async () => {
    return { authMode: resolvedAuthMode, requiresAuth: authRequiresSession };
  });
  app2.get("/api/auth/me", async (req) => {
    if (!authRequiresSession) {
      const p = await auth.current();
      return { authMode: resolvedAuthMode, authenticated: true, user: presentUser(await userFromPrincipal(p)) };
    }
    const principal = await auth.authenticate(readAuthToken(req));
    if (!principal) return { authMode: resolvedAuthMode, authenticated: false };
    return { authMode: resolvedAuthMode, authenticated: true, user: presentUser(await userFromPrincipal(principal)) };
  });
  app2.post("/api/auth/login", {
    config: { rateLimit: authRateLimitConfig },
    preHandler: validateBody(validation_exports.LoginSchema)
  }, async (req, reply) => {
    if (!authRequiresSession || typeof authWithSessions.login !== "function") {
      const p = await auth.current();
      return { ok: true, authMode: resolvedAuthMode, authenticated: true, user: presentUser(await userFromPrincipal(p)) };
    }
    const body = req.validatedBody ?? (req.body ?? {});
    const userId = body.userId?.trim();
    const key = body.key?.trim();
    if (!userId || !key) {
      throw badRequest("userId and key are required");
    }
    const login = await authWithSessions.login(userId, key);
    if (!login) {
      logger.warn({ userId }, "Failed login attempt");
      return reply.code(401).send({ error: "Invalid email/username or password" });
    }
    logger.info({ userId: login.user.userId }, "Successful login");
    const maxAge = Math.max(60, Math.floor((login.expiresAt - Date.now()) / 1e3));
    reply.header("Set-Cookie", makeSessionCookie("cb_session", login.token, maxAge, shouldSecureCookie(req)));
    return { ok: true, authMode: resolvedAuthMode, authenticated: true, user: presentUser(login.user), expiresAt: login.expiresAt };
  });
  app2.post("/api/auth/logout", async (req, reply) => {
    if (authRequiresSession && typeof authWithSessions.logout === "function") {
      const token = readAuthToken(req);
      if (token) await authWithSessions.logout(token);
    }
    reply.header("Set-Cookie", clearSessionCookie("cb_session", shouldSecureCookie(req)));
    return { ok: true };
  });
  const requireUserManagement = () => {
    if (!authSupportsUserManagement) {
      const err = new Error("User management is only available in password auth mode");
      err.statusCode = 501;
      throw err;
    }
  };
  app2.get("/api/admin/users", {
    preHandler: requireMinRole("ceo")
  }, async () => {
    requireUserManagement();
    const users = await listUsers();
    return users.map(presentUser);
  });
  app2.post("/api/admin/users", {
    preHandler: [requireMinRole("ceo"), validateBody(validation_exports.CreateUserSchema)]
  }, async (req) => {
    requireUserManagement();
    const principal = await principalOf(req);
    const body = req.validatedBody;
    try {
      const user = await authWithSessions.createUser(body, principal.userId);
      return { ok: true, user: presentUser(user) };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : "Could not create user");
    }
  });
  app2.patch("/api/admin/users/:id", {
    preHandler: [requireMinRole("ceo"), validateBody(validation_exports.UpdateUserSchema)]
  }, async (req) => {
    requireUserManagement();
    const body = req.validatedBody;
    try {
      const user = await authWithSessions.updateUser(params(req).id, body);
      return { ok: true, user: presentUser(user) };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : "Could not update user");
    }
  });
  app2.post("/api/admin/users/:id/password", {
    preHandler: [requireMinRole("ceo"), validateBody(validation_exports.SetPasswordSchema)]
  }, async (req) => {
    requireUserManagement();
    const body = req.validatedBody;
    try {
      await authWithSessions.setPassword(params(req).id, body.password);
      return { ok: true };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : "Could not set password");
    }
  });
  app2.delete("/api/admin/users/:id", {
    preHandler: requireMinRole("ceo")
  }, async (req) => {
    requireUserManagement();
    try {
      await authWithSessions.deleteUser(params(req).id);
      return { ok: true };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : "Could not delete user");
    }
  });
  app2.get("/api/stream", async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    reply.raw.write(": connected\n\n");
    sseClients.add(reply.raw);
    const ping = setInterval(() => {
      try {
        reply.raw.write(": ping\n\n");
      } catch {
        clearInterval(ping);
      }
    }, 25e3);
    req.raw.once("close", () => {
      clearInterval(ping);
      sseClients.delete(reply.raw);
    });
    await new Promise((resolve) => req.raw.once("close", resolve));
  });
  app2.get("/api/me", async (req) => {
    const p = await principalOf(req);
    return presentUser(await userFromPrincipal(p));
  });
  app2.get("/api/loops", async (req) => {
    const p = await principalOf(req);
    const side = req.query.side;
    return core.loops.list(p.orgId, side);
  });
  app2.post("/api/loops", {
    preHandler: validateBody(validation_exports.CreateLoopSchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    const result = await core.loops.capture({
      orgId: p.orgId,
      actorId: p.userId,
      title: b.title,
      why: b.why ?? "",
      side: b.side ?? "yours",
      channel: b.channel ?? "manual"
    });
    broadcast({ type: "loop.created", orgId: p.orgId });
    return result;
  });
  app2.post("/api/loops/:id/close", async (req) => {
    const p = await principalOf(req);
    const result = await core.loops.close(params(req).id, p.userId);
    broadcast({ type: "loop.closed" });
    return result;
  });
  app2.post("/api/loops/:id/snooze", {
    preHandler: validateBody(validation_exports.SnoozeLoopSchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    const untilAt = Date.now() + Math.max(1, b.hours ?? 24) * 60 * 60 * 1e3;
    const result = await core.loops.snooze(params(req).id, p.userId, untilAt);
    broadcast({ type: "loop.snoozed" });
    return result;
  });
  app2.post("/api/loops/:id/assign", {
    preHandler: validateBody(validation_exports.AssignSchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    const loop = await core.ctx.db.loops.get(params(req).id);
    if (!loop) throw badRequest("loop not found");
    return core.ctx.db.loops.update(loop.id, { assignedTo: b.userIds ?? [p.userId] });
  });
  app2.get("/api/tasks", async (req) => core.tasks.list((await principalOf(req)).orgId));
  app2.post("/api/tasks", {
    preHandler: validateBody(validation_exports.CreateTaskSchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    const result = await core.tasks.create({ orgId: p.orgId, actorId: p.userId, ...b });
    broadcast({ type: "task.created" });
    return result;
  });
  app2.post("/api/tasks/:id/complete", async (req) => {
    const result = await core.tasks.complete(params(req).id, (await principalOf(req)).userId);
    broadcast({ type: "task.completed" });
    return result;
  });
  app2.post("/api/tasks/:id/move", {
    preHandler: validateBody(validation_exports.MoveTaskSchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    const result = await core.tasks.move(params(req).id, b.day ?? "today", p.userId);
    broadcast({ type: "task.moved" });
    return result;
  });
  app2.post("/api/tasks/:id/assign", {
    preHandler: validateBody(validation_exports.AssignSchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    const task = await core.ctx.db.tasks.get(params(req).id);
    if (!task) throw badRequest("task not found");
    return core.ctx.db.tasks.update(task.id, { assignees: b.userIds ?? [p.userId] });
  });
  app2.post("/api/tasks/:id/time/start", async (req) => {
    const p = await principalOf(req);
    const taskId = params(req).id;
    const entry = await core.timeTracking.start({ orgId: p.orgId, taskId, userId: p.userId });
    broadcast({ type: "time.started" });
    return entry;
  });
  app2.post("/api/time/:entryId/stop", async (req) => {
    const entryId = req.params.entryId;
    const entry = await core.timeTracking.stop(entryId);
    broadcast({ type: "time.stopped" });
    return entry;
  });
  app2.get("/api/tasks/:id/time", async (req) => {
    const taskId = params(req).id;
    const entries = await core.timeTracking.listByTask(taskId);
    const total = await core.timeTracking.getTotalTime(taskId);
    const active = await core.timeTracking.getActive(taskId);
    return { entries, total, active };
  });
  app2.get("/api/time/today", async (req) => {
    const p = await principalOf(req);
    const total = await core.timeTracking.getTodayTime(p.userId, p.orgId);
    return { total, formatted: core.timeTracking.formatDuration(total) };
  });
  app2.get("/api/leads", async (req) => core.leads.list((await principalOf(req)).orgId));
  app2.post("/api/leads", {
    preHandler: validateBody(validation_exports.CreateLeadSchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    const result = await core.leads.create({ orgId: p.orgId, actorId: p.userId, ...b });
    broadcast({ type: "lead.created" });
    return result;
  });
  app2.post("/api/leads/:id/advance", async (req) => {
    const result = await core.leads.advance(params(req).id, (await principalOf(req)).userId);
    broadcast({ type: "lead.advanced" });
    return result;
  });
  app2.put("/api/leads/:id/stage", {
    preHandler: validateBody(validation_exports.SetLeadStageSchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    const result = await core.leads.setStage(params(req).id, b.stage, p.userId);
    broadcast({ type: "lead.advanced" });
    return result;
  });
  app2.post("/api/leads/:id/assign", {
    preHandler: validateBody(validation_exports.AssignSchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    const lead = await core.ctx.db.leads.get(params(req).id);
    if (!lead) throw badRequest("lead not found");
    return core.ctx.db.leads.update(lead.id, { assignedTo: b.userIds ?? [p.userId] });
  });
  app2.post("/api/leads/quick-add", {
    preHandler: validateBody(validation_exports.QuickAddLeadSchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    const result = await core.leads.quickAddFromNote(
      { orgId: p.orgId, actorId: p.userId, phone: b.phone ?? "", note: b.note },
      llm?.extractLead
    );
    broadcast({ type: "lead.created" });
    return result;
  });
  app2.post("/api/leads/extract-card", {
    preHandler: validateBody(validation_exports.ExtractCardSchema)
  }, async (req) => {
    const b = req.validatedBody;
    if (llm && b.text) {
      const extracted = await llm.extractLead(b.text);
      return extracted;
    }
    if (b.imageBase64 && process.env.ANTHROPIC_API_KEY) {
      const { Anthropic: Anthropic2 } = await import("@anthropic-ai/sdk");
      const client = new Anthropic2({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.imageBase64 } },
            { type: "text", text: 'Extract the contact info from this business card. Reply with JSON only: { "name": "", "title": "", "company": "", "email": "", "phone": "" }' }
          ]
        }]
      });
      try {
        const text = msg.content[0].text;
        const json = text.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
        return JSON.parse(json);
      } catch {
        return {};
      }
    }
    return { name: "", title: "", company: "", email: "", phone: "" };
  });
  app2.post("/api/bulk/loops/close", async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body;
    if (!ids?.length) throw badRequest("ids required");
    return core.bulk.closeLoops(ids, p.userId);
  });
  app2.post("/api/bulk/loops/snooze", async (req) => {
    const p = await principalOf(req);
    const { ids, hours } = req.body;
    if (!ids?.length) throw badRequest("ids required");
    return core.bulk.snoozeLoops(ids, hours ?? 24, p.userId);
  });
  app2.post("/api/bulk/tasks/move", async (req) => {
    const p = await principalOf(req);
    const { ids, day } = req.body;
    if (!ids?.length) throw badRequest("ids required");
    return core.bulk.moveTasks(ids, day, p.userId);
  });
  app2.post("/api/bulk/tasks/complete", async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body;
    if (!ids?.length) throw badRequest("ids required");
    return core.bulk.completeTasks(ids, p.userId);
  });
  app2.post("/api/bulk/tasks/delete", async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body;
    if (!ids?.length) throw badRequest("ids required");
    return core.bulk.deleteTasks(ids, p.userId);
  });
  app2.post("/api/bulk/leads/advance", async (req) => {
    const p = await principalOf(req);
    const { ids } = req.body;
    if (!ids?.length) throw badRequest("ids required");
    return core.bulk.advanceLeads(ids, p.userId);
  });
  app2.post("/api/bulk/assign", async (req) => {
    const p = await principalOf(req);
    const { entityType, ids, userIds } = req.body;
    if (!ids?.length || !entityType) throw badRequest("ids and entityType required");
    return core.bulk.assignMany(entityType, ids, userIds ?? [p.userId], p.userId);
  });
  app2.post("/api/bulk/delete", async (req) => {
    const p = await principalOf(req);
    const { entityType, ids } = req.body;
    if (!ids?.length || !entityType) throw badRequest("ids and entityType required");
    return core.bulk.deleteMany(entityType, ids, p.userId);
  });
  app2.post("/api/recurring/process", async (req) => {
    const p = await principalOf(req);
    const result = await core.recurring.processDaily(p.orgId);
    logger.info(result, "Recurring tasks processed");
    return result;
  });
  app2.get("/api/recurring/next/:recur", async (req) => {
    const recur = req.params.recur;
    const next = core.recurring.getNextRun(recur);
    return { next: next.toISOString(), formatted: core.recurring.formatSchedule(recur) };
  });
  app2.post("/api/tasks/:id/subtasks", async (req) => {
    const taskId = params(req).id;
    const { title } = req.body;
    if (!title) throw badRequest("title required");
    return core.subtasks.add(taskId, title);
  });
  app2.post("/api/tasks/:id/subtasks/:subId/complete", async (req) => {
    const taskId = params(req).id;
    const subId = req.params.subId;
    await core.subtasks.complete(taskId, subId);
    return { ok: true };
  });
  app2.post("/api/tasks/:id/subtasks/:subId/toggle", async (req) => {
    const taskId = params(req).id;
    const subId = req.params.subId;
    await core.subtasks.toggle(taskId, subId);
    return { ok: true };
  });
  app2.delete("/api/tasks/:id/subtasks/:subId", async (req) => {
    const taskId = params(req).id;
    const subId = req.params.subId;
    await core.subtasks.remove(taskId, subId);
    return { ok: true };
  });
  app2.get("/api/tasks/:id/subtasks", async (req) => {
    const taskId = params(req).id;
    return core.subtasks.list(taskId);
  });
  app2.get("/api/agents", async () => core.agents.roster());
  app2.get("/api/events", async (req) => {
    const p = await principalOf(req);
    const q = query(req);
    const events = await core.events.list(p.orgId, 200);
    if (q.entityId) return events.filter((e) => e.entityId === q.entityId);
    return events.slice(0, 50);
  });
  app2.post("/api/events/:id/undo", async (req) => {
    await principalOf(req);
    return core.events.undo(params(req).id);
  });
  app2.get("/api/connections", async (req) => {
    const p = await principalOf(req);
    const conns = await core.ctx.db.connections.list(p.orgId);
    const env = process.env;
    const has = (...keys) => keys.every((k) => !!env[k]);
    const byChannel = new Map(conns.map((c) => [c.channel, c]));
    return {
      ai: { configured: !!llm, via: llm ? "anthropic" : null },
      whatsapp_cloud: {
        status: byChannel.get("whatsapp_cloud")?.status ?? (has("WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN") ? "connected" : "disconnected"),
        method: has("WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN") ? "cloud-api" : "not configured",
        phone: env.WHATSAPP_PHONE_NUMBER_ID ? `+${env.WHATSAPP_PHONE_NUMBER_ID}` : ""
      },
      whatsapp_baileys: {
        status: byChannel.get("whatsapp_baileys")?.status ?? (env.WHATSAPP_BAILEYS === "on" ? "connecting" : "disconnected"),
        method: env.WHATSAPP_BAILEYS === "on" ? "baileys-qr" : "not configured"
      },
      gmail: {
        status: byChannel.get("gmail")?.status ?? "disconnected",
        email: byChannel.get("gmail")?.credentials?.email ?? ""
      },
      slack: {
        status: byChannel.get("slack")?.status ?? (has("SLACK_BOT_TOKEN") ? "connected" : "disconnected")
      },
      telegram: {
        status: byChannel.get("telegram")?.status ?? (has("TELEGRAM_BOT_TOKEN") ? "connected" : "disconnected")
      },
      github: {
        status: byChannel.get("github")?.status ?? (has("GITHUB_TOKEN") ? "connected" : "disconnected")
      },
      calendar: {
        status: byChannel.get("calendar")?.status ?? "disconnected"
      }
    };
  });
  app2.post("/api/connections/whatsapp_cloud", {
    preHandler: requireMinRole("ceo")
  }, async (req) => {
    const p = await principalOf(req);
    const body = req.body;
    if (!body.phoneNumberId || !body.accessToken) {
      return { error: "phone_number_id and access_token are required" };
    }
    const conn = await core.ctx.db.connections.upsert(p.orgId, "whatsapp_cloud", {
      status: "connected",
      credentials: {
        phoneNumberId: body.phoneNumberId,
        accessToken: body.accessToken,
        webhookVerifyToken: body.webhookVerifyToken ?? "",
        appSecret: body.appSecret ?? ""
      }
    });
    broadcast({ type: "connections.changed" });
    return { ok: true, connection: conn };
  });
  app2.post("/api/connections/whatsapp_baileys/start", {
    preHandler: requireMinRole("ceo")
  }, async (req) => {
    const p = await principalOf(req);
    await core.ctx.db.connections.upsert(p.orgId, "whatsapp_baileys", {
      status: "connecting",
      credentials: {}
    });
    broadcast({ type: "connections.changed" });
    return { ok: true, message: "QR code will appear in server console. Scan with WhatsApp." };
  });
  app2.get("/api/connections/gmail/auth-url", {
    preHandler: requireMinRole("ceo")
  }, async (req, reply) => {
    const p = await principalOf(req);
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectBase = process.env.GMAIL_REDIRECT_URI || `${req.headers.origin || "http://localhost:4317"}/api/connections/gmail/callback`;
    if (!clientId || !clientSecret) {
      return reply.code(503).send({ error: "Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env" });
    }
    const params2 = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectBase,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify",
      access_type: "offline",
      prompt: "consent"
    });
    await core.ctx.db.connections.upsert(p.orgId, "gmail", {
      status: "connecting",
      credentials: { redirectUri: redirectBase }
    });
    return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params2.toString()}` };
  });
  app2.get("/api/connections/gmail/callback", async (req, reply) => {
    const { code } = req.query;
    if (!code) {
      return reply.redirect("/?error=gmail_no_code");
    }
    try {
      const clientId = process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET;
      const redirectBase = process.env.GMAIL_REDIRECT_URI || `http://localhost:4317/api/connections/gmail/callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectBase,
          grant_type: "authorization_code"
        })
      });
      const tokens = await tokenRes.json();
      if (!tokens.access_token) {
        return reply.redirect("/?error=gmail_token_failed");
      }
      const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const profile = await profileRes.json();
      await core.ctx.db.connections.upsert(LOCAL_ORG_ID, "gmail", {
        status: "connected",
        credentials: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? "",
          expiresIn: tokens.expires_in,
          email: profile.emailAddress ?? ""
        }
      });
      broadcast({ type: "connections.changed" });
      return reply.redirect("/?connected=gmail");
    } catch (err) {
      logger.error({ err }, "Gmail OAuth callback failed");
      return reply.redirect("/?error=gmail_callback_failed");
    }
  });
  app2.post("/api/connections/:channel/disconnect", {
    preHandler: requireMinRole("ceo")
  }, async (req) => {
    const p = await principalOf(req);
    const { channel } = req.params;
    await core.ctx.db.connections.upsert(p.orgId, channel, {
      status: "disconnected",
      credentials: {}
    });
    broadcast({ type: "connections.changed" });
    return { ok: true };
  });
  app2.get("/api/autonomy", async (req) => core.autonomy.get((await principalOf(req)).orgId));
  app2.put("/api/autonomy", {
    preHandler: validateBody(validation_exports.AutonomySchema)
  }, async (req) => {
    const p = await principalOf(req);
    const b = req.validatedBody;
    return core.autonomy.set(p.orgId, b.action, b.level);
  });
  app2.get("/api/approvals", async (req) => core.approvals.list((await principalOf(req)).orgId, "pending"));
  app2.post("/api/approvals/:id/approve", async (req) => {
    await principalOf(req);
    const r = await core.approvals.approve(params(req).id);
    broadcast({ type: "agent.action" });
    return r;
  });
  app2.post("/api/approvals/:id/dismiss", async (req) => {
    await principalOf(req);
    const r = await core.approvals.dismiss(params(req).id);
    broadcast({ type: "agent.action" });
    return r;
  });
  const wa2 = cloud_api_exports.whatsappConfigFromEnv();
  app2.get("/webhooks/whatsapp", async (req, reply) => {
    if (!wa2) return reply.code(503).send("whatsapp not configured");
    const challenge = cloud_api_exports.verifyWebhook(wa2, req.query);
    if (challenge === null) return reply.code(403).send("forbidden");
    return reply.type("text/plain").send(challenge);
  });
  app2.post("/webhooks/whatsapp", {
    config: { rateLimit: webhookRateLimitConfig },
    preHandler: whatsappSignatureVerify()
  }, async (req, reply) => {
    const messages = cloud_api_exports.parseInbound(LOCAL_ORG_ID, req.body);
    for (const m of messages) await ingest(core, m);
    if (messages.length) {
      logger.info({ count: messages.length }, "WhatsApp messages processed");
      broadcast({ type: "loop.created" });
    }
    return reply.code(200).send("ok");
  });
  const FANIN_CHANNELS = ["email", "slack", "telegram", "github", "calendar"];
  app2.post("/webhooks/:channel", {
    config: { rateLimit: webhookRateLimitConfig },
    preHandler: validateBody(validation_exports.WebhookFanInSchema)
  }, async (req, reply) => {
    const channel = req.params.channel;
    if (!FANIN_CHANNELS.includes(channel)) {
      return reply.code(404).send("unknown channel");
    }
    const b = req.validatedBody;
    const loopId = await ingest(core, {
      orgId: LOCAL_ORG_ID,
      channel,
      from: b.from ?? "unknown",
      text: b.text,
      ref: b.ref
    });
    logger.info({ channel, from: b.from }, "Webhook received");
    broadcast({ type: "loop.created" });
    return reply.send({ captured: loopId });
  });
  const pushSubscriptions = /* @__PURE__ */ new Map();
  app2.post("/api/notifications/subscribe", async (req) => {
    const { subscription } = req.body;
    const p = await principalOf(req);
    pushSubscriptions.set(p.userId, subscription);
    return { ok: true };
  });
  app2.post("/api/notifications/unsubscribe", async (req) => {
    const p = await principalOf(req);
    pushSubscriptions.delete(p.userId);
    return { ok: true };
  });
  app2.get("/api/notifications/status", async (req) => {
    const p = await principalOf(req);
    return { subscribed: pushSubscriptions.has(p.userId) };
  });
  app2.get("/api/export/loops", async (req, reply) => {
    const p = await principalOf(req);
    const loops = await core.loops.list(p.orgId);
    const format = req.query?.format || "json";
    if (format === "csv") {
      const csv = loopsToCsv(loops);
      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", 'attachment; filename="loops.csv"');
      return csv;
    }
    return loops;
  });
  app2.get("/api/export/tasks", async (req, reply) => {
    const p = await principalOf(req);
    const tasks = await core.tasks.list(p.orgId);
    const format = req.query?.format || "json";
    if (format === "csv") {
      const csv = tasksToCsv(tasks);
      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", 'attachment; filename="tasks.csv"');
      return csv;
    }
    return tasks;
  });
  app2.get("/api/export/leads", async (req, reply) => {
    const p = await principalOf(req);
    const leads = await core.leads.list(p.orgId);
    const format = req.query?.format || "json";
    if (format === "csv") {
      const csv = leadsToCsv(leads);
      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", 'attachment; filename="leads.csv"');
      return csv;
    }
    return leads;
  });
  app2.get("/api/ai/suggestions/:entityType/:entityId", async (req) => {
    const { entityType, entityId } = req.params;
    return core.ai.getSuggestions(entityType, entityId);
  });
  app2.post("/api/ai/assign/:taskId", async (req) => {
    const taskId = req.params.taskId;
    const assignee = await core.ai.autoAssign(taskId);
    return { assignee };
  });
  app2.get("/api/ai/patterns", async (req) => {
    const p = await principalOf(req);
    return core.ai.getPatterns(p.orgId);
  });
  app2.post("/api/ai/suggestions/:id/dismiss", async (req) => {
    const id = req.params.id;
    await core.ai.dismiss(id);
    return { ok: true };
  });
  app2.get("/api/dashboard", async (req) => {
    const p = await principalOf(req);
    const [loops, tasks, leads] = await Promise.all([
      core.loops.list(p.orgId),
      core.tasks.list(p.orgId),
      core.leads.list(p.orgId)
    ]);
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const todayTasks = tasks.filter((t) => t.day === "today");
    const openLoops = loops.filter((l) => l.status === "open");
    const completedTasks = tasks.filter((t) => t.subtasks?.every((s) => s.done));
    return {
      loops: {
        total: loops.length,
        open: openLoops.length,
        closed: loops.filter((l) => l.status === "closed").length,
        snoozed: loops.filter((l) => l.status === "snoozed").length
      },
      tasks: {
        total: tasks.length,
        today: todayTasks.length,
        completedToday: completedTasks.length,
        overdue: tasks.filter((t) => t.dueAt && t.dueAt < Date.now() && t.subtasks?.some((s) => !s.done)).length
      },
      leads: {
        total: leads.length,
        won: leads.filter((l) => l.stage === "won").length,
        lost: leads.filter((l) => l.stage === "lost").length,
        pipeline: leads.filter((l) => !["won", "lost"].includes(l.stage)).length
      },
      today
    };
  });
  app2.get("/api/methods", async () => ({ methods: methods_exports.METHOD_LIST }));
  app2.get("/api/methods/:methodId", async (req) => {
    const p = await principalOf(req);
    const { methodId } = req.params;
    const entry = methods_exports.METHODS[methodId];
    if (!entry) return { error: "Unknown method" };
    const tasks = await core.tasks.list(p.orgId);
    const result = entry.run(tasks);
    return { result, meta: entry.meta };
  });
  app2.get("/api/reports", async (req) => {
    const p = await principalOf(req);
    const days = Math.min(365, Math.max(1, Number(req.query?.days ?? 30)));
    const [loops, tasks, leads] = await Promise.all([
      core.loops.list(p.orgId),
      core.tasks.list(p.orgId),
      core.leads.list(p.orgId)
    ]);
    let timeEntries = [];
    try {
      timeEntries = await core.ctx.db.timeEntries.listByUser(p.userId, p.orgId);
    } catch {
    }
    return analytics_exports.computeReport({ loops, tasks, leads, timeEntries, windowDays: days });
  });
  app2.get("/api/team/performance", { preHandler: requireMinRole("manager") }, async (req) => {
    const p = await principalOf(req);
    const tasks = await core.tasks.list(p.orgId);
    const loops = await core.loops.list(p.orgId);
    const userStats = /* @__PURE__ */ new Map();
    const ensure = (uid) => {
      if (!userStats.has(uid)) userStats.set(uid, { userId: uid, tasksDone: 0, loopsClosed: 0, focusMinutes: 0, points: 0 });
      return userStats.get(uid);
    };
    for (const t of tasks) {
      const done = t.subtasks && t.subtasks.length > 0 && t.subtasks.every((s) => s.done);
      for (const uid of t.assignees || []) {
        const s = ensure(uid);
        if (done) {
          s.tasksDone++;
          s.points += 3;
        }
      }
    }
    for (const l of loops) {
      if (l.status === "closed") {
        for (const uid of l.assignedTo || []) {
          const s = ensure(uid);
          s.loopsClosed++;
          s.points += 2;
        }
      }
    }
    const rows = Array.from(userStats.values());
    for (const r of rows) {
      try {
        const u = await auth.getUser?.(r.userId);
        r.name = u?.name ?? r.userId;
        r.role = u?.role ?? "employee";
      } catch {
        r.name = r.userId;
        r.role = "employee";
      }
    }
    return rows.sort((a, b) => b.points - a.points);
  });
  app2.post("/api/input/voice", async (req) => {
    const p = await principalOf(req);
    const body = req.body;
    if (!body.audio) return { error: "No audio provided" };
    const buf = Buffer.from(body.audio, "base64");
    const text = await input_exports.transcribeAudio(buf, body.mimeType);
    const taskTitles = input_exports.parseTasksFromTranscript(text);
    const created = [];
    for (const title of taskTitles.slice(0, 5)) {
      created.push(await core.tasks.create({ orgId: p.orgId, actorId: p.userId, title, day: "today" }));
    }
    return { text, taskTitles, created };
  });
  app2.post("/api/input/calendar-import", async (req) => {
    const p = await principalOf(req);
    const body = req.body;
    const icsText = body.ics ?? (body.url ? await input_exports.downloadIcsFromUrl(body.url) : "");
    if (!icsText) return { error: "No .ics content or URL provided" };
    const events = input_exports.parseIcs(icsText);
    const taskShapes = input_exports.icsToTasks(events, p.orgId, p.userId);
    const created = [];
    for (const t of taskShapes) {
      created.push(await core.tasks.create({ orgId: p.orgId, actorId: p.userId, title: t.title ?? "Imported event", day: t.day ?? "upcoming", dueAt: t.dueAt ?? void 0 }));
    }
    return { eventsFound: events.length, created };
  });
  app2.post("/api/input/attachments", async (req) => {
    const p = await principalOf(req);
    const body = req.body;
    if (!body.taskId || !body.filename || !body.data) return { error: "taskId, filename, and data are required" };
    const buf = Buffer.from(body.data, "base64");
    const record2 = await input_exports.saveAttachment({ taskId: body.taskId, filename: body.filename, mimeType: body.mimeType ?? "application/octet-stream", data: buf, orgId: p.orgId });
    return { ok: true, attachment: record2 };
  });
  app2.get("/api/input/attachments/:taskId", async (req) => {
    const { taskId } = req.params;
    return { attachments: await input_exports.listAttachments(taskId) };
  });
  app2.delete("/api/input/attachments/:orgId/:attachmentId", async (req) => {
    const { orgId, attachmentId } = req.params;
    await input_exports.deleteAttachment(orgId, attachmentId);
    return { ok: true };
  });
  app2.get("/", async (_req, reply) => reply.type("text/html").send(renderUi()));
  app2.setErrorHandler(function(error, request, reply) {
    const statusCode = error.statusCode ?? 500;
    const message = statusCode === 500 ? "Internal server error" : error.message;
    if (statusCode >= 500) {
      logger.error({ err: error, req: request }, "Unhandled error");
    } else {
      logger.warn({ err: error, req: request }, "Request error");
    }
    return reply.code(statusCode).send({
      error: message,
      ...statusCode !== 500 && error.details && { details: error.details }
    });
  });
  return app2;
}
function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}
function sanitizeUser(user) {
  const name = (user.name ?? "").trim() || user.userId;
  const initials = (user.initials ?? initialsFor2(name)).trim().slice(0, 3).toUpperCase();
  return {
    userId: user.userId,
    orgId: user.orgId,
    role: user.role,
    name,
    email: user.email?.trim() || void 0,
    username: user.username?.trim() || void 0,
    active: user.active,
    createdAt: user.createdAt,
    initials
  };
}
function presentUser(user) {
  const safe = sanitizeUser(user);
  return {
    userId: safe.userId,
    orgId: safe.orgId,
    role: safe.role,
    name: safe.name,
    email: safe.email,
    username: safe.username,
    active: safe.active,
    createdAt: safe.createdAt,
    initials: safe.initials
  };
}
function principalToUser(principal) {
  const name = principal.userId.replace(/^user[_-]?/i, "").replace(/[_-]+/g, " ").trim() || principal.userId;
  return {
    userId: principal.userId,
    orgId: principal.orgId,
    role: principal.role,
    name,
    initials: initialsFor2(name),
    email: void 0
  };
}
function initialsFor2(name) {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "US";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}
function readAuthToken(req) {
  const cookieToken = readCookie(req.headers.cookie, "cb_session");
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (!authHeader) return void 0;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim();
}
function readCookie(cookieHeader, name) {
  if (!cookieHeader) return void 0;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const k = pair.slice(0, idx).trim();
    if (k !== name) continue;
    const raw = pair.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return void 0;
}
function shouldSecureCookie(req) {
  const forced = (process.env.COMPANYBRAIN_SECURE_COOKIE ?? "").trim().toLowerCase();
  if (forced === "1" || forced === "true" || forced === "yes") return true;
  if (forced === "0" || forced === "false" || forced === "no") return false;
  const fwd = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(fwd) ? fwd.join(",") : String(fwd ?? "");
  if (proto) {
    const values = proto.split(",").map((v) => v.trim().toLowerCase());
    if (values.includes("https")) return true;
  }
  return (req.protocol ?? "").toLowerCase() === "https";
}
function makeSessionCookie(name, token, maxAgeSeconds, secure) {
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
function clearSessionCookie(name, secure) {
  const parts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
function escapeCsvField(val) {
  if (val === null || val === val === void 0) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function arrayToCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\n");
}
function loopsToCsv(loops) {
  const headers = ["id", "channel", "from", "subject", "body", "status", "assignee", "createdAt"];
  const rows = loops.map((l) => [
    l.id,
    l.channel,
    l.from,
    l.subject,
    l.body,
    l.status,
    l.assignee,
    l.createdAt
  ]);
  return arrayToCsv(headers, rows);
}
function tasksToCsv(tasks) {
  const headers = ["id", "title", "list", "day", "priority", "recurring", "dueAt", "assignees", "completed"];
  const rows = tasks.map((t) => [
    t.id,
    t.title,
    t.list,
    t.day,
    t.priority,
    t.recurring ? "yes" : "no",
    t.dueAt ? new Date(t.dueAt).toISOString() : "",
    (t.assignees ?? []).join("; "),
    (t.subtasks ?? []).every((s) => s.done) ? "yes" : "no"
  ]);
  return arrayToCsv(headers, rows);
}
function leadsToCsv(leads) {
  const headers = ["id", "name", "company", "title", "stage", "value", "notes", "createdAt"];
  const rows = leads.map((l) => [
    l.id,
    l.name,
    l.company,
    l.title,
    l.stage,
    l.value,
    l.notes,
    l.createdAt
  ]);
  return arrayToCsv(headers, rows);
}

// cli/bin/companybrain.ts
var port = Number(process.env.COMPANYBRAIN_PORT ?? process.env.PORT ?? 4317);
var host = process.env.COMPANYBRAIN_HOST ?? "0.0.0.0";
var baileys = process.env.WHATSAPP_BAILEYS === "on" ? createBaileysChannel({ orgId: "org_local" }) : null;
var wa = cloud_api_exports.whatsappConfigFromEnv();
var messenger = baileys ? baileys.messenger : createMessenger({ whatsapp: wa ?? void 0 });
var drafter = createLlm() ?? void 0;
var boot = await bootstrap({ messenger, drafter });
await seedIfEmpty(boot.core);
await boot.startWorkers();
await boot.queue.schedule("sendBriefing", { orgId: "org_local" }, 6 * 60 * 60 * 1e3);
if (baileys) await baileys.start(boot.core);
var app = buildServer({ core: boot.core, auth: boot.auth });
await app.listen({ port, host });
var shown = host === "0.0.0.0" ? `http://localhost:${port}` : `http://${host}:${port}`;
var authMode = (boot.auth.mode ?? "local").toUpperCase();
console.log(`
  company\x1B[1mbrain\x1B[0m  \xB7  running

  \u25B8 ${shown}
  \u25B8 data:  ~/.companybrain/companybrain.sqlite
  \u25B8 auth: ${authMode}${authMode === "KEY" ? " (session login enabled)" : " (single-user local mode)"}
  \u25B8 single app: SQLite + in-process worker + API + web, no external services

  Ctrl-C to stop.
`);
if (!process.env.COMPANYBRAIN_NO_OPEN) openBrowser(`http://localhost:${port}`);
function openBrowser(target) {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [target], { stdio: "ignore", detached: true, shell: platform() === "win32" }).unref();
  } catch {
  }
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await app.close();
    await boot.shutdown();
    process.exit(0);
  });
}
