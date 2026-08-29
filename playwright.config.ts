import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  timeout: 60_000,
  retries: 1,
  // The local Docker stack shares one database/rate-limit table across browser
  // projects; serial execution keeps acceptance runs deterministic.
  workers: 1,
  fullyParallel: true,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    headless: true,
  },
  projects: [
    {
      name: 'chromium-phone-360',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'chromium-phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'chromium-tablet',
      use: {
        browserName: 'chromium',
        viewport: { width: 768, height: 1024 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'chromium-laptop',
      use: { browserName: 'chromium', viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'chromium-desktop',
      use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'firefox-desktop',
      use: { browserName: 'firefox', viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'webkit-phone',
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
