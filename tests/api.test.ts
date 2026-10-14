import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ApiError,
  errorResponse,
  getPagination,
  handle,
  parseJson,
  parseOptionalDate,
} from '../src/lib/api';

async function body(res: Response) {
  return { status: res.status, json: (await res.json()) as { error: string; code: string } };
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: '5.22.0' });

describe('errorResponse', () => {
  it('serialises ApiError as { error, code } with its status', async () => {
    expect(await body(errorResponse(ApiError.forbidden()))).toEqual({
      status: 403,
      json: { error: 'Insufficient permissions', code: 'FORBIDDEN' },
    });
    expect((await body(errorResponse(ApiError.unauthorized()))).status).toBe(401);
    expect((await body(errorResponse(ApiError.notFound()))).status).toBe(404);
    expect((await body(errorResponse(ApiError.badRequest('x', 'INVALID_GST')))).json.code).toBe('INVALID_GST');
  });

  it('maps Prisma P2002 → 409, P2025 → 404, P2034 → 409 WRITE_CONFLICT', async () => {
    expect(await body(errorResponse(prismaError('P2002')))).toMatchObject({ status: 409, json: { code: 'CONFLICT' } });
    expect(await body(errorResponse(prismaError('P2025')))).toMatchObject({ status: 404, json: { code: 'NOT_FOUND' } });
    expect(await body(errorResponse(prismaError('P2034')))).toMatchObject({
      status: 409,
      json: { code: 'WRITE_CONFLICT' },
    });
  });

  it('maps an expired interactive transaction (P2028) to a retryable 503, not a 500', async () => {
    // The transaction was rolled back, so retrying (with the same Idempotency-Key) is safe.
    expect(await body(errorResponse(prismaError('P2028')))).toEqual({
      status: 503,
      json: { error: 'The database was slow to respond, please retry', code: 'TRANSACTION_TIMEOUT' },
    });
  });

  it('maps zod errors to 422 with the failing path in the message', async () => {
    const result = z.object({ amount: z.number() }).safeParse({ amount: 'x' });
    const res = await body(errorResponse(result.success ? null : result.error));
    expect(res.status).toBe(422);
    expect(res.json.code).toBe('VALIDATION_ERROR');
    expect(res.json.error).toMatch(/^amount: /);
  });

  it('hides unknown errors behind a generic 500', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const res = await body(errorResponse(new Error('secret connection string')));
      expect(res).toEqual({ status: 500, json: { error: 'Internal server error', code: 'INTERNAL_ERROR' } });
    } finally {
      console.error = original;
    }
  });
});

describe('handle', () => {
  it('turns thrown errors into JSON responses', async () => {
    const route = handle(async () => {
      throw ApiError.conflict('dup');
    });
    const res = await route(new Request('http://x'), {});
    expect(await body(res)).toEqual({ status: 409, json: { error: 'dup', code: 'CONFLICT' } });
  });
});

describe('parseJson', () => {
  const schema = z.object({ name: z.string() });
  const req = (raw: string) => new Request('http://x', { method: 'POST', body: raw });

  it('returns parsed data for valid input', async () => {
    await expect(parseJson(req('{"name":"a"}'), schema)).resolves.toEqual({ name: 'a' });
  });

  it('rejects malformed JSON with 400 BAD_REQUEST', async () => {
    await expect(parseJson(req('{nope'), schema)).rejects.toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });

  it('throws a ZodError for schema violations (→ 422 via handle)', async () => {
    await expect(parseJson(req('{"name":1}'), schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe('getPagination', () => {
  const page = (qs: string) => getPagination(new URL(`http://x/?${qs}`), 25, 100);

  it('defaults to page 1 with the default limit', () => {
    expect(page('')).toEqual({ page: 1, limit: 25, skip: 0, take: 25 });
  });

  it('computes skip from page and clamps limit to [1, max]', () => {
    expect(page('page=3&limit=10')).toMatchObject({ skip: 20, take: 10 });
    expect(page('limit=1000').limit).toBe(100);
    expect(page('limit=-5').limit).toBe(1);
  });

  it('treats junk and non-positive pages as page 1', () => {
    expect(page('page=abc').page).toBe(1);
    expect(page('page=0').page).toBe(1);
    expect(page('page=-2').page).toBe(1);
  });
});

describe('parseOptionalDate', () => {
  it('returns undefined for missing values and a Date for ISO input', () => {
    expect(parseOptionalDate(null)).toBeUndefined();
    expect(parseOptionalDate('2026-10-14')?.toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });

  it('throws 422 for unparseable dates', () => {
    expect(() => parseOptionalDate('not-a-date')).toThrow(ApiError);
    try {
      parseOptionalDate('not-a-date');
    } catch (e) {
      expect(e).toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    }
  });
});
