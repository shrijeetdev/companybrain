# @companybrain/integrations — environment variables

Everything is optional. With no variables set, companybrain runs with in-app notifications and
Web Push only (VAPID keys are generated automatically). Blank values are treated as unset.

Integration state lives in the **data dir** — the directory that holds the SQLite file
(`dirname($COMPANYBRAIN_DB_PATH)`, default `~/.companybrain`): `vapid.json` (0600) and
`whatsapp-auth/` (0700, QR session).

## General

| Variable | Default | Description |
|---|---|---|
| `COMPANYBRAIN_PUBLIC_URL` | — | Public base URL, e.g. `https://brain.example.com`. Used for links, the MCP URL and as the default VAPID subject when it is https. |

## WhatsApp — Cloud API (official, Meta)

Sending needs `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN`. Receiving needs the webhook
`https://<host>/webhooks/whatsapp` subscribed to `messages` in the Meta app, with
`WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` (webhook POSTs without a valid
`X-Hub-Signature-256` are rejected — fail closed).

| Variable | Default | Description |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | — | Phone number ID from WhatsApp → API Setup. |
| `WHATSAPP_ACCESS_TOKEN` | — | Permanent (system user) access token. |
| `WHATSAPP_VERIFY_TOKEN` | — | Any random string; enter the same value as "Verify token" in the Meta webhook config. |
| `WHATSAPP_APP_SECRET` | — | App secret (App settings → Basic). Required to accept webhook POSTs. |
| `WHATSAPP_GRAPH_VERSION` | `v23.0` | Graph API version used for sending. |

## WhatsApp — QR pairing (WhatsApp Web, unofficial)

| Variable | Default | Description |
|---|---|---|
| `WHATSAPP_QR` | off | `on` to start the QR-pairing client (Baileys, optional dependency). Scan the QR shown in Settings → Integrations with WhatsApp → Linked devices. Session stored in `<data dir>/whatsapp-auth/`. When connected, outbound WhatsApp uses it in preference to the Cloud API. Unofficial protocol — use a dedicated number. |

## Email — IMAP intake (a dedicated mailbox, e.g. tasks@yourco.com)

All three of host/user/pass are required to enable intake. Every `EMAIL_POLL_SECONDS` the
mailbox is checked for UNSEEN mail; each message becomes an inbound item and is marked seen.
Auto-replies, bulk/list mail and mail from the bot's own address are skipped. Works with Gmail
(app password), Outlook/Microsoft 365 (app password / basic auth where allowed), Zoho, Hostinger, …

| Variable | Default | Description |
|---|---|---|
| `EMAIL_IMAP_HOST` | — | e.g. `imap.gmail.com`. |
| `EMAIL_IMAP_PORT` | `993` (`143` when TLS off) | |
| `EMAIL_IMAP_USER` | — | Mailbox login (usually the address). |
| `EMAIL_IMAP_PASS` | — | Password / app password. |
| `EMAIL_IMAP_TLS` | `true` | `false` for plain/STARTTLS on 143. |
| `EMAIL_IMAP_MAILBOX` | `INBOX` | Folder to watch. |
| `EMAIL_POLL_SECONDS` | `60` | Poll interval (10 – 86400). Failures back off up to 15 min. |

## Email — SMTP outbound (reminders, replies)

Enabled when `EMAIL_SMTP_HOST` and a sender (`EMAIL_FROM`, or an address-like `EMAIL_SMTP_USER`) are set.

| Variable | Default | Description |
|---|---|---|
| `EMAIL_SMTP_HOST` | — | e.g. `smtp.gmail.com`. |
| `EMAIL_SMTP_PORT` | `587` | |
| `EMAIL_SMTP_USER` | — | Optional (omit for unauthenticated relays). |
| `EMAIL_SMTP_PASS` | — | |
| `EMAIL_SMTP_SECURE` | `true` if port 465, else `false` | `true` = implicit TLS; `false` = STARTTLS when offered. |
| `EMAIL_FROM` | `EMAIL_SMTP_USER` | From header, e.g. `Company Brain <tasks@yourco.com>`. |

## Email — inbound webhook (alternative to IMAP)

