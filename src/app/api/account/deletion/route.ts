import { handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, WINDOW } from '@/lib/ratelimit';
import { writeAudit } from '@/lib/audit';
import { getDeletionRequest } from '@/lib/consent';
import { DELETION_GRACE_DAYS, deletionScheduledFor } from '@/lib/legal';
import { requestDeletionSchema } from '@/lib/validation/schemas';

const SELECT = {
  id: true,
  status: true,
  reason: true,
  requestedAt: true,
  scheduledFor: true,
  completedAt: true,
} as const;

/** The account's erasure request (pending or historical), if any. */
export const GET = handle(async () => {
  const user = await requireUser();
  const request = await getDeletionRequest(user.id);
  return json({ request, graceDays: DELETION_GRACE_DAYS });
});

/**
 * Requests erasure of the account and personal data. The request is scheduled `DELETION_GRACE_DAYS`
 * ahead so the user can change their mind; the cleanup job runs it once due. Idempotent: a repeat
 * while one is pending returns the existing request.
 */
export const POST = handle(async (req) => {
  const user = await requireUser();
  await rateLimit(`deletion:${user.id}`, 10, WINDOW.hour);
  const body = await parseJson(req, requestDeletionSchema);

  const { request, created } = await prisma.$transaction(async (tx) => {
    const existing = await tx.deletionRequest.findFirst({
      where: { userId: user.id, status: 'pending' },
      select: SELECT,
    });
    if (existing) return { request: existing, created: false };

    const scheduledFor = deletionScheduledFor();
    const request = await tx.deletionRequest.create({
      data: { userId: user.id, scheduledFor, reason: body.reason ?? null },
      select: SELECT,
    });
    await writeAudit(tx, {
      entity: 'account',
      entityId: user.id,
      action: 'delete',
      actorId: user.id,
      after: { requestId: request.id, scheduledFor: scheduledFor.toISOString(), reason: request.reason },
    });
    return { request, created: true };
  });

  return json({ request, graceDays: DELETION_GRACE_DAYS }, created ? 201 : 200);
});

/** Cancels a pending erasure request. Idempotent. */
export const DELETE = handle(async () => {
  const user = await requireUser();
  await rateLimit(`deletion-cancel:${user.id}`, 30, WINDOW.hour);

  const cancelled = await prisma.$transaction(async (tx) => {
    const pending = await tx.deletionRequest.findFirst({
      where: { userId: user.id, status: 'pending' },
      select: { id: true, scheduledFor: true },
    });
    if (!pending) return false;
    // Only cancel if still pending (a concurrent cleanup run may have already erased the account).
    const res = await tx.deletionRequest.updateMany({
      where: { id: pending.id, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (res.count === 0) return false;
    await writeAudit(tx, {
      entity: 'account',
      entityId: user.id,
      action: 'cancel',
      actorId: user.id,
      before: { requestId: pending.id, scheduledFor: pending.scheduledFor.toISOString() },
    });
    return true;
  });

  return json({ cancelled });
});
