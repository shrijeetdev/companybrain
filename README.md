# companybrain

> **Never forget a task or a follow-up — across every channel, and your whole team.**

A team operating system that watches every channel (Email, Slack, WhatsApp, Telegram, Calendar, meetings), turns anything needing a human into a tracked **open loop**, and never lets it slip. AI agents do real work alongside people; every action is **scoped, logged, and reversible**.

The clickable design spec lives in the prototype (`../Liquid Glass Design System (1)/Company Brain.dc.html`). This monorepo turns it into a real product.

## Try it in one command

```bash
npx companybrain
```

Creates `~/.companybrain/`, runs SQLite migrations, and boots the API + web + an **in-process worker** in a single process — no Docker, no Postgres, no Redis. Opens your browser.

## Architecture — one codebase, three modes

Mode is the only thing that branches, via `COMPANYBRAIN_MODE`:

| Port | `local` (npx) | `selfhost` | `cloud` |
| --- | --- | --- | --- |
| **db** | SQLite (file) | Postgres | Postgres + RLS |
| **queue** | in-process | Redis + BullMQ | Redis + BullMQ |
| **auth** | single user | org / RBAC | org / RBAC + Stripe |

`packages/core` (domain logic: loops, tasks, leads, agents, autonomy) never knows the mode — it depends only on the `db` / `queue` / `auth` **ports**. The in-process queue is a *real* implementation (delayed jobs fire), so chases and briefings work identically in local and prod.

```
apps/      mobile (Expo) · web (Next.js) · api (Fastify) · worker (BullMQ + Baileys)
packages/  core · db · queue · auth · integrations · ui · types
cli/       npx companybrain bootstrapper
```

## Status

**Milestone 1 — bootable local foundation** (in progress): monorepo skeleton, shared types, the three ports with working `local` adapters (SQLite + in-process queue + single-user auth), `core` domain logic, a Fastify API, and the `npx companybrain` bootstrapper. See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## License

[MIT](LICENSE) (open-core — cloud billing/control plane is a separate commercial package).
