// Regression tests for the v2 security audit: H2 (ReDoS in email parsing) and H3 (sender spoofing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simpleParser } from 'mailparser';
import { parseAddress, parseInboundEmailWebhook } from '../src/email/webhook';
import { htmlToText, stripQuotedReply, bestBody } from '../src/email/text';
import { authenticatedByHeader, parseAuthenticationResults } from '../src/email/auth';
import { mailToInbound } from '../src/email/poller';
import { resolveTzid } from '../src/calendar/tz';
import { sendPush } from '../src/push';

const LIMIT_MS = 50;

function timed(name: string, fn: () => unknown) {
  fn(); // warm-up (JIT), then measure
  const t0 = performance.now();
  fn();
  const dt = performance.now() - t0;
  assert.ok(dt < LIMIT_MS, `${name} took ${dt.toFixed(1)} ms (limit ${LIMIT_MS} ms)`);
}

const rep = (u: string, n: number) => u.repeat(Math.ceil(n / u.length)).slice(0, n);

// ─── H2: ReDoS ──────────────────────────────────────────────────────────────

test('H2: parseAddress is linear on the audit inputs and still parses real addresses', () => {
  for (const u of ['x', 'a.', '@a.', 'a@', 'a@a.', '@.', '.@', 'a@b.c ', '<', '"']) {
    for (const n of [4000, 10_000, 100_000]) timed(`parseAddress(${JSON.stringify(u)} x${n})`, () => parseAddress(rep(u, n)));
  }
  timed('parseAddress("a@" x4000)', () => parseAddress('a@'.repeat(4000)));
  assert.deepEqual(parseAddress('Raj Kumar <Raj@X.com>'), { address: 'raj@x.com', name: 'Raj Kumar' });
  assert.deepEqual(parseAddress('"Kumar, Raj" <raj@x.com>'), { address: 'raj@x.com', name: 'Kumar, Raj' });
  assert.deepEqual(parseAddress('raj@x.com'), { address: 'raj@x.com', name: null });
  assert.deepEqual(parseAddress('mailto: raj@x.co.in;'), { address: 'raj@x.co.in', name: null });
  assert.equal(parseAddress('a@'.repeat(2500) + 'x'), null);
  assert.equal(parseAddress('nobody'), null);
  assert.equal(parseAddress('a@b@c.d'), null);
});

test('H2: htmlToText is a linear tokenizer (pathological HTML < 50 ms) with the same output', () => {
  for (const u of ['<div ', "<div class='", '<div id="', '<!--', '<script', '<blockquote', '&#', '<', '<a', '</', '<br>', '<p>x', '<div class="gmail_quote"']) {
    for (const n of [40_000, 300_000, 1_000_000]) timed(`htmlToText(${JSON.stringify(u)} x${n})`, () => htmlToText(rep(u, n)));
  }
  timed('htmlToText("<div " x40000)', () => htmlToText('<div '.repeat(40_000)));
  const html =
    '<html><head><style>p{}</style></head><body><p>Hi&nbsp;team,</p><p>Please <b>review</b> &amp; sign<br>today.</p><ul><li>One</li><li>Two</li></ul>' +
    '<div class="gmail_quote">On Mon … wrote:<blockquote>old</blockquote></div></body></html>';
  assert.equal(htmlToText(html), 'Hi team,\n\nPlease review & sign\ntoday.\n\n• One\n• Two');
  assert.equal(htmlToText('<p>a &#x27;b&#39; &lt;c&gt;</p>'), "a 'b' <c>");
  assert.equal(htmlToText('<!-- hidden -->Keep <script>evil()</script>this<blockquote>old</blockquote>'), 'Keep this');
  assert.equal(htmlToText('<div id="divRplyFwdMsg">From: x</div>'), '');
  assert.equal(htmlToText('1 < 2 and 3 > 2'), '1 2', 'same as the old <[^>]+> stripping');
  assert.equal(htmlToText('a < b'), 'a < b', 'a lone < is text');
  assert.ok(htmlToText('x'.repeat(400_000)).length <= 300 * 1024, 'HTML capped at 300 KB');
});

test('H2: stripQuotedReply / bestBody stay linear on adversarial text', () => {
  for (const u of ['On a ', 'On \t', 'Am schrieb', 'El escribió', 'Le a écrit ', 'From: ', ' ', '>', '-- ', 'On x wrote:\n']) {
    for (const n of [40_000, 200_000, 1_000_000]) timed(`stripQuotedReply(${JSON.stringify(u)} x${n})`, () => stripQuotedReply(rep(u, n)));
  }
  timed('trailing-space run', () => stripQuotedReply(' '.repeat(200_000) + 'x'));
  timed('bestBody(html only)', () => bestBody(null, '<div '.repeat(100_000)));
  assert.ok(stripQuotedReply('y'.repeat(300_000)).length <= 200 * 1024, 'text capped at 200 KB');
});

