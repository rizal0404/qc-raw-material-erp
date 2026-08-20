import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiFetch } from './api-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('accepts an anonymous session probe without producing an auth error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      authenticated: false,
      user: null,
      session: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(apiFetch('/auth/session')).resolves.toMatchObject({ authenticated: false });
  });

  it('preserves API error metadata for protected endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code: 'AUTH_REQUIRED',
      message: 'Sesi login diperlukan.',
      requestId: 'request-1',
    }), { status: 401, headers: { 'content-type': 'application/json' } })));

    await expect(apiFetch('/auth/me')).rejects.toEqual(expect.objectContaining({
      status: 401,
      code: 'AUTH_REQUIRED',
      requestId: 'request-1',
    }) as Partial<ApiClientError>);
  });
});
