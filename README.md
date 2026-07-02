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

## Production auth (multi-user + access key)

By default, companybrain runs in **local** mode (single user, no login) for frictionless dev.
For production, enable key-based sessions:

```bash
COMPANYBRAIN_AUTH_MODE=key
COMPANYBRAIN_ACCESS_KEY=replace-with-a-strong-secret
```

Optional: provide explicit users via JSON (`COMPANYBRAIN_USERS`).

```json
[
  { "id": "user_ceo", "name": "James Carter", "role": "ceo", "email": "james@acme.com" },
  { "id": "user_monty", "name": "Monty Singh", "role": "manager", "email": "monty@acme.com" },
  { "id": "user_emp", "name": "Alex Kumar", "role": "employee", "email": "alex@acme.com" }
]
```

If `COMPANYBRAIN_USERS` is not supplied, a safe default roster is created (including `user_monty`) and all users authenticate using `COMPANYBRAIN_ACCESS_KEY`.

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
| **auth** | local single-user _or_ key-based multi-user sessions |

The ports stay as interfaces, so a heavier backend could be added later without touching `core` or the routes — but nothing extra is required to run.

```
packages/  core · db · queue · auth · integrations · server · ui · types
cli/       the one entrypoint — `pnpm start` boots everything
```

## Status

**Milestone 1 — bootable foundation** (in progress): single-app skeleton, shared types, the three ports with embedded adapters (SQLite + in-process queue + single-user auth), `core` domain logic, a Fastify server that serves both the API and the web UI, and the one-command bootstrapper. See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## License

[MIT](LICENSE)