test('H2: the email webhook parser and ICS TZID resolver are bounded end to end', () => {
  timed('webhook From "a@" x2500', () => parseInboundEmailWebhook({ from: 'a@'.repeat(2500) + 'x', subject: 'hi', text: 'hello' }));
  timed('webhook html "<div " x20000', () => parseInboundEmailWebhook({ from: 'x@evil.test', subject: 's', html: '<div '.repeat(20_000) }));
  timed('webhook headers', () => parseInboundEmailWebhook({ from: 'x@evil.test', subject: 's', text: 't', headers: 'Authentication-Results: ' + 'a=b;'.repeat(200_000) }));
  const m = parseInboundEmailWebhook({ from: 'x@evil.test', subject: 'S'.repeat(5000), text: 't'.repeat(300_000) });
  assert.equal(m!.subject!.length, 1024, 'header values capped at 1 KB');
  assert.ok(m!.text.length <= 200 * 1024);
  timed('resolveTzid long', () => resolveTzid('a'.repeat(100_000)));
});

// ─── H3: sender authentication ──────────────────────────────────────────────

const AR_PASS = 'mx.google.com; dkim=pass header.i=@x.com header.s=s1 header.b=AbC; spf=pass (google.com: domain of raj@x.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=raj@x.com; dmarc=pass (p=REJECT) header.from=x.com';

test('H3: Authentication-Results parsing and alignment', () => {
  const ar = parseAuthenticationResults(AR_PASS);
  assert.equal(ar.authservId, 'mx.google.com');
  assert.deepEqual(ar.results.map((r) => `${r.method}=${r.result}`), ['dkim=pass', 'spf=pass', 'dmarc=pass']);
  assert.equal(authenticatedByHeader(AR_PASS, 'raj@x.com'), true);
  assert.equal(authenticatedByHeader('mx.example; dmarc=pass header.from=x.com', 'raj@x.com'), true);
  assert.equal(authenticatedByHeader('mx.example; dkim=pass header.d=mail.x.com', 'raj@x.com'), false, 'subdomain signer of a parent From is not aligned');
  assert.equal(authenticatedByHeader('mx.example; dkim=pass header.d=x.com', 'raj@eu.x.com'), true, 'parent-domain signature aligns (relaxed)');
  assert.equal(authenticatedByHeader('mx.example; dkim=pass header.d=evil.com; spf=pass smtp.mailfrom=bounce@evil.com', 'ceo@x.com'), false, 'unaligned passes do not count');
  assert.equal(authenticatedByHeader('mx.example; dmarc=fail header.from=x.com; spf=softfail smtp.mailfrom=x.com', 'raj@x.com'), false);
  assert.equal(authenticatedByHeader('mx.example; dmarc=pass header.from=evil.com', 'raj@x.com'), false);
  assert.equal(authenticatedByHeader(null, 'raj@x.com'), false);
  assert.equal(authenticatedByHeader(AR_PASS, 'raj@x.com', { authservId: 'mx.google.com' }), true);
  assert.equal(authenticatedByHeader(AR_PASS, 'raj@x.com', { authservId: 'mx.microsoft.com' }), false, 'authserv-id must match when configured');
});

function rawEmail(headers: string[], from = 'Raj <raj@x.com>'): Buffer {
  return Buffer.from(
    [...headers, `From: ${from}`, 'To: tasks@brain.com', 'Subject: Invoice', 'Message-ID: <m1@x.com>', 'Date: Mon, 05 Oct 2026 10:00:00 +0000', 'Content-Type: text/plain; charset=utf-8', '', 'Pay the invoice'].join('\r\n'),
  );
}

test('H3: IMAP — only the TOPMOST Authentication-Results header counts', async () => {
  const ok = await simpleParser(rawEmail([`Authentication-Results: ${AR_PASS}`]));
  assert.equal(mailToInbound(ok, 'fb')!.authenticated, true);
  // The sender planted a "pass" header; the receiving provider's (topmost) one says fail.
  const forged = await simpleParser(rawEmail(['Authentication-Results: mx.google.com; dmarc=fail header.from=x.com; spf=fail smtp.mailfrom=raj@x.com', `Authentication-Results: ${AR_PASS}`]));
  assert.equal(mailToInbound(forged, 'fb')!.authenticated, false);
  const none = await simpleParser(rawEmail([]));
  assert.equal(mailToInbound(none, 'fb')!.authenticated, false);
  assert.equal(mailToInbound(none, 'fb', { trustUnverifiedSenders: true })!.authenticated, true, 'unsafe escape hatch');
  // EMAIL_AUTHSERV_ID: a header from anyone else is ignored.
  const planted = await simpleParser(rawEmail(['Authentication-Results: attacker.example; dmarc=pass header.from=x.com']));
  assert.equal(mailToInbound(planted, 'fb')!.authenticated, true);
  assert.equal(mailToInbound(planted, 'fb', { authservId: 'mx.google.com' })!.authenticated, false);
  // Multiple authors can't all be verified.
  const two = await simpleParser(rawEmail([`Authentication-Results: ${AR_PASS}`], 'raj@x.com, ceo@x.com'));
  assert.equal(mailToInbound(two, 'fb')!.authenticated, false);
});

