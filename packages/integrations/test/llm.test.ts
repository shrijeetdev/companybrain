import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadIntegrationsConfig, createLlm, createTts } from '../src/index';
import { extractJsonObject, validateExtraction, resolveLocalDue, supportsOutputConfig, cleanSpoken, numbersPreserved } from '../src/llm';

const quiet = { info() {}, warn() {}, error() {} };
const cfgWith = (env: Record<string, string>) => loadIntegrationsConfig(env, mkdtempSync(join(tmpdir(), 'cb-llm-')));
const NOW = Date.UTC(2026, 9, 10, 6, 0); // Sat 10 Oct 2026, 11:30 IST
const ctx = {
  now: NOW,
  timezone: 'Asia/Kolkata',
  members: [
    { id: 'mem_priya', name: 'Priya Shah' },
    { id: 'mem_raj', name: 'Raj' },
  ],
  projects: [{ id: 'proj_web', name: 'Website' }],
};

test('extractJsonObject tolerates fences and prose', () => {
  assert.deepEqual(extractJsonObject('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('Sure! Here it is: {"a":{"b":"}"}} hope that helps'), { a: { b: '}' } });
  assert.equal(extractJsonObject('no json here'), null);
  assert.equal(extractJsonObject('{broken'), null);
});

test('validateExtraction: happy path resolves local due time + filters unknown ids', () => {
  const d = validateExtraction(
    {
      isTask: true,
      title: '  Send   Acme proposal ',
      notes: 'Include pricing',
      due: '2026-10-11T17:00',
      priority: 'high',
      assigneeIds: ['mem_priya', 'mem_ghost', 'mem_priya'],
      projectId: 'proj_web',
      tags: ['#Sales', 'Big Deal', 3],
    },
    ctx,
  );
  assert.deepEqual(d, {
    title: 'Send Acme proposal',
    notes: 'Include pricing',
    dueAt: Date.UTC(2026, 9, 11, 11, 30), // 17:00 IST
    dueAllDay: false,
    priority: 'high',
    assigneeIds: ['mem_priya'],
    projectId: 'proj_web',
    tags: ['sales', 'big-deal'],
  });
});

test('validateExtraction: not-a-task, invalid shapes and bad values', () => {
  assert.equal(validateExtraction({ isTask: false, title: 'Thanks!' }, ctx), null);
  assert.equal(validateExtraction({ isTask: true, title: '   ' }, ctx), null);
  assert.equal(validateExtraction(null, ctx), null);
  assert.equal(validateExtraction([1, 2], ctx), null);
  assert.equal(validateExtraction('{"isTask":true}', ctx), null);
  const d = validateExtraction({ isTask: true, title: 'X', due: 'next tuesday-ish', priority: 'critical', projectId: 'proj_nope', assigneeIds: 'mem_raj' }, ctx);
  assert.deepEqual(d, { title: 'X' });
  // absurd dates are dropped
  assert.deepEqual(validateExtraction({ isTask: true, title: 'X', due: '1999-01-01' }, ctx), { title: 'X' });
});

test('resolveLocalDue: all-day → 18:00 local; explicit offset honoured', () => {
  assert.deepEqual(resolveLocalDue('2026-10-12', 'Asia/Kolkata'), { at: Date.UTC(2026, 9, 12, 12, 30), allDay: true });
  assert.deepEqual(resolveLocalDue('2026-10-12T09:15', 'America/New_York'), { at: Date.UTC(2026, 9, 12, 13, 15), allDay: false });
  assert.deepEqual(resolveLocalDue('2026-10-12T09:15:00Z', 'Asia/Kolkata'), { at: Date.UTC(2026, 9, 12, 9, 15), allDay: false });
  assert.equal(resolveLocalDue('2026-13-12', 'UTC'), null);
  assert.equal(resolveLocalDue('tomorrow', 'UTC'), null);
});

test('supportsOutputConfig', () => {
  assert.equal(supportsOutputConfig('claude-sonnet-5-5'), true);
  assert.equal(supportsOutputConfig('claude-opus-4-8'), true);
  assert.equal(supportsOutputConfig('claude-sonnet-4-5'), false);
  assert.equal(supportsOutputConfig('claude-3-5-sonnet-latest'), false);
});

test('createLlm: null without keys', () => {
  assert.equal(createLlm(cfgWith({})), null);
});

test('createLlm (Anthropic): request shape, JSON validation, fallbacks', async () => {
  let reply: unknown = { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ isTask: true, title: 'Call Raj', notes: '', due: '2026-10-12', priority: 'none', assigneeIds: ['mem_raj'], projectId: null, tags: [] }) }] };
  let status = 200;
  const seen: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    seen.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    assert.ok(init?.signal, 'request must carry a timeout signal');
    return new Response(JSON.stringify(reply), { status });
  };
  const llm = createLlm(cfgWith({ ANTHROPIC_API_KEY: 'sk-ant-test' }), { fetch: fakeFetch, log: quiet })!;
  const d = await llm.extractTask({ text: 'Please call Raj on Monday', from: '+919876543210', ...ctx });
  assert.deepEqual(d, { title: 'Call Raj', dueAt: Date.UTC(2026, 9, 12, 12, 30), dueAllDay: true, priority: 'none', assigneeIds: ['mem_raj'] });
  assert.equal(seen[0]!.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen[0]!.headers['x-api-key'], 'sk-ant-test');
  assert.equal(seen[0]!.headers['anthropic-version'], '2023-06-01');
  assert.equal(seen[0]!.body.model, 'claude-sonnet-5-5');
  assert.equal(seen[0]!.body.output_config.format.type, 'json_schema');
  assert.match(seen[0]!.body.messages[0].content, /Please call Raj on Monday/);
  assert.match(seen[0]!.body.messages[0].content, /mem_raj/);
  assert.match(seen[0]!.body.system, /JSON/);

  reply = { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"isTask": false, "title": ""}' }] };
  assert.equal(await llm.extractTask({ text: 'thanks!', ...ctx }), null);
  reply = { stop_reason: 'refusal', content: [] };
  assert.equal(await llm.extractTask({ text: 'x', ...ctx }), null);
  reply = { content: [{ type: 'text', text: 'I think this is a task about calling Raj.' }] };
  assert.equal(await llm.extractTask({ text: 'x', ...ctx }), null);
  status = 529;
  assert.equal(await llm.extractTask({ text: 'x', ...ctx }), null);
  const throwing = createLlm(cfgWith({ ANTHROPIC_API_KEY: 'k' }), { fetch: async () => { throw new Error('ETIMEDOUT'); }, log: quiet })!;
  assert.equal(await throwing.extractTask({ text: 'x', ...ctx }), null);
});

