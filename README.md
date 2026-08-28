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
COMPANYBRAIN_ADMIN_EMAIL=you@example.com
COMPANYBRAIN_ADMIN_PASSWORD=            # generate one, never commit it
COMPANYBRAIN_ADMIN_NAME="Your Admin"
COMPANYBRAIN_SECURE_COOKIE=true
```

Generate the bootstrap password rather than inventing one, and set it only in your host's
environment-variable settings — never in a file you commit:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
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
  -v companybrain-data:/data \
  --env-file .env \
  companybrain
```

Then point your domain at the droplet on port 4317 (or put any reverse proxy in front). The
volume mounted at `/data` holds the SQLite database and its backups, so both survive restarts
and redeploys. No other services to provision.

> Upgrading from an image built before the `/data` change? That image ran as a non-root user
> whose home was `/home/companybrain`, so a volume mounted at `/root/.companybrain` was never
> written to and the database lived inside the container. Copy it out before replacing the
> container: `docker cp <container>:/home/companybrain/.companybrain/companybrain.sqlite ./`,
> then mount the new volume and place the file at `/data/companybrain.sqlite`.

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

1. **Settings → User Management →** create a user with role **agent** (e.g. name "MCP Agent"). (Password auth mode only — in single-user local mode skip this and leave the key's agent user as **None**.)
2. **Settings → API keys →** name the key, pick its scopes and (optionally) the agent user it acts as, then **Create key** and copy it. It is shown once and never again.
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

## AI tasks (executor + OpenRouter)

A task can be executed by AI instead of a human. Mark a task with an action type and the in-process worker calls a model via [OpenRouter](https://openrouter.ai), runs the action, and completes the task.

**Actions:**
- `generate` — the AI produces the deliverable (stored as a task comment). Default autonomy: `auto`.
- `publish_blog` — the AI writes a post and pushes a **draft** to WordPress (never a live post). Default autonomy: `ask` — you approve the draft before it publishes.

**Setup:**
1. Set `OPENROUTER_API_KEY` (get one at openrouter.ai). Without it the worker skips and tasks stay queued.
2. In **Settings → Auto**, set `executeAi` to `ask` (default) or `auto`. The effective level is the stricter of this global gate and the action's floor — so `publish_blog` always needs approval even when the global is `auto`.
3. For `publish_blog`, save WordPress credentials (site URL + application username/password):
   `PUT /api/connections/wordpress` with `{ "apiUrl", "username", "appPassword" }`. They are encrypted at rest and never returned.

**API:**

| Route | Does |
| --- | --- |
| `POST /api/tasks/:id/ai` `{action, config?}` | mark the task AI-executable (or `{"action":null}` to clear) |
| `GET /api/tasks/:id/ai-runs` | run history for the task |
| `POST /api/ai-runs/:id/approve` | approve an `awaiting_review` draft so its action runs |
| `PUT`/`GET /api/connections/wordpress` | save / check WordPress credentials |

`config` accepts `promptOverride` (replaces the user message) and `modelOverride` (an OpenRouter slug for this task only).

Every run is logged (model, prompts, output, duration, error) in `ai_runs` for auditability.

## Backups

The whole company is one SQLite file, so a backup is one consistent copy of it. The running
app takes one nightly; run one yourself any time:

```bash
pnpm backup                  # or: node dist/server.js backup
node dist/server.js backup --list
node dist/server.js restore <file>    # prints the manual restore steps
```

Copies land in `~/.companybrain/backups` (`COMPANYBRAIN_BACKUP_DIR`), keeping the newest 14
(`COMPANYBRAIN_BACKUP_RETENTION`). `COMPANYBRAIN_BACKUP=off` disables the nightly job when
your host already snapshots the volume. For cron, `scripts/backup.sh` wraps the same command
and exits non-zero on failure so cron can alert:

```
0 2 * * * /path/to/companybrain/scripts/backup.sh >> /var/log/companybrain-backup.log 2>&1
```

Backups use SQLite's online backup API, so they are safe to take while the app is writing —
unlike `cp`, which can capture a torn file when WAL is on.

## Checks

```bash
pnpm typecheck   # types
pnpm test        # unit + integration
pnpm build       # produces the dist/server.js that production runs
pnpm smoke       # boots the built app and checks auth, headers, and every tab
```

CI runs all four on every push and pull request, and fails if the committed
`dist/server.js` is stale.

## Status

**Milestone 1 — bootable foundation** (in progress): single-app skeleton, shared types, the three ports with embedded adapters (SQLite + in-process queue + single-user auth), `core` domain logic, a Fastify server that serves both the API and the web UI, and the one-command bootstrapper. See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## License

[MIT](LICENSE)
