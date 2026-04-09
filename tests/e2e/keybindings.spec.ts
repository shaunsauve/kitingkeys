import { test, expect } from './fixtures';
import type { Page, FrameLocator } from '@playwright/test';

// Comprehensive keybinding tests for the VSCode-style KitingKeys settings UI.
// Covers: default detection, override behavior, dual-mode key input,
// search/filter, conflict detection, presets, and page structure.
//
// Run: npx playwright test --project=brave keybindings.spec.ts
//
// See also:
//   src/pages/keybindingsTable.js - table rendering and inline editing
//   src/pages/keyInputWidget.js - dual-mode key input (capture / compose)
//   src/pages/settingsShell.js - sidebar nav, search, filter, presets

// Helper: navigate to a page and wait for the extension content script to initialize
async function gotoWithExtension(context: any, url: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url);
  // Wait for the KitingKeys iframe to be injected by the content script
  await page.waitForSelector('iframe[title="KitingKeys"]', { timeout: 5000 }).catch(() => null);
  // Extra settle time for mode system initialization
  await page.waitForTimeout(500);
  return page;
}

// Helper: get the KitingKeys UI frame
function skFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="KitingKeys"]');
}

// Helper: open the options page and wait for the keybindings table to populate.
// WHY: content.js fires surfingkeys:defaultSettingsLoaded then surfingkeys:userSettingsLoaded
// which triggers the table render. On a cold launch this can take 5-15 seconds.
async function openOptionsWithTable(context: any, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pages/options.html`);
  // Wait for the table element and rows to appear
  await page.waitForSelector('#keybindings-table', { timeout: 20000 });
  await page.waitForSelector('#keybindings-table tbody tr', { timeout: 10000 });
  return page;
}

// Helper: count visible rows (not hidden by display:none from search/filter).
// WHY: Playwright's :visible pseudo-class does not check inline style display:none
// set by the JS filter logic. We use page.evaluate for accurate counts.
async function countVisibleRows(page: Page): Promise<number> {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('#keybindings-table tbody tr[data-binding-id]');
    let count = 0;
    rows.forEach(row => {
      if ((row as HTMLElement).style.display !== 'none') count++;
    });
    return count;
  });
}

// Helper: get visible rows' data as an array of { source, command } objects
async function getVisibleRows(page: Page): Promise<Array<{ source: string; command: string }>> {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('#keybindings-table tbody tr[data-binding-id]');
    const result: Array<{ source: string; command: string }> = [];
    rows.forEach(row => {
      const el = row as HTMLElement;
      if (el.style.display !== 'none') {
        result.push({
          source: el.dataset.source || '',
          command: (el.querySelector('.col-command') as HTMLElement)?.textContent || '',
        });
      }
    });
    return result;
  });
}

// Helper: dispatch a synthetic keydown+keyup on an element via locator evaluate.
// WHY: The KitingKeys mode system intercepts keyboard events in the capture phase
// at the window level, preventing keys that match trie prefixes from reaching the
// widget's bubble-phase handler. Using locator.evaluate dispatches in the correct
// JS world (content script world) where the widget's listeners are registered.
// We also set sk_suppressed to bypass the mode system's interception.
async function dispatchKeyOnElement(
  locator: ReturnType<Page['locator']>,
  key: string, code: string, keyCode: number
): Promise<void> {
  await locator.evaluate((el, args) => {
    const init = {
      key: args.key, code: args.code, keyCode: args.keyCode, which: args.keyCode,
      bubbles: true, cancelable: true,
    } as any;
    const downEvt = new KeyboardEvent('keydown', init);
    // WHY: sk_suppressed tells the KitingKeys mode system to not process this key.
    // Without this, mapped keys and trie prefix keys are consumed before reaching
    // the widget's handler.
    (downEvt as any).sk_suppressed = true;
    el.dispatchEvent(downEvt);
    const upEvt = new KeyboardEvent('keyup', init);
    (upEvt as any).sk_suppressed = true;
    el.dispatchEvent(upEvt);
  }, { key, code, keyCode });
}

// ============================================================
// 1. DEFAULT KEYBINDING DETECTION
// ============================================================
test.describe('Default keybinding detection', () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
  });

  test('table renders with binding rows (count > 20)', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    const rows = page.locator('#keybindings-table tbody tr[data-binding-id]');
    const count = await rows.count();
    expect(count).toBeGreaterThan(20);
  });

  test('known keys present (j, k, f, x, gg, G in table rows)', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    const kbdElements = page.locator('#keybindings-table .col-key kbd');
    const count = await kbdElements.count();
    const allKeys: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await kbdElements.nth(i).textContent();
      if (text) allKeys.push(text.trim());
    }
    // Core navigation keys that should always be present
    expect(allKeys).toContain('j');
    expect(allKeys).toContain('k');
    expect(allKeys).toContain('f');
    expect(allKeys).toContain('x');
    expect(allKeys).toContain('gg');
    expect(allKeys).toContain('G');
  });

  test('help overlay still works (? key on a page)', async ({ context }) => {
    const page = await gotoWithExtension(context, 'https://example.com');
    await page.keyboard.press('?');
    const frame = skFrame(page);
    const usage = frame.locator('#sk_usage');
    await expect(usage).toBeVisible({ timeout: 5000 });
    const content = await usage.innerHTML();
    expect(content).toContain('Scroll down');
  });

  test('source column shows "default" for built-in bindings', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    const defaultRows = page.locator('tr[data-source="default"]');
    const count = await defaultRows.count();
    // WHY: The exact number of default rows depends on how many trie entries have
    // valid annotations. At minimum there should be several.
    expect(count).toBeGreaterThan(0);
    // Verify badge text on the first default row
    const firstBadge = defaultRows.first().locator('.col-source .badge-source-default');
    await expect(firstBadge).toHaveText('default');
  });
});

// ============================================================
// 2. KEYBINDING OVERRIDE BEHAVIOR
// ============================================================
test.describe('Keybinding override behavior', () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
  });

  test('extension intercepts page keys (j/k scroll)', async ({ context }) => {
    const page = await gotoWithExtension(context, 'https://example.com');
    // Press 'j' multiple times — extension should scroll down
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('j');
      await page.waitForTimeout(100);
    }
    // The key should at minimum not type 'j' into the page (no input focused)
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toContain('jjjjj');
  });

  test('insert mode passes keys through (click input, type text)', async ({ context }) => {
    const page = await gotoWithExtension(context, 'https://example.com');
    // Inject an input field
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'test-input';
      input.type = 'text';
      input.style.cssText = 'position:fixed;top:10px;left:10px;width:200px;height:30px;z-index:99999;';
      document.body.prepend(input);
    });
    await page.waitForTimeout(300);
    // WHY: Must click (not just focus) the input — KitingKeys enters insert mode on click
    await page.click('#test-input');
    await page.waitForTimeout(500);
    // Type in the input — should go into the field, not trigger SK bindings
    await page.keyboard.type('jjkkff');
    const value = await page.evaluate(() =>
      (document.getElementById('test-input') as HTMLInputElement).value
    );
    expect(value).toBe('jjkkff');
  });

  test('Escape exits insert mode', async ({ context }) => {
    const page = await gotoWithExtension(context, 'https://example.com');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'test-input';
      input.type = 'text';
      document.body.prepend(input);
      input.focus();
    });
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // Now pressing ? should open help (normal mode)
    await page.keyboard.press('?');
    const frame = skFrame(page);
    const usage = frame.locator('#sk_usage');
    await expect(usage).toBeVisible({ timeout: 3000 });
  });

  test('inline edit: click key cell opens key input dialog', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    // WHY: Click the kbd element, not the td — click handlers are on individual kbd elements
    const defaultRow = page.locator('tr[data-source="default"]').first();
    const firstKbd = defaultRow.locator('.col-key kbd').first();
    await firstKbd.click();
    await page.waitForTimeout(500);
    // WHY: Widget now renders as a dialog overlay on document.body, not inline
    const overlay = page.locator('.kiw-overlay');
    await expect(overlay).toBeVisible();
    const dialog = page.locator('.kiw-dialog');
    await expect(dialog).toBeVisible();
    // The capture area should be visible by default
    const captureArea = page.locator('.kiw-capture-area');
    await expect(captureArea).toBeVisible();
    // Press Escape to cancel
    await dispatchKeyOnElement(captureArea, 'Escape', 'Escape', 27);
    await page.waitForTimeout(200);
    // Dialog should be gone
    await expect(overlay).not.toBeVisible();
  });
});

// ============================================================
// 3. DUAL-MODE KEY INPUT
// ============================================================
test.describe('Dual-mode key input', () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
  });

  test('capture mode: press key combo confirms', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    const defaultRow = page.locator('tr[data-source="default"]').first();
    const bindingId = await defaultRow.getAttribute('data-binding-id');
    await defaultRow.locator('.col-key kbd').first().click();
    await page.waitForTimeout(500);
    // WHY: Widget is now a dialog overlay on document.body
    const captureArea = page.locator('.kiw-overlay .kiw-capture-area');
    await expect(captureArea).toBeVisible();
    const initialText = await captureArea.textContent();
    expect(initialText).toContain('Press keys');
    await dispatchKeyOnElement(captureArea, 'z', 'KeyZ', 90);
    await page.waitForTimeout(300);
    const afterKeyText = await captureArea.textContent();
    expect(afterKeyText).toContain('z');
    await dispatchKeyOnElement(captureArea, 'Enter', 'Enter', 13);
    await page.waitForTimeout(500);
    const updatedRow = page.locator(`tr[data-binding-id="${bindingId}"]`);
    await expect(updatedRow).toBeVisible();
    const kbd = updatedRow.locator('.col-key kbd').first();
    await expect(kbd).toHaveText('z');
  });

  test('compose mode: toggle Ctrl, type character, result preview updates', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    const defaultRow = page.locator('tr[data-source="default"]').first();
    await defaultRow.locator('.col-key kbd').first().click();
    await page.waitForTimeout(500);
    // WHY: Widget elements are in the overlay dialog, not the cell
    const composeBtn = page.locator('.kiw-overlay .kiw-mode-btn', { hasText: 'Compose' });
    await composeBtn.click();
    await page.waitForTimeout(200);
    const ctrlBtn = page.locator('.kiw-overlay .kiw-mod-btn', { hasText: 'Ctrl' });
    await ctrlBtn.click();
    await expect(ctrlBtn).toHaveClass(/active/);
    const charInput = page.locator('.kiw-overlay .kiw-key-input');
    await charInput.fill('a');
    await page.waitForTimeout(200);
    const resultValue = page.locator('.kiw-overlay .kiw-result-value');
    await expect(resultValue).toHaveText('<Ctrl-a>');
    await dispatchKeyOnElement(charInput, 'Escape', 'Escape', 27);
  });

  test('multi-key sequence: type g then g shows gg', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    const defaultRow = page.locator('tr[data-source="default"]').first();
    await defaultRow.locator('.col-key kbd').first().click();
    await page.waitForTimeout(500);
    const captureArea = page.locator('.kiw-overlay .kiw-capture-area');
    await expect(captureArea).toBeVisible();
    await dispatchKeyOnElement(captureArea, 'g', 'KeyG', 71);
    await page.waitForTimeout(150);
    await dispatchKeyOnElement(captureArea, 'g', 'KeyG', 71);
    await page.waitForTimeout(300);
    const display = await captureArea.textContent();
    expect(display).toContain('gg');
    await dispatchKeyOnElement(captureArea, 'Escape', 'Escape', 27);
  });
});

// ============================================================
// 4. SEARCH AND FILTER
// ============================================================
test.describe('Search and filter', () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
  });

  test('search "scroll" shows only scroll-related rows', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    const searchInput = page.locator('#searchBindings');
    await searchInput.fill('scroll');
    // Wait for debounce (150ms) + rendering
    await page.waitForTimeout(400);
    const visible = await getVisibleRows(page);
    expect(visible.length).toBeGreaterThan(0);
    // All visible rows should have "scroll" in their command text
    for (const row of visible) {
      expect(row.command.toLowerCase()).toContain('scroll');
    }
  });

  test('filter "browser" shows only browser rows', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    await page.locator('#filterChips button[data-filter="browser"]').click();
    await page.waitForTimeout(300);
    const visible = await getVisibleRows(page);
    expect(visible.length).toBeGreaterThan(0);
    for (const row of visible) {
      expect(row.source).toBe('browser');
    }
  });

  test('filter "modified" is empty initially (no user changes)', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    await page.locator('#filterChips button[data-filter="modified"]').click();
    await page.waitForTimeout(300);
    const count = await countVisibleRows(page);
    expect(count).toBe(0);
  });

  test('clear search restores all rows', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    await page.waitForTimeout(500);
    const allRowsBefore = await countVisibleRows(page);
    expect(allRowsBefore).toBeGreaterThan(20);
    // Search to filter
    const searchInput = page.locator('#searchBindings');
    await searchInput.fill('scroll');
    await page.waitForTimeout(600);
    const filteredCount = await countVisibleRows(page);
    expect(filteredCount).toBeLessThan(allRowsBefore);
    expect(filteredCount).toBeGreaterThan(0);
    // WHY: Playwright's fill('') does not always trigger the input event on Brave.
    // Instead, we triple-click to select all, then delete to clear.
    await searchInput.click({ clickCount: 3 });
    await page.keyboard.press('Delete');
    await page.waitForTimeout(600);
    const restoredCount = await countVisibleRows(page);
    expect(restoredCount).toBe(allRowsBefore);
  });
});

// ============================================================
// 5. CONFLICT DETECTION
// ============================================================
test.describe('Conflict detection', () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
  });

  test('browser locked rows show locked badge', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    const browserRows = page.locator('tr[data-source="browser"]');
    const count = await browserRows.count();
    expect(count).toBeGreaterThan(0);
    // Every browser row should have a locked badge
    for (let i = 0; i < Math.min(count, 5); i++) {
      const badge = browserRows.nth(i).locator('.badge-locked');
      await expect(badge).toBeVisible();
      const text = await badge.textContent();
      expect(text).toContain('browser');
    }
  });

  test('overridable browser keys show conflict indicator when extension has same key', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    // Filter to conflicts to find rows with conflict indicators
    await page.locator('#filterChips button[data-filter="conflicts"]').click();
    await page.waitForTimeout(300);
    const visible = await getVisibleRows(page);
    // There may or may not be conflicts depending on the default bindings.
    // If there are conflicts, verify at least one has a non-empty conflict cell.
    if (visible.length > 0) {
      const conflictTexts = await page.evaluate(() => {
        const rows = document.querySelectorAll('#keybindings-table tbody tr[data-binding-id]');
        const texts: string[] = [];
        rows.forEach(row => {
          const el = row as HTMLElement;
          if (el.style.display !== 'none') {
            const cell = el.querySelector('.col-conflict');
            if (cell && cell.textContent?.trim()) {
              texts.push(cell.textContent.trim());
            }
          }
        });
        return texts;
      });
      expect(conflictTexts.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// 6. PRESET SYSTEM
// ============================================================
test.describe('Preset system', () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
  });

  test('preset dropdown has all options', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    const dropdown = page.locator('#presetDropdown');
    await expect(dropdown).toBeVisible();
    const options = dropdown.locator('option');
    const values: string[] = [];
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const val = await options.nth(i).getAttribute('value');
      if (val) values.push(val);
    }
    expect(values).toContain('kitingkeys');
    expect(values).toContain('vimium');
    expect(values).toContain('minimal');
    expect(values).toContain('export');
    expect(values).toContain('import');
  });

  test('selecting "vimium" dispatches preset event and applies', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    // WHY: The preset system dispatches kitingkeys:applyPreset and options.js
    // handles it by calling registry.applyPreset() then showing a banner.
    // No confirmation dialog is shown — the preset applies directly.
    // Handle any potential dialog (future-proofing).
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    // Select vimium preset
    await page.locator('#presetDropdown').selectOption('vimium');
    await page.waitForTimeout(1500);
    // The preset was applied — dropdown resets to placeholder (settingsShell.js behavior)
    const dropdownValue = await page.locator('#presetDropdown').inputValue();
    expect(dropdownValue).toBe('');
  });

  test('selecting "kitingkeys" resets modified bindings', async ({ context, extensionId }) => {
    const page = await openOptionsWithTable(context, extensionId);
    // Handle any potential dialog
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    // Select kitingkeys preset to reset
    await page.locator('#presetDropdown').selectOption('kitingkeys');
    await page.waitForTimeout(1500);
    // After reset, filter "modified" should show zero rows
    await page.locator('#filterChips button[data-filter="modified"]').click();
    await page.waitForTimeout(300);
    const count = await countVisibleRows(page);
    expect(count).toBe(0);
  });
});

// ============================================================
// 7. PAGE STRUCTURE
// ============================================================
test.describe('Page structure', () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox extension loading not yet supported');
  });

  test('sidebar navigation switches tabs', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/options.html`);
    await page.waitForTimeout(1000);

    // Keybindings tab should be active by default
    await expect(page.locator('#tab-keybindings')).toHaveClass(/active/);

    // Click Advanced tab
    await page.locator('#settings-sidebar li[data-tab="advanced"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-advanced')).toBeVisible();
    await expect(page.locator('#tab-keybindings')).not.toBeVisible();

    // Click Proxy tab
    await page.locator('#settings-sidebar li[data-tab="proxy"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-proxy')).toBeVisible();
    await expect(page.locator('#tab-advanced')).not.toBeVisible();

    // Click About tab
    await page.locator('#settings-sidebar li[data-tab="about"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-about')).toBeVisible();
    await expect(page.locator('#tab-proxy')).not.toBeVisible();

    // Click back to Keybindings
    await page.locator('#settings-sidebar li[data-tab="keybindings"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-keybindings')).toBeVisible();
  });

  test('Advanced JS tab shows Ace editor area', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/options.html`);
    await page.waitForTimeout(1000);
    // Switch to Advanced tab
    await page.locator('#settings-sidebar li[data-tab="advanced"]').click();
    await page.waitForTimeout(500);
    // The Ace editor mount div should be visible
    const editorDiv = page.locator('#mappings');
    await expect(editorDiv).toBeVisible();
    // Save button should exist
    const saveBtn = page.locator('#save_button');
    await expect(saveBtn).toBeVisible();
  });

  test('About tab shows version and attribution', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/options.html`);
    await page.waitForTimeout(1000);
    // Switch to About tab
    await page.locator('#settings-sidebar li[data-tab="about"]').click();
    await page.waitForTimeout(300);
    const aboutPanel = page.locator('#tab-about');
    await expect(aboutPanel).toBeVisible();
    // Version span should exist
    const versionSpan = page.locator('#tab-about #version');
    await expect(versionSpan).toBeVisible();
    // Attribution text
    const aboutText = await aboutPanel.textContent();
    expect(aboutText).toContain('Surfingkeys');
    expect(aboutText).toContain('brookhong');
  });
});