| Variable | Default | Description |
|---|---|---|
| `EMAIL_WEBHOOK_SECRET` | — | Shared secret required on `POST /webhooks/email` (prefer the `X-CB-Webhook-Secret` header; `?secret=` is accepted for providers that can't send headers and is redacted from logs; endpoint disabled when unset). Accepts Postmark, SendGrid Inbound Parse, Mailgun routes and Cloudflare Email Workers (`{from,to,subject,text,html,messageId,authenticated}`) JSON. |

## Email — sender verification (anti-spoofing)

The From header of an email is trivially forged. An inbound email is only treated as coming from
a team member (creates a task as them, `list` / `done N` commands) when the receiving mail system
**verified** the sender: DMARC `pass`, or DKIM `pass` with `header.d`/`header.i` aligned to the From
domain, or SPF `pass` with `smtp.mailfrom` aligned. Unverified email goes to the Inbox as an
unknown sender, marked *"Sender not verified"*, and never gets an auto-reply.

| Intake | Verdict comes from |
|---|---|
| IMAP | The **topmost** `Authentication-Results` header (the one your mailbox provider adds on receipt; Gmail, Microsoft 365, Zoho, Fastmail… all add one). Lower copies may be written by the sender and are ignored. |
| Postmark | `Headers`: topmost `Authentication-Results`, SpamAssassin `X-Spam-Tests` containing `DKIM_VALID_AU`, or `Received-SPF: Pass` with an aligned `envelope-from`. |
| SendGrid | `SPF` = `pass` with an aligned envelope sender, or a `dkim` entry `@<from-domain> : pass`; or `Authentication-Results` in `headers`. |
| Mailgun | `X-Mailgun-Spf: Pass` with an aligned `sender`, or `X-Mailgun-Dkim-Check-Result: Pass` with an aligned `DKIM-Signature d=`. |
| Cloudflare Email Workers / custom | Cannot be verified by companybrain. Your worker must check the message itself (e.g. Cloudflare's `Authentication-Results`/ARC) and send `"authenticated": true` only for messages that passed. Anything else is unverified. |
| WhatsApp (Cloud API / QR) | Always verified — WhatsApp authenticates the sender's number. |

| Variable | Default | Description |
|---|---|---|
| `EMAIL_AUTHSERV_ID` | — | **Recommended.** The authserv-id your mailbox provider writes at the start of its `Authentication-Results` header (e.g. `mx.google.com` for Gmail/Workspace, `mx.microsoft.com` for Microsoft 365). When set, only a topmost header with this id counts — so a forged header can't be mistaken for your provider's when the provider adds none. |
| `EMAIL_TRUST_UNVERIFIED_SENDERS` | `false` | **UNSAFE.** `true` treats every email sender as verified (pre-audit behaviour): anyone can email in as any team member, create tasks as them and read their task list via `list`. Only for closed mail systems that already reject spoofed mail. |

## Web Push (VAPID)

| Variable | Default | Description |
|---|---|---|
| `VAPID_PUBLIC_KEY` | generated | Set both keys to pin them (e.g. multiple instances). Otherwise a pair is generated on first boot and stored in `<data dir>/vapid.json` (0600). Changing keys invalidates existing browser subscriptions. Generate with `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | generated | |
| `VAPID_SUBJECT` | public URL (https) → `mailto:<EMAIL_FROM>` → `mailto:admin@example.com` | Contact for push services: `mailto:` or `https:` URL. Apple rejects `localhost`. |

## LLM (optional — better task extraction + natural briefings)

Anthropic is used when `ANTHROPIC_API_KEY` is set (preferred when both keys exist); otherwise any
OpenAI-compatible `/chat/completions` endpoint (OpenAI, OpenRouter, Together, Groq, a local
Ollama/vLLM gateway, …). Without an LLM, the built-in natural-language parser is used.

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Anthropic API key. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Any Claude model id. |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Override for gateways/proxies. |
| `OPENAI_API_KEY` | — | Key for the OpenAI-compatible endpoint (also used by OpenAI TTS). |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | e.g. `https://openrouter.ai/api/v1`. |
| `OPENAI_MODEL` | `gpt-4o-mini` | e.g. `anthropic/claude-sonnet-4.5` on OpenRouter. |

## Text-to-speech (optional — server voice for the briefing)

Off unless `TTS_PROVIDER` is set; the browser's built-in speech is used otherwise.

| Variable | Default | Description |
|---|---|---|
| `TTS_PROVIDER` | — | `openai` or `elevenlabs`. |
| `OPENAI_TTS_VOICE` | `coral` | OpenAI voice (alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse). Requires `OPENAI_API_KEY`. |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | |
| `OPENAI_TTS_BASE_URL` | `https://api.openai.com/v1` | Separate from `OPENAI_BASE_URL` because OpenRouter-style gateways usually have no speech endpoint. |
| `ELEVENLABS_API_KEY` | — | |
| `ELEVENLABS_VOICE_ID` | — | Voice id from the ElevenLabs voice library. |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | |
