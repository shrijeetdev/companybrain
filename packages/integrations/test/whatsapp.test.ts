import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtempSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InboundMessage } from '@companybrain/types';
import { loadIntegrationsConfig, whatsappCloud, createOutbound, createWhatsAppQr } from '../src/index';
import { baileysToInbound } from '../src/whatsapp/qr';

const quiet = { info() {}, warn() {}, error() {} };
const dir = () => mkdtempSync(join(tmpdir(), 'cb-wa-'));
const cfgWith = (env: Record<string, string>) => loadIntegrationsConfig(env, dir());

test('verifyChallenge: matches token + mode only', () => {
  const cfg = cfgWith({ WHATSAPP_VERIFY_TOKEN: 'abc' });
  assert.equal(whatsappCloud.verifyChallenge(cfg, { 'hub.mode': 'subscribe', 'hub.verify_token': 'abc', 'hub.challenge': '42' }), '42');
  assert.equal(whatsappCloud.verifyChallenge(cfg, { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '42' }), null);
  assert.equal(whatsappCloud.verifyChallenge(cfg, { 'hub.mode': 'unsubscribe', 'hub.verify_token': 'abc', 'hub.challenge': '42' }), null);
  assert.equal(whatsappCloud.verifyChallenge(cfgWith({}), { 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '42' }), null);
});

test('verifySignature: valid / invalid / missing secret / malformed', () => {
  const cfg = cfgWith({ WHATSAPP_APP_SECRET: 'shh' });
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));
  const sig = `sha256=${createHmac('sha256', 'shh').update(body).digest('hex')}`;
  assert.equal(whatsappCloud.verifySignature(cfg, body, sig), true);
  assert.equal(whatsappCloud.verifySignature(cfg, body, sig.toUpperCase().replace('SHA256=', 'sha256=')), true);
  assert.equal(whatsappCloud.verifySignature(cfg, Buffer.from('{"hello":"w0rld"}'), sig), false);
  assert.equal(whatsappCloud.verifySignature(cfg, body, `sha256=${'0'.repeat(64)}`), false);
  assert.equal(whatsappCloud.verifySignature(cfg, body, undefined), false);
  assert.equal(whatsappCloud.verifySignature(cfg, body, 'sha1=abc'), false);
  assert.equal(whatsappCloud.verifySignature(cfgWith({}), body, sig), false); // fail closed
});

const webhookFixture = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550000000', phone_number_id: '123' },
            contacts: [{ profile: { name: 'Priya' }, wa_id: '919876543210' }],
            messages: [
              { from: '919876543210', id: 'wamid.A', timestamp: '1760000000', type: 'text', text: { body: '  Send Acme proposal tomorrow 5pm ' } },
              {
                from: '919876543210',
                id: 'wamid.B',
                timestamp: '1760000060',
                type: 'interactive',
                interactive: { type: 'button_reply', button_reply: { id: 'done_1', title: 'Mark done' } },
              },
              { from: '919876543210', id: 'wamid.C', timestamp: '1760000120', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'x', title: 'Tomorrow' } } },
              { from: '919876543210', id: 'wamid.D', timestamp: '1760000180', type: 'button', button: { text: 'Snooze', payload: 'snooze' } },
              { from: '919876543210', id: 'wamid.E', timestamp: '1760000240', type: 'image', image: { id: 'media' } },
            ],
          },
        },
        {
          field: 'messages',
          value: { statuses: [{ id: 'wamid.S', status: 'delivered', recipient_id: '919876543210' }] },
        },
      ],
    },
  ],
};

test('parseWebhook: text + interactive + button, statuses and media ignored', () => {
  const msgs = whatsappCloud.parseWebhook(webhookFixture);
  assert.equal(msgs.length, 4);
  assert.deepEqual(msgs[0], {
    channel: 'whatsapp',
    from: '+919876543210',
    fromName: 'Priya',
    subject: null,
    text: 'Send Acme proposal tomorrow 5pm',
    externalId: 'wamid.A',
    receivedAt: 1760000000000,
  });
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['Send Acme proposal tomorrow 5pm', 'Mark done', 'Tomorrow', 'Snooze'],
  );
  assert.deepEqual(whatsappCloud.parseWebhook(null), []);
  assert.deepEqual(whatsappCloud.parseWebhook({ entry: 'x' }), []);
  assert.deepEqual(whatsappCloud.parseWebhook({ entry: [{ changes: [{ value: { messages: [{ type: 'text' }] } }] }] }), []);
});

