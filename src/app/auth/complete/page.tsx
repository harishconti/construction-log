import { redirect } from 'next/navigation';
import { safeNextPath } from '@/lib/safe-next';

export const dynamic = 'force-dynamic';

/**
 * Every OAuth and magic-link sign-in returns here. The auth proxy (src/proxy.ts) runs on this route
 * and swaps the `neon_auth_session_verifier` query param for a session cookie *before* this page
 * renders; if that fails it bounces to /login with the params attached, which retries once.
 * With a session, all that's left is to continue to the (sanitised) `next` path.
 */
export default async function AuthCompletePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  redirect(safeNextPath(next));
}
