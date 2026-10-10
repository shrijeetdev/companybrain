// Shared role → capability map + role helpers, used by every Auth adapter that
// supports real accounts (KeyAuth, PasswordAuth). Kept in one place so the
// permission model never drifts between adapters.

import type { Role } from '@companybrain/types';
import type { Capability } from './port';

/**
 * `ceo` is the admin/owner role in companybrain: it's the only role with
 * `org.admin`, which gates user management (create/edit/delete users, change
 * roles, reset passwords). Everything else is scoped per-role.
 */
export const CAPS_BY_ROLE: Record<Role, Set<Capability>> = {
  ceo: new Set<Capability>([
    'loop.read', 'loop.write',
    'task.read', 'task.write',
    'lead.read', 'lead.write',
    'autonomy.configure', 'killswitch.toggle', 'org.admin',
  ]),
  manager: new Set<Capability>([
    'loop.read', 'loop.write',
    'task.read', 'task.write',
    'lead.read', 'lead.write',
    'autonomy.configure', 'killswitch.toggle',
  ]),
  employee: new Set<Capability>([
    'loop.read', 'loop.write',
    'task.read', 'task.write',
    'lead.read', 'lead.write',
  ]),
  client: new Set<Capability>([
    'loop.read',
    'task.read',
    'lead.read',
  ]),
  agent: new Set<Capability>([
    'loop.read', 'loop.write',
    'task.read', 'task.write',
    'lead.read', 'lead.write',
  ]),
};

export function normalizeRole(raw?: string): Role {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'ceo' || v === 'admin' || v === 'owner') return 'ceo';
  if (v === 'manager' || v === 'mgr' || v === 'hr') return 'manager';
  if (v === 'employee' || v === 'emp' || v === 'member' || v === 'staff') return 'employee';
  if (v === 'client') return 'client';
  if (v === 'agent' || v === 'ai' || v === 'ai-agent') return 'agent';
  return 'employee';
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return 'US';
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}
