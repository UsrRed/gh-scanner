// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, apiPost, setCsrfToken } from '../../web/src/api/client';

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('throws ApiError with code/message on {error}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'not_found', message: 'nope' } }), { status: 404 })));
    const err = (await apiGet('/api/x').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('nope');
  });
  it('sends CSRF token on mutations', async () => {
    const f = vi.fn(async () => new Response('{"ok":1}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    setCsrfToken('tok');
    expect(await apiPost('/api/y', { a: 1 })).toEqual({ ok: 1 });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok');
  });
  it('maps network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('x'); }));
    await expect(apiGet('/a')).rejects.toMatchObject({ code: 'network' });
  });
});
