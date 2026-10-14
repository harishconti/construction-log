import { ApiError } from './api';
import { prisma } from './prisma';

/**
 * Fixed-window rate limit backed by Postgres (works across serverless instances).
 * Throws 429 when the bucket exceeds `limit` within `windowMs`.
 */
export async function rateLimit(bucket: string, limit: number, windowMs: number): Promise<void> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const row = await prisma.rateLimit.upsert({
    where: { bucket_windowStart: { bucket, windowStart } },
    update: { count: { increment: 1 } },
    create: { bucket, windowStart, count: 1 },
    select: { count: true },
  });
  if (row.count > limit) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests, please slow down');
  }
}

export const WINDOW = {
  minute: 60_000,
  hour: 3_600_000,
};
