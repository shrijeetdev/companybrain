import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadIntegrationsConfig, getVapidKeys, integrationsStatus, normalizePhone, DEFAULT_ANTHROPIC_MODEL } from '../src/index';

const dir = () => mkdtempSync(join(tmpdir(), 'cb-int-'));

test('empty env → nothing configured, sane defaults', () => {
  const d = dir();
  const cfg = loadIntegrationsConfig({}, d);
  assert.equal(cfg.dataDir, d);
  assert.equal(cfg.publicUrl, null);
  assert.equal(cfg.whatsapp.cloudConfigured, false);
  assert.equal(cfg.whatsapp.qrEnabled, false);
  assert.equal(cfg.whatsapp.authDir, join(d, 'whatsapp-auth'));
  assert.equal(cfg.imap, null);
  assert.equal(cfg.smtp, null);
  assert.equal(cfg.llm, null);
  assert.equal(cfg.tts, null);
  assert.equal(cfg.emailWebhookSecret, null);
  assert.match(cfg.vapid.subject, /^mailto:/);
});

test('full env parses every section', () => {
  const cfg = loadIntegrationsConfig(
    {
      COMPANYBRAIN_PUBLIC_URL: 'https://brain.example.com/',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      WHATSAPP_ACCESS_TOKEN: 'tok',
      WHATSAPP_VERIFY_TOKEN: 'verify',
      WHATSAPP_APP_SECRET: 'secret',
      WHATSAPP_QR: 'on',
      EMAIL_IMAP_HOST: 'imap.example.com',
      EMAIL_IMAP_USER: 'tasks@example.com',
      EMAIL_IMAP_PASS: 'p',
      EMAIL_POLL_SECONDS: '5', // clamped to min 10
      EMAIL_SMTP_HOST: 'smtp.example.com',
      EMAIL_SMTP_PORT: '465',
      EMAIL_SMTP_USER: 'tasks@example.com',
      EMAIL_SMTP_PASS: 'p',
      EMAIL_FROM: 'Company Brain <tasks@example.com>',
      EMAIL_WEBHOOK_SECRET: 'whsec',
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: 'sk-oa',
      TTS_PROVIDER: 'openai',
      OPENAI_TTS_VOICE: 'nova',
    },
    dir(),
  );
  assert.equal(cfg.publicUrl, 'https://brain.example.com');
  assert.equal(cfg.whatsapp.cloudConfigured, true);
  assert.equal(cfg.whatsapp.qrEnabled, true);
  assert.equal(cfg.whatsapp.appSecret, 'secret');
  assert.deepEqual(
    { host: cfg.imap?.host, port: cfg.imap?.port, secure: cfg.imap?.secure, mailbox: cfg.imap?.mailbox, poll: cfg.imap?.pollSeconds },
    { host: 'imap.example.com', port: 993, secure: true, mailbox: 'INBOX', poll: 10 },
  );
  assert.equal(cfg.smtp?.port, 465);
  assert.equal(cfg.smtp?.secure, true);
  assert.equal(cfg.smtp?.from, 'Company Brain <tasks@example.com>');
  assert.equal(cfg.emailWebhookSecret, 'whsec');
  assert.equal(cfg.vapid.subject, 'https://brain.example.com');
  // Anthropic preferred when both keys are set
  assert.equal(cfg.llm?.provider, 'anthropic');
  assert.equal(cfg.llm?.model, DEFAULT_ANTHROPIC_MODEL);
  assert.equal(cfg.tts?.provider, 'openai');
  assert.equal(cfg.tts?.provider === 'openai' && cfg.tts.voice, 'nova');
});

