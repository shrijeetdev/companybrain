# Companybrain AI Executor + OpenRouter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a task into LLM-executed work — mark a task with an action type (`generate` or `publish_blog`), an in-process worker calls OpenRouter (model chosen per action), runs the action on the output, stores the result, and completes the task — all gated through the existing autonomy off/ask/auto knob.

**Architecture:** New `runAiTask` queue worker alongside the existing 5 workers. A thin OpenRouter fetch client (OpenAI-compatible API). A per-action routing table picks the model. Action adapters (`generate`, `publish_blog`) sit behind an `Action` interface so more can follow. Task AI state rides on the existing JSON `doc`; run history goes in a new append-only `ai_runs` table. Outward-facing actions default to `ask` and WordPress always gets a draft, never a live post.

**Tech Stack:** TypeScript, pnpm workspaces, better-sqlite3 (WAL), node:test + tsx, fetch (OpenRouter + WordPress REST), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-24-ai-executor-design.md`

## Global Constraints

- **One runnable app.** The executor runs in the existing in-process worker. No new process, no new external service (OpenRouter + WordPress are APIs, not services we run).
- **`core` never imports a concrete db** — only the ports in `packages/db/src/port.ts`. The OpenRouter client + WordPress client live in `packages/integrations` (like the existing `llm.ts`); `core` consumes them via injected deps, never imports them directly.
- **No new dependencies.** Use `fetch` (Node 18+ built-in), stdlib, existing packages only.
- **Fail-closed defaults.** `executeAi` autonomy defaults to `ask`; `publish_blog` action floor is `ask` AND always creates a WordPress **draft** (never a live post). The effective gate level is the stricter of the global gate and the action's floor.
- **No secrets in client/logs/output.** `OPENROUTER_API_KEY` and the WordPress application password are server-side; the WP password is encrypted at rest via the existing `encryptJSON`. API responses for WP creds return only `"configured": true`, never the secret.
- **Tests use `node --test` + tsx**, throwaway temp SQLite file per test file (pattern in `packages/core/test/`). OpenRouter/WordPress/fetch calls are mocked in tests — never real network.
- **Every commit uses identity:** verify `git config user.name` is `shrijeet singh` and `user.email` is `shrijeet@vexocore.in` before every commit.

---

## File Structure

**Modify:**
- `packages/types/src/index.ts` — `AiActionType`, `AiStatus`, `AiTaskConfig`, Task AI fields; `'runAiTask'` JobName; `'executeAi'` AutonomyAction; `'wordpress'` ConnectionChannel.
- `packages/core/src/autonomy.ts` — `executeAi: 'ask'` default.
- `packages/core/src/context.ts` — add `executor` dep to Context (the LLM+action runner injection point).
- `packages/core/src/index.ts` — wire `aiRuns` repo into Core; build the executor with injected OpenRouter client.
- `packages/core/src/tasks.ts` — `setAiAction`, `addComment`, `approveAiRun`.
- `packages/core/src/workers.ts` — `runAiTask` handler.
- `packages/db/src/port.ts` — `AiRunRepo` + `AiRun` type; `wordpress` channel; `aiRuns` on Database.
- `packages/db/src/sqlite.ts` — `ai_runs` table + impl.
- `packages/db/src/supabase.ts` — stub `AiRunRepo`.
- `packages/integrations/src/index.ts` — export openrouter client + wordpress client.
- `cli/bin/companybrain.ts` — inject the real OpenRouter client + executor into bootstrap.
- `packages/server/src/server.ts` (or routes) — AI task + run + WP-creds endpoints.
- `.env.example` — `OPENROUTER_API_KEY`, model overrides.
- `package.json` — add new test files to the `test` aggregate.

**Create:**
- `packages/integrations/src/openrouter.ts` — OpenRouter fetch client.
- `packages/integrations/src/wordpress.ts` — WordPress REST publish helper.
- `packages/core/src/ai-router.ts` — model routing table + `resolveModel`.
- `packages/core/src/ai-actions.ts` — `Action` interface + `generate`/`publish_blog` + registry.
- `packages/core/src/executor.ts` — the runner: gate → model → prompt → LLM → action → record. Injected into Context as `executor`.
- `packages/core/test/ai-router.test.ts`, `ai-actions.test.ts`, `executor.test.ts`.
- `packages/integrations/test/openrouter.test.ts`.

---

## Task 1: Types — AI action, status, run, gate, channel

**Files:**
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces: `AiActionType`, `AiStatus`, `AiTaskConfig`, `AiRun`, `AiRunStatus`; adds `aiAction?`/`aiStatus?`/`aiRunId?`/`aiConfig?` to `Task`; adds `'runAiTask'` to `JobName`; adds `'executeAi'` to `AutonomyAction`; adds `'wordpress'` to `ConnectionRecord['channel']`.

- [ ] **Step 1: Add the AI types**

In `packages/types/src/index.ts`, after the `Priority`/`TaskDay` types (near the top), add:

```ts
/** The kind of work an AI task performs. Extensible — new actions are added to this union. */
export type AiActionType = 'generate' | 'publish_blog';

/** Lifecycle of an AI task's execution. */
export type AiStatus = 'queued' | 'running' | 'awaiting_review' | 'done' | 'failed' | 'cancelled';

/** Status of a single run record (a task can be retried → many runs). */
export type AiRunStatus = 'running' | 'done' | 'failed' | 'awaiting_review';

/** Per-task AI configuration overrides. */
export interface AiTaskConfig {
  promptOverride?: string;
  modelOverride?: string;
}

/** One execution attempt of an AI task. Append-only history. */
export interface AiRun {
  id: string;
  orgId: string;
  taskId: string;
  action: AiActionType;
  model: string;
  status: AiRunStatus;
  systemPrompt: string;
  userPrompt: string;
  output?: string;
  resultRef?: string;
  costUsd?: number | null;
  durationMs?: number;
  error?: string;
  at: number;
}
```

- [ ] **Step 2: Add AI fields to the Task interface**

In the same file, find `export interface Task { ... }` and add these four optional fields (before the closing brace, after `dueAt`):

```ts
  /** When set, this task is AI-executable via the given action. null/absent = normal human task. */
  aiAction?: AiActionType | null;
  /** Current execution state of the AI task. */
  aiStatus?: AiStatus;
  /** id of the latest ai_runs row. */
  aiRunId?: string;
  /** Per-task overrides (prompt, model). */
  aiConfig?: AiTaskConfig;
```

- [ ] **Step 3: Extend JobName and AutonomyAction**

In the same file:

Change:
```ts
export type JobName = 'chaseLoop' | 'replyLoop' | 'sendBriefing' | 'autoSweep' | 'sendReminder';
```
to:
```ts
export type JobName = 'chaseLoop' | 'replyLoop' | 'sendBriefing' | 'autoSweep' | 'sendReminder' | 'runAiTask';
```

Change:
```ts
export type AutonomyAction = 'createTasks' | 'sendReminders' | 'draftReplies' | 'chase' | 'joinMeetings' | 'manageRecords';
```
to:
```ts
export type AutonomyAction = 'createTasks' | 'sendReminders' | 'draftReplies' | 'chase' | 'joinMeetings' | 'manageRecords' | 'executeAi';
```

- [ ] **Step 4: Add the wordpress connection channel**

Find `export interface ConnectionRecord { ... }` and change the `channel` field's union to include `'wordpress'`:

```ts
  channel: 'whatsapp_cloud' | 'whatsapp_baileys' | 'gmail' | 'slack' | 'telegram' | 'github' | 'calendar' | 'wordpress';
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (these are additive type changes; existing code still type-checks because every new field on Task is optional, and the new JobName/AutonomyAction members are only consumed by code we add later).

