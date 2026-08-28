// Model routing — action → OpenRouter slug, with env and per-task overrides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModel } from '../src/ai-router';

test('router: returns default for each action', () => {
  assert.equal(resolveModel('generate'), 'anthropic/claude-3.5-sonnet');
  assert.equal(resolveModel('publish_blog'), 'anthropic/claude-3.5-sonnet');
});

test('router: env override wins over default', () => {
  const prev = process.env.COMPANYBRAIN_AI_MODEL_GENERATE;
  process.env.COMPANYBRAIN_AI_MODEL_GENERATE = 'openai/gpt-4o-mini';
  assert.equal(resolveModel('generate'), 'openai/gpt-4o-mini');
  if (prev === undefined) delete process.env.COMPANYBRAIN_AI_MODEL_GENERATE; else process.env.COMPANYBRAIN_AI_MODEL_GENERATE = prev;
});

test('router: per-task override wins over env', () => {
  const prev = process.env.COMPANYBRAIN_AI_MODEL_GENERATE;
  process.env.COMPANYBRAIN_AI_MODEL_GENERATE = 'openai/gpt-4o-mini';
  assert.equal(resolveModel('generate', 'google/gemini-flash-1.5'), 'google/gemini-flash-1.5');
  if (prev === undefined) delete process.env.COMPANYBRAIN_AI_MODEL_GENERATE; else process.env.COMPANYBRAIN_AI_MODEL_GENERATE = prev;
});

test('router: blank overrides fall through to the default', () => {
  assert.equal(resolveModel('publish_blog', '   '), 'anthropic/claude-3.5-sonnet');
  assert.equal(resolveModel('publish_blog', null, { COMPANYBRAIN_AI_MODEL_PUBLISH_BLOG: '  ' }), 'anthropic/claude-3.5-sonnet');
});
