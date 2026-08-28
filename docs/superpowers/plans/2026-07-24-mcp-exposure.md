# Companybrain MCP Exposure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose companybrain's domain over MCP (stdio JSON-RPC) so Claude Desktop / Cursor / VS Code can read and gated-write tasks, loops, and leads via a standalone `companybrain mcp` command, attributed to a dedicated agent account and routed through the existing autonomy gate.

**Architecture:** The existing `packages/mcp` server + 9 tools are reused. We add (a) a `create_loop` tool, (b) persistence + an `actorId` to API keys, (c) a new `manageRecords` autonomy action, (d) routing of write tools through `core.autonomy.gate`, and (e) a `companybrain mcp` CLI subcommand that boots a minimal Core and starts the stdio server. The MCP process opens the same SQLite file as the web app (WAL).

**Tech Stack:** TypeScript, pnpm workspaces, better-sqlite3 (WAL), node:test + tsx, MCP JSON-RPC over stdio, Fastify (untouched).

**Spec:** `docs/superpowers/specs/2026-07-24-mcp-exposure-design.md`

## Global Constraints

- **One runnable app invariant:** `companybrain` (no args) must boot the full app exactly as before. `companybrain mcp` is purely additive.
- **`core` never imports a concrete db/queue/auth** — only the ports in `packages/db/src/port.ts`.
- **No new dependencies.** Use stdlib + existing packages only.
- **Fail-closed defaults.** `createTasks` and `manageRecords` default to `'off'`. A freshly connected MCP host is read-only until a human flips a level.
- **No secrets in logs/output.** The API key is read from env at boot, verified, never echoed, never returned by any tool.
- **Tests use `node --test` + tsx** (no new framework). Throwaway temp SQLite file per test file (the pattern in `packages/core/test/`).
- **Every commit uses identity:** `git config user.name "shrijeet singh"` and `git config user.email "shrijeet@vexocore.in"` — verify before every commit.

---

## File Structure

**Modify:**
- `packages/types/src/index.ts` — add `manageRecords` to `AutonomyAction`.
- `packages/core/src/autonomy.ts` — add `manageRecords: 'off'` default.
- `packages/core/src/api-keys.ts` — persist to DB; add `actorId` to `ApiKey`; hash key on persist.
- `packages/db/src/port.ts` — add `ApiKeyRepo` + `ApiKey` row type; add it to `Database`.
- `packages/db/src/sqlite.ts` — add `api_keys` table to DDL; implement `ApiKeyRepo`; load into apiKeys on init.
- `packages/db/src/supabase.ts` — stub `ApiKeyRepo` (throws "not implemented" — supabase is not the ship target; keep the port satisfied).
- `packages/mcp/src/tools.ts` — add `create_loop` tool; route write tools through `core.autonomy.gate`.
- `cli/bin/companybrain.ts` — add `mcp` subcommand dispatch.
- `.env.example` — document `COMPANYBRAIN_MCP_KEY`.
- `README.md` — add MCP section + Claude Desktop config snippet.
- `package.json` — add `test:mcp` script to the `test` aggregate.

**Create:**
- `cli/bin/mcp.ts` — minimal Core boot + key verify + `startMcpServer`.
- `packages/mcp/test/gate.test.ts` — autonomy-mapping + gate-routing unit tests.
- `packages/mcp/test/smoke.test.ts` — stdio JSON-RPC smoke test (spawn the bin, exchange `initialize` + `tools/list`).

---

## Task 1: Add `manageRecords` autonomy action

**Files:**
- Modify: `packages/types/src/index.ts` (line with `export type AutonomyAction = ...`)
- Modify: `packages/core/src/autonomy.ts` (`DEFAULT_AUTONOMY` object)

**Interfaces:**
- Produces: `AutonomyAction` now includes `'manageRecords'`. `DEFAULT_AUTONOMY.manageRecords === 'off'`.

- [x] **Step 1: Write the failing test**

Append to `packages/core/test/autonomy.test.ts` (after the existing tests, before any closing braces):

```ts
test('autonomy: manageRecords defaults to off', async () => {
  const settings = await core.autonomy.get(org);
  assert.equal(settings.manageRecords, 'off', 'manageRecords must default to off');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/core/test/autonomy.test.ts`
Expected: FAIL — `settings.manageRecords` is `undefined` (action not in the type / not defaulted).

- [x] **Step 3: Add the action to the type**

In `packages/types/src/index.ts`, change:

```ts
export type AutonomyAction = 'createTasks' | 'sendReminders' | 'draftReplies' | 'chase' | 'joinMeetings';
```

to:

```ts
export type AutonomyAction = 'createTasks' | 'sendReminders' | 'draftReplies' | 'chase' | 'joinMeetings' | 'manageRecords';
```

- [x] **Step 4: Add the default**

In `packages/core/src/autonomy.ts`, change `DEFAULT_AUTONOMY` to:

```ts
export const DEFAULT_AUTONOMY: AutonomySettings = {
  draftReplies: 'auto',
  chase: 'auto',
  sendReminders: 'auto',
  createTasks: 'off',
  joinMeetings: 'off',
  manageRecords: 'off',
};
```

- [x] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test packages/core/test/autonomy.test.ts`
Expected: PASS (all tests, including the new one).

- [x] **Step 6: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/types/src/index.ts packages/core/src/autonomy.ts packages/core/test/autonomy.test.ts
git commit -m "feat(autonomy): add manageRecords action defaulting to off"
```

---

## Task 2: Persist API keys (DB port + Sqlite adapter)

This task makes `api_keys` survive restarts so the MCP process (separate from the web app) can verify a key the web app created.

