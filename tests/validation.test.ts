import { describe, expect, it } from 'vitest';
import {
  addMemberSchema,
  createFundingSchema,
  createProjectSchema,
  createTransactionSchema,
  finalizeAttachmentSchema,
  fundingSourceSchema,
  presignSchema,
  recordConsentSchema,
  requestDeletionSchema,
  updateFundingSchema,
  updateProjectSchema,
  updateTransactionSchema,
} from '../src/lib/validation/schemas';
import { POLICY_VERSION, REQUIRED_PURPOSES } from '../src/lib/legal';

describe('createTransactionSchema', () => {
  const base = {
    categoryId: 'cat_1',
    occurredAt: new Date(Date.now() - 1000),
    amount: 1000,
    paymentMode: 'cash' as const,
  };

  it('accepts a valid transaction and defaults gst to 0', () => {
    const out = createTransactionSchema.parse(base);
    expect(out.gstAmount).toBe(0);
  });

  it('rejects GST greater than amount', () => {
    const res = createTransactionSchema.safeParse({ ...base, gstAmount: 2000 });
    expect(res.success).toBe(false);
  });

  it('rejects a future occurredAt', () => {
    const res = createTransactionSchema.safeParse({ ...base, occurredAt: new Date(Date.now() + 86_400_000) });
    expect(res.success).toBe(false);
  });

  it('rejects a non-positive amount', () => {
    const res = createTransactionSchema.safeParse({ ...base, amount: 0 });
    expect(res.success).toBe(false);
  });
});

describe('updateTransactionSchema', () => {
  it('rejects GST greater than amount when both provided', () => {
    const res = updateTransactionSchema.safeParse({ amount: 100, gstAmount: 150 });
    expect(res.success).toBe(false);
  });

  it('allows partial updates', () => {
    expect(updateTransactionSchema.safeParse({ vendor: 'ABC' }).success).toBe(true);
  });
});

describe('presignSchema', () => {
  const base = { projectId: 'p1', parentType: 'transaction' as const, filename: 'bill.jpg' };

  it('accepts supported image and document types with a filename', () => {
    expect(presignSchema.safeParse({ ...base, mimeType: 'image/jpeg' }).success).toBe(true);
    expect(presignSchema.safeParse({ ...base, filename: 'invoice.pdf', mimeType: 'application/pdf' }).success).toBe(
      true,
    );
  });

  it('accepts the funding parent type', () => {
    expect(presignSchema.safeParse({ ...base, parentType: 'funding', mimeType: 'image/png' }).success).toBe(true);
  });

  it('requires a filename', () => {
    expect(presignSchema.safeParse({ projectId: 'p1', parentType: 'transaction', mimeType: 'image/png' }).success).toBe(
      false,
    );
  });

  it('rejects disallowed types like html and svg', () => {
    expect(presignSchema.safeParse({ ...base, mimeType: 'text/html' }).success).toBe(false);
    expect(presignSchema.safeParse({ ...base, mimeType: 'image/svg+xml' }).success).toBe(false);
  });

  it('rejects sizes above the category limit', () => {
    expect(presignSchema.safeParse({ ...base, mimeType: 'image/png', size: 11 * 1024 * 1024 }).success).toBe(false);
    expect(presignSchema.safeParse({ ...base, mimeType: 'image/png', size: 5 * 1024 * 1024 }).success).toBe(true);
  });
});

describe('addMemberSchema', () => {
  it('requires a valid role', () => {
    expect(addMemberSchema.safeParse({ email: 'x@y.com', role: 'owner' }).success).toBe(false);
    expect(addMemberSchema.safeParse({ email: 'x@y.com', role: 'viewer' }).success).toBe(true);
  });
});

describe('transaction attachments & version', () => {
  const base = {
    categoryId: 'cat_1',
    occurredAt: new Date(Date.now() - 1000),
    amount: 1000,
    paymentMode: 'cash' as const,
  };

  it('accepts attachmentIds (up to 10)', () => {
    expect(createTransactionSchema.safeParse({ ...base, attachmentIds: ['a1', 'a2'] }).success).toBe(true);
    expect(
      createTransactionSchema.safeParse({ ...base, attachmentIds: Array.from({ length: 11 }, (_, i) => `a${i}`) })
        .success,
    ).toBe(false);
  });

  it('accepts an optimistic-lock version on update', () => {
    expect(updateTransactionSchema.safeParse({ amount: 10, version: 3 }).success).toBe(true);
    expect(updateTransactionSchema.safeParse({ version: -1 }).success).toBe(false);
  });
});

describe('finalizeAttachmentSchema', () => {
  it('allows no parent, or exactly one parent', () => {
    expect(finalizeAttachmentSchema.safeParse({}).success).toBe(true);
    expect(finalizeAttachmentSchema.safeParse({ transactionId: 't1' }).success).toBe(true);
    expect(finalizeAttachmentSchema.safeParse({ diaryEntryId: 'd1' }).success).toBe(true);
    expect(finalizeAttachmentSchema.safeParse({ fundingId: 'f1' }).success).toBe(true);
  });

  it('rejects more than one parent', () => {
    expect(finalizeAttachmentSchema.safeParse({ transactionId: 't1', diaryEntryId: 'd1' }).success).toBe(false);
    expect(finalizeAttachmentSchema.safeParse({ transactionId: 't1', fundingId: 'f1' }).success).toBe(false);
    expect(finalizeAttachmentSchema.safeParse({ diaryEntryId: 'd1', fundingId: 'f1' }).success).toBe(false);
  });
});

