import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { resolveVendorId } from '@/lib/vendors';
import { updateTransactionSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string; txId: string }> };

export const PATCH = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const { id: projectId, txId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'editor'); // editors may edit ANY transaction
  const body = await parseJson(req, updateTransactionSchema);

  const before = await prisma.transaction.findUnique({ where: { id: txId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Transaction not found');
  if (before.deletedAt) throw ApiError.badRequest('Transaction is deleted', 'TRANSACTION_DELETED');

  if (body.version !== undefined && body.version !== before.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'Transaction was modified by someone else');
  }

  const mergedAmount = body.amount ?? Number(before.amount);
  const mergedGst = body.gstAmount ?? Number(before.gstAmount);
  if (mergedGst > mergedAmount) {
    throw ApiError.badRequest('GST amount cannot exceed the total amount', 'INVALID_GST');
  }

  if (body.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!category || category.projectId !== projectId) {
      throw ApiError.badRequest('Category does not belong to this project', 'INVALID_CATEGORY');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const vendorId =
      body.vendor !== undefined
        ? await resolveVendorId(tx, { projectId, createdBy: user.id, name: body.vendor })
        : undefined;
    const res = await tx.transaction.updateMany({
      where: { id: txId, version: before.version },
      data: {
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.occurredAt !== undefined ? { occurredAt: body.occurredAt } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.gstAmount !== undefined ? { gstAmount: body.gstAmount } : {}),
        ...(body.vendor !== undefined ? { vendor: body.vendor } : {}),
        ...(vendorId !== undefined ? { vendorId } : {}),
        ...(body.paymentMode !== undefined ? { paymentMode: body.paymentMode } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) {
      throw new ApiError(409, 'VERSION_CONFLICT', 'Transaction was modified by someone else');
    }
    const after = await tx.transaction.findUnique({
      where: { id: txId },
      include: {
        category: { select: { id: true, name: true, type: true } },
        vendorEntity: { select: { id: true, name: true } },
      },
    });
    await writeAudit(tx, {
      entity: 'transaction',
      entityId: txId,
      action: 'update',
      actorId: user.id,
      before: { ...before, amount: before.amount.toString(), gstAmount: before.gstAmount.toString() },
      after: after ? { ...after, amount: after.amount.toString(), gstAmount: after.gstAmount.toString() } : null,
    });
    return after;
  });

  return json({
    transaction: updated
      ? { ...updated, amount: updated.amount.toString(), gstAmount: updated.gstAmount.toString() }
      : null,
  });
});

export const DELETE = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId, txId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');

  const before = await prisma.transaction.findUnique({ where: { id: txId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Transaction not found');
  if (before.deletedAt) return json({ ok: true });

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: txId },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await writeAudit(tx, {
      entity: 'transaction',
      entityId: txId,
      action: 'delete',
      actorId: user.id,
      before: { ...before, amount: before.amount.toString(), gstAmount: before.gstAmount.toString() },
    });
  });

  return json({ ok: true });
});
