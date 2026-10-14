import { createNeonAuth } from '@neondatabase/auth/next/server';

type Auth = ReturnType<typeof createNeonAuth>;

let instance: Auth | null = null;

function authInstance(): Auth {
  if (!instance) {
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const secret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!baseUrl || !secret) {
      throw new Error(
        'Neon Auth is not configured: set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET (>= 32 chars).',
      );
    }
    instance = createNeonAuth({ baseUrl, cookies: { secret } });
  }
  return instance;
}

/**
 * Lazily-constructed Neon Auth server client.
 *
 * Constructed on first property access (request time), never at module load, so `next build`
 * does not require runtime secrets and does not fail while collecting page data.
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const a = authInstance() as unknown as Record<string, unknown>;
    const value = a[prop as string];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(a) : value;
  },
});
