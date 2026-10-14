import { handle, json } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Liveness/readiness probe. Exposes no secrets; 503 when the database is unreachable. */
export const GET = handle(async () => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  return json({ status: db ? 'ok' : 'degraded', db, time: new Date().toISOString() }, db ? 200 : 503);
});