test('createLlm (OpenAI-compatible): chat/completions + polishBriefing guards', async () => {
  let content = 'Good morning Priya! You have 4 tasks today, and 1 is overdue: the Acme proposal. Meeting with Raj at 3 PM.';
  const seen: { url: string; body: any; auth: string }[] = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    seen.push({ url, body: JSON.parse(String(init?.body)), auth: (init?.headers as Record<string, string>).Authorization! });
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { status: 200 });
  };
  const llm = createLlm(cfgWith({ OPENAI_API_KEY: 'sk-or', OPENAI_BASE_URL: 'https://openrouter.ai/api/v1', OPENAI_MODEL: 'some/model' }), {
    fetch: fakeFetch,
    log: quiet,
  })!;
  const script = 'Good morning, Priya. You have 4 tasks today. 1 is overdue: the Acme proposal. You have a meeting with Raj at 3 PM.';
  assert.equal(await llm.polishBriefing({ script, name: 'Priya', timezone: 'Asia/Kolkata' }), content);
  assert.equal(seen[0]!.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(seen[0]!.auth, 'Bearer sk-or');
  assert.equal(seen[0]!.body.model, 'some/model');
  assert.equal(seen[0]!.body.messages[0].role, 'system');
  // markdown/emoji stripped
  content = '**Good morning Priya!** 🎉 You have 4 tasks today, 1 overdue: the Acme proposal. Meeting with Raj at 3 PM.';
  assert.equal(await llm.polishBriefing({ script, name: 'Priya', timezone: 'UTC' }), 'Good morning Priya! You have 4 tasks today, 1 overdue: the Acme proposal. Meeting with Raj at 3 PM.');
  // a dropped fact (number) → original script
  content = 'Good morning Priya! You have a few tasks today.';
  assert.equal(await llm.polishBriefing({ script, name: 'Priya', timezone: 'UTC' }), script);
  // empty → original
  content = '';
  assert.equal(await llm.polishBriefing({ script, name: 'Priya', timezone: 'UTC' }), script);
  const throwing = createLlm(cfgWith({ OPENAI_API_KEY: 'k' }), { fetch: async () => { throw new Error('boom'); }, log: quiet })!;
  assert.equal(await throwing.polishBriefing({ script, name: 'Priya', timezone: 'UTC' }), script);
});

