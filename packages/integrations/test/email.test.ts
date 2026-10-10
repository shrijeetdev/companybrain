import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InboundMessage } from '@companybrain/types';
import { loadIntegrationsConfig, parseInboundEmailWebhook, stripQuotedReply, htmlToText, createEmailPoller } from '../src/index';
import type { ImapClientLike } from '../src/email/poller';
import { replySubject } from '../src/email/poller';

const quiet = { info() {}, warn() {}, error() {} };

test('stripQuotedReply: Gmail "On … wrote:" (one and two lines)', () => {
  assert.equal(stripQuotedReply('Please send the deck by Friday.\n\nOn Mon, 5 Oct 2026 at 10:00, Raj <raj@x.com> wrote:\n> old stuff\n> more'), 'Please send the deck by Friday.');
  assert.equal(stripQuotedReply('Yes, do it.\n\nOn Mon, Oct 5, 2026 at 10:00 AM Raj Kumar <raj@x.com>\nwrote:\n> old'), 'Yes, do it.');
});

test('stripQuotedReply: Outlook original message / header block / signatures', () => {
  assert.equal(stripQuotedReply('Fix the invoice\r\n\r\n-----Original Message-----\r\nFrom: A\r\nSent: today'), 'Fix the invoice');
  assert.equal(stripQuotedReply('Call the bank\n\n________________________________\nFrom: X\nSent: Y'), 'Call the bank');
  assert.equal(stripQuotedReply('Call the bank\n\nFrom: Raj <raj@x.com>\nSent: Monday\nTo: me\nSubject: hi'), 'Call the bank');
  assert.equal(stripQuotedReply('Ship it\n-- \nPriya\nCEO, Acme'), 'Ship it');
  assert.equal(stripQuotedReply('Ship it\n\nSent from my iPhone'), 'Ship it');
  assert.equal(stripQuotedReply('Line one\n> quoted\nLine two'), 'Line one\nLine two');
  // a "From:" line without Sent/Date isn't a header block
  assert.equal(stripQuotedReply('From: the warehouse, collect 3 boxes'), 'From: the warehouse, collect 3 boxes');
});

test('htmlToText: structure, entities, and quoted blocks dropped', () => {
  const html =
    '<html><head><style>p{}</style></head><body><p>Hi&nbsp;team,</p><p>Please <b>review</b> &amp; sign<br>today.</p><ul><li>One</li><li>Two</li></ul>' +
    '<div class="gmail_quote">On Mon … wrote:<blockquote>old</blockquote></div></body></html>';
  assert.equal(htmlToText(html), 'Hi team,\n\nPlease review & sign\ntoday.\n\n• One\n• Two');
  assert.equal(htmlToText('<p>a &#x27;b&#39; &lt;c&gt;</p>'), "a 'b' <c>");
});

test('webhook: Postmark', () => {
  const m = parseInboundEmailWebhook({
    From: 'raj@x.com',
    FromName: 'Raj Kumar',
    FromFull: { Email: 'Raj@X.com', Name: 'Raj Kumar' },
    To: 'tasks@brain.com',
    Subject: 'Acme proposal',
    TextBody: 'Please send it by Friday.\n\nOn Mon, Raj wrote:\n> x',
    HtmlBody: '<p>Please send it by Friday.</p>',
    MessageID: 'pm-uuid',
    Date: 'Mon, 5 Oct 2026 10:00:00 +0000',
    Headers: [{ Name: 'Message-ID', Value: '<abc@mail.x.com>' }],
  });
  assert.deepEqual(m, {
    channel: 'email',
    from: 'raj@x.com',
    fromName: 'Raj Kumar',
    subject: 'Acme proposal',
    text: 'Please send it by Friday.',
    externalId: '<abc@mail.x.com>',
    receivedAt: Date.UTC(2026, 9, 5, 10),
    authenticated: false,
  } satisfies InboundMessage);
});

test('webhook: SendGrid inbound parse', () => {
  const m = parseInboundEmailWebhook({
    from: 'Priya Shah <priya@acme.io>',
    to: 'tasks@brain.com',
    subject: 'Website copy',
    text: 'Update the hero text',
    html: '<p>Update the hero text</p>',
    headers: 'Received: by mx\r\nMessage-ID: <sg-1@acme.io>\r\nDate: Tue, 6 Oct 2026 08:30:00 +0000\r\n',
    envelope: '{"to":["tasks@brain.com"],"from":"priya@acme.io"}',
  });
  assert.equal(m?.from, 'priya@acme.io');
  assert.equal(m?.fromName, 'Priya Shah');
  assert.equal(m?.externalId, '<sg-1@acme.io>');
  assert.equal(m?.receivedAt, Date.UTC(2026, 9, 6, 8, 30));
  assert.equal(m?.text, 'Update the hero text');
});

