import { expect, test } from '@playwright/test';

// Unauthenticated access must never reach data. These requests stop at requireUser()/the proxy,
// so they are read-only and safe against any environment.

test.describe('page auth gate', () => {
  for (const path of [
    '/',
    '/projects',
    '/projects/any-id',
    '/projects/any-id/transactions',
    '/projects/any-id/settings',
    '/account',
    '/consent',
  ]) {
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
    ['GET', `/api/projects/${pid}/invite-links`],
    ['POST', `/api/projects/${pid}/invite-links`],
    ['DELETE', `/api/projects/${pid}/invite-links/l1`],
    ['POST', `/api/invite-links/${'a'.repeat(43)}/accept`],
    ['GET', '/api/consent'],
    ['POST', '/api/consent'],
    ['GET', '/api/account/deletion'],
    ['POST', '/api/account/deletion'],
    ['DELETE', '/api/account/deletion'],
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

test.describe('OAuth / magic-link landing', () => {
  test('a verifier that cannot be exchanged retries once, then explains — never loops', async ({ page }) => {
    // No session-challenge cookie, so the middleware can't exchange this verifier.
    await page.goto('/projects?neon_auth_session_verifier=bogus');
    // (Next's route announcer is also role=alert, so match the message itself.)
    await expect(page.getByText('We couldn’t finish signing you in. Please try again.')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
    expect(new URL(page.url()).searchParams.get('auth_retry')).toBe('1');
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  });

  test('/auth/complete without a session sends you to sign in and keeps `next`', async ({ page }) => {
    await page.goto('/auth/complete?next=%2Finvite%2Fabc%3Fjoin%3D1');
    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get('next')).toBe('/invite/abc?join=1');
  });
});

test.describe('invite link page (signed out)', () => {
  for (const token of ['not-a-token', 'a'.repeat(43)]) {
    test(`unknown link ${token.slice(0, 12)}… shows a clear error`, async ({ page, request }) => {
      // A well-formed token is looked up in the database; CI runs without one.
      if (token.length === 43) {
        const { db } = await (await request.get('/api/health')).json();
        test.skip(!db, 'needs a database');
      }
      await page.goto(`/invite/${token}`);
      await expect(page.getByRole('heading', { name: 'This invite link isn’t valid' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    });
  }
});
