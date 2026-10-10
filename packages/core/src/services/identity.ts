// Auth (sessions, API keys, first-run setup), members, API key management, org settings.

import { randomBytes } from 'node:crypto';
import {
  AppError,
  type Actor,
  type AgentProvider,
  type ApiKey,
  type ApiKeyService,
  type ApiScope,
  type AuthService,
  type CreateMemberInput,
  type Member,
  type MemberPrefs,
  type MemberService,
  type OrgService,
  type OrgSettings,
  type Role,
  type UpdateMemberInput,
} from '@companybrain/types';
import { colorFor, defaultPrefs, initialsFor, newId, randomBase62, sha256Hex, systemTimezone } from '@companybrain/db';
import { audit, getOrg, publish, type Ctx } from '../context.js';
import { hashPassword, verifyPassword } from '../password.js';
import { forbidden, isAdmin, isManager, isSystem, notFound, rank, requireRole, requireWrite } from '../perms.js';
import * as v from '../validate.js';

export const SESSION_TTL_MS = 30 * 86_400_000;
const TOUCH_EVERY_MS = 60_000;
const ROLES: Role[] = ['owner', 'admin', 'manager', 'member', 'guest', 'agent'];
const PROVIDERS: AgentProvider[] = ['claude', 'chatgpt', 'gemini', 'cursor', 'copilot', 'n8n', 'custom'];
const KEY_PREFIX = 'cb_live_';

function actorFor(m: Member, via: Actor['via'], scopes?: ApiScope[]): Actor {
  return { orgId: m.orgId, memberId: m.id, role: m.role, kind: m.kind, via, ...(scopes ? { scopes } : {}) };
}

// ─── auth ────────────────────────────────────────────────────────────────────

export function createAuthService(ctx: Ctx): AuthService {
  const { db } = ctx;

  function newSession(m: Member, meta: { ip: string; userAgent: string }) {
    const token = randomBytes(32).toString('base64url');
    const now = ctx.clock();
    const expiresAt = now + SESSION_TTL_MS;
    db.sessions.insert({
      id: newId('ses'),
      orgId: m.orgId,
      memberId: m.id,
      tokenHash: sha256Hex(token),
      createdAt: now,
      expiresAt,
      lastUsedAt: now,
      ip: (meta.ip ?? '').slice(0, 64) || null,
      userAgent: (meta.userAgent ?? '').slice(0, 300) || null,
    });
    return { token, member: m, expiresAt };
  }

  return {
    async login(identifier, password, meta) {
      const ident = typeof identifier === 'string' ? identifier.trim().slice(0, 254) : '';
      const pw = typeof password === 'string' ? password.slice(0, 256) : '';
      const found = ident ? db.members.findForLogin(ident) : null;
      // Always run scrypt (against a dummy hash for unknown users) so timing doesn't leak accounts.
      const ok = await verifyPassword(pw, found?.passwordHash ?? null);
      if (!found || !ok || !pw) throw new AppError('unauthorized', 'Invalid email or password');
      return newSession(found.member, meta ?? { ip: '', userAgent: '' });
    },

    async logout(token) {
      if (typeof token === 'string' && token) db.sessions.deleteByHash(sha256Hex(token));
    },

    async resolveSession(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
      const s = db.sessions.findByHash(sha256Hex(token));
      if (!s) return null;
      const now = ctx.clock();
      if (s.expiresAt <= now) {
        db.sessions.delete(s.orgId, s.id);
        return null;
      }
      const m = db.members.get(s.orgId, s.memberId);
      if (!m || !m.active || m.kind !== 'human') {
        db.sessions.delete(s.orgId, s.id);
        return null;
      }
      if (now - s.lastUsedAt >= TOUCH_EVERY_MS) db.sessions.touch(s.orgId, s.id, now + SESSION_TTL_MS, now); // sliding expiry
      return actorFor(m, 'session');
    },

    async resolveApiKey(rawKey) {
      if (typeof rawKey !== 'string' || !rawKey.startsWith(KEY_PREFIX) || rawKey.length > 200) return null;
      const key = db.apiKeys.findByHash(sha256Hex(rawKey));
      if (!key || key.revokedAt !== null) return null;
      const now = ctx.clock();
      if (key.expiresAt !== null && key.expiresAt <= now) return null;
      const m = db.members.get(key.orgId, key.memberId);
      if (!m || !m.active) return null;
      if (key.lastUsedAt === null || now - key.lastUsedAt >= TOUCH_EVERY_MS) {
        db.apiKeys.touch(key.orgId, key.id, now);
        if (m.kind === 'agent') db.members.touchAgentSeen(m.orgId, m.id, now);
      }
      return actorFor(m, 'api_key', [...key.scopes]);
    },

    async needsSetup() {
      return !db.members.anyActiveOwner();
    },

    async setup(input) {
      if (!v.isObj(input)) v.bad('setup input required');
      const orgName = v.str(input.orgName, 'orgName', { max: 100 });
      const name = v.str(input.name, 'name', { max: 100 });
      const email = v.email(input.email);
      const password = v.password(input.password);
      const tz = v.timezone(input.timezone ?? systemTimezone());
      const hash = await hashPassword(password);
      const now = ctx.clock();
      const member = db.tx(() => {
        if (db.members.anyActiveOwner()) throw new AppError('conflict', 'Setup has already been completed');
        // Adopt an org that already exists without an owner (e.g. imported from v1), else create one.
        let org = db.orgs.list()[0] ?? null;
        if (org) {
          org = { ...org, name: orgName, timezone: tz, updatedAt: now };
          db.orgs.save(org);
          if (db.members.findByEmail(org.id, email)) throw new AppError('conflict', 'A member with this email already exists');
        } else {
          org = {
            id: newId('org'), name: orgName, timezone: tz, logo: null, workdayStart: 9, workdayEnd: 18, defaultReminderOffsets: [1440, 60, 0],
            escalateAfterMin: 1440, agentStaleAfterMin: 240, intakeAutoAck: false, createdAt: now, updatedAt: now,
          };
          db.orgs.insert(org);
        }
        const id = newId('mem');
        const m: Member = {
          id, orgId: org.id, kind: 'human', role: 'owner', name, email, phone: null, title: null, initials: initialsFor(name), color: colorFor(id),
          avatarUrl: null, timezone: tz, active: true, prefs: defaultPrefs('human'), agent: null, createdAt: now, updatedAt: now,
        };
        db.members.insert(m, hash);
        return m;
      });
      ctx.internal.ensurePeriodic(member.orgId);
      ctx.internal.scheduleDigest(member);
      await audit(ctx, { orgId: member.orgId, memberId: member.id }, { type: 'org.setup', entity: 'org', entityId: member.orgId, summary: `${name} set up ${orgName}`, after: { orgName, ownerId: member.id } });
      return newSession(member, { ip: '', userAgent: '' });
    },

    async orgId() {
      return db.orgs.list()[0]?.id ?? null;
    },
  };
}

