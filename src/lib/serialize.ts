import type { Attachment } from '@prisma/client';
import { getReadUrl, isR2Configured } from './r2';

export type AttachmentDto = {
  id: string;
  mimeType: string;
  status: string;
  size: number | null;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
};

/**
 * Maps attachments to client DTOs. Buckets are private, so reads always use a short-lived
 * signed GET URL (issued after the caller's membership check). No public URL is stored.
 */
export async function serializeAttachments(attachments: Attachment[]): Promise<AttachmentDto[]> {
  return Promise.all(attachments.map(serializeAttachment));
}

export async function serializeAttachment(a: Attachment): Promise<AttachmentDto> {
  return {
    id: a.id,
    mimeType: a.mimeType,
    status: a.status,
    size: a.size,
    url: await safeReadUrl(a.fileKey),
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
