import { ApiError, handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { deleteObject, isR2Configured } from '@/lib/r2';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id } = await paramsPromise;
  const user = await requireUser();

  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw ApiError.notFound('Attachment not found');

  const access = await requireRole(attachment.projectId, user.id, 'editor');
  if (access.role !== 'admin' && attachment.uploadedBy !== user.id) {
    throw ApiError.forbidden('You can only delete your own uploads');
  }

  await prisma.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id: attachment.id } });
    await writeAudit(tx, {
      entity: 'attachment',
      entityId: attachment.id,
      action: 'delete',
      actorId: user.id,
      before: {
        attachmentId: attachment.id,
        fileKey: attachment.fileKey,
        transactionId: attachment.transactionId,
        diaryEntryId: attachment.diaryEntryId,
      },
    });
  });

  if (isR2Configured()) {
    try {
      await deleteObject(attachment.fileKey);
    } catch (err) {
      // Defer to the maintenance cleanup job rather than losing the object.
      await prisma.objectDeletion.create({
        data: {
          projectId: attachment.projectId,
          fileKey: attachment.fileKey,
          lastError: String(err).slice(0, 500),
        },
      });
      console.error('[attachments] R2 delete deferred', attachment.fileKey, err);
    }
  }

  return json({ ok: true });
});
