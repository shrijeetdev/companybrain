# companybrain — build plan (prototype → real product)

Per the v5 master prompt. One TS monorepo, three modes (`local | selfhost | cloud`) behind `db`/`queue`/`auth` ports.

## Milestones (spec §7 order)

- **M1 — bootable local foundation** _(in progress)_
  - [x] Monorepo skeleton: pnpm workspaces, Turbo, tsconfig base, .gitignore, .env.example, MIT license
  - [x] `packages/types` — one definition of Loop/Task/Lead/DomainEvent/User/Autonomy/Job/Mode
  - [ ] `packages/db` — port + working SQLite local adapter (+ migrations) + Postgres stub
  - [ ] `packages/queue` — port + **real** in-process adapter (delayed jobs fire) + BullMQ stub
  - [ ] `packages/auth` — port + local single-user adapter + org-RBAC stub
  - [ ] `packages/core` — loops/tasks/leads/autonomy domain over the ports
  - [ ] `apps/api` — Fastify over ports (loops/tasks/leads routes) + serves web
  - [ ] `apps/web` — minimal Liquid-Glass page listing live loops from SQLite
  - [ ] `cli` — `npx companybrain` bootstrapper (migrate + boot api+worker+web, open browser)
- **M2** — port `core` screens (web Next.js, then mobile Expo) from the prototype, via `packages/ui`
- **M3** — WhatsApp Cloud API end-to-end through the integration pipeline
- **M4** — fan-in Gmail/Calendar/Slack/Telegram/GitHub onto the same pipeline
- **M5** — `docker-compose.yml` self-host (Postgres + Redis + worker w/ Baileys)
- **M6** — `packages-private/cloud`: Stripe billing + multi-tenant RLS + provisioning

## Invariants
- `core` never imports a concrete db/queue/auth/stripe — only the ports.
- In-process queue is a **real** implementation; local and prod behave identically.
- No secrets in the client; all LLM + integration calls server-side.
- Mobile-first; verify on 390px.
- Faithful to `../Liquid Glass Design System (1)/Company Brain.dc.html` — do not redesign.
