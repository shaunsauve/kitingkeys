// Browser default keyboard shortcuts for Chrome/Brave — OS-aware.
// WHY: KitingKeys needs a static reference of browser-native shortcuts because
// browsers don't expose this data via any API. This powers the defaults display
// in the options UI, conflict detection, and the modifier overlay.
//
// OS awareness: On macOS, Chrome uses Cmd (Meta) where Windows/Linux use Ctrl.
// Some shortcuts are entirely different per OS (e.g., Alt+F4 vs Cmd+Q).
// We detect the platform at load time and build the correct set.
//
// Each entry is categorized and marked as overridable or not:
//   overridable: true  — extension's capture-phase keydown listener can preventDefault()
//   overridable: false — browser processes it before any page code runs
//
// See also:
//   src/content_scripts/common/keyboardUtils.js - platform detection, key encoding
//   src/content_scripts/common/default.js - KitingKeys/Surfingkeys default mappings

import KeyboardUtils from './keyboardUtils';

// WHY: On macOS, Chrome maps Cmd (Meta key) to the same role as Ctrl on other platforms.
// We use the platform detection already in KeyboardUtils to pick the right modifier.
const isMac = KeyboardUtils.platform === 'Mac';
const PRIMARY = isMac ? 'Meta' : 'Ctrl';  // Cmd on Mac, Ctrl on Win/Linux

// Helper: build a key string with the platform's primary modifier
function pk(key) { return '<' + PRIMARY + '-' + key + '>'; }
function psk(key) { return '<' + PRIMARY + '-Shift-' + key + '>'; }

