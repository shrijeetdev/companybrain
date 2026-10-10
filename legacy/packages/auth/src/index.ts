import type { Auth } from './port';
import { LocalAuth } from './local';
import { KeyAuth } from './key';
import { PasswordAuth } from './password';
import { SupabaseAuth } from './supabase';

export type {
  Auth, Principal, Capability, AuthUser, LoginResult,
  CreateUserInput, UpdateUserInput,
} from './port';
export { LocalAuth, LOCAL_ORG_ID, LOCAL_USER_ID } from './local';
export { KeyAuth } from './key';
export { PasswordAuth } from './password';
export { SupabaseAuth } from './supabase';
export { CAPS_BY_ROLE, normalizeRole, initialsFor } from './capabilities';

/**
 * Auth factory.
 *
 * Defaults to local single-user mode for zero-config development.
 *
 * Production modes:
 * - `password` (recommended): real per-person accounts (email/username + password),
 *   backed by SQLite, with an admin (`ceo` role) who can create/edit/remove users.
 *   Enabled by COMPANYBRAIN_AUTH_MODE=password, or automatically when
 *   COMPANYBRAIN_ADMIN_EMAIL is set.
 * - `key`: legacy shared-access-key mode (one secret for everyone). Enabled by
 *   COMPANYBRAIN_AUTH_MODE=key, or when COMPANYBRAIN_ACCESS_KEY / COMPANYBRAIN_USERS is set.
 * - Supabase Auth when SUPABASE_URL and SUPABASE_ANON_KEY are set.
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

  if (forced === 'password' || !!process.env.COMPANYBRAIN_ADMIN_EMAIL) {
    return new PasswordAuth();
  }

  if (forced === 'key' || !!process.env.COMPANYBRAIN_ACCESS_KEY || !!process.env.COMPANYBRAIN_USERS) {
    return new KeyAuth();
  }
  return new LocalAuth();
}
