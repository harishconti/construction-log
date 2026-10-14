import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ApiError } from './api';
import { prisma } from './prisma';

export type IdempotencyOptions = {
  projectId: string;
  userId: string;
  key?: string | null;
  body: unknown;
};

/**
 * Runs `run` at most once per (project, user, key). On replay, returns the stored response.
 * Throws 409 if the same key is used with a different request body.
 */
export async function withIdempotency<T>(
  opts: IdempotencyOptions,
  run: () => Promise<T>,
): Promise<{ data: T; replayed: boolean }> {
  const key = opts.key?.trim();
  if (!key) {
    return { data: await run(), replayed: false };
  }

  const requestHash = createHash('sha256').update(JSON.stringify(opts.body ?? null)).digest('hex');

  const existing = await prisma.idempotencyKey.findUnique({
    where: { projectId_userId_key: { projectId: opts.projectId, userId: opts.userId, key } },
  });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw ApiError.conflict('Idempotency-Key was reused with a different request body');
    }
    return { data: existing.response as T, replayed: true };
  }

  const data = await run();

  try {
    await prisma.idempotencyKey.create({
      data: {
        projectId: opts.projectId,
        userId: opts.userId,
        key,
        requestHash,
        response: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Concurrent duplicate: another request created the key first — return its stored response.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.idempotencyKey.findUnique({
        where: { projectId_userId_key: { projectId: opts.projectId, userId: opts.userId, key } },
      });
      if (winner) return { data: winner.response as T, replayed: true };
    }
    throw err;
  }

  return { data, replayed: false };
}
