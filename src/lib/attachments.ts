import { Prisma } from '@prisma/client';
import { ApiError } from './api';

type Parent = 'transaction' | 'diary';

/**
 * Links finalized (status=ready) attachments to a parent record. Every attachment must belong to
 * the same project, be finalized, and not already be attached. Enforces the exactly-one-parent rule.
 */
export async function linkAttachments(
  tx: Prisma.TransactionClient,
  opts: { projectId: string; parent: Parent; parentId: string; attachmentIds: string[] },
): Promise<void> {
  const field = opts.parent === 'transaction' ? 'transactionId' : 'diaryEntryId';
  const attachments = await tx.attachment.findMany({ where: { id: { in: opts.attachmentIds } } });

  if (attachments.length !== opts.attachmentIds.length) {
    throw ApiError.badRequest('One or more attachments were not found');
  }
  for (const a of attachments) {
    if (a.projectId !== opts.projectId) throw ApiError.badRequest('Attachment belongs to another project');
    if (a.status !== 'ready') throw ApiError.badRequest('Attachment has not been finalized');
    if (a.transactionId || a.diaryEntryId) throw ApiError.badRequest('Attachment is already attached');
  }

  await tx.attachment.updateMany({
    where: { id: { in: opts.attachmentIds } },
    data: { [field]: opts.parentId },
  });
}
