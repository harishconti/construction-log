import { handle, json } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Liveness/readiness probe. Exposes no secrets; just whether the app and DB respond. */
export const GET = handle(async () => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  return json({ status: 'ok', db, time: new Date().toISOString() });
});