// ─── members ─────────────────────────────────────────────────────────────────

function validatePrefs(cur: MemberPrefs, patch: unknown): MemberPrefs {
  if (!v.isObj(patch)) v.bad('prefs must be an object');
  const p = { ...cur };
  const hour = (x: unknown, f: string) => (x === null ? null : v.int(x, f, 0, 23));
  if (patch.briefingVoice !== undefined) p.briefingVoice = v.oneOf(patch.briefingVoice, 'prefs.briefingVoice', ['auto', 'button', 'off'] as const);
  if (patch.voiceName !== undefined) p.voiceName = v.optStr(patch.voiceName, 'prefs.voiceName', 200);
  if (patch.digestHour !== undefined) p.digestHour = hour(patch.digestHour, 'prefs.digestHour');
  if (patch.notifyPush !== undefined) p.notifyPush = v.bool(patch.notifyPush, 'prefs.notifyPush');
  if (patch.notifyWhatsapp !== undefined) p.notifyWhatsapp = v.bool(patch.notifyWhatsapp, 'prefs.notifyWhatsapp');
  if (patch.notifyEmail !== undefined) p.notifyEmail = v.bool(patch.notifyEmail, 'prefs.notifyEmail');
  if (patch.quietStart !== undefined) p.quietStart = hour(patch.quietStart, 'prefs.quietStart');
  if (patch.quietEnd !== undefined) p.quietEnd = hour(patch.quietEnd, 'prefs.quietEnd');
  if (patch.theme !== undefined) p.theme = v.oneOf(patch.theme, 'prefs.theme', ['tactical', 'classic'] as const);
  if (patch.sound !== undefined) p.sound = v.bool(patch.sound, 'prefs.sound');
  return p;
}

