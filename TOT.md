# Train of Thought

## 2026-04-08: Headless E2E — what actually works

**Problem:** E2E tests open visible Brave windows, stealing focus during dev work.

**Approaches tried:**
1. `--window-position=-2400,-2400` — macOS window manager clamps to screen bounds. Doesn't work.
2. `--headless=new` in Chrome args with `headless: false` — Playwright strips headless-related args when its own headless option is set. Windows still appeared.
3. `headless: true` (Playwright-native) — Playwright 1.40+ defaults to Chrome's "new headless" which supports extensions. **This works.** All 28 tests pass invisibly.

**Key insight:** Don't fight Playwright's headless management. Use its native `headless: true` and let it handle the Chrome flags internally. The old advice "extensions require headed mode" is outdated as of Playwright 1.40+.

## 2026-04-08: Proxy removal scope

User wants proxy gutted — it's upstream Surfingkeys feature, out of scope for KitingKeys. Full audit identified 16 files. Purely subtractive change, no new code. The proxy UI tab, keybindings (cp, ;cp, ;ap, ;pa-;ps), PAC script logic, background handlers, and l10n strings all go.
