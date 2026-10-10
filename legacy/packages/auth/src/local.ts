// Local auth — one user, full rights, no login. The npx demo "just works".

import type { Role } from '@companybrain/types';
import type { Auth, AuthUser, Capability, Principal } from './port';

export const LOCAL_ORG_ID = 'org_local';
export const LOCAL_USER_ID = 'user_local';

export class LocalAuth implements Auth {
  mode = 'local' as const;

  private principal: Principal;
  private user: AuthUser;

  constructor(role: Role = 'ceo') {
    this.principal = { userId: LOCAL_USER_ID, orgId: LOCAL_ORG_ID, role };
    this.user = {
      ...this.principal,
      name: 'You',
      email: 'you@companybrain.local',
      initials: 'YO',
    };
  }

  async init() {}

  async authenticate(): Promise<Principal> {
    return this.principal;
  }

  async current(): Promise<Principal> {
    return this.principal;
  }

  listUsers(): AuthUser[] {
    return [{ ...this.user }];
  }

  getUser(userId: string): AuthUser | null {
    return userId === this.user.userId ? { ...this.user } : null;
  }

  /** single local user can do everything */
  can(_principal: Principal, _capability: Capability): boolean {
    return true;
  }
}
