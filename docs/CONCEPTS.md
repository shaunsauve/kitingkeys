# Concepts

## Browser Shortcut Layers

There are three layers of keyboard shortcuts in a Chromium browser:

1. **Browser chrome shortcuts** — handled by the browser before the page sees them. Examples: Ctrl+T (new tab), Ctrl+W (close tab), Ctrl+L (address bar). Extensions **cannot** intercept these via content scripts. The only way to override a few is via `chrome.commands` API + user manually assigning in `chrome://extensions/shortcuts`.

2. **Page-level shortcuts** — events that reach the page's DOM. Extensions can intercept these via content script `keydown` listeners with `capture: true`. This is where KitingKeys (and Vimium, Surfingkeys) operate.

3. **Extension shortcuts** — defined in `manifest.json` `commands` key. Limited to 4 custom commands. Can override some browser shortcuts if the user assigns them in `chrome://extensions/shortcuts`.

## Key Encoding

KitingKeys encodes key sequences into single Unicode characters for efficient trie lookup:
- Format: `<flag: always 1><invisible: 1 bit><key: 8 bits><mod: 4 bits>`
- Modifiers: Ctrl=1, Alt=2, Meta=4, Shift=8
- Special keys (Esc, F1-F12, arrows, etc.) use codes 256+ via `specialKeys` array index
- `encodeKeystroke` / `decodeKeystroke` are the codec pair

## Mode System

Modes are stacked by priority. Higher priority modes get first crack at key events:
- **Normal** — default, vim-like navigation
- **Insert** — when editing text fields
- **Visual** — text selection mode
- **Disabled** — SK disabled on this site (priority 99)
- **Lurk** — minimal mode, only `<Alt-i>` to enter Normal

## Trie-Based Mapping

Key sequences are stored in a trie. Each node can have metadata (annotation, feature_group, code). Multi-key sequences like `gg` traverse the trie. If a prefix matches a complete binding, it fires; otherwise it waits for more keys.

## Overridable vs Non-Overridable

For the "unset browser keys" feature: we categorize shortcuts as:
- **Overridable**: page-level keys the extension can suppress (e.g., `/` for search, Space for scroll)
- **Non-overridable**: browser chrome shortcuts (Ctrl+T, Ctrl+N, etc.) — can only be documented, not programmatically intercepted
- **Partially overridable**: via `chrome.commands` API if user manually assigns in extension shortcuts page