export function createMemberService(ctx: Ctx): MemberService {
  const { db } = ctx;

  function load(actor: Actor, id: string): Member {
    const m = typeof id === 'string' ? db.members.get(actor.orgId, id) : null;
    if (!m) notFound('Member not found');
    return m!;
  }

  /** Revoke credentials after a security-relevant change. */
  function revokeAccess(m: Member, keys: boolean) {
    db.sessions.deleteForMember(m.orgId, m.id);
    if (keys) db.apiKeys.revokeForMember(m.orgId, m.id, ctx.clock());
  }

  function assertNotLastOwner(m: Member) {
    if (m.role === 'owner' && m.active && db.members.countActive(m.orgId, 'owner') <= 1) throw new AppError('conflict', 'This is the last owner — promote someone else first');
  }

  function validSupervisor(actor: Actor, sid: unknown): string | null {
    if (sid === null || sid === undefined) return null;
    const id = v.ref(sid, 'agent.supervisorId');
    const s = db.members.get(actor.orgId, id);
    if (!s || !s.active || s.kind !== 'human') v.bad('agent.supervisorId must be an active human member');
    return id;
  }

  return {
    async list(actor, opts = {}) {
      const includeInactive = !!opts.includeInactive && isManager(actor);
      const kind = opts.kind === 'human' || opts.kind === 'agent' ? opts.kind : undefined;
      return db.members.list(actor.orgId, { includeInactive, kind });
    },

    async get(actor, id) {
      const m = load(actor, id);
      if (!m.active && !isManager(actor) && m.id !== actor.memberId) notFound('Member not found');
      return m;
    },

    async me(actor) {
      return load(actor, actor.memberId);
    },

    async create(actor, input: CreateMemberInput) {
      requireWrite(actor);
      if (!v.isObj(input)) v.bad('member input required');
      const kind = v.oneOf(input.kind, 'kind', ['human', 'agent'] as const);
      if (kind === 'agent') requireRole(actor, 'manager', 'Managers and above can add AI agents');
      else requireRole(actor, 'admin', 'Only owners and admins can add people');
      let role = v.oneOf(input.role ?? (kind === 'agent' ? 'agent' : 'member'), 'role', ROLES);
      if (kind === 'agent') role = 'agent';
      else if (role === 'agent') v.bad('Humans cannot have the agent role');
      if (!isSystem(actor) && rank(role) > rank(actor.role)) forbidden('You cannot grant a role higher than your own');
      if (role === 'owner' && !isSystem(actor) && actor.role !== 'owner') forbidden('Only owners can add owners');
      const org = getOrg(ctx, actor.orgId);
      const name = v.str(input.name, 'name', { max: 100 });
      const email = kind === 'human' ? v.email(input.email) : input.email ? v.email(input.email) : null;
      if (email && db.members.findByEmail(actor.orgId, email) && kind === 'human') throw new AppError('conflict', 'A member with this email already exists');
      const hash = kind === 'human' ? await hashPassword(v.password(input.password)) : null;
      const now = ctx.clock();
      const id = newId('mem');
      const m: Member = {
        id,
        orgId: actor.orgId,
        kind,
        role,
        name,
        email,
        phone: v.phone(input.phone),
        title: v.optStr(input.title, 'title', 100),
        initials: initialsFor(name),
        color: colorFor(id),
        avatarUrl: null,
        timezone: input.timezone !== undefined ? v.timezone(input.timezone) : org.timezone,
        active: true,
        prefs: defaultPrefs(kind),
        agent: kind === 'agent'
          ? {
              provider: v.oneOf(input.agent?.provider ?? 'custom', 'agent.provider', PROVIDERS),
              description: v.optStr(input.agent?.description, 'agent.description', 2000) ?? '',
              lastSeenAt: null,
              supervisorId: input.agent?.supervisorId !== undefined ? validSupervisor(actor, input.agent.supervisorId) : actor.kind === 'human' && !isSystem(actor) ? actor.memberId : null,
            }
          : null,
        createdAt: now,
        updatedAt: now,
      };
      db.members.insert(m, hash);
      ctx.internal.scheduleDigest(m);
      await audit(ctx, actor, { type: 'member.created', entity: 'member', entityId: id, summary: `Added ${kind === 'agent' ? 'AI agent' : 'member'} ${name}`, after: m });
      publish(ctx, actor.orgId, { type: 'member.upserted', member: m });
      return m;
    },

    async update(actor, id, patch: UpdateMemberInput) {
      requireWrite(actor);
      if (!v.isObj(patch)) v.bad('patch must be an object');
      const cur = load(actor, id);
      const self = cur.id === actor.memberId;
      const adminOver = isAdmin(actor) && (isSystem(actor) || rank(cur.role) <= rank(actor.role));
      const managerOverAgent = cur.kind === 'agent' && isManager(actor);
      const privileged = adminOver || managerOverAgent;
      if (!self && !privileged) forbidden('You can only edit your own profile');
      const touchesAdminFields = patch.role !== undefined || patch.active !== undefined || patch.agent !== undefined || patch.email !== undefined;
      if (touchesAdminFields && !privileged) forbidden('Only admins can change role, status or email');
      if (self && !isSystem(actor) && (patch.role !== undefined && patch.role !== cur.role || patch.active === false)) forbidden('You cannot change your own role or deactivate yourself');

      const next: Member = { ...cur, prefs: { ...cur.prefs }, agent: cur.agent ? { ...cur.agent } : null };
      if (patch.name !== undefined) {
        next.name = v.str(patch.name, 'name', { max: 100 });
        next.initials = initialsFor(next.name);
      }
      if (patch.email !== undefined) {
        next.email = cur.kind === 'human' ? v.email(patch.email) : patch.email ? v.email(patch.email) : null;
        const clash = next.email ? db.members.findByEmail(actor.orgId, next.email) : null;
        if (clash && clash.id !== cur.id && cur.kind === 'human') throw new AppError('conflict', 'A member with this email already exists');
      }
      if (patch.phone !== undefined) next.phone = v.phone(patch.phone);
      if (patch.title !== undefined) next.title = v.optStr(patch.title, 'title', 100);
      if (patch.timezone !== undefined) next.timezone = v.timezone(patch.timezone);
      if (patch.color !== undefined) next.color = v.color(patch.color);
      if (patch.avatarUrl !== undefined) next.avatarUrl = patch.avatarUrl === null ? null : v.url(patch.avatarUrl, 'avatarUrl');
      if (patch.prefs !== undefined) next.prefs = validatePrefs(cur.prefs, patch.prefs);
      if (patch.role !== undefined) {
        const role = v.oneOf(patch.role, 'role', ROLES);
        if (cur.kind === 'agent' && role !== 'agent') v.bad('Agents always have the agent role');
        if (cur.kind === 'human' && role === 'agent') v.bad('Humans cannot have the agent role');
        if (!isSystem(actor) && rank(role) > rank(actor.role)) forbidden('You cannot grant a role higher than your own');
        if (cur.role === 'owner' && role !== 'owner') assertNotLastOwner(cur);
        next.role = role;
      }
      if (patch.active !== undefined) {
        next.active = v.bool(patch.active, 'active');
        if (!next.active) assertNotLastOwner(cur);
      }
      if (patch.agent !== undefined) {
        if (cur.kind !== 'agent' || !next.agent) v.bad('agent settings only apply to AI agents');
        if (!v.isObj(patch.agent)) v.bad('agent must be an object');
        if (patch.agent.provider !== undefined) next.agent.provider = v.oneOf(patch.agent.provider, 'agent.provider', PROVIDERS);
        if (patch.agent.description !== undefined) next.agent.description = v.optStr(patch.agent.description, 'agent.description', 2000) ?? '';
        if (patch.agent.supervisorId !== undefined) next.agent.supervisorId = validSupervisor(actor, patch.agent.supervisorId);
      }
      next.updatedAt = ctx.clock();
      db.members.save(next);
      if (next.role !== cur.role || (cur.active && !next.active)) revokeAccess(next, cur.active && !next.active);
      if (next.timezone !== cur.timezone || next.prefs.digestHour !== cur.prefs.digestHour || next.active !== cur.active) ctx.internal.scheduleDigest(next);
      await audit(ctx, actor, { type: 'member.updated', entity: 'member', entityId: id, summary: `Updated ${next.name}`, before: cur, after: next, undoable: true });
      publish(ctx, actor.orgId, { type: 'member.upserted', member: next });
      ctx.internal.invalidateBriefings(actor.orgId);
      return next;
    },

    async setPassword(actor, id, password) {
      requireWrite(actor);
      requireRole(actor, 'admin', 'Only owners and admins can reset passwords');
      const m = load(actor, id);
      if (m.kind !== 'human') v.bad('AI agents authenticate with API keys, not passwords');
      if (!isSystem(actor) && rank(m.role) > rank(actor.role)) forbidden('You cannot reset the password of a higher role');
      const hash = await hashPassword(v.password(password));
      db.members.setPasswordHash(actor.orgId, m.id, hash, ctx.clock());
      db.sessions.deleteForMember(actor.orgId, m.id);
      await audit(ctx, actor, { type: 'member.password_reset', entity: 'member', entityId: m.id, summary: `Reset password for ${m.name}` });
    },

    async changeOwnPassword(actor, current, next) {
      if (actor.via !== 'session') forbidden('Change your password from a signed-in session');
      const m = load(actor, actor.memberId);
      const ok = await verifyPassword(typeof current === 'string' ? current : '', db.members.getPasswordHash(actor.orgId, m.id));
      if (!ok) throw new AppError('bad_request', 'Current password is incorrect');
      const hash = await hashPassword(v.password(next, 'new password'));
      db.members.setPasswordHash(actor.orgId, m.id, hash, ctx.clock());
      db.sessions.deleteForMember(actor.orgId, m.id); // every session, incl. this one: re-login required
      await audit(ctx, actor, { type: 'member.password_changed', entity: 'member', entityId: m.id, summary: `${m.name} changed their password` });
    },

    async remove(actor, id) {
      requireWrite(actor);
      const m = load(actor, id);
      if (m.id === actor.memberId) forbidden('You cannot remove yourself');
      if (m.kind === 'agent') requireRole(actor, 'manager');
      else {
        requireRole(actor, 'admin', 'Only owners and admins can remove people');
        if (!isSystem(actor) && rank(m.role) > rank(actor.role)) forbidden('You cannot remove a higher role');
      }
      if (!m.active) return;
      assertNotLastOwner(m);
      const next = { ...m, active: false, updatedAt: ctx.clock() };
      db.members.save(next);
      revokeAccess(next, true);
      ctx.internal.scheduleDigest(next);
      await audit(ctx, actor, { type: 'member.deleted', entity: 'member', entityId: m.id, summary: `Removed ${m.name}`, before: m, after: next, undoable: true });
      publish(ctx, actor.orgId, { type: 'member.upserted', member: next });
    },
  };
}

