// Supabase Auth adapter — implements the Auth port using Supabase Authentication.
// Supports email/password, magic links, OAuth, and JWT verification.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Auth, Principal, AuthUser, LoginResult, Capability } from './port';
import type { Role } from '@companybrain/types';

export interface SupabaseAuthOptions {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
  /** Default org ID for new users */
  defaultOrgId?: string;
  /** Default role for new users */
  defaultRole?: Role;
}

// Capability matrix: what each role can do
const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  ceo: ['loop.read', 'loop.write', 'task.read', 'task.write', 'lead.read', 'lead.write', 'autonomy.configure', 'killswitch.toggle', 'org.admin'],
  manager: ['loop.read', 'loop.write', 'task.read', 'task.write', 'lead.read', 'lead.write', 'autonomy.configure'],
  employee: ['loop.read', 'loop.write', 'task.read', 'task.write', 'lead.read'],
  client: ['loop.read', 'task.read', 'lead.read'],
  agent: ['loop.read', 'loop.write', 'task.read', 'task.write', 'lead.read', 'lead.write'],
};

export class SupabaseAuth implements Auth {
  private client: SupabaseClient;
  private adminClient: SupabaseClient | null = null;
  private defaultOrgId: string;
  private defaultRole: Role;
  mode: 'key' = 'key';

  constructor(opts: SupabaseAuthOptions) {
    this.client = createClient(opts.url, opts.anonKey);
    this.adminClient = opts.serviceRoleKey
      ? createClient(opts.url, opts.serviceRoleKey)
      : null;
    this.defaultOrgId = opts.defaultOrgId ?? 'org_default';
    this.defaultRole = opts.defaultRole ?? 'employee';
  }

  async init(): Promise<void> {
    // Supabase client initializes lazily — nothing to do here
  }

  async authenticate(token?: string): Promise<Principal | null> {
    if (!token) return null;

    try {
      // Try JWT verification with Supabase
      const { data: { user }, error } = await this.client.auth.getUser(token);
      if (error || !user) return null;

      // Get user profile from your users table (if exists)
      const profile = await this.getUserProfile(user.id);
      if (!profile) {
        // Return a basic principal from the auth user
        return {
          userId: user.id,
          orgId: this.defaultOrgId,
          role: this.defaultRole,
        };
      }

      return {
        userId: profile.userId,
        orgId: profile.orgId,
        role: profile.role,
      };
    } catch {
      return null;
    }
  }

  async current(): Promise<Principal> {
    // In local mode, return a default principal
    return {
      userId: 'user_local',
      orgId: 'org_local',
      role: 'ceo',
    };
  }

  can(principal: Principal, capability: Capability): boolean {
    const caps = ROLE_CAPABILITIES[principal.role] ?? [];
    return caps.includes(capability);
  }

  async listUsers(): Promise<AuthUser[]> {
    if (!this.adminClient) {
      // Fall back to single user if no admin client
      const p = await this.current();
      return [this.principalToUser(p)];
    }

    try {
      const { data, error } = await this.adminClient.auth.admin.listUsers();
      if (error || !data?.users) return [];

      return data.users.map((user) => ({
        userId: user.id,
        orgId: this.defaultOrgId,
        role: this.defaultRole,
        name: user.user_metadata?.name ?? user.email?.split('@')[0] ?? user.id,
        email: user.email,
        initials: this.getInitials(user.user_metadata?.name ?? user.email),
      }));
    } catch {
      return [];
    }
  }

  async getUser(userId: string): Promise<AuthUser | null> {
    const profile = await this.getUserProfile(userId);
    if (!profile) return null;

    return {
      userId: profile.userId,
      orgId: profile.orgId,
      role: profile.role,
      name: profile.name,
      email: profile.email,
      initials: this.getInitials(profile.name),
    };
  }

  async login(userIdOrEmail: string, key: string): Promise<LoginResult | null> {
    if (!this.client) return null;

    try {
      // Try email/password login
      const { data, error } = await this.client.auth.signInWithPassword({
        email: userIdOrEmail,
        password: key,
      });

      if (error || !data?.user || !data?.session) {
        // Try phone/password login if email failed
        const { data: phoneData, error: phoneError } = await this.client.auth.signInWithPassword({
          phone: userIdOrEmail,
          password: key,
        });

        if (phoneError || !phoneData?.user || !phoneData?.session) {
          return null;
        }

        return this.createLoginResult(phoneData.user.id, phoneData.session.access_token, phoneData.session.expires_at ?? 0);
      }

      return this.createLoginResult(data.user.id, data.session.access_token, data.session.expires_at ?? 0);
    } catch {
      return null;
    }
  }

  async logout(token: string): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.auth.admin.signOut(token);
    } catch {
      // Ignore logout errors
    }
  }

  private async createLoginResult(userId: string, token: string, expiresAt: number): Promise<LoginResult> {
    const profile = await this.getUserProfile(userId);
    const principal: Principal = {
      userId,
      orgId: profile?.orgId ?? this.defaultOrgId,
      role: profile?.role ?? this.defaultRole,
    };

    const user: AuthUser = {
      ...principal,
      name: profile?.name ?? userId,
      email: profile?.email,
      initials: this.getInitials(profile?.name),
    };

    return {
      token,
      user,
      principal,
      expiresAt: (expiresAt ?? 0) * 1000, // Convert to milliseconds
    };
  }

  private async getUserProfile(userId: string): Promise<{ userId: string; orgId: string; role: Role; name: string; email?: string } | null> {
    if (!this.adminClient) return null;

    try {
      // Query your users table for profile data
      const { data, error } = await this.adminClient
        .from('users')
        .select('id, org_id, role, name, email')
        .eq('id', userId)
        .single();

      if (error || !data) return null;

      return {
        userId: data.id,
        orgId: data.org_id ?? this.defaultOrgId,
        role: (data.role as Role) ?? this.defaultRole,
        name: data.name ?? userId,
        email: data.email,
      };
    } catch {
      return null;
    }
  }

  private principalToUser(principal: Principal): AuthUser {
    const name = principal.userId.replace(/^user[_-]?/i, '').replace(/[_-]+/g, ' ').trim() || principal.userId;
    return {
      userId: principal.userId,
      orgId: principal.orgId,
      role: principal.role,
      name,
      initials: this.getInitials(name),
    };
  }

  private getInitials(name: string | undefined): string {
    if (!name) return '??';
    const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
    if (!parts.length) return '??';
    return parts.map((p) => (p[0] ?? '').toUpperCase()).join('');
  }
}
