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
- `COMPANYBRAIN_NO_OPEN=true`
- `COMPANYBRAIN_AUTH_MODE=password`
- `COMPANYBRAIN_ADMIN_EMAIL=you@yourcompany.com`
- `COMPANYBRAIN_ADMIN_PASSWORD=<redacted>`
- `COMPANYBRAIN_ADMIN_NAME=Vexocore Admin`
- `COMPANYBRAIN_SECURE_COOKIE=true`

Notes:

- Password mode seeds the admin only when no users exist yet. If users already exist, change/reset passwords from Settings → User Management.
- Replace the bootstrap password after first login for a public production deployment.

## ⚠️ Recommended before public launch (non-blocking but important)

- [x] Enforce HTTPS-only cookies in production via `COMPANYBRAIN_SECURE_COOKIE=true`
- [ ] Add structured request logging and error telemetry (Sentry/Logtail/etc.)
- [ ] Configure automated SQLite backups for `~/.companybrain/companybrain.sqlite`
- [ ] Add HTTPS reverse-proxy hardening headers (HSTS/CSP fine-tune)
- [ ] Add smoke e2e script for auth + tab render checks in CI
- [ ] Review/upgrade `@whiskeysockets/baileys` before enabling Baileys mode in production (upstream package currently emits a security advisory warning during install)

## Design-system alignment status

Core implemented items from the Liquid Glass docs are in place:

- Light-first calm UI with blue accent
- Tasks/Leads/Projects surfaces and modal flows
- Team/Brain/Reports/Settings views
- SSE updates and notifications
- Mobile nav + more sheet
- Accountability metadata on cards

Remaining deep-product items (calendar/gantt/table, advanced task comments/subtasks drag-and-drop, fuller role-specific analytics) are enhancement-phase work, not launch blockers for current scope.
