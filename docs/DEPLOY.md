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
node server.js backup /backups          # one-off, safe while running
scripts/backup.sh /backups              # with 30-day retention (cron it daily)
docker exec companybrain node server.js backup /data/backups
```

A backup contains `companybrain.sqlite` **and** `secret.key`, `signing.key`, `vapid.json`. Keep them
together — `secret.key` decrypts stored secrets (WhatsApp session, calendar URLs). To restore, stop
the app and copy the files back into the data directory.

## Connecting integrations

| What | Where |
|---|---|
| Claude / ChatGPT / Cursor / any MCP agent | In the app: **Settings → Connect AI** (paste-the-URL OAuth, or API keys). Details: `packages/mcp/CONNECT.md` |
| WhatsApp (official) | Meta app → WhatsApp → webhook `https://your-domain/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages` |
| WhatsApp (QR) | `WHATSAPP_QR=on`, then Settings → Integrations → scan with WhatsApp → Linked devices |
| Email intake | A dedicated mailbox via `EMAIL_IMAP_*` (Gmail needs an app password) |
| Email sending | `EMAIL_SMTP_*` + `EMAIL_FROM` |
| Calendar | Each person: Settings → Calendar → paste their private iCal link (Google: Settings → your calendar → "Secret address in iCal format") |
| Push notifications | Automatic. Each person: Settings → Notifications → Enable (on iPhone, first "Add to Home Screen") |

Every integration has a **Send test** button in Settings → Integrations.

## Health & monitoring

- `GET /health` → `{ ok, version, uptime }` (Docker HEALTHCHECK uses it).
- Logs are JSON (pino) on stdout; secrets, cookies and auth headers are redacted.
