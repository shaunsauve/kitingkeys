import { test, expect } from './fixtures';

// Smoke tests to verify the extension loads and core UI is accessible.
//
// Run specific browser:
//   npx playwright test --project=chrome
//   npx playwright test --project=brave
//   npx playwright test --project=chromium
//   npx playwright test --project=firefox
//
// See also:
//   tests/e2e/fixtures.ts - extension loading helper

test.describe('Extension loading', () => {
  test('extension loads and has an ID', async ({ extensionId, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
    expect(extensionId).toBeTruthy();
    expect(extensionId.length).toBeGreaterThan(10);
  });

  test('popup page renders', async ({ context, extensionId, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/popup.html`);
    // Verify the disable/enable toggle link exists
    const disableLink = page.locator('#disableAll');
    await expect(disableLink).toBeVisible();
    const text = await disableLink.textContent();
    expect(text).toContain('KitingKeys');
  });

  test('options page renders with KitingKeys branding', async ({ context, extensionId, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/options.html`);
    // Check title
    await expect(page).toHaveTitle('KitingKeys Settings');
    // Sidebar should be visible
    const sidebar = page.locator('#settings-sidebar');
    await expect(sidebar).toBeVisible();
    // Keybindings tab should be active by default
    const keybindingsTab = page.locator('#settings-sidebar li[data-tab="keybindings"]');
    await expect(keybindingsTab).toHaveClass(/active/);
  });

  test('browser bindings appear as locked rows in table', async ({ context, extensionId, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/options.html`);
    // Wait for keybindings table to populate
    await page.waitForSelector('#keybindings-table tbody tr', { timeout: 20000 });
    // Browser rows should exist
    const browserRows = page.locator('tr[data-source="browser"]');
    const count = await browserRows.count();
    expect(count).toBeGreaterThan(0);
    // Browser rows should have locked badges
    const lockedBadges = page.locator('tr[data-source="browser"] .badge-locked');
    expect(await lockedBadges.count()).toBeGreaterThan(0);
  });
});

test.describe('Page-level keybindings', () => {
  test('pressing ? opens help overlay', async ({ context, extensionId, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
    const page = await context.newPage();
    await page.goto('https://example.com');
    // Wait for extension content script to load
    await page.waitForTimeout(1000);
    // Press ? to open help
    await page.keyboard.press('?');
    // The help overlay is rendered inside the extension's iframe
    // Look for the SK UI iframe
    const skFrame = page.frameLocator('iframe[title="KitingKeys"]');
    // Help usage div should appear
    const usage = skFrame.locator('#sk_usage');
    await expect(usage).toBeVisible({ timeout: 5000 });
  });
});
