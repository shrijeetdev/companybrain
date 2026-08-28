# Companybrain MCP Exposure — Design

**Date:** 2026-07-24
**Sub-project:** A (of three: A MCP exposure · B AI executor + OpenRouter · C self-improving company brain)
**Status:** Shipped — see `docs/superpowers/plans/2026-07-24-mcp-exposure.md`

## 1. Goal

Expose companybrain's domain over the Model Context Protocol (MCP) so external AI hosts — Claude Desktop, Cursor, VS Code, Cline — can read and (gated) write tasks, loops, and leads in a running companybrain instance from a single command.

The server speaks **stdio JSON-RPC only** (the MCP host spawns it as a child process). Every mutation is:

- **Attributed** to a dedicated, named `agent` account (not the nebulous `user_local` default), identified by an API key.
- **Gated** through the existing `autonomy` control plane — the same gate the background workers use — so writes either run, get queued for human approval, or are blocked, exactly as configured per org.

## 2. Non-goals (explicitly deferred)

- **HTTP/SSE transport.** stdio only in this sub-project. ChatGPT's cloud connectors need HTTP and are out of scope here; that is a candidate Phase 2 once there's a concrete need.
- **The OpenRouter AI executor** ("write a task → AI picks a model → does the work → completes it"). That is Sub-project B.
- **Knowledge graph / `search_knowledge` / the self-improving loop.** Sub-project C.
- **New tool surfaces** beyond the one missing tool (`create_loop`). Specifically deferred: `get_audit_log`, `list_approvals`, agent-package/JARVIS OS actions. Add when a real need shows up.
- **Cross-org multi-tenancy** beyond what already exists. The MCP server resolves a single org (the seeded agent's org) per invocation.

## 3. What already exists (do not rebuild)

| Exists | File | Status |
| --- | --- | --- |
| JSON-RPC 2.0 stdio server (`initialize`, `notifications/initialized`, `tools/list`, `tools/call`, batch, error codes) | `packages/mcp/src/server.ts` | Complete, spec-conformant. |
| Tool registry + 9 handlers (`list_tasks`, `create_task`, `complete_task`, `assign_task`, `list_loops`, `close_loop`, `search`, `get_dashboard`, `create_lead`, `advance_lead`) | `packages/mcp/src/tools.ts` | Complete. |
| `packages/mcp` package exports | `packages/mcp/src/index.ts` | Complete. |
| Autonomy gate: `gateAction(ctx, action, opts)` returns resolved level, enqueues approvals, records audit events | `packages/core/src/autonomy.ts` | Complete. |
| API key service: `makeApiKeys(ctx)` → `create/verify/revoke` with prefix lookup + hashed store | `packages/core/src/api-keys.ts` | Complete. |
| `agent` role with full read+write on loops/tasks/leads | `packages/auth/src/capabilities.ts` | Complete. |
| Core bootstrap from ports (`createCoreFromPorts`) and full bootstrap (`bootstrap`) | `packages/core/src/index.ts` | Complete. |

**What does NOT exist** (the build):

1. A `companybrain mcp` CLI subcommand that boots a minimal Core and calls `startMcpServer`.
2. `create_loop` MCP tool (the `loops.capture()` core method exists; it is just not exposed).
3. Wiring of API-key identity into the MCP `ToolContext` (the server currently falls back to `user_local`).
4. Routing of write tools through the `autonomy` gate (current tools mutate directly).

## 4. Decisions (locked from brainstorming)

1. **Transport:** stdio only.
2. **Tools:** existing 9 + `create_loop`. No others.
3. **Identity:** dedicated `agent` account, authenticated by an API key. Each MCP invocation resolves to this actor for audit attribution.
4. **Permissions:** reuse `autonomy` gate. No parallel permission system.
5. **Process model:** standalone `companybrain mcp` command — boots minimal Core (db + auth only), no web UI / no worker / no Fastify. The MCP host spawns it directly.

## 5. Architecture

### 5.1 Process model

```
┌─────────────────┐        spawn (stdio)        ┌──────────────────────────┐
│  MCP host       │  ─────────────────────────►  │  companybrain mcp        │
│  (Claude Desktop│   JSON-RPC over stdin/stdout │  (child process)         │
│   Cursor, …)    │  ◄─────────────────────────  │                          │
└─────────────────┘                              │  readline → handle()     │
                                                 │  → tools/list            │
                                                 │  → tools/call            │
                                                 │       ↓                  │
                                                 │  Core (db + auth only)   │
                                                 │  → tasks/loops/leads     │
                                                 │  → autonomy.gate()       │
                                                 │  → apiKeys.verify()      │
                                                 └────────────┬─────────────┘
                                                              │ same file
                                                              ▼
                                              ~/.companybrain/companybrain.sqlite
                                              (WAL mode → concurrent with web app)
```

The MCP process opens the **same** SQLite file as the running web app. SQLite in WAL mode supports one writer + many readers concurrently, and companybrain already uses better-sqlite3 with WAL. Short, infrequent MCP mutations (create/close/advance) coexist with the web app without coordination. No new IPC, no shared server state.

### 5.2 Minimal Core boot

`companybrain mcp` constructs Core with only the ports it needs. `createCoreFromPorts` requires `db` + `queue` + `auth` (queue is **not** optional in the signature), so:

- **db:** `createDatabase()` (opens the SQLite file).
- **queue:** `createQueue()` (the in-process adapter — cheap, just timers). Constructed but **no workers are registered** (`registerWorkers` / `boot.startWorkers` are never called), so nothing actually fires. It exists only to satisfy the port signature.
- **auth:** `createAuth()` in local mode (the default). Identity is **not** resolved through `auth.current()` for MCP — see 5.4; the agent principal is resolved from the API key and injected via `ToolContext`, which the existing `tools.ts identity()` helper already prefers over `auth.current()`.
- **messenger / drafter:** left at their no-op defaults (`consoleMessenger`, `templateDrafter`) — MCP never sends messages or drafts replies.

`bootstrap()` (which starts workers and seeds) is **not** used by the MCP command. The MCP process must not become a second worker.

### 5.3 Component changes

**`packages/mcp/src/tools.ts`** — add one tool, gate all writes:

- New tool `create_loop` → `core.loops.capture({ orgId, actorId, title, side, dueAt })`.
- Each write tool (`create_task`, `complete_task`, `assign_task`, `create_loop`, `close_loop`, `create_lead`, `advance_lead`) is wrapped so that before mutating it calls `core.autonomy.gate(action, opts)`. The mapping is:
  - `create_task`, `create_loop` → `createTasks`
  - `complete_task`, `assign_task`, `close_loop`, `create_lead`, `advance_lead` → **`manageRecords`** (new — see 5.5)
  - The gate returns one of `auto` (proceed and mutate) / `ask` (return a result telling the host the action is **queued for human approval**, do not mutate) / `off` (return a refused result, do not mutate).
- Read tools (`list_tasks`, `list_loops`, `search`, `get_dashboard`) are **never gated** — reads are always allowed for the agent role.

**`cli/bin/companybrain.ts`** — add subcommand dispatch:

- Today the bin unconditionally boots the full app. Add argv handling:
  - `companybrain` (no args) or `companybrain start` → current full-app behavior (unchanged).
  - `companybrain mcp [--org ORG_ID] [--key KEY]` → minimal Core boot + `startMcpServer`, then block. Does **not** listen on a port, open a browser, or start workers.

**New `cli/bin/mcp.ts`** (or a function in the bin) — the MCP entrypoint: build minimal Core, resolve identity, call `startMcpServer({ core, context: { orgId, actorId } })`. Keeps the MCP path out of the web-app boot code.

### 5.4 Identity & authentication

Two pre-existing limitations in `packages/core/src/api-keys.ts` had to be addressed for MCP to work, because the MCP process is **separate** from the web app that creates the key:

- **Keys are stored in an in-memory `Map`, not persisted.** A key created in the web app is invisible to the MCP process. → **Fix:** persist API keys to SQLite (a new `api_keys` table + migration), and load them into the existing `Map` cache on Core boot. The `makeApiKeys` interface (`create/list/verify/revoke/getByPrefix`) stays identical; only the backing store changes.
- **`ApiKey` has no owner link** (only `orgId`/`name`/`scopes`). There is no `actorId` on the key. → **Fix:** add an optional `actorId` to `ApiKey`, set when the key is created for a specific user (the agent account). `verify()` returns it.

With those two fixes, the identity flow is:

1. The seeded admin creates an `agent` user ("MCP Agent") from the web app's **Settings → User Management** (existing flow).
2. The admin issues an API key for that agent. `apiKeys.create(orgId, 'MCP Agent', scopes, actorId)` now persists the key to SQLite **and** records the agent's `actorId`. The raw key is shown once.
3. The MCP host's config supplies the key. `companybrain mcp` reads it from env (`COMPANYBRAIN_MCP_KEY`) or `--key`.
4. At boot, the MCP entrypoint calls `core.apiKeys.verify(key)` → returns the `ApiKey` (with `orgId` + `actorId`) or `null`. If `null`, exit non-zero with a clear stderr message before the readline loop starts.
5. The resolved `{ orgId, actorId }` is passed as `ToolContext` to `startMcpServer`. The existing `tools.ts identity()` helper already prefers an injected context over `auth.current()`, so every handler attributes its mutations to the agent — no change to handler identity logic.

Because identity is injected via `ToolContext`, auth stays in its default local mode; no KeyAuth binding is needed.

**Security note (VibeSec):** the API key is a credential at a trust boundary. The key is never logged, never returned by `tools/list` or any tool output, and is read from env/flag only at boot. The persisted key is stored hashed (the `create` path should hash before persist — the raw key is held only in the in-memory cache for the process that created it, and for the MCP process only long enough to resolve identity at boot). MCP stdio has no network surface, so there is no remote unauthenticated path in this sub-project.

### 5.5 New autonomy action: `manageRecords`

`AutonomyAction` is currently `'createTasks' | 'sendReminders' | 'draftReplies' | 'chase' | 'joinMeetings'`. None of those cleanly covers "close a loop," "advance a lead," "assign a task," or "complete a task." Rather than overload `createTasks` (which means *create*, semantically) or leave five write tools ungated, add one action:

- **`types/index.ts`:** `AutonomyAction` gains `manageRecords`.
- **`autonomy.ts`:** `DEFAULT_AUTONOMY.manageRecords = 'off'` (fail-closed — an external AI cannot mutate existing records until an admin opts in by setting it to `ask` or `auto`).
- **`DEFAULT_AUTONOMY.createTasks` stays `'off'`** as today, so creating tasks/loops via MCP also defaults to blocked until enabled.

This keeps the semantics honest: `createTasks` = the act of creating new work items (tasks **and** loops, since both are "new open work"); `manageRecords` = mutating existing records (complete/assign/close/advance). Both default to `off`, so by default an external AI connected via MCP is **read-only** until a human turns it on per org. This is the least-surprise, fail-closed default.

### 5.6 Error handling

The existing server already wraps every `tools/call` handler in try/catch and returns `{ isError: true, content: [...] }` rather than throwing. This contract is preserved. New behaviors:

- **Refused by autonomy (`off`):** return `{ isError: false, content: ["Action blocked: autonomy level is 'off' for <action>. Ask an admin to set it to 'ask' or 'auto'."] }`. Not an error (the host shouldn't retry); an explicit refusal.
- **Queued for approval (`ask`):** return `{ isError: false, content: ["Action queued for human approval. It will run once approved in the companybrain UI (Auto tab)."] }` and the approval row already created by `gateAction`.
- **API key invalid / missing:** the minimal Core boot fails fast with a clear stderr message and non-zero exit **before** the readline loop starts. The MCP host will show "server failed to start." No key is ever echoed.

## 6. Data flow — `create_task` via Claude Desktop (worked example)

1. Claude Desktop config has `"command": "companybrain", "args": ["mcp"], "env": { "COMPANYBRAIN_MCP_KEY": "cbk_…" }`.
2. Claude spawns the process. The bin routes `mcp` to the MCP entrypoint.
3. MCP boot: `createDatabase()` + `createAuth()` (key mode, verifies the key → agent principal for `org_local`).
4. `startMcpServer` reads `initialize` → replies with server info + capabilities.
5. Claude calls `tools/list` → 10 tools returned (9 existing + `create_loop`).
6. Claude calls `tools/call { name: "create_task", arguments: { title: "Email Priya the proposal" } }`.
7. Handler resolves identity → agent principal. Calls `core.autonomy.gate('createTasks', { orgId, actorId, … })`.
8. **If `auto`:** `core.tasks.create(...)` runs → returns task → handler returns it as MCP content. Audit trail shows `actor: agent MCP Agent, type: task.created`.
9. **If `ask`:** `gateAction` creates an approval row → handler returns "queued for approval."
10. **If `off`:** handler returns "blocked: autonomy off." No mutation.

## 7. Testing

Following the project's no-framework discipline (existing tests use `node --test` + tsx):

- **Unit test (autonomy mapping):** add to `packages/core/test/` or a new `packages/mcp/test/gate.test.ts` — assert that each write tool name maps to the expected `AutonomyAction`, and that the handler returns the right refusal/queued/proceed shape for each level. This is the non-trivial branch and the thing most likely to silently break.
- **Smoke test (stdio):** a tiny script that spawns `companybrain mcp`, writes a JSON-RPC `initialize` + `tools/list` line to stdin, and asserts the response shape on stdout. Smallest thing that fails if the wiring is wrong.
- **Manual:** add the server to a local Claude Desktop config and confirm `get_dashboard` returns data, then toggle `manageRecords` to `auto` and confirm `create_task` mutates and is attributed to the agent.

No new test framework, no fixtures beyond a temp SQLite file (the pattern `packages/core/test/` already uses).

## 8. Build sequence (preview — the writing-plans skill expands this)

1. `types` — add `manageRecords` to `AutonomyAction`.
2. `core/api-keys` — persist `api_keys` to SQLite (migration + load-on-boot); add `actorId` to `ApiKey`; hash the key before persisting. Keep the `makeApiKeys` interface unchanged.
3. `core/autonomy` — default `manageRecords: 'off'`.
4. `mcp/tools` — add `create_loop`; route write tools through `core.autonomy.gate` with the mapping; route identity via the injected `ToolContext`.
5. `cli/bin` — add `mcp` subcommand dispatch; new MCP entrypoint: minimal Core boot (db + queue + auth-local), `apiKeys.verify` the env key, inject `{ orgId, actorId }` as `ToolContext`, call `startMcpServer`.
6. `.env.example` + README — document `COMPANYBRAIN_MCP_KEY`, the agent-account setup steps, and the Claude Desktop config snippet.
7. Tests + manual verification.

## 9. Invariants preserved

- **One runnable app** invariant is untouched: `companybrain` (no args) still boots the whole product exactly as before. `companybrain mcp` is an additive subcommand.
- **`core` never imports a concrete db/queue/auth** — the MCP path uses the same ports/interfaces.
- **No secrets in the client / in logs.** The API key is read from env at boot, verified server-side, never serialized into tool output.
- **Every mutation is scoped, logged, and reversible.** Autonomy gate + agent attribution + the existing `undo` path apply to MCP actions identically.
- **Fail-closed defaults.** A freshly connected external AI is read-only until a human opts in.

## 10. Open question for the user

The one decision I made on your behalf that's worth a sanity check: **`createTasks` and `manageRecords` both default to `off`**, meaning a newly connected Claude Desktop can read everything but cannot create or change anything until you flip the autonomy level in the UI. The alternative is defaulting `createTasks` to `ask` (so Claude can propose tasks that queue for your approval) and `manageRecords` to `off`. I chose full read-only-by-default because it's the safer VibeSec default for "an external process now has write access to your company brain." Say the word if you'd prefer the `createTasks: 'ask'` default.
