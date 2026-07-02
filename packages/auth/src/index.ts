import type { Auth } from './port';
import { LocalAuth } from './local';
import { KeyAuth } from './key';
import { SupabaseAuth } from './supabase';

export type { Auth, Principal, Capability, AuthUser, LoginResult } from './port';
export { LocalAuth, LOCAL_ORG_ID, LOCAL_USER_ID } from './local';
export { KeyAuth } from './key';
export { SupabaseAuth } from './supabase';

/**
 * Auth factory.
 *
 * Defaults to local single-user mode for zero-config development.
 * Switches to key-based multi-user mode when either:
 * - COMPANYBRAIN_AUTH_MODE=key, or
 * - COMPANYBRAIN_ACCESS_KEY / COMPANYBRAIN_USERS is provided.
 * Uses Supabase Auth when SUPABASE_URL and SUPABASE_ANON_KEY are set.
 */
export function createAuth(): Auth {
  const forced = (process.env.COMPANYBRAIN_AUTH_MODE ?? '').trim().toLowerCase();
  if (forced === 'local') return new LocalAuth();

  // Check for Supabase configuration
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    return new SupabaseAuth({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  }

  if (forced === 'key' || !!process.env.COMPANYBRAIN_ACCESS_KEY || !!process.env.COMPANYBRAIN_USERS) {
    return new KeyAuth();
  }
  return new LocalAuth();
}
