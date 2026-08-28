// Logs must never carry credentials. The error path serializes the whole request, so this
// guards the one place that covers every call site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import pino from 'pino';
import { REDACTED_PATHS } from '../src/middleware/logger';

function captureLog(fn: (log: pino.Logger) => void): any {
  let out = '';
  const sink = new Writable({ write(chunk, _enc, cb) { out += chunk.toString(); cb(); } });
  const log = pino({ redact: { paths: REDACTED_PATHS, censor: '[redacted]' } }, sink);
  fn(log);
  return JSON.parse(out.trim().split('\n')[0]);
}

test('redaction: request cookies and bearer tokens never reach the log', () => {
  const line = captureLog((log) => log.warn({
    req: {
      method: 'POST', url: '/api/admin/keys',
      headers: { cookie: 'cb_session=SUPERSECRET', authorization: 'Bearer cb_key_secret', 'content-type': 'application/json' },
    },
  }, 'Request error'));
  const raw = JSON.stringify(line);
  assert.ok(!raw.includes('SUPERSECRET'), 'session token leaked');
  assert.ok(!raw.includes('cb_key_secret'), 'api key leaked');
  assert.equal(line.req.headers.cookie, '[redacted]');
  assert.equal(line.req.headers.authorization, '[redacted]');
  assert.equal(line.req.headers['content-type'], 'application/json', 'harmless headers survive');
});

test('redaction: webhook signatures and set-cookie are censored', () => {
  const line = captureLog((log) => log.info({
    req: { headers: { 'x-hub-signature-256': 'sha256=deadbeef' } },
    res: { headers: { 'set-cookie': 'cb_session=ANOTHERSECRET' } },
  }, 'response'));
  const raw = JSON.stringify(line);
  assert.ok(!raw.includes('deadbeef'), 'webhook signature leaked');
  assert.ok(!raw.includes('ANOTHERSECRET'), 'set-cookie leaked');
});

test('redaction: credential-shaped fields are censored wherever they appear', () => {
  const line = captureLog((log) => log.info({
    password: 'hunter2',
    connection: { credentials: { appPassword: 'abcd efgh', apiUrl: 'https://blog.example.com' } },
  }, 'connection saved'));
  const raw = JSON.stringify(line);
  assert.ok(!raw.includes('hunter2'), 'password leaked');
  assert.ok(!raw.includes('abcd efgh'), 'wordpress app password leaked');
});
