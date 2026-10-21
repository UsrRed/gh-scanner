import type { ApiErrorBody, ErrorCode } from '../../../shared/api';

export class ApiError extends Error {
  constructor(public readonly code: ErrorCode | 'network', message: string, public readonly status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', 'Serveur injoignable');
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    const err = (parsed as Partial<ApiErrorBody> | null)?.error;
    throw new ApiError(err?.code ?? 'internal', err?.message ?? `Erreur HTTP ${res.status}`, res.status);
  }
  return parsed as T;
}

export const apiGet = <T>(path: string): Promise<T> => request<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body);
export const apiDelete = <T>(path: string): Promise<T> => request<T>('DELETE', path);
export const apiPut = <T>(path: string, body?: unknown): Promise<T> => request<T>('PUT', path, body);
