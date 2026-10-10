# companybrain v2 — HTTP API contract

All types are in `packages/types/src/index.ts`. Every route maps 1:1 to a `CoreServices`
method. Routes never touch the DB directly.

## Conventions

- JSON in/out. Errors: `{ "error": { "code": ErrorCode, "message": string, "details"?: {} } }`
  with the HTTP status from `HTTP_STATUS`.
- **Auth** (one of):
  - Session cookie `cb_session` (HttpOnly, SameSite=Lax, Secure when HTTPS). Resolved with
    `auth.resolveSession` on EVERY request (role/active read fresh — demotion takes effect immediately).
  - `Authorization: Bearer cb_live_…` API key → `auth.resolveApiKey` (scopes + expiry enforced).
- **CSRF**: cookie-authenticated mutating requests (POST/PATCH/PUT/DELETE) must send
  header `X-CB-Client: web`. Bearer-authenticated requests are exempt.
- Authentication is enforced by **route registration scope** (an encapsulated Fastify plugin
  with an `onRequest` hook), never by string-matching the URL.
- Empty bodies on POST are valid (`{}` assumed).
- Validation: zod on every body/query/param. IDs: `^[a-z]+_[A-Za-z0-9]{6,32}$`.
- Rate limits: global 300 req/min per actor-or-IP; login/setup 10/min per IP+identifier.

