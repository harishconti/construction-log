import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { requireRole } from '@/lib/requireRole';
import { buildObjectKey, isR2Configured, presignPutUrl, publicUrlForKey } from '@/lib/r2';
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

  return json({ uploadUrl, fileKey, publicUrl: publicUrlForKey(fileKey) });
});
