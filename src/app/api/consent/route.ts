import { handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, WINDOW } from '@/lib/ratelimit';
import { writeAudit } from '@/lib/audit';
import { getActiveConsent, toStringArray } from '@/lib/consent';
import { CONSENT_PURPOSES, POLICY_VERSION, REQUIRED_PURPOSES } from '@/lib/legal';
import { recordConsentSchema } from '@/lib/validation/schemas';

/** First hop of `x-forwarded-for`, used as evidence of where consent was given (Vercel sets it). */
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || null;
}

/** Current consent state plus the notice the client should display. */
export const GET = handle(async () => {
  const user = await requireUser();
  const consent = await getActiveConsent(user.id);
  return json({
    policyVersion: POLICY_VERSION,
    purposes: CONSENT_PURPOSES,
    requiredPurposes: REQUIRED_PURPOSES,
    consent: consent
      ? { policyVersion: consent.policyVersion, purposes: consent.purposes, grantedAt: consent.grantedAt }
      : null,
  });
});

/**
 * Records a DPDP consent grant. Append-only: any previously active consent is withdrawn and a new
 * row is written, so the consent history (and the version consented to) is preserved.
 */
export const POST = handle(async (req) => {
  const user = await requireUser();
  await rateLimit(`consent:${user.id}`, 30, WINDOW.hour);
  const body = await parseJson(req, recordConsentSchema);

  const consent = await prisma.$transaction(async (tx) => {
    await tx.consentRecord.updateMany({
      where: { userId: user.id, withdrawnAt: null },
      data: { withdrawnAt: new Date() },
    });
    const created = await tx.consentRecord.create({
      data: {
        userId: user.id,
        policyVersion: body.policyVersion,
        purposes: body.purposes,
        userAgent: req.headers.get('user-agent'),
        ip: clientIp(req),
      },
      select: { id: true, policyVersion: true, purposes: true, grantedAt: true },
    });
    await writeAudit(tx, {
      entity: 'consent',
      entityId: created.id,
      action: 'create',
      actorId: user.id,
      after: { policyVersion: created.policyVersion, purposes: toStringArray(created.purposes) },
    });
    return created;
  });

  return json(
    {
      consent: {
        policyVersion: consent.policyVersion,
        purposes: toStringArray(consent.purposes),
        grantedAt: consent.grantedAt,
      },
    },
    201,
  );
});