test('OpenAI-compatible LLM (OpenRouter) and ElevenLabs TTS', () => {
  const cfg = loadIntegrationsConfig(
    {
      OPENAI_API_KEY: 'k',
      OPENAI_BASE_URL: 'https://openrouter.ai/api/v1/',
      OPENAI_MODEL: 'anthropic/claude-sonnet-4.5',
      TTS_PROVIDER: 'elevenlabs',
      ELEVENLABS_API_KEY: 'el',
      ELEVENLABS_VOICE_ID: 'voice1',
      EMAIL_SMTP_HOST: 'smtp.x.com',
      EMAIL_SMTP_USER: 'bot@x.com',
      EMAIL_IMAP_TLS: 'false',
      EMAIL_IMAP_HOST: 'imap.x.com',
      EMAIL_IMAP_USER: 'bot',
      EMAIL_IMAP_PASS: 'p',
    },
    dir(),
  );
  assert.deepEqual(cfg.llm, { provider: 'openai', apiKey: 'k', model: 'anthropic/claude-sonnet-4.5', baseUrl: 'https://openrouter.ai/api/v1' });
  assert.equal(cfg.tts?.provider, 'elevenlabs');
  assert.equal(cfg.smtp?.from, 'bot@x.com'); // falls back to SMTP user
  assert.equal(cfg.smtp?.port, 587);
  assert.equal(cfg.smtp?.secure, false);
  assert.equal(cfg.imap?.port, 143);
  assert.equal(cfg.imap?.secure, false);
});

test('TTS needs explicit provider; incomplete IMAP is ignored', () => {
  const cfg = loadIntegrationsConfig({ OPENAI_API_KEY: 'k', EMAIL_IMAP_HOST: 'h' }, dir());
  assert.equal(cfg.tts, null);
  assert.equal(cfg.imap, null);
});

test('getVapidKeys generates once, persists with 0600, and reuses', () => {
  const d = dir();
  const cfg = loadIntegrationsConfig({}, d);
  const a = getVapidKeys(cfg);
  assert.match(a.publicKey, /^[A-Za-z0-9_-]{80,}$/);
  const file = join(d, 'vapid.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.publicKey, a.publicKey);
  const b = getVapidKeys(loadIntegrationsConfig({}, d));
  assert.deepEqual(b, a);
  const env = getVapidKeys(loadIntegrationsConfig({ VAPID_PUBLIC_KEY: 'P', VAPID_PRIVATE_KEY: 'Q' }, d));
  assert.deepEqual(env, { publicKey: 'P', privateKey: 'Q' });
});

test('integrationsStatus reflects config', () => {
  const cfg = loadIntegrationsConfig(
    { WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_ACCESS_TOKEN: 't', EMAIL_SMTP_HOST: 's', EMAIL_FROM: 'Bot <bot@x.com>', ANTHROPIC_API_KEY: 'k' },
    dir(),
  );
  assert.deepEqual(integrationsStatus(cfg, null), {
    whatsapp: { mode: 'cloud', connected: true, phone: null },
    email: { inbound: false, outbound: true, address: 'bot@x.com' },
    push: true,
    llm: { provider: 'anthropic' },
    tts: { provider: null },
  });
  const qr = { status: () => ({ status: 'connected' as const, qr: null, phone: '+15550001111' }), start: async () => {}, stop: async () => {}, logout: async () => {}, send: async () => true };
  assert.deepEqual(integrationsStatus(cfg, qr).whatsapp, { mode: 'qr', connected: true, phone: '+15550001111' });
});

test('normalizePhone → E.164', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '+919876543210');
  assert.equal(normalizePhone('0091 98765 43210'), '+919876543210');
  assert.equal(normalizePhone('(+1) 415 555 0100'), '+14155550100');
  assert.equal(normalizePhone('14155550100'), '+14155550100');
  assert.equal(normalizePhone('919876543210@s.whatsapp.net'), '+919876543210');
  assert.equal(normalizePhone('919876543210:12@s.whatsapp.net'), '+919876543210');
  assert.equal(normalizePhone('12345@g.us'), null);
  assert.equal(normalizePhone('12345@lid'), null);
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('+0123456789'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('abc'), null);
});
