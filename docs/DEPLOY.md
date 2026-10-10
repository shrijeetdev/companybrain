# Deploying companybrain

companybrain is **one Node.js process** with **one SQLite file**. There is no separate database,
queue or frontend server. Pick one of the paths below.

> **HTTPS + a public domain are required** for the best features: pasting the MCP URL into
> Claude/ChatGPT (OAuth), push notifications on phones, and WhatsApp/email webhooks.

## Hostinger (Node.js web app) — the current production setup

1. hPanel → **Websites → Add website → Node.js app**, connect the GitHub repo, branch `main`.
2. Settings:
   | Setting | Value |
   |---|---|
   | Framework preset | `Other` |
   | Node version | 22 (20.19+ works) |
   | Package manager | `pnpm` |
   | Build command | *(none — `dist/` is committed)* |
   | Entry file | `server.js` |
   | Root directory | `./` |
3. Environment variables (minimum): `NODE_ENV=production`, `COMPANYBRAIN_PUBLIC_URL=https://your-domain`,
   `COMPANYBRAIN_TRUST_PROXY=true`. Add any integrations from `.env.example`.
4. Deploy, open `https://your-domain` and complete the **setup wizard** (company + owner account).

**Upgrading from v1:** just deploy. On first boot v2 imports the v1 database in place (users keep
their passwords; tasks, follow-ups and leads are converted; v1 tables are kept as `v1_*`).
The old `COMPANYBRAIN_AUTH_MODE` / `COMPANYBRAIN_ADMIN_*` variables are no longer used — delete them.
**Change the admin password that was published in the old README** (Settings → Profile).

## Docker (any VPS: DigitalOcean, Hetzner, AWS Lightsail…)

```bash
docker build -t companybrain .
docker run -d --name companybrain --restart unless-stopped \
  -p 4317:4317 -v companybrain-data:/data --env-file .env companybrain
```

All state lives in the `/data` volume (database, generated keys, WhatsApp session). Put a TLS
reverse proxy in front (Caddy is simplest: `your-domain { reverse_proxy localhost:4317 }`) and set
`COMPANYBRAIN_TRUST_PROXY=true`.

> `COMPANYBRAIN_TRUST_PROXY=true` trusts exactly **one** proxy hop (the one directly in front of the
> app), so clients can't fake their IP with their own `X-Forwarded-For`. With several proxies in a
> chain (e.g. Cloudflare → nginx → app) set the hop count (`2`) or list the proxies' IPs/CIDRs
> (`COMPANYBRAIN_TRUST_PROXY=127.0.0.1,10.0.0.0/8`). Login is additionally limited to 30 attempts
> per account per 15 minutes regardless of IP.

## Plain VPS (no Docker)

```bash
git clone https://github.com/shrijeetdev/companybrain && cd companybrain
corepack enable && pnpm install --frozen-lockfile
cp .env.example .env   # edit
node server.js         # or: pm2 start server.js --name companybrain
```

### nginx

Server-Sent Events (live updates) need buffering off. See `deploy/nginx.conf`; the key bits:

```nginx
location / {
  proxy_pass http://127.0.0.1:4317;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;          # SSE + MCP streaming
  proxy_read_timeout 1h;
}
```

## Backups

```bash
node server.js backup /backups                  # one-off, safe while running
node server.js backup /backups --without-keys   # database only (keys kept elsewhere)
scripts/backup.sh /backups                      # with 30-day retention (cron it daily)
docker exec companybrain node server.js backup /data/backups
```

A backup contains `companybrain.sqlite` **and** `secret.key`, `signing.key`, `vapid.json`.
**`secret.key` decrypts the secrets stored in the database** (WhatsApp session, calendar feed URLs),
so a full backup is as sensitive as the server itself:

- Prefer setting `COMPANYBRAIN_SECRET` (64 hex chars) and `COMPANYBRAIN_SIGNING_SECRET` from your
  host's secret store (Hostinger/Docker/systemd environment, a secrets manager) instead of relying on
  the generated `secret.key` / `signing.key` files — then back up the database with
  `--without-keys` and keep the secrets only in the secret store.
- Store backups **encrypted** (e.g. `age`, `gpg`, or an encrypted bucket) and restrict who can read them.
- To restore, stop the app and copy the files back into the data directory (and make sure the same
  `COMPANYBRAIN_SECRET` is set, or `secret.key` is restored next to the database).

## Connecting integrations

| What | Where |
|---|---|
| Claude / ChatGPT / Cursor / any MCP agent | In the app: **Settings → Connect AI** (paste-the-URL OAuth, or API keys). Details: `packages/mcp/CONNECT.md` |
| WhatsApp (official) | Meta app → WhatsApp → webhook `https://your-domain/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages` |
| WhatsApp (QR) | `WHATSAPP_QR=on`, then Settings → Integrations → scan with WhatsApp → Linked devices |
| Email intake | A dedicated mailbox via `EMAIL_IMAP_*` (Gmail needs an app password). Set `EMAIL_AUTHSERV_ID` (e.g. `mx.google.com`) — see *Security notes* |
| Email intake (webhook) | `POST https://your-domain/webhooks/email` with header `X-CB-Webhook-Secret: $EMAIL_WEBHOOK_SECRET` (preferred). `?secret=` also works for providers that can't send headers; it is redacted from logs, but URLs can still end up in provider dashboards and proxy logs, so use the header where you can |
| Email sending | `EMAIL_SMTP_*` + `EMAIL_FROM` |
| Calendar | Each person: Settings → Calendar → paste their private iCal link (Google: Settings → your calendar → "Secret address in iCal format") |
| Push notifications | Automatic. Each person: Settings → Notifications → Enable (on iPhone, first "Add to Home Screen") |

Every integration has a **Send test** button in Settings → Integrations.

## Security notes

- **API keys survive password changes — by design.** Changing or resetting a password signs out
  every web session, but AI agents and scripts keep working. If a password was compromised, also
  revoke the person's keys in **Settings → Connect AI**. Deactivating a member revokes their
  sessions **and** API keys.
- **Email intake only trusts verified senders.** An email is treated as coming from a team member
  (creates a task as them, answers `list` / `done N`) only when your mail provider verified it
  (DMARC, or DKIM/SPF aligned with the From domain). Everything else goes to the Inbox marked
  *"Sender not verified"*. Set `EMAIL_AUTHSERV_ID` to your provider's authserv-id so a forged
  `Authentication-Results` header can never be mistaken for your provider's. Details per provider:
  `packages/integrations/ENV.md`. `EMAIL_TRUST_UNVERIFIED_SENDERS=true` turns this off — **unsafe**.
- **Phone numbers need a country code** (`+919876543210`): WhatsApp senders are matched to members on
  the full international number only. Members saved earlier without a country code won't be
  recognised on WhatsApp until their number is re-entered.
- Only owners can reset an admin's or owner's password, change their role or deactivate them.

## Health & monitoring

- `GET /health` → `{ ok, version, uptime }` (Docker HEALTHCHECK uses it).
- Logs are JSON (pino) on stdout; secrets, cookies and auth headers are redacted.
