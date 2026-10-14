import { errorResponse } from '@/lib/api';
import { auth } from '@/lib/auth/server';

type Ctx = { params: Promise<{ path: string[] }> };
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// auth.handler() is resolved per request (lazy), so the module can be imported at build time
// without NEON_AUTH_* secrets present.
async function dispatch(method: Method, req: Request, ctx: Ctx): Promise<Response> {
  try {
    return await auth.handler()[method](req, ctx);
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = (req: Request, ctx: Ctx) => dispatch('GET', req, ctx);
export const POST = (req: Request, ctx: Ctx) => dispatch('POST', req, ctx);
export const PUT = (req: Request, ctx: Ctx) => dispatch('PUT', req, ctx);
export const DELETE = (req: Request, ctx: Ctx) => dispatch('DELETE', req, ctx);
export const PATCH = (req: Request, ctx: Ctx) => dispatch('PATCH', req, ctx);
