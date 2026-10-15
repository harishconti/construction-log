/**
 * Where to go after signing in. Only same-origin absolute paths are allowed, so a crafted
 * `?next=` can't turn the login page into an open redirect (`//evil.com`, `/\evil.com`,
 * `https://…` and anything with control characters fall back to the default).
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/projects'): string {
  if (!raw || raw.length > 512) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}

/** The route every OAuth / magic-link sign-in returns to; the auth proxy completes the session there. */
export function authCompletePath(next: string): string {
  return `/auth/complete?next=${encodeURIComponent(safeNextPath(next))}`;
}
