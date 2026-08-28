# Companybrain AI Executor + OpenRouter — Design

**Date:** 2026-07-24
**Sub-project:** B (of three: A MCP exposure ✅ shipped · **B AI executor + OpenRouter** · C self-improving company brain)
**Status:** Shipped — see `docs/superpowers/plans/2026-07-24-ai-executor.md`

## 1. Goal

Turn a task into LLM-executed work. You mark a task as AI-doable with an **action type** (`generate`, `publish_blog`, …). An in-process worker calls an LLM via **OpenRouter** (model chosen per action type from a routing table), runs the matching **action** on the result, and writes the outcome back to the task — completing it on success.

Concrete payoff: *"create a task 'write a blog about X' → mark it `publish_blog` → the AI drafts it, you approve, it publishes to WordPress, the task completes."*

## 2. Non-goals (explicitly deferred)

- **A fleet of action adapters.** This spec ships **two** actions: `generate` (store text) and `publish_blog` (write + push to WordPress). The adapter *interface* is designed so GitHub/email/etc. are small additions later — but they are not built here.
- **Autonomous agent loops / function-calling.** One LLM call per action, deterministic typed actions. No agent that "decides what to do."
- **Meta-routing (an LLM picks the model).** Model selection is a config table, not a model.
- **The self-improving knowledge loop.** That is Sub-project C. B stores run history (which C will mine), but does no reflection.
- **A separate executor process.** Runs in the existing in-process queue worker. No new process to deploy.
- **Streaming UI / live progress.** A run records status (`queued` → `running` → `done`/`failed`); the UI polls or refreshes. WebSocket streaming is out of scope.

## 3. What already exists (do not rebuild)

| Exists | File | Status |
| --- | --- | --- |
| In-process queue with real timers; `queue.on(name, handler)` registration; `enqueue(name, data, {delayMs})` | `packages/queue/src/in-process.ts` | Complete. Fires regardless of `start()` (verified during A). |
| Worker registration pattern (`registerWorkers`) | `packages/core/src/workers.ts` | Complete. B adds one handler alongside the existing 5. |
| Autonomy gate: `gateAction` returns `off`/`ask`/`auto`, queues approvals, logs audit | `packages/core/src/autonomy.ts` | Complete. B reuses it. |
| `JobName` enum | `packages/types/src/index.ts` | Exists; B adds `'runAiTask'`. |
| Tasks stored as a JSON `doc` blob → new Task fields persist with zero migration | `packages/db/src/sqlite.ts` | Complete. B adds AI fields to the `Task` type. |
| API key persistence pattern (table + repo) | `packages/db/src/port.ts`, `sqlite.ts` | Pattern from A; B follows it for the WordPress credential + run history. |
| `makeAi` (heuristic suggestions) | `packages/core/src/ai.ts` | Unrelated to execution; left as-is. |

**What does NOT exist** (the build):

1. **OpenRouter client** — a thin fetch wrapper (OpenRouter is OpenAI-compatible: `POST https://openrouter.ai/api/v1/chat/completions`, `model` field per call). One module, no SDK.
2. **Model routing table** — action type → model slug + quality tiers.
3. **`runAiTask` worker** — picks up an enqueued AI task, calls the LLM, runs the action adapter, writes the result.
4. **Action adapters + registry** — `generate` and `publish_blog`, behind an `Action` interface so more can follow.
5. **AI fields on `Task`** — `aiAction`, `aiStatus`, `aiRunId`, `aiConfig` (prompt overrides, model override).
6. **`ai_runs` table** — append-only history of every run (model used, prompt, output, status, cost, error, timestamps).
7. **WordPress credential storage** — one connection record (URL + application username/password), encrypted (existing `encryptJSON` helper).
8. **API + UI** — mark a task AI-doable, view the run + result, approve publish.

## 4. Decisions (locked from brainstorming)

1. **Trigger:** explicit opt-in. A task is AI-doable only when you set its `aiAction` to a non-null value.
2. **Execution shape:** typed actions. The LLM step and the action step are separate and independently testable.
3. **Model choice:** per-action-type routing table (config), with optional per-task model override.
4. **Approval:** reuse the autonomy gate (`off`/`ask`/`auto`). `publish_blog` defaults to `ask` (human previews the draft before it goes public). `generate` defaults to `auto`.
5. **Host:** in-process queue worker. No new process.
6. **Scope:** two actions ship (`generate`, `publish_blog`), interface designed for more.

## 5. Architecture

### 5.1 End-to-end flow

