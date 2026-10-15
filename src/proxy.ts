import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/server';

let middleware: ReturnType<typeof auth.middleware> | null = null;

// Built lazily on the first request so the module can be imported at build time without
// NEON_AUTH_* secrets.
export default function proxy(req: NextRequest) {
  if (!middleware) middleware = auth.middleware({ loginUrl: '/login' });
  return middleware(req);
}

// `/auth/complete` is where every OAuth / magic-link sign-in lands: the middleware must run there
// to exchange the `neon_auth_session_verifier` for a session cookie. `/` is covered in case the
// provider returns a first-time user to the site root. (The middleware skips /login itself.)
export const config = {
  matcher: ['/', '/auth/complete', '/projects/:path*'],
};