**Files:**
- Modify: `packages/db/src/port.ts` (add `ApiKey` + `ApiKeyRepo`, add to `Database`)
- Modify: `packages/db/src/sqlite.ts` (DDL table + repo impl)

**Interfaces:**
- Produces (in `port.ts`):
  ```ts
  export interface ApiKeyRow {
    id: string; orgId: string; name: string; prefix: string;
    keyHash: string; scopes: string[]; actorId?: string;
    createdAt: number; lastUsedAt?: number; expiresAt?: number;
  }
  export interface ApiKeyRepo {
    insert(row: ApiKeyRow): Promise<void>;
    findByHash(keyHash: string): Promise<ApiKeyRow | null>;
    touch(id: string, at: number): Promise<void>;
    listByOrg(orgId: string): Promise<ApiKeyRow[]>;
    delete(id: string): Promise<void>;
  }
  ```
  And `Database` gains `apiKeys: ApiKeyRepo;`.
- Consumes: nothing (this is the foundation layer).

- [x] **Step 1: Write the failing test**

Create `packages/db/test/api-keys.test.ts`:

```ts
// API key persistence — keys survive restart and can be looked up by hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dbPath = join(tmpdir(), `companybrain-apikeys-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { SqliteDatabase } = await import('@companybrain/db');

const db = new SqliteDatabase(dbPath);
await db.init();

function hash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

test('apiKeys: insert then findByHash round-trips', async () => {
  const raw = 'cb_key_test123';
  await db.apiKeys.insert({
    id: 'apikey_1', orgId: 'org_local', name: 'MCP Agent',
    prefix: raw.slice(0, 8), keyHash: hash(raw),
    scopes: ['read', 'write'], actorId: 'user_agent',
    createdAt: Date.now(),
  });
  const found = await db.apiKeys.findByHash(hash(raw));
  assert.ok(found, 'key found by hash');
  assert.equal(found!.actorId, 'user_agent');
  assert.equal(found!.orgId, 'org_local');
});

test('apiKeys: unknown hash returns null', async () => {
  const found = await db.apiKeys.findByHash(hash('cb_does_not_exist'));
  assert.equal(found, null);
});

test('apiKeys: listByOrg and delete', async () => {
  const listed = await db.apiKeys.listByOrg('org_local');
  assert.equal(listed.length, 1);
  await db.apiKeys.delete('apikey_1');
  assert.equal((await db.apiKeys.listByOrg('org_local')).length, 0);
});

test('apiKeys: keys persist across a new connection (simulating a separate MCP process)', async () => {
  await db.apiKeys.insert({
    id: 'apikey_2', orgId: 'org_local', name: 'Other',
    prefix: 'cb_12345', keyHash: hash('cb_persist_me'),
    scopes: ['read'], createdAt: Date.now(),
  });
  await db.close();

  // Reopen the SAME file — this is exactly what the MCP process does vs the web app.
  const db2 = new SqliteDatabase(dbPath);
  await db2.init();
  const found = await db2.apiKeys.findByHash(hash('cb_persist_me'));
  assert.ok(found, 'key survived reopen of the same file');
  assert.equal(found!.actorId, undefined); // this key was created without an actorId
  await db2.close();
});

// cleanup
process.on('exit', () => { try { rmSync(dbPath); } catch {} });
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/db/test/api-keys.test.ts`
Expected: FAIL — `db.apiKeys` is `undefined` (repo not on the Database port yet).

- [x] **Step 3: Add the repo interface to the port**

In `packages/db/src/port.ts`, add after the `ConnectionRepo` interface and before `export interface Database`:

```ts
export interface ApiKeyRow {
  id: string;
  orgId: string;
  name: string;
  prefix: string;
  /** sha256 hex of the raw key. The raw key is never stored. */
  keyHash: string;
  scopes: string[];
  /** owner user id (the agent account). Optional for backwards-compat keys. */
  actorId?: string;
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
}

export interface ApiKeyRepo {
  insert(row: ApiKeyRow): Promise<void>;
  findByHash(keyHash: string): Promise<ApiKeyRow | null>;
  touch(id: string, at: number): Promise<void>;
  listByOrg(orgId: string): Promise<ApiKeyRow[]>;
  delete(id: string): Promise<void>;
}
```

Then add to `export interface Database` (after `connections: ConnectionRepo;`):

```ts
  apiKeys: ApiKeyRepo;
