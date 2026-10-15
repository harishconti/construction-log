/**
 * Legal / consent constants for the DPDP Act, 2023 (India) flow.
 *
 * Kept in one module so the Terms, Privacy Policy, the sign-up notice, the consent gate and the
 * server-side validation all reference the same version string and the same itemised purpose list.
 * Pure functions only — safe to import from both server and client components.
 */

export const APP_NAME = 'Construction Ledger';

/**
 * The version of the Terms + Privacy notice a user is asked to accept. Bump this **whenever either
 * document changes materially**: an account whose newest consent is for an older version is sent
 * back through the consent gate (`hasCurrentConsent()`), so the change is re-accepted explicitly.
 */
export const POLICY_VERSION = '2026-10-15';
export const TERMS_VERSION = POLICY_VERSION;
export const PRIVACY_VERSION = POLICY_VERSION;

/** Human-readable date shown on the legal pages ("Last updated"). */
export const POLICY_UPDATED = '15 October 2026';

/** Where a Data Principal (user) sends access / correction / grievance requests. */
export const LEGAL_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL ?? 'privacy@harishspace.in';

/** Days between requesting erasure and it being processed. Cancellable for the whole window. */
export const DELETION_GRACE_DAYS = 30;

export const CONSENT_PURPOSE_KEYS = ['account', 'ledger', 'service_messages'] as const;
export type ConsentPurposeKey = (typeof CONSENT_PURPOSE_KEYS)[number];

export type ConsentPurpose = {
  key: ConsentPurposeKey;
  title: string;
  description: string;
  /**
   * Required purposes are necessary to run the ledger at all; they cannot be left unchecked while
   * the account continues to exist. An optional purpose can be turned off from Account settings.
   */
  required: boolean;
};

/**
 * DPDP §6(1) requires consent to be free, specific, informed and unambiguous, given by clear
 * affirmative action, limited to the specified purpose. Each purpose is therefore listed and
 * consented to individually.
 */
export const CONSENT_PURPOSES: ConsentPurpose[] = [
  {
    key: 'account',
    title: 'Account and sign-in',
    description:
      'To create and secure your account, sign you in, and keep your projects and role separate from everyone else’s.',
    required: true,
  },
  {
    key: 'ledger',
    title: 'Your project ledger',
    description:
      'To store and process the expenses, diary entries, budgets and bill photos you add, so your project team can use the ledger.',
    required: true,
  },
  {
    key: 'service_messages',
    title: 'Non-essential service messages',
    description:
      'To email you non-essential service messages such as invitation reminders. Essential account and security emails are sent regardless.',
    required: false,
  },
];

export const REQUIRED_PURPOSES: ConsentPurposeKey[] = CONSENT_PURPOSES.filter((p) => p.required).map(
  (p) => p.key,
);

export function isConsentPurposeKey(value: string): value is ConsentPurposeKey {
  return (CONSENT_PURPOSE_KEYS as readonly string[]).includes(value);
}

/** Required purposes absent from a proposed grant — used by the API and by tests. */
export function missingRequiredPurposes(granted: readonly string[]): ConsentPurposeKey[] {
  return REQUIRED_PURPOSES.filter((p) => !granted.includes(p));
}

/** When erasure requested at `from` completes (30 days later by default). */
export function deletionScheduledFor(from: Date = new Date(), days = DELETION_GRACE_DAYS): Date {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d;
}
