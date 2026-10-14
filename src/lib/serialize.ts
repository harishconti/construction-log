import type { Attachment } from '@prisma/client';
import { getReadUrl, isR2Configured } from './r2';
import { isViewable } from './files';

export type AttachmentDto = {
  id: string;
  mimeType: string;
  status: string;
  size: number | null;
  originalName: string | null;
  /** True only for raster images safe to render inline. */
  viewable: boolean;
  /** Signed GET URL — populated only when `viewable`. */
  url: string;
  /** App-proxied download endpoint (always available). */
  downloadUrl: string;
  uploadedBy: string;
  uploadedAt: Date;
};

/**
 * Maps attachments to client DTOs. Private buckets: only viewable raster images get a signed GET URL;
 * everything else is served through the auth-gated download route and never exposed inline.
 */
export async function serializeAttachments(attachments: Attachment[]): Promise<AttachmentDto[]> {
  return Promise.all(attachments.map(serializeAttachment));
}

export async function serializeAttachment(a: Attachment): Promise<AttachmentDto> {
  const viewable = isViewable(a.mimeType);
  return {
    id: a.id,
    mimeType: a.mimeType,
    status: a.status,
    size: a.size,
    originalName: a.originalName,
    viewable,
    url: viewable ? await safeReadUrl(a.fileKey) : '',
    downloadUrl: `/api/attachments/${a.id}/download`,
    uploadedBy: a.uploadedBy,
    uploadedAt: a.uploadedAt,
  };
}

async function safeReadUrl(fileKey: string): Promise<string> {
  if (!isR2Configured()) return '';
  try {
    return await getReadUrl(fileKey);
  } catch {
    return '';
  }
}
