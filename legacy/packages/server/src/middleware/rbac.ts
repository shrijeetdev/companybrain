import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Principal, Capability } from '@companybrain/auth';
import type { Role } from '@companybrain/types';

// Role hierarchy: higher roles can do everything lower roles can
const ROLE_HIERARCHY: Record<Role, number> = {
  agent: 0,
  client: 1,
  employee: 2,
  manager: 3,
  ceo: 4,
};

/**
 * Middleware to enforce role-based access control.
 * Requires a principal to be set on the request (via auth middleware).
 */
export function requireRole(...allowedRoles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const principal = (req as FastifyRequest & { principal?: Principal }).principal;
    if (!principal) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(principal.role)) {
      return reply.code(403).send({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: principal.role,
      });
    }
  };
}

/**
 * Middleware to enforce minimum role level.
 * Uses role hierarchy: CEO > Manager > Employee > Client > Agent
 */
export function requireMinRole(minRole: Role) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const principal = (req as FastifyRequest & { principal?: Principal }).principal;
    if (!principal) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const userLevel = ROLE_HIERARCHY[principal.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

    if (userLevel < requiredLevel) {
      return reply.code(403).send({
        error: 'Insufficient permissions',
        required: `At least ${minRole}`,
        current: principal.role,
      });
    }
  };
}

/**
 * Middleware to enforce capability-based access control.
 */
export function requireCapability(...capabilities: Capability[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const principal = (req as FastifyRequest & { principal?: Principal }).principal;
    if (!principal) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    // Import auth module to check capabilities
    const { createAuth } = await import('@companybrain/auth');
    const auth = createAuth();

    const missing = capabilities.filter((cap) => !auth.can(principal, cap));
    if (missing.length > 0) {
      return reply.code(403).send({
        error: 'Missing capabilities',
        missing,
        current: principal.role,
      });
    }
  };
}

/**
 * Get the current principal from request.
 */
export function getPrincipal(req: FastifyRequest): Principal | null {
  return (req as FastifyRequest & { principal?: Principal }).principal ?? null;
}

/**
 * Check if the current user is an admin (CEO or Manager).
 */
export function isAdmin(principal: Principal): boolean {
  return principal.role === 'ceo' || principal.role === 'manager';
}

/**
 * Check if the current user can modify the target user.
 */
export function canModifyUser(principal: Principal, targetUserId: string): boolean {
  // Users can always modify themselves
  if (principal.userId === targetUserId) return true;
  // Admins can modify anyone
  return isAdmin(principal);
}