test('H3: webhooks — provider verdicts set `authenticated`', () => {
  const base = { Subject: 'S', TextBody: 'Do it', MessageID: 'pm-1' };
  // Postmark
  assert.equal(parseInboundEmailWebhook({ ...base, From: 'raj@x.com' })!.authenticated, false);
  assert.equal(parseInboundEmailWebhook({ ...base, From: 'raj@x.com', Headers: [{ Name: 'Authentication-Results', Value: AR_PASS }] })!.authenticated, true);
  assert.equal(parseInboundEmailWebhook({ ...base, From: 'raj@x.com', Headers: [{ Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS' }] })!.authenticated, true);
  assert.equal(parseInboundEmailWebhook({ ...base, From: 'raj@x.com', Headers: [{ Name: 'X-Spam-Tests', Value: 'DKIM_SIGNED,DKIM_VALID,SPF_PASS' }] })!.authenticated, false);
  assert.equal(parseInboundEmailWebhook({ ...base, From: 'raj@x.com', Headers: [{ Name: 'Received-SPF', Value: 'Pass (sender SPF authorized) identity=mailfrom; client-ip=1.2.3.4; envelope-from="bounce@x.com"; receiver=tasks@brain.com' }] })!.authenticated, true);
  assert.equal(parseInboundEmailWebhook({ ...base, From: 'raj@x.com', Headers: [{ Name: 'Received-SPF', Value: 'Pass identity=mailfrom; envelope-from="a@evil.com"' }] })!.authenticated, false);
  // SendGrid
  const sg = { from: 'Priya <priya@acme.io>', subject: 'S', text: 'T' };
  assert.equal(parseInboundEmailWebhook({ ...sg, SPF: 'pass', envelope: '{"from":"priya@acme.io"}' })!.authenticated, true);
  assert.equal(parseInboundEmailWebhook({ ...sg, SPF: 'pass', envelope: '{"from":"x@evil.com"}' })!.authenticated, false);
  assert.equal(parseInboundEmailWebhook({ ...sg, dkim: '{@acme.io : pass}' })!.authenticated, true);
  assert.equal(parseInboundEmailWebhook({ ...sg, dkim: '{@evil.com : pass, @acme.io : fail}' })!.authenticated, false);
  assert.equal(parseInboundEmailWebhook(sg)!.authenticated, false);
  // Mailgun
  const mg = { from: 'Ops <ops@acme.io>', subject: 'S', 'body-plain': 'T' };
  assert.equal(parseInboundEmailWebhook({ ...mg, sender: 'bounce@acme.io', 'X-Mailgun-Spf': 'Pass' })!.authenticated, true);
  assert.equal(parseInboundEmailWebhook({ ...mg, sender: 'bounce@evil.com', 'X-Mailgun-Spf': 'Pass' })!.authenticated, false);
  assert.equal(parseInboundEmailWebhook({ ...mg, 'X-Mailgun-Dkim-Check-Result': 'Pass', 'message-headers': JSON.stringify([['DKIM-Signature', 'v=1; a=rsa-sha256; d=acme.io; s=k1; b=xx']]) })!.authenticated, true);
  assert.equal(parseInboundEmailWebhook({ ...mg, 'X-Mailgun-Dkim-Check-Result': 'Pass', 'message-headers': JSON.stringify([['DKIM-Signature', 'v=1; d=evil.com; b=xx']]) })!.authenticated, false);
  // Cloudflare Email Worker / generic: only an explicit boolean from your own worker.
  assert.equal(parseInboundEmailWebhook({ from: 'ceo@acme.io', subject: 'S', text: 'T', authenticated: true })!.authenticated, true);
  assert.equal(parseInboundEmailWebhook({ from: 'ceo@acme.io', subject: 'S', text: 'T', authenticated: 'true' })!.authenticated, false);
  // Escape hatch
  assert.equal(parseInboundEmailWebhook(sg, { trustUnverifiedSenders: true })!.authenticated, true);
});

// ─── M1: push SSRF guard before sending ─────────────────────────────────────

test('M1: sendPush never contacts a non-push-service endpoint', async () => {
  const calls: string[] = [];
  const send = async (s: { endpoint: string }) => void calls.push(s.endpoint);
  const keys = { publicKey: 'p', privateKey: 'k' };
  const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
  for (const e of ['https://127.0.0.1:8443/x', 'https://internal.corp/x', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:444/x']) {
    assert.equal(await sendPush(keys, 'mailto:a@b.co', sub(e), { title: 't', body: 'b' }, { send }), 'gone', e);
  }
  assert.deepEqual(calls, []);
  assert.equal(await sendPush(keys, 'mailto:a@b.co', sub('https://fcm.googleapis.com/fcm/send/x'), { title: 't', body: 'b' }, { send }), 'sent');
  assert.deepEqual(calls, ['https://fcm.googleapis.com/fcm/send/x']);
});
