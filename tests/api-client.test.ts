import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, api, newIdempotencyKey } from '../src/lib/api-client';

function mockFetch(status: number, payload?: unknown, raw?: string) {
  const fn = vi.fn(async () =>
    new Response(raw ?? (payload === undefined ? null : JSON.stringify(payload)), {
      status,
      statusText: status === 500 ? 'Internal Server Error' : 'OK',
    }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('sends JSON bodies and custom headers (e.g. Idempotency-Key)', async () => {
    const fetch = mockFetch(201, { ok: true });
    await api.post('/api/x', { a: 1 }, { 'Idempotency-Key': 'k1' });
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/x');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'Idempotency-Key': 'k1' });
  });

  it('returns undefined for 204 responses', async () => {
    mockFetch(204);
    await expect(api.delete('/api/x')).resolves.toBeUndefined();
  });

  it('throws ApiClientError carrying the server code and status', async () => {
    mockFetch(409, { error: 'Transaction was modified by someone else', code: 'VERSION_CONFLICT' });
    const err = await api.patch('/api/x', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
      message: 'Transaction was modified by someone else',
    });
  });

  it('falls back to statusText when the error body is not JSON', async () => {
    mockFetch(500, undefined, '<html>oops</html>');
    await expect(api.get('/api/x')).rejects.toMatchObject({ status: 500, code: 'ERROR' });
  });
});

describe('newIdempotencyKey', () => {
  it('returns unique keys', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it('works without crypto.randomUUID (plain-HTTP dev on a phone)', () => {
    vi.stubGlobal('crypto', {});
    expect(newIdempotencyKey()).toMatch(/^k-\d+-[a-z0-9]+$/);
  });
});
