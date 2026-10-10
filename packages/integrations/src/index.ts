// @companybrain/integrations — connects companybrain to the outside world:
// WhatsApp (Cloud API + QR pairing), email (IMAP intake, SMTP, inbound webhook), Web Push,
// ICS calendar feeds (SSRF-safe), optional LLM and optional TTS. See ../ENV.md for config.

export type { OnInbound } from '@companybrain/types';

export {
  loadIntegrationsConfig,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  type IntegrationsConfig,
  type WhatsAppConfig,
  type ImapConfig,
  type SmtpConfig,
  type LlmConfig,
  type TtsConfig,
} from './config';
export { createOutbound, type OutboundDeps } from './outbound';
export { getVapidKeys, type VapidKeys } from './push';
export { whatsappCloud } from './whatsapp/cloud';
export { createWhatsAppQr, type WhatsAppQr, type WhatsAppQrDeps } from './whatsapp/qr';
export { createEmailPoller, type EmailPoller, type EmailPollerDeps } from './email/poller';
export { parseInboundEmailWebhook, parseAddress } from './email/webhook';
export { parseAuthenticationResults, authenticatedByHeader, type EmailAuthOptions } from './email/auth';
export { stripQuotedReply, htmlToText } from './email/text';
export { createCalendarFetcher, parseIcs, type IcsEvent, type CalendarFetcherDeps } from './calendar/index';
export { createLlm, type LlmDeps } from './llm';
export { createTts } from './tts';
export { integrationsStatus } from './status';
export { normalizePhone } from './util';
