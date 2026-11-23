import { defineConfig, devices } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // WebKit can report a transient internal navigation error on CI runners.
  // A single retry preserves failures while allowing an engine restart.
  retries: process.env.CI ? 1 : 0,
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
  // The journeys are written for the phone layout (below 640 px), so the
  // desktop browsers run them at phone size too. Wider layouts (the rail from
  // 640 px, the left column from 1100 px: docs/plans/2026-11-14-desktop-and-shelf-suggestions.md)
  // are covered by one-shelf-desktop.spec.js, which sets its own viewport.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: PHONE, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } } : {}) } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } } : {}) } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: PHONE } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: PHONE } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
});