```

- [x] **Step 4: Add the table + impl to the SQLite adapter**

In `packages/db/src/sqlite.ts`:

4a. Add to the `DDL` template string (after the `connections` CREATE TABLE line):

```sql
CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT, prefix TEXT, key_hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL, actor_id TEXT, created_at INTEGER, last_used_at INTEGER, expires_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
```

4b. Add `apiKey: ApiKeyRow;` import type — add `ApiKeyRow, ApiKeyRepo` to the import from `./port` at the top of the file.

4c. Add a field `apiKeys: ApiKeyRepo;` to the `SqliteDatabase` class (next to `connections`).

4d. In the constructor, after `this.connections = { ... }`, add the implementation:

```ts
    this.apiKeys = {
      async insert(row) {
        db.prepare(
          'INSERT INTO api_keys (id, org_id, name, prefix, key_hash, scopes, actor_id, created_at, last_used_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ).run(row.id, row.orgId, row.name, row.prefix, row.keyHash, JSON.stringify(row.scopes), row.actorId ?? null, row.createdAt, row.lastUsedAt ?? null, row.expiresAt ?? null);
      },
      async findByHash(keyHash) {
        const row = db.prepare('SELECT * FROM api_keys WHERE key_hash=?').get(keyHash) as any;
        if (!row) return null;
        return { id: row.id, orgId: row.org_id, name: row.name, prefix: row.prefix, keyHash: row.key_hash, scopes: JSON.parse(row.scopes), actorId: row.actor_id ?? undefined, createdAt: row.created_at, lastUsedAt: row.last_used_at ?? undefined, expiresAt: row.expires_at ?? undefined };
      },
      async touch(id, at) {
        db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(at, id);
      },
      async listByOrg(orgId) {
        const rows = db.prepare('SELECT * FROM api_keys WHERE org_id=?').all(orgId) as any[];
        return rows.map((row) => ({ id: row.id, orgId: row.org_id, name: row.name, prefix: row.prefix, keyHash: row.key_hash, scopes: JSON.parse(row.scopes), actorId: row.actor_id ?? undefined, createdAt: row.created_at, lastUsedAt: row.last_used_at ?? undefined, expiresAt: row.expires_at ?? undefined }));
      },
      async delete(id) {
        db.prepare('DELETE FROM api_keys WHERE id=?').run(id);
      },
    };
```

- [x] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test packages/db/test/api-keys.test.ts`
Expected: PASS (all four tests).

- [x] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — `SupabaseDatabase` in `packages/db/src/supabase.ts` must also satisfy the new `apiKeys` field. If typecheck fails there:

First, add `ApiKeyRepo` to the existing import from `./port` at the top of `supabase.ts`:

```ts
import type {
  // ... existing imports ...
  ApiKeyRepo,
} from './port';
```

Then add the stub as a class field on `SupabaseDatabase`:

```ts
  apiKeys: ApiKeyRepo = {
    async insert() { throw new Error('apiKeys not implemented for Supabase'); },
    async findByHash() { throw new Error('apiKeys not implemented for Supabase'); },
    async touch() { throw new Error('apiKeys not implemented for Supabase'); },
    async listByOrg() { throw new Error('apiKeys not implemented for Supabase'); },
    async delete() { throw new Error('apiKeys not implemented for Supabase'); },
  };
```

(Supabase is not the ship target; the stub keeps the port honest. SQLite is the only adapter this sub-project uses.)

- [x] **Step 7: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/db/src/port.ts packages/db/src/sqlite.ts packages/db/src/supabase.ts packages/db/test/api-keys.test.ts
git commit -m "feat(db): persist api_keys to sqlite (hash + actorId)"
```

---

## Task 3: Rewrite `core/api-keys` to use the persistent store

Rewire the in-memory `makeApiKeys` to read/write through `ctx.db.apiKeys`, add `actorId`, and hash the raw key. The public method names (`create/list/verify/revoke/getByPrefix`) stay the same so callers don't change — but `create` gains an optional `actorId` param.

**Files:**
- Modify: `packages/core/src/api-keys.ts` (rewrite the `makeApiKeys` body)

**Interfaces:**
- Consumes: `ctx.db.apiKeys` (from Task 2), `createHash` from `node:crypto`.
- Produces (unchanged surface, with one additive param):
  ```ts
  create(orgId: string, name: string, scopes?: string[], actorId?: string): Promise<{ raw: string; row: Omit<ApiKeyRow,'keyHash'> }>
  verify(rawKey: string): Promise<{ orgId: string; actorId?: string; scopes: string[] } | null>
  list(orgId: string): Promise<Omit<ApiKeyRow,'keyHash'>[]>
  revoke(id: string): Promise<void>
  getByPrefix(orgId: string, prefix: string): Promise<Omit<ApiKeyRow,'keyHash'> | undefined>
  ```
  Note: `create` now returns `{ raw, row }` — the raw key is returned ONCE to the caller (the web app), never stored. `verify` returns the identity needed for MCP, not the hash.

- [x] **Step 1: Write the failing test**

Create `packages/core/test/api-keys.test.ts`:

```ts
// api-keys: persisted, hashed, identity-bearing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-core-apikeys-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap } = await import('@companybrain/core');
const { LOCAL_ORG_ID } = await import('@companybrain/auth');
const boot = await bootstrap();
const core = boot.core;
const org = LOCAL_ORG_ID;

test('api-keys: create returns raw once, verify resolves identity', async () => {
  const { raw, row } = await core.apiKeys.create(org, 'MCP Agent', ['read', 'write'], 'user_agent1');
  assert.ok(raw.startsWith('cb_'), 'raw key has cb_ prefix');
  assert.equal(row.actorId, 'user_agent1');
  assert.equal(row.orgId, org);

  const id = await core.apiKeys.verify(raw);
  assert.ok(id, 'verify resolves');
  assert.equal(id!.actorId, 'user_agent1');
  assert.equal(id!.orgId, org);
  assert.deepEqual(id!.scopes, ['read', 'write']);
});

test('api-keys: wrong key returns null', async () => {
  const id = await core.apiKeys.verify('cb_totally_wrong');
  assert.equal(id, null);
});

test('api-keys: list hides the hash; revoke removes', async () => {
  const { row } = await core.apiKeys.create(org, 'Other', ['read']);
  const listed = await core.apiKeys.list(org);
  assert.ok(listed.some((k) => k.id === row.id));
  assert.ok(!(listed[0] as any).keyHash, 'hash never exposed via list');
  await core.apiKeys.revoke(row.id);
  assert.ok(!(await core.apiKeys.list(org)).some((k) => k.id === row.id));
});

process.on('exit', () => { try { rmSync(dbPath); } catch {} });
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/core/test/api-keys.test.ts`
Expected: FAIL — `core.apiKeys` doesn't exist yet on Core (the service is defined but not wired into `bootstrap`), or `create` returns the old in-memory shape.

- [x] **Step 3: Rewrite `makeApiKeys`**

Replace the entire body of `packages/core/src/api-keys.ts` with:

```ts
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
```

- [x] **Step 4: Wire `apiKeys` into Core**

In `packages/core/src/index.ts`:

4a. Add the import at the top:
```ts
import { makeApiKeys } from './api-keys';
```

4b. Add to the `Core` interface (next to `ai: ...`):
```ts
  apiKeys: ReturnType<typeof makeApiKeys>;
```

4c. In both `createCoreFromPorts` and `bootstrap`, add the field to the returned Core object (next to `ai: makeAi(ctx),`):
```ts
    apiKeys: makeApiKeys(ctx),
```

- [x] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test packages/core/test/api-keys.test.ts`
Expected: PASS (all three tests).

- [x] **Step 6: Run the full core test suite to confirm no regression**

Run: `pnpm test`
Expected: PASS — no existing test breaks. (If an existing test referenced the old `core.apiKeys.create(org, name)` 3-arg shape, it still works since `actorId` is optional.)

- [x] **Step 7: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/core/src/api-keys.ts packages/core/src/index.ts packages/core/test/api-keys.test.ts
git commit -m "feat(core): persist api keys with hash + actorId, resolve identity on verify"
```

---

## Task 4: Add `create_loop` MCP tool + route writes through the autonomy gate

**Files:**
- Modify: `packages/mcp/src/tools.ts`

**Interfaces:**
- Consumes: `core.loops.capture(input: CaptureLoopInput)`, `core.autonomy.gate(action, opts)`, `AutonomyAction` from types.
- Produces: `TOOLS` now has 10 entries; each write tool returns `{ gated: 'auto' | 'ask' | 'off', ...result }`.

**Autonomy mapping (locked):**
- `create_task`, `create_loop` → `'createTasks'`
- `complete_task`, `assign_task`, `close_loop`, `create_lead`, `advance_lead` → `'manageRecords'`
- Reads (`list_tasks`, `list_loops`, `search`, `get_dashboard`) → never gated.

- [x] **Step 1: Write the failing test**

Create `packages/mcp/test/gate.test.ts`:

```ts
// MCP gate mapping + routing: writes go through core.autonomy.gate; reads never do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-mcp-gate-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap } = await import('@companybrain/core');
const { LOCAL_ORG_ID } = await import('@companybrain/auth');
const { TOOLS, findTool } = await import('@companybrain/mcp');

const boot = await bootstrap();
const core = boot.core;
const org = LOCAL_ORG_ID;
const ctx = { orgId: org, actorId: 'user_agent_test' };

// The set of tool names we expect to be gated, mapped to their autonomy action.
const GATED: Record<string, string> = {
  create_task: 'createTasks',
  create_loop: 'createTasks',
  complete_task: 'manageRecords',
  assign_task: 'manageRecords',
  close_loop: 'manageRecords',
  create_lead: 'manageRecords',
  advance_lead: 'manageRecords',
};

test('gate: create_loop tool exists', () => {
  assert.ok(findTool('create_loop'), 'create_loop tool is registered');
});

test('gate: defaults are off → every gated write returns "blocked" and mutates nothing', async () => {
  // create_task
  const before = (await core.tasks.list(org)).length;
  const r = await findTool('create_task')!.handler({ title: 'x' }, core, ctx);
  assert.equal(r.gated, 'off', 'create_task blocked by default');
  assert.equal((await core.tasks.list(org)).length, before, 'no task created');

  // close_loop needs an existing loop; capture one directly via core first.
  const loop = await core.loops.capture({ orgId: org, actorId: 'u', title: 'L', why: 'w', side: 'yours', channel: 'manual' });
  const rc = await findTool('close_loop')!.handler({ id: loop.id }, core, ctx);
  assert.equal(rc.gated, 'off', 'close_loop blocked by default');
  const still = await core.loops.get(loop.id);
  assert.equal(still!.status, 'open', 'loop not closed');
});

test('gate: createTasks=auto → create_task mutates and is attributed to agent', async () => {
  await core.autonomy.set(org, 'createTasks', 'auto');
  const r = await findTool('create_task')!.handler({ title: 'via mcp' }, core, ctx);
  assert.equal(r.gated, 'auto');
  assert.ok(r.task, 'task returned');
  assert.equal(r.task.createdBy, 'user_agent_test', 'attributed to agent actor');
});

test('gate: createTasks=ask → create_task returns "queued", no task created', async () => {
  await core.autonomy.set(org, 'createTasks', 'ask');
  const before = (await core.tasks.list(org)).length;
  const r = await findTool('create_task')!.handler({ title: 'pending one' }, core, ctx);
  assert.equal(r.gated, 'ask');
  assert.equal((await core.tasks.list(org)).length, before, 'no task created on ask');
  const pending = await core.approvals.list(org, 'pending');
  assert.ok(pending.some((a) => a.action === 'createTasks'), 'approval queued');
});

test('gate: reads are never blocked (createTasks still ask, but list works)', async () => {
  const r = await findTool('list_tasks')!.handler({}, core, ctx);
  assert.ok(Array.isArray(r.tasks));
  const d = await findTool('get_dashboard')!.handler({}, core, ctx);
  assert.ok(typeof d.openLoops === 'number');
});

process.on('exit', () => { try { rmSync(dbPath); } catch {} });
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/mcp/test/gate.test.ts`
Expected: FAIL — `create_loop` tool doesn't exist; write handlers don't return `gated`; they mutate unconditionally.

- [x] **Step 3: Rewrite `packages/mcp/src/tools.ts`**

Replace the entire file with the version below. Key changes: a `gateWrite()` helper, a `create_loop` tool, and every write handler gated.

```ts
// MCP tool registry — declarative descriptions + handlers that wrap core domain ops.
// Reads run directly. Writes route through core.autonomy.gate first; the gate returns
// the resolved level and the handler only mutates on 'auto'. 'ask' queues an approval
// for human review (the mutation is NOT auto-replayed — approving only clears the
// queue item; an admin who wants the action done re-runs it or sets the level to auto).
// 'off' refuses. Every result carries `gated` so the host can narrate the outcome.

import type { Core } from '@companybrain/core';
import type { AutonomyAction } from '@companybrain/types';

export interface ToolContext {
  orgId?: string;
  actorId?: string;
}

export const DEFAULT_ORG_ID = 'org_local';
export const DEFAULT_ACTOR_ID = 'user_local';

export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: any, core: Core, ctx: ToolContext) => Promise<any>;
}

