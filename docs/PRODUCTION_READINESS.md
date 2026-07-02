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
- [x] Added production auth mode with key-based sessions and cookie auth
  - [x] `COMPANYBRAIN_AUTH_MODE=key`
  - [x] `COMPANYBRAIN_ACCESS_KEY`
  - [x] Optional `COMPANYBRAIN_USERS` JSON roster
  - [x] Default roster includes **Monty** (`user_monty`)
- [x] Added `/api/auth/*` endpoints for login/session flow
- [x] Protected non-auth `/api/*` endpoints with session checks in key mode
- [x] Added web login modal + sign-out controls in UI (desktop + mobile)
- [x] Added unauthorized/session-expiry handling in client API helper
- [x] Added login rate-limit guard on `/api/auth/login`
- [x] Updated startup logs to show auth mode
- [x] Restored clean `typecheck` by adding `googleapis` + strict typing in Gmail/Calendar integrations
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

## 🔧 Required go-live settings (Hostinger)

- Framework preset: `Other`
- Build command: `None`
- Package manager: `pnpm`
- Entry file: `server.js`
- Root directory: `./`

Environment variables:

- `NODE_ENV=production`
- `COMPANYBRAIN_NO_OPEN=true`
- `COMPANYBRAIN_AUTH_MODE=key`
- `COMPANYBRAIN_ACCESS_KEY=<strong-random-secret>`
- `COMPANYBRAIN_USERS=<json-array-optional>`

## ⚠️ Recommended before public launch (non-blocking but important)

- [ ] Enforce HTTPS-only cookies in production via `COMPANYBRAIN_SECURE_COOKIE=true`
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
