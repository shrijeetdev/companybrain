import type { Auth } from './port';
import { LocalAuth } from './local';

export type { Auth, Principal, Capability } from './port';
export { LocalAuth, LOCAL_ORG_ID, LOCAL_USER_ID } from './local';

/** Single self-hosted user, full rights, no login. */
export function createAuth(): Auth {
  return new LocalAuth();
}
