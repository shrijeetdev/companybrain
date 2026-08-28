// Smoke end-to-end — boots the real app (the built bundle when present, else the source
// entrypoint) in password auth mode against a throwaway database, then checks the things
// that must never silently break in production:
//
//   1. the app boots and serves the UI
//   2. the served <script> parses (this UI is one big generated script; a stray quote in it
//      has shipped a blank screen before)
//   3. every tab's mount point is present in the shell
//   4. /api/* is 401 without a session, and /api/auth/users does not leak the roster
//   5. the bootstrap admin can log in, and an authenticated request then succeeds
//   6. a non-admin cannot reach the admin endpoints
//   7. security headers are set, /health answers, and /metrics is not public
//   8. production refuses to boot on the in-repo fallback encryption key
//
// Run: node scripts/smoke.mjs        (exits non-zero on the first failure)

import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.SMOKE_PORT ?? 4399);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_EMAIL = 'smoke-admin@example.com';
const ADMIN_PASSWORD = 'Sm0ke-Test-Admin-Passphrase';

const workDir = mkdtempSync(join(tmpdir(), 'companybrain-smoke-'));
const dbPath = join(workDir, 'smoke.sqlite');

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const useBundle = existsSync(new URL('../dist/server.js', import.meta.url));
const [cmd, args] = useBundle
  ? ['node', ['dist/server.js']]
  : ['npx', ['tsx', 'cli/bin/companybrain.ts']];

