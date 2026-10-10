// Role/scope checks enforced inside services (not only in routes).
//
// owner/admin  manage members, org, integrations; see everything
// manager      manage projects, agents and agent keys; sees the whole team
// member       own work + shared (project) work
// guest        read-only on projects they're a member of
// agent        all non-private work (any project task + own); updates tasks assigned to it,
//              comments on anything visible, creates tasks. Mutations need the key's 'write' scope.

import { AppError, ROLE_RANK, SYSTEM_MEMBER_ID, type Actor, type Role, type Task } from '@companybrain/types';
import type { Visibility } from '@companybrain/db';

export const forbidden = (msg = 'You do not have permission to do that'): never => {
  throw new AppError('forbidden', msg);
};
export const notFound = (what = 'Not found'): never => {
  throw new AppError('not_found', what);
};

export const isSystem = (a: Actor) => a.via === 'system' && a.memberId === SYSTEM_MEMBER_ID;
export const rank = (r: Role) => ROLE_RANK[r] ?? 0;
export const atLeast = (a: Actor, r: Role) => isSystem(a) || (a.kind === 'human' && rank(a.role) >= rank(r));
export const isManager = (a: Actor) => atLeast(a, 'manager');
export const isAdmin = (a: Actor) => atLeast(a, 'admin');

export function systemActor(orgId: string): Actor {
  return { orgId, memberId: SYSTEM_MEMBER_ID, role: 'owner', kind: 'human', via: 'system' };
}

export function hasWriteScope(a: Actor): boolean {
  return a.via !== 'api_key' || (a.scopes ?? []).includes('write');
}

/** Any mutation: API keys need 'write'; guests are read-only. */
export function requireWrite(a: Actor): void {
  if (!hasWriteScope(a)) forbidden("This API key is read-only (missing 'write' scope)");
  if (a.role === 'guest' && !isSystem(a)) forbidden('Guests have read-only access');
}

export function requireRole(a: Actor, r: Role, msg?: string): void {
  if (!atLeast(a, r)) forbidden(msg ?? `Requires ${r} role or higher`);
}

export function visibility(a: Actor): Visibility {
  if (isManager(a)) return { mode: 'all' };
  if (a.kind === 'agent') return { mode: 'agent', memberId: a.memberId };
  if (a.role === 'guest') return { mode: 'guest', memberId: a.memberId };
  return { mode: 'member', memberId: a.memberId };
}

/** Can `a` modify task `t` (already known to be visible to `a`)? */
export function canEditTask(a: Actor, t: Task): boolean {
  if (!hasWriteScope(a) || a.role === 'guest') return false;
  if (isManager(a)) return true;
  const involved = t.creatorId === a.memberId || t.assigneeIds.includes(a.memberId);
  if (a.kind === 'agent') return involved;
  return true; // members: anything visible to them (own + shared project work)
}

export function canDeleteTask(a: Actor, t: Task, projectLeadId: string | null): boolean {
  if (!hasWriteScope(a) || a.role === 'guest') return false;
  if (isManager(a)) return true;
  return t.creatorId === a.memberId || (projectLeadId !== null && projectLeadId === a.memberId);
}
