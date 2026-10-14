import { expect, test } from '@playwright/test';

// Unauthenticated access must never reach data. These requests stop at requireUser()/the proxy,
// so they are read-only and safe against any environment.

test.describe('page auth gate', () => {
  for (const path of ['/', '/projects', '/projects/any-id', '/projects/any-id/transactions', '/projects/any-id/settings']) {
    test(`${path} redirects to /login when signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole('heading', { name: 'Construction Ledger' })).toBeVisible();
    });
  }
});

test.describe('API auth gate', () => {
  const pid = 'nonexistent-project';
  const endpoints: Array<[method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string]> = [
    ['GET', '/api/projects'],
    ['POST', '/api/projects'],
    ['GET', `/api/projects/${pid}`],
    ['PATCH', `/api/projects/${pid}`],
    ['GET', `/api/projects/${pid}/transactions`],
    ['POST', `/api/projects/${pid}/transactions`],
    ['PATCH', `/api/projects/${pid}/transactions/tx1`],
    ['DELETE', `/api/projects/${pid}/transactions/tx1`],
    ['POST', `/api/projects/${pid}/transactions/tx1/restore`],
    ['GET', `/api/projects/${pid}/diary`],
    ['POST', `/api/projects/${pid}/diary`],
    ['GET', `/api/projects/${pid}/budgets`],
    ['GET', `/api/projects/${pid}/budgets/b1/revisions`],
    ['GET', `/api/projects/${pid}/categories`],
    ['GET', `/api/projects/${pid}/members`],
    ['POST', `/api/projects/${pid}/members`],
    ['DELETE', `/api/projects/${pid}/members/u1`],
    ['DELETE', `/api/projects/${pid}/invitations/i1`],
    ['GET', `/api/projects/${pid}/timeline`],
    ['GET', `/api/projects/${pid}/dashboard`],
    ['POST', '/api/uploads/presign'],
    ['POST', '/api/uploads/a1/finalize'],
    ['GET', '/api/attachments/a1/download'],
    ['DELETE', '/api/attachments/a1'],
  ];

  for (const [method, path] of endpoints) {
    test(`${method} ${path} → 401 UNAUTHORIZED`, async ({ request }) => {
      const res = await request.fetch(path, { method, data: method === 'GET' ? undefined : {} });
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    });
  }

  test('maintenance cleanup rejects a missing or wrong secret', async ({ request }) => {
    const attempts: Record<string, string>[] = [{}, { 'x-maintenance-secret': 'wrong' }, { authorization: 'Bearer wrong' }];
    for (const headers of attempts) {
      const res = await request.get('/api/maintenance/cleanup', { headers });
      expect(res.status()).toBe(401);
      expect((await res.json()).code).toBe('UNAUTHORIZED');
    }
  });
});