- [ ] **Step 6: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/types/src/index.ts
git commit -m "feat(types): add AI executor types (action, status, run, gate, wordpress channel)"
```

---

## Task 2: Autonomy default + the executeAi gate

**Files:**
- Modify: `packages/core/src/autonomy.ts`
- Modify: `packages/core/test/autonomy.test.ts`

**Interfaces:**
- Produces: `DEFAULT_AUTONOMY.executeAi === 'ask'`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/autonomy.test.ts` (before the final `test.after` block):

```ts
test('autonomy: executeAi defaults to ask', async () => {
  const settings = await core.autonomy.get(org);
  assert.equal(settings.executeAi, 'ask', 'executeAi must default to ask (opt-in)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/core/test/autonomy.test.ts`
Expected: FAIL — `settings.executeAi` is `undefined`.

- [ ] **Step 3: Add the default**

In `packages/core/src/autonomy.ts`, add `executeAi: 'ask'` to `DEFAULT_AUTONOMY`:

```ts
export const DEFAULT_AUTONOMY: AutonomySettings = {
  draftReplies: 'auto',
  chase: 'auto',
  sendReminders: 'auto',
  createTasks: 'off',
  joinMeetings: 'off',
  manageRecords: 'off',
  executeAi: 'ask',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test packages/core/test/autonomy.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/core/src/autonomy.ts packages/core/test/autonomy.test.ts
git commit -m "feat(autonomy): add executeAi action defaulting to ask"
```

---

## Task 3: ai_runs table + repo (DB port + SQLite adapter)

**Files:**
- Modify: `packages/db/src/port.ts`
- Modify: `packages/db/src/sqlite.ts`
- Modify: `packages/db/src/supabase.ts`
- Test: `packages/db/test/ai-runs.test.ts`

**Interfaces:**
- Produces (in `port.ts`):
  ```ts
  export interface AiRunRepo {
    insert(run: AiRun): Promise<AiRun>;
    get(id: string): Promise<AiRun | null>;
    listByTask(taskId: string): Promise<AiRun[]>;
    listByOrg(orgId: string, limit?: number): Promise<AiRun[]>;
    update(id: string, patch: Partial<AiRun>): Promise<AiRun>;
  }
  ```
  And `Database` gains `aiRuns: AiRunRepo;`. (`AiRun` is imported from `@companybrain/types`.)

- [ ] **Step 1: Write the failing test**

Create `packages/db/test/ai-runs.test.ts`:

```ts
// ai_runs persistence — append-only history of AI task executions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-airuns-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { SqliteDatabase } = await import('@companybrain/db');
const db = new SqliteDatabase(dbPath);
await db.init();

function run(overrides: Partial<any> = {}) {
  return {
    id: 'airun_' + Math.random().toString(36).slice(2, 8),
    orgId: 'org_local', taskId: 'task_1', action: 'generate', model: 'anthropic/claude-3.5-sonnet',
    status: 'running', systemPrompt: 'sys', userPrompt: 'u', at: Date.now(), ...overrides,
  };
}

test('aiRuns: insert then get round-trips', async () => {
  const r = run({ id: 'airun_a' });
  await db.aiRuns.insert(r);
  const got = await db.aiRuns.get('airun_a');
  assert.ok(got);
  assert.equal(got!.taskId, 'task_1');
  assert.equal(got!.status, 'running');
});

test('aiRuns: update patches fields', async () => {
  await db.aiRuns.insert(run({ id: 'airun_b', status: 'running' }));
  const updated = await db.aiRuns.update('airun_b', { status: 'done', output: 'hello', durationMs: 1234 });
  assert.equal(updated.status, 'done');
  assert.equal(updated.output, 'hello');
  assert.equal(updated.durationMs, 1234);
});

test('aiRuns: listByTask returns newest-first; listByOrg limits', async () => {
  await db.aiRuns.insert(run({ id: 'airun_c1', taskId: 'task_2', at: 1000 }));
  await db.aiRuns.insert(run({ id: 'airun_c2', taskId: 'task_2', at: 2000 }));
  const byTask = await db.aiRuns.listByTask('task_2');
  assert.equal(byTask.length, 2);
  assert.equal(byTask[0].id, 'airun_c2', 'newest first');
  const byOrg = await db.aiRuns.listByOrg('org_local', 1);
  assert.equal(byOrg.length, 1);
});

test('aiRuns: keys survive reopen of the file', async () => {
  await db.close();
  const db2 = new SqliteDatabase(dbPath);
  await db2.init();
  const got = await db2.aiRuns.get('airun_a');
  assert.ok(got, 'run survived reopen');
  await db2.close();
});

process.on('exit', () => { try { rmSync(dbPath); } catch {} });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/db/test/ai-runs.test.ts`
Expected: FAIL — `db.aiRuns` is `undefined`.

- [ ] **Step 3: Add the repo interface to the port**

In `packages/db/src/port.ts`, add `AiRun` to the type import at the top:

```ts
import type { Loop, Task, Lead, DomainEvent, LoopSide, AutonomySettings, Approval, ApprovalStatus, AiRun } from '@companybrain/types';
```

Then add after the `ApiKeyRepo` interface (before `export interface Database`):

```ts
export interface AiRunRepo {
  insert(run: AiRun): Promise<AiRun>;
  get(id: string): Promise<AiRun | null>;
  listByTask(taskId: string): Promise<AiRun[]>;
  listByOrg(orgId: string, limit?: number): Promise<AiRun[]>;
  update(id: string, patch: Partial<AiRun>): Promise<AiRun>;
}
```

And add to `export interface Database` (after `apiKeys: ApiKeyRepo;`):

```ts
  aiRuns: AiRunRepo;
```

- [ ] **Step 4: Add table + impl to the SQLite adapter**

In `packages/db/src/sqlite.ts`:

4a. Add to imports from `./port`: `AiRunRepo` (append to the existing import list that already includes `ApiKeyRow, ApiKeyRepo`).

4b. Add `AiRun` to the types import at the top:
```ts
import type { Loop, Task, Lead, DomainEvent, LoopSide, AutonomySettings, Approval, ApprovalStatus, AiRun } from '@companybrain/types';
```

4c. Add to the `DDL` string (after the `api_keys` CREATE TABLE):
```sql
CREATE TABLE IF NOT EXISTS ai_runs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, task_id TEXT NOT NULL, action TEXT, model TEXT, status TEXT, cost_usd REAL, duration_ms INTEGER, result_ref TEXT, error TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ai_runs_task ON ai_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_org ON ai_runs(org_id, at);
```

4d. Add field `aiRuns: AiRunRepo;` to the `SqliteDatabase` class (after `apiKeys`).

4e. In the constructor, after the `this.apiKeys = { ... };` block, add:

```ts
    this.aiRuns = {
      async insert(run: AiRun) {
        db.prepare(
          'INSERT INTO ai_runs (id, org_id, task_id, action, model, status, cost_usd, duration_ms, result_ref, error, at, doc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        ).run(run.id, run.orgId, run.taskId, run.action, run.model, run.status, run.costUsd ?? null, run.durationMs ?? null, run.resultRef ?? null, run.error ?? null, run.at, JSON.stringify(run));
        return run;
      },
      async get(id) {
        const row = db.prepare('SELECT doc FROM ai_runs WHERE id=?').get(id) as { doc: string } | undefined;
        return row ? (JSON.parse(row.doc) as AiRun) : null;
      },
      async listByTask(taskId) {
        const rows = db.prepare('SELECT doc FROM ai_runs WHERE task_id=? ORDER BY at DESC').all(taskId) as { doc: string }[];
        return rows.map((r) => JSON.parse(r.doc) as AiRun);
      },
      async listByOrg(orgId, limit = 100) {
        const rows = db.prepare('SELECT doc FROM ai_runs WHERE org_id=? ORDER BY at DESC LIMIT ?').all(orgId, limit) as { doc: string }[];
        return rows.map((r) => JSON.parse(r.doc) as AiRun);
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`ai_run ${id} not found`);
        const next = { ...cur, ...patch };
        db.prepare('UPDATE ai_runs SET doc=?, status=?, cost_usd=?, duration_ms=?, result_ref=?, error=? WHERE id=?')
          .run(JSON.stringify(next), next.status, next.costUsd ?? null, next.durationMs ?? null, next.resultRef ?? null, next.error ?? null, id);
        return next;
      },
    };
```

