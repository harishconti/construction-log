export type ApiErrorBody = { error: string; code: string };

export class ApiClientError extends Error {
  code: string;
  status: number;
  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = body.code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let body: ApiErrorBody = { error: res.statusText, code: 'ERROR' };
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* keep default */
    }
    throw new ApiClientError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
    }),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
