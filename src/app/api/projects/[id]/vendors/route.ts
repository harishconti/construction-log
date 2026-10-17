import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { listVendors } from '@/lib/queries';
import { createVendorSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');

  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === 'true';
  return json({ vendors: await listVendors(params.id, includeInactive) });
});

export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'editor');
  const body = await parseJson(req, createVendorSchema);

  const duplicate = await prisma.vendor.findUnique({
    where: { projectId_name: { projectId: params.id, name: body.name } },
    select: { id: true },
  });
  if (duplicate) throw ApiError.conflict('A vendor with this name already exists');

  const vendor = await prisma.$transaction(async (tx) => {
    const created = await tx.vendor.create({
      data: {
        projectId: params.id,
        name: body.name,
        phone: body.phone ?? null,
        trade: body.trade ?? null,
        contractValue: body.contractValue ?? null,
        notes: body.notes ?? null,
        createdBy: user.id,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        trade: true,
        contractValue: true,
        notes: true,
        isActive: true,
      },
    });
    await writeAudit(tx, {
      entity: 'vendor',
      entityId: created.id,
      action: 'create',
      actorId: user.id,
      after: { ...created, contractValue: created.contractValue?.toString() ?? null },
    });
    return created;
  });

  return json({ vendor: { ...vendor, contractValue: vendor.contractValue?.toString() ?? null } }, 201);
});