- [ ] **Step 5: Add the Supabase stub**

In `packages/db/src/supabase.ts`, add `AiRunRepo` to the import from `./port`, then add a stub field after the `apiKeys` field:

```ts
  aiRuns: AiRunRepo = {
    async insert(r) { return r; },
    async get() { return null; },
    async listByTask() { return []; },
    async listByOrg() { return []; },
    async update(id, patch) { throw new Error('aiRuns not implemented for Supabase'); },
  };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --import tsx --test packages/db/test/ai-runs.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/db/src/port.ts packages/db/src/sqlite.ts packages/db/src/supabase.ts packages/db/test/ai-runs.test.ts
git commit -m "feat(db): persist ai_runs history (table + repo)"
```

---

## Task 4: OpenRouter client

**Files:**
- Create: `packages/integrations/src/openrouter.ts`
- Test: `packages/integrations/test/openrouter.test.ts`
- Modify: `packages/integrations/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }
  export interface CompletionResult {
    ok: boolean; text?: string; model?: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
    costUsd?: number | null; error?: string; durationMs: number;
  }
  export function complete(opts: { model: string; messages: ChatMsg[]; apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch }): Promise<CompletionResult>
  ```
  (The `fetchImpl` injection is what lets tests mock network without monkey-patching global `fetch`.)

- [ ] **Step 1: Write the failing test**

Create `packages/integrations/test/openrouter.test.ts`:

```ts
// OpenRouter client — request shape + success/error/timeout. Network is mocked via fetchImpl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complete } from '@companybrain/integrations';

function mockFetch(response: Response | Error, opts: { delayMs?: number } = {}) {
  return async (_url: any, _init: any) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (response instanceof Error) throw response;
    return response;
  };
}

test('openrouter: success parses content + usage', async () => {
  const res = new Response(JSON.stringify({
    choices: [{ message: { content: 'Hello world' } }],
    model: 'anthropic/claude-3.5-sonnet',
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const r = await complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: 'k', fetchImpl: mockFetch(res) as any });
  assert.equal(r.ok, true);
  assert.equal(r.text, 'Hello world');
  assert.equal(r.model, 'anthropic/claude-3.5-sonnet');
  assert.equal(r.usage?.completion_tokens, 5);
});

test('openrouter: non-2xx returns ok:false with error', async () => {
  const res = new Response(JSON.stringify({ error: { message: 'bad model' } }), { status: 400, headers: { 'content-type': 'application/json' } });
  const r = await complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: 'k', fetchImpl: mockFetch(res) as any });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /bad model|400/);
});

test('openrouter: network failure returns ok:false, never throws', async () => {
  const r = await complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: 'k', fetchImpl: mockFetch(new Error('ECONNRESET')) as any });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /ECONNRESET/);
});

test('openrouter: sends bearer auth + model + openrouter headers', async () => {
  let captured: any = {};
  const fetchImpl = async (url: any, init: any) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await complete({ model: 'the-model', messages: [{ role: 'user', content: 'hi' }], apiKey: 'secret', fetchImpl: fetchImpl as any });
  assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(captured.init.headers['Authorization'], 'Bearer secret');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, 'the-model');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/integrations/test/openrouter.test.ts`
Expected: FAIL — `complete` is not exported.

- [ ] **Step 3: Implement the client**

Create `packages/integrations/src/openrouter.ts`:

```ts
// OpenRouter client — thin wrapper over the OpenAI-compatible /chat/completions endpoint.
// Never throws: every failure (non-2xx, network, parse, timeout) returns { ok:false, error }.
// Tests inject fetchImpl to avoid real network.

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  ok: boolean;
  text?: string;
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  costUsd?: number | null;
  error?: string;
  durationMs: number;
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 120_000;

export async function complete(opts: {
  model: string;
  messages: ChatMsg[];
  apiKey: string;
  timeoutMs?: number;
  /** Test seam: inject a fetch implementation. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}): Promise<CompletionResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter requests these for ranking; harmless if the host ignores them.
        'HTTP-Referer': 'https://companybrain.app',
        'X-Title': 'companybrain',
      },
      body: JSON.stringify({ model: opts.model, messages: opts.messages }),
      signal: controller.signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.parse(raw)?.error?.message ?? ''; } catch { /* non-json body */ }
      return { ok: false, error: `OpenRouter ${res.status}: ${detail || raw.slice(0, 200)}`, durationMs: Date.now() - start };
    }

    const json = JSON.parse(raw) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    if (!text) return { ok: false, error: 'OpenRouter returned empty content', durationMs: Date.now() - start };
    return {
      ok: true,
      text,
      model: json.model,
      usage: json.usage,
      costUsd: null, // OpenRouter does not return $; approximated elsewhere if at all.
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      error: aborted ? `OpenRouter timed out after ${timeoutMs}ms` : (err?.message ?? String(err)),
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Export from the integrations index**

In `packages/integrations/src/index.ts`, add:

```ts
export { complete, type ChatMsg, type CompletionResult } from './openrouter.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test packages/integrations/test/openrouter.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 6: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/integrations/src/openrouter.ts packages/integrations/src/index.ts packages/integrations/test/openrouter.test.ts
git commit -m "feat(integrations): add OpenRouter chat-completions client"
```

---

## Task 5: WordPress publish client

**Files:**
- Create: `packages/integrations/src/wordpress.ts`
- Modify: `packages/integrations/src/index.ts`
- Test: `packages/integrations/test/wordpress.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface WordpressCreds { apiUrl: string; username: string; appPassword: string }
  export interface PublishResult { ok: boolean; postId?: number; postUrl?: string; error?: string }
  export function publishPost(opts: { creds: WordpressCreds; title: string; content: string; status?: 'draft' | 'publish'; fetchImpl?: typeof fetch }): Promise<PublishResult>
  ```
  Always defaults `status: 'draft'` even if a caller passes `'publish'` from the `auto` path — the client itself is the floor (defense in depth, per spec §6).

- [ ] **Step 1: Write the failing test**

Create `packages/integrations/test/wordpress.test.ts`:

```ts
// WordPress publish — basic-auth POST to /wp-json/wp/v2/posts. Always draft by default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishPost } from '@companybrain/integrations';

test('wordpress: success returns postId + permalink', async () => {
  let captured: any = {};
  const fetchImpl = async (url: any, init: any) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ id: 42, link: 'https://blog.example.com/?p=42' }), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  const r = await publishPost({
    creds: { apiUrl: 'https://blog.example.com', username: 'u', appPassword: 'p xxx' },
    title: 'Hello', content: '<p>body</p>',
    fetchImpl: fetchImpl as any,
  });
  assert.equal(r.ok, true);
  assert.equal(r.postId, 42);
  assert.equal(r.postUrl, 'https://blog.example.com/?p=42');
  // basic auth header present
  assert.match(captured.init.headers['Authorization'], /^Basic /);
  const body = JSON.parse(captured.init.body);
  assert.equal(body.status, 'draft', 'always draft by default');
  assert.equal(body.title, 'Hello');
  assert.equal(captured.url, 'https://blog.example.com/wp-json/wp/v2/posts');
});

