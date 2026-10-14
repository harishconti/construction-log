import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/server';

let middleware: ReturnType<typeof auth.middleware> | null = null;

// Built lazily on the first request so the module can be imported at build time without
// NEON_AUTH_* secrets.
export default function proxy(req: NextRequest) {
  if (!middleware) middleware = auth.middleware({ loginUrl: '/login' });
  return middleware(req);
}

export const config = {
  matcher: ['/projects/:path*'],
};
