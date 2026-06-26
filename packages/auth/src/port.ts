// The Auth port. The single self-hosted app runs as one seeded user with full rights
// (no login). The port stays an interface so a real auth provider can be added later
// without touching core or the routes.

import type { Role } from '@companybrain/types';

export interface Principal {
  userId: string;
  orgId: string;
  role: Role;
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
  /** the implicit single-user principal */
  current(): Promise<Principal>;
  can(principal: Principal, capability: Capability): boolean;
}