test('wordpress: non-2xx returns ok:false', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  const r = await publishPost({
    creds: { apiUrl: 'https://blog.example.com', username: 'u', appPassword: 'bad' },
    title: 'x', content: 'y', fetchImpl: fetchImpl as any,
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /401|Unauthorized/);
});

test('wordpress: never throws on network error', async () => {
  const fetchImpl = async () => { throw new Error('ENOTFOUND'); };
  const r = await publishPost({
    creds: { apiUrl: 'https://nope.example.com', username: 'u', appPassword: 'p' },
    title: 'x', content: 'y', fetchImpl: fetchImpl as any,
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /ENOTFOUND/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/integrations/test/wordpress.test.ts`
Expected: FAIL — `publishPost` not exported.

- [ ] **Step 3: Implement**

Create `packages/integrations/src/wordpress.ts`:

```ts
// WordPress REST client — publishes a post via application-password basic auth.
// SECURITY: status defaults to 'draft' and the function REFUSES to publish even if a
// caller asks for 'publish' — the draft floor is enforced here (defense in depth),
// because a public post is indexed within minutes and hard to un-publish. If true
// auto-publish is ever wanted, that's a deliberate change to this default.
// Never throws: network/parse/auth failures return { ok:false, error }.

export interface WordpressCreds {
  apiUrl: string;       // e.g. https://blog.example.com (no trailing slash)
  username: string;
  appPassword: string;  // WordPress "application password" (spaces included)
}

export interface PublishResult {
  ok: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
}

function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

export async function publishPost(opts: {
  creds: WordpressCreds;
  title: string;
  content: string;
  /** Always 'draft' regardless of input — see file header. */
  status?: 'draft' | 'publish';
  fetchImpl?: typeof fetch;
}): Promise<PublishResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.creds.apiUrl.replace(/\/+$/, '');
  const url = `${base}/wp-json/wp/v2/posts`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth(opts.creds.username, opts.creds.appPassword),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: opts.title,
        content: opts.content,
        status: 'draft', // enforced floor — ignores opts.status
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.parse(raw)?.message ?? ''; } catch { /* non-json */ }
      return { ok: false, error: `WordPress ${res.status}: ${detail || raw.slice(0, 200)}` };
    }
    const json = JSON.parse(raw) as { id?: number; link?: string };
    return { ok: true, postId: json.id, postUrl: json.link };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}
```

- [ ] **Step 4: Export from integrations index**

In `packages/integrations/src/index.ts`, add:

```ts
export { publishPost, type WordpressCreds, type PublishResult } from './wordpress.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test packages/integrations/test/wordpress.test.ts`
Expected: PASS (all three tests).

- [ ] **Step 6: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/integrations/src/wordpress.ts packages/integrations/src/index.ts packages/integrations/test/wordpress.test.ts
git commit -m "feat(integrations): add WordPress REST publish (always-draft floor)"
```

---

## Task 6: Model routing table

**Files:**
- Create: `packages/core/src/ai-router.ts`
- Test: `packages/core/test/ai-router.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function resolveModel(action: AiActionType, override?: string | null): string
  ```
  Default table maps each action to an OpenRouter slug; env overrides (`COMPANYBRAIN_AI_MODEL_GENERATE`, `COMPANYBRAIN_AI_MODEL_PUBLISH_BLOG`) win over defaults; per-task `override` wins over env.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/ai-router.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModel } from '../src/ai-router.js';

test('router: returns default for each action', () => {
  assert.equal(resolveModel('generate'), 'anthropic/claude-3.5-sonnet');
  assert.equal(resolveModel('publish_blog'), 'anthropic/claude-3.5-sonnet');
});

test('router: env override wins over default', () => {
  const prev = process.env.COMPANYBRAIN_AI_MODEL_GENERATE;
  process.env.COMPANYBRAIN_AI_MODEL_GENERATE = 'openai/gpt-4o-mini';
  assert.equal(resolveModel('generate'), 'openai/gpt-4o-mini');
  if (prev === undefined) delete process.env.COMPANYBRAIN_AI_MODEL_GENERATE; else process.env.COMPANYBRAIN_AI_MODEL_GENERATE = prev;
});

test('router: per-task override wins over env', () => {
  const prev = process.env.COMPANYBRAIN_AI_MODEL_GENERATE;
  process.env.COMPANYBRAIN_AI_MODEL_GENERATE = 'openai/gpt-4o-mini';
  assert.equal(resolveModel('generate', 'google/gemini-flash-1.5'), 'google/gemini-flash-1.5');
  if (prev === undefined) delete process.env.COMPANYBRAIN_AI_MODEL_GENERATE; else process.env.COMPANYBRAIN_AI_MODEL_GENERATE = prev;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/core/test/ai-router.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/ai-router.ts`:

```ts
// Per-action model routing. Static defaults, env-overridable, per-task overridable.
// Deliberately two entries (not a tier system) — add tiers only if a real cost/quality
// tradeoff shows up.

import type { AiActionType } from '@companybrain/types';

const DEFAULTS: Record<AiActionType, string> = {
  generate: 'anthropic/claude-3.5-sonnet',
  publish_blog: 'anthropic/claude-3.5-sonnet',
};

const ENV_KEY: Record<AiActionType, string> = {
  generate: 'COMPANYBRAIN_AI_MODEL_GENERATE',
  publish_blog: 'COMPANYBRAIN_AI_MODEL_PUBLISH_BLOG',
};

/** Resolve the OpenRouter model slug for an action. Override precedence: task > env > default. */
export function resolveModel(action: AiActionType, override?: string | null, env: NodeJS.ProcessEnv = process.env): string {
  if (override && override.trim()) return override.trim();
  const envVal = env[ENV_KEY[action]];
  if (envVal && envVal.trim()) return envVal.trim();
  return DEFAULTS[action];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test packages/core/test/ai-router.test.ts`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/core/src/ai-router.ts packages/core/test/ai-router.test.ts
git commit -m "feat(core): add AI model routing table (resolveModel)"
```

---

## Task 7: Action interface + generate + publish_blog adapters

**Files:**
- Create: `packages/core/src/ai-actions.ts`
- Test: `packages/core/test/ai-actions.test.ts`

**Interfaces:**
- Consumes: `resolveModel` (Task 6), the `Context` + `AiRun` types. **Does NOT import from `@companybrain/integrations`** — core must not depend on integrations (integrations already depends on core → that would be a cycle). The concrete `publishPost`/`complete` clients are injected via `ActionDeps` (the same port-injection pattern core uses for `Messenger`/`Drafter`).
- Produces:
  ```ts
  export interface PublishBlogFn { (opts: { creds: WordpressCreds; title: string; content: string }): Promise<{ ok: boolean; postUrl?: string; error?: string }> }
  export interface ActionDeps { wordpressCreds?: WordpressCreds; publishBlog?: PublishBlogFn }
  export interface ActionRunInput { task: Task; output: string; ctx: Context; deps: ActionDeps }
  export interface ActionRunResult { ok: boolean; resultRef?: string; error?: string }
  export interface Action {
    type: AiActionType;
    defaultAutonomy: Autonomy;  // generate→'auto', publish_blog→'ask'
    prompt(task: Task): { system: string; user: string };
    run(input: ActionRunInput): Promise<ActionRunResult>;
  }
  export const ACTIONS: Record<AiActionType, Action>;
  export interface WordpressCreds { apiUrl: string; username: string; appPassword: string }
  ```
  `generate.run` appends a comment to the task with the output and returns `{ok:true, resultRef: commentId}`.
  `publish_blog.run` calls `deps.publishBlog` (injected) and returns `{ok, resultRef: postUrl}`. If `publishBlog` is not injected, it fails closed with an error.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/ai-actions.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../src/ai-actions.js';
import type { Task, Context } from '@companybrain/core';

// Minimal stub Context — only db.tasks.update is exercised by generate.run.
function makeCtx(): Context {
  const updates: any[] = [];
  return {
    db: { tasks: { update: async (id: string, patch: any) => { updates.push({ id, patch }); return { id, ...patch }; } } } as any,
  } as Context;
}

const baseTask = (over: Partial<Task> = {}): Task => ({
  id: 'task_1', orgId: 'org_local', emoji: '✅', title: 'Write a blog about cats', list: 'Inbox',
  day: 'today', priority: null, recurring: false, assignees: [], createdBy: 'user_local',
  completed: false, completedAt: null, createdAt: 0, aiAction: 'generate', ...over,
});

test('actions: generate.prompt describes the deliverable', () => {
  const p = ACTIONS.generate.prompt(baseTask());
  assert.match(p.system, /deliverable/i);
  assert.match(p.user, /cats/i);
});

test('actions: generate.run appends a comment + returns ok', async () => {
  const ctx = makeCtx();
  const r = await ACTIONS.generate.run({ task: baseTask(), output: 'Here is the text', ctx, deps: {} });
  assert.equal(r.ok, true);
  assert.ok(r.resultRef, 'comment id returned');
});

test('actions: publish_blog.run posts a draft via injected publishBlog', async () => {
  let captured: any = {};
  const publishBlog = async (opts: any) => {
    captured = opts;
    return { ok: true, postUrl: 'https://blog.example.com/?p=7' };
  };
  const r = await ACTIONS.publish_blog.run({
    task: baseTask({ aiAction: 'publish_blog' }),
    output: '<p>cat post</p>',
    ctx: makeCtx(),
    deps: { wordpressCreds: { apiUrl: 'https://blog.example.com', username: 'u', appPassword: 'p' }, publishBlog },
  });
  assert.equal(r.ok, true);
  assert.equal(r.resultRef, 'https://blog.example.com/?p=7');
  assert.equal(captured.title, 'Write a blog about cats');
  assert.equal(captured.content, '<p>cat post</p>');
});

test('actions: publish_blog.run fails closed without publishBlog injected', async () => {
  const r = await ACTIONS.publish_blog.run({
    task: baseTask({ aiAction: 'publish_blog' }), output: 'x', ctx: makeCtx(),
    deps: { wordpressCreds: { apiUrl: 'https://b', username: 'u', appPassword: 'p' } },
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /publishBlog|not configured|not injected/i);
});

test('actions: publish_blog.run fails closed without creds', async () => {
  const r = await ACTIONS.publish_blog.run({
    task: baseTask({ aiAction: 'publish_blog' }), output: 'x', ctx: makeCtx(),
    deps: { publishBlog: async () => ({ ok: true, postUrl: 'x' }) },
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /wordpress/i);
});

test('actions: defaultAutonomy — generate auto, publish_blog ask', () => {
  assert.equal(ACTIONS.generate.defaultAutonomy, 'auto');
  assert.equal(ACTIONS.publish_blog.defaultAutonomy, 'ask');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/core/test/ai-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/ai-actions.ts`:

```ts
// Action adapters — one LLM call produces text; the action does something with it.
// generate stores the text as a task comment; publish_blog pushes a draft to WordPress.
// Each action declares its default autonomy floor — the executor takes the stricter of
// (global executeAi gate, action.defaultAutonomy).
//
// DEPENDENCY RULE: this file imports NOTHING from @companybrain/integrations. The
// concrete publishBlog client is injected via ActionDeps (the same port-injection pattern
// core uses for Messenger/Drafter) — otherwise core→integrations→core would be a cycle.

import type { AiActionType, Task, Autonomy } from '@companybrain/types';
import type { Context } from './context';
import { newId } from './context';

export interface WordpressCreds {
  apiUrl: string;
  username: string;
  appPassword: string;
}

/** Injected WordPress publisher — the integrations package supplies the real one at boot. */
export type PublishBlogFn = (opts: {
  creds: WordpressCreds;
  title: string;
  content: string;
}) => Promise<{ ok: boolean; postUrl?: string; error?: string }>;

export interface ActionDeps {
  wordpressCreds?: WordpressCreds;
  publishBlog?: PublishBlogFn;
}

export interface ActionRunInput {
  task: Task;
  output: string;
  ctx: Context;
  deps: ActionDeps;
}

export interface ActionRunResult {
  ok: boolean;
  resultRef?: string;
  error?: string;
}

export interface Action {
  type: AiActionType;
  defaultAutonomy: Autonomy;
  prompt(task: Task): { system: string; user: string };
  run(input: ActionRunInput): Promise<ActionRunResult>;
}

const generate: Action = {
  type: 'generate',
  defaultAutonomy: 'auto',
  prompt(task) {
    return {
      system: 'You produce the deliverable described by the task title. Plain text unless the task asks for markup. No preamble, no "here is", just the content.',
      user: `Task: ${task.title}`,
    };
  },
  async run({ task, output, ctx }) {
    const comment = { id: newId('cmt'), text: output, by: 'agent_executor', at: Date.now() };
    const comments = [...(task.comments ?? []), comment];
    await ctx.db.tasks.update(task.id, { comments });
    return { ok: true, resultRef: comment.id };
  },
};

const publish_blog: Action = {
  type: 'publish_blog',
  defaultAutonomy: 'ask',
  prompt(task) {
    return {
      system: 'You write a complete, ready-to-publish blog post as HTML (article element with headings and paragraphs). No markdown fences, no commentary outside the HTML. Match the topic of the task title.',
      user: `Write a blog post about: ${task.title}`,
    };
  },
  async run({ task, output, deps }) {
    if (!deps.wordpressCreds) {
      return { ok: false, error: 'WordPress is not configured. Add credentials in Settings → AI.' };
    }
    if (!deps.publishBlog) {
      return { ok: false, error: 'publishBlog client not injected (misconfiguration).' };
    }
    const result = await deps.publishBlog({ creds: deps.wordpressCreds, title: task.title, content: output });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, resultRef: result.postUrl };
  },
};

export const ACTIONS: Record<AiActionType, Action> = {
  generate,
  publish_blog,
};
```

**No dependency change to `packages/core/package.json`** — core stays free of the integrations dependency.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test packages/core/test/ai-actions.test.ts`
Expected: PASS (all five tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/core/src/ai-actions.ts packages/core/test/ai-actions.test.ts
git commit -m "feat(core): add AI action adapters (generate, publish_blog)"
```

---

## Task 8: The executor — gate, model, prompt, LLM, action, record

**Files:**
- Create: `packages/core/src/executor.ts`
- Modify: `packages/core/src/context.ts` (add `executor` to Context)
- Modify: `packages/core/src/index.ts` (build + inject executor)
- Test: `packages/core/test/executor.test.ts`

**Interfaces:**
- Consumes: `gateAction`/`resolveAutonomy` (existing), `resolveModel` (Task 6), `ACTIONS` + `ActionDeps` (Task 7), the injected `complete` (OpenRouter client), `AiRunRepo` (Task 3).
- Produces:
  ```ts
  export interface ExecutorDeps {
    complete: (opts: any) => Promise<any>;   // OpenRouter client (injected so tests can stub)
    actionDeps: ActionDeps;                    // { wordpressCreds?, publishBlog? }
    openRouterApiKey: string;
  }
  export function makeExecutor(ctx: Context): {
    run(taskId: string, deps: ExecutorDeps): Promise<void>;   // the runAiTask worker body
    approve(runId: string, deps: ExecutorDeps): Promise<void>; // the ask-path continuation
  }
  ```
  Wired into Context as `ctx.executor` so the worker can call `ctx.executor.run(taskId, deps)`. The concrete `publishBlog` (from `@companybrain/integrations`) is supplied by the worker (Task 9) inside `actionDeps` — never imported by core.

**Effective gate logic:** `level = stricter(resolveAutonomy(org).executeAi, action.defaultAutonomy)` where `stricter` ranks `off < ask < auto` and returns the lower (safer) one.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/executor.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const dbPath = join(tmpdir(), `companybrain-exec-${process.pid}-${Date.now()}.sqlite`);
process.env.COMPANYBRAIN_DB_PATH = dbPath;

const { bootstrap } = await import('@companybrain/core');
const boot = await bootstrap();
const core = boot.core;
const org = 'org_local';

// A stub OpenRouter client that returns canned text and never hits the network.
function stubComplete(text = 'STUBBED OUTPUT') {
  return async () => ({ ok: true, text, model: 'stub/model', usage: { prompt_tokens: 1, completion_tokens: 1 }, costUsd: null, durationMs: 5 });
}

async function makeAiTask(over: Partial<any> = {}) {
  const t = await core.tasks.create({ orgId: org, actorId: 'user_local', title: over.title ?? 'Summarize cats', ...over });
  return core.ctx.db.tasks.update(t.id, { aiAction: 'generate', aiStatus: 'queued', ...over });
}

test('executor: auto gate → runs LLM, writes run, completes task', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const task = await makeAiTask();
  await core.ctx.executor.run(task.id, { complete: stubComplete('DONE'), actionDeps: {}, openRouterApiKey: 'k' });
  const after = await core.ctx.db.tasks.get(task.id);
  assert.equal(after!.aiStatus, 'done');
  assert.equal(after!.completed, true);
  const runs = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'done');
  assert.equal(runs[0].output, 'DONE');
});

