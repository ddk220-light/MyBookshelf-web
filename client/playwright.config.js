import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    // reducedMotion is NOT one of the option fixtures Playwright 1.55's test runner
    // promotes to the top level (unlike colorScheme, viewport, locale, ...) — see
    // `_combinedContextOptions` in node_modules/playwright/lib/index.js, which only
    // reads a fixed list of named options plus whatever sits under `contextOptions`.
    // A bare `reducedMotion: 'reduce'` here is silently dropped and every test runs
    // with the OS's actual motion preference. It must be nested under contextOptions
    // to actually reach browser.newContext(). Confirmed by a throwaway spec that
    // asserted matchMedia('(prefers-reduced-motion: reduce)').matches — it reported
    // false with reducedMotion at this top level and true once moved below.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } } : {}) } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } } : {}) } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
});
