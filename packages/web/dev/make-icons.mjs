// Renders the PWA icons (🧠 on the tactical navy tile with an amber/cyan glow) to public/icons.
//   node packages/web/dev/make-icons.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(dir, { recursive: true });

const tile = (size, { maskable = false, radius = 0.22 } = {}) => `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;border-radius:${maskable ? 0 : size * radius}px;overflow:hidden;position:relative;
  background:radial-gradient(circle at 30% 20%, rgba(255,176,32,.55), transparent 55%), radial-gradient(circle at 80% 90%, rgba(34,211,238,.45), transparent 55%), linear-gradient(145deg,#16243a,#070b12);
  display:grid;place-items:center;box-shadow:inset 0 0 0 ${Math.max(1, size * 0.012)}px rgba(255,176,32,.55)">
  <span style="font-family:'Noto Color Emoji';font-size:${size * (maskable ? 0.46 : 0.6)}px;line-height:1;filter:drop-shadow(0 ${size * 0.02}px ${size * 0.04}px rgba(0,0,0,.5))">🧠</span>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
for (const [name, size, opts] of [['icon-192.png', 192, {}], ['icon-512.png', 512, {}], ['icon-maskable-512.png', 512, { maskable: true }], ['apple-touch-icon.png', 180, { maskable: true }], ['favicon-32.png', 32, { radius: 0.25 }]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(tile(size, opts));
  await page.waitForTimeout(100);
  await page.screenshot({ path: dir + name, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}
await browser.close();

writeFileSync(dir + 'icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16243a"/><stop offset="1" stop-color="#070b12"/></linearGradient>
    <radialGradient id="a" cx=".3" cy=".2" r=".6"><stop offset="0" stop-color="#ffb020" stop-opacity=".55"/><stop offset="1" stop-color="#ffb020" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#b)"/>
  <rect width="64" height="64" rx="14" fill="url(#a)"/>
  <rect x=".5" y=".5" width="63" height="63" rx="13.5" fill="none" stroke="#ffb020" stroke-opacity=".55"/>
  <text x="32" y="44" font-size="36" text-anchor="middle">🧠</text>
</svg>
`);
console.log('wrote icon.svg');