test('executor: off gate → no run, task stays queued', async () => {
  await core.autonomy.set(org, 'executeAi', 'off');
  const task = await makeAiTask();
  await core.ctx.executor.run(task.id, { complete: stubComplete(), actionDeps: {}, openRouterApiKey: 'k' });
  const after = await core.ctx.db.tasks.get(task.id);
  assert.equal(after!.aiStatus, 'queued');
  const runs = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(runs.length, 0, 'no run recorded under off');
});

test('executor: ask gate → LLM runs (draft), action waits, awaiting_review; approve → done', async () => {
  await core.autonomy.set(org, 'executeAi', 'ask');
  const task = await makeAiTask({ aiAction: 'publish_blog' });
  await core.ctx.executor.run(task.id, { complete: stubComplete('<p>draft</p>'), actionDeps: {}, openRouterApiKey: 'k' });
  const parked = await core.ctx.db.tasks.get(task.id);
  assert.equal(parked!.aiStatus, 'awaiting_review');
  const runs = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'awaiting_review');
  assert.equal(runs[0].output, '<p>draft</p>');

  // approve → action runs (inject a stub publishBlog so no network)
  await core.ctx.executor.approve(runs[0].id, {
    complete: stubComplete(),
    actionDeps: { wordpressCreds: { apiUrl: 'https://b', username: 'u', appPassword: 'p' }, publishBlog: async () => ({ ok: true, postUrl: 'https://b/?p=1' }) },
    openRouterApiKey: 'k',
  });
  const done = await core.ctx.db.tasks.get(task.id);
  assert.equal(done!.aiStatus, 'done');
  assert.equal(done!.completed, true);
});

