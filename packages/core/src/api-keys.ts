// API Keys service — persisted, hashed, identity-bearing. Raw key is returned ONCE on
// create and never stored; only the sha256 hash is persisted. verify() resolves the
// { orgId, actorId, scopes } identity a caller (e.g. the MCP server) needs.

import { createHash } from 'node:crypto';
import type { ApiKeyRow } from '@companybrain/db';
import { type Context, newId } from './context';

function hash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** The shape returned to callers — never includes the hash. */
export type SafeApiKey = Omit<ApiKeyRow, 'keyHash'>;

/** Identity resolved from a verified key — what the MCP server injects as ToolContext. */
export interface ApiKeyIdentity {
  orgId: string;
  actorId?: string;
  scopes: string[];
}

export function makeApiKeys(ctx: Context) {
  const db = ctx.db;

  async function create(
    orgId: string,
    name: string,
    scopes: string[] = ['read'],
    actorId?: string,
  ): Promise<{ raw: string; row: SafeApiKey }> {
    const raw = `cb_${newId('key')}`;
    const row: ApiKeyRow = {
      id: newId('apikey'),
      orgId,
      name,
      prefix: raw.slice(0, 8),
      keyHash: hash(raw),
      scopes,
      actorId,
      createdAt: Date.now(),
    };
    await db.apiKeys.insert(row);
    const { keyHash: _omit, ...safe } = row;
    return { raw, row: safe };
  }

  async function verify(rawKey: string): Promise<ApiKeyIdentity | null> {
    const row = await db.apiKeys.findByHash(hash(rawKey));
    if (!row) return null;
    await db.apiKeys.touch(row.id, Date.now());
    return { orgId: row.orgId, actorId: row.actorId, scopes: row.scopes };
  }

  async function list(orgId: string): Promise<SafeApiKey[]> {
    const rows = await db.apiKeys.listByOrg(orgId);
    return rows.map(({ keyHash: _omit, ...safe }) => safe);
  }

  async function revoke(id: string): Promise<void> {
    await db.apiKeys.delete(id);
  }

  async function getByPrefix(orgId: string, prefix: string): Promise<SafeApiKey | undefined> {
    const rows = await db.apiKeys.listByOrg(orgId);
    const found = rows.find((k) => k.orgId === orgId && k.prefix === prefix);
    if (!found) return undefined;
    const { keyHash: _omit, ...safe } = found;
    return safe;
  }

  return { create, verify, revoke, list, getByPrefix };
}

export type ApiKeysService = ReturnType<typeof makeApiKeys>;
