# TODO

## Current
- [ ] Manual testing of MV3 build in Brave
- [ ] Test Chrome extension install via chrome://extensions (unpacked)

## Done
- [x] T001: Replace `document.createElement` in background with `chrome.offscreen` API
- [x] T002: `chrome.userScripts` API — already implemented in upstream Surfingkeys
- [x] T003: Migrate background global state to `chrome.storage.session`
- [x] Replace eval() in debug_utils.js with property path walker
- [x] Rebrand Surfingkeys → KitingKeys
- [x] Browser default shortcuts reference + overridable/locked badges
- [x] Vimium defaults preset + preset selector UI
- [x] Key combo/symbol audit in keyboardUtils.js
- [x] Playwright E2E test suite (31 tests passing)
