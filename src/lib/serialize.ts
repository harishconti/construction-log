import type { Attachment } from '@prisma/client';
import { getReadUrl, isR2Configured } from './r2';

export type AttachmentDto = {
  id: string;
  mimeType: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
};

/**
 * Maps stored attachments to client DTOs, resolving a readable URL.
 * Uses the public R2 URL when configured, otherwise signs a short-lived GET URL.
 * Falls back to any durable URL persisted at upload time.
 */
export async function serializeAttachments(attachments: Attachment[]): Promise<AttachmentDto[]> {
  return Promise.all(
    attachments.map(async (a) => ({
      id: a.id,
      mimeType: a.mimeType,
      url: await safeReadUrl(a),
      uploadedBy: a.uploadedBy,
      uploadedAt: a.uploadedAt,
    })),
  );
}

async function safeReadUrl(a: Attachment): Promise<string> {
  if (isR2Configured()) {
    try {
      return await getReadUrl(a.fileKey);
    } catch {
      return a.fileUrl;
    }
  }
  return a.fileUrl;
}
