// The Auth port. Supports simple local mode (single user) and key-based multi-user
// sessions for production deployments.

import type { Role } from '@companybrain/types';

export interface Principal {
  userId: string;
  orgId: string;
  role: Role;
}

export interface AuthUser extends Principal {
  name: string;
  email?: string;
  initials?: string;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
  principal: Principal;
  expiresAt: number;
}

/** Coarse capability check used by core + api route guards. */
export type Capability =
  | 'loop.read' | 'loop.write'
  | 'task.read' | 'task.write'
  | 'lead.read' | 'lead.write'
  | 'autonomy.configure' | 'killswitch.toggle' | 'org.admin';

export interface Auth {
  init(): Promise<void>;
  /** resolve a principal from a bearer token / session; null if unauthenticated */
  authenticate(token?: string): Promise<Principal | null>;
  /** default principal (used by local mode and as a bootstrap fallback) */
  current(): Promise<Principal>;
  can(principal: Principal, capability: Capability): boolean;

  /** optional metadata + session helpers for server/UI auth flows */
  mode?: 'local' | 'key';
  listUsers?(): Promise<AuthUser[]> | AuthUser[];
  getUser?(userId: string): Promise<AuthUser | null> | AuthUser | null;
  login?(userIdOrEmail: string, key: string): Promise<LoginResult | null>;
  logout?(token: string): Promise<void>;
}
