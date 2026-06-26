// Local auth — one user, full rights, no login. The npx demo "just works".

import type { Role } from '@companybrain/types';
import type { Auth, Principal, Capability } from './port';

export const LOCAL_ORG_ID = 'org_local';
export const LOCAL_USER_ID = 'user_local';

export class LocalAuth implements Auth {
  private principal: Principal;

  constructor(role: Role = 'ceo') {
    this.principal = { userId: LOCAL_USER_ID, orgId: LOCAL_ORG_ID, role };
  }

  async init() {}

  async authenticate(): Promise<Principal> {
    return this.principal;
  }

  async current(): Promise<Principal> {
    return this.principal;
  }

  /** single local user can do everything */
  can(_principal: Principal, _capability: Capability): boolean {
    return true;
  }
}
