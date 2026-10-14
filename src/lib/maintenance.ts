import { timingSafeEqual } from 'node:crypto';

export const MS_PER_HOUR = 60 * 60 * 1000;

/** Pending uploads older than this are treated as abandoned and reaped. */
export const PENDING_TTL_MS = 24 * MS_PER_HOUR;

/** Deferred deletions older than this are retried even after the attempt cap. */
export const DELETE_TTL_MS = 7 * 24 * MS_PER_HOUR;

/** Constant-time comparison of a provided secret against any accepted secret. */
export function secretMatches(provided: string | null, secrets: string[]): boolean {
  if (!provided || secrets.length === 0) return false;
  const providedBuf = Buffer.from(provided);
  return secrets.some((s) => {
    const secretBuf = Buffer.from(s);
    return providedBuf.length === secretBuf.length && timingSafeEqual(providedBuf, secretBuf);
  });
}

/** Extracts a maintenance secret from `x-maintenance-secret` or `Authorization: Bearer`. */
export function providedMaintenanceSecret(
  header: (name: string) => string | null,
): string | null {
  const direct = header('x-maintenance-secret');
  if (direct) return direct;
  const auth = header('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return null;
}

/** Accepted secrets from the environment (deduped). Empty means maintenance is disabled. */
export function maintenanceSecrets(): string[] {
  return [process.env.MAINTENANCE_SECRET, process.env.CRON_SECRET].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
}
