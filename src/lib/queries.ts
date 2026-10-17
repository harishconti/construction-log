import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { serializeAttachments } from './serialize';

// Read-side list queries shared by the API routes and the server-rendered pages. Pages use them to
// hand the first screenful to the client view, so a tab switch is one network round trip instead of
// two (page render, then a client fetch). Callers must already have checked membership/role.

export type PageInfo = { page: number; limit: number; total: number; pages: number };
type Paging = { page: number; limit: number; skip: number; take: number };

export const DEFAULT_TX_PAGING: Paging = { page: 1, limit: 25, skip: 0, take: 25 };
export const DEFAULT_FUNDING_PAGING: Paging = { page: 1, limit: 25, skip: 0, take: 25 };
export const DEFAULT_DIARY_PAGING: Paging = { page: 1, limit: 20, skip: 0, take: 20 };

/** Attachments for a set of parent rows, grouped by parent id. */
async function attachmentsBy(
  field: 'transactionId' | 'diaryEntryId' | 'fundingId',
  ids: string[],
) {
  const rows = ids.length
    ? await prisma.attachment.findMany({ where: { [field]: { in: ids } }, orderBy: { uploadedAt: 'asc' } })
    : [];
  const byParent = new Map<string, typeof rows>();
  for (const a of rows) {
    const parent = a[field];
    if (!parent) continue;
    const list = byParent.get(parent) ?? [];
    list.push(a);
    byParent.set(parent, list);
  }
  return byParent;
}

type TransactionRow = Prisma.TransactionGetPayload<{
  include: {
    category: { select: { id: true; name: true; type: true } };
    vendorEntity: { select: { id: true; name: true } };
  };
}>;

export function serializeTransaction(t: TransactionRow) {
  const { vendorEntity, ...rest } = t;
  return {
    ...rest,
    // Prefer the linked vendor's current name; fall back to the free-text snapshot.
    vendor: vendorEntity?.name ?? t.vendor,
    amount: t.amount.toString(),
    gstAmount: t.gstAmount.toString(),
  };
}

export type TransactionFilters = {
  categoryId?: string;
  paymentMode?: string;
  vendor?: string;
  from?: Date;
  to?: Date;
  includeDeleted?: boolean;
};

export async function listTransactions(projectId: string, f: TransactionFilters = {}, paging = DEFAULT_TX_PAGING) {
  const where: Prisma.TransactionWhereInput = {
    projectId,
    ...(f.includeDeleted ? {} : { deletedAt: null }),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.paymentMode ? { paymentMode: f.paymentMode } : {}),
    ...(f.vendor ? { vendor: { contains: f.vendor, mode: 'insensitive' } } : {}),
    ...(f.from || f.to
      ? { occurredAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: paging.skip,
      take: paging.take,
      include: {
        category: { select: { id: true, name: true, type: true } },
        vendorEntity: { select: { id: true, name: true } },
      },
    }),
  ]);

  const byParent = await attachmentsBy('transactionId', rows.map((t) => t.id));
  const items = await Promise.all(
    rows.map(async (t) => ({
      ...serializeTransaction(t),
      attachments: await serializeAttachments(byParent.get(t.id) ?? []),
    })),
  );
  const pagination: PageInfo = {
    page: paging.page,
    limit: paging.limit,
    total,
    pages: Math.ceil(total / paging.limit),
  };
  return { items, pagination };
}

type FundingRow = Prisma.FundingGetPayload<Record<string, never>>;

export function serializeFunding(f: FundingRow) {
  return { ...f, amount: f.amount.toString() };
}

export type FundingFilters = {
  source?: string;
  sourceName?: string;
  from?: Date;
  to?: Date;
  includeDeleted?: boolean;
};

