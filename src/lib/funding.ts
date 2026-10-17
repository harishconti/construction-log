// Funding sources: where a project's money comes IN from. This is a fixed vocabulary — the zod enum
// in `validation/schemas.ts` and the DB `CHECK` (`funding_source_check`, see
// `prisma/migrations/20261017120000_funding`) must list exactly these values.

export const FUNDING_SOURCES = [
  'bank',
  'client',
  'customer',
  'peer_lending',
  'self',
  'grant',
  'investor',
  'other',
] as const;

export type FundingSource = (typeof FUNDING_SOURCES)[number];

export const FUNDING_SOURCE_LABEL: Record<FundingSource, string> = {
  bank: 'Bank loan',
  client: 'Client',
  customer: 'Customer',
  peer_lending: 'Peer lending',
  self: 'Self funding',
  grant: 'Grant',
  investor: 'Investor',
  other: 'Other',
};

/** Who each source typically is, shown as helper text in the add/edit form. */
export const FUNDING_SOURCE_HINT: Record<FundingSource, string> = {
  bank: 'Loan or credit line from a bank',
  client: 'Payment received from the project owner / client',
  customer: 'Advance or payment from a buyer',
  peer_lending: 'Borrowed from a friend, relative or peer',
  self: 'Your own money put into the project',
  grant: 'Grant or subsidy received',
  investor: 'Investment / equity brought in',
  other: 'Any other source',
};

export function isFundingSource(value: unknown): value is FundingSource {
  return typeof value === 'string' && (FUNDING_SOURCES as readonly string[]).includes(value);
}
