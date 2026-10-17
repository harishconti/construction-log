import { describe, expect, it } from 'vitest';
import {
  FUNDING_SOURCES,
  FUNDING_SOURCE_HINT,
  FUNDING_SOURCE_LABEL,
  isFundingSource,
} from '../src/lib/funding';
import { categoryTypeSchema, fundingSourceSchema } from '../src/lib/validation/schemas';

describe('funding source vocabulary', () => {
  it('has a label and hint for every source', () => {
    for (const s of FUNDING_SOURCES) {
      expect(FUNDING_SOURCE_LABEL[s]).toBeTruthy();
      expect(FUNDING_SOURCE_HINT[s]).toBeTruthy();
    }
  });

  it('keeps the zod enum in sync with the source array', () => {
    expect(fundingSourceSchema.options).toEqual([...FUNDING_SOURCES]);
  });

  it('guards unknown source values', () => {
    expect(isFundingSource('self')).toBe(true);
    expect(isFundingSource('crypto')).toBe(false);
    expect(isFundingSource(null)).toBe(false);
  });
});

describe('categoryTypeSchema', () => {
  it('includes the expanded expense types', () => {
    for (const t of ['equipment', 'transport', 'professional', 'subcontract', 'overhead', 'finance', 'misc']) {
      expect(categoryTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('still rejects unknown types', () => {
    expect(categoryTypeSchema.safeParse('bribes').success).toBe(false);
  });
});
