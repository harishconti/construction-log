import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { resolveVendorId } from '../src/lib/vendors';
import { createVendorSchema, updateVendorSchema } from '../src/lib/validation/schemas';

function tx(overrides: Partial<{ upsert: unknown; findUnique: unknown }> = {}) {
  return {
    vendor: {
      upsert: vi.fn().mockResolvedValue({ id: 'v1' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'v2' }),
      ...overrides,
    },
  } as unknown as Prisma.TransactionClient;
}

describe('resolveVendorId', () => {
  it('returns null for a missing or blank name without touching the DB', async () => {
    const t = tx();
    expect(await resolveVendorId(t, { projectId: 'p', createdBy: 'u', name: null })).toBeNull();
    expect(await resolveVendorId(t, { projectId: 'p', createdBy: 'u', name: '   ' })).toBeNull();
    expect((t.vendor.upsert as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('upserts on the (project, name) key (creating the vendor on first use) and trims the name', async () => {
    const t = tx();
    const id = await resolveVendorId(t, { projectId: 'p', createdBy: 'u', name: '  Mason  ' });
    expect(id).toBe('v1');
    expect(t.vendor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_name: { projectId: 'p', name: 'Mason' } },
        create: expect.objectContaining({ projectId: 'p', name: 'Mason', createdBy: 'u' }),
      }),
    );
  });

  it('re-reads the vendor when a concurrent create wins the unique key (P2002)', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' });
    const t = tx({
      upsert: vi.fn().mockRejectedValue(err),
      findUnique: vi.fn().mockResolvedValue({ id: 'v2' }),
    });
    expect(await resolveVendorId(t, { projectId: 'p', createdBy: 'u', name: 'Mason' })).toBe('v2');
    expect(t.vendor.findUnique).toHaveBeenCalledWith({
      where: { projectId_name: { projectId: 'p', name: 'Mason' } },
      select: { id: true },
    });
  });
});

describe('createVendorSchema', () => {
  it('accepts a name-only vendor', () => {
    expect(createVendorSchema.safeParse({ name: 'Sharma Masonry' }).success).toBe(true);
  });

  it('accepts optional phone, trade, contract value and notes', () => {
    const res = createVendorSchema.safeParse({
      name: 'Sharma Masonry',
      phone: '+91 90000 00000',
      trade: 'Mason',
      contractValue: 250000,
      notes: 'Does the brickwork',
    });
    expect(res.success).toBe(true);
  });

  it('trims the name and rejects a blank one', () => {
    expect(createVendorSchema.parse({ name: '  Sharma  ' }).name).toBe('Sharma');
    expect(createVendorSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a negative contract value and more than 2 decimals', () => {
    expect(createVendorSchema.safeParse({ name: 'X', contractValue: -1 }).success).toBe(false);
    expect(createVendorSchema.safeParse({ name: 'X', contractValue: 1.234 }).success).toBe(false);
  });
});

describe('updateVendorSchema', () => {
  it('allows partial updates and an optimistic-lock version', () => {
    expect(updateVendorSchema.safeParse({ phone: '123' }).success).toBe(true);
    expect(updateVendorSchema.safeParse({ isActive: false, version: 3 }).success).toBe(true);
    expect(updateVendorSchema.safeParse({ version: -1 }).success).toBe(false);
  });

  it('rejects an empty rename', () => {
    expect(updateVendorSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
