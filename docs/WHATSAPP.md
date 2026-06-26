# WhatsApp — going live

companybrain turns inbound WhatsApp messages into tracked **open loops** and sends an
auto-acknowledgement back, all logged in the audit trail. Two transports are supported;
both feed the same `ingest()` pipeline and reply through the same `Messenger` port.

## Option A — Baileys QR pairing (no Meta app)

The fastest way to test with a real number. No Meta Business account, no public webhook.

```bash
WHATSAPP_BAILEYS=on pnpm start
```

1. A QR code prints in the terminal.
2. On your phone: **WhatsApp → Settings → Linked devices → Link a device** → scan it.
3. The session persists to `~/.companybrain/wa` — you only pair once.
4. Message that number from another phone. A loop appears at `http://localhost:4317`
   and an auto-reply comes back.

Re-pair by deleting `~/.companybrain/wa`. Trade-off: Baileys uses the unofficial
WhatsApp Web protocol — fine for testing and self-host, not an official Meta product.

## Option B — WhatsApp Cloud API (official)

For production. Needs a Meta app with the WhatsApp product and a public HTTPS webhook.

Set in `.env`:

```
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<a string you choose>
```

In the Meta dashboard, point the webhook at `https://<your-host>/webhooks/whatsapp`,
use the same verify token, and subscribe to `messages`. The `GET /webhooks/whatsapp`
route answers Meta's verification handshake; `POST` receives inbound messages.

For local testing, expose the port with a tunnel (e.g. `cloudflared tunnel --url
http://localhost:4317`) and use the tunnel URL as the webhook.

## AI-written replies (optional)

If `ANTHROPIC_API_KEY` is set, the acknowledgement reply is written by Claude
(`claude-opus-4-8`) via the `Drafter` port; otherwise a fixed template is used. Either
way the loop is captured first — the reply never blocks capture.

## How it flows

```
inbound message
  → parseInbound / Baileys socket   (packages/integrations/src/whatsapp/*)
  → ingest()                        captures an open loop, replyTo = sender
  → enqueue replyLoop               in-process queue (local) / BullMQ (selfhost)
  → drafter.draftReply()            Claude if configured, else template
  → messenger.send()                Cloud API sendText / Baileys socket
  → audit: loop.captured, reply.sent
```

Verify the whole chain without a phone or LLM:

```bash
pnpm --filter @companybrain/server exec tsx scripts/verify-whatsapp.mts
```