describe('createFundingSchema', () => {
  const base = {
    source: 'bank' as const,
    amount: 100000,
    receivedAt: new Date(Date.now() - 1000),
    mode: 'bank' as const,
  };

  it('accepts a valid funding entry', () => {
    expect(createFundingSchema.safeParse(base).success).toBe(true);
    expect(createFundingSchema.safeParse({ ...base, sourceName: 'HDFC Bank', reference: 'UTR123' }).success).toBe(
      true,
    );
  });

  it('rejects a non-positive amount and an unknown source', () => {
    expect(createFundingSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(createFundingSchema.safeParse({ ...base, source: 'crypto' }).success).toBe(false);
  });

  it('rejects a future receivedAt', () => {
    expect(createFundingSchema.safeParse({ ...base, receivedAt: new Date(Date.now() + 86_400_000) }).success).toBe(
      false,
    );
  });

  it('caps attachmentIds at 10', () => {
    expect(createFundingSchema.safeParse({ ...base, attachmentIds: ['a1'] }).success).toBe(true);
    expect(
      createFundingSchema.safeParse({ ...base, attachmentIds: Array.from({ length: 11 }, (_, i) => `a${i}`) }).success,
    ).toBe(false);
  });
});

describe('updateFundingSchema', () => {
  it('allows partial updates with an optimistic-lock version', () => {
    expect(updateFundingSchema.safeParse({ amount: 500 }).success).toBe(true);
    expect(updateFundingSchema.safeParse({ version: 2 }).success).toBe(true);
    expect(updateFundingSchema.safeParse({ version: -1 }).success).toBe(false);
  });

  it('rejects an unknown source', () => {
    expect(updateFundingSchema.safeParse({ source: 'nope' }).success).toBe(false);
  });
});

describe('fundingSourceSchema', () => {
  it('accepts every source in the fixed vocabulary', () => {
    for (const s of ['bank', 'client', 'customer', 'peer_lending', 'self', 'grant', 'investor', 'other']) {
      expect(fundingSourceSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(fundingSourceSchema.safeParse('loan').success).toBe(false);
  });
});

describe('recordConsentSchema (DPDP)', () => {
  const base = { policyVersion: POLICY_VERSION, purposes: [...REQUIRED_PURPOSES], granted: true as const };

  it('accepts all required purposes with an affirmative flag', () => {
    expect(recordConsentSchema.safeParse(base).success).toBe(true);
  });

  it('accepts optional purposes on top of the required ones', () => {
    expect(
      recordConsentSchema.safeParse({ ...base, purposes: [...REQUIRED_PURPOSES, 'service_messages'] }).success,
    ).toBe(true);
  });

  it('requires the literal affirmative action, not a missing or false value', () => {
    expect(recordConsentSchema.safeParse({ ...base, granted: false }).success).toBe(false);
    expect(
      recordConsentSchema.safeParse({ policyVersion: base.policyVersion, purposes: base.purposes }).success,
    ).toBe(false);
  });

  it('rejects a grant that omits a required purpose', () => {
    expect(recordConsentSchema.safeParse({ ...base, purposes: ['account'] }).success).toBe(false);
  });

  it('rejects a stale policy version and an unknown purpose', () => {
    expect(recordConsentSchema.safeParse({ ...base, policyVersion: '2020-01-01' }).success).toBe(false);
    expect(recordConsentSchema.safeParse({ ...base, purposes: [...REQUIRED_PURPOSES, 'marketing'] }).success).toBe(
      false,
    );
  });
});

describe('requestDeletionSchema', () => {
  it('requires an explicit confirmation', () => {
    expect(requestDeletionSchema.safeParse({}).success).toBe(false);
    expect(requestDeletionSchema.safeParse({ confirm: false }).success).toBe(false);
  });

  it('accepts a confirmed request with an optional reason', () => {
    expect(requestDeletionSchema.safeParse({ confirm: true }).success).toBe(true);
    expect(requestDeletionSchema.safeParse({ confirm: true, reason: 'moving on' }).success).toBe(true);
    expect(requestDeletionSchema.safeParse({ confirm: true, reason: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('project location', () => {
  const base = { name: 'House', startDate: new Date('2026-01-01') };

  it('accepts nothing, a name alone, or a full coordinate pair', () => {
    expect(createProjectSchema.safeParse(base).success).toBe(true);
    expect(createProjectSchema.safeParse({ ...base, locationName: 'Whitefield, Bengaluru' }).success).toBe(true);
    expect(createProjectSchema.safeParse({ ...base, latitude: 12.9716, longitude: 77.5946 }).success).toBe(true);
  });

  it('rejects a lone coordinate', () => {
    expect(createProjectSchema.safeParse({ ...base, latitude: 12.9716 }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...base, longitude: 77.5946 }).success).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(createProjectSchema.safeParse({ ...base, latitude: 91, longitude: 0 }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...base, latitude: 0, longitude: 181 }).success).toBe(false);
  });

  it('lets an update change the name or clear the coordinates as a pair', () => {
    expect(updateProjectSchema.safeParse({ version: 2, locationName: null }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ latitude: null, longitude: null }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ latitude: null }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ latitude: 12.9, longitude: 77.5 }).success).toBe(true);
  });
});
