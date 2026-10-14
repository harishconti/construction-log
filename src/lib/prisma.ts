import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    // Prisma's defaults (2s to get a connection, 5s per interactive transaction) are too tight for
    // serverless Neon: a compute waking from idle, or a dev machine far from the region, can push a
    // multi-statement write (idempotency lock + insert + audit) past 5s and abort it (P2028).
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
