import { ApiError, getPagination, handle, json, parseJson, parseOptionalDate } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { rateLimit, WINDOW } from '@/lib/ratelimit';
import { writeAudit } from '@/lib/audit';
import { withIdempotency } from '@/lib/idempotency';
import { linkAttachments } from '@/lib/attachments';
import { listTransactions, serializeTransaction } from '@/lib/queries';
import { resolveVendorId } from '@/lib/vendors';
import {
  createTransactionSchema,
  paymentModeSchema,
} from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  const access = await requireRole(params.id, user.id, 'viewer');

  const url = new URL(req.url);
  const paging = getPagination(url, 25, 100);

  const paymentModeRaw = url.searchParams.get('paymentMode');
  const paymentMode = paymentModeRaw ? paymentModeSchema.safeParse(paymentModeRaw) : null;
  if (paymentMode && !paymentMode.success) {
    throw ApiError.badRequest('Invalid paymentMode filter');
  }

  return json(
    await listTransactions(
      params.id,
      {
        categoryId: url.searchParams.get('categoryId') ?? undefined,
        paymentMode: paymentMode?.success ? paymentMode.data : undefined,
        vendor: url.searchParams.get('vendor') ?? undefined,
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
  await rateLimit(`tx:${user.id}`, 120, WINDOW.minute);
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
    async (tx) => {
      const vendorId = await resolveVendorId(tx, {
        projectId: params.id,
        createdBy: user.id,
        name: body.vendor,
      });
      const created = await tx.transaction.create({
        data: {
          projectId: params.id,
          categoryId: body.categoryId,
          occurredAt: body.occurredAt,
          amount: body.amount,
          gstAmount: body.gstAmount,
          vendor: body.vendor ?? null,
          vendorId,
          paymentMode: body.paymentMode,
          description: body.description ?? null,
          createdBy: user.id,
        },
        include: {
          category: { select: { id: true, name: true, type: true } },
          vendorEntity: { select: { id: true, name: true } },
        },
      });

      if (body.attachmentIds?.length) {
        await linkAttachments(tx, {
          projectId: params.id,
          parent: 'transaction',
          parentId: created.id,
          attachmentIds: body.attachmentIds,
        });
      }

      await writeAudit(tx, {
        entity: 'transaction',
        entityId: created.id,
        action: 'create',
        actorId: user.id,
        after: created,
      });

      return serializeTransaction(created);
    },
  );

  return json({ transaction }, 201);
});
