import { expect, test, type APIRequestContext } from '@playwright/test';
import { todayIST } from '../../src/lib/period';

// WRITES DATA. Runs only with E2E_ALLOW_WRITES=1 against a non-production Neon branch.
// API-level checks for the admin rules: soft-deleted expenses never count towards totals,
// budgets/revisions/variance status, restore, invitations and the last-admin guard.
// Uses its own "E2E admin <timestamp>" project, marked `completed` afterwards.

test.describe.configure({ mode: 'serial' });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
let projectId = '';
let categoryId = '';
let txId = '';
let budgetId = '';
let myUserId = '';

const api = (path = '') => `/api/projects/${projectId}${path}`;

async function totals(request: APIRequestContext) {
  const dash = await (await request.get(api('/dashboard'))).json();
  const budgets = await (await request.get(api('/budgets?granularity=month'))).json();
  const timeline = await (await request.get(api('/timeline'))).json();
  const row = budgets.rows.find((r: { categoryId: string }) => r.categoryId === categoryId);
  return {
    totalSpend: dash.totalSpend as number,
    count: dash.transactionCount as number,
    periodSpend: dash.period.spend as number,
    budgetActual: row?.actual as number,
    inTimeline: (timeline.items as Array<{ id: string }>).some((i) => i.id === txId),
    inRecent: (dash.recentTransactions as Array<{ id: string }>).some((t) => t.id === txId),
  };
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/projects', { data: { name: `E2E admin ${stamp}`, startDate: todayIST() } });
  expect(res.status()).toBe(201);
  projectId = (await res.json()).project.id;
  const { categories } = await (await request.get(api('/categories'))).json();
  categoryId = categories[0].id;
  const { members } = await (await request.get(api('/members'))).json();
  myUserId = members[0].user.id;
});

test.afterAll(async ({ request }) => {
  if (projectId) await request.patch(api(), { data: { status: 'completed' } });
});

test('soft-deleted expenses are excluded from every total, and restore brings them back', async ({ request }) => {
  const created = await request.post(api('/transactions'), {
    data: { categoryId, occurredAt: todayIST(), amount: 1000, gstAmount: 0, paymentMode: 'cash', vendor: `E2E soft ${stamp}` },
  });
  expect(created.status()).toBe(201);
  txId = (await created.json()).transaction.id;

  expect(await totals(request)).toEqual({
    totalSpend: 1000, count: 1, periodSpend: 1000, budgetActual: 1000, inTimeline: true, inRecent: true,
  });

  expect((await request.delete(api(`/transactions/${txId}`))).ok()).toBeTruthy();
  expect(await totals(request)).toEqual({
    totalSpend: 0, count: 0, periodSpend: 0, budgetActual: 0, inTimeline: false, inRecent: false,
  });

  // Deleted rows are hidden from the list unless an admin asks for them.
  const list = await (await request.get(api('/transactions'))).json();
  expect(list.items.some((t: { id: string }) => t.id === txId)).toBe(false);
  const withDeleted = await (await request.get(api('/transactions?includeDeleted=true'))).json();
  expect(withDeleted.items.find((t: { id: string }) => t.id === txId)?.deletedAt).toBeTruthy();

  // Deleted expenses cannot be edited until restored.
  const edit = await request.patch(api(`/transactions/${txId}`), { data: { amount: 5 } });
  expect((await edit.json()).code).toBe('TRANSACTION_DELETED');

  expect((await request.post(api(`/transactions/${txId}/restore`))).ok()).toBeTruthy();
  expect((await totals(request)).totalSpend).toBe(1000);
});

test('budget create is an upsert: 201 then 200 for the same period', async ({ request }) => {
  const body = { categoryId, periodType: 'month', periodStart: todayIST(), plannedAmount: 5000 };
  const first = await request.post(api('/budgets'), { data: body });
  expect(first.status()).toBe(201);
  budgetId = (await first.json()).budget.id;

  const again = await request.post(api('/budgets'), { data: body });
  expect(again.status()).toBe(200);
  expect((await again.json()).budget.id).toBe(budgetId);
});

test('variance status follows the green <80 / yellow 80–100 / red >100 rule', async ({ request }) => {
  const row = async () =>
    (await (await request.get(api('/budgets?granularity=month'))).json()).rows.find(
      (r: { categoryId: string }) => r.categoryId === categoryId,
    );

  expect(await row()).toMatchObject({ budgetId, planned: 5000, actual: 1000, variance: 4000, percentUsed: 20, status: 'green' });

  // A fresh budget is version 0, and the unchanged upsert above must not have bumped it.
  let version = 0;
  const revise = async (plannedAmount: number, reason: string) => {
    const res = await request.patch(api(`/budgets/${budgetId}`), { data: { plannedAmount, reason, version } });
    expect(res.status(), `revise to ${plannedAmount}`).toBe(200);
    const next = (await res.json()).budget.version;
    expect(next).toBe(version + 1);
    version = next;
  };

  await revise(1100, 'scope cut'); // 1000 / 1100 = 91%
  expect(await row()).toMatchObject({ planned: 1100, status: 'yellow' });

  await revise(900, 'overrun');
  expect(await row()).toMatchObject({ planned: 900, variance: -100, status: 'red' });

  const stale = await request.patch(api(`/budgets/${budgetId}`), { data: { plannedAmount: 1, version: version - 1 } });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe('VERSION_CONFLICT');
});

test('budget revisions are append-only history, newest first', async ({ request }) => {
  const { revisions } = await (await request.get(api(`/budgets/${budgetId}/revisions`))).json();
  expect(revisions.slice(0, 2)).toMatchObject([
    { oldAmount: '1100', newAmount: '900', reason: 'overrun', changedBy: myUserId },
    { oldAmount: '5000', newAmount: '1100', reason: 'scope cut', changedBy: myUserId },
  ]);
  const other = await request.get(`/api/projects/does-not-exist/budgets/${budgetId}/revisions`);
  expect(other.status()).toBe(404);
});

test('inviting an email with no account stores a pending invitation that can be cancelled', async ({ request }) => {
  const email = `e2e-invite-${Date.now()}@example.invalid`;
  const res = await request.post(api('/members'), { data: { email, role: 'viewer' } });
  expect(res.status()).toBe(201);
  const { pending, invitation } = await res.json();
  expect(pending).toBe(true);

  const listed = await (await request.get(api('/members'))).json();
  expect(listed.invitations.map((i: { email: string }) => i.email)).toContain(email);

  expect((await request.delete(api(`/invitations/${invitation.id}`))).ok()).toBeTruthy();
  const after = await (await request.get(api('/members'))).json();
  expect(after.invitations.map((i: { email: string }) => i.email)).not.toContain(email);
});

test('the last admin cannot be demoted or removed (409)', async ({ request }) => {
  const demote = await request.patch(api(`/members/${myUserId}`), { data: { role: 'editor' } });
  expect(demote.status()).toBe(409);
  expect((await demote.json()).error).toMatch(/last admin/i);

  const remove = await request.delete(api(`/members/${myUserId}`));
  expect(remove.status()).toBe(409);

  const { members } = await (await request.get(api('/members'))).json();
  expect(members.find((m: { user: { id: string } }) => m.user.id === myUserId)?.role).toBe('admin');
});