const BROWSER_DEFAULTS = {
    tabs: {
        label: "Tabs & Windows",
        shortcuts: [
            { keys: pk('t'),            description: "Open new tab",                   overridable: false },
            { keys: pk('n'),            description: "Open new window",                overridable: false },
            { keys: psk('n'),           description: "Open incognito window",          overridable: false },
            { keys: pk('w'),            description: "Close current tab",              overridable: false },
            { keys: psk('w'),           description: "Close current window",           overridable: false },
            { keys: psk('t'),           description: "Reopen last closed tab",         overridable: false },
            { keys: '<Ctrl-Tab>',       description: "Switch to next tab",             overridable: false },
            { keys: '<Ctrl-Shift-Tab>', description: "Switch to previous tab",         overridable: false },
            { keys: pk('1'),            description: "Go to tab 1",                    overridable: false },
            { keys: pk('2'),            description: "Go to tab 2",                    overridable: false },
            { keys: pk('3'),            description: "Go to tab 3",                    overridable: false },
            { keys: pk('4'),            description: "Go to tab 4",                    overridable: false },
            { keys: pk('5'),            description: "Go to tab 5",                    overridable: false },
            { keys: pk('6'),            description: "Go to tab 6",                    overridable: true },
            { keys: pk('7'),            description: "Go to tab 7",                    overridable: false },
            { keys: pk('8'),            description: "Go to tab 8",                    overridable: false },
            { keys: pk('9'),            description: "Go to last tab",                 overridable: false },
            // WHY: Cmd+Q quits on Mac; Alt+F4 closes window on Win/Linux
            isMac
                ? { keys: '<Meta-q>',   description: "Quit browser",                  overridable: false }
                : { keys: '<Alt-F4>',   description: "Close window",                  overridable: false },
        ],
    },

    navigation: {
        label: "Navigation",
        shortcuts: [
            // WHY: Back/forward is Cmd+[ / Cmd+] on Mac, Alt+Arrow on Win/Linux
            isMac
                ? { keys: '<Meta-ArrowLeft>',  description: "Go back",                overridable: true }
                : { keys: '<Alt-ArrowLeft>',   description: "Go back",                overridable: true },
            isMac
                ? { keys: '<Meta-ArrowRight>', description: "Go forward",             overridable: true }
                : { keys: '<Alt-ArrowRight>',  description: "Go forward",             overridable: true },
            { keys: pk('l'),            description: "Focus address bar",              overridable: false },
            { keys: '<F5>',             description: "Reload page",                    overridable: true },
            { keys: pk('r'),            description: "Reload page",                    overridable: true },
            { keys: psk('r'),           description: "Hard reload (bypass cache)",     overridable: true },
            { keys: '<Escape>',         description: "Stop loading / close dialog",    overridable: true },
            isMac
                ? { keys: '<Meta-Shift-h>',    description: "Open home page",         overridable: true }
                : { keys: '<Alt-Home>',         description: "Open home page",         overridable: true },
            // Alt+D only on Win/Linux
            ...(isMac ? [] : [{ keys: '<Alt-d>', description: "Focus address bar",    overridable: false }]),
        ],
    },

    page: {
        label: "Page Interaction",
        shortcuts: [
            { keys: '<Space>',          description: "Scroll down",                    overridable: true },
            { keys: '<Shift-Space>',    description: "Scroll up",                      overridable: true },
            { keys: '<Home>',           description: "Scroll to top",                  overridable: true },
            { keys: '<End>',            description: "Scroll to bottom",               overridable: true },
            // WHY: On Mac, Fn+Up/Down are PageUp/PageDown
            { keys: '<PageDown>',       description: "Scroll down one page",           overridable: true },
            { keys: '<PageUp>',         description: "Scroll up one page",             overridable: true },
            { keys: '<Tab>',            description: "Focus next element",             overridable: true },
            { keys: '<Shift-Tab>',      description: "Focus previous element",         overridable: true },
            { keys: '<Enter>',          description: "Activate focused element",       overridable: true },
        ],
    },

    find: {
        label: "Find",
        shortcuts: [
            { keys: pk('f'),            description: "Find on page",                   overridable: true },
            { keys: pk('g'),            description: "Find next",                      overridable: true },
            { keys: psk('g'),           description: "Find previous",                  overridable: true },
            { keys: '<F3>',             description: "Find next",                      overridable: true },
            { keys: '<Shift-F3>',       description: "Find previous",                  overridable: true },
        ],
    },

    zoom: {
        label: "Zoom",
        shortcuts: [
            { keys: pk('+'),            description: "Zoom in",                        overridable: true },
            { keys: pk('-'),            description: "Zoom out",                       overridable: true },
            { keys: pk('0'),            description: "Reset zoom",                     overridable: true },
        ],
    },

    bookmarks: {
        label: "Bookmarks & History",
        shortcuts: [
            { keys: pk('d'),            description: "Bookmark current page",          overridable: true },
            { keys: psk('b'),           description: "Toggle bookmarks bar",           overridable: true },
            { keys: psk('o'),           description: "Open bookmark manager",          overridable: true },
            // WHY: On Mac, Cmd+Y opens history (not Cmd+H which hides the app)
            isMac
                ? { keys: '<Meta-y>',   description: "Open history",                  overridable: true }
                : { keys: pk('h'),      description: "Open history",                  overridable: true },
            { keys: psk('j'),           description: "Open downloads",                 overridable: true },
        ],
    },

    devtools: {
        label: "Developer Tools",
        shortcuts: [
            { keys: '<F12>',            description: "Toggle DevTools",                overridable: true },
            { keys: psk('i'),           description: "Toggle DevTools",                overridable: true },
            { keys: psk('j'),           description: "Open DevTools Console",          overridable: true },
            { keys: psk('c'),           description: "Inspect element",                overridable: true },
            { keys: pk('u'),            description: "View page source",               overridable: true },
            // WHY: On Mac, Cmd+Option+I is also DevTools (Option = Alt)
            ...(isMac ? [{ keys: '<Meta-Alt-i>', description: "Toggle DevTools (alt)", overridable: true }] : []),
        ],
    },

    misc: {
        label: "Miscellaneous",
        shortcuts: [
            { keys: pk('p'),            description: "Print page",                     overridable: true },
            { keys: pk('s'),            description: "Save page",                      overridable: true },
            // WHY: Clear browsing data shortcut differs per OS
            isMac
                ? { keys: '<Meta-Shift-Delete>', description: "Clear browsing data",   overridable: false }
                : { keys: '<Ctrl-Shift-Delete>', description: "Clear browsing data",   overridable: false },
            { keys: '<F11>',            description: "Toggle fullscreen",              overridable: true },
            // WHY: Cmd+, opens settings on Mac (standard macOS convention)
            ...(isMac ? [{ keys: '<Meta-,>', description: "Open settings",             overridable: true }] : []),
            // WHY: Cmd+H hides app on Mac — this is an OS-level shortcut, not Chrome
            ...(isMac ? [{ keys: '<Meta-h>', description: "Hide browser (macOS)",      overridable: false }] : []),
            // WHY: Cmd+M minimizes on Mac
            ...(isMac ? [{ keys: '<Meta-m>', description: "Minimize window (macOS)",   overridable: false }] : []),
        ],
    },
};

// Flat list for lookup: { "<Meta-t>": { description, overridable, category } }
const BROWSER_DEFAULTS_FLAT = {};
for (const [category, group] of Object.entries(BROWSER_DEFAULTS)) {
    for (const shortcut of group.shortcuts) {
        BROWSER_DEFAULTS_FLAT[shortcut.keys] = {
            description: shortcut.description,
            overridable: shortcut.overridable,
            category: group.label,
        };
    }
}

export { BROWSER_DEFAULTS, BROWSER_DEFAULTS_FLAT };
