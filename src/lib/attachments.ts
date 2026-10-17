import { Prisma } from '@prisma/client';
import { ApiError } from './api';
import { MAX_FILES_PER_RECORD } from './files';

type Parent = 'transaction' | 'diary' | 'funding';

const PARENT_FIELD: Record<Parent, 'transactionId' | 'diaryEntryId' | 'fundingId'> = {
  transaction: 'transactionId',
  diary: 'diaryEntryId',
  funding: 'fundingId',
};

/**
 * Links finalized (status=ready) attachments to a parent record.
 *
 * The update is guarded in a single statement so a concurrent writer cannot relink the same
 * attachment: only rows that are still `ready` and unlinked are updated, and a count mismatch means
 * someone else claimed one first.
 */
export async function linkAttachments(
  tx: Prisma.TransactionClient,
  opts: { projectId: string; parent: Parent; parentId: string; attachmentIds: string[] },
): Promise<void> {
  if (opts.attachmentIds.length === 0) return;

  const field = PARENT_FIELD[opts.parent];

  const existingCount = await tx.attachment.count({ where: { [field]: opts.parentId } });
  if (existingCount + opts.attachmentIds.length > MAX_FILES_PER_RECORD) {
    throw ApiError.badRequest(
      `At most ${MAX_FILES_PER_RECORD} attachments per record`,
      'TOO_MANY_ATTACHMENTS',
    );
  }

  const existing = await tx.attachment.findMany({
    where: { id: { in: opts.attachmentIds } },
    select: {
      id: true,
      projectId: true,
      status: true,
      transactionId: true,
      diaryEntryId: true,
      fundingId: true,
    },
  });
  if (existing.length !== opts.attachmentIds.length) {
    throw ApiError.badRequest('One or more attachments were not found');
  }
  for (const a of existing) {
    if (a.projectId !== opts.projectId) throw ApiError.badRequest('Attachment belongs to another project');
    if (a.status !== 'ready') throw ApiError.badRequest('Attachment has not been finalized');
    if (a.transactionId || a.diaryEntryId || a.fundingId) throw ApiError.badRequest('Attachment is already attached');
  }

  const result = await tx.attachment.updateMany({
    where: {
      id: { in: opts.attachmentIds },
      projectId: opts.projectId,
      status: 'ready',
      transactionId: null,
      diaryEntryId: null,
      fundingId: null,
    },
    data: { [field]: opts.parentId },
  });
  if (result.count !== opts.attachmentIds.length) {
    throw ApiError.badRequest('One or more attachments were claimed by another request', 'ATTACHMENT_CONFLICT');
  }
}
