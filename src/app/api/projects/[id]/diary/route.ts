import { getPagination, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { linkAttachments } from '@/lib/attachments';
import { withIdempotency } from '@/lib/idempotency';
import { serializeAttachments } from '@/lib/serialize';
import { createDiarySchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');

  const url = new URL(req.url);
  const { skip, take, page, limit } = getPagination(url, 20, 100);

  const [total, rows] = await Promise.all([
    prisma.diaryEntry.count({ where: { projectId: params.id } }),
    prisma.diaryEntry.findMany({
      where: { projectId: params.id },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);

  const ids = rows.map((e) => e.id);
  const attachments = ids.length
    ? await prisma.attachment.findMany({ where: { diaryEntryId: { in: ids } }, orderBy: { uploadedAt: 'asc' } })
    : [];
  const byParent = new Map<string, typeof attachments>();
  for (const a of attachments) {
    if (!a.diaryEntryId) continue;
    const list = byParent.get(a.diaryEntryId) ?? [];
    list.push(a);
    byParent.set(a.diaryEntryId, list);
  }

  const items = await Promise.all(
    rows.map(async (e) => ({ ...e, attachments: await serializeAttachments(byParent.get(e.id) ?? []) })),
  );

  return json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'editor');
  const body = await parseJson(req, createDiarySchema);

  const { data: entry } = await withIdempotency(
    { projectId: params.id, userId: user.id, key: req.headers.get('idempotency-key'), body },
    async (tx) => {
      const created = await tx.diaryEntry.create({
        data: {
          projectId: params.id,
          entryDate: body.entryDate,
          title: body.title,
          body: body.body,
          createdBy: user.id,
        },
      });
      if (body.attachmentIds?.length) {
        await linkAttachments(tx, {
          projectId: params.id,
          parent: 'diary',
          parentId: created.id,
          attachmentIds: body.attachmentIds,
        });
      }
      await writeAudit(tx, {
        entity: 'diary_entry',
        entityId: created.id,
        action: 'create',
        actorId: user.id,
        after: created,
      });
      return created;
    },
  );

  return json({ entry }, 201);
});