async function identity(core: Core, ctx: ToolContext): Promise<{ orgId: string; actorId: string }> {
  if (ctx.orgId && ctx.actorId) return { orgId: ctx.orgId, actorId: ctx.actorId };
  try {
    const principal = await core.ctx.auth.current();
    return {
      orgId: ctx.orgId ?? principal.orgId ?? DEFAULT_ORG_ID,
      actorId: ctx.actorId ?? principal.userId ?? DEFAULT_ACTOR_ID,
    };
  } catch {
    return { orgId: ctx.orgId ?? DEFAULT_ORG_ID, actorId: ctx.actorId ?? DEFAULT_ACTOR_ID };
  }
}

const str = (description: string) => ({ type: 'string', description });

/**
 * Gate a write through autonomy. Returns { proceed: boolean, level }.
 * - auto: proceed === true (mutate).
 * - ask:   an approval is queued; proceed === false (do not mutate).
 * - off:   nothing queued; proceed === false.
 */
async function gateWrite(
  core: Core,
  action: AutonomyAction,
  orgId: string,
  title: string,
): Promise<{ proceed: boolean; level: 'auto' | 'ask' | 'off' }> {
  const level = await core.autonomy.gate(action, { orgId, title });
  return { proceed: level === 'auto', level };
}

export const TOOLS: Tool[] = [
  // ---------- READS (never gated) ----------
  {
    name: 'list_tasks',
    description:
      'List tasks for the org. Optionally filter by day (today|tomorrow|upcoming) and/or priority (low|med|high).',
    inputSchema: {
      type: 'object',
      properties: {
        day: { type: 'string', enum: ['today', 'tomorrow', 'upcoming'], description: 'Filter by board day.' },
        priority: { type: 'string', enum: ['low', 'med', 'high'], description: 'Filter by priority.' },
      },
    },
    async handler(args, core, ctx) {
      const { orgId } = await identity(core, ctx);
      let tasks = await core.tasks.list(orgId);
      if (args?.day) tasks = tasks.filter((t) => t.day === args.day);
      if (args?.priority) tasks = tasks.filter((t) => t.priority === args.priority);
      return { count: tasks.length, tasks };
    },
  },

  {
    name: 'list_loops',
    description: 'List open loops (things waiting on a person — "their court" or "your court").',
    inputSchema: {
      type: 'object',
      properties: {
        side: { type: 'string', enum: ['yours', 'theirs'], description: 'Filter by whose court the ball is in.' },
      },
    },
    async handler(args, core, ctx) {
      const { orgId } = await identity(core, ctx);
      const loops = await core.loops.list(orgId, args?.side);
      const open = loops.filter((l) => l.status !== 'closed');
      return { count: open.length, loops: open };
    },
  },

  {
    name: 'search',
    description: 'Search across tasks, loops, and leads by case-insensitive title/name substring.',
    inputSchema: {
      type: 'object',
      properties: { query: str('Substring to search for.') },
      required: ['query'],
    },
    async handler(args, core, ctx) {
      const { orgId } = await identity(core, ctx);
      const q = String(args.query ?? '').toLowerCase();
      if (!q) return { tasks: [], loops: [], leads: [] };
      const [tasks, loops, leads] = await Promise.all([
        core.tasks.list(orgId),
        core.loops.list(orgId),
        core.leads.list(orgId),
      ]);
      return {
        tasks: tasks.filter((t) => t.title.toLowerCase().includes(q)),
        loops: loops.filter((l) => l.title.toLowerCase().includes(q)),
        leads: leads.filter((l) => l.name.toLowerCase().includes(q) || l.company.toLowerCase().includes(q)),
      };
    },
  },

  {
    name: 'get_dashboard',
    description: 'Return a KPI summary: open loops, tasks by day, leads by stage.',
    inputSchema: { type: 'object', properties: {} },
    async handler(_args, core, ctx) {
      const { orgId } = await identity(core, ctx);
      const [loops, tasks, leads] = await Promise.all([
        core.loops.list(orgId),
        core.tasks.list(orgId),
        core.leads.list(orgId),
      ]);
      const openLoops = loops.filter((l) => l.status !== 'closed').length;
      const tasksByDay = {
        today: tasks.filter((t) => t.day === 'today').length,
        tomorrow: tasks.filter((t) => t.day === 'tomorrow').length,
        upcoming: tasks.filter((t) => t.day === 'upcoming').length,
      };
      const leadsByStage = leads.reduce<Record<string, number>>((acc, l) => {
        acc[l.stage] = (acc[l.stage] ?? 0) + 1;
        return acc;
      }, {});
      return { openLoops, totalTasks: tasks.length, tasksByDay, totalLeads: leads.length, leadsByStage };
    },
  },

  // ---------- WRITES (gated) ----------
  {
    name: 'create_task',
    description: 'Create a new task. Gated by autonomy.createTasks (off|ask|auto).',
    inputSchema: {
      type: 'object',
      properties: {
        title: str('Task title.'),
        day: { type: 'string', enum: ['today', 'tomorrow', 'upcoming'], description: 'Board day. Default today.' },
        priority: { type: 'string', enum: ['low', 'med', 'high'], description: 'Priority. Default none.' },
        list: str('List/board column name. Default "Inbox".'),
      },
      required: ['title'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'createTasks', orgId, `Create task: ${args.title}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'createTasks') };
      const task = await core.tasks.create({
        orgId, actorId,
        title: args.title, day: args.day, priority: args.priority ?? null, list: args.list,
      });
      return { gated: 'auto', task };
    },
  },

  {
    name: 'create_loop',
    description: 'Capture a new open loop (something waiting on a person). Gated by autonomy.createTasks.',
    inputSchema: {
      type: 'object',
      properties: {
        title: str('Short summary of the loop.'),
        why: str('Why it matters / what is needed.'),
        side: { type: 'string', enum: ['yours', 'theirs'], description: 'Whose court the ball is in.' },
      },
      required: ['title', 'why', 'side'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'createTasks', orgId, `Create loop: ${args.title}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'createTasks') };
      const loop = await core.loops.capture({
        orgId, actorId,
        title: args.title, why: args.why, side: args.side, channel: 'manual',
      });
      return { gated: 'auto', loop };
    },
  },

  {
    name: 'complete_task',
    description: 'Mark a task complete by id. Gated by autonomy.manageRecords.',
    inputSchema: {
      type: 'object',
      properties: { id: str('Task id (e.g. task_abcd1234).') },
      required: ['id'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'manageRecords', orgId, `Complete task ${args.id}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'manageRecords') };
      const task = await core.tasks.complete(args.id, actorId);
      return { gated: 'auto', task };
    },
  },

  {
    name: 'assign_task',
    description: 'Assign a task to one or more users. Gated by autonomy.manageRecords.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('Task id.'),
        userIds: { type: 'array', items: { type: 'string' }, description: 'User ids to assign.' },
      },
      required: ['id', 'userIds'],
    },
    async handler(args, core, ctx) {
      const { orgId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'manageRecords', orgId, `Assign task ${args.id}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'manageRecords') };
      const task = await core.ctx.db.tasks.update(args.id, { assignees: args.userIds });
      return { gated: 'auto', task };
    },
  },

  {
    name: 'close_loop',
    description: 'Close a loop by id. Gated by autonomy.manageRecords.',
    inputSchema: {
      type: 'object',
      properties: { id: str('Loop id.') },
      required: ['id'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'manageRecords', orgId, `Close loop ${args.id}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'manageRecords') };
      const loop = await core.loops.close(args.id, actorId);
      return { gated: 'auto', loop };
    },
  },

  {
    name: 'create_lead',
    description: 'Create a new lead (enters the pipeline at "new"). Gated by autonomy.manageRecords.',
    inputSchema: {
      type: 'object',
      properties: {
        name: str('Contact name.'),
        company: str('Company name.'),
        email: str('Contact email.'),
        phone: str('Contact phone.'),
      },
      required: ['name'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'manageRecords', orgId, `Create lead: ${args.name}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'manageRecords') };
      const lead = await core.leads.create({
        orgId, actorId, name: args.name, company: args.company, email: args.email, phone: args.phone,
      });
      return { gated: 'auto', lead };
    },
  },

  {
    name: 'advance_lead',
    description: 'Advance a lead to the next pipeline stage. Gated by autonomy.manageRecords.',
    inputSchema: {
      type: 'object',
      properties: { id: str('Lead id.') },
      required: ['id'],
    },
    async handler(args, core, ctx) {
      const { orgId, actorId } = await identity(core, ctx);
      const { proceed, level } = await gateWrite(core, 'manageRecords', orgId, `Advance lead ${args.id}`);
      if (!proceed) return { gated: level, message: gateMessage(level, 'manageRecords') };
      const lead = await core.leads.advance(args.id, actorId);
      return { gated: 'auto', lead };
    },
  },
];

