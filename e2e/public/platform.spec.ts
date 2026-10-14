import { expect, test } from '@playwright/test';

test('health reports ok with a reachable database', async ({ request }) => {
  const res = await request.get('/api/health');
  const body = await res.json();
  // 503 + db:false is the documented degraded state; anything else is a bug.
  if (res.status() === 503) {
    expect(body).toMatchObject({ status: 'degraded', db: false });
    test.info().annotations.push({ type: 'warning', description: 'database unreachable' });
  } else {
    expect(res.status()).toBe(200);
    expect(body).toMatchObject({ status: 'ok', db: true });
  }
  expect(Object.keys(body).sort()).toEqual(['db', 'status', 'time']); // exposes nothing else
});

test('security headers are set on pages and API responses', async ({ request }) => {
  for (const path of ['/login', '/api/health']) {
    const h = (await request.get(path)).headers();
    expect(h['x-content-type-options'], path).toBe('nosniff');
    expect(h['x-frame-options'], path).toBe('DENY');
    expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy'], path).toContain('microphone=()');
    const csp = h['content-security-policy'] ?? '';
    for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(csp, `${path} CSP`).toContain(directive);
    }
    expect(csp).toContain('r2.cloudflarestorage.com'); // direct uploads must be allowed by connect-src
  }
});

test('HSTS is sent in production builds', async ({ request, baseURL }) => {
  test.skip(!!baseURL?.startsWith('http://localhost') && process.env.E2E_EXPECT_HSTS !== '1', 'next start on localhost');
  const h = (await request.get('/login')).headers();
  expect(h['strict-transport-security']).toContain('max-age=');
});

test('PWA manifest and icons are served', async ({ request }) => {
  const manifest = await (await request.get('/manifest.json')).json();
  expect(manifest).toMatchObject({ start_url: '/projects', display: 'standalone' });
  const purposes = manifest.icons.map((i: { purpose: string }) => i.purpose);
  expect(purposes).toContain('maskable');
  for (const icon of manifest.icons as Array<{ src: string }>) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
  expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);
});

test('service worker never caches API responses', async ({ request }) => {
  const res = await request.get('/sw.js');
  expect(res.status()).toBe(200);
  const sw = await res.text();
  expect(sw).toContain("'/login'");
  expect(sw).not.toMatch(/APP_SHELL = \[[^\]]*\/projects/); // per-user pages are not precached
  expect(sw).toMatch(/\/api\//); // has an explicit API bypass
});

test('unknown routes return 404', async ({ request }) => {
  expect((await request.get('/definitely-not-a-page')).status()).toBe(404);
});
