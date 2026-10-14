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
 * Runs `run` at most once per (project, user, key) and returns its result.
 *
 * Correctness: concurrent requests with the same key serialize on a Postgres advisory lock held for
 * the duration of the transaction, so only the first executes `run`; the rest return the stored
 * response. `run` executes inside the same transaction that records the key, so the mutation and its
 * idempotency record commit atomically.
 */
export async function withIdempotency<T>(
  opts: IdempotencyOptions,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ data: T; replayed: boolean }> {
  const key = opts.key?.trim();

  if (!key) {
    return { data: await prisma.$transaction((tx) => run(tx)), replayed: false };
  }

  const requestHash = createHash('sha256').update(JSON.stringify(opts.body ?? null)).digest('hex');
  const lockKey = `${opts.projectId}:${opts.userId}:${key}`;

  return prisma.$transaction(async (tx) => {
    // Serialize concurrent requests sharing this key for the life of the transaction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const existing = await tx.idempotencyKey.findUnique({
      where: { projectId_userId_key: { projectId: opts.projectId, userId: opts.userId, key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw ApiError.conflict('Idempotency-Key was reused with a different request body');
      }
      return { data: existing.response as T, replayed: true };
    }

    const data = await run(tx);

    await tx.idempotencyKey.create({
      data: {
        projectId: opts.projectId,
        userId: opts.userId,
        key,
        requestHash,
        response: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
      },
    });

    return { data, replayed: false };
  });
}