// ─── api keys ────────────────────────────────────────────────────────────────

export function createApiKeyService(ctx: Ctx): ApiKeyService {
  const { db } = ctx;

  /** May `actor` manage keys belonging to `m`? */
  function canManage(actor: Actor, m: Member): boolean {
    if (m.id === actor.memberId) return true;
    if (isAdmin(actor)) return true;
    return m.kind === 'agent' && isManager(actor);
  }

  return {
    async list(actor, memberId) {
      if (memberId !== undefined && memberId !== null && memberId !== '') {
        const m = db.members.get(actor.orgId, String(memberId));
        if (!m) notFound('Member not found');
        if (!canManage(actor, m!)) forbidden();
        return db.apiKeys.list(actor.orgId, [m!.id]);
      }
      if (isAdmin(actor)) return db.apiKeys.list(actor.orgId);
      if (isManager(actor)) {
        const agentIds = db.members.list(actor.orgId, { includeInactive: true, kind: 'agent' }).map((a) => a.id);
        return db.apiKeys.list(actor.orgId, [actor.memberId, ...agentIds]);
      }
      return db.apiKeys.list(actor.orgId, [actor.memberId]);
    },

    async create(actor, input) {
      requireWrite(actor);
      if (actor.via === 'api_key') forbidden('API keys cannot mint other API keys');
      if (!v.isObj(input)) v.bad('key input required');
      const m = db.members.get(actor.orgId, v.ref(input.memberId, 'memberId'));
      if (!m || !m.active) notFound('Member not found');
      if (!canManage(actor, m!)) forbidden('Managers can mint keys for AI agents; anyone can mint keys for themselves');
      if (m!.kind === 'human' && m!.id !== actor.memberId) forbidden('Keys for a person can only be created by that person');
      const name = v.str(input.name, 'name', { max: 100 });
      if (!Array.isArray(input.scopes) || !input.scopes.length) v.bad('scopes must include read and/or write');
      const scopes = [...new Set(input.scopes.map((s) => v.oneOf(s, 'scope', ['read', 'write'] as const)))] as ApiScope[];
      if (scopes.includes('write') && !scopes.includes('read')) scopes.unshift('read');
      if (m!.role === 'guest' && scopes.includes('write')) v.bad('Guests can only have read-only keys');
      const now = ctx.clock();
      const expiresAt = v.optTime(input.expiresAt, 'expiresAt');
      if (expiresAt !== null && expiresAt <= now) v.bad('expiresAt must be in the future');
      const raw = KEY_PREFIX + randomBase62(43);
      const key: ApiKey = {
        id: newId('key'), orgId: actor.orgId, memberId: m!.id, name, prefix: raw.slice(0, 12), scopes, createdBy: actor.memberId,
        createdAt: now, lastUsedAt: null, expiresAt, revokedAt: null,
      };
      db.apiKeys.insert(key, sha256Hex(raw));
      await audit(ctx, actor, { type: 'api_key.created', entity: 'api_key', entityId: key.id, summary: `Created API key "${name}" for ${m!.name}`, after: key });
      return { key, raw };
    },

    async revoke(actor, id) {
      requireWrite(actor);
      const key = typeof id === 'string' ? db.apiKeys.get(actor.orgId, id) : null;
      if (!key) notFound('API key not found');
      const m = db.members.get(actor.orgId, key!.memberId);
      if (!m || !canManage(actor, m)) forbidden();
      if (key!.revokedAt !== null) return;
      db.apiKeys.revoke(actor.orgId, key!.id, ctx.clock());
      await audit(ctx, actor, { type: 'api_key.revoked', entity: 'api_key', entityId: key!.id, summary: `Revoked API key "${key!.name}"`, before: key });
    },
  };
}

