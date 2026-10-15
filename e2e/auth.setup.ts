import { expect, test as setup } from '@playwright/test';

// Signs in once through the real login form and saves the session for the `authed` project.
setup('sign in', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error('E2E_EMAIL and E2E_PASSWORD are required when E2E_ALLOW_WRITES=1');

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // An existing account is sent through the DPDP consent gate once (no current consent on record).
  await page.waitForURL(/\/(projects|consent)/, { timeout: 30_000 });
  if (new URL(page.url()).pathname === '/consent') {
    await page.getByLabel(/I have read and agree/).check();
    await page.getByRole('button', { name: 'Agree and continue' }).click();
  }

  await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