test('outbound returns false / failed when nothing is configured', async () => {
  const out = createOutbound(cfgWith({}), null, { log: quiet });
  assert.equal(await out.whatsapp('+919876543210', 'hi'), false);
  assert.equal(await out.email('a@b.com', 's', 't'), false);
  const st = out.status();
  assert.equal(st.whatsapp, false);
  assert.equal(st.email, false);
});

test('outbound whatsapp via Cloud API: normalises phone, posts text, handles errors', async () => {
  const calls: { url: string; body: any; auth: string }[] = [];
  let status = 200;
  const fakeFetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)), auth: (init?.headers as Record<string, string>).Authorization! });
    return new Response('{}', { status });
  };
  const cfg = cfgWith({ WHATSAPP_PHONE_NUMBER_ID: '999', WHATSAPP_ACCESS_TOKEN: 'tok' });
  const out = createOutbound(cfg, null, { fetch: fakeFetch, log: quiet });
  assert.equal(await out.whatsapp('+91 98765-43210', 'Hello'), true);
  assert.match(calls[0]!.url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/999\/messages$/);
  assert.equal(calls[0]!.auth, 'Bearer tok');
  assert.deepEqual(calls[0]!.body.to, '919876543210');
  assert.deepEqual(calls[0]!.body.text.body, 'Hello');
  assert.equal(await out.whatsapp('not a number', 'Hello'), false);
  status = 400;
  assert.equal(await out.whatsapp('+919876543210', 'Hello'), false);
  const throwing = createOutbound(cfg, null, { fetch: async () => { throw new Error('network'); }, log: quiet });
  assert.equal(await throwing.whatsapp('+919876543210', 'Hello'), false);
});

test('outbound prefers QR socket when connected', async () => {
  const sent: string[] = [];
  const qr = {
    status: () => ({ status: 'connected' as const, qr: null, phone: '+1' }),
    send: async (to: string) => (sent.push(to), true),
    start: async () => {},
    stop: async () => {},
    logout: async () => {},
  };
  const out = createOutbound(cfgWith({}), qr, { log: quiet });
  assert.equal(await out.whatsapp('+14155550100', 'x'), true);
  assert.deepEqual(sent, ['+14155550100']);
  assert.equal(out.status().whatsapp, true);
});

test('outbound email + push with injected transports', async () => {
  const mails: any[] = [];
  const d = dir();
  const cfg = loadIntegrationsConfig({ EMAIL_SMTP_HOST: 'smtp.x.com', EMAIL_FROM: 'bot@x.com' }, d);
  let pushStatus = 0;
  const out = createOutbound(cfg, null, {
    log: quiet,
    mailTransport: { sendMail: async (m) => mails.push(m) },
    pushSend: async () => {
      if (pushStatus) throw Object.assign(new Error('push'), { statusCode: pushStatus });
    },
  });
  assert.equal(await out.email('raj@y.com', 'Subj', 'Body', '<p>Body</p>'), true);
  assert.equal(mails[0].from, 'bot@x.com');
  assert.equal(mails[0].html, '<p>Body</p>');
  assert.equal(await out.email('not-an-email', 'Subj', 'Body'), false);
  const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };
  assert.equal(await out.push(sub, { title: 't', body: 'b' }), 'sent');
  pushStatus = 410;
  assert.equal(await out.push(sub, { title: 't', body: 'b' }), 'gone');
  pushStatus = 404;
  assert.equal(await out.push(sub, { title: 't', body: 'b' }), 'gone');
  pushStatus = 500;
  assert.equal(await out.push(sub, { title: 't', body: 'b' }), 'failed');
  assert.equal(existsSync(join(d, 'vapid.json')), true);
});

