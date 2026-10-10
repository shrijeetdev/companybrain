# companybrain

> **Nothing slips.** One command center where every task — for every human *and* every AI agent —
> is captured, owned, scheduled, reminded and finished. And it plays like a game.

- **Capture in seconds** — type `Send Acme proposal tomorrow 5pm @priya #website !high` and the
  date, person, project and priority are understood. Works the same from WhatsApp, email, Claude
  and the API.
- **Reminders that actually fire** — before the deadline, at it, when overdue, then escalation to
  the creator or supervisor. Stored in the database, so a restart never loses one. Follow-ups
  ("waiting on Raj") nudge the other person automatically.
- **Humans and AI agents on one team** — assign missions to Claude, ChatGPT, Cursor or any MCP/REST
  agent. Agents load their open work at the start of every session, leave progress and hand-off
  notes, and get flagged when they go quiet — so the AI can't forget either.
- **Your personal spoken briefing** — open the dashboard and hear today's missions, what's overdue,
  your meetings, and (for managers) the whole squad and the AI operatives.
- **Tactical Ops game layer** — missions, operations, squad; XP, ranks from Recruit to Legend,
  streaks, loot crates, medals, daily challenges and leaderboards (humans and AI ranked
  separately). Cheat-resistant, computed on the server. Prefer calm? Switch to *Classic*.
- **Projects, team, inbox, calendar, reports, pipeline** — all shared, real-time, installable as an
  app on desktop and phone, with push notifications.

## Run it

```bash
pnpm install
pnpm build        # → dist/server.js + dist/web
pnpm start        # → http://localhost:4317 — the first visit runs the setup wizard
```

One process, one SQLite file (`~/.companybrain/companybrain.sqlite`). No Docker, Postgres or Redis
required. Every setting is optional — see [`.env.example`](.env.example).

**Deploying** (Hostinger, Docker, VPS), backups and integrations: [docs/DEPLOY.md](docs/DEPLOY.md).

## Connect Claude (or any AI) in 30 seconds

In the app: **Settings → Connect AI** → copy the URL → in Claude: **Settings → Connectors → Add
custom connector** → paste → **Connect** → approve. ChatGPT, Claude Code, Cursor, VS Code, Gemini CLI
and n8n are covered in [packages/mcp/CONNECT.md](packages/mcp/CONNECT.md). Other platforms can use the
REST API (`/api/openapi.json`).

## Develop

```bash
pnpm dev          # API + background worker from source (tsx)
pnpm dev:web      # web app with hot reload
pnpm typecheck
pnpm test         # unit + API + full-stack integration tests
pnpm test:e2e     # Playwright, against the production build
```

| Package | What it is |
|---|---|
| `packages/types` | The contract: domain types and service interfaces |
| `packages/nlp` | Natural-language quick-add parser (Node + browser) |
| `packages/db` | SQLite schema, migrations (incl. v1 import), org-scoped repositories |
| `packages/core` | Services, persistent scheduler, reminders, notifications, briefing, intake |
| `packages/game` | Tactical Ops engine — XP, ranks, crates, medals ([rules](packages/game/RULES.md)) |
| `packages/integrations` | WhatsApp, email, Web Push, calendar feeds, LLM, text-to-speech |
| `packages/mcp` | MCP server for AI agents (HTTP + stdio) |
| `packages/server` | HTTP API, auth, OAuth, live updates, webhooks |
| `packages/web` | The web app (React) |
| `cli` | `companybrain` command: serve · mcp · migrate · backup |

Design docs: [docs/v2/PLAN.md](docs/v2/PLAN.md) · [API](docs/v2/API.md) · [wiring](docs/v2/WIRING.md).
The previous version's code is kept for reference in `legacy/`.

## License

[MIT](LICENSE)