function gateMessage(level: 'ask' | 'off', action: string): string {
  if (level === 'off') return `Blocked: autonomy.${action} is 'off'. Ask an admin to set it to 'ask' or 'auto'.`;
  return `Queued for human approval: autonomy.${action} is 'ask'. It will appear in the companybrain Auto tab; approving clears the queue (no auto-replay).`;
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}
```

- [x] **Step 4: Run the gate test to verify it passes**

Run: `node --import tsx --test packages/mcp/test/gate.test.ts`
Expected: PASS (all five tests).

- [x] **Step 5: Wire the new test into the aggregate `test` script**

In the root `package.json`, append the new test files to the `test` script's `--test` list:

```json
"test": "node --import tsx --test packages/core/test/domain.test.ts packages/core/test/autonomy.test.ts packages/core/test/undo.test.ts packages/core/test/features.test.ts packages/core/test/methods.test.ts packages/core/test/analytics.test.ts packages/core/test/api-keys.test.ts packages/integrations/test/pipeline.test.ts packages/mcp/test/gate.test.ts"
```

- [x] **Step 6: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all tests green.

**Pre-existing caveat (do not fix here):** the aggregate `test` script runs every file in one Node process, and each test file sets `process.env.COMPANYBRAIN_DB_PATH` at its top level. Because `bootstrap()` reads that env at call-time, all files effectively share whichever DB path was set last. The existing suite already lives with this; every test file uses a unique temp path with `pid`+`Date.now()`, so within a single file the right DB is used. If the aggregate ever flakes on DB-path races, that's a separate cleanup (give each file an explicit `bootstrap({ db: { sqlitePath } })`), not part of this sub-project.

- [x] **Step 7: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/mcp/src/tools.ts packages/mcp/test/gate.test.ts package.json
git commit -m "feat(mcp): add create_loop, route writes through autonomy gate"
```

