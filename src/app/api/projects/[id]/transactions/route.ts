import { Prisma } from '@prisma/client';
import { ApiError, getPagination, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { withIdempotency } from '@/lib/idempotency';
import { serializeAttachments } from '@/lib/serialize';
import {
  createTransactionSchema,
  paymentModeSchema,
} from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

type TransactionRow = Prisma.TransactionGetPayload<{
  include: { category: { select: { id: true; name: true; type: true } } };
}>;

async function serializeTransaction(t: TransactionRow) {
  return {
    ...t,
    amount: t.amount.toString(),
    gstAmount: t.gstAmount.toString(),
  };
}

export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  const access = await requireRole(params.id, user.id, 'viewer');

  const url = new URL(req.url);
  const { skip, take, page, limit } = getPagination(url, 25, 100);

  const categoryId = url.searchParams.get('categoryId') ?? undefined;
  const paymentModeRaw = url.searchParams.get('paymentMode');
  const vendor = url.searchParams.get('vendor') ?? undefined;
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const includeDeleted = url.searchParams.get('includeDeleted') === 'true' && access.role === 'admin';

  const paymentMode = paymentModeRaw ? paymentModeSchema.safeParse(paymentModeRaw) : null;
  if (paymentMode && !paymentMode.success) {
    throw ApiError.badRequest('Invalid paymentMode filter');
  }

  const where: Prisma.TransactionWhereInput = {
    projectId: params.id,
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(categoryId ? { categoryId } : {}),
    ...(paymentMode && paymentMode.success ? { paymentMode: paymentMode.data } : {}),
    ...(vendor ? { vendor: { contains: vendor, mode: 'insensitive' } } : {}),
    ...(from || to
      ? {
          occurredAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
      include: { category: { select: { id: true, name: true, type: true } } },
    }),
  ]);

  const ids = rows.map((t) => t.id);
  const attachments = ids.length
    ? await prisma.attachment.findMany({
        where: { transactionId: { in: ids } },
        orderBy: { uploadedAt: 'asc' },
      })
    : [];

  const byParent = new Map<string, typeof attachments>();
  for (const a of attachments) {
    if (!a.transactionId) continue;
    const list = byParent.get(a.transactionId) ?? [];
    list.push(a);
    byParent.set(a.transactionId, list);
  }

  const items = await Promise.all(
    rows.map(async (t) => ({
      ...(await serializeTransaction(t)),
      attachments: await serializeAttachments(byParent.get(t.id) ?? []),
    })),
  );

  return json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'editor');
  const body = await parseJson(req, createTransactionSchema);

  const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
  if (!category || category.projectId !== params.id) {
    throw ApiError.badRequest('Category does not belong to this project', 'INVALID_CATEGORY');
  }
  if (!category.isActive) {
    throw ApiError.badRequest('Category is inactive', 'INACTIVE_CATEGORY');
  }

  const { data: transaction } = await withIdempotency(
    { projectId: params.id, userId: user.id, key: req.headers.get('idempotency-key'), body },
    async () =>
      prisma.$transaction(async (tx) => {
        const created = await tx.transaction.create({
          data: {
            projectId: params.id,
            categoryId: body.categoryId,
            occurredAt: body.occurredAt,
            amount: body.amount,
            gstAmount: body.gstAmount,
            vendor: body.vendor ?? null,
            paymentMode: body.paymentMode,
            description: body.description ?? null,
            createdBy: user.id,
          },
          include: { category: { select: { id: true, name: true, type: true } } },
        });

        if (body.attachmentIds?.length) {
          await linkAttachments(tx, params.id, created.id, body.attachmentIds);
        }

        await writeAudit(tx, {
          entity: 'transaction',
          entityId: created.id,
          action: 'create',
          actorId: user.id,
          after: created,
        });

        return serializeTransaction(created);
      }),
  );

  return json({ transaction }, 201);
});

async function linkAttachments(
  tx: Prisma.TransactionClient,
  projectId: string,
  transactionId: string,
  attachmentIds: string[],
): Promise<void> {
  const attachments = await tx.attachment.findMany({ where: { id: { in: attachmentIds } } });
  if (attachments.length !== attachmentIds.length) {
    throw ApiError.badRequest('One or more attachments were not found');
  }
  for (const a of attachments) {
    if (a.projectId !== projectId) throw ApiError.badRequest('Attachment belongs to another project');
    if (a.status !== 'ready') throw ApiError.badRequest('Attachment has not been finalized');
    if (a.transactionId || a.diaryEntryId) throw ApiError.badRequest('Attachment is already attached');
  }
  await tx.attachment.updateMany({
    where: { id: { in: attachmentIds } },
    data: { transactionId },
  });
}
