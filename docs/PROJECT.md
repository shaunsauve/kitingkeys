# KitingKeys

Fork of [Surfingkeys](https://github.com/brookhong/Surfingkeys) (v1.18.0) by brookhong.

## Goals

1. Make keyboard shortcut mapping easier to set and track
2. Target Chrome and Brave browsers
3. Show browser default keybindings alongside extension keybindings
4. Allow unsetting browser keys and mapping odd key combos/symbols
5. Multi-tier restore: browser defaults, Surfingkeys defaults, Vimium defaults

## Current Focus

Initial fork setup: rebrand, browser defaults reference data, preset system, options UI overhaul.

## Setup

```bash
npm install
npm run build:dev    # development build → dist/
npm run build:prod   # production build → dist/
npm test             # jest tests
```

Load unpacked from `dist/` in `chrome://extensions/`.

## Stack

- Manifest V2 (Chrome extension)
- Webpack bundled
- JS (content scripts, background, pages) + TS (nvim module)
- Ace editor for settings
- Jest for tests