---

## Task 5: `companybrain mcp` CLI subcommand

**Files:**
- Modify: `cli/bin/companybrain.ts` (add argv dispatch at the very top, before the full-app boot)
- Create: `cli/bin/mcp.ts`

**Interfaces:**
- Consumes: `createCoreFromPorts`, `createDatabase`, `createQueue`, `createAuth` (the same ports `bootstrap()` uses, but called directly so **no workers are registered**), `core.apiKeys.verify(raw)`, `startMcpServer` from `@companybrain/mcp`.
- Produces: `companybrain mcp` exits non-zero on bad/missing key; otherwise blocks on the stdio server.

**Why NOT `bootstrap()` (important):** `bootstrap()` calls `registerWorkers(core.ctx)`, and the in-process queue fires `enqueue`/`schedule` timers **regardless** of whether `start()` was called (the `started` flag is never checked in `packages/queue/src/in-process.ts`). So if MCP created a loop with `createTasks=auto`, `loops.capture` → `gateAction('chase')` → `dispatch` → `queue.enqueue('chaseLoop', ..., delayMs=60s)` would arm a real 60s timer in the MCP process. To keep the MCP process truly worker-free, it boots Core **directly from ports** (`createCoreFromPorts`) and never calls `registerWorkers`. The queue port still must be constructed (the Core signature requires it), but with no handlers registered, `enqueue` becomes a no-op `queueMicrotask` whose `run()` logs "no handler registered — dropping job" and does nothing. The messenger defaults to `consoleMessenger` (also unused — no worker exists to call it).

