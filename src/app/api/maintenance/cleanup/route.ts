import { ApiError, handle, json } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { deleteObjects, isR2Configured } from '@/lib/r2';
import { WINDOW } from '@/lib/ratelimit';
import {
  DELETE_TTL_MS,
  IDEMPOTENCY_TTL_MS,
  PENDING_TTL_MS,
  maintenanceSecrets,
  providedMaintenanceSecret,
  secretMatches,
} from '@/lib/maintenance';

const run = handle(async (req) => {
  const provided = providedMaintenanceSecret((name) => req.headers.get(name));
  if (!secretMatches(provided, maintenanceSecrets())) {
    throw ApiError.unauthorized('Invalid maintenance secret');
  }

  const now = Date.now();

  // 1) Reap stale uploads: never-finalized (`pending`) and finalized-but-never-linked (`ready`),
  //    both older than the TTL. Queue their objects for deletion and remove the rows.
  const stale = await prisma.attachment.findMany({
    where: {
      uploadedAt: { lt: new Date(now - PENDING_TTL_MS) },
      OR: [
        { status: 'pending' },
        { status: 'ready', transactionId: null, diaryEntryId: null },
      ],
    },
    orderBy: { uploadedAt: 'asc' },
    take: 500,
    select: { id: true, projectId: true, fileKey: true },
  });
  if (stale.length) {
    await prisma.$transaction(async (tx) => {
      await tx.objectDeletion.createMany({
        data: stale.map((a) => ({
          projectId: a.projectId,
          fileKey: a.fileKey,
          lastError: 'stale unlinked upload',
        })),
      });
      await tx.attachment.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });
    });
  }

  // 2) Retry deferred R2 deletions in batches (bounded attempts, plus retry anything older than the TTL).
  let deleted = 0;
  let failed = 0;
  if (isR2Configured()) {
    const queue = await prisma.objectDeletion.findMany({
      where: { OR: [{ attempts: { lt: 10 } }, { createdAt: { lt: new Date(now - DELETE_TTL_MS) } }] },
      orderBy: { createdAt: 'asc' },
      take: 1000,
      select: { id: true, fileKey: true },
    });
    if (queue.length) {
      const idByKey = new Map(queue.map((q) => [q.fileKey, q.id]));
      const { deleted: okKeys, failed: badKeys } = await deleteObjects(queue.map((q) => q.fileKey));

      const okIds = okKeys.map((k) => idByKey.get(k)).filter((v): v is string => Boolean(v));
      if (okIds.length) await prisma.objectDeletion.deleteMany({ where: { id: { in: okIds } } });

      const badIds = badKeys.map((k) => idByKey.get(k)).filter((v): v is string => Boolean(v));
      if (badIds.length) {
        await prisma.objectDeletion.updateMany({
          where: { id: { in: badIds } },
          data: { attempts: { increment: 1 }, lastError: 'batch delete failed' },
        });
      }
      deleted = okKeys.length;
      failed = badKeys.length;
    }
  }

  // 3) Purge old idempotency keys (the mutation they guard is long committed).
  const purgedKeys = (
    await prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(now - IDEMPOTENCY_TTL_MS) } } })
  ).count;

  // 4) Purge expired rate-limit windows.
  const purgedRateLimits = (
    await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now - WINDOW.hour) } } })
  ).count;

  return json({
    cleanedAttachments: stale.length,
    deletedObjects: deleted,
    failedDeletions: failed,
    purgedKeys,
    purgedRateLimits,
    at: new Date().toISOString(),
  });
});

export const GET = run;
export const POST = run;