test('executor: publish_blog action floor stays ask even when global is auto', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const task = await makeAiTask({ aiAction: 'publish_blog' });
  await core.ctx.executor.run(task.id, { complete: stubComplete('<p>x</p>'), actionDeps: {}, openRouterApiKey: 'k' });
  const after = await core.ctx.db.tasks.get(task.id);
  assert.equal(after!.aiStatus, 'awaiting_review', 'action floor overrides global auto');
});

test('executor: LLM failure → run failed, task failed (not completed)', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const task = await makeAiTask();
  const failComplete = async () => ({ ok: false, error: 'rate limited', durationMs: 1 });
  await core.ctx.executor.run(task.id, { complete: failComplete as any, actionDeps: {}, openRouterApiKey: 'k' });
  const after = await core.ctx.db.tasks.get(task.id);
  assert.equal(after!.aiStatus, 'failed');
  assert.equal(after!.completed, false);
  const runs = await core.ctx.db.aiRuns.listByTask(task.id);
  assert.equal(runs[0].status, 'failed');
});

process.on('exit', () => { try { rmSync(dbPath); } catch {} });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/core/test/executor.test.ts`
Expected: FAIL — `core.ctx.executor` is undefined (not wired yet).

- [ ] **Step 3: Add `executor` to Context**

In `packages/core/src/context.ts`, add to the `Context` interface (after `drafter`):

```ts
  executor?: Executor;
```

And add the type import/skeleton at the top — but since `executor.ts` imports from context, avoid a cycle by declaring a structural type in context.ts:

```ts
export interface Executor {
  run(taskId: string, opts: { force?: boolean; complete?: any; actionDeps?: any; openRouterApiKey?: string; fetchImpl?: any }): Promise<void>;
  approve(runId: string, deps: any): Promise<void>;
}
```

(The `any` here is deliberate to avoid a context↔executor import cycle; the concrete `executor.ts` has the precise types.)

- [ ] **Step 4: Implement the executor**

Create `packages/core/src/executor.ts`:

```ts
// The AI task runner. One run = gate → (model → prompt → LLM) → maybe action → record.
// ask: LLM runs (so a human can review the draft) but the action waits for approve().
// auto: LLM + action both run. off: nothing. The effective level is the stricter of the
// global executeAi gate and the action's defaultAutonomy floor.

import type { Context } from './context';
import type { Autonomy, AiRun, Task } from '@companybrain/types';
import { resolveAutonomy } from './autonomy';
import { resolveModel } from './ai-router';
import { ACTIONS, type ActionDeps } from './ai-actions';
import { newId, now, record } from './context';

export interface ExecutorDeps {
  complete: (opts: any) => Promise<any>;
  actionDeps: ActionDeps;
  openRouterApiKey: string;
  fetchImpl?: typeof fetch;
}

const RANK: Record<Autonomy, number> = { off: 0, ask: 1, auto: 2 };
function stricter(a: Autonomy, b: Autonomy): Autonomy {
  return RANK[a] <= RANK[b] ? a : b;
}