console.log(`smoke: booting ${useBundle ? 'dist/server.js' : 'cli/bin/companybrain.ts'} on ${BASE}`);
const child = spawn(cmd, args, {
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    COMPANYBRAIN_PORT: String(PORT),
    COMPANYBRAIN_HOST: '127.0.0.1',
    COMPANYBRAIN_NO_OPEN: '1',
    COMPANYBRAIN_DB_PATH: dbPath,
    COMPANYBRAIN_AUTH_MODE: 'password',
    COMPANYBRAIN_ADMIN_EMAIL: ADMIN_EMAIL,
    COMPANYBRAIN_ADMIN_PASSWORD: ADMIN_PASSWORD,
    COMPANYBRAIN_ADMIN_NAME: 'Smoke Admin',
    COMPANYBRAIN_BACKUP: 'off',
    COMPANYBRAIN_ENC_KEY: 'smoke-test-encryption-key-not-a-real-one',
    COMPANYBRAIN_LOG_LEVEL: 'warn',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
child.stdout.on('data', (d) => { serverOutput += d; });
child.stderr.on('data', (d) => { serverOutput += d; });

function cleanup() {
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
  try { rmSync(workDir, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.on('exit', cleanup);

async function waitForBoot(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early (code ${child.exitCode}):\n${serverOutput}`);
    try {
      const r = await fetch(BASE + '/', { redirect: 'manual' });
      if (r.status < 500) return;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server did not answer within ${timeoutMs}ms:\n${serverOutput}`);
}

try {
  await waitForBoot();

  // 1 + 7. The shell, the health endpoint, and the security headers.
  const page = await fetch(BASE + '/');
  const html = await page.text();
  check('GET / serves the UI', page.status === 200 && html.includes('companybrain'), `status ${page.status}`);
  check('X-Content-Type-Options is set', page.headers.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options is DENY', page.headers.get('x-frame-options') === 'DENY');
  check('Content-Security-Policy is set', (page.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'"));
  check('HSTS is set in production', (page.headers.get('strict-transport-security') ?? '').includes('max-age='));
  const health = await fetch(BASE + '/health');
  check('/health answers for load balancers', health.status === 200 && (await health.json()).ok === true, `status ${health.status}`);

  // 2. The generated script must parse. This is the check that catches a blank screen.
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  check('the page carries an inline script', scripts.length > 0);
  for (const [i, src] of scripts.entries()) {
    let ok = true, err = '';
    try { new Function(src); } catch (e) { ok = false; err = e.message; }
    check(`inline script block ${i} parses`, ok, err);
  }

  // 3. Every tab the nav offers has a mount point in the shell.
  // Internal tab ids, not the visible labels (the Pipeline tab is `leads`).
  for (const tab of ['home', 'loops', 'tasks', 'leads', 'projects', 'team', 'reports', 'settings', 'methods']) {
    check(`the ${tab} view renders`, html.includes(`tab==='${tab}'`), 'no render branch for this tab');
  }

  // 3b. /metrics sits outside /api/*, so it needs its own gate in production.
  const metrics = await fetch(BASE + '/metrics');
  check('/metrics is not public in production', metrics.status === 404, `status ${metrics.status}`);

  // 4. Unauthenticated access is refused, and the roster stays private.
  const noSession = await fetch(BASE + '/api/loops');
  check('/api/loops is 401 without a session', noSession.status === 401, `status ${noSession.status}`);
  const roster = await fetch(BASE + '/api/auth/users');
  const rosterBody = await roster.text();
  check('/api/auth/users does not reveal the roster', !rosterBody.includes(ADMIN_EMAIL), rosterBody.slice(0, 80));

  // 5. The bootstrap admin can log in and then read the API.
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: ADMIN_EMAIL, key: ADMIN_PASSWORD }),
  });
  check('bootstrap admin can log in', login.status === 200, `status ${login.status} ${(await login.clone().text()).slice(0, 80)}`);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  check('login sets a session cookie', cookie.startsWith('cb_session='), cookie.slice(0, 40));

  const authed = await fetch(BASE + '/api/loops', { headers: { cookie } });
  check('authenticated request succeeds', authed.status === 200, `status ${authed.status}`);

  const me = await fetch(BASE + '/api/auth/me', { headers: { cookie } });
  const meBody = me.status === 200 ? await me.json() : {};
  check('the session resolves to the ceo role', (meBody.user?.role ?? meBody.role) === 'ceo', JSON.stringify(meBody).slice(0, 80));

  // 6. A non-admin cannot reach the admin endpoints.
  const created = await fetch(BASE + '/api/admin/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'Smoke Member', email: 'smoke-member@example.com', role: 'employee', password: 'Member-Test-Passphrase-9' }),
  });
  check('admin can create a user', created.status === 200, `status ${created.status} ${(await created.clone().text()).slice(0, 80)}`);

  const memberLogin = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'smoke-member@example.com', key: 'Member-Test-Passphrase-9' }),
  });
  check('the created user can log in', memberLogin.status === 200, `status ${memberLogin.status}`);
  const memberCookie = (memberLogin.headers.get('set-cookie') ?? '').split(';')[0];
  const memberAdmin = await fetch(BASE + '/api/admin/users', { headers: { cookie: memberCookie } });
  check('a non-admin cannot reach /api/admin/users', memberAdmin.status === 403, `status ${memberAdmin.status}`);
  const memberKeys = await fetch(BASE + '/api/admin/keys', { headers: { cookie: memberCookie } });
  check('a non-admin cannot reach /api/admin/keys', memberKeys.status === 403, `status ${memberKeys.status}`);
  // 8. Production must refuse to run on the in-repo fallback encryption key.
  const guarded = await new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, NODE_ENV: 'production', COMPANYBRAIN_ENC_KEY: '', COMPANYBRAIN_PORT: String(PORT + 1), COMPANYBRAIN_HOST: '127.0.0.1', COMPANYBRAIN_NO_OPEN: '1', COMPANYBRAIN_DB_PATH: join(workDir, 'guard.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('exit', (code) => resolve({ code, out }));
    setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } resolve({ code: null, out }); }, 30_000);
  });
  check('production refuses to boot without COMPANYBRAIN_ENC_KEY',
    guarded.code === 1 && guarded.out.includes('COMPANYBRAIN_ENC_KEY'),
    `exit ${guarded.code}`);
} catch (err) {
  failures++;
  console.log(`  FAIL harness — ${err.message}`);
}

console.log(failures === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures} check(s))`);
if (failures > 0 && serverOutput.trim()) console.log('\n--- server output ---\n' + serverOutput.slice(-3000));
process.exit(failures === 0 ? 0 : 1);