test('baileysToInbound: text, LID fallback, ignores groups/status/own', () => {
  const base = { key: { remoteJid: '919876543210@s.whatsapp.net', id: 'M1', fromMe: false }, pushName: 'Priya', messageTimestamp: 1760000000 };
  const m = baileysToInbound({ ...base, message: { conversation: 'Call Raj' } });
  assert.deepEqual(m, {
    channel: 'whatsapp',
    from: '+919876543210',
    fromName: 'Priya',
    subject: null,
    text: 'Call Raj',
    externalId: 'M1',
    receivedAt: 1760000000000,
  } satisfies InboundMessage);
  assert.equal(baileysToInbound({ ...base, message: { extendedTextMessage: { text: 'Hi' } } })?.text, 'Hi');
  assert.equal(baileysToInbound({ ...base, message: { ephemeralMessage: { message: { conversation: 'eph' } } } })?.text, 'eph');
  assert.equal(
    baileysToInbound({ ...base, key: { remoteJid: '1234@lid', remoteJidAlt: '14155550100@s.whatsapp.net', id: 'L' }, message: { conversation: 'x' } })?.from,
    '+14155550100',
  );
  assert.equal(baileysToInbound({ ...base, key: { ...base.key, fromMe: true }, message: { conversation: 'x' } }), null);
  assert.equal(baileysToInbound({ ...base, key: { ...base.key, remoteJid: '1203@g.us' }, message: { conversation: 'x' } }), null);
  assert.equal(baileysToInbound({ ...base, key: { ...base.key, remoteJid: 'status@broadcast' }, message: { conversation: 'x' } }), null);
  assert.equal(baileysToInbound({ ...base, message: { imageMessage: {} } }), null);
});

test('createWhatsAppQr: missing baileys does not throw', async () => {
  const qr = createWhatsAppQr(cfgWith({ WHATSAPP_QR: 'on' }), async () => ({ reply: null }), {
    loadBaileys: async () => {
      throw new Error('Cannot find module');
    },
    log: quiet,
  });
  await qr.start();
  assert.deepEqual(qr.status(), { status: 'disconnected', qr: null, phone: null });
  assert.equal(await qr.send('+14155550100', 'x'), false);
});

test('createWhatsAppQr: QR → connected → inbound → reply → logout clears auth', async () => {
  const cfg = cfgWith({ WHATSAPP_QR: 'on' });
  const ev = new EventEmitter();
  const sent: { jid: string; text: string }[] = [];
  let loggedOut = false;
  const sock = {
    ev,
    user: { id: '14155550100:7@s.whatsapp.net' },
    sendMessage: async (jid: string, c: { text: string }) => {
      sent.push({ jid, text: c.text });
      return {};
    },
    logout: async () => {
      loggedOut = true;
    },
    end: () => {},
  };
  const inbound: InboundMessage[] = [];
  const qr = createWhatsAppQr(
    cfg,
    async (m) => {
      inbound.push(m);
      return { reply: `Got it: ${m.text}` };
    },
    {
      log: quiet,
      loadBaileys: async () => ({
        default: () => sock,
        useMultiFileAuthState: async (folder: string) => {
          mkdirSync(folder, { recursive: true });
          return { state: {}, saveCreds: async () => {} };
        },
        DisconnectReason: { loggedOut: 401, restartRequired: 515 },
      }),
    },
  );
  await qr.start();
  ev.emit('connection.update', { qr: 'pairing-code-123' });
  // PNG encoding is async; wait for it rather than guessing a delay (slow under a loaded CI box).
  for (let i = 0; i < 300 && !qr.status().qr; i++) await new Promise((r) => setTimeout(r, 10));
  const pairing = qr.status();
  assert.equal(pairing.status, 'pairing');
  assert.match(pairing.qr ?? '', /^data:image\/png;base64,/);

  ev.emit('connection.update', { connection: 'open' });
  assert.deepEqual(qr.status(), { status: 'connected', qr: null, phone: '+14155550100' });

  ev.emit('messages.upsert', {
    type: 'notify',
    messages: [
      { key: { remoteJid: '919876543210@s.whatsapp.net', id: 'X1', fromMe: false }, message: { conversation: 'Book flights' }, pushName: 'Raj', messageTimestamp: 1760000000 },
      { key: { remoteJid: '1203@g.us', id: 'G1', fromMe: false }, message: { conversation: 'group msg' } },
    ],
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(inbound.length, 1);
  assert.equal(inbound[0]!.from, '+919876543210');
  assert.deepEqual(sent, [{ jid: '919876543210@s.whatsapp.net', text: 'Got it: Book flights' }]);

  assert.equal(await qr.send('+44 20 7946 0958', 'hello'), true);
  assert.equal(sent[1]!.jid, '442079460958@s.whatsapp.net');

  assert.equal(existsSync(cfg.whatsapp.authDir), true);
  await qr.logout();
  assert.equal(loggedOut, true);
  assert.equal(existsSync(cfg.whatsapp.authDir), false);
  assert.deepEqual(qr.status(), { status: 'disconnected', qr: null, phone: null });
});
