// End-to-end coverage for the v2 polish round: delete → undo, persisted subtask reorder (pointer +
// keyboard), touch drag on the mobile board, no theme flash, phone validation, OAuth consent copy.

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const WEB = { 'Content-Type': 'application/json', 'X-CB-Client': 'web' };

async function enter(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible({ timeout: 15_000 });
  return problems;
}

/** API calls through the signed-in context (no in-page fetch → no console noise for expected 404s). */
async function createTask(req: APIRequestContext, body: Record<string, unknown>) {
  const res = await req.post('/api/tasks', { headers: WEB, data: body });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { id: string; title: string; subtasks: { id: string; title: string }[] };
}
const taskStatus = async (req: APIRequestContext, id: string) => {
  const r = await req.get(`/api/tasks/${id}`);
  return r.status() === 404 ? 'gone' : ((await r.json()) as { status: string }).status;
};
const subtaskTitles = async (req: APIRequestContext, id: string) =>
  ((await (await req.get(`/api/tasks/${id}`)).json()) as { subtasks: { title: string }[] }).subtasks.map((s) => s.title).join(',');

test('deleting a task offers Undo, which restores it', async ({ page }) => {
  const problems = await enter(page);
  const title = `Delete me ${Date.now() % 100000}`;
  const t = await createTask(page.request, { title, priority: 'high' });
  await page.goto(`/tasks?task=${t.id}`);
  await expect(page.locator('.drawer')).toBeVisible();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /^Delete/ }).click();
  const toast = page.locator('.toast', { hasText: title });
  await expect(toast).toBeVisible();
  await expect.poll(() => taskStatus(page.request, t.id)).toBe('gone');
  await expect(page.locator(`button[aria-label="Complete “${title}”"]`)).toHaveCount(0);
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => taskStatus(page.request, t.id)).toBe('todo');
  await expect(page.locator('.toast', { hasText: /Restored/ })).toBeVisible();
  await expect(page.locator(`button[aria-label="Complete “${title}”"]`)).toBeVisible();
  expect(problems).toEqual([]);
});

test('subtasks reorder by drag and by keyboard, and the order is saved', async ({ page }, info) => {
  const problems = await enter(page);
  const t = await createTask(page.request, { title: `Reorder ${Date.now() % 100000}`, subtasks: [{ title: 'Alpha' }, { title: 'Bravo' }, { title: 'Charlie' }] });
  await page.goto(`/tasks?task=${t.id}`);
  const drawer = page.locator('.drawer');
  await expect(drawer.locator('[data-subtask-id]')).toHaveCount(3);

  // Keyboard: Alpha down twice → Bravo, Charlie, Alpha.
  const alphaGrip = drawer.getByRole('button', { name: /Reorder “Alpha”/ });
  await alphaGrip.focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => subtaskTitles(page.request, t.id)).toBe('Bravo,Alpha,Charlie');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => subtaskTitles(page.request, t.id)).toBe('Bravo,Charlie,Alpha');
  await expect(drawer.getByRole('button', { name: /Reorder “Alpha” \(position 3 of 3\)/ })).toBeFocused();

  if (info.project.name === 'desktop') {
    // Pointer drag on the grip: Alpha (last) back to the top (after the layout animation settles).
    await page.waitForTimeout(700);
    const grip = drawer.getByRole('button', { name: /Reorder “Alpha”/ });
    const first = drawer.locator('[data-subtask-id]').first();
    const from = (await grip.boundingBox())!;
    const to = (await first.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y - 6 - from.y) * i) / 12);
    await page.mouse.up();
    await expect.poll(() => subtaskTitles(page.request, t.id)).toBe('Alpha,Bravo,Charlie');
  }
  // Survives a reload (persisted, not just local state).
  await page.reload();
  const inputs = page.locator('.drawer [data-subtask-id] input');
  const expected = info.project.name === 'desktop' ? ['Alpha', 'Bravo', 'Charlie'] : ['Bravo', 'Charlie', 'Alpha'];
  await expect(inputs).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(inputs.nth(i)).toHaveValue(expected[i]!);
  expect(problems).toEqual([]);
});

test('board: Done column shows the last 7 days with a "Show older" toggle; priority filter is server-side', async ({ page }) => {
  const problems = await enter(page);
  const tag = `p${Date.now() % 100000}`;
  await createTask(page.request, { title: `Urgent ${tag}`, priority: 'urgent', tags: [tag] });
  await createTask(page.request, { title: `Low ${tag}`, priority: 'low', tags: [tag] });
  const listCalls: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/tasks?')) listCalls.push(r.url()); });
  await page.goto(`/tasks?view=board&tag=${tag}&priority=urgent`);
  await expect(page.locator('.board')).toBeVisible();
  await expect(page.getByText(`Urgent ${tag}`)).toBeVisible();
  await expect(page.getByText(`Low ${tag}`)).toHaveCount(0);
  await expect.poll(() => listCalls.some((u) => /priority=urgent/.test(u) && /completedSince=\d+/.test(u))).toBe(true);
  const done = page.locator('.board-col[data-status="done"]');
  await expect(done.getByText('Last 7 days', { exact: true })).toBeVisible();
  await done.getByRole('button', { name: 'Show older' }).click();
  await expect.poll(() => listCalls.some((u) => !/completedSince/.test(u) && /includeDone/.test(u))).toBe(true);
  await expect(done.getByRole('button', { name: /Only the last 7 days/i })).toBeVisible();
  expect(problems).toEqual([]);
});

