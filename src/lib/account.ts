import { prisma } from './prisma';
import { writeAudit } from './audit';

/** How many due erasure requests a single cleanup run will process. */
export const DELETION_BATCH = 25;

/** Name written over an erased account (no personal data remains on the row). */
export const ANONYMISED_NAME = 'Deleted user';

/**
 * A stable, non-routable address for an erased account. `email` is unique, so the user id keeps it
 * collision-free; `.invalid` is reserved by RFC 2606 and can never deliver mail.
 */
export function anonymisedEmail(userId: string): string {
  return `deleted+${userId}@deleted.invalid`;
}

export type DeletionResult = {
  processed: number;
  projectsDeleted: number;
  objectsQueued: number;
  membershipsRemoved: number;
};

export const EMPTY_DELETION_RESULT: DeletionResult = {
  processed: 0,
  projectsDeleted: 0,
  objectsQueued: 0,
  membershipsRemoved: 0,
};

/**
 * Processes erasure requests whose grace period has elapsed.
 *
 * The User row is **anonymised**, not deleted: it is referenced by the audit log and by ledger rows
 * that must survive for the other members of a shared project. Personal identifiers (name, email)
 * are overwritten and the projects the user solely owned are removed entirely (their R2 objects are
 * queued for deletion). Shared-project memberships are dropped, promoting the longest-standing
 * remaining member to admin when the departing user was the last admin. Auditing is retained.
 */
export async function processDueDeletions(now: Date = new Date()): Promise<DeletionResult> {
  const due = await prisma.deletionRequest.findMany({
    where: { status: 'pending', scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'asc' },
    take: DELETION_BATCH,
    select: { id: true, userId: true },
  });

  const totals: DeletionResult = { ...EMPTY_DELETION_RESULT };
  for (const item of due) {
    try {
      const outcome = await eraseAccount(item.id, item.userId, now);
      if (!outcome) continue;
      totals.processed += 1;
      totals.projectsDeleted += outcome.projectsDeleted;
      totals.objectsQueued += outcome.objectsQueued;
      totals.membershipsRemoved += outcome.membershipsRemoved;
    } catch (err) {
      // A single failure must not abort the batch; the request stays `pending` and is retried.
      console.error('[account] erasure request failed', item.id, err);
    }
  }
  return totals;
}

type ErasureOutcome = { projectsDeleted: number; membershipsRemoved: number; objectsQueued: number };

async function eraseAccount(requestId: string, userId: string, now: Date): Promise<ErasureOutcome | null> {
  return prisma.$transaction(async (tx) => {
    // Re-read inside the transaction so a cancel racing this run wins.
    const request = await tx.deletionRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    });
    if (!request || request.status !== 'pending') return null;

    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) {
      await tx.deletionRequest.update({ where: { id: requestId }, data: { status: 'completed', completedAt: now } });
      return { projectsDeleted: 0, membershipsRemoved: 0, objectsQueued: 0 };
    }

    const outcome: ErasureOutcome = { projectsDeleted: 0, membershipsRemoved: 0, objectsQueued: 0 };

    const memberships = await tx.projectMember.findMany({
      where: { userId },
      select: {
        id: true,
        role: true,
        projectId: true,
        project: {
          select: {
            id: true,
            members: { select: { id: true, userId: true, role: true, createdAt: true } },
          },
        },
      },
    });

    for (const m of memberships) {
      const others = m.project.members.filter((member) => member.userId !== userId);
      if (others.length === 0) {
        // Sole member: erase the project and everything in it. Queue its R2 objects first, since
        // the project delete cascades the Attachment rows away.
        const attachments = await tx.attachment.findMany({
          where: { projectId: m.projectId },
          select: { fileKey: true },
        });
        if (attachments.length > 0) {
          await tx.objectDeletion.createMany({
            data: attachments.map((a) => ({
              projectId: m.projectId,
              fileKey: a.fileKey,
              lastError: 'project erased with account',
            })),
          });
          outcome.objectsQueued += attachments.length;
        }
        await tx.project.delete({ where: { id: m.projectId } });
        outcome.projectsDeleted += 1;
      } else {
        // Shared project: hand admin to the longest-standing member before removing this one.
        if (m.role === 'admin' && !others.some((member) => member.role === 'admin')) {
          const successor = [...others].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
          if (successor) {
            await tx.projectMember.update({ where: { id: successor.id }, data: { role: 'admin' } });
          }
        }
        await tx.projectMember.delete({ where: { id: m.id } });
        outcome.membershipsRemoved += 1;
      }
    }

    // A pending email invitation for this address no longer has anyone to claim it.
    await tx.invitation.deleteMany({ where: { email: user.email } });
    // Idempotency keys and consent records are keyed to the account and go with it.
    await tx.idempotencyKey.deleteMany({ where: { userId } });
    await tx.consentRecord.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: { name: ANONYMISED_NAME, email: anonymisedEmail(userId), deletedAt: now },
    });
    await tx.deletionRequest.update({
      where: { id: requestId },
      data: { status: 'completed', completedAt: now },
    });
    await writeAudit(tx, {
      entity: 'account',
      entityId: userId,
      action: 'delete',
      actorId: userId,
      after: { ...outcome, requestId, erasedAt: now.toISOString() },
    });

    return outcome;
  });
}
