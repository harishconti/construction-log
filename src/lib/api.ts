import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';

export type ApiErrorBody = { error: string; code: string };

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Insufficient permissions') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(409, 'CONFLICT', message);
  }

  static badRequest(message = 'Invalid request', code = 'BAD_REQUEST') {
    return new ApiError(400, code, message);
  }
}

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.errors[0];
    const path = first?.path.join('.');
    const message = first ? `${path ? `${path}: ` : ''}${first.message}` : 'Validation failed';
    return NextResponse.json({ error: message, code: 'VALIDATION_ERROR' }, { status: 422 });
  }
  console.error('[api] unhandled error:', err);
  return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
}

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<NextResponse> | NextResponse;

/** Wraps a route handler with consistent error serialization. */
export function handle<Ctx = unknown>(fn: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw ApiError.badRequest('Request body must be valid JSON');
  }
  return schema.parse(raw);
}

export type Pagination = { page: number; limit: number; skip: number; take: number };

export function getPagination(url: URL, defaultLimit = 25, maxLimit = 100): Pagination {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const rawLimit = Number(url.searchParams.get('limit') ?? defaultLimit) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function json<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}
