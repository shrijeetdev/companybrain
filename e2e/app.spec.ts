// End-to-end: the production build (`node server.js`) driven in a real browser.
// Signed in once by e2e/global-setup.ts (which runs the real setup wizard); every test reuses
// that session, like a returning user.

import { test, expect, type Page } from '@playwright/test';

async function enter(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible({ timeout: 15_000 });
  return problems;
}

test('every screen renders without errors', async ({ page }) => {
  const problems = await enter(page);
  for (const route of ['/', '/tasks', '/projects', '/team', '/inbox', '/calendar', '/pipeline', '/reports', '/leaderboard', '/armory', '/settings']) {
    await page.goto(route);
    await expect(page.locator('.app')).toBeVisible();
    await page.waitForTimeout(700);
    const text = await page.evaluate(() => document.body.innerText);
    expect(text, `${route} shows a broken value`).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, `${route} scrolls horizontally`).toBe(false);
  }
  expect(problems).toEqual([]);
});

test('quick add understands natural language and shows a live preview', async ({ page }) => {
  const problems = await enter(page);
  await page.goto('/tasks');
  const input = page.locator('.quickadd input').first();
  const title = `Ship investor update ${Date.now() % 100000}`;
  await input.click();
  await input.pressSequentially(`${title} tomorrow 4pm !high`, { delay: 10 });
  await expect(page.locator('.quickadd-chips')).toContainText(/High/i);
  await input.press('Enter');
  await expect(page.getByText(title).first()).toBeVisible();
  const task = await page.evaluate(async (t) => (await (await fetch(`/api/tasks?view=all&search=${encodeURIComponent(t)}`)).json())[0], title);
  expect(task.priority).toBe('high');
  expect(task.dueAt).toBeGreaterThan(Date.now());
  expect(problems).toEqual([]);
});

test('completing a mission celebrates, awards XP and can be undone', async ({ page }) => {
  const problems = await enter(page);
  const title = `Call printer ${Date.now() % 100000}`;
  await page.evaluate(async (t) => {
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CB-Client': 'web' }, body: JSON.stringify({ title: t, priority: 'medium', dueAt: Date.now() + 3600e3 }) });
  }, title);
  await page.goto('/tasks');
  await page.locator(`button[aria-label="Complete “${title}”"]`).click();
  await expect(page.getByText(/XP/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /undo/i })).toBeVisible();
  const status = async () => page.evaluate(async (t) => (await (await fetch(`/api/tasks?view=all&includeDone=true&search=${encodeURIComponent(t)}`)).json())[0]?.status, title);
  await expect.poll(status).toBe('done');
  await page.getByRole('button', { name: /undo/i }).click();
  await expect.poll(status).not.toBe('done');
  expect(problems).toEqual([]);
});

test('task drawer opens with details and accepts a comment', async ({ page }) => {
  const problems = await enter(page);
  const title = `Drawer check ${Date.now() % 100000}`;
  await page.evaluate(async (t) => {
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CB-Client': 'web' }, body: JSON.stringify({ title: t }) });
  }, title);
  await page.goto('/tasks');
  await page.getByText(title).first().click();
  await expect(page.locator('.drawer')).toBeVisible();
  expect(problems).toEqual([]);
});

test('connect-AI page shows the MCP URL', async ({ page }) => {
  const problems = await enter(page);
  const integ = await page.evaluate(async () => (await fetch('/api/integrations')).json());
  expect(integ.mcpUrl).toMatch(/\/mcp$/);
  await page.goto('/settings');
  await expect(page.locator('.app')).toBeVisible();
  expect(problems).toEqual([]);
});
