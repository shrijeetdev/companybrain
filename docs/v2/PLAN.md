# companybrain v2 — plan

## Goal

**One place where every task, for every human and every AI agent, is captured, owned, scheduled,
reminded and finished — and nothing is ever forgotten.**

A team opens the dashboard and hears: *"Good morning, Shrijeet. You have 4 tasks today, one is
overdue: the Acme proposal. You have a meeting with Raj at 3 PM. Priya closed 3 tasks yesterday,
and Claude is still drafting the blog post."* Then they get to work.

### Success criteria (definition of done)

1. **Capture in seconds, from anywhere.** Quick-add box understands
   `Send Acme proposal tomorrow 5pm @priya #website !high` (date, assignee, project, priority,
   recurrence, reminder). Same parser works from WhatsApp, email, MCP and the REST API.
2. **Nothing slips.** Every task with a deadline gets persistent reminders (survive restarts):
   before due, at due, overdue, then escalation to the creator/supervisor. Recurring tasks spawn
   exactly once per occurrence. Follow-ups ("waiting on Raj") auto-nudge the other party.
3. **Humans and AI agents are equal team members.** Assign a task to Claude/ChatGPT/Cursor/any agent.
   Agents connect over MCP (stdio *and* remote HTTP) or REST with their own API key, start each
   session with `get_my_work`, leave progress notes/hand-offs, and get flagged as **stale** if they
   go quiet — so the AI can't "forget" a task either.
4. **Every person gets their own dashboard + spoken briefing** (tasks, overdue, meetings, waiting-on,
   and for managers, the whole team and the AI agents).
5. **Projects** are shared, server-side, with members, progress and their own board.
6. **WhatsApp & email intake.** A team member WhatsApps/emails the bot → it becomes their task
   (with a confirmation reply). Unknown senders land in an **Inbox** for triage.
7. **Beautiful, fast, animated UI** on desktop and mobile (installable PWA, push notifications).
8. **Production-grade**: secure by default, tested (unit + API + end-to-end), documented,
   deployable with one command (Docker or Hostinger), data persisted and backed up.

## Verdict on v1 (why a v2)

Audit on 2026-10-10 found 40+ verified defects, including: auth bypass via percent-encoded paths,
cross-org IDOR in bulk/undo/approvals, rate limiting silently disabled, UI POSTs failing (complete,
logout, undo), recurring tasks doubling daily, guessable 32-bit API keys with unenforced scopes,
MCP stdio corrupted by the web server booting in the same process, an unused module that runs shell
commands unconfirmed, Docker volume mounted at the wrong path (data loss), reminders that never
notify anyone, an in-memory queue that loses all scheduled work on restart, and projects/agents
stored only in one browser's localStorage. v2 keeps the good ideas and proven bits (SQLite,
scrypt hashing, ICS parsing, WhatsApp clients, the glass look) on a clean, tested foundation.

## Architecture

One Node process, one SQLite file, one port — unchanged deployment story.

```
packages/
  types/         contract: domain types, DTOs, CoreServices + port interfaces (no runtime deps)
  nlp/           quick-add natural-language parser (pure; runs in Node AND the browser)
  db/            SQLite schema, versioned migrations (incl. v1 → v2 import), org-scoped repos
  core/          services (implements CoreServices), persistent scheduler, reminder engine,
                 notifier fan-out, briefing composer, intake handler, live bus
  integrations/  Outbound (WhatsApp Cloud + QR/Baileys, SMTP email, Web Push), IMAP poller,
                 ICS fetcher (SSRF-safe), LLM (Anthropic/OpenAI-compatible, optional), TTS (optional)
  mcp/           MCP tools over CoreServices; stdio + Streamable HTTP transports
  server/        Fastify: auth/session/CSRF/rate-limit/helmet, REST routes, SSE, webhooks,
                 /mcp mount, serves the SPA
  web/           React SPA (Vite) — the product UI
cli/             `companybrain` (serve) · `companybrain mcp` (stdio) · `companybrain migrate`
```

Removed: `auth` (folded into core/db), `queue` (replaced by the persistent scheduler), `billing`,
`agent` (shell-executing bridge — security risk), `ui`, Supabase adapters, the 2,700-line inline UI.

### Key decisions