## Public

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/health` | | `{ ok, version, uptime }` |
| GET | `/api/auth/state` | | `{ needsSetup: boolean, authenticated: boolean, member?: Member, org?: OrgSettings }` |
| POST | `/api/auth/setup` | `{ orgName, name, email, password, timezone }` | `{ member }` + cookie (only while needsSetup) |
| POST | `/api/auth/login` | `{ identifier, password }` | `{ member }` + cookie |
| POST | `/api/auth/logout` | | `{ ok: true }` (clears cookie) |
| GET | `/api/openapi.json` | | OpenAPI 3.1 doc of this API (for ChatGPT Actions / n8n / any agent) |
| GET/POST | `/webhooks/whatsapp` | Meta verify / signed payload | Meta Cloud API webhook (signature REQUIRED) |
| POST | `/webhooks/email` | provider inbound payload, `?secret=` or header `X-CB-Webhook-Secret` | inbound email webhook (secret REQUIRED) |

## Authenticated (`/api/*`)

### Me & briefing
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/me` | | `Member` |
| PATCH | `/api/me` | `UpdateMemberInput` (only name, phone, title, timezone, color, avatarUrl, prefs) | `Member` |
| POST | `/api/me/password` | `{ current, next }` | `{ ok }` |
| GET | `/api/briefing` | | `Briefing` |
| POST | `/api/briefing/audio` | `{ text }` | `audio/*` bytes, or `204` when no TTS provider (client falls back to browser speech) |

### Tasks
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/tasks` | `TaskQuery` as query (`status`, `priority` comma-separated; `completedSince` = epoch ms, closed tasks only if closed since then) | `TaskView[]` |
| POST | `/api/tasks` | `CreateTaskInput` | `TaskView` |
| POST | `/api/tasks/quick` | `{ text, defaults?: Partial<CreateTaskInput> }` | `TaskView` |
| POST | `/api/tasks/preview` | `{ text }` | `{ parsed, draft, unresolved }` |
| POST | `/api/tasks/bulk` | `{ ids, op: { kind, value? } }` | `{ ok, failed }` |
| GET | `/api/tasks/:id` | | `TaskView` |
| PATCH | `/api/tasks/:id` | `UpdateTaskInput` | `TaskView` |
| DELETE | `/api/tasks/:id` | | `{ auditId }` (200) — `POST /api/audit/:auditId/undo` restores the task |
| POST | `/api/tasks/:id/complete` | | `TaskView` |
| POST | `/api/tasks/:id/reopen` | | `TaskView` |
| POST | `/api/tasks/:id/nudge` | | `TaskView` |
| POST | `/api/tasks/:id/subtasks` | `{ title }` | `TaskView` |
| PATCH | `/api/tasks/:id/subtasks/:subId` | `{ title?, done? }` | `TaskView` |
| DELETE | `/api/tasks/:id/subtasks/:subId` | | `TaskView` |
| PUT | `/api/tasks/:id/subtasks/order` | `{ ids: string[] }` (exactly the current subtask ids, new order) | `TaskView` |
| GET | `/api/tasks/:id/activity` | | `TaskActivity[]` |
| POST | `/api/tasks/:id/comments` | `{ text, kind?: 'comment'\|'handoff' }` | `TaskActivity` |

### Projects, members, keys, org
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/projects` | `?includeArchived=1` | `ProjectSummary[]` |
| POST | `/api/projects` | project input | `ProjectSummary` |
| GET/PATCH/DELETE | `/api/projects/:id` | patch | `ProjectSummary` / `204` |
| GET | `/api/members` | `?includeInactive=1&kind=human\|agent` | `Member[]` |
| POST | `/api/members` | `CreateMemberInput` (admin+; manager+ may create agents) | `Member` |
| GET/PATCH/DELETE | `/api/members/:id` | `UpdateMemberInput` | `Member` / `204` |
| POST | `/api/members/:id/password` | `{ password }` (admin+) | `{ ok }` |
| GET | `/api/keys` | `?memberId=` | `ApiKey[]` |
| POST | `/api/keys` | `{ memberId, name, scopes, expiresAt? }` | `{ key: ApiKey, raw: string }` |
| DELETE | `/api/keys/:id` | | `204` |
| GET | `/api/org` | | `OrgSettings` |
| PATCH | `/api/org` | partial (admin+), incl. `currency` (ISO 4217, e.g. `INR`) | `OrgSettings` |

### Meetings & calendar feeds
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/meetings` | `?from&to&memberId` | `Meeting[]` |
| POST | `/api/meetings` | meeting input | `Meeting` |
| PATCH/DELETE | `/api/meetings/:id` | patch | `Meeting` / `204` |
| GET | `/api/calendar-feeds` | | `CalendarFeed[]` |
| POST | `/api/calendar-feeds` | `{ name, url }` | `CalendarFeed` |
| DELETE | `/api/calendar-feeds/:id` | | `204` |
| POST | `/api/calendar-feeds/:id/sync` | | `CalendarFeed` |

### Notifications & push
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/notifications` | `?unread=1&limit=` | `Notification[]` |
| GET | `/api/notifications/count` | | `{ unread }` |
| POST | `/api/notifications/read` | `{ ids: string[] \| 'all' }` | `{ ok }` |
| GET | `/api/push/vapid` | | `{ publicKey: string \| null }` |
| POST | `/api/push/subscribe` | PushSubscription JSON | `{ ok }` |
| POST | `/api/push/unsubscribe` | `{ endpoint }` | `{ ok }` |

### Inbox (WhatsApp / email intake), leads, reports, audit, search
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/inbox` | `?status=new` | `InboxItem[]` |
| POST | `/api/inbox/:id/convert` | `Partial<TaskDraft>` | `TaskView` |
| POST | `/api/inbox/:id/dismiss` | | `{ ok }` |
| GET/POST | `/api/leads` | | `Lead[]` / `Lead` |
| PATCH/DELETE | `/api/leads/:id` | | `Lead` / `204` |
| GET | `/api/reports` | `?days=30` | `Report` |
| GET | `/api/audit` | `?entity&entityId&limit` | `AuditEvent[]` |
| POST | `/api/audit/:id/undo` | | `AuditEvent` |
| GET | `/api/search` | `?q=` | `{ tasks, projects, members }` |

### Integrations (admin+ for mutations)
| Method | Path | Returns |
|---|---|---|
| GET | `/api/integrations` | `{ whatsapp: { mode: 'cloud'\|'qr'\|null, connected, phone? }, email: { inbound: boolean, outbound: boolean, address? }, push: boolean, llm: { provider \| null }, tts: { provider \| null }, mcpUrl: string }` |
| POST | `/api/integrations/whatsapp/qr/start` | `{ qr: string \| null (data URL), status }` |
| GET | `/api/integrations/whatsapp/qr/status` | `{ status: 'disconnected'\|'pairing'\|'connected', qr: string \| null, phone? }` |
| POST | `/api/integrations/whatsapp/qr/logout` | `{ ok }` |
| POST | `/api/integrations/test` | `{ channel: 'whatsapp'\|'email'\|'push' }` → sends a test message to the caller |

### Realtime
`GET /api/stream` — Server-Sent Events of `LiveEvent` for the authenticated member's org
(cookie auth; EventSource sends cookies). `ping` every 25 s.

## MCP (AI agents)

- `POST/GET/DELETE /mcp` — MCP Streamable HTTP transport. Auth: `Authorization: Bearer <api key>`.
- `POST/GET/DELETE /mcp/k/<api key>` — same, key in the URL (for clients that only accept a URL,
  e.g. Claude.ai / ChatGPT custom connectors). Treat that URL as a secret.
- `companybrain mcp` — stdio transport (Claude Desktop, Cursor, VS Code). Key from `COMPANYBRAIN_MCP_KEY`.

Tools (all act as the key's member, scope-checked):
`get_my_work`, `list_tasks`, `get_task`, `create_task`, `quick_add`, `update_task`, `complete_task`,
`add_comment`, `handoff`, `list_projects`, `list_team`, `get_briefing`, `list_meetings`,
`get_notifications`, `search`.

## Game (Tactical Ops) — `services.game` (`AppServices`)
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/game/hud` | | `Hud` |
| GET | `/api/game/profile` | `?memberId=` | `PlayerProfile` |
| GET | `/api/game/leaderboard` | `?period=week\|month\|all` | `Leaderboard` |
| GET | `/api/game/achievements` | `?memberId=` | `AchievementProgress[]` |
| GET | `/api/game/challenges` | | `DailyChallenge[]` |
| GET | `/api/game/crates` | | `Crate[]` |
| POST | `/api/game/crates/:id/open` | | `Crate` (with `reward`) |
| GET | `/api/game/inventory` | | `InventoryItem[]` |
| POST | `/api/game/equip` | `{ title?, frame?, emote? }` | `PlayerProfile` |
| GET | `/api/game/feed` | `?limit=` | `FeedItem[]` |
| GET | `/api/game/rewards` | `?limit=` | `RewardEvent[]` (actor's recent) |

Live: `{ type: 'game.reward', reward }` is pushed over `/api/stream` to the rewarded member only — the UI
plays the celebration from it. Notable squad-feed items (level-ups, rank-ups, achievements, operation
cleared, legendary crates, streak milestones) are pushed as `{ type: 'game.feed', item: FeedItem }` to every
active member of the org (guests only receive their own), so the squad feed updates live.

## OAuth 2.1 for "paste the URL into Claude/ChatGPT and it connects"

Implemented in `server` (stateless, HMAC-signed with `config.signingSecret`). Access tokens are
API keys minted through `services.apiKeys.create` (visible + revocable in Settings → API keys).

| Method | Path | Notes |
|---|---|---|
| GET | `/.well-known/oauth-protected-resource` (+ `/.well-known/oauth-protected-resource/mcp`) | RFC 9728: `{ resource: <base>/mcp, authorization_servers: [<base>], scopes_supported: ['read','write'], bearer_methods_supported: ['header'] }` |
| GET | `/.well-known/oauth-authorization-server` | RFC 8414 metadata: authorize/token/register endpoints, `code_challenge_methods_supported: ['S256']`, `token_endpoint_auth_methods_supported: ['none']`, grant types `authorization_code` |
| POST | `/oauth/register` | RFC 7591 dynamic client registration. Stateless: `client_id` = signed blob of `{ client_name, redirect_uris }`. Redirect URIs must be https (or http://localhost / 127.0.0.1). |
| GET | `/oauth/authorize` | Validates client + redirect + PKCE S256, then 302 → SPA `/connect?<same query>` |
| POST | `/api/oauth/approve` | (session + CSRF) `{ query: <authorize params>, scopes: ('read'\|'write')[], actAs: memberId (self, or an agent the user may manage), approve: boolean }` → `{ redirectTo }` (code or `error=access_denied`) |
| POST | `/oauth/token` | form or JSON; `authorization_code` + `code_verifier` → `{ access_token, token_type: 'Bearer', scope }`. Codes single-use, 5-min TTL. |
| — | `/mcp` 401 responses | include `WWW-Authenticate: Bearer resource_metadata="<base>/.well-known/oauth-protected-resource"` |

`GET /api/oauth/client?client_id=&redirect_uri=` (session) → `{ name, host, redirectUri, redirectUris }` so the
consent page can show who's asking ("Claude wants to connect · claude.ai"). `400` when `redirect_uri` isn't
registered for the client, `404` for an unknown/forged `client_id`. `POST /api/oauth/approve` answers `400`
(with `details.error`, e.g. `invalid_request`) when the authorize parameters are invalid or expired.
