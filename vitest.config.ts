import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://impact:impact@localhost:5432/impact',
      APP_URL: 'http://localhost:3000',
      SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-validation',
      IP_HASH_SECRET: 'test-ip-secret-that-is-long-enough-for-validation',
      NOMINATIM_SEARCH_URL: 'http://localhost/nominatim/search',
    },
  },
});
