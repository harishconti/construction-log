import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { headObjectSize, isR2Configured } from '@/lib/r2';
import { serializeAttachment } from '@/lib/serialize';
import { finalizeAttachmentSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ attachmentId: string }> };

/**
 * Marks an uploaded object as ready after verifying it exists in R2.
 * Optionally links it to an existing transaction or diary entry.
 */
export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const { attachmentId } = await paramsPromise;
  const user = await requireUser();

  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) throw ApiError.notFound('Attachment not found');

  const access = await requireRole(attachment.projectId, user.id, 'editor');
  if (access.role !== 'admin' && attachment.uploadedBy !== user.id) {
    throw ApiError.forbidden('You can only finalize your own uploads');
  }
  if (attachment.status === 'ready' && !attachment.transactionId && !attachment.diaryEntryId) {
    // idempotent: already finalized and unlinked
  }

  const body = await parseJson(req, finalizeAttachmentSchema);

  if (body.transactionId) {
    const parent = await prisma.transaction.findUnique({ where: { id: body.transactionId } });
    if (!parent || parent.projectId !== attachment.projectId) {
      throw ApiError.badRequest('Transaction does not belong to this project');
    }
  }
  if (body.diaryEntryId) {
    const parent = await prisma.diaryEntry.findUnique({ where: { id: body.diaryEntryId } });
    if (!parent || parent.projectId !== attachment.projectId) {
      throw ApiError.badRequest('Diary entry does not belong to this project');
    }
  }

  if (!isR2Configured()) {
    throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Image storage is not configured');
  }
  const size = await headObjectSize(attachment.fileKey);
  if (size === null) {
    throw new ApiError(400, 'UPLOAD_NOT_FOUND', 'Uploaded object was not found in storage');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.attachment.update({
      where: { id: attachment.id },
      data: {
        status: 'ready',
        size,
        ...(body.transactionId ? { transactionId: body.transactionId } : {}),
        ...(body.diaryEntryId ? { diaryEntryId: body.diaryEntryId } : {}),
      },
    });
    await writeAudit(tx, {
      entity: 'attachment',
      entityId: saved.id,
      action: 'finalize',
      actorId: user.id,
      after: { status: 'ready', size, transactionId: saved.transactionId, diaryEntryId: saved.diaryEntryId },
    });
    return saved;
  });

  return json({ attachment: await serializeAttachment(updated) });
});