test('mobile board: long-press a card and drag it to another column (auto-scrolls)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'touch drag is a phone interaction');
  const problems = await enter(page);
  const tag = `m${Date.now() % 100000}`;
  const t = await createTask(page.request, { title: `Touch ${tag}`, tags: [tag] });
  await page.goto(`/tasks?view=board&tag=${tag}`);
  const card = page.locator(`[data-card-id="${t.id}"]`);
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  const vw = page.viewportSize()!.width;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const x0 = box.x + box.width / 2;
  const y0 = box.y + Math.min(24, box.height / 2);
  // A quick swipe scrolls instead of dragging…
  // …but a long press picks the card up.
  await touch('touchStart', x0, y0);
  await page.waitForTimeout(600);
  await expect(page.locator('.card-ghost')).toBeVisible();
  // Drag to the right edge: the board auto-scrolls to the next column ("In progress").
  for (let i = 1; i <= 10; i++) await touch('touchMove', x0 + ((vw - 12 - x0) * i) / 10, y0);
  await expect.poll(async () => page.locator('.board').evaluate((el) => el.scrollLeft), { timeout: 5000 }).toBeGreaterThan(50);
  const inProgress = page.locator('.board-col[data-status="in_progress"]');
  await expect.poll(async () => {
    const b = await inProgress.boundingBox();
    return !!b && b.x < vw / 2 && b.x + b.width > vw / 2;
  }, { timeout: 8000 }).toBe(true);
  // Settle in the middle of "In progress" and drop.
  for (let i = 1; i <= 4; i++) await touch('touchMove', vw - 12 - ((vw / 2 - 12) * i) / 4, y0);
  await touch('touchEnd', vw / 2, y0);
  await expect.poll(() => taskStatus(page.request, t.id)).toBe('in_progress');
  await expect(page.locator('.card-ghost')).toHaveCount(0);

  // The card now lives only in "In progress"…
  await expect(page.locator(`[data-card-id="${t.id}"]`)).toHaveCount(1);
  await expect(inProgress.locator(`[data-card-id="${t.id}"]`)).toBeVisible();
  // …and a plain tap still opens it.
  await inProgress.locator(`[data-card-id="${t.id}"]`).tap();
  await expect(page.locator('.drawer')).toBeVisible();
  expect(problems).toEqual([]);
});

test('saved theme + light/dark are applied before the app script runs (no flash)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => { localStorage.setItem('cb.theme', 'classic'); localStorage.setItem('cb.mode', 'light'); });
  // Block the app bundle: whatever <html> says now came from /theme-init.js alone.
  await page.route(/\/assets\/index-[^/]+\.js$/, (r) => r.abort());
  const csp: string[] = [];
  page.on('response', (r) => { if (r.url().endsWith('/')) csp.push(r.headers()['content-security-policy'] ?? ''); });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  expect(csp.join(' ')).toContain("script-src 'self'");
  await page.unroute(/\/assets\/index-[^/]+\.js$/);
  await page.evaluate(() => { localStorage.removeItem('cb.theme'); localStorage.removeItem('cb.mode'); });
});

test('profile phone needs a country code (inline hint), server-normalized on save', async ({ page }) => {
  const problems = await enter(page);
  await page.goto('/settings/profile');
  const phone = page.getByLabel('WhatsApp number');
  await phone.fill('98200 11001');
  await phone.blur();
  await expect(page.getByText(/Start with \+ and your country code\. Include country code, e\.g\. \+91 98200 11001/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await phone.fill('+91 98200 11001');
  await expect(page.getByText(/Start with \+/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(phone).toHaveValue('+919820011001');
  await page.request.patch('/api/me', { headers: WEB, data: { phone: null } });
  expect(problems).toEqual([]);
});

test('OAuth consent shows "<app> wants to connect · <host>" and explains a bad request', async ({ page }) => {
  const problems = await enter(page);
  const reg = await page.request.post('/oauth/register', { data: { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] } });
  expect(reg.ok()).toBeTruthy();
  const { client_id } = (await reg.json()) as { client_id: string };
  // Missing PKCE → approve answers 400; the page must say what to do.
  const q = new URLSearchParams({ client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', response_type: 'code', state: 'xyz' });
  await page.goto(`/connect?${q}`);
  await expect(page.getByRole('heading', { name: /Claude wants to connect · claude\.ai/ })).toBeVisible();
  await page.getByRole('button', { name: /Approve/ }).click();
  await expect(page.locator('.auth-error')).toContainText(/no longer valid.*Go back to Claude and start connecting again/);
  expect(problems.filter((p) => !/status of 400/.test(p))).toEqual([]);
});
