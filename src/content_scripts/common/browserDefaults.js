// Browser default keyboard shortcuts for Chrome/Brave.
// WHY: KitingKeys needs a static reference of browser-native shortcuts because
// browsers don't expose this data via any API. This powers the defaults display
// in the options UI and the "restore to browser defaults" feature.
//
// Each entry is categorized and marked as overridable or not:
//   overridable: true  — page-level key, extension can intercept/suppress
//   overridable: false — browser chrome shortcut, cannot be intercepted
//   overridable: "commands" — can be overridden via chrome.commands API
//                             (user must manually assign in chrome://extensions/shortcuts)
//
// See also:
//   src/content_scripts/common/keyboardUtils.js - key encoding/decoding
//   src/content_scripts/common/default.js - KitingKeys/Surfingkeys default mappings

const BROWSER_DEFAULTS = {
    // --- Tab & Window Management ---
    tabs: {
        label: "Tabs & Windows",
        shortcuts: [
            { keys: "<Ctrl-t>",       description: "Open new tab",                   overridable: false },
            { keys: "<Ctrl-n>",       description: "Open new window",                overridable: false },
            { keys: "<Ctrl-Shift-n>", description: "Open new incognito window",      overridable: false },
            { keys: "<Ctrl-w>",       description: "Close current tab",              overridable: false },
            { keys: "<Ctrl-Shift-w>", description: "Close current window",           overridable: false },
            { keys: "<Ctrl-Shift-t>", description: "Reopen last closed tab",         overridable: false },
            { keys: "<Ctrl-Tab>",     description: "Switch to next tab",             overridable: false },
            { keys: "<Ctrl-Shift-Tab>", description: "Switch to previous tab",       overridable: false },
            { keys: "<Ctrl-1>",       description: "Go to tab 1",                    overridable: false },
            { keys: "<Ctrl-2>",       description: "Go to tab 2",                    overridable: false },
            { keys: "<Ctrl-3>",       description: "Go to tab 3",                    overridable: false },
            { keys: "<Ctrl-4>",       description: "Go to tab 4",                    overridable: false },
            { keys: "<Ctrl-5>",       description: "Go to tab 5",                    overridable: false },
            { keys: "<Ctrl-6>",       description: "Go to tab 6",                    overridable: false },
            { keys: "<Ctrl-7>",       description: "Go to tab 7",                    overridable: false },
            { keys: "<Ctrl-8>",       description: "Go to tab 8",                    overridable: false },
            { keys: "<Ctrl-9>",       description: "Go to last tab",                 overridable: false },
            { keys: "<Alt-F4>",       description: "Close window (Windows/Linux)",   overridable: false },
        ],
    },

    // --- Navigation ---
    navigation: {
        label: "Navigation",
        shortcuts: [
            { keys: "<Alt-ArrowLeft>",  description: "Go back",                      overridable: true },
            { keys: "<Alt-ArrowRight>", description: "Go forward",                   overridable: true },
            { keys: "<Ctrl-l>",         description: "Focus address bar",            overridable: false },
            { keys: "<F5>",             description: "Reload page",                  overridable: true },
            { keys: "<Ctrl-r>",         description: "Reload page",                  overridable: false },
            { keys: "<Ctrl-Shift-r>",   description: "Hard reload (bypass cache)",   overridable: false },
            { keys: "<Escape>",         description: "Stop loading / close dialog",  overridable: true },
            { keys: "<Alt-Home>",       description: "Open home page",               overridable: true },
            { keys: "<Alt-d>",          description: "Focus address bar",            overridable: false },
        ],
    },

    // --- Page Scrolling & Interaction ---
    page: {
        label: "Page Interaction",
        shortcuts: [
            { keys: "<Space>",          description: "Scroll down",                  overridable: true },
            { keys: "<Shift-Space>",    description: "Scroll up",                    overridable: true },
            { keys: "<Home>",           description: "Scroll to top",                overridable: true },
            { keys: "<End>",            description: "Scroll to bottom",             overridable: true },
            { keys: "<PageDown>",       description: "Scroll down one page",         overridable: true },
            { keys: "<PageUp>",         description: "Scroll up one page",           overridable: true },
            { keys: "<Tab>",            description: "Focus next element",           overridable: true },
            { keys: "<Shift-Tab>",      description: "Focus previous element",       overridable: true },
            { keys: "<Enter>",          description: "Activate focused element",     overridable: true },
        ],
    },

    // --- Find ---
    find: {
        label: "Find",
        shortcuts: [
            { keys: "<Ctrl-f>",         description: "Find on page",                overridable: false },
            { keys: "<Ctrl-g>",         description: "Find next",                   overridable: false },
            { keys: "<Ctrl-Shift-g>",   description: "Find previous",               overridable: false },
            { keys: "<F3>",             description: "Find next",                   overridable: true },
            { keys: "<Shift-F3>",       description: "Find previous",               overridable: true },
            { keys: "/",               description: "Quick find (Firefox only)",    overridable: true },
        ],
    },

    // --- Zoom ---
    zoom: {
        label: "Zoom",
        shortcuts: [
            { keys: "<Ctrl-+>",         description: "Zoom in",                     overridable: false },
            { keys: "<Ctrl-->",          description: "Zoom out",                    overridable: false },
            { keys: "<Ctrl-0>",          description: "Reset zoom",                  overridable: false },
        ],
    },

    // --- Bookmarks & History ---
    bookmarks: {
        label: "Bookmarks & History",
        shortcuts: [
            { keys: "<Ctrl-d>",         description: "Bookmark current page",       overridable: false },
            { keys: "<Ctrl-Shift-b>",   description: "Toggle bookmarks bar",        overridable: false },
            { keys: "<Ctrl-Shift-o>",   description: "Open bookmark manager",       overridable: false },
            { keys: "<Ctrl-h>",         description: "Open history",                overridable: false },
            { keys: "<Ctrl-j>",         description: "Open downloads",              overridable: false },
        ],
    },

    // --- Developer Tools ---
    devtools: {
        label: "Developer Tools",
        shortcuts: [
            { keys: "<F12>",            description: "Toggle DevTools",             overridable: true },
            { keys: "<Ctrl-Shift-i>",   description: "Toggle DevTools",             overridable: false },
            { keys: "<Ctrl-Shift-j>",   description: "Open DevTools Console",       overridable: false },
            { keys: "<Ctrl-Shift-c>",   description: "Inspect element",             overridable: false },
            { keys: "<Ctrl-u>",         description: "View page source",            overridable: false },
        ],
    },

    // --- Misc ---
    misc: {
        label: "Miscellaneous",
        shortcuts: [
            { keys: "<Ctrl-p>",         description: "Print page",                  overridable: false },
            { keys: "<Ctrl-s>",         description: "Save page",                   overridable: false },
            { keys: "<Ctrl-Shift-Delete>", description: "Clear browsing data",      overridable: false },
            { keys: "<F11>",            description: "Toggle fullscreen",           overridable: true },
            { keys: "<F1>",             description: "Open help (Brave)",           overridable: true },
        ],
    },
};

// Flat list for lookup: { "<Ctrl-t>": { description, overridable, category } }
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
