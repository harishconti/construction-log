import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { updateVendorSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string; vendorId: string }> };

export const PATCH = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const { id: projectId, vendorId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'editor');
  const body = await parseJson(req, updateVendorSchema);

  const before = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Vendor not found');

  if (body.version !== undefined && body.version !== before.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'Vendor was modified by someone else');
  }

  if (body.name && body.name !== before.name) {
    const duplicate = await prisma.vendor.findUnique({
      where: { projectId_name: { projectId, name: body.name } },
      select: { id: true },
    });
    if (duplicate) throw ApiError.conflict('A vendor with this name already exists');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.vendor.updateMany({
      where: { id: vendorId, version: before.version },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.trade !== undefined ? { trade: body.trade } : {}),
        ...(body.contractValue !== undefined ? { contractValue: body.contractValue } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) {
      throw new ApiError(409, 'VERSION_CONFLICT', 'Vendor was modified by someone else');
    }
    const after = await tx.vendor.findUnique({ where: { id: vendorId } });
    await writeAudit(tx, {
      entity: 'vendor',
      entityId: vendorId,
      action: 'update',
      actorId: user.id,
      before: { ...before, contractValue: before.contractValue?.toString() ?? null },
      after: after ? { ...after, contractValue: after.contractValue?.toString() ?? null } : null,
    });
    return after;
  });

  return json({ vendor: updated ? { ...updated, contractValue: updated.contractValue?.toString() ?? null } : null });
});

export const DELETE = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId, vendorId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');

  const before = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Vendor not found');

  const inUse = await prisma.transaction.count({ where: { vendorId, deletedAt: null } });
  if (inUse > 0) {
    throw new ApiError(409, 'VENDOR_IN_USE', 'This vendor has transactions — deactivate it instead of deleting');
  }

  await prisma.$transaction(async (tx) => {
    await tx.vendor.delete({ where: { id: vendorId } });
    await writeAudit(tx, {
      entity: 'vendor',
      entityId: vendorId,
      action: 'delete',
      actorId: user.id,
      before: { ...before, contractValue: before.contractValue?.toString() ?? null },
    });
  });

  return json({ ok: true });
});
