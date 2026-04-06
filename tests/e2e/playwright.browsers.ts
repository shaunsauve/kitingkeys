// Shared browser project definitions.
// WHY: Centralizes browser targeting so any playwright.config.ts can import
// these projects without duplicating executable paths and channel config.
// To use system-wide across repos, move this to a shared npm package or
// symlink from a central location.
//
// Usage in playwright.config.ts:
//   import { browserProjects } from './tests/e2e/playwright.browsers';
//   export default defineConfig({ projects: browserProjects });

import type { Project } from '@playwright/test';

// Override with env vars if browsers are in non-standard locations
const BRAVE_PATH = process.env.BRAVE_PATH
  || (process.platform === 'darwin'
    ? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    : process.platform === 'win32'
      ? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
      : '/usr/bin/brave-browser');

const CHROME_PATHS: Record<string, string> = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  linux: '/usr/bin/google-chrome',
};

export const browserProjects: Project[] = [
  {
    name: 'chrome',
    use: {
      channel: 'chrome',
    },
  },
  {
    name: 'brave',
    use: {
      launchOptions: {
        executablePath: BRAVE_PATH,
      },
    },
  },
  {
    name: 'chromium',
    use: {
      // Playwright's bundled Chromium — no extra config
    },
  },
  {
    name: 'firefox',
    use: {
      browserName: 'firefox',
    },
  },
];

// Convenience: just the Chromium-based browsers (for extension testing)
export const chromiumProjects = browserProjects.filter(
  p => p.name !== 'firefox'
);
