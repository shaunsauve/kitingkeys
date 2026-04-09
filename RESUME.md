# Session Resume

## Last Activity
- Refactored E2E test infrastructure for headless execution
- Proxy removal was scoped (full file/line audit done) but not yet executed

## Done This Session
- Fixed E2E tests to run headless by default (no visible browser windows)
  - Switched from `headless: false` + `--headless=new` arg hack to Playwright-native `headless: true`
  - Playwright 1.59+ uses Chrome's "new headless" which supports extensions natively
  - `PW_HEADED=1` env var for visible debugging
  - All 28 tests (5 extension + 23 keybindings) pass headless on Brave
- Completed proxy removal audit — identified all 16 files with proxy references

## Next Up
- **Gut all proxy code** — audit is done, files identified:
  - HTML: options.html (template, sidebar tab, panel)
  - CSS: options.css (proxy tab styles lines 433-505)
  - JS: options.js (proxy rendering/handling), chrome.js (_applyProxySettings), default.js (proxy keybindings cp, ;cp, ;ap, ;pa-;ps), content.js (proxyMode status), front.js (proxyFrame), runtime.js (showProxyInStatusBar)
  - Other: manifest.json (proxyThis command), bindingRegistry.js ('Proxy' entry), l10n.json (proxy translations), markdown.html (proxyFrame iframe), firefox_pac.js
  - Tests: keybindings.spec.ts (proxy tab references in sidebar nav test)
  - Docs: ARCHITECTURE.md, REQUIREMENTS.md (proxy tab mentions)
- Manual testing of MV3 build in Brave
- Test Chrome extension install via chrome://extensions (unpacked)
- Bug injection test to validate E2E suite catches real regressions

## Notes for Next Session
- `headless: true` is the correct Playwright setting — do NOT use `--headless=new` in args (Playwright strips it when headless option is set)
- macOS clamps `--window-position` to screen bounds — offscreen positioning doesn't work
- Proxy removal is purely subtractive — no new code needed, just delete references
- Background scripts (firefox.js, safari.js) also have `_applyProxySettings` stubs to remove

## Related
- TODO: Manual testing items still open
- See: docs/ARCHITECTURE.md, docs/REQUIREMENTS.md (need proxy refs removed)
