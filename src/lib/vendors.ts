import { Prisma } from '@prisma/client';

/**
 * Resolves a free-text vendor name to a `Vendor` row, creating it on first use. The name is the
 * canonical key within a project (`@@unique([projectId, name])`), so the same spelling reuses one
 * vendor — that is what makes per-vendor totals and balances work. Returns null for an empty name.
 */
export async function resolveVendorId(
  tx: Prisma.TransactionClient,
  opts: { projectId: string; createdBy: string; name?: string | null },
): Promise<string | null> {
  const name = opts.name?.trim();
  if (!name) return null;

  try {
    const vendor = await tx.vendor.upsert({
      where: { projectId_name: { projectId: opts.projectId, name } },
      update: {},
      create: { projectId: opts.projectId, name, createdBy: opts.createdBy },
      select: { id: true },
    });
    return vendor.id;
  } catch (err) {
    // Lost a creation race: another request inserted the same (project, name) first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await tx.vendor.findUnique({
        where: { projectId_name: { projectId: opts.projectId, name } },
        select: { id: true },
      });
      return existing?.id ?? null;
    }
    throw err;
  }
}
