import { expect, test, type Browser, type Page } from '@playwright/test';
import { todayIST } from '../../src/lib/period';

// WRITES DATA (E2E_ALLOW_WRITES=1, non-production branch only). Creates a project and brand-new
// throwaway accounts (`e2e-join-…@example.com`) through the real sign-up form.

test.describe.configure({ mode: 'serial' });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
let projectId = '';

async function freshUser(browser: Browser, baseURL: string): Promise<Page> {
  // A clean context: no admin session, like someone opening the link from WhatsApp.
  // Explicit empty storage: newContext() would otherwise inherit the project's signed-in admin state.
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    storageState: { cookies: [], origins: [] },
  });
  return context.newPage();
}

async function signUpFromInvite(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole('link', { name: 'Continue with email' }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole('tab', { name: 'Sign up' }).click();
  await page.getByLabel('Name').fill('E2E Joiner');
  await page.getByLabel('Email').fill(`e2e-join-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`);
  await page.getByLabel('Password').fill(`Pw-${Math.random().toString(36).slice(2)}-x9`);
  await page.getByRole('button', { name: 'Create account' }).click();
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/projects', { data: { name: `E2E invite ${stamp}`, startDate: todayIST() } });
  expect(res.status()).toBe(201);
  projectId = (await res.json()).project.id;
});

test.afterAll(async ({ request }) => {
  if (projectId) await request.patch(`/api/projects/${projectId}`, { data: { status: 'completed' } });
});

test('a new person joins through a shared link: email sign-up returns them and joins automatically', async ({
  request,
  browser,
  baseURL,
}) => {
  const created = await request.post(`/api/projects/${projectId}/invite-links`, { data: { role: 'viewer' } });
  expect(created.status()).toBe(201);
  const { path, link } = await created.json();
  expect(path).toMatch(/^\/invite\/[A-Za-z0-9_-]{43}$/);

  const listed = await (await request.get(`/api/projects/${projectId}/invite-links`)).json();
  expect(listed.links.map((l: { id: string }) => l.id)).toContain(link.id);
  expect(JSON.stringify(listed)).not.toContain(path.split('/').pop()); // tokens are never listed

  const joiner = await freshUser(browser, baseURL!);
  // Opening the link signed out (as a link preview would) must not consume it.
  await joiner.goto(path);
  await expect(joiner.getByRole('heading', { name: `E2E invite ${stamp}` })).toBeVisible();
  await expect(joiner.getByText('as a viewer')).toBeVisible();
  await expect(joiner.getByRole('button', { name: 'Continue with Google' })).toBeVisible();

  await signUpFromInvite(joiner, path);
  await expect(joiner).toHaveURL(new RegExp(`/projects/${projectId}$`), { timeout: 30_000 });

  const { members } = await (await request.get(`/api/projects/${projectId}/members`)).json();
  const joined = members.find((m: { user: { name: string } }) => m.user.name === 'E2E Joiner');
  expect(joined?.role).toBe('viewer');

  // Reopening shows "already a member"; the link is gone from the admin's active list.
  await joiner.goto(path);
  await expect(joiner.getByText('You’re already a member of this project.')).toBeVisible();
  const after = await (await request.get(`/api/projects/${projectId}/invite-links`)).json();
  expect(after.links.map((l: { id: string }) => l.id)).not.toContain(link.id);

  // Single use: someone else gets a clear "already used".
  const second = await freshUser(browser, baseURL!);
  await second.goto(path);
  await expect(second.getByRole('heading', { name: 'This invite link was already used' })).toBeVisible();
  await joiner.context().close();
  await second.context().close();
});

test('a revoked link cannot be used', async ({ request, browser, baseURL }) => {
  const { path, link } = await (
    await request.post(`/api/projects/${projectId}/invite-links`, { data: { role: 'editor' } })
  ).json();
  expect((await request.delete(`/api/projects/${projectId}/invite-links/${link.id}`)).ok()).toBeTruthy();

  const page = await freshUser(browser, baseURL!);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'This invite link was cancelled' })).toBeVisible();
  await page.context().close();

  // The accept endpoint agrees (signed in as the admin, who is already a member → no-op 200;
  // so check a garbage token instead for the API contract).
  const bad = await request.post(`/api/invite-links/${'b'.repeat(43)}/accept`);
  expect(bad.status()).toBe(404);
});

test('admin UI: create a link, see it listed, copy it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/projects/${projectId}/members`);
  await page.getByLabel('Role for the link').selectOption('editor');
  await page.getByRole('button', { name: 'Create link' }).click();
  const sheet = page.getByRole('dialog', { name: 'Invite link ready' });
  const url = await sheet.getByLabel('Invite link').inputValue();
  expect(url).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  await sheet.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('list', { name: 'Active invite links' })).toContainText('Editor');
});
