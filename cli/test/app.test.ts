// Full-stack integration test: the real app (db + core + game + integrations + mcp + server)
// assembled by createApp(), listening on a random port, driven over HTTP like a browser,
// Claude (OAuth + MCP) and the WhatsApp/email webhooks would.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Outbound } from '@companybrain/types';
import { createApp, type App } from '../src/app';

const dataDir = mkdtempSync(join(tmpdir(), 'cb-it-'));
let now = Date.UTC(2026, 9, 12, 4, 30); // Mon 12 Oct 2026, 10:00 IST
const clock = () => now;
const sent: { channel: string; to: string; text: string }[] = [];
const outbound: Outbound = {
  async whatsapp(to, text) { sent.push({ channel: 'whatsapp', to, text }); return true; },
  async email(to, subject, text) { sent.push({ channel: 'email', to, text: `${subject}\n${text}` }); return true; },
  async push() { return 'sent'; },
  status: () => ({ whatsapp: true, email: true, push: true }),
};
const APP_SECRET = 'wa-app-secret';
const EMAIL_SECRET = 'email-hook-secret';

let app: App;
let B = '';
let cookie = '';

before(async () => {
  app = await createApp({
    env: {
      WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_ACCESS_TOKEN: 'x', WHATSAPP_VERIFY_TOKEN: 'verify', WHATSAPP_APP_SECRET: APP_SECRET,
      EMAIL_WEBHOOK_SECRET: EMAIL_SECRET, COMPANYBRAIN_LOG_LEVEL: 'silent',
    },
    dbPath: join(dataDir, 'cb.sqlite'),
    dataDir,
    webDir: null,
    clock,
    outbound,
    log: { info() {}, warn() {}, error() {} },
  });
  await app.server.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.server.address();
  B = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

after(async () => {
  await app.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

type Res = { status: number; json: any; headers: Headers };
async function api(method: string, path: string, body?: unknown, o: { auth?: 'cookie' | null | string; form?: boolean; headers?: Record<string, string> } = {}): Promise<Res> {
  const auth = o.auth === undefined ? 'cookie' : o.auth;
  const h: Record<string, string> = { ...(o.headers ?? {}) };
  let payload: string | undefined;
  if (body !== undefined) {
    if (o.form) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body as Record<string, string>).toString(); }
    else { h['content-type'] ??= 'application/json'; payload = typeof body === 'string' ? body : JSON.stringify(body); }
  }
  if (auth === 'cookie' && cookie) { h.cookie = cookie; if (method !== 'GET') h['x-cb-client'] = 'web'; }
  else if (auth && auth !== 'cookie') h.authorization = auth;
  const res = await fetch(B + path, { method, headers: h, body: payload, redirect: 'manual' });
  const sc = res.headers.get('set-cookie');
  if (sc?.startsWith('cb_session=')) cookie = sc.split(';')[0]!;
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { const m = text.match(/data: (.*)/); json = m ? JSON.parse(m[1]!) : text; }
  return { status: res.status, json, headers: res.headers };
}
const mcp = (auth: string, method: string, params: unknown, path = '/mcp') =>
  api('POST', path, { jsonrpc: '2.0', id: 1, method, params }, { auth, headers: { accept: 'application/json, text/event-stream' } });
const toolText = (r: Res) => JSON.stringify(r.json.result ?? r.json);

const ctx: Record<string, any> = {};

test('first-run setup, then setup is closed', async () => {
  let r = await api('GET', '/api/auth/state', undefined, { auth: null });
  assert.equal(r.json.needsSetup, true);
  r = await api('POST', '/api/auth/setup', { orgName: 'Vexocore', name: 'Shrijeet', email: 'shrijeet@vexocore.test', password: 'Sup3r-secret!', timezone: 'Asia/Kolkata' }, { auth: null });
  assert.equal(r.status, 200);
  assert.ok(cookie);
  r = await api('POST', '/api/auth/setup', { orgName: 'X', name: 'X', email: 'x@x.test', password: 'Sup3r-secret!', timezone: 'UTC' }, { auth: null });
  assert.ok(r.status >= 400);
  ctx.me = (await api('GET', '/api/me')).json;
  assert.equal(ctx.me.role, 'owner');
  assert.equal(ctx.me.prefs.theme, 'tactical');
});

test('auth cannot be bypassed and cookie mutations need the CSRF header', async () => {
  for (const p of ['/%61pi/me', '/api/./me', '/API/me', '//api/me', '/api/me/']) {
    const r = await api('GET', p, undefined, { auth: null });
    assert.ok(r.status === 401 || r.status === 404, `${p} → ${r.status}`);
  }
  const res = await fetch(B + '/api/tasks', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"title":"x"}' });
  assert.equal(res.status, 403);
});

test('team: human member, AI agent, project', async () => {
  const priya = await api('POST', '/api/members', { kind: 'human', role: 'member', name: 'Priya Sharma', email: 'priya@vexocore.test', password: 'Priya-pass-123', timezone: 'Asia/Kolkata', phone: '+919811112222' });
  assert.equal(priya.status, 200);
  const claude = await api('POST', '/api/members', { kind: 'agent', role: 'agent', name: 'Claude', agent: { provider: 'claude', description: 'Writes', supervisorId: ctx.me.id } });
  assert.equal(claude.json.kind, 'agent');
  const proj = await api('POST', '/api/projects', { name: 'Website', emoji: '🌐', color: '#22D3EE', memberIds: [ctx.me.id, priya.json.id, claude.json.id] });
  assert.equal(proj.status, 200);
  Object.assign(ctx, { priya: priya.json, claude: claude.json, proj: proj.json });
});

test('natural-language quick add resolves people, project, priority and due time', async () => {
  const text = 'Send Acme proposal tomorrow 5pm @priya #website !high';
  const prev = await api('POST', '/api/tasks/preview', { text });
  assert.deepEqual(prev.json.draft.assigneeIds, [ctx.priya.id]);
  assert.equal(prev.json.draft.projectId, ctx.proj.id);
  const t = await api('POST', '/api/tasks/quick', { text });
  assert.equal(t.json.title, 'Send Acme proposal');
  assert.equal(t.json.priority, 'high');
  assert.equal(t.json.dueAt, Date.UTC(2026, 9, 13, 11, 30)); // 17:00 IST tomorrow
  const t2 = await api('POST', '/api/tasks/quick', { text: 'Draft launch blog post @claude #website !urgent by friday' });
  assert.deepEqual(t2.json.assigneeIds, [ctx.claude.id]);
  Object.assign(ctx, { acme: t.json, blog: t2.json });
});

test('completing a mission awards XP, updates the HUD; reopen revokes', async () => {
  const t = await api('POST', '/api/tasks', { title: 'Review Q3 numbers', priority: 'medium', dueAt: now + 3600_000 });
  now += 10 * 60_000; // past the anti-farm window
  const done = await api('POST', `/api/tasks/${t.json.id}/complete`);
  assert.equal(done.json.status, 'done');
  const rewards = (await api('GET', '/api/game/rewards?limit=20')).json as any[];
  assert.ok(rewards.some((r) => r.taskId === t.json.id && r.kind === 'mission_complete' && r.xp > 0));
  const hud = (await api('GET', '/api/game/hud')).json;
  assert.ok(hud.profile.xp > 0);
  assert.equal(typeof hud.today.pct, 'number');
  const xpBefore = hud.profile.xp;
  await api('POST', `/api/tasks/${t.json.id}/reopen`);
  const hud2 = (await api('GET', '/api/game/hud')).json;
  assert.ok(hud2.profile.xp < xpBefore, 'reopen revokes XP');
});

test('spoken briefing uses the tactical voice', async () => {
  const br = (await api('GET', '/api/briefing')).json;
  assert.match(br.spoken, /Commander Shrijeet/);
  assert.ok(br.myTasks);
});

test('AI agent over MCP: memory restore, progress note, completion with XP', async () => {
  const key = await api('POST', '/api/keys', { memberId: ctx.claude.id, name: 'Claude key', scopes: ['read', 'write'] });
  assert.match(key.json.raw, /^cb_live_/);
  const auth = `Bearer ${key.json.raw}`;
  const init = await mcp(auth, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'it', version: '1' } });
  assert.equal(init.json.result.serverInfo.name, 'companybrain');
  const tools = await mcp(auth, 'tools/list', {});
  assert.ok(tools.json.result.tools.length >= 16);
  assert.match(toolText(await mcp(auth, 'tools/call', { name: 'get_my_work', arguments: {} })), /Draft launch blog post/);
  const note = await mcp(auth, 'tools/call', { name: 'add_comment', arguments: { taskId: ctx.blog.id, text: 'Outline done.' } });
  assert.notEqual(note.json.result.isError, true, toolText(note));
  const comp = await mcp(auth, 'tools/call', { name: 'complete_task', arguments: { taskId: ctx.blog.id } });
  assert.match(toolText(comp), /XP/);
  const viaUrl = await mcp('', 'tools/list', {}, `/mcp/k/${key.json.raw}`);
  assert.equal(viaUrl.status, 200);
  const noKey = await api('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { auth: null });
  assert.equal(noKey.status, 401);
  assert.match(noKey.headers.get('www-authenticate') ?? '', /resource_metadata=/);
});

test('OAuth one-paste connect (what Claude.ai does)', async () => {
  const prm = await api('GET', '/.well-known/oauth-protected-resource', undefined, { auth: null });
  assert.match(prm.json.resource, /\/mcp$/);
  const reg = await api('POST', '/oauth/register', { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }, { auth: null });
  assert.ok(reg.json.client_id);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = { response_type: 'code', client_id: reg.json.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'read write' };
  const authz = await fetch(`${B}/oauth/authorize?${new URLSearchParams(q)}`, { redirect: 'manual' });
  assert.equal(authz.status, 302);
  assert.match(authz.headers.get('location') ?? '', /^\/connect\?/);
  const appr = await api('POST', '/api/oauth/approve', { query: q, scopes: ['read', 'write'], actAs: ctx.me.id, approve: true });
  const code = new URL(appr.json.redirectTo).searchParams.get('code')!;
  const form = { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: reg.json.client_id, redirect_uri: q.redirect_uri };
  const tok = await api('POST', '/oauth/token', form, { auth: null, form: true });
  assert.ok(tok.json.access_token);
  const stats = await mcp(`Bearer ${tok.json.access_token}`, 'tools/call', { name: 'get_my_stats', arguments: {} });
  assert.notEqual(stats.json.result.isError, true, toolText(stats));
  assert.equal((await api('POST', '/oauth/token', form, { auth: null, form: true })).status, 400, 'code is single-use');
});

test('WhatsApp: a team member messages the bot → task for them + confirmation reply', async () => {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      contacts: [{ wa_id: '919811112222', profile: { name: 'Priya' } }],
      messages: [{ from: '919811112222', id: 'wamid.TEST1', timestamp: String(Math.floor(now / 1000)), type: 'text', text: { body: 'call the printer tomorrow 11am !high' } }],
    } }] }],
  });
  const sig = 'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex');
  const bad = await api('POST', '/webhooks/whatsapp', body, { auth: null, headers: { 'x-hub-signature-256': 'sha256=deadbeef' } });
  assert.equal(bad.status, 401, 'unsigned webhook rejected');
  const ok = await api('POST', '/webhooks/whatsapp', body, { auth: null, headers: { 'x-hub-signature-256': sig } });
  assert.equal(ok.status, 200);
  await new Promise((r) => setTimeout(r, 100));
  const tasks = (await api('GET', '/api/tasks?view=all&search=printer')).json as any[];
  const t = tasks.find((x) => /printer/i.test(x.title));
  assert.ok(t, 'task created from WhatsApp');
  assert.deepEqual(t.assigneeIds, [ctx.priya.id]);
  assert.equal(t.source.channel, 'whatsapp');
  assert.ok(sent.some((s) => s.channel === 'whatsapp' && /printer/i.test(s.text)), 'confirmation reply sent');
});