```
User marks task aiAction='publish_blog'
   │
   ▼
tasks.setAiAction(taskId, 'publish_blog')   ← sets Task.aiAction + aiStatus='queued'
   │                                          enqueues queue.enqueue('runAiTask', {taskId})
   ▼
runAiTask worker fires (in-process)
   │
   ├─ load task → read aiAction + aiConfig
   ├─ autonomy.gate('executeAi', {orgId, title})   ← off=stop, ask=park for approval, auto=proceed
   ├─ resolve model  ← routing table[aiAction] (or task.aiConfig.model override)
   ├─ build prompt   ← action.prompt(task) → system + user messages
   ├─ OpenRouter.complete({model, messages})        ← fetch to /chat/completions
   ├─ action.run({task, output, ctx})               ← generate: store; publish_blog: push to WP
   ├─ write ai_runs row (model, output, status, cost, ms)
   └─ on success: tasks.complete(taskId)  + audit event 'ai.task.executed'
```

### 5.2 Component map (new code)

| Component | File | Responsibility |
| --- | --- | --- |
| OpenRouter client | `packages/integrations/src/openrouter.ts` | One `complete({model, messages, apiKey})` → `{text, model, usage}`. fetch + abort timeout. Never throws — returns `{error}` on failure. |
| Routing table | `packages/core/src/ai-router.ts` | `resolveModel(action, override?) → string`. Static defaults from env, overridable later via DB settings. |
| Action interface + registry | `packages/core/src/ai-actions.ts` | `interface Action { type; prompt(task); run({task, output, ctx}); defaultAutonomy }`. Registry: `generate`, `publish_blog`. |
| `generate` action | `packages/integrations/src/ai-actions/` (or core) | `prompt` → "produce the deliverable for: {title}"; `run` → store output as a task comment + ai_runs row. |
| `publish_blog` action | same | `prompt` → "write a complete blog post (HTML) about: {title}"; `run` → POST to WordPress REST `/wp-json/wp/v2/posts` with basic-auth creds, capture returned post URL. |
| `runAiTask` worker | extends `packages/core/src/workers.ts` | Orchestrates the flow above. One handler. |
| AI fields on Task | `packages/types/src/index.ts` | `aiAction?: AiActionType \| null; aiStatus?: AiStatus; aiRunId?: string; aiConfig?: AiTaskConfig`. |
| `ai_runs` table + repo | `packages/db/src/port.ts` + `sqlite.ts` | Append-only run history (migration pattern from A's api_keys). |
| WordPress credential | reuse `connections` table (channel `'wordpress'`) | URL + creds in encrypted `credentials` blob. Already exists. |

### 5.3 Data model

**Task additions** (persist in the existing JSON doc — no migration):
```ts
type AiActionType = 'generate' | 'publish_blog';   // extensible
type AiStatus = 'queued' | 'running' | 'awaiting_review' | 'done' | 'failed' | 'cancelled';

interface Task {
  // …existing fields…
  aiAction?: AiActionType | null;     // null/absent = normal human task
  aiStatus?: AiStatus;
  aiRunId?: string;                   // latest ai_runs.id
  aiConfig?: { promptOverride?: string; modelOverride?: string };
}
```

**New `ai_runs` table** (append-only history — a task can be retried):
```sql
CREATE TABLE ai_runs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, task_id TEXT NOT NULL,
  action TEXT, model TEXT, status TEXT, cost_usd REAL, duration_ms INTEGER,
  result_ref TEXT, error TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE INDEX idx_ai_runs_task ON ai_runs(task_id);
CREATE INDEX idx_ai_runs_org ON ai_runs(org_id, at);
```
`doc` holds the full row (prompt, full output) for debugging; indexed columns for listing.

**WordPress credential** — stored as a `connections` row, `channel='wordpress'`, `credentials = { apiUrl, username, appPassword }` (encrypted via existing `encryptJSON`). No new table.

### 5.4 Model routing table

Defaults (env-overridable), resolving to OpenRouter slugs:
```ts
const DEFAULT_ROUTING: Record<AiActionType, { default: string; quality?: string }> = {
  generate:     { default: 'anthropic/claude-3.5-sonnet' },
  publish_blog: { default: 'anthropic/claude-3.5-sonnet' },
};
// env override: COMPANYBRAIN_AI_MODEL_GENERATE=..., COMPANYBRAIN_AI_MODEL_PUBLISH_BLOG=...
// per-task override: task.aiConfig.modelOverride wins over the table.
```
Deliberately two entries (not a full tier system) — YAGNI. Add tiers if a real cost/quality tradeoff appears.

### 5.5 OpenRouter client

```ts
// packages/integrations/src/openrouter.ts
export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }
export interface CompletionResult {
  ok: boolean; text?: string; model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  costUsd?: number; error?: string; durationMs: number;
}
export async function complete(opts: {
  model: string; messages: ChatMsg[];
  apiKey: string; timeoutMs?: number;
}): Promise<CompletionResult>  // never throws
```
- `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <key>`, `HTTP-Referer` + `X-Title` headers (OpenRouter requests these for ranking; harmless if omitted).
- AbortController with a 120s ceiling (LLM calls are slow).
- Cost computed from `usage` × a tiny per-model rate table (best-effort; OpenRouter returns `usage` but not $ — we approximate from a small map, mark unknown as `null`). Cost is informational, not billing.
- On any failure (non-2xx, network, parse, timeout): return `{ ok:false, error }`. The worker records the run as `failed` and leaves the task `aiStatus='failed'` for retry.

### 5.6 Action interface

```ts
// packages/core/src/ai-actions.ts
export interface ActionRunInput  { task: Task; output: string; ctx: Context; deps: ActionDeps }
export interface ActionRunResult { ok: boolean; resultRef?: string; error?: string }
export interface Action {
  type: AiActionType;
  defaultAutonomy: Autonomy;            // generate→auto, publish_blog→ask
  prompt(task: Task): { system: string; user: string };
  run(input: ActionRunInput): Promise<ActionRunResult>;
}
export interface ActionDeps {
  wordpressCreds?: { apiUrl: string; username: string; appPassword: string };
}
export const ACTIONS: Record<AiActionType, Action>;
```
- `generate.run` → appends a task comment with the output + returns `{ok:true, resultRef: commentId}`. Leaves the deliverable on the task for you to use.
- `publish_blog.run` → `fetch(wordpress.apiUrl + '/wp-json/wp/v2/posts', { method:'POST', auth: basic, body: { title, content, status:'draft' } })`. **Always creates as `draft`** even on `auto` — the autonomous path publishes a *draft*, never a live post. Returning a human to the draft review in WordPress is the last gate. Returns `{ok:true, resultRef: wpPostUrl}`.
- New `AutonomyAction 'executeAi'` added to the enum, `DEFAULT_AUTONOMY.executeAi = 'ask'` (so the whole feature is opt-in; an admin sets it to `auto` to let generate-class tasks run free).

### 5.7 Worker (`runAiTask`)

Registered alongside existing workers. Flow per the §5.1 diagram. Key rules:
- Idempotent on re-fire: if `task.aiStatus` is already `running`/`done`, skip (defends against a duplicate enqueue).
- The LLM call and the action call each go through try/catch; a failure in either records a `failed` run and stops — never half-completes.

**The `ask` path — what "approval" approves.** For `publish_blog` the human wants to approve the *draft text*, so the LLM runs first; approval gates the *publish*, not the generation. The resolved flow:

| Gate level | LLM runs? | Action runs? | Task state |
| --- | --- | --- | --- |
| `off` | no | no | stays `queued` (feature disabled for this org) |
| `ask` | **yes** (generate the draft) | **no** — parks | `awaiting_review` → human reviews draft in UI → approve → action runs → `done` |
| `auto` | yes | yes immediately | `done` |

So `ask` spends the LLM call (you can't review text that doesn't exist yet), but **never reaches the outward-facing action** until a human clicks approve. This is the correct approval semantics for "publish to my public site" — you approve the actual draft, and the irreversible step (publish) is what's gated.

**Two autonomy knobs, distinguished:**
- `executeAi` (the `AutonomyAction`) is the **global** gate — applies to *all* AI tasks in the org. Defaults `ask`.
- `Action.defaultAutonomy` (§5.6) is a **per-action-class** floor — `generate` wants `auto`, `publish_blog` wants `ask`. The effective level for a given task is the **stricter** of the two (if global is `ask` and the action wants `auto`, the task is `ask`; if global is `auto` and the action wants `ask`, the task is still `ask` — a per-action floor can never be *loosened* by the global setting). This keeps outward-facing actions safe even if an admin flips the global to `auto`.

## 6. Security (VibeSec)

- **OpenRouter key** (`OPENROUTER_API_KEY`) is server-side only, read from env, never sent to the client, never logged. Same discipline as the existing `ANTHROPIC_API_KEY`.
- **WordPress application password** is a credential at a trust boundary. Stored encrypted (`encryptJSON`, already used for other connections), never returned unencrypted by any API, never logged. The API returns only `"configured": true/false`, not the secret.
- **Outward-facing action defaults to `ask`.** A `publish_blog` task will not push to your public site without a human click. Even on `auto`, it creates a WordPress **draft**, never a published post — the worst case is a draft you delete.
- **Prompt injection:** the LLM's output is treated as *data*, never as instructions to the action. `publish_blog.run` uses the output strictly as post body/title; it does not parse the output for commands. The action's behavior is fixed code, not LLM-directed.
- **Cost ceiling:** per-call timeout (120s) + the routing table bounds which models run. No unbounded agent loop means no runaway spend. A task can be retried, but each retry is one bounded call.
- **Every run is logged** to `ai_runs` (model, prompt, output, cost, status) — full auditability, which is also what Sub-project C will mine later.

## 7. Testing

Following the project's no-framework discipline (`node --test` + tsx):

- **`openrouter.test.ts`** — mock `fetch` (override global) → assert request shape (URL, auth header, model field, message shape), assert success parse, assert timeout returns `{ok:false}`, assert non-2xx returns `{ok:false,error}`. Never makes a real network call.
- **`ai-router.test.ts`** — assert `resolveModel('generate')` returns default; env override wins; per-task override wins over env.
- **`ai-actions.test.ts`** — assert `generate.run` appends a comment + returns ok; assert `publish_blog.run` POSTs to the right URL with basic auth + `status:'draft'` (mock fetch); assert a failed WP call returns `{ok:false}` and does not complete the task.
- **`executor.test.ts`** (the integration) — enqueue an AI task with a stubbed OpenRouter client that returns canned text → assert the worker runs the action, writes an `ai_runs` row, completes the task, emits the audit event. Assert the three gate levels: `off` → no LLM call, task stays `queued`; `ask` → LLM runs (draft generated), action does **not** run, task is `awaiting_review` (approve → action runs → `done`); `auto` → LLM + action both run, task `done`.
- **Manual** — set a real `OPENROUTER_API_KEY`, create a `generate` task, watch it run and complete with a comment; configure WordPress creds, create a `publish_blog` task under `ask`, approve, see the draft appear in WordPress.

No new framework, temp SQLite file per test (existing pattern).

## 8. Build sequence (preview — the writing-plans skill expands this)

1. `types` — add `AiActionType`, `AiStatus`, `AiTaskConfig`, Task AI fields; add `'runAiTask'` to `JobName`; add `'executeAi'` to `AutonomyAction`.
2. `core/autonomy` — default `executeAi: 'ask'`.
3. `db` — add `AiRunRepo` + `ai_runs` table + impl (follow A's api_keys pattern).
4. `integrations/openrouter` — the client + tests (mocked fetch).
5. `core/ai-router` — routing table + `resolveModel`.
6. `core/ai-actions` — interface + `generate` + `publish_blog` + registry.
7. `integrations/wordpress` (or inside ai-actions) — `publishPost` helper using stored creds.
8. `core/workers` — `runAiTask` handler wiring it together.
9. `core/tasks` — `setAiAction(taskId, action, config?)` + enqueue; `complete` already exists.
10. `server` routes — `POST /api/tasks/:id/ai` (set action + enqueue), `GET /api/ai-runs?taskId=` (history), `POST /api/ai-runs/:id/approve` (the `ask` path), WordPress creds CRUD.
11. `ui` — "Assign to AI" affordance on a task (action picker), run/result panel, approve button, WordPress settings.
12. `.env.example` + README — `OPENROUTER_API_KEY`, model overrides, WordPress setup.

## 9. Invariants preserved

- **One runnable app.** The executor runs in the existing in-process worker. No new process, no new external service beyond OpenRouter (an API) and WordPress (an API).
- **`core` never imports a concrete db.** New `ai_runs` repo goes through the port.
- **No secrets in the client/logs/output.** OpenRouter key + WordPress password are server-side, encrypted at rest.
- **Every action scoped, logged, reversible.** Autonomy gate + `ai_runs` history + WordPress-draft-default + the existing task `undo` path.
- **Fail-closed defaults.** `executeAi` autonomy defaults to `ask`; `publish_blog` defaults to `ask` AND creates drafts. Nothing reaches the public web without a human.

## 10. Open questions for the user

Two decisions I made on your behalf worth a sanity check:

1. **`publish_blog` creates a WordPress *draft* even on `auto`** (never a live post). The alternative is letting `auto` publish directly. I chose draft-as-floor because a public blog post is hard to un-publish and SEO/indexing can grab it within minutes. If you want true auto-publish, that's a one-line change in `publish_blog.run`.

2. **`generate` action stores its output as a task *comment*** (so you can read/copy it in the UI). The alternative is a separate "deliverables" surface. Comment-reuse is the lazy, zero-new-UI path; a dedicated surface is Sub-project C territory. Say the word if you'd rather a separate deliverables view.
