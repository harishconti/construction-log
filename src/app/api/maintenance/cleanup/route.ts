import { ApiError, handle, json } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { deleteObject, isR2Configured } from '@/lib/r2';
import {
  DELETE_TTL_MS,
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

  // 2) Retry deferred R2 deletions (bounded attempts, plus retry anything older than the TTL).
  let deleted = 0;
  let failed = 0;
  if (isR2Configured()) {
    const queue = await prisma.objectDeletion.findMany({
      where: { OR: [{ attempts: { lt: 10 } }, { createdAt: { lt: new Date(now - DELETE_TTL_MS) } }] },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    for (const item of queue) {
      try {
        await deleteObject(item.fileKey);
        await prisma.objectDeletion.delete({ where: { id: item.id } });
        deleted += 1;
      } catch (err) {
        await prisma.objectDeletion.update({
          where: { id: item.id },
          data: { attempts: { increment: 1 }, lastError: String(err).slice(0, 500) },
        });
        failed += 1;
      }
    }
  }

  return json({
    cleanedAttachments: stale.length,
    deletedObjects: deleted,
    failedDeletions: failed,
    at: new Date().toISOString(),
  });
});

export const GET = run;
export const POST = run;
