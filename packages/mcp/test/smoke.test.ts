// Smoke test: the MCP registry exposes the full tool surface cleanly. We can't easily
// spawn the tsx bin cross-platform in a test, so we assert the registry contract — the
// thing that would break loudly if a tool were dropped or mis-shaped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '@companybrain/mcp';

test('smoke: MCP exposes 11 tools', () => {
  const names = TOOLS.map((t) => t.name).sort();
  assert.equal(names.length, 11);
  assert.ok(names.includes('create_loop'));
  assert.ok(names.includes('get_dashboard'));
});

test('smoke: every tool has name, description, inputSchema, handler', () => {
  for (const t of TOOLS) {
    assert.ok(typeof t.name === 'string' && t.name.length > 0);
    assert.ok(typeof t.description === 'string' && t.description.length > 0);
    assert.ok(typeof t.inputSchema === 'object');
    assert.equal(typeof t.handler, 'function');
  }
});
