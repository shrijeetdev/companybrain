# Production readiness checklist (go-live)

This checklist is based on a full repo sweep of:

- `companybrain/` (all runtime code paths and deploy config)
- `../Liquid Glass Design System (1)/design.md`
- `../Liquid Glass Design System (1)/plan.md`
- `../Liquid Glass Design System (1)/prompt.md`
- `../Liquid Glass Design System (1)/Company Brain.dc.html`
- `../Liquid Glass Design System (1)/Liquid Glass Design System.dc.html`
- `../Liquid Glass Design System (1)/support.js`

## ✅ Completed in code

- [x] Fixed embedded UI JS escaping bug that caused spinner-only shell (no content render)
- [x] Removed duplicate UI function blocks in `web-ui.ts` that could break script parsing/stall rendering
- [x] Fixed bundle/runtime regression (`Dynamic require of "node:*" is not supported`) by hardening externals in `scripts/build.mjs`
- [x] Rebuilt and committed `dist/server.js` from latest source
- [x] Added production auth modes with cookie sessions
  - [x] Legacy shared-key mode: `COMPANYBRAIN_AUTH_MODE=key`, `COMPANYBRAIN_ACCESS_KEY`, optional `COMPANYBRAIN_USERS`
  - [x] Recommended password mode: `COMPANYBRAIN_AUTH_MODE=password`
  - [x] First-admin bootstrap via `COMPANYBRAIN_ADMIN_EMAIL`, `COMPANYBRAIN_ADMIN_PASSWORD`, optional `COMPANYBRAIN_ADMIN_NAME`
- [x] Added `/api/auth/*` endpoints for login/session flow
- [x] Login no longer exposes public user names/rosters; users enter email/username + password
- [x] Added CEO/admin user-management endpoints: `GET/POST /api/admin/users`, `PATCH/DELETE /api/admin/users/:id`, `POST /api/admin/users/:id/password`
- [x] Protected non-auth `/api/*` endpoints with session checks in session auth modes
- [x] Added web login modal + sign-out controls in UI (desktop + mobile)
- [x] Added Settings → User Management UI for CEO/admins to create users, edit roles/status, reset passwords, and delete users
- [x] Added unauthorized/session-expiry handling in client API helper
- [x] Added login rate-limit guard on `/api/auth/login`
- [x] Updated startup logs to show auth mode
- [x] Restored clean `typecheck` by adding `googleapis` + strict typing in Gmail/Calendar integrations
- [x] Tasks board: real drag-and-drop between Today/Tomorrow/Upcoming (uses existing `/api/tasks/:id/move`)
- [x] Leads pipeline: real drag-and-drop between stages (added `PUT /api/leads/:id/stage` + `core.leads.setStage`)
- [x] Projects are now clickable — opens a working detail view (status, progress steppers, edit, delete)
- [x] Projects support custom color picker and custom image upload (data URL), in addition to templates
- [x] Agents: "Hire a new agent" is now fully functional — create/edit/remove custom agents with emoji + autonomy level, persisted client-side alongside the built-in roster
- [x] Updated docs (`README.md`, `docs/BUILD_PLAN.md`)

## ✅ Validation run

- [x] `pnpm -C companybrain run typecheck`
- [x] `pnpm -C companybrain test`
- [x] `pnpm -C companybrain run build`
- [x] `pnpm -C companybrain start` (entry wrapper + dist boot)
- [x] Extracted served `<script>` and ran `node --check` (no syntax errors)
- [x] Smoke-tested key auth flow:
  - [x] `/api/loops` returns `401` without session in key mode
  - [x] login works for `user_monty`
  - [x] authenticated requests succeed
- [x] Smoke-tested password auth flow:
  - [x] `/api/loops` returns `401` without session
  - [x] `/api/auth/users` does not reveal the roster
  - [x] bootstrap admin can log in as `ceo`
  - [x] CEO/admin can list/create users
  - [x] created non-CEO user can log in but cannot access `/api/admin/users`

## 🔧 Required go-live settings (Hostinger)

- Framework preset: `Other`
- Build command: `None`
- Package manager: `pnpm`
- Entry file: `server.js`
- Root directory: `./`

Environment variables:

- `NODE_ENV=production`
- `COMPANYBRAIN_ENC_KEY=<generated>` — **required**; the app refuses to start in production
  without it. Generate with
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
  Without it, credentials at rest would be encrypted with a key derived from a constant in
  this repository. Keep it safe — losing it means re-entering every stored credential.
- `COMPANYBRAIN_NO_OPEN=true`
- `COMPANYBRAIN_AUTH_MODE=password`
- `COMPANYBRAIN_ADMIN_EMAIL=<your admin email>`
- `COMPANYBRAIN_ADMIN_PASSWORD=<generated, set in the host's env settings only — never in this repo>`
- `COMPANYBRAIN_ADMIN_NAME=<your admin name>`
- `COMPANYBRAIN_SECURE_COOKIE=true`