test('webhook: Mailgun routes', () => {
  const m = parseInboundEmailWebhook({
    sender: 'bounce@mg.acme.io',
    from: 'Dev Ops <ops@acme.io>',
    subject: 'Renew SSL',
    'body-plain': 'Renew the cert\n\n> old',
    'stripped-text': 'Renew the cert',
    'body-html': '<p>Renew the cert</p>',
    'message-headers': JSON.stringify([
      ['Message-Id', '<mg-1@acme.io>'],
      ['Subject', 'Renew SSL'],
    ]),
    timestamp: '1760000000',
  });
  assert.equal(m?.from, 'ops@acme.io');
  assert.equal(m?.externalId, '<mg-1@acme.io>');
  assert.equal(m?.text, 'Renew the cert');
  assert.equal(m?.receivedAt, 1760000000000);
});

test('webhook: Cloudflare Email Worker forward (+ html-only, + JSON string body)', () => {
  const m = parseInboundEmailWebhook(
    JSON.stringify({ from: 'ceo@acme.io', to: 'tasks@brain.com', subject: 'Board deck', html: '<div>Prepare the board deck</div>', messageId: '<cf-1@acme.io>' }),
  );
  assert.equal(m?.from, 'ceo@acme.io');
  assert.equal(m?.text, 'Prepare the board deck');
  assert.equal(m?.externalId, '<cf-1@acme.io>');
});

test('webhook: subject-only becomes text; missing id gets a stable hash; junk → null', () => {
  const a = parseInboundEmailWebhook({ from: 'a@b.co', subject: 'Call Raj' });
  const b = parseInboundEmailWebhook({ from: 'a@b.co', subject: 'Call Raj' });
  assert.equal(a?.text, 'Call Raj');
  assert.match(a!.externalId, /^sha256:[0-9a-f]{32}$/);
  assert.equal(a?.externalId, b?.externalId);
  assert.equal(parseInboundEmailWebhook(null), null);
  assert.equal(parseInboundEmailWebhook('not json'), null);
  assert.equal(parseInboundEmailWebhook({ from: 'nobody', text: 'x' }), null);
  assert.equal(parseInboundEmailWebhook({ from: 'a@b.co' }), null);
});

test('replySubject', () => {
  assert.equal(replySubject('Acme'), 'Re: Acme');
  assert.equal(replySubject('RE: Acme'), 'RE: Acme');
  assert.equal(replySubject(null), 'Re: your message');
});

function rawEmail(opts: { from: string; subject: string; body: string; id: string; extra?: string }): Buffer {
  return Buffer.from(
    [
      `From: ${opts.from}`,
      'To: tasks@brain.com',
      `Subject: ${opts.subject}`,
      `Message-ID: ${opts.id}`,
      'References: <root@x.com>',
      'Date: Mon, 05 Oct 2026 10:00:00 +0000',
      ...(opts.extra ? [opts.extra] : []),
      'Content-Type: text/plain; charset=utf-8',
      '',
      opts.body,
    ].join('\r\n'),
  );
}

test('email poller: not configured → null', () => {
  assert.equal(createEmailPoller(loadIntegrationsConfig({}, mkdtempSync(join(tmpdir(), 'cb-'))), async () => ({ reply: null })), null);
});

