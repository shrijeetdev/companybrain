# companybrain — build plan (prototype → real product)

**One single app.** A TS monorepo of internal libraries behind `db`/`queue`/`auth` ports, plus one runnable entrypoint (`pnpm start`). One process serves the API and the web UI, runs the worker in-process, and stores everything in one SQLite file. No Docker, Postgres, Redis, or separate frontend required to run it — upload it to a server and start it.

## Milestones

- **M1 — bootable foundation** _(in progress)_
  - [x] Monorepo skeleton: pnpm workspaces, Turbo, tsconfig base, .gitignore, .env.example, MIT license
  - [x] `packages/types` — one definition of Loop/Task/Lead/DomainEvent/User/Autonomy/Job
  - [x] `packages/db` — port + embedded SQLite adapter (+ migrations)
  - [x] `packages/queue` — port + **real** in-process adapter (delayed jobs fire)
  - [x] `packages/auth` — port + single-user adapter
  - [x] `packages/core` — loops/tasks/leads/autonomy domain over the ports
  - [x] `packages/server` — Fastify over the ports (loops/tasks/leads routes) + serves the web UI
  - [x] `cli` — `pnpm start` boots everything (migrate + API + in-process worker + web, open browser)
  - [x] Single `Dockerfile` — one image, one process, for server deploys
- **M2** — flesh out the web UI screens from the prototype, served straight from the app (`packages/ui` tokens)
- **M3** — WhatsApp Cloud API end-to-end through the integration pipeline
- **M4** — fan-in Gmail/Calendar/Slack/Telegram/GitHub onto the same pipeline
- **M5** — real LLM extraction + autonomy actions wired into the worker

## Invariants
- One deployable app. No separate API/web/worker services; no external DB/queue required.
- `core` never imports a concrete db/queue/auth — only the ports (so a heavier backend stays *possible* later without rewrites).
- In-process queue is a **real** implementation; scheduled work actually fires.
- No secrets in the client; all LLM + integration calls server-side.
- Mobile-first; verify on 390px.
- Faithful to `../Liquid Glass Design System (1)/Company Brain.dc.html` — do not redesign.
