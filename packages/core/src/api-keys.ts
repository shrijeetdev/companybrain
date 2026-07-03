// API Keys service — generate, list, revoke API keys for external integrations.

import { newId } from './context';
import type { Context } from './context';

export interface ApiKey {
  id: string;
  orgId: string;
  name: string;
  key: string;
  prefix: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
}

export function makeApiKeys(ctx: Context) {
  const keys = new Map<string, ApiKey>();

  async function create(orgId: string, name: string, scopes: string[] = ['read']): Promise<ApiKey> {
    const raw = `cb_${newId('key')}`;
    const apiKey: ApiKey = {
      id: newId('apikey'),
      orgId,
      name,
      key: raw,
      prefix: raw.slice(0, 8),
      scopes,
      createdAt: Date.now(),
    };
    keys.set(apiKey.id, apiKey);
    return apiKey;
  }

  async function list(orgId: string): Promise<Omit<ApiKey, 'key'>[]> {
    return [...keys.values()]
      .filter(k => k.orgId === orgId)
      .map(({ key, ...rest }) => ({ ...rest, key: `${rest.prefix}...` }));
  }

  async function verify(rawKey: string): Promise<ApiKey | null> {
    for (const k of keys.values()) {
      if (k.key === rawKey) {
        k.lastUsedAt = Date.now();
        return k;
      }
    }
    return null;
  }

  async function revoke(id: string): Promise<void> {
    keys.delete(id);
  }

  async function getByPrefix(orgId: string, prefix: string): Promise<ApiKey | undefined> {
    return [...keys.values()].find(k => k.orgId === orgId && k.prefix === prefix);
  }

  return { create, list, verify, revoke, getByPrefix };
}

export type ApiKeysService = ReturnType<typeof makeApiKeys>;
