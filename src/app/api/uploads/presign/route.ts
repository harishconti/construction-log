import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { buildObjectKey, isR2Configured, presignPutUrl } from '@/lib/r2';
import { presignSchema } from '@/lib/validation/schemas';

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await parseJson(req, presignSchema);

  await requireRole(body.projectId, user.id, 'editor');

  if (!isR2Configured()) {
    throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Image storage is not configured');
  }

  const fileKey = buildObjectKey(body.projectId, body.parentType, body.mimeType);
  const uploadUrl = await presignPutUrl(fileKey, body.mimeType);

  // Pending row: no parent yet. Finalized (status=ready) then linked to a record.
  const attachment = await prisma.attachment.create({
    data: {
      projectId: body.projectId,
      status: 'pending',
      fileKey,
      mimeType: body.mimeType,
      size: body.size ?? null,
      uploadedBy: user.id,
    },
    select: { id: true },
  });

  return json({ attachmentId: attachment.id, uploadUrl, fileKey }, 201);
});
