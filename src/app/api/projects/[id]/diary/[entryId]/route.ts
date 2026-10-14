import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { updateDiarySchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string; entryId: string }> };

export const PATCH = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const { id: projectId, entryId } = await paramsPromise;
  const user = await requireUser();
  const access = await requireRole(projectId, user.id, 'editor');
  const body = await parseJson(req, updateDiarySchema);

  const before = await prisma.diaryEntry.findUnique({ where: { id: entryId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Diary entry not found');

  if (access.role !== 'admin' && before.createdBy !== user.id) {
    throw ApiError.forbidden('Editors can only edit their own diary entries');
  }
  if (body.version !== undefined && body.version !== before.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'Diary entry was modified by someone else');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.diaryEntry.updateMany({
      where: { id: entryId, version: before.version },
      data: {
        ...(body.entryDate !== undefined ? { entryDate: body.entryDate } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) {
      throw new ApiError(409, 'VERSION_CONFLICT', 'Diary entry was modified by someone else');
    }
    const after = await tx.diaryEntry.findUnique({ where: { id: entryId } });
    await writeAudit(tx, {
      entity: 'diary_entry',
      entityId: entryId,
      action: 'update',
      actorId: user.id,
      before,
      after,
    });
    return after;
  });

  return json({ entry: updated });
});

export const DELETE = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId, entryId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');

  const before = await prisma.diaryEntry.findUnique({ where: { id: entryId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Diary entry not found');

  await prisma.$transaction(async (tx) => {
    await tx.diaryEntry.delete({ where: { id: entryId } }); // attachments cascade
    await writeAudit(tx, {
      entity: 'diary_entry',
      entityId: entryId,
      action: 'delete',
      actorId: user.id,
      before,
    });
  });

  return json({ ok: true });
});