- [x] **Step 1: Write the failing test**

Create `packages/mcp/test/smoke.test.ts`:

```ts
// Smoke test: the `mcp` subcommand speaks JSON-RPC over stdio.
// We can't easily spawn the tsx bin cross-platform, so we test the entrypoint's
// key-resolution logic directly + a full initialize/tools/list exchange against
// startMcpServer via an in-process readline shim is out of scope; instead we
// assert the entrypoint's export contract and the tool count via the registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '@companybrain/mcp';

test('smoke: MCP exposes 10 tools', () => {
  const names = TOOLS.map((t) => t.name).sort();
  assert.equal(names.length, 10);
  assert.ok(names.includes('create_loop'));
  assert.ok(names.includes('get_dashboard'));
});

test('smoke: every tool has name, description, inputSchema, handler', () => {
  for (const t of TOOLS) {
    assert.ok(typeof t.name === 'string' && t.name.length > 0);
    assert.ok(typeof t.description === 'string' && t.description.length > 0);
    assert.ok(typeof t.inputSchema === 'object');
    assert.equal(typeof t.handler, 'function');
  }
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/mcp/test/smoke.test.ts`
Expected: PASS already (this is a guard test) — but run it to establish the baseline. If `TOOLS` has 10 entries this passes immediately; the value is that it fails loudly if a future edit drops a tool.

- [x] **Step 3: Create the MCP entrypoint**

Create `cli/bin/mcp.ts`:

```ts
#!/usr/bin/env -S npx tsx
// companybrain mcp — standalone MCP stdio server. Boots a minimal Core directly from
// ports (no web UI, no registered workers, no port), verifies the env-supplied API key,
// injects the agent identity as ToolContext, and starts the JSON-RPC server. Spawned by
// MCP hosts (Claude Desktop, Cursor, VS Code) directly from their config.

import { createCoreFromPorts } from '@companybrain/core';
import { createDatabase } from '@companybrain/db';
import { createQueue } from '@companybrain/queue';
import { createAuth } from '@companybrain/auth';
import { startMcpServer } from '@companybrain/mcp';

// SECURITY: nothing in this process must log to stdout (that's the JSON-RPC channel).
// All diagnostics go to stderr.
const warn = (msg: string) => process.stderr.write(`[companybrain mcp] ${msg}\n`);

async function main() {
  const rawKey = process.env.COMPANYBRAIN_MCP_KEY ?? '';
  if (!rawKey) {
    warn('No COMPANYBRAIN_MCP_KEY set. Create an agent account + API key in the web app (Settings → User Management), then set COMPANYBRAIN_MCP_KEY.');
    process.exit(2);
  }

  // Minimal Core: same ports as bootstrap(), but we do NOT call registerWorkers — so the
  // queue (required by the Core signature) has no handlers and any enqueue is a no-op.
  const db = createDatabase();
  const queue = createQueue();
  const auth = createAuth();
  await db.init();
  await queue.init();
  await auth.init();
  const core = createCoreFromPorts({ db, queue, auth });

  const identity = await core.apiKeys.verify(rawKey);
  if (!identity) {
    warn('COMPANYBRAIN_MCP_KEY did not verify. Revoke and re-create the key from the web app.');
    await db.close();
    await queue.close();
    process.exit(3);
  }

  startMcpServer({
    core,
    name: 'companybrain',
    version: '0.1.0',
    context: { orgId: identity.orgId, actorId: identity.actorId ?? 'user_agent' },
  });
  // startMcpServer blocks on readline; no further code runs until stdin closes.
}

main().catch((err) => {
  warn(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
```

