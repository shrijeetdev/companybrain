// Runs once before all e2e tests: completes first-run setup through the real wizard (or logs in
// if a previous run already did), seeds a teammate, an AI agent and a project, and saves the
// signed-in browser state so every test starts authenticated — exactly like a returning user.

import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const STATE_FILE = 'e2e/.auth/state.json';
export const OWNER = { email: 'commander@vexocore.test', password: 'Sup3r-secret!' };

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ baseURL });
  await page.goto('/');
  const state = await page.evaluate(async () => (await fetch('/api/auth/state')).json());
  if (state.needsSetup) {
    await page.fill('input[placeholder="Vexocore"]', 'Vexocore');
    await page.click('button.btn-primary');
    await page.fill('input[autocomplete="name"]', 'Shrijeet');
    await page.fill('input[type=email]', OWNER.email);
    await page.fill('input[type=password]', OWNER.password);
    await page.click('button.btn-primary');
  } else {
    await page.fill('input[type=email]', OWNER.email);
    await page.fill('input[type=password]', OWNER.password);
    await page.click('button.btn-primary');
  }
  await page.waitForSelector('.app', { timeout: 20_000 });
  await page.evaluate(async () => {
    const H = { 'Content-Type': 'application/json', 'X-CB-Client': 'web' };
    const members = await (await fetch('/api/members')).json();
    if (!members.some((m: { name: string }) => m.name === 'Priya Sharma')) {
      await fetch('/api/members', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'human', role: 'member', name: 'Priya Sharma', email: 'priya@vexocore.test', password: 'Passw0rd-123', timezone: 'UTC' }) });
      await fetch('/api/members', { method: 'POST', headers: H, body: JSON.stringify({ kind: 'agent', role: 'agent', name: 'Claude', agent: { provider: 'claude' } }) });
      await fetch('/api/projects', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Website' }) });
    }
    // Keep the briefing from auto-speaking in headless runs.
    await fetch('/api/me', { method: 'PATCH', headers: H, body: JSON.stringify({ prefs: { briefingVoice: 'button' } }) });
  });
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  await page.context().storageState({ path: STATE_FILE });
  await browser.close();
}
