import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { compressImage } from '@/lib/compress';
import {
  getObjectBytes,
  getObjectHeadBytes,
  headObjectSize,
  isR2Configured,
  putObject,
} from '@/lib/r2';
import { serializeAttachment } from '@/lib/serialize';
import { MAX_FILES_PER_RECORD, mayCompress, sizeLimitFor, sniffMatches } from '@/lib/files';
import { finalizeAttachmentSchema } from '@/lib/validation/schemas';
import type { Attachment } from '@prisma/client';

export const runtime = 'nodejs';
// Server-side optimisation (download + decode + re-encode) can take a few seconds on large images.
export const maxDuration = 60;

type Ctx = { params: Promise<{ attachmentId: string }> };

/**
 * Marks a pending upload ready after verifying it exists in R2, and optionally links it to a parent.
 * Idempotent: finalizing an already-ready attachment returns its current state; it never relinks an
 * attachment that already has a different parent.
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

  const body = await parseJson(req, finalizeAttachmentSchema);
  await assertParent(attachment.projectId, body.transactionId, body.diaryEntryId);

  // Already finalized: no-op, or link if it is still unlinked.
  if (attachment.status === 'ready') {
    return json({ attachment: await linkIfNeeded(attachment, body, user.id) });
  }

  if (!isR2Configured()) {
    throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'File storage is not configured');
  }
  const size = await headObjectSize(attachment.fileKey);
  if (size === null) {
    throw new ApiError(400, 'UPLOAD_NOT_FOUND', 'Uploaded object was not found in storage');
  }
  const limit = sizeLimitFor(attachment.mimeType);
  if (size > limit) {
    await prisma.objectDeletion.create({
      data: { projectId: attachment.projectId, fileKey: attachment.fileKey, lastError: 'oversize upload' },
    });
    throw new ApiError(400, 'FILE_TOO_LARGE', `File exceeds the ${Math.round(limit / (1024 * 1024))} MB limit`);
  }

  // Defence in depth: verify the stored bytes match the declared type.
  const head = await getObjectHeadBytes(attachment.fileKey);
  if (!sniffMatches(attachment.mimeType, head)) {
    await prisma.objectDeletion.create({
      data: { projectId: attachment.projectId, fileKey: attachment.fileKey, lastError: 'content type mismatch' },
    });
    throw new ApiError(400, 'CONTENT_MISMATCH', 'File content does not match its declared type');
  }

  // Backstop optimisation: compress (or convert HEIC) server-side so storage never bloats even when
  // the browser optimiser was skipped. Best-effort — a failure leaves the object as uploaded.
  let storedMime = attachment.mimeType;
  let storedSize = size;
  if (mayCompress(attachment.mimeType)) {
    const bytes = await getObjectBytes(attachment.fileKey);
    const optimized = await compressImage(bytes, attachment.mimeType);
    if (optimized) {
      await putObject(attachment.fileKey, optimized.bytes, optimized.mimeType);
      storedMime = optimized.mimeType;
      storedSize = optimized.bytes.length;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.attachment.updateMany({
      where: { id: attachment.id, status: 'pending' },
      data: {
        status: 'ready',
        size: storedSize,
        mimeType: storedMime,
        ...(body.transactionId ? { transactionId: body.transactionId } : {}),
        ...(body.diaryEntryId ? { diaryEntryId: body.diaryEntryId } : {}),
      },
    });
    if (res.count === 0) {
      // Lost a race; return the now-ready row.
      return tx.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
    }
    await writeAudit(tx, {
      entity: 'attachment',
      entityId: attachment.id,
      action: 'finalize',
      actorId: user.id,
      after: {
        status: 'ready',
        size: storedSize,
        mimeType: storedMime,
        transactionId: body.transactionId,
        diaryEntryId: body.diaryEntryId,
      },
    });
    return tx.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
  });

  return json({ attachment: await serializeAttachment(updated) });
});

async function assertParent(projectId: string, transactionId?: string, diaryEntryId?: string) {
  if (transactionId) {
    const parent = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!parent || parent.projectId !== projectId) {
      throw ApiError.badRequest('Transaction does not belong to this project');
    }
    if (parent.deletedAt) throw ApiError.badRequest('Transaction is deleted', 'TRANSACTION_DELETED');
  }
  if (diaryEntryId) {
    const parent = await prisma.diaryEntry.findUnique({ where: { id: diaryEntryId } });
    if (!parent || parent.projectId !== projectId) {
      throw ApiError.badRequest('Diary entry does not belong to this project');
    }
  }
}

async function linkIfNeeded(
  attachment: Attachment,
  body: { transactionId?: string; diaryEntryId?: string },
  actorId: string,
) {
  const desiredParent = body.transactionId ?? body.diaryEntryId ?? null;
  const currentParent = attachment.transactionId ?? attachment.diaryEntryId ?? null;

  if (!desiredParent || currentParent === desiredParent) {
    return serializeAttachment(attachment);
  }
  if (currentParent) {
    throw ApiError.conflict('Attachment is already linked to another record');
  }

  const parentField = body.transactionId ? 'transactionId' : 'diaryEntryId';
  const parentId = body.transactionId ?? body.diaryEntryId ?? '';
  const count = await prisma.attachment.count({ where: { [parentField]: parentId } });
  if (count >= MAX_FILES_PER_RECORD) {
    throw ApiError.badRequest(`At most ${MAX_FILES_PER_RECORD} attachments per record`, 'TOO_MANY_ATTACHMENTS');
  }

  const result = await prisma.attachment.updateMany({
    where: {
      id: attachment.id,
      status: 'ready',
      transactionId: null,
      diaryEntryId: null,
    },
    data: {
      ...(body.transactionId ? { transactionId: body.transactionId } : {}),
      ...(body.diaryEntryId ? { diaryEntryId: body.diaryEntryId } : {}),
    },
  });
  if (result.count === 0) {
    throw ApiError.conflict('Attachment is already linked to another record');
  }
  const fresh = await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
  await prisma.auditLog.create({
    data: {
      entity: 'attachment',
      entityId: attachment.id,
      action: 'finalize',
      actorId,
      after: { linked: true, transactionId: body.transactionId, diaryEntryId: body.diaryEntryId },
    },
  });
  return serializeAttachment(fresh);
}
