import { ApiError, errorResponse } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { getObjectStream, isR2Configured } from '@/lib/r2';
import { safeDownloadHeaders } from '@/lib/files';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Streams an attachment as a forced download. Never exposes the raw object URL.
 * The response is always `application/octet-stream` + `attachment` + `nosniff`, so uploaded
 * documents can never be rendered inline by the browser.
 */
export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const user = await requireUser();

    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment || attachment.status !== 'ready') throw ApiError.notFound('Attachment not found');

    // Any member with read access (viewer+) may download.
    await requireRole(attachment.projectId, user.id, 'viewer');

    if (!isR2Configured()) {
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'File storage is not configured');
    }

    const { body, contentLength } = await getObjectStream(attachment.fileKey);
    return new Response(body, {
      status: 200,
      headers: safeDownloadHeaders(attachment.originalName ?? 'file', contentLength ?? attachment.size),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