- [x] **Step 4: Add subcommand dispatch to the main bin**

In `cli/bin/companybrain.ts`, insert this block immediately after the imports and **before** the `process.on('unhandledRejection', ...)` handlers (so a bad key exits before any web-app wiring runs):

```ts
// --- Subcommand dispatch: `companybrain mcp` runs the standalone MCP server. ---
const subcommand = process.argv[2];
if (subcommand === 'mcp') {
  // Hand off to the MCP entrypoint. dynamic import keeps MCP-only deps out of the
  // web-app boot path; the web app never loads @companybrain/mcp.
  await import('./mcp.js');
  // mcp.ts blocks on its readline loop; control does not return here.
  // (Guard: if it ever does return, exit cleanly without starting the web app.)
  process.exit(0);
}
```

- [x] **Step 5: Run the smoke test**

Run: `node --import tsx --test packages/mcp/test/smoke.test.ts`
Expected: PASS.

- [x] **Step 6: Manual smoke — bad key exits cleanly**

Run: `COMPANYBRAIN_MCP_KEY=cb_bogus npx tsx cli/bin/companybrain.ts mcp < /dev/null`
Expected: stderr prints `did not verify`, process exits with code `3`. Nothing printed to stdout.

- [x] **Step 7: Manual smoke — missing key exits cleanly**

Run: `npx tsx cli/bin/companybrain.ts mcp < /dev/null`
Expected: stderr prints the setup message, process exits with code `2`. Nothing to stdout.

- [x] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add cli/bin/companybrain.ts cli/bin/mcp.ts packages/mcp/test/smoke.test.ts
git commit -m "feat(cli): add `companybrain mcp` standalone stdio server"
```

---

## Task 6: Docs — `.env.example` + README MCP section

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [x] **Step 1: Add the env var to `.env.example`**

Append to `.env.example`:

```
# MCP stdio server — `companybrain mcp`. Set to an API key created for an `agent`
# account in the web app (Settings → User Management). The MCP host (Claude Desktop,
# Cursor) spawns `companybrain mcp` with this in its env. Leave unset to disable MCP.
COMPANYBRAIN_MCP_KEY=
```

- [x] **Step 2: Add the MCP section to README.md**

Insert before the `## Status` section in `README.md`:

```markdown
## Use companybrain from Claude Desktop / Cursor / VS Code (MCP)

companybrain speaks the Model Context Protocol over stdio, so any MCP host can read and (gated) write your tasks, loops, and leads.

**One-time setup (in the running web app):**

1. **Settings → User Management →** create a user with role **agent** (e.g. name "MCP Agent").
2. Create an API key for that agent and copy it (shown once).
3. In **Settings → Auto**, decide what the agent may do. By default a connected host is **read-only** — set `createTasks` and/or `manageRecords` to `ask` (propose, you approve) or `auto` (act, then log) to allow writes.

**Connect a host (Claude Desktop `claude_desktop_config.json`):**

\`\`\`json
{
  "mcpServers": {
    "companybrain": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/companybrain/cli/bin/companybrain.ts", "mcp"],
      "env": { "COMPANYBRAIN_MCP_KEY": "cb_..." }
    }
  }
}
\`\`\`

(Cursor / VS Code / Cline: same command + args + env in their MCP settings.)

The MCP process opens the same `~/.companybrain/companybrain.sqlite` file as the web app (WAL), so they coexist. Every write is attributed to the "MCP Agent" account in the audit trail and runs through the same autonomy + approval + undo path as everything else.
```

- [x] **Step 3: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add .env.example README.md
git commit -m "docs: MCP stdio server setup + Claude Desktop config"
```

---

## Task 7: Final verification

- [x] **Step 1: Full clean test run**

Run: `pnpm test`
Expected: all tests PASS (core domain, autonomy, undo, features, methods, analytics, api-keys, integrations pipeline, mcp gate, mcp smoke).

- [x] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [x] **Step 3: Boot the web app unchanged**

Run: `pnpm start` (or `pnpm dev`)
Expected: the app boots exactly as before, prints the banner, opens a browser. Confirms the additive invariant.

> **Verified 2026-08-28.** Running this step surfaced two gaps that were then fixed (see the
> `fix(mcp): make the documented MCP setup actually possible` commit): there was no route or UI
> to mint an API key at all, and `companybrain mcp` booted the whole web app after starting the
> MCP server. With those fixed the step passes — `tools/list` returns **11** tools (10 plus the
> `create_loop` added by Task 4), `create_task` returns `"gated":"auto"`, and the task appears in
> the web app attributed to the key's actor.

- [x] **Step 4: End-to-end MCP against a real key (manual)**

In the running web app:
1. Create the agent user + API key (copy `cb_...`).
2. Set `manageRecords` to `auto` in Settings → Auto.
3. Run `COMPANYBRAIN_MCP_KEY=cb_... npx tsx cli/bin/companybrain.ts mcp`, paste this into stdin and press Enter:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_task","arguments":{"title":"MCP end-to-end check"}}}
```

Expected: three JSON-RPC responses on stdout. The `tools/list` response lists 10 tools. The `create_task` response has `"gated":"auto"` and a `task` object. In the web app, a task "MCP end-to-end check" appears, attributed to the MCP Agent account.

- [x] **Step 5: Commit (if any fixups were needed)**

If steps 1–4 needed no fixups, there is nothing to commit. If they did, commit the fixups under the appropriate task's message style.
