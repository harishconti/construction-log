import { expect, test, type APIRequestContext } from '@playwright/test';
import { todayIST } from '../../src/lib/period';

// WRITES DATA. Runs only with E2E_ALLOW_WRITES=1 against a non-production Neon branch.
// Creates one project named "E2E <timestamp>" (projects have no delete endpoint; it is marked
// `completed` at the end so it is easy to spot and ignore).

test.describe.configure({ mode: 'serial' });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const projectName = `E2E ${stamp}`;
const vendor = `E2E Vendor ${stamp.slice(-9)}`;
let projectId = '';

type Tx = { id: string; version: number; amount: string; vendor: string | null };

async function firstTx(request: APIRequestContext): Promise<Tx> {
  const res = await request.get(`/api/projects/${projectId}/transactions`);
  expect(res.ok()).toBeTruthy();
  const { items } = (await res.json()) as { items: Tx[] };
  const tx = items.find((t) => t.vendor === vendor);
  expect(tx, 'expense created by the UI test').toBeTruthy();
  return tx!;
}

test('create a project (creator becomes admin, default categories seeded)', async ({ page, request }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  const sheet = page.getByRole('dialog', { name: 'New project' });
  await sheet.getByLabel('Name').fill(projectName);
  await sheet.getByLabel('Start date').fill(todayIST());
  await sheet.getByRole('button', { name: 'Create' }).click();

  // First write on a cold Neon compute (plus seeding default categories) can take several seconds.
  await expect(page).toHaveURL(/\/projects\/[^/]+$/, { timeout: 20_000 });
  projectId = page.url().split('/').pop()!;

  const members = await (await request.get(`/api/projects/${projectId}/members`)).json();
  expect(JSON.stringify(members)).toContain('"admin"');
  const cats = await (await request.get(`/api/projects/${projectId}/categories`)).json();
  expect(cats.categories.length).toBeGreaterThan(0);
});

test('sets, changes and clears the project location (coordinates as a pair)', async ({ request }) => {
  const set = await request.patch(`/api/projects/${projectId}`, {
    data: { locationName: 'Whitefield, Bengaluru', latitude: 12.9716, longitude: 77.5946 },
  });
  expect(set.status()).toBe(200);
  const proj = await (await request.get(`/api/projects/${projectId}`)).json();
  expect(proj.project.locationName).toBe('Whitefield, Bengaluru');
  expect(proj.project.latitude).toBeCloseTo(12.9716, 5);

  // One coordinate without the other is rejected.
  const bad = await request.patch(`/api/projects/${projectId}`, { data: { latitude: 1 } });
  expect(bad.status()).toBe(422);

  const cleared = await request.patch(`/api/projects/${projectId}`, {
    data: { locationName: null, latitude: null, longitude: null },
  });
  expect(cleared.status()).toBe(200);
  const after = await (await request.get(`/api/projects/${projectId}`)).json();
  expect(after.project.locationName).toBeNull();
  expect(after.project.latitude).toBeNull();
  expect(after.project.longitude).toBeNull();
});

