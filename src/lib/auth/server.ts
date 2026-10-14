import { createNeonAuth } from '@neondatabase/auth/next/server';

/**
 * Server-side Neon Auth (Managed Better Auth).
 * Used by route handlers, server components, and the /api/auth proxy.
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});
