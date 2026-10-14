import { describe, expect, it } from 'vitest';
import {
  addMemberSchema,
  createTransactionSchema,
  finalizeAttachmentSchema,
  presignSchema,
  registerSchema,
  updateTransactionSchema,
} from '../src/lib/validation/schemas';

describe('registerSchema', () => {
  it('accepts a valid signup and lowercases the email', () => {
    const out = registerSchema.parse({ name: 'Ann', email: 'Ann@Example.com', password: 'password123' });
    expect(out.email).toBe('ann@example.com');
  });

  it('rejects short passwords', () => {
    expect(registerSchema.safeParse({ name: 'Ann', email: 'a@b.com', password: 'short' }).success).toBe(false);
  });
});

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
  });

  it('rejects two parents', () => {
    expect(finalizeAttachmentSchema.safeParse({ transactionId: 't1', diaryEntryId: 'd1' }).success).toBe(false);
  });
});