// ─── org ─────────────────────────────────────────────────────────────────────

export function validateOrgPatch(cur: OrgSettings, patch: unknown): OrgSettings {
  if (!v.isObj(patch)) v.bad('patch must be an object');
  const n = { ...cur };
  if (patch.name !== undefined) n.name = v.str(patch.name, 'name', { max: 100 });
  if (patch.timezone !== undefined) n.timezone = v.timezone(patch.timezone);
  if (patch.logo !== undefined) n.logo = v.optStr(patch.logo, 'logo', 2048);
  if (patch.workdayStart !== undefined) n.workdayStart = v.int(patch.workdayStart, 'workdayStart', 0, 23);
  if (patch.workdayEnd !== undefined) n.workdayEnd = v.int(patch.workdayEnd, 'workdayEnd', 1, 24);
  if (n.workdayEnd <= n.workdayStart) v.bad('workdayEnd must be after workdayStart');
  if (patch.defaultReminderOffsets !== undefined) n.defaultReminderOffsets = v.offsets(patch.defaultReminderOffsets, 'defaultReminderOffsets');
  if (patch.escalateAfterMin !== undefined) n.escalateAfterMin = patch.escalateAfterMin === null ? null : v.int(patch.escalateAfterMin, 'escalateAfterMin', 1, 60 * 24 * 60);
  if (patch.agentStaleAfterMin !== undefined) n.agentStaleAfterMin = v.int(patch.agentStaleAfterMin, 'agentStaleAfterMin', 5, 60 * 24 * 30);
  if (patch.intakeAutoAck !== undefined) n.intakeAutoAck = v.bool(patch.intakeAutoAck, 'intakeAutoAck');
  return n;
}

export function createOrgService(ctx: Ctx): OrgService {
  return {
    async get(actor) {
      return getOrg(ctx, actor.orgId);
    },
    async update(actor, patch) {
      requireWrite(actor);
      requireRole(actor, 'admin', 'Only owners and admins can change organization settings');
      const cur = getOrg(ctx, actor.orgId);
      const next = { ...validateOrgPatch(cur, patch), updatedAt: ctx.clock() };
      ctx.db.orgs.save(next);
      if (JSON.stringify(cur.defaultReminderOffsets) !== JSON.stringify(next.defaultReminderOffsets) || cur.escalateAfterMin !== next.escalateAfterMin) {
        for (const t of ctx.db.tasks.query(actor.orgId, { open: true, hasDue: true, limit: 5000 })) ctx.internal.scheduleTask(t);
      }
      await audit(ctx, actor, { type: 'org.updated', entity: 'org', entityId: cur.id, summary: 'Updated organization settings', before: cur, after: next, undoable: true });
      ctx.internal.invalidateBriefings(actor.orgId);
      return next;
    },
  };
}