test('add an expense from the mobile FAB', async ({ page }) => {
  await page.goto(`/projects/${projectId}/transactions`);
  await page.getByRole('button', { name: 'Add expense' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  await sheet.getByLabel('Amount').fill('1500');
  await sheet.getByLabel('GST').fill('270');
  await sheet.getByRole('radio', { name: 'UPI' }).click();
  await sheet.getByLabel('Vendor').fill(vendor);
  await sheet.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Expense added')).toBeVisible();
  await expect(page.getByText(vendor).first()).toBeVisible();
  await expect(page.getByText('₹1,500').first()).toBeVisible();
});

test('rejects GST greater than the amount', async ({ request }) => {
  const tx = await firstTx(request);
  const res = await request.patch(`/api/projects/${projectId}/transactions/${tx.id}`, {
    data: { gstAmount: 999999, version: tx.version },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).code).toBe('INVALID_GST');
});

test('edit the expense; a stale version gets 409 VERSION_CONFLICT', async ({ page, request }) => {
  const before = await firstTx(request);

  await page.goto(`/projects/${projectId}/transactions`);
  await page.getByText(vendor).first().click();
  const sheet = page.getByRole('dialog', { name: 'Edit expense' });
  await sheet.getByLabel('Amount').fill('1750');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('₹1,750').first()).toBeVisible();

  const after = await firstTx(request);
  expect(after.version).toBe(before.version + 1);
  expect(after.amount).toBe('1750');

  const stale = await request.patch(`/api/projects/${projectId}/transactions/${after.id}`, {
    data: { amount: 1, version: before.version },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe('VERSION_CONFLICT');
});

test('creates are idempotent per Idempotency-Key', async ({ request }) => {
  const cats = await (await request.get(`/api/projects/${projectId}/categories`)).json();
  const categoryId = cats.categories[0].id;
  const body = { categoryId, occurredAt: todayIST(), amount: 10, gstAmount: 0, paymentMode: 'cash', vendor: `${vendor} idem` };
  const headers = { 'Idempotency-Key': `e2e-${stamp}` };

  const a = await request.post(`/api/projects/${projectId}/transactions`, { data: body, headers });
  const b = await request.post(`/api/projects/${projectId}/transactions`, { data: body, headers });
  expect(a.status()).toBe(201);
  expect((await b.json()).transaction.id).toBe((await a.json()).transaction.id);

  const reused = await request.post(`/api/projects/${projectId}/transactions`, { data: { ...body, amount: 11 }, headers });
  expect(reused.status()).toBe(409);
});

test('admin soft-deletes from the edit sheet and can Undo', async ({ page }) => {
  await page.goto(`/projects/${projectId}/transactions`);
  await page.getByText(vendor, { exact: true }).first().click();
  await page.getByRole('dialog', { name: 'Edit expense' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Expense deleted')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Expense restored')).toBeVisible();
});

test('add a diary entry', async ({ page }) => {
  await page.goto(`/projects/${projectId}/diary`);
  await page.getByRole('button', { name: 'Add diary entry' }).click();
  const sheet = page.getByRole('dialog', { name: 'New diary entry' });
  await sheet.getByLabel('Title').fill(`Slab poured ${stamp.slice(-9)}`);
  await sheet.getByLabel('Notes').fill('E2E diary note');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Entry added')).toBeVisible();
});

test('no page scrolls sideways on mobile (long project/vendor names)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 }); // narrowest common Android width
  for (const path of ['/projects', '', '/transactions', '/timeline', '/diary', '/budgets', '/more', '/members', '/settings']) {
    await page.goto(path === '/projects' ? path : `/projects/${projectId}${path}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path || 'dashboard'}`).toBeLessThanOrEqual(0);
  }
  // The Week/Month toggle must stay on one line next to the period stepper (it used to wrap).
  await page.goto(`/projects/${projectId}/budgets`);
  for (const name of ['Week', 'Month']) {
    await page.getByRole('radio', { name }).click();
    const box = await page.getByRole('radiogroup').boundingBox();
    expect(box?.height, `${name} toggle height`).toBeLessThan(60);
  }
});

test('the floating Add button never covers the last row', async ({ page }) => {
  for (const [path, row] of [['/transactions', 'li[data-tx]'], ['/diary', 'main li']] as const) {
    await page.goto(`/projects/${projectId}${path}`);
    await page.waitForLoadState('networkidle');
    const { last, fab } = await page.evaluate((sel) => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const rows = [...document.querySelectorAll(sel)].filter((e) => (e as HTMLElement).offsetParent);
      const fabEl = [...document.querySelectorAll('button.fixed')].find((b) => /^Add /.test(b.getAttribute('aria-label') ?? ''));
      return { last: rows.at(-1)?.getBoundingClientRect().bottom ?? 0, fab: fabEl?.getBoundingClientRect().top ?? Infinity };
    }, row);
    expect(last, `${path}: last row bottom vs FAB top`).toBeLessThanOrEqual(fab);
  }
});

test('project isolation: other ids are 404, never another project’s data', async ({ request }) => {
  const res = await request.get('/api/projects/does-not-exist/transactions');
  expect(res.status()).toBe(404);
  const tx = await firstTx(request);
  const cross = await request.patch(`/api/projects/does-not-exist/transactions/${tx.id}`, { data: { amount: 1 } });
  expect([403, 404]).toContain(cross.status());
});

test.afterAll(async ({ request }) => {
  if (projectId) await request.patch(`/api/projects/${projectId}`, { data: { status: 'completed' } });
});