test('cleanSpoken + numbersPreserved', () => {
  assert.equal(cleanSpoken('# Hi\n- **one** ✅\n- two'), 'Hi one two');
  assert.equal(numbersPreserved('3 tasks at 5 PM', 'You have 3 tasks, the first at 5 PM'), true);
  assert.equal(numbersPreserved('3 tasks at 5 PM', 'You have three tasks'), false);
});

test('createTts: null when unconfigured; OpenAI + ElevenLabs request shapes; null on error', async () => {
  assert.equal(createTts(cfgWith({})), null);
  assert.equal(createTts(cfgWith({ OPENAI_API_KEY: 'k' })), null); // TTS_PROVIDER required
  const seen: { url: string; body: any; headers: Record<string, string> }[] = [];
  let status = 200;
  const fakeFetch = async (url: string, init?: RequestInit) => {
    seen.push({ url, body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> });
    return new Response(status === 200 ? new Uint8Array([0xff, 0xfb, 0x90]) : 'err', { status });
  };
  const oa = createTts(cfgWith({ OPENAI_API_KEY: 'k', TTS_PROVIDER: 'openai' }), { fetch: fakeFetch, log: quiet })!;
  const r = await oa.synthesize('Hello there');
  assert.equal(r?.mime, 'audio/mpeg');
  assert.equal(r?.audio.length, 3);
  assert.equal(seen[0]!.url, 'https://api.openai.com/v1/audio/speech');
  assert.deepEqual(seen[0]!.body, { model: 'gpt-4o-mini-tts', voice: 'coral', input: 'Hello there', response_format: 'mp3' });
  await oa.synthesize('Hi', { voice: 'nova' });
  assert.equal(seen[1]!.body.voice, 'nova');

  const el = createTts(cfgWith({ TTS_PROVIDER: 'elevenlabs', ELEVENLABS_API_KEY: 'xi', ELEVENLABS_VOICE_ID: 'v123' }), { fetch: fakeFetch, log: quiet })!;
  await el.synthesize('Hello');
  assert.match(seen[2]!.url, /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/v123\?output_format=mp3/);
  assert.equal(seen[2]!.headers['xi-api-key'], 'xi');
  assert.equal(seen[2]!.body.text, 'Hello');

  status = 401;
  assert.equal(await oa.synthesize('Hello'), null);
  assert.equal(await oa.synthesize('   '), null);
  const throwing = createTts(cfgWith({ OPENAI_API_KEY: 'k', TTS_PROVIDER: 'openai' }), { fetch: async () => { throw new Error('x'); }, log: quiet })!;
  assert.equal(await throwing.synthesize('Hello'), null);
});