export function makeExecutor(ctx: Context) {
  async function run(taskId: string, deps: ExecutorDeps): Promise<void> {
    const task = await ctx.db.tasks.get(taskId);
    if (!task || !task.aiAction) return;
    if (task.aiStatus && task.aiStatus !== 'queued') return; // idempotent: skip non-queued

    const action = ACTIONS[task.aiAction];
    const globalLevel = (await resolveAutonomy(ctx.db, task.orgId)).executeAi;
    const level = stricter(globalLevel, action.defaultAutonomy);

    if (level === 'off') return; // disabled; leave queued

    const model = resolveModel(task.aiAction, task.aiConfig?.modelOverride);
    const { system, user } = action.prompt(task);

    const run: AiRun = {
      id: newId('airun'), orgId: task.orgId, taskId: task.id, action: task.aiAction,
      model, status: 'running', systemPrompt: system, userPrompt: user, at: now(),
    };
    await ctx.db.aiRuns.insert(run);
    await ctx.db.tasks.update(task.id, { aiStatus: 'running', aiRunId: run.id });

    const result = await deps.complete({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], apiKey: deps.openRouterApiKey });
    if (!result.ok) {
      await ctx.db.aiRuns.update(run.id, { status: 'failed', error: result.error, durationMs: result.durationMs });
      await ctx.db.tasks.update(task.id, { aiStatus: 'failed' });
      await record(ctx, { orgId: task.orgId, type: 'ai.task.failed', entityId: task.id, actorId: 'agent_executor' });
      return;
    }

    await ctx.db.aiRuns.update(run.id, { status: level === 'auto' ? 'done' : 'awaiting_review', output: result.text, durationMs: result.durationMs });

    if (level === 'auto') {
      await runAction(task, result.text, run, deps);
    } else {
      // ask: park with the draft available for review.
      await ctx.db.tasks.update(task.id, { aiStatus: 'awaiting_review' });
    }
  }

  async function runAction(task: Task, output: string, run: AiRun, deps: ExecutorDeps): Promise<void> {
    const action = ACTIONS[task.aiAction!];
    const res = await action.run({ task, output, ctx, deps: deps.actionDeps });
    if (!res.ok) {
      await ctx.db.aiRuns.update(run.id, { status: 'failed', error: res.error });
      await ctx.db.tasks.update(task.id, { aiStatus: 'failed' });
      await record(ctx, { orgId: task.orgId, type: 'ai.task.failed', entityId: task.id, actorId: 'agent_executor' });
      return;
    }
    await ctx.db.aiRuns.update(run.id, { status: 'done', resultRef: res.resultRef });
    const completed = await ctx.db.tasks.update(task.id, { aiStatus: 'done', completed: true, completedAt: now() });
    await record(ctx, { orgId: task.orgId, type: 'ai.task.executed', entityId: task.id, actorId: 'agent_executor', undo: { restoreCompleted: false } });
    void completed;
  }

  async function approve(runId: string, deps: ExecutorDeps): Promise<void> {
    const run = await ctx.db.aiRuns.get(runId);
    if (!run || run.status !== 'awaiting_review') return;
    const task = await ctx.db.tasks.get(run.taskId);
    if (!task) return;
    await runAction(task, run.output ?? '', run, deps);
  }

  return { run, approve };
}

export type ExecutorService = ReturnType<typeof makeExecutor>;
```

- [ ] **Step 5: Wire executor into Core**

In `packages/core/src/index.ts`:

5a. Add the import:
```ts
import { makeExecutor } from './executor';
```

5b. In `createCoreFromPorts`, after the ctx is built and before `return { ... }`, add:
```ts
  const executor = makeExecutor(ctx);
```
Then in the returned object add `ctx: { ...ctx, executor }` — i.e. replace the existing `ctx` field with a merged one. Find the `return { ctx, loops, ... }` and change `ctx,` to `ctx: { ...ctx, executor },`.

(The `Core.ctx` already exposes the Context; we extend it with the executor so worker handlers can call `ctx.executor.run(...)`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `node --import tsx --test packages/core/test/executor.test.ts`
Expected: PASS (all five tests).

- [ ] **Step 7: Run full test suite**

Run: `pnpm test`
Expected: PASS — no regressions.

- [ ] **Step 8: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/core/src/executor.ts packages/core/src/context.ts packages/core/src/index.ts packages/core/test/executor.test.ts
git commit -m "feat(core): add AI executor (gate/model/llm/action/record)"
```

---

## Task 9: runAiTask worker + tasks.setAiAction/addComment/approveAiRun

**Files:**
- Modify: `packages/core/src/workers.ts`
- Modify: `packages/core/src/tasks.ts`
- Modify: `cli/bin/companybrain.ts` (inject real OpenRouter client + creds into the worker call)

