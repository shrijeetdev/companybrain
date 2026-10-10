// Typed integration config, parsed from environment variables. See ../ENV.md.

import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export interface WhatsAppConfig {
  /** Cloud API (official). Sending needs phoneNumberId + accessToken. */
  phoneNumberId: string | null;
  accessToken: string | null;
  /** Token Meta echoes during webhook verification (GET hub.challenge). */
  verifyToken: string | null;
  /** App secret used to verify X-Hub-Signature-256 on webhook POSTs. */
  appSecret: string | null;
  graphVersion: string;
  /** true when phoneNumberId + accessToken are set. */
  cloudConfigured: boolean;
  /** WHATSAPP_QR=on — start the QR-pairing (Baileys) client. */
  qrEnabled: boolean;
  /** Where the Baileys multi-file auth state lives. */
  authDir: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  pollSeconds: number;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

export type LlmConfig =
  | { provider: 'anthropic'; apiKey: string; model: string; baseUrl: string }
  | { provider: 'openai'; apiKey: string; model: string; baseUrl: string };

export type TtsConfig =
  | { provider: 'openai'; apiKey: string; baseUrl: string; model: string; voice: string }
  | { provider: 'elevenlabs'; apiKey: string; voiceId: string; model: string };

export interface IntegrationsConfig {
  dataDir: string;
  publicUrl: string | null;
  whatsapp: WhatsAppConfig;
  /** null = IMAP intake not configured. */
  imap: ImapConfig | null;
  /** null = outbound email not configured. */
  smtp: SmtpConfig | null;
  emailWebhookSecret: string | null;
  /** Inbound-email sender verification (anti-spoofing), see email/auth.ts. */
  emailAuth: {
    /** EMAIL_AUTHSERV_ID: required authserv-id of the topmost Authentication-Results header (IMAP + webhooks). */
    authservId: string | null;
    /** EMAIL_TRUST_UNVERIFIED_SENDERS=true — UNSAFE: treat every email sender as verified. Default false. */
    trustUnverifiedSenders: boolean;
  };
  vapid: { publicKey: string | null; privateKey: string | null; subject: string };
  llm: LlmConfig | null;
  tts: TtsConfig | null;
}

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

function str(env: NodeJS.ProcessEnv, key: string): string | null {
  const v = env[key];
  if (v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function bool(env: NodeJS.ProcessEnv, key: string, dflt: boolean): boolean {
  const v = str(env, key);
  if (v === null) return dflt;
  return /^(1|true|yes|on)$/i.test(v);
}

function int(env: NodeJS.ProcessEnv, key: string, dflt: number, min: number, max: number): number {
  const v = str(env, key);
  if (v === null) return dflt;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function trimSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

/** Default data dir: next to the SQLite file ($COMPANYBRAIN_DB_PATH) or ~/.companybrain. */
function defaultDataDir(env: NodeJS.ProcessEnv): string {
  const db = str(env, 'COMPANYBRAIN_DB_PATH');
  if (db && db !== ':memory:') return dirname(resolve(db));
  return join(homedir(), '.companybrain');
}

export function loadIntegrationsConfig(env: NodeJS.ProcessEnv = process.env, dataDir?: string): IntegrationsConfig {
  const dir = resolve(dataDir ?? defaultDataDir(env));
  const publicUrlRaw = str(env, 'COMPANYBRAIN_PUBLIC_URL');
  let publicUrl: string | null = null;
  if (publicUrlRaw) {
    try {
      const u = new URL(publicUrlRaw);
      if (u.protocol === 'http:' || u.protocol === 'https:') publicUrl = trimSlash(u.toString());
    } catch {
      publicUrl = null;
    }
  }

  // ── WhatsApp ──
  const phoneNumberId = str(env, 'WHATSAPP_PHONE_NUMBER_ID');
  const accessToken = str(env, 'WHATSAPP_ACCESS_TOKEN');
  const whatsapp: WhatsAppConfig = {
    phoneNumberId,
    accessToken,
    verifyToken: str(env, 'WHATSAPP_VERIFY_TOKEN'),
    appSecret: str(env, 'WHATSAPP_APP_SECRET'),
    graphVersion: str(env, 'WHATSAPP_GRAPH_VERSION') ?? 'v23.0',
    cloudConfigured: Boolean(phoneNumberId && accessToken),
    qrEnabled: bool(env, 'WHATSAPP_QR', false),
    authDir: join(dir, 'whatsapp-auth'),
  };

  // ── Email: IMAP intake ──
  const imapHost = str(env, 'EMAIL_IMAP_HOST');
  const imapUser = str(env, 'EMAIL_IMAP_USER');
  const imapPass = str(env, 'EMAIL_IMAP_PASS');
  let imap: ImapConfig | null = null;
  if (imapHost && imapUser && imapPass) {
    const secure = bool(env, 'EMAIL_IMAP_TLS', true);
    imap = {
      host: imapHost,
      port: int(env, 'EMAIL_IMAP_PORT', secure ? 993 : 143, 1, 65535),
      secure,
      user: imapUser,
      pass: imapPass,
      mailbox: str(env, 'EMAIL_IMAP_MAILBOX') ?? 'INBOX',
      pollSeconds: int(env, 'EMAIL_POLL_SECONDS', 60, 10, 86400),
    };
  }

  // ── Email: SMTP outbound ──
  const smtpHost = str(env, 'EMAIL_SMTP_HOST');
  const smtpUser = str(env, 'EMAIL_SMTP_USER');
  const from = str(env, 'EMAIL_FROM') ?? (smtpUser && smtpUser.includes('@') ? smtpUser : null);
  let smtp: SmtpConfig | null = null;
  if (smtpHost && from) {
    const port = int(env, 'EMAIL_SMTP_PORT', 587, 1, 65535);
    smtp = {
      host: smtpHost,
      port,
      secure: bool(env, 'EMAIL_SMTP_SECURE', port === 465),
      user: smtpUser,
      pass: str(env, 'EMAIL_SMTP_PASS'),
      from,
    };
  }

  // ── Web Push ──
  const subject =
    str(env, 'VAPID_SUBJECT') ??
    (publicUrl?.startsWith('https://') ? publicUrl : null) ??
    (smtp ? `mailto:${extractAddress(smtp.from)}` : null) ??
    'mailto:admin@example.com';
  const vapid = {
    publicKey: str(env, 'VAPID_PUBLIC_KEY'),
    privateKey: str(env, 'VAPID_PRIVATE_KEY'),
    subject,
  };

  // ── LLM (Anthropic preferred) ──
  let llm: LlmConfig | null = null;
  const anthropicKey = str(env, 'ANTHROPIC_API_KEY');
  const openaiKey = str(env, 'OPENAI_API_KEY');
  if (anthropicKey) {
    llm = {
      provider: 'anthropic',
      apiKey: anthropicKey,
      model: str(env, 'ANTHROPIC_MODEL') ?? DEFAULT_ANTHROPIC_MODEL,
      baseUrl: trimSlash(str(env, 'ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com'),
    };
  } else if (openaiKey) {
    llm = {
      provider: 'openai',
      apiKey: openaiKey,
      model: str(env, 'OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL,
      baseUrl: trimSlash(str(env, 'OPENAI_BASE_URL') ?? 'https://api.openai.com/v1'),
    };
  }

  // ── TTS (explicit opt-in via TTS_PROVIDER) ──
  let tts: TtsConfig | null = null;
  const ttsProvider = (str(env, 'TTS_PROVIDER') ?? '').toLowerCase();
  if (ttsProvider === 'openai' && openaiKey) {
    tts = {
      provider: 'openai',
      apiKey: openaiKey,
      baseUrl: trimSlash(str(env, 'OPENAI_TTS_BASE_URL') ?? 'https://api.openai.com/v1'),
      model: str(env, 'OPENAI_TTS_MODEL') ?? 'gpt-4o-mini-tts',
      voice: str(env, 'OPENAI_TTS_VOICE') ?? 'coral',
    };
  } else if (ttsProvider === 'elevenlabs') {
    const key = str(env, 'ELEVENLABS_API_KEY');
    const voiceId = str(env, 'ELEVENLABS_VOICE_ID');
    if (key && voiceId) {
      tts = {
        provider: 'elevenlabs',
        apiKey: key,
        voiceId,
        model: str(env, 'ELEVENLABS_MODEL_ID') ?? 'eleven_multilingual_v2',
      };
    }
  }

  return {
    dataDir: dir,
    publicUrl,
    whatsapp,
    imap,
    smtp,
    emailWebhookSecret: str(env, 'EMAIL_WEBHOOK_SECRET'),
    emailAuth: {
      authservId: str(env, 'EMAIL_AUTHSERV_ID')?.toLowerCase() ?? null,
      trustUnverifiedSenders: bool(env, 'EMAIL_TRUST_UNVERIFIED_SENDERS', false),
    },
    vapid,
    llm,
    tts,
  };
}

/** "Name <a@b.c>" → "a@b.c"; plain addresses pass through. */
export function extractAddress(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return (m?.[1] ?? s).trim();
}
