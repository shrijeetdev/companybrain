// Screenshot harness for visual iteration (not part of the build).
//   node packages/web/dev/shoot.mjs --out <dir> [--base http://localhost:5173] [--routes /,/tasks] [--themes tactical,classic]
//        [--modes dark,light] [--vp desktop,mobile] [--full] [--wait 900] [--logout]
// Logs in as the mock owner, sets the theme via PATCH /api/me, captures PNGs and prints console errors.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
const base = args.base ?? 'http://localhost:5173';
const out = args.out ?? './shots';
const routes = (args.routes ?? '/').split(',');
const themes = (args.themes ?? 'tactical').split(',');
const modes = (args.modes ?? 'dark').split(',');
const vps = (args.vp ?? 'desktop').split(',');
const wait = Number(args.wait ?? 1200);
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
let errors = 0;
for (const vp of vps) {
  for (const mode of modes) {
    const vw = VIEWPORTS[vp].width;
    const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: Number(args.dpr ?? (vp === 'mobile' ? 2 : 1)), colorScheme: mode, isMobile: vp === 'mobile', hasTouch: vp === 'mobile', reducedMotion: args.reduced ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { errors += m.type() === 'error' ? 1 : 0; console.log(`[${vp}/${mode}] console.${m.type()}: ${m.text()}`); } });
    page.on('pageerror', (e) => { errors++; console.log(`[${vp}/${mode}] pageerror: ${e.message}`); });
    if (args.logout !== 'true') {
      await page.goto(base + '/', { waitUntil: 'load' });
      await page.waitForSelector('input[type=email], .app', { timeout: 15000 });
      await page.waitForTimeout(800);
      if (await page.locator('input[type=email]').count()) {
        await page.fill('input[type=email]', 'owner@vexocore.test');
        await page.fill('input[type=password]', 'demo1234');
        await page.click('button:has-text("Deploy"), button:has-text("Sign in")');
        await page.waitForSelector('.app', { timeout: 10000 });
      }
    }
    for (const theme of themes) {
      if (args.logout !== 'true') {
        await page.evaluate(async (t) => {
          await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CB-Client': 'web' }, body: JSON.stringify({ prefs: { theme: t, briefingVoice: 'button' } }) });
          localStorage.setItem('cb.theme', t);
        }, theme);
      } else {
        await page.goto(base + '/', { waitUntil: 'load' });
        await page.evaluate((t) => localStorage.setItem('cb.theme', t), theme);
      }
      for (const r of routes) {
        await page.goto(base + r, { waitUntil: 'load' });
        await page.waitForTimeout(wait);
        const name = `${args.logout === 'true' ? 'auth-' : ''}${(r === '/' ? 'home' : r.replace(/^\//, '').replace(/[/?=&]/g, '_'))}-${theme}-${mode}-${vp}.png`;
        const over = await page.evaluate((w) => {
          const bad = [];
          for (const el of document.querySelectorAll('#main *')) {
            const r = el.getBoundingClientRect();
            if (r.width && r.right > w + 1 && !el.closest('.board, .filter-scroll, .settings-nav, .cal, .chart-wrap, [style*="overflow"]')) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} → ${Math.round(r.right)}`);
          }
          if (document.documentElement.scrollWidth > w + 1) bad.unshift(`document ${document.documentElement.scrollWidth}px`);
          return bad.slice(0, 4);
        }, vw);
        if (over.length) console.log(`  OVERFLOW ${r}:`, over.join(' | '));
        await page.screenshot({ path: `${out}/${name}`, fullPage: args.full === 'true' });
        console.log('shot', name);
      }
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`done, ${errors} console errors`);