export async function listFundings(projectId: string, f: FundingFilters = {}, paging = DEFAULT_FUNDING_PAGING) {
  const where: Prisma.FundingWhereInput = {
    projectId,
    ...(f.includeDeleted ? {} : { deletedAt: null }),
    ...(f.source ? { source: f.source } : {}),
    ...(f.sourceName ? { sourceName: { contains: f.sourceName, mode: 'insensitive' } } : {}),
    ...(f.from || f.to
      ? { receivedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.funding.count({ where }),
    prisma.funding.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      skip: paging.skip,
      take: paging.take,
    }),
  ]);

  const byParent = await attachmentsBy('fundingId', rows.map((x) => x.id));
  const items = await Promise.all(
    rows.map(async (x) => ({
      ...serializeFunding(x),
      attachments: await serializeAttachments(byParent.get(x.id) ?? []),
    })),
  );
  const pagination: PageInfo = {
    page: paging.page,
    limit: paging.limit,
    total,
    pages: Math.ceil(total / paging.limit),
  };
  return { items, pagination };
}

export async function listCategories(projectId: string, includeInactive = false) {
  return prisma.category.findMany({
    where: { projectId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, type: true, isActive: true },
  });
}

export type VendorSummary = {
  id: string;
  name: string;
  phone: string | null;
  trade: string | null;
  contractValue: string | null;
  notes: string | null;
  isActive: boolean;
  version: number;
  /** Sum of this vendor's non-deleted transactions. */
  paid: number;
  transactionCount: number;
  /** contractValue − paid (positive = still to pay); null when no contract value is set. */
  balance: number | null;
};

/** Vendors with derived totals: what has been paid, and the balance against an optional contract value. */
export async function listVendors(projectId: string, includeInactive = false): Promise<VendorSummary[]> {
  const vendors = await prisma.vendor.findMany({
    where: { projectId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      phone: true,
      trade: true,
      contractValue: true,
      notes: true,
      isActive: true,
      version: true,
    },
  });

  const ids = vendors.map((v) => v.id);
  const grouped = ids.length
    ? await prisma.transaction.groupBy({
        by: ['vendorId'],
        where: { projectId, vendorId: { in: ids }, deletedAt: null },
        _sum: { amount: true },
        _count: true,
      })
    : [];
  const byId = new Map(grouped.map((g) => [g.vendorId, { paid: Number(g._sum.amount ?? 0), count: g._count }]));

  return vendors.map((v) => {
    const paid = byId.get(v.id)?.paid ?? 0;
    const contractValue = v.contractValue === null ? null : Number(v.contractValue);
    return {
      id: v.id,
      name: v.name,
      phone: v.phone,
      trade: v.trade,
      notes: v.notes,
      isActive: v.isActive,
      version: v.version,
      contractValue: v.contractValue === null ? null : v.contractValue.toString(),
      paid,
      transactionCount: byId.get(v.id)?.count ?? 0,
      balance: contractValue === null ? null : contractValue - paid,
    };
  });
}

export async function listDiary(projectId: string, paging = DEFAULT_DIARY_PAGING) {
  const [total, rows] = await Promise.all([
    prisma.diaryEntry.count({ where: { projectId } }),
    prisma.diaryEntry.findMany({
      where: { projectId },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      skip: paging.skip,
      take: paging.take,
    }),
  ]);
  const byParent = await attachmentsBy('diaryEntryId', rows.map((e) => e.id));
  const items = await Promise.all(
    rows.map(async (e) => ({ ...e, attachments: await serializeAttachments(byParent.get(e.id) ?? []) })),
  );
  const pagination: PageInfo = {
    page: paging.page,
    limit: paging.limit,
    total,
    pages: Math.ceil(total / paging.limit),
  };
  return { items, pagination };
}

/** The type of `T` after a JSON round trip: Dates become ISO strings. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

/** Same shape the client gets from the JSON API (Dates → ISO strings, Decimals already strings). */
export function asJson<T>(data: T): Jsonify<T> {
  return JSON.parse(JSON.stringify(data)) as Jsonify<T>;
}
