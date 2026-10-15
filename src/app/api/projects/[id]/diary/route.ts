import { getPagination, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { rateLimit, WINDOW } from '@/lib/ratelimit';
import { writeAudit } from '@/lib/audit';
import { linkAttachments } from '@/lib/attachments';
import { withIdempotency } from '@/lib/idempotency';
import { listDiary } from '@/lib/queries';
import { serializeAttachments } from '@/lib/serialize';
import { createDiarySchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');
  return json(await listDiary(params.id, getPagination(new URL(req.url), 20, 100)));
});

export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'editor');
  await rateLimit(`diary:${user.id}`, 60, WINDOW.minute);
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
