// OpenRouter client — request shape + success/error/timeout. Network is mocked via fetchImpl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complete } from '@companybrain/integrations';

function mockFetch(response: Response | Error, opts: { delayMs?: number } = {}) {
  return async (_url: any, _init: any) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (response instanceof Error) throw response;
    return response;
  };
}

test('openrouter: success parses content + usage', async () => {
  const res = new Response(JSON.stringify({
    choices: [{ message: { content: 'Hello world' } }],
    model: 'anthropic/claude-3.5-sonnet',
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const r = await complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: 'k', fetchImpl: mockFetch(res) as any });
  assert.equal(r.ok, true);
  assert.equal(r.text, 'Hello world');
  assert.equal(r.model, 'anthropic/claude-3.5-sonnet');
  assert.equal(r.usage?.completion_tokens, 5);
});

test('openrouter: non-2xx returns ok:false with error', async () => {
  const res = new Response(JSON.stringify({ error: { message: 'bad model' } }), { status: 400, headers: { 'content-type': 'application/json' } });
  const r = await complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: 'k', fetchImpl: mockFetch(res) as any });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /bad model|400/);
});

test('openrouter: network failure returns ok:false, never throws', async () => {
  const r = await complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: 'k', fetchImpl: mockFetch(new Error('ECONNRESET')) as any });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /ECONNRESET/);
});

test('openrouter: timeout aborts and returns ok:false', async () => {
  const fetchImpl = async (_url: any, init: any) => {
    // Honour the abort signal the client passes, like a real fetch would.
    return await new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  };
  const r = await complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: 'k', timeoutMs: 20, fetchImpl: fetchImpl as any });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /timed out/i);
});

test('openrouter: empty content is treated as a failure', async () => {
  const res = new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const r = await complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: 'k', fetchImpl: mockFetch(res) as any });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /empty/i);
});

test('openrouter: sends bearer auth + model + openrouter headers', async () => {
  let captured: any = {};
  const fetchImpl = async (url: any, init: any) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await complete({ model: 'the-model', messages: [{ role: 'user', content: 'hi' }], apiKey: 'secret', fetchImpl: fetchImpl as any });
  assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(captured.init.headers['Authorization'], 'Bearer secret');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, 'the-model');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
});
