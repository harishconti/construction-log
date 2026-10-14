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

  // 1) Reap stale pending uploads (never finalized) and queue their objects for deletion.
  const stalePending = await prisma.attachment.findMany({
    where: { status: 'pending', uploadedAt: { lt: new Date(now - PENDING_TTL_MS) } },
    orderBy: { uploadedAt: 'asc' },
    take: 500,
    select: { id: true, projectId: true, fileKey: true },
  });
  if (stalePending.length) {
    await prisma.objectDeletion.createMany({
      data: stalePending.map((a) => ({
        projectId: a.projectId,
        fileKey: a.fileKey,
        lastError: 'stale pending upload',
      })),
    });
    await prisma.attachment.deleteMany({ where: { id: { in: stalePending.map((a) => a.id) } } });
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
    cleanedPending: stalePending.length,
    deletedObjects: deleted,
    failedDeletions: failed,
    at: new Date().toISOString(),
  });
});

export const GET = run;
export const POST = run;
