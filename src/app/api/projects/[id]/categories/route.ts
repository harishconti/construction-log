import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { listCategories } from '@/lib/queries';
import { createCategorySchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');

  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === 'true';
  const categories = await listCategories(params.id, includeInactive);

  return json({ categories });
});

export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const actor = await requireUser();
  await requireRole(params.id, actor.id, 'admin');
  const body = await parseJson(req, createCategorySchema);

  const duplicate = await prisma.category.findUnique({
    where: { projectId_name: { projectId: params.id, name: body.name } },
    select: { id: true },
  });
  if (duplicate) throw ApiError.conflict('A category with this name already exists');

  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.category.create({
      data: { projectId: params.id, name: body.name, type: body.type },
      select: { id: true, name: true, type: true, isActive: true },
    });
    await writeAudit(tx, {
      entity: 'category',
      entityId: created.id,
      action: 'create',
      actorId: actor.id,
      after: created,
    });
    return created;
  });

  return json({ category }, 201);
});
