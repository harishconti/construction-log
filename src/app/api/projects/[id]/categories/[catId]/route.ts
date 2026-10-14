import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { updateCategorySchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string; catId: string }> };

export const PATCH = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const actor = await requireUser();
  await requireRole(params.id, actor.id, 'admin');
  const body = await parseJson(req, updateCategorySchema);

  const before = await prisma.category.findUnique({ where: { id: params.catId } });
  if (!before || before.projectId !== params.id) throw ApiError.notFound('Category not found');

  const category = await prisma.$transaction(async (tx) => {
    const updated = await tx.category.update({
      where: { id: before.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      select: { id: true, name: true, type: true, isActive: true },
    });
    await writeAudit(tx, {
      entity: 'category',
      entityId: updated.id,
      action: 'update',
      actorId: actor.id,
      before,
      after: updated,
    });
    return updated;
  });

  return json({ category });
});