test('email poller: pollOnce parses UNSEEN, strips quotes, marks seen, sends threaded reply, skips automated/self', async () => {
  const cfg = loadIntegrationsConfig(
    {
      EMAIL_IMAP_HOST: 'imap.x.com',
      EMAIL_IMAP_USER: 'tasks@brain.com',
      EMAIL_IMAP_PASS: 'p',
      EMAIL_SMTP_HOST: 'smtp.x.com',
      EMAIL_FROM: 'Brain <tasks@brain.com>',
    },
    mkdtempSync(join(tmpdir(), 'cb-')),
  );
  const store: Record<number, Buffer> = {
    11: rawEmail({ from: 'Raj <raj@x.com>', subject: 'Invoice', body: 'Pay the invoice today\r\n\r\nOn Mon, Bob wrote:\r\n> hi', id: '<m11@x.com>' }),
    12: rawEmail({ from: 'Out of office <raj@x.com>', subject: 'Auto: away', body: 'I am away', id: '<m12@x.com>', extra: 'Auto-Submitted: auto-replied' }),
    13: rawEmail({ from: 'tasks@brain.com', subject: 'Loop', body: 'from myself', id: '<m13@x.com>' }),
  };
  const seen: number[] = [];
  let connected = 0;
  let loggedOut = 0;
  const client: ImapClientLike = {
    connect: async () => void connected++,
    logout: async () => void loggedOut++,
    close: () => {},
    on: () => client,
    getMailboxLock: async () => ({ release() {} }),
    search: async () => Object.keys(store).map(Number).filter((u) => !seen.includes(u)),
    fetchOne: async (uid) => ({ source: store[Number(uid)]! }),
    messageFlagsAdd: async (range) => {
      seen.push(...(range as number[]));
      return true;
    },
  };
  const sent: any[] = [];
  const inbound: InboundMessage[] = [];
  const poller = createEmailPoller(
    cfg,
    async (m) => {
      inbound.push(m);
      return { reply: 'Created task "Pay the invoice"' };
    },
    { createClient: () => client, log: quiet, mailer: { configured: true, send: async (m) => (sent.push(m), true), close() {} } },
  )!;
  const n = await poller.pollOnce();
  assert.equal(n, 1);
  assert.equal(inbound.length, 1);
  assert.deepEqual(inbound[0], {
    channel: 'email',
    from: 'raj@x.com',
    fromName: 'Raj',
    subject: 'Invoice',
    text: 'Pay the invoice today',
    externalId: '<m11@x.com>',
    receivedAt: Date.UTC(2026, 9, 5, 10),
    authenticated: false,
  });
  assert.deepEqual(seen.sort(), [11, 12, 13]);
  assert.deepEqual(sent, [
    { to: 'raj@x.com', subject: 'Re: Invoice', text: 'Created task "Pay the invoice"', inReplyTo: '<m11@x.com>', references: ['<root@x.com>', '<m11@x.com>'] },
  ]);
  assert.equal(connected, 1);
  assert.equal(loggedOut, 1);
  assert.equal(await poller.pollOnce(), 0);
  await poller.stop();
});

test('email poller: handler failure leaves message unseen until 3rd attempt', async () => {
  const cfg = loadIntegrationsConfig({ EMAIL_IMAP_HOST: 'h', EMAIL_IMAP_USER: 'u@x.com', EMAIL_IMAP_PASS: 'p' }, mkdtempSync(join(tmpdir(), 'cb-')));
  const seen: number[] = [];
  const client: ImapClientLike = {
    connect: async () => {},
    logout: async () => {},
    close: () => {},
    getMailboxLock: async () => ({ release() {} }),
    search: async () => (seen.includes(1) ? [] : [1]),
    fetchOne: async () => ({ source: rawEmail({ from: 'a@b.co', subject: 'S', body: 'B', id: '<1@b.co>' }) }),
    messageFlagsAdd: async (r) => (seen.push(...(r as number[])), true),
  };
  const poller = createEmailPoller(cfg, async () => { throw new Error('db down'); }, { createClient: () => client, log: quiet })!;
  await poller.pollOnce();
  await poller.pollOnce();
  assert.deepEqual(seen, []);
  await poller.pollOnce();
  assert.deepEqual(seen, [1]);
});

test('email poller: connection failure rejects pollOnce (start() handles backoff)', async () => {
  const cfg = loadIntegrationsConfig({ EMAIL_IMAP_HOST: 'h', EMAIL_IMAP_USER: 'u', EMAIL_IMAP_PASS: 'p' }, mkdtempSync(join(tmpdir(), 'cb-')));
  let closed = false;
  const poller = createEmailPoller(cfg, async () => ({ reply: null }), {
    log: quiet,
    createClient: () => ({
      connect: async () => {
        throw new Error('ECONNREFUSED');
      },
      logout: async () => {},
      close: () => void (closed = true),
      getMailboxLock: async () => ({ release() {} }),
      search: async () => [],
      fetchOne: async () => false,
      messageFlagsAdd: async () => true,
    }),
  })!;
  await assert.rejects(poller.pollOnce(), /ECONNREFUSED/);
  assert.equal(closed, true);
});
