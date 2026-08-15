import { afterEach, describe, expect, it, vi } from 'vitest';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  vi.resetModules();
});

describe('runtime environment validation', () => {
  it('rejects production without real Turnstile keys', async () => {
    Object.assign(process.env, { NODE_ENV: 'production', IMPACT_RUNTIME_MODE: 'production' });
    process.env.DATABASE_URL = 'postgresql://localhost/impact';
    process.env.APP_URL = 'https://impact.example.test';
    process.env.SESSION_SECRET = 's'.repeat(32);
    process.env.IP_HASH_SECRET = 'i'.repeat(32);
    process.env.NOMINATIM_SEARCH_URL = 'https://nominatim.example.test/search';
    process.env.DEVELOPMENT_TURNSTILE_BYPASS = 'false';
    process.env.TURNSTILE_SITE_KEY = '';
    process.env.TURNSTILE_SECRET_KEY = '';
    const { getEnv } = await import('@/server/env');
    expect(() => getEnv()).toThrow(/Turnstile/);
  });
});
