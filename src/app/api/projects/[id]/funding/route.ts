import { ApiError, getPagination, handle, json, parseJson, parseOptionalDate } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { rateLimit, WINDOW } from '@/lib/ratelimit';
import { writeAudit } from '@/lib/audit';
import { withIdempotency } from '@/lib/idempotency';
import { linkAttachments } from '@/lib/attachments';
import { listFundings, serializeFunding } from '@/lib/queries';
import { createFundingSchema, fundingSourceSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  const access = await requireRole(params.id, user.id, 'viewer');

  const url = new URL(req.url);
  const paging = getPagination(url, 25, 100);

  const sourceRaw = url.searchParams.get('source');
  const source = sourceRaw ? fundingSourceSchema.safeParse(sourceRaw) : null;
  if (source && !source.success) {
    throw ApiError.badRequest('Invalid source filter');
  }

  return json(
    await listFundings(
      params.id,
      {
        source: source?.success ? source.data : undefined,
        sourceName: url.searchParams.get('sourceName') ?? undefined,
        from: parseOptionalDate(url.searchParams.get('from')),
        to: parseOptionalDate(url.searchParams.get('to')),
        includeDeleted: url.searchParams.get('includeDeleted') === 'true' && access.role === 'admin',
      },
      paging,
    ),
  );
});

export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'editor');
  await rateLimit(`funding:${user.id}`, 120, WINDOW.minute);
  const body = await parseJson(req, createFundingSchema);

  const { data: funding } = await withIdempotency(
    { projectId: params.id, userId: user.id, key: req.headers.get('idempotency-key'), body },
    async (tx) => {
      const created = await tx.funding.create({
        data: {
          projectId: params.id,
          source: body.source,
          sourceName: body.sourceName ?? null,
          amount: body.amount,
          receivedAt: body.receivedAt,
          mode: body.mode,
          reference: body.reference ?? null,
          description: body.description ?? null,
          createdBy: user.id,
        },
      });

      if (body.attachmentIds?.length) {
        await linkAttachments(tx, {
          projectId: params.id,
          parent: 'funding',
          parentId: created.id,
          attachmentIds: body.attachmentIds,
        });
      }

      await writeAudit(tx, {
        entity: 'funding',
        entityId: created.id,
        action: 'create',
        actorId: user.id,
        after: { ...created, amount: created.amount.toString() },
      });

      return serializeFunding(created);
    },
  );

  return json({ funding }, 201);
});