| Topic | Decision |
|---|---|
| Tenancy | Single org per deployment, but every row and query is still org-scoped. |
| Auth | Email + password (scrypt, async). DB-backed sessions (revocable). First-run setup wizard creates the owner — no passwords in env/docs. |
| AI agents | `Member` with `kind: 'agent'`. Auth by API key (`cb_live_` + 32 random bytes, SHA-256 at rest, scopes `read`/`write`, expiry, revocation). Humans can also mint personal keys ("my Claude acts as me"). |
| MCP | Official `@modelcontextprotocol/sdk`. Stdio for desktop hosts; Streamable HTTP at `/mcp` (Bearer) and `/mcp/k/<key>` for URL-only connectors. |
| Other agents | REST API + `/api/openapi.json` (ChatGPT Actions, n8n, Zapier, custom). |
| Scheduler | `jobs` table, tick every 10 s, dedupe keys, retries with backoff, idempotent handlers. |
| Reminders | Org default offsets `[1440, 60, 0]` min; overdue at +0; escalate after `escalateAfterMin`; quiet hours; daily digest at member's `digestHour`. |
| Channels | In-app (always) + Web Push (VAPID) + WhatsApp + email, per member prefs. |
| Voice briefing | Server composes the script (optionally LLM-polished); client speaks it with the browser's SpeechSynthesis, or plays server TTS audio when a provider (OpenAI / ElevenLabs) is configured. Auto-plays once per day after login (browser autoplay rules), otherwise a "Play briefing" button. |
| Meetings | Manual + per-member private ICS feed URL (Google/Outlook/Apple), synced every 15 min. |
| WhatsApp | Cloud API (official) or QR pairing (Baileys 7, optional dependency, loaded lazily). |
| Email | IMAP polling of a dedicated mailbox (works with Gmail/Outlook/Zoho/Hostinger) + generic inbound webhook; SMTP for outbound. |
| Frontend | React 19 + Vite + TypeScript, `motion` for animation, TanStack Query, `wouter` routing, `lucide-react` icons, hand-written CSS with design tokens (light/dark, glass). Built to `dist/web`, committed (Hostinger can't run esbuild). |
| Loops (v1) | Unified into tasks: "their court" loops become tasks with `waitingOn`. |

### Security baseline (must hold everywhere)

- Auth via encapsulated plugin scopes, never URL string checks. Org scoping inside every repo method.
- Role checks in core services (not only routes): `owner/admin` manage members/org/integrations;
  `manager` manages projects/agents/keys for agents and sees team; `member` own + shared work;
  `guest` read-only on projects they're members of; `agent` = its key's scopes.
- CSRF header for cookie mutations; SameSite=Lax; Secure cookie behind HTTPS (trustProxy configurable).
- `@fastify/helmet` with a strict CSP for the SPA; CORS off (same-origin) unless configured.
- Rate limiting registered and awaited; keyed by actor or IP; strict on login/setup.
- Constant-time login for unknown users; async scrypt; session rotation on login; revoke on
  password change / deactivation / role change.
- Webhooks fail closed (signature/secret required) and return 401, not 500.
- SSRF guard on every server-side fetch of user-provided URLs (ICS): https/http only, resolve DNS,
  block private/loopback/link-local ranges, size + time limits.
- No secrets in repo; `.env.example` only. Secrets at rest (WhatsApp session, feed URLs) encrypted
  with `COMPANYBRAIN_SECRET` (AES-256-GCM); generated and stored on first boot if absent.

## Workstreams (parallel builders, each owns its packages)

| # | Workstream | Owns | Depends on |
|---|---|---|---|
| 1 | Data + core services | `types` (additive only), `db`, `core` | contract |
| 2 | HTTP server | `server`, `cli` | contract (codes against `CoreServices`) |
| 3 | Integrations + NLP | `nlp`, `integrations` | contract |
| 4 | MCP | `mcp` | contract |
| 5 | Web app | `web` | contract + `docs/v2/API.md` |
| 6 | Ops & QA (after 1–5 merge) | Dockerfile, CI, docs, e2e tests, deploy | all |

Integration + verification (lead): merge, wire, run unit + API + Playwright e2e, independent
security and UX review, fix, ship.

## Quality gates

- `pnpm typecheck` clean, `pnpm test` green (unit + API tests via `fastify.inject`).
- Playwright e2e: setup → login → quick-add with NL → task appears for assignee in real time →
  reminder fires (accelerated clock) → notification shows → complete → undo → agent via MCP
  `get_my_work` + `complete_task` → briefing renders and speaks (speech mocked).
- Zero console errors on every screen, desktop 1440×900 and mobile 390×844, light and dark.
- `pnpm build` produces `dist/server.js` + `dist/web/`; `node server.js` boots with no dev deps.
