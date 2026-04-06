import { defineConfig } from '@playwright/test';
import { browserProjects } from './tests/e2e/playwright.browsers';

// WHY: Browser extensions require headed mode (no headless) and persistent
// context with --load-extension. Each browser project is independently
// targetable via: npx playwright test --project=chrome
//
// Browser definitions live in tests/e2e/playwright.browsers.ts so they
// can be shared across projects or extracted into a package.
//
// See also:
//   tests/e2e/playwright.browsers.ts - browser project definitions
//   tests/e2e/fixtures.ts - shared extension launch helper
//   tests/e2e/*.spec.ts - extension integration tests

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    headless: false, // extensions require headed mode
  },
  projects: browserProjects,
});
