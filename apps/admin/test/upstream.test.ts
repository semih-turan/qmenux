import { afterEach, describe, expect, it, vi } from 'vitest';
import { upstream } from '../src/lib/upstream';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock('../src/lib/env', () => ({
  serverEnv: () => ({ apiInternalOrigin: 'https://pilot-api.example.test', bffKey: 'test-bff', trustForwardedFor: false }),
}));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('protected pilot upstream', () => {
  it.each(['preview', 'production'])('sends the server-only protection credential only in preview (%s)', async (environment) => {
    vi.stubEnv('VERCEL_ENV', environment);
    vi.stubEnv('QX_API_PROTECTION_BYPASS', 'test-only-bypass');
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    await upstream('/v1/auth/providers', { reqHeaders: new Headers() });
    const init = fetch.mock.calls[0]![1];
    expect(init.headers.get('x-vercel-protection-bypass')).toBe(environment === 'preview' ? 'test-only-bypass' : null);
    expect(init.headers.get('x-qx-bff-key')).toBe('test-bff');
    expect(init.redirect).toBe('manual');
    expect(init.cache).toBe('no-store');
  });
});
