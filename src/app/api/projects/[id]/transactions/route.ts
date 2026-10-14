import { Prisma } from '@prisma/client';
import { ApiError, getPagination, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { publicUrlForKey } from '@/lib/r2';
import { serializeAttachments } from '@/lib/serialize';
import { createTransactionSchema, paymentModeSchema, parentTypeSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

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
      select: {
        id: true,
        occurredAt: true,
        amount: true,
        gstAmount: true,
        vendor: true,
        paymentMode: true,
        description: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        category: { select: { id: true, name: true, type: true } },
      },
    }),
  ]);

  const ids = rows.map((t) => t.id);
  const attachments = ids.length
    ? await prisma.attachment.findMany({
        where: { parentType: 'transaction', parentId: { in: ids } },
        orderBy: { uploadedAt: 'asc' },
      })
    : [];

  const byParent = new Map<string, typeof attachments>();
  for (const a of attachments) {
    const list = byParent.get(a.parentId) ?? [];
    list.push(a);
    byParent.set(a.parentId, list);
  }

  const items = await Promise.all(
    rows.map(async (t) => ({
      ...t,
      amount: t.amount.toString(),
      gstAmount: t.gstAmount.toString(),
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

  const created = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
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
    });

    if (body.fileKeys?.length) {
      await tx.attachment.createMany({
        data: body.fileKeys.map((fileKey) => ({
          projectId: params.id,
          parentType: parentTypeSchema.enum.transaction,
          parentId: transaction.id,
          fileKey,
          fileUrl: publicUrlForKey(fileKey),
          mimeType: guessMime(fileKey),
          uploadedBy: user.id,
        })),
      });
    }

    await writeAudit(tx, {
      entity: 'transaction',
      entityId: transaction.id,
      action: 'create',
      actorId: user.id,
      after: transaction,
    });

    return transaction;
  });

  return json(
    {
      transaction: {
        ...created,
        amount: created.amount.toString(),
        gstAmount: created.gstAmount.toString(),
      },
    },
    201,
  );
});

function guessMime(fileKey: string): string {
  const ext = fileKey.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    default:
      return 'image/jpeg';
  }
}
