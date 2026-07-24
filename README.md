# companybrain

> **Never forget a task or a follow-up — across every channel, and your whole team.**

A team operating system that watches every channel (Email, Slack, WhatsApp, Telegram, Calendar, meetings), turns anything needing a human into a tracked **open loop**, and never lets it slip. AI agents do real work alongside people; every action is **scoped, logged, and reversible**.

The clickable design spec lives in the prototype (`../Liquid Glass Design System (1)/Company Brain.dc.html`). This repo turns it into a real product.

## One app, one command

```bash
pnpm install
pnpm start
```

That single process is the **whole product**: it runs SQLite migrations, an **in-process worker** (real timers — chases and briefings actually fire), the API, and the web UI — all on one port. No Docker, no Postgres, no Redis, no separate frontend. Data lives in one file at `~/.companybrain/companybrain.sqlite`.

## Production auth (real users + passwords)

By default, companybrain runs in **local** mode (single user, no login) for frictionless dev.
For production, use password mode so the login page asks only for **email/username + password** and never exposes the user roster publicly.

```bash
COMPANYBRAIN_AUTH_MODE=password
COMPANYBRAIN_ADMIN_EMAIL=info@vexocore.in
COMPANYBRAIN_ADMIN_PASSWORD=1234@1234work
COMPANYBRAIN_ADMIN_NAME="Vexocore Admin"
COMPANYBRAIN_SECURE_COOKIE=true
```

On first boot, if the `users` table is empty, companybrain seeds that admin as role `ceo` with full permissions. After login, CEO/admin users can open **Settings → User Management** to create users, change roles (`client`, `employee`, `manager`, `ceo`, `agent`), disable/delete users, and reset passwords. If users already exist, the bootstrap env vars do not overwrite passwords; reset them from the admin UI.

The older shared-key mode is still available for controlled/internal deployments:

```bash
COMPANYBRAIN_AUTH_MODE=key
COMPANYBRAIN_ACCESS_KEY=replace-with-a-strong-secret
```

Optional key-mode rosters can still be provided via `COMPANYBRAIN_USERS`, but password mode is recommended for public production.

## Deploy to a server (e.g. DigitalOcean)

It's one container. Build and run it:

```bash
docker build -t companybrain .
docker run -d -p 4317:4317 \
  -v companybrain-data:/root/.companybrain \
  --env-file .env \
  companybrain
```

Then point your domain at the droplet on port 4317 (or put any reverse proxy in front). The mounted volume keeps your SQLite data across restarts and redeploys. No other services to provision.

You can also run it without Docker on the server: `git clone`, `pnpm install`, `pnpm start` (optionally under `pm2`/`systemd`).

## Architecture — one codebase, one runnable app

`packages/core` (domain logic: loops, tasks, leads, agents, autonomy) depends only on three **ports** — `db`, `queue`, `auth` — each with a single embedded adapter:

| Port | Implementation |
| --- | --- |
| **db** | SQLite (one file) |
| **queue** | in-process (real timers) |
| **auth** | local single-user, key-based sessions, or password-backed per-user accounts |

The ports stay as interfaces, so a heavier backend could be added later without touching `core` or the routes — but nothing extra is required to run.

```
packages/  core · db · queue · auth · integrations · server · ui · types
cli/       the one entrypoint — `pnpm start` boots everything
```

## Use companybrain from Claude Desktop / Cursor / VS Code (MCP)

companybrain speaks the Model Context Protocol over stdio, so any MCP host can read and (gated) write your tasks, loops, and leads.

**One-time setup (in the running web app):**

1. **Settings → User Management →** create a user with role **agent** (e.g. name "MCP Agent").
2. Create an API key for that agent and copy it (shown once).
3. In **Settings → Auto**, decide what the agent may do. By default a connected host is **read-only** — set `createTasks` and/or `manageRecords` to `ask` (propose, you approve) or `auto` (act, then log) to allow writes.

**Connect a host (Claude Desktop `claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "companybrain": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/companybrain/cli/bin/companybrain.ts", "mcp"],
      "env": { "COMPANYBRAIN_MCP_KEY": "cb_..." }
    }
  }
}
```

(Cursor / VS Code / Cline: same command + args + env in their MCP settings.)

The MCP process opens the same `~/.companybrain/companybrain.sqlite` file as the web app (WAL), so they coexist. Every write is attributed to the "MCP Agent" account in the audit trail and runs through the same autonomy + approval + undo path as everything else.

## Status

**Milestone 1 — bootable foundation** (in progress): single-app skeleton, shared types, the three ports with embedded adapters (SQLite + in-process queue + single-user auth), `core` domain logic, a Fastify server that serves both the API and the web UI, and the one-command bootstrapper. See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## License

[MIT](LICENSE)
