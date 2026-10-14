import { describe, expect, it } from 'vitest';
import {
  addMemberSchema,
  createTransactionSchema,
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
  it('accepts supported image mime types', () => {
    expect(
      presignSchema.safeParse({ projectId: 'p1', parentType: 'transaction', mimeType: 'image/jpeg' }).success,
    ).toBe(true);
  });

  it('rejects non-image mime types', () => {
    expect(
      presignSchema.safeParse({ projectId: 'p1', parentType: 'transaction', mimeType: 'application/pdf' }).success,
    ).toBe(false);
  });
});

describe('addMemberSchema', () => {
  it('requires a valid role', () => {
    expect(addMemberSchema.safeParse({ email: 'x@y.com', role: 'owner' }).success).toBe(false);
    expect(addMemberSchema.safeParse({ email: 'x@y.com', role: 'viewer' }).success).toBe(true);
  });
});
