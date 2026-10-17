import { describe, expect, it } from 'vitest';
import {
  createProjectSchema,
  createStageSchema,
  createTransactionSchema,
  updateProjectSchema,
  updateStageSchema,
} from '../src/lib/validation/schemas';

describe('createStageSchema', () => {
  it('accepts a name-only stage', () => {
    expect(createStageSchema.safeParse({ name: 'Plinth' }).success).toBe(true);
  });

  it('accepts a planned amount, dates and order, and clears dates with null', () => {
    expect(
      createStageSchema.safeParse({
        name: 'Slab',
        plannedAmount: 50000,
        plannedStart: '2026-01-01',
        plannedEnd: '2026-02-01',
        order: 2,
      }).success,
    ).toBe(true);
    expect(createStageSchema.safeParse({ name: 'Slab', plannedStart: null, plannedEnd: null }).success).toBe(true);
  });

  it('rejects a blank name and a negative planned amount', () => {
    expect(createStageSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createStageSchema.safeParse({ name: 'X', plannedAmount: -5 }).success).toBe(false);
  });
});

describe('updateStageSchema', () => {
  it('allows partial updates with an optimistic-lock version', () => {
    expect(updateStageSchema.safeParse({ plannedAmount: 100, version: 1 }).success).toBe(true);
    expect(updateStageSchema.safeParse({ version: -1 }).success).toBe(false);
  });
});

describe('project total budget', () => {
  it('accepts a total budget on create and clearing it on update', () => {
    expect(createProjectSchema.safeParse({ name: 'H', startDate: new Date(), totalBudget: 5_000_000 }).success).toBe(
      true,
    );
    expect(updateProjectSchema.safeParse({ totalBudget: null }).success).toBe(true);
  });

  it('rejects a negative total budget', () => {
    expect(createProjectSchema.safeParse({ name: 'H', startDate: new Date(), totalBudget: -1 }).success).toBe(false);
  });
});

describe('transaction stage tag', () => {
  const base = { categoryId: 'c1', occurredAt: new Date(Date.now() - 1000), amount: 100, paymentMode: 'cash' as const };

  it('accepts an optional stageId (or null)', () => {
    expect(createTransactionSchema.safeParse({ ...base, stageId: 's1' }).success).toBe(true);
    expect(createTransactionSchema.safeParse({ ...base, stageId: null }).success).toBe(true);
  });
});
