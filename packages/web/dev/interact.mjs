// Interaction screenshots: drawer, palette, quick-add preview, completion FX, level-up, crate, notifications, consent.
//   node packages/web/dev/interact.mjs --out <dir> [--theme tactical|classic] [--mode dark|light] [--vp desktop|mobile] [--only a,b]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
const base = args.base ?? 'http://localhost:5173';
const out = args.out ?? './shots';
const theme = args.theme ?? 'tactical';
const mode = args.mode ?? 'dark';
const vp = args.vp ?? 'desktop';
const only = args.only ? args.only.split(',') : null;
mkdirSync(out, { recursive: true });
const want = (k) => !only || only.includes(k);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: vp === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: Number(args.dpr ?? (vp === 'mobile' ? 2 : 1)), colorScheme: mode, isMobile: vp === 'mobile', hasTouch: vp === 'mobile' });
const page = await ctx.newPage();
let errors = 0;
page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('console.error:', m.text()); } });
page.on('pageerror', (e) => { errors++; console.log('pageerror:', e.message); });
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}-${theme}-${mode}-${vp}.png` }); console.log('shot', name); };

await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForSelector('input[type=email], .app');
await page.waitForTimeout(600);
if (await page.locator('input[type=email]').count()) {
  await page.fill('input[type=email]', 'owner@vexocore.test');
  await page.fill('input[type=password]', 'demo1234');
  await page.click('button[type=submit], button:has-text("Deploy"), button:has-text("Sign in")');
  await page.waitForSelector('.app');
}
await page.evaluate(async (t) => {
  await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CB-Client': 'web' }, body: JSON.stringify({ prefs: { theme: t, briefingVoice: 'button' } }) });
  localStorage.setItem('cb.theme', t);
}, theme);

if (want('drawer')) {
  await page.goto(base + '/tasks', { waitUntil: 'load' });
  await page.waitForSelector('.task-row');
  await page.waitForTimeout(500);
  await page.locator('.task-row').first().click();
  await page.waitForSelector('.drawer');
  await page.waitForTimeout(900);
  await shot('drawer');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
if (want('palette')) {
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForSelector('.hero');
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+k');
  await page.waitForSelector('.palette input');
  await page.keyboard.type('acme');
  await page.waitForTimeout(700);
  await shot('palette');
  await page.keyboard.press('Escape');
}
if (want('quickadd')) {
  await page.goto(base + '/tasks', { waitUntil: 'load' });
  await page.waitForSelector('.quickadd input');
  await page.fill('.quickadd input', 'Send Acme proposal tomorrow 5pm @priya #website !high every monday');
  await page.waitForTimeout(900);
  await shot('quickadd');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);
  await shot('deploy');
  await page.waitForTimeout(1500);
}
if (want('notifications')) {
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForSelector('.hero');
  await page.click('button[aria-label^="Notifications"]');
  await page.waitForTimeout(700);
  await shot('notifications');
  await page.keyboard.press('Escape');
}
if (want('complete')) {
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForSelector('.day-section .task-row');
  await page.waitForTimeout(1200);
  const row = page.locator('.day-section.critical .task-row').first();
  await row.locator('.check').first().click();
  await page.waitForTimeout(260);
  await shot('complete-hit');
  await page.waitForTimeout(700);
  await shot('complete-xp');
  await page.waitForTimeout(1300);
  await shot('levelup');
  await page.waitForTimeout(3500);
}
if (want('sector')) {
  // Clear everything due today except one, then complete the last one in the UI.
  await page.evaluate(async () => {
    const h = { 'Content-Type': 'application/json', 'X-CB-Client': 'web' };
    const list = await (await fetch('/api/tasks?assigneeId=me&view=today')).json();
    for (const t of list.slice(1)) await fetch(`/api/tasks/${t.id}/complete`, { method: 'POST', headers: h, body: '{}' });
    localStorage.removeItem(Object.keys(localStorage).find((k) => k.startsWith('cb.sector.')) ?? 'x');
  });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForSelector('.day-section .task-row');
  await page.waitForTimeout(1200);
  await page.locator('.day-section .task-row .check').first().click();
  await page.waitForTimeout(2600);
  await shot('sector');
  await page.waitForTimeout(4500);
}
if (want('crate')) {
  await page.goto(base + '/armory', { waitUntil: 'load' });
  await page.waitForSelector('.crate-card');
  await page.waitForTimeout(600);
  await page.locator('.crate-card:not(.opened)').first().click();
  await page.waitForSelector('.crate-stage');
  await page.waitForTimeout(500);
  await shot('crate-ready');
  await page.click('.crate-stage button:has-text("Open crate")');
  await page.waitForTimeout(500);
  await shot('crate-shake');
  await page.waitForTimeout(1400);
  await shot('crate-reveal');
  await page.keyboard.press('Escape');
}
if (want('fab') && vp === 'mobile') {
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForSelector('.fab');
  await page.waitForTimeout(600);
  await page.click('.fab');
  await page.waitForSelector('.modal .quickadd input');
  await page.keyboard.type('Call Raj tomorrow 3pm #launch !urgent');
  await page.waitForTimeout(900);
  await shot('fab-quickadd');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.click('.tabbar button[aria-label="More"]');
  await page.waitForTimeout(700);
  await shot('more');
  await page.keyboard.press('Escape');
}
if (want('connect')) {
  await page.goto(base + '/connect?client_id=claude-abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=xyz&code_challenge=abc&code_challenge_method=S256&response_type=code', { waitUntil: 'load' });
  await page.waitForSelector('.connect-card');
  await page.waitForTimeout(1200);
  await shot('connect');
}
if (want('board-drag') && vp === 'desktop') {
  await page.goto(base + '/tasks?view=board', { waitUntil: 'load' });
  await page.waitForSelector('.card');
  await page.waitForTimeout(800);
  const card = page.locator('.board-col').first().locator('.card').nth(2);
  const box = await card.boundingBox();
  const target = await page.locator('.board-col').nth(1).boundingBox();
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 40, { steps: 4 });
  await page.mouse.move(target.x + 60, target.y + 120, { steps: 12 });
  await page.waitForTimeout(400);
  await shot('board-drag');
  await page.mouse.up();
  await page.waitForTimeout(800);
}
await browser.close();
console.log(`done, ${errors} console errors`);
