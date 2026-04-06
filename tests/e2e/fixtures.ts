import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

// WHY: Chrome extensions can only be loaded via a persistent browser context
// with --load-extension and --disable-extensions-except flags. This fixture
// encapsulates that setup so individual tests just use `context` and `extensionId`.
//
// Firefox uses a completely different extension loading mechanism (web-ext),
// so Firefox tests get a plain context without extension loading.
//
// See also:
//   playwright.config.ts - project definitions for chrome/brave/chromium/firefox

const EXTENSION_PATH = path.resolve(__dirname, '..', '..', 'dist', 'development', 'chrome');

export type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({ browserName }, use, testInfo) => {
    if (browserName === 'firefox') {
      // Firefox: plain context, no extension loading
      const browser = await base.step('Launch Firefox', async () => {
        const { firefox } = await import('@playwright/test');
        return firefox.launch({ headless: false });
      });
      const context = await browser.newContext();
      await use(context);
      await browser.close();
      return;
    }

    // Chromium-based browsers (Chrome, Brave, Chromium)
    const projectName = testInfo.project.name;
    const launchOptions: Record<string, unknown> = {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Suppress first-run dialogs
        '--no-first-run',
        '--disable-default-apps',
        // WHY: Chrome 127+ started deprecating MV2; this flag ensures
        // MV2 extensions can still be loaded for testing.
        '--enable-features=ExtensionsManifestV2',
      ],
    };

    // Brave or Chrome: use executablePath or channel
    if (projectName === 'brave') {
      launchOptions.executablePath = process.env.BRAVE_PATH
        || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
    } else if (projectName === 'chrome') {
      launchOptions.channel = 'chrome';
    }
    // 'chromium' uses Playwright's bundled Chromium — no extra config needed

    const context = await chromium.launchPersistentContext('', launchOptions);
    await use(context);
    await context.close();
  },

  extensionId: async ({ context, browserName }, use) => {
    if (browserName === 'firefox') {
      await use(''); // no extension ID for Firefox
      return;
    }

    // WHY: After loading the extension, we need its ID to construct
    // chrome-extension:// URLs for the options/popup pages.
    // MV2 background pages may take a moment to appear after launch.
    let extensionId = '';

    function extractId(url: string): string {
      const match = url.match(/chrome-extension:\/\/([^/]+)/);
      return match ? match[1] : '';
    }

    // WHY: MV2 extensions may appear as background pages OR service workers
    // depending on the Chromium version and timing. Poll until found.
    const deadline = Date.now() + 15000;
    while (!extensionId && Date.now() < deadline) {
      // Check service workers
      for (const w of context.serviceWorkers()) {
        const id = extractId(w.url());
        if (id) { extensionId = id; break; }
      }
      // Check background pages
      if (!extensionId) {
        for (const p of context.backgroundPages()) {
          const id = extractId(p.url());
          if (id) { extensionId = id; break; }
        }
      }
      // Check page URLs
      if (!extensionId) {
        for (const p of context.pages()) {
          const id = extractId(p.url());
          if (id) { extensionId = id; break; }
        }
      }
      if (!extensionId) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    await use(extensionId);
  },
});

export { expect } from '@playwright/test';
