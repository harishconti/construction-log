import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders the sign-in form with labelled fields', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Construction Ledger' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email');
    await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password');
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toBeVisible();
  });

  test('sign-up tab adds a Name field and switches button labels', async ({ page }) => {
    await page.getByRole('tab', { name: 'Sign up' }).click();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.getByRole('button', { name: 'Sign up with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toHaveCount(0);
  });

  test('sign-up requires the DPDP consent checkbox before the account buttons enable', async ({ page }) => {
    await page.getByRole('tab', { name: 'Sign up' }).click();
    const create = page.getByRole('button', { name: 'Create account' });
    const google = page.getByRole('button', { name: 'Sign up with Google' });
    await expect(create).toBeDisabled();
    await expect(google).toBeDisabled();
    await page.getByRole('checkbox').check();
    await expect(create).toBeEnabled();
    await expect(google).toBeEnabled();
  });

  test('links to the Terms of Service and Privacy Policy', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });

  test('Google buttons show the Google logo; magic link shows a mail icon', async ({ page }) => {
    const google = page.getByRole('button', { name: 'Sign in with Google' });
    await expect(google.locator('svg path')).toHaveCount(4); // the four-colour "G"
    await expect(page.getByRole('button', { name: 'Email me a sign-in link' }).locator('svg')).toHaveCount(1);
    await page.getByRole('tab', { name: 'Sign up' }).click();
    await expect(page.getByRole('button', { name: 'Sign up with Google' }).locator('svg path')).toHaveCount(4);
  });

  test('magic link asks for an email first (no network call)', async ({ page }) => {
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(page.getByText('Enter your email first')).toBeVisible();
  });

  test('controls meet the 44px touch-target minimum', async ({ page }) => {
    for (const name of ['Sign in with Google', 'Sign in']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box?.height, name).toBeGreaterThanOrEqual(44);
    }
    const input = await page.getByLabel('Email').boundingBox();
    expect(input?.height).toBeGreaterThanOrEqual(44);
  });

  // Set the scheme *before* loading: switching it on a live page makes axe sample colours mid
  // `transition`, which reports contrast failures no real user sees.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no serious accessibility violations (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/login');
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('uses the dark-mode surface tokens when the OS prefers dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const bg = await page.locator('main').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(18, 20, 23)'); // --bg #121417
  });
});