Notes:

- Password mode seeds the admin only when no users exist yet. If users already exist, change/reset passwords from Settings → User Management.
- Replace the bootstrap password after first login for a public production deployment.
- **Never commit the bootstrap password.** Earlier revisions of this file and of `README.md`
  carried a real one (`info@vexocore.in`); it has been redacted here, but it remains in git
  history, so **that password must be treated as compromised and rotated**. Set the value only
  in the host's environment-variable settings. The server refuses to seed an admin with a
  weak or short password (see `COMPANYBRAIN_ADMIN_PASSWORD` handling in `packages/auth/src/password.ts`).

## ✅ Pre-launch hardening (was "recommended before public launch")

- [x] Enforce HTTPS-only cookies in production via `COMPANYBRAIN_SECURE_COOKIE=true`
- [x] Structured request logging and error telemetry — pino JSON logs (`COMPANYBRAIN_LOG_LEVEL`)
      plus Sentry when `SENTRY_DSN` is set; 5xx are captured with method/URL, 4xx logged as
      warnings. Both pino instances redact cookies, `authorization`, webhook signatures,
      `set-cookie` and credential-shaped fields, so a request error can no longer write a
      session token or API key into the log (`packages/server/test/log-redaction.test.ts`).
- [x] Automated SQLite backups — a nightly `backupDatabase` job in the running app plus
      `companybrain backup` for cron (`scripts/backup.sh`). Uses SQLite's online backup API,
      which is safe against a live WAL database; retention defaults to 14 copies.
      `companybrain backup --list` shows them; `companybrain restore <file>` prints the
      (deliberately manual) restore steps. `COMPANYBRAIN_BACKUP=off` disables the nightly job
      when the host already snapshots the volume.
- [x] HTTPS hardening headers — HSTS (2 years, `includeSubDomains; preload`) when
      `COMPANYBRAIN_SECURE_COOKIE=true` or `NODE_ENV=production`, plus CSP with
      `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
      `Referrer-Policy` and `Permissions-Policy`. Asserted by the smoke run.
- [x] Smoke e2e in CI — `pnpm smoke` (`scripts/smoke.mjs`) boots the built bundle in password
      mode against a throwaway database and asserts 26 checks: the UI serves, its generated
      inline script parses, every tab has a render branch, the security headers are present,
      `/api/*` is 401 without a session, the roster stays private, the bootstrap admin can log
      in and read, and a non-admin is refused by both admin surfaces. CI also runs `pnpm build`
      and fails when the committed `dist/server.js` is stale.
- [x] `@whiskeysockets/baileys` — the declared `^6.7.9` resolved to `6.17.16`, which npm marks
      deprecated for **GHSA-qvv5-jq5g-4cgg** (message spoofing). Because the fixed line
      (`6.7.22+`) sorts below `6.17.16`, a caret range keeps selecting the vulnerable build.
      Now pinned to `~6.7.24` and relocked. That version also drops the git-tarball
      `@whiskeysockets/eslint-config` from the runtime graph.

## 🔐 Operational notes

- **`/metrics`** (Prometheus) sits outside `/api/*`, so the session gate does not cover it.
  In production it is served only to a caller presenting `COMPANYBRAIN_METRICS_TOKEN` as a
  bearer token; with the variable unset the endpoint returns 404 rather than publishing your
  volume counters to the internet. `/health` stays open — load balancers need it.
- **Rate limits:** 100/min globally, 10/min on `/api/auth/login`, 30/min on webhooks, and
  20/min on the AI execution endpoints (those spend money per call and can push to an
  external site, so the global limit is a DoS guard, not a spend guard).
- **Backups:** verify one restores before you need it — `companybrain backup`, then follow
  `companybrain restore <file>` on a copy and confirm recent data is present.
- **Encryption key:** `COMPANYBRAIN_ENC_KEY` protects everything in `connections.credentials`.
  Setting it on an install that has been running without one is non-breaking — existing rows
  are read with the old fallback key and re-encrypted under the real key on their next save.
- **Secrets:** `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` and the WordPress application
  password are server-side only. The WordPress credential is encrypted at rest in the
  `connections` table and the API returns only the site and username, never the password.
- **`pnpm install` requires GitHub access** for one git-hosted transitive dependency
  (`libsignal`, pulled in by baileys). An environment that blocks `github.com` cannot install.

## Design-system alignment status

Core implemented items from the Liquid Glass docs are in place:

- Light-first calm UI with blue accent
- Tasks/Leads/Projects surfaces and modal flows
- Team/Brain/Reports/Settings views
- SSE updates and notifications
- Mobile nav + more sheet
- Accountability metadata on cards

Remaining deep-product items (calendar/gantt/table, advanced task comments/subtasks drag-and-drop, fuller role-specific analytics) are enhancement-phase work, not launch blockers for current scope.
