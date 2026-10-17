import { expect, test, type APIRequestContext } from '@playwright/test';
import { todayIST } from '../../src/lib/period';

// WRITES DATA. Runs only with E2E_ALLOW_WRITES=1 against a non-production Neon branch.
// Exercises the funding (money-in) ledger: create from the mobile FAB, dashboard totals, edit with
// optimistic locking, idempotent creates, soft-delete + Undo, and project isolation.

test.describe.configure({ mode: 'serial' });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const projectName = `E2E funding ${stamp}`;
const party = `E2E Bank ${stamp.slice(-9)}`;
let projectId = '';

type Funding = { id: string; version: number; amount: string; source: string; sourceName: string | null };

async function firstFunding(request: APIRequestContext): Promise<Funding> {
  const res = await request.get(`/api/projects/${projectId}/funding`);
  expect(res.ok()).toBeTruthy();
  const { items } = (await res.json()) as { items: Funding[] };
  const row = items.find((f) => f.sourceName === party);
  expect(row, 'funding created by the UI test').toBeTruthy();
  return row!;
}

test('create a project to hold funding', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  const sheet = page.getByRole('dialog', { name: 'New project' });
  await sheet.getByLabel('Name').fill(projectName);
  await sheet.getByLabel('Start date').fill(todayIST());
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/, { timeout: 20_000 });
  projectId = page.url().split('/').pop()!;
});

test('add funding from the mobile FAB', async ({ page }) => {
  await page.goto(`/projects/${projectId}/funding`);
  await page.getByRole('button', { name: 'Add funding' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add funding' });
  await sheet.getByLabel('Amount').fill('500000');
  await sheet.getByLabel('Source').selectOption('bank');
  await sheet.getByLabel('Party').fill(party);
  await sheet.getByRole('radio', { name: 'Bank transfer' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Funding added')).toBeVisible();
  await expect(page.getByText(party).first()).toBeVisible();
  await expect(page.getByText('+₹5,00,000').first()).toBeVisible();
});

test('dashboard compares funding received with spend', async ({ page }) => {
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText('Funding received')).toBeVisible();
  await expect(page.getByText('Funding vs expenditure')).toBeVisible();
  await expect(page.getByText('₹5,00,000').first()).toBeVisible();
});

test('edit funding; a stale version gets 409 VERSION_CONFLICT', async ({ request }) => {
  const before = await firstFunding(request);
  const ok = await request.patch(`/api/projects/${projectId}/funding/${before.id}`, {
    data: { amount: 600000, version: before.version },
  });
  expect(ok.status()).toBe(200);

  const after = await firstFunding(request);
  expect(after.version).toBe(before.version + 1);
  expect(after.amount).toBe('600000');

  const stale = await request.patch(`/api/projects/${projectId}/funding/${after.id}`, {
    data: { amount: 1, version: before.version },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe('VERSION_CONFLICT');
});

test('funding creates are idempotent per Idempotency-Key', async ({ request }) => {
  const body = {
    source: 'client',
    sourceName: `${party} idem`,
    amount: 25000,
    receivedAt: todayIST(),
    mode: 'upi',
  };
  const headers = { 'Idempotency-Key': `funding-${stamp}` };

  const a = await request.post(`/api/projects/${projectId}/funding`, { data: body, headers });
  const b = await request.post(`/api/projects/${projectId}/funding`, { data: body, headers });
  expect(a.status()).toBe(201);
  expect((await b.json()).funding.id).toBe((await a.json()).funding.id);

  const reused = await request.post(`/api/projects/${projectId}/funding`, { data: { ...body, amount: 2 }, headers });
  expect(reused.status()).toBe(409);
});

test('rejects a future received date and a non-positive amount', async ({ request }) => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const bad = await request.post(`/api/projects/${projectId}/funding`, {
    data: { source: 'self', amount: 100, receivedAt: future, mode: 'cash' },
  });
  expect(bad.status()).toBe(422);

  const zero = await request.post(`/api/projects/${projectId}/funding`, {
    data: { source: 'self', amount: 0, receivedAt: todayIST(), mode: 'cash' },
  });
  expect(zero.status()).toBe(422);
});

test('admin soft-deletes funding and can Undo', async ({ page }) => {
  await page.goto(`/projects/${projectId}/funding`);
  await page.getByText(party, { exact: true }).first().click();
  await page.getByRole('dialog', { name: 'Edit funding' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Funding entry deleted')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Funding entry restored')).toBeVisible();
});

test('project isolation: other ids are 404', async ({ request }) => {
  const res = await request.get('/api/projects/does-not-exist/funding');
  expect(res.status()).toBe(404);
});

test.afterAll(async ({ request }) => {
  if (projectId) await request.patch(`/api/projects/${projectId}`, { data: { status: 'completed' } });
});
