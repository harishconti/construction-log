import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite. Two tiers:
 *  - public-*: read-only checks (login UI, auth gate, API 401s, headers, PWA, a11y). Safe against any
 *    environment, including production — they never sign in or write data.
 *  - authed: signs in with E2E_EMAIL / E2E_PASSWORD and creates data. Only runs when
 *    E2E_ALLOW_WRITES=1. Point it at a Neon *dev* branch, never production.
 *
 * By default the suite boots `next start` on :3100 (run `npm run build` first). Set E2E_BASE_URL to
 * test an already-running server or a deployed URL instead.
 */
const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const allowWrites = process.env.E2E_ALLOW_WRITES === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'public-desktop', testDir: './e2e/public', use: { ...devices['Desktop Chrome'] } },
    { name: 'public-mobile', testDir: './e2e/public', use: { ...devices['Pixel 7'] } },
    ...(allowWrites
      ? [
          { name: 'setup', testDir: './e2e', testMatch: /auth\.setup\.ts/ },
          {
            name: 'authed',
            testDir: './e2e/authed',
            dependencies: ['setup'],
            use: { ...devices['Pixel 7'], storageState: 'e2e/.auth/user.json' },
          },
        ]
      : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