**Interfaces:**
- Consumes: `ctx.executor.run` (Task 8), `ctx.queue.enqueue` (existing), `ctx.db.connections` (for WP creds).
- Produces:
  - `tasks.setAiAction(id, action, config?)` — sets `aiAction`/`aiStatus='queued'`/`aiConfig`, enqueues `runAiTask`.
  - `tasks.approveAiRun(runId)` — delegates to `ctx.executor.approve`.
  - `runAiTask` worker handler that resolves ExecutorDeps (OpenRouter key from env, WP creds from connections) and calls `ctx.executor.run(taskId, deps)`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/executor.test.ts` (before the `process.on('exit')` cleanup):

```ts
test('tasks.setAiAction enqueues + marks queued; approveAiRun delegates', async () => {
  await core.autonomy.set(org, 'executeAi', 'auto');
  const t = await core.tasks.create({ orgId: org, actorId: 'user_local', title: 'Draft X' });
  let enqueued: any = null;
  // spy on the queue
  const origEnqueue = core.ctx.queue.enqueue.bind(core.ctx.queue);
  core.ctx.queue.enqueue = (async (name: any, data: any) => { enqueued = { name, data }; }) as any;
  try {
    await core.tasks.setAiAction(t.id, 'generate', undefined);
  } finally {
    core.ctx.queue.enqueue = origEnqueue;
  }
  const after = await core.ctx.db.tasks.get(t.id);
  assert.equal(after!.aiAction, 'generate');
  assert.equal(after!.aiStatus, 'queued');
  assert.equal(enqueued?.name, 'runAiTask');
  assert.equal(enqueued?.data?.taskId, t.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test packages/core/test/executor.test.ts`
Expected: FAIL — `core.tasks.setAiAction` is not a function.

- [ ] **Step 3: Add the task methods**

In `packages/core/src/tasks.ts`, inside the object returned by `makeTasks(ctx)`, add (after `complete`):

```ts
    async setAiAction(id: string, action: import('@companybrain/types').AiActionType | null, config?: import('@companybrain/types').AiTaskConfig): Promise<Task> {
      const prev = await ctx.db.tasks.get(id);
      if (!prev) throw new Error(`task ${id} not found`);
      const patch = action
        ? { aiAction: action, aiStatus: 'queued' as const, aiConfig: config, aiRunId: undefined as undefined | string }
        : { aiAction: null, aiStatus: undefined as undefined | string };
      const task = await ctx.db.tasks.update(id, patch);
      if (action) {
        await ctx.queue.enqueue('runAiTask', { taskId: id });
        await record(ctx, { orgId: task.orgId, type: 'ai.task.queued', entityId: id, actorId: prev.createdBy });
      }
      return task;
    },

    async approveAiRun(runId: string): Promise<void> {
      // The worker holds the real ExecutorDeps (key + creds); resolve them here too.
      const run = await ctx.db.aiRuns.get(runId);
      if (!run) throw new Error(`run ${runId} not found`);
      // Re-enqueue so the worker's approve path runs with proper deps:
      await ctx.queue.enqueue('runAiTask', { taskId: run.taskId, approveRunId: runId });
    },
```

Note: `approveAiRun` re-enqueues rather than calling `executor.approve` directly because the worker is where the OpenRouter key + WP creds live. The worker handler (next step) checks for `approveRunId` and calls `approve` instead of `run`.

- [ ] **Step 4: Add the runAiTask worker**

In `packages/core/src/workers.ts`, append a new handler inside `registerWorkers(ctx)` (after the existing `autoSweep` handler, before the closing brace):

```ts
  // AI task executor — runs an AI-doable task through OpenRouter + the action adapter.
  // The ExecutorDeps (API key + WP creds + the OpenRouter client + the publishBlog client)
  // are resolved here from env + the connections table, so core never imports a concrete
  // client. This is the composition root: the only place integrations meets core's executor.
  ctx.queue.on<AiTaskJob>('runAiTask', async ({ taskId, approveRunId }) => {
    const { complete, publishPost } = await import('@companybrain/integrations');
    const apiKey = process.env.OPENROUTER_API_KEY ?? '';
    if (!apiKey) {
      console.warn(`[worker] runAiTask ${taskId}: OPENROUTER_API_KEY not set — skipping`);
      return;
    }
    // Resolve WordPress creds (if any) for publish_blog actions.
    let wordpressCreds: any;
    try {
      const conn = await ctx.db.connections.get('org_local', 'wordpress');
      if (conn?.credentials) wordpressCreds = conn.credentials;
    } catch { /* connections repo may be unavailable */ }

    // Wrap the integrations publishPost into the core ActionDeps.publishBlog signature.
    const publishBlog = async (opts: { creds: any; title: string; content: string }) => {
      const r = await publishPost({ creds: opts.creds, title: opts.title, content: opts.content });
      return r.ok ? { ok: true, postUrl: r.postUrl } : { ok: false, error: r.error };
    };

    const deps = { complete, actionDeps: { wordpressCreds, publishBlog }, openRouterApiKey: apiKey };
    const executor = (ctx as any).executor;
    if (!executor) { console.warn(`[worker] runAiTask ${taskId}: executor not wired`); return; }
    if (approveRunId) await executor.approve(approveRunId, deps);
    else await executor.run(taskId, deps);
  });
```

And add the job type near the top of `workers.ts` (after `LoopJob`):

```ts
export interface AiTaskJob extends Record<string, unknown> {
  taskId: string;
  approveRunId?: string;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test packages/core/test/executor.test.ts`
Expected: PASS (all six tests).

- [ ] **Step 6: Run full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/core/src/workers.ts packages/core/src/tasks.ts packages/core/test/executor.test.ts
git commit -m "feat(core): add runAiTask worker + setAiAction/approveAiRun"
```

---

## Task 10: API routes (set action, list runs, approve, WP creds)

**Files:**
- Modify: `packages/server/src/server.ts` (or wherever task routes live)

**Interfaces:**
- Produces:
  - `POST /api/tasks/:id/ai` body `{ action, config? }` → calls `core.tasks.setAiAction`.
  - `GET /api/tasks/:id/ai-runs` → `core.ctx.db.aiRuns.listByTask`.
  - `POST /api/ai-runs/:id/approve` → `core.tasks.approveAiRun`.
  - `PUT /api/connections/wordpress` body `{ apiUrl, username, appPassword }` → `core.ctx.db.connections.upsert(orgId, 'wordpress', { credentials, status:'connected' })`.
  - `GET /api/connections/wordpress` → returns `{ configured: boolean }` (never the secret).

- [ ] **Step 1: Locate the task routes**

Run: `grep -n "tasks/:id\|/api/tasks" packages/server/src/server.ts | head`
Identify where task routes are registered and follow that exact pattern (Fastify route + `core` access) for the new routes.

- [ ] **Step 2: Add the routes**

In the same file, alongside the existing task routes, add:

```ts
  // AI task execution
  app.post('/api/tasks/:id/ai', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { action, config } = req.body as { action: 'generate' | 'publish_blog' | null; config?: any };
    const task = await core.tasks.setAiAction(id, action, config);
    return task;
  });

  app.get('/api/tasks/:id/ai-runs', async (req) => {
    const { id } = req.params as { id: string };
    return { runs: await core.ctx.db.aiRuns.listByTask(id) };
  });

  app.post('/api/ai-runs/:id/approve', async (req) => {
    const { id } = req.params as { id: string };
    await core.tasks.approveAiRun(id);
    return { ok: true };
  });

  // WordPress credentials — encrypted at rest, never returned in cleartext.
  app.put('/api/connections/wordpress', async (req) => {
    const { apiUrl, username, appPassword } = req.body as { apiUrl: string; username: string; appPassword: string };
    const principal = await core.ctx.auth.current();
    await core.ctx.db.connections.upsert(principal.orgId, 'wordpress', {
      credentials: { apiUrl, username, appPassword },
      status: 'connected',
    });
    return { ok: true };
  });

  app.get('/api/connections/wordpress', async (req) => {
    const principal = await core.ctx.auth.current();
    const conn = await core.ctx.db.connections.get(principal.orgId, 'wordpress');
    return { configured: conn?.status === 'connected' };
  });
```

- [ ] **Step 3: Typecheck + manual smoke**

Run: `pnpm typecheck`
Expected: PASS.

Manual (optional): boot the app, `curl -X PUT localhost:4317/api/connections/wordpress -d '{"apiUrl":"...","username":"...","appPassword":"..."}' -H 'content-type: application/json'`, then `GET` confirms `{configured:true}` without leaking the password.

- [ ] **Step 4: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add packages/server/src/server.ts
git commit -m "feat(server): add AI task + run + WordPress creds routes"
```

---

## Task 11: Docs — .env.example + README

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Add env vars to .env.example**

Append to `.env.example`:

```
# --- AI executor (sub-project B) ---
# OpenRouter API key (https://openrouter.ai). Required for AI task execution. Server-side only.
OPENROUTER_API_KEY=

# Optional per-action model overrides (OpenRouter slugs). Defaults to anthropic/claude-3.5-sonnet.
# COMPANYBRAIN_AI_MODEL_GENERATE=anthropic/claude-3.5-sonnet
# COMPANYBRAIN_AI_MODEL_PUBLISH_BLOG=anthropic/claude-3.5-sonnet

# WordPress (for the publish_blog action). Configure via Settings → AI in the app instead of env.
# Stored encrypted in the connections table; the app password is never logged.
```

- [ ] **Step 2: Add a README section**

Insert before `## Status` in `README.md`:

```markdown
## AI tasks (executor + OpenRouter)

A task can be executed by AI instead of a human. Mark a task with an action type and the in-process worker calls a model via [OpenRouter](https://openrouter.ai), runs the action, and completes the task.

**Actions:**
- `generate` — the AI produces the deliverable (stored as a task comment). Default autonomy: `auto`.
- `publish_blog` — the AI writes a post and pushes a **draft** to WordPress (never a live post). Default autonomy: `ask` — you approve the draft before it publishes.

**Setup:**
1. Set `OPENROUTER_API_KEY` (get one at openrouter.ai).
2. In **Settings → Auto**, set `executeAi` to `ask` (default) or `auto`. The effective level is the stricter of this global gate and the action's floor — so `publish_blog` always needs approval even when the global is `auto`.
3. For `publish_blog`, add WordPress credentials (URL + application username/password) in **Settings → AI**.

Every run is logged (model, prompt, output, cost) in `ai_runs` for auditability.
```

- [ ] **Step 3: Commit**

```bash
git config user.name    # MUST be "shrijeet singh"
git config user.email   # MUST be "shrijeet@vexocore.in"
git add .env.example README.md
git commit -m "docs: AI executor + OpenRouter + WordPress setup"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: all tests PASS (existing + the new ai-router, ai-actions, executor, openrouter, wordpress, ai-runs db tests — wire the new ones into the `test` aggregate as you add them, matching how Task 4 of sub-project A added `gate.test.ts`).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Boot the app unchanged**

Run: `pnpm dev` (set `COMPANYBRAIN_NO_OPEN=1`)
Expected: boots as before — confirms the additive invariant.

- [ ] **Step 4: Manual end-to-end (generate)**

1. Boot with a real `OPENROUTER_API_KEY`.
2. Create a task "Write a one-paragraph summary of photosynthesis".
3. `POST /api/tasks/:id/ai` body `{"action":"generate"}`.
4. Within ~30s the task should complete and carry a comment with the summary. `GET /api/tasks/:id/ai-runs` shows the run.

- [ ] **Step 5: Manual end-to-end (publish_blog, ask path)**

1. Configure WordPress creds via `PUT /api/connections/wordpress`.
2. Set `executeAi` to `ask`.
3. Create a task "Blog: 3 tips for better sleep", `POST /api/tasks/:id/ai` `{"action":"publish_blog"}`.
4. Task parks at `awaiting_review` with a generated draft in the run.
5. `POST /api/ai-runs/:runId/approve`.
6. Task completes; a **draft** appears in WordPress at the returned URL.

If steps 4–5 need fixups, commit them under the appropriate task's style. Otherwise nothing to commit.