test('email webhook: unknown sender lands in the Inbox; secret required', async () => {
  const payload = { from: 'Raj <raj@client.test>', to: 'tasks@vexocore.test', subject: 'Invoice question', text: 'Can you send the revised invoice by Friday?', messageId: '<m1@client.test>' };
  assert.equal((await api('POST', '/webhooks/email', payload, { auth: null })).status, 401);
  const r = await api('POST', '/webhooks/email', payload, { auth: null, headers: { 'x-cb-webhook-secret': EMAIL_SECRET } });
  assert.equal(r.status, 200);
  await new Promise((res) => setTimeout(res, 100));
  const inbox = (await api('GET', '/api/inbox?status=new')).json as any[];
  const item = inbox.find((i) => i.from.includes('raj@client.test'));
  assert.ok(item, 'inbox item created');
  const conv = await api('POST', `/api/inbox/${item.id}/convert`, {});
  assert.equal(conv.status, 200);
});

test('reminders fire from the persistent scheduler (fake clock)', async () => {
  const t = await api('POST', '/api/tasks', { title: 'Pay vendor', dueAt: now + 2 * 3600_000, assigneeIds: [ctx.me.id] });
  assert.equal(t.status, 200);
  now += 90 * 60_000; // 30 min before due → the 60-min reminder is due
  await app.core.scheduler.tick();
  let notes = (await api('GET', '/api/notifications')).json as any[];
  assert.ok(notes.some((n) => n.taskId === t.json.id && n.kind === 'task_due_soon'), JSON.stringify(notes.map((n) => [n.kind, n.title])));
  now += 2 * 3600_000; // well past due
  await app.core.scheduler.tick();
  await app.core.scheduler.tick();
  notes = (await api('GET', '/api/notifications')).json as any[];
  assert.ok(notes.some((n) => n.taskId === t.json.id && n.kind === 'task_overdue'), JSON.stringify(notes.map((n) => [n.kind, n.title])));
});

test('roles: a member sees their work but cannot change the org; logout ends the session', async () => {
  assert.equal((await api('POST', '/api/auth/logout')).status, 200);
  assert.equal((await api('GET', '/api/me')).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'priya@vexocore.test', password: 'Priya-pass-123' }, { auth: null })).status, 200);
  const mine = (await api('GET', '/api/tasks?assigneeId=me')).json as any[];
  assert.ok(mine.some((t) => t.id === ctx.acme.id));
  assert.equal((await api('PATCH', '/api/org', { name: 'Hacked' })).status, 403);
  assert.equal((await api('PUT', '/api/org', { name: 'Hacked' })).status === 200, false);
});

test('public docs: OpenAPI for any agent platform', async () => {
  const oa = await api('GET', '/api/openapi.json', undefined, { auth: null });
  assert.ok(Object.keys(oa.json.paths).length > 40);
});
