/**
 * BindingRegistry — unified data layer that merges default extension bindings,
 * browser default shortcuts, and user overrides into a single flat list.
 *
 * Satisfies F001 (display ALL keybindings) and F009 (single merged data structure).
 *
 * The registry does NOT interact with chrome.storage directly — the caller
 * (options.js) handles persistence and passes data in via init methods.
 */

import { BROWSER_DEFAULTS } from '../content_scripts/common/browserDefaults.js';
import KeyboardUtils from '../content_scripts/common/keyboardUtils.js';

// Feature group index -> human-readable category name.
// Must stay in sync with frontend.js buildUsage().
const FEATURE_GROUPS = [
    'Help',                  // 0
    'Mouse Click',           // 1
    'Scroll Page / Element', // 2
    'Tabs',                  // 3
    'Page Navigation',       // 4
    'Sessions',              // 5
    'Search selected with',  // 6
    'Clipboard',             // 7
    'Omnibar',               // 8
    'Visual Mode',           // 9
    'vim-like marks',        // 10
    'Settings',              // 11
    'Chrome URLs',           // 12
    'Proxy',                 // 13
    'Misc',                  // 14
    'Insert Mode',           // 15
    'Lurk Mode',             // 16
    'Regional Hints Mode',   // 17
];

/**
 * Convert a keys string in internal trie-encoded format to display format.
 * E.g. encoded char -> "<Ctrl-t>" or plain "j".
 */
function keysToDisplay(keysEncoded) {
    return KeyboardUtils.decodeKeystroke(keysEncoded);
}

/**
 * Convert a display-format key string to encoded format.
 * E.g. "<Ctrl-t>" -> encoded char, "j" -> "j".
 */
function keysToEncoded(keysDisplay) {
    return KeyboardUtils.encodeKeystroke(keysDisplay);
}

/**
 * Sanitize a browser-default keys string into display format.
 * Browser defaults use "<Ctrl-t>" style already — strip angle brackets
 * and rejoin with "+".
 * E.g. "<Ctrl-t>" -> "Ctrl+T", "<Ctrl-Shift-n>" -> "Ctrl+Shift+N"
 */
function browserKeysToDisplay(keys) {
    // Already in angle-bracket format like "<Ctrl-t>"
    // Return as-is — this is the same notation used throughout the codebase.
    return keys;
}

/**
 * Generate a stable id for a browser default entry.
 * E.g. "browser:ctrl-t" from "<Ctrl-t>"
 */
function browserEntryId(keys) {
    // Strip angle brackets, lowercase, replace dashes with hyphens
    var inner = keys.replace(/^<|>$/g, '').toLowerCase();
    return 'browser:' + inner;
}

/**
 * Generate a stable id for an extension entry.
 * Uses the annotation (command name) slugified.
 * E.g. "ext:normal:scroll-down"
 */
function extEntryId(mode, annotation) {
    // WHY: annotation may be a non-string value (number, function) from some trie entries
    var slug = String(annotation || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return 'ext:' + mode + ':' + slug;
}

/**
 * Ensure unique ids by appending a suffix if needed.
 */
function ensureUniqueId(id, existingIds) {
    if (!existingIds.has(id)) {
        existingIds.add(id);
        return id;
    }
    var n = 2;
    while (existingIds.has(id + '-' + n)) {
        n++;
    }
    var uniqueId = id + '-' + n;
    existingIds.add(uniqueId);
    return uniqueId;
}


function BindingRegistry() {
    // All binding entries indexed by id
    this._entries = new Map();
    // Default (pristine) keys for each entry id, for reset
    this._defaults = new Map();
    // Set of all ids for uniqueness
    this._ids = new Set();
    // Whether init has been called
    this._initialized = false;
}

BindingRegistry.prototype = {
    /**
     * Initialize extension bindings from mode trie mappings.
     * Called when surfingkeys:defaultSettingsLoaded fires.
     *
     * Each mapping object should have:
     *   - mappings: a trie with getWords() and find(word) returning { meta }
     *
     * @param {object} normalMappings - normal mode trie
     * @param {object} insertMappings - insert mode trie
     * @param {object} visualMappings - visual mode trie
     */
    initFromTrie: function(normalMappings, insertMappings, visualMappings) {
        this._entries.clear();
        this._defaults.clear();
        this._ids.clear();

        // Load browser defaults first
        this._loadBrowserDefaults();

        // Load extension defaults from each mode trie
        var modes = [
            { name: 'normal', mappings: normalMappings },
            { name: 'insert', mappings: insertMappings },
            { name: 'visual', mappings: visualMappings },
        ];

        for (var i = 0; i < modes.length; i++) {
            var mode = modes[i];
            if (!mode.mappings) continue;

            var words = mode.mappings.getWords();
            for (var j = 0; j < words.length; j++) {
                var word = words[j];
                var node = mode.mappings.find(word);
                if (!node || !node.meta) continue;

                var meta = node.meta;
                // WHY: meta.annotation may be a function in some trie nodes; coerce to string
                var annotation = typeof meta.annotation === 'string' ? meta.annotation : String(meta.annotation || '');
                var featureGroup = meta.feature_group;
                var category = (featureGroup !== undefined && FEATURE_GROUPS[featureGroup])
                    ? FEATURE_GROUPS[featureGroup]
                    : 'Misc';

                var keysEncoded = word;
                var keysDisplay = keysToDisplay(word);

                var id = ensureUniqueId(
                    extEntryId(mode.name, annotation || keysDisplay),
                    this._ids
                );

                var entry = {
                    id: id,
                    command: annotation,
                    keys: keysDisplay,
                    keysEncoded: keysEncoded,
                    mode: mode.name,
                    source: 'default',
                    category: category,
                    overridable: true,
                    conflicts: [],
                };

                this._entries.set(id, entry);
                this._defaults.set(id, keysDisplay);
            }
        }

        this._initialized = true;
        this._detectConflicts();
    },

    /**
     * Apply user overrides from storage.
     * Called when surfingkeys:userSettingsLoaded fires.
     *
     * @param {object} userOverrides - a basicMappings-style object, e.g. {"j": "J", "f": ""}
     *   Keys are original key strings (display format), values are new key strings.
     *   Empty string means unmapped.
     */
    initFromStorage: function(userOverrides) {
        if (!userOverrides || typeof userOverrides !== 'object') return;

        // userOverrides maps original keys -> new keys (display format)
        // We need to find entries that match the original keys and update them.
        var entriesByKeys = new Map();
        this._entries.forEach(function(entry) {
            // Index by default keys for matching overrides
            var defaultKeys = this._defaults.get(entry.id);
            if (defaultKeys) {
                if (!entriesByKeys.has(defaultKeys)) {
                    entriesByKeys.set(defaultKeys, []);
                }
                entriesByKeys.get(defaultKeys).push(entry);
            }
        }.bind(this));

        for (var originalKeys in userOverrides) {
            if (!userOverrides.hasOwnProperty(originalKeys)) continue;
            var newKeys = userOverrides[originalKeys];
            var matches = entriesByKeys.get(originalKeys);
            if (!matches) continue;

            for (var i = 0; i < matches.length; i++) {
                var entry = matches[i];
                entry.keys = newKeys;
                entry.keysEncoded = newKeys ? keysToEncoded(newKeys) : '';
                entry.source = 'user';
            }
        }

        this._detectConflicts();
    },

    /**
     * Load browser default shortcuts from the BROWSER_DEFAULTS object.
     */
    _loadBrowserDefaults: function() {
        for (var category in BROWSER_DEFAULTS) {
            if (!BROWSER_DEFAULTS.hasOwnProperty(category)) continue;
            var group = BROWSER_DEFAULTS[category];
            var shortcuts = group.shortcuts;

            for (var i = 0; i < shortcuts.length; i++) {
                var shortcut = shortcuts[i];
                var keysDisplay = browserKeysToDisplay(shortcut.keys);
                var id = ensureUniqueId(browserEntryId(shortcut.keys), this._ids);

                var entry = {
                    id: id,
                    command: shortcut.description,
                    keys: keysDisplay,
                    keysEncoded: keysToEncoded(keysDisplay),
                    mode: 'browser',
                    source: 'browser',
                    category: group.label,
                    overridable: shortcut.overridable,
                    conflicts: [],
                };

                this._entries.set(id, entry);
                this._defaults.set(id, keysDisplay);
            }
        }
    },

    /**
     * Scan all entries, group by keys, flag groups with >1 entry as conflicts.
     */
    _detectConflicts: function() {
        // Clear existing conflicts
        this._entries.forEach(function(entry) {
            entry.conflicts = [];
        });

        // WHY: entries.keys is now an array. Group by each individual key string.
        var byKeys = new Map();
        this._entries.forEach(function(entry) {
            var keys = Array.isArray(entry.keys) ? entry.keys : (entry.keys ? [entry.keys] : []);
            for (var k = 0; k < keys.length; k++) {
                if (!keys[k]) continue;
                var key = keys[k].toLowerCase();
                if (!byKeys.has(key)) {
                    byKeys.set(key, []);
                }
                byKeys.get(key).push(entry);
            }
        });

        // For each group with >1 entry, mark all as conflicting
        byKeys.forEach(function(group) {
            if (group.length <= 1) return;
            for (var i = 0; i < group.length; i++) {
                var entry = group[i];
                for (var j = 0; j < group.length; j++) {
                    if (i === j) continue;
                    var other = group[j];
                    entry.conflicts.push({
                        keys: Array.isArray(other.keys) ? other.keys[0] : other.keys,
                        source: other.source,
                        command: other.command,
                    });
                }
            }
        });
    },

    // ---- Core API ----

    /**
     * Return all bindings as a flat array.
     * @returns {BindingEntry[]}
     */
    getAllBindings: function() {
        var result = [];
        this._entries.forEach(function(entry) {
            result.push(entry);
        });
        return result;
    },

    /**
     * Return all conflict entries across all bindings.
     * @returns {ConflictEntry[]}
     */
    getConflicts: function() {
        var conflicts = [];
        var seen = new Set();
        this._entries.forEach(function(entry) {
            if (entry.conflicts.length === 0) return;
            // Include the entry itself as part of the conflict group
            var conflictKey = entry.keys;
            if (!seen.has(conflictKey)) {
                seen.add(conflictKey);
                // Collect all entries with this key
                var group = [];
                this._entries.forEach(function(e) {
                    if (e.keys === conflictKey) {
                        group.push({
                            keys: e.keys,
                            source: e.source,
                            command: e.command,
                            id: e.id,
                        });
                    }
                });
                conflicts.push({
                    keys: conflictKey,
                    entries: group,
                });
            }
        }.bind(this));
        return conflicts;
    },

    /**
     * Check if a key string conflicts with any existing binding.
     * Returns null if no conflict, or a conflict descriptor:
     *   { type: "locked" | "browser_overridable" | "extension", entry: BindingEntry }
     * @param {string} keys - decoded key string, e.g. "j" or "<Ctrl-t>"
     * @param {string} [excludeId] - binding ID to exclude from check (the one being edited)
     */
    checkConflict: function(keys, excludeId) {
        if (!keys) return null;
        var normalized = keys.toLowerCase();
        var result = null;
        this._entries.forEach(function(entry) {
            if (result) return; // already found worst conflict
            if (entry.id === excludeId) return;
            // WHY: entry.keys is now an array — check if any slot matches
            var entryKeys = Array.isArray(entry.keys) ? entry.keys : (entry.keys ? [entry.keys] : []);
            var hasMatch = false;
            for (var k = 0; k < entryKeys.length; k++) {
                if (entryKeys[k] && entryKeys[k].toLowerCase() === normalized) { hasMatch = true; break; }
            }
            if (!hasMatch) return;

            if (entry.source === 'browser' && !entry.overridable) {
                // Locked browser shortcut — hard block
                result = { type: 'locked', entry: entry };
            } else if (entry.source === 'browser' && entry.overridable) {
                // Overridable browser shortcut — warning only
                if (!result || result.type !== 'locked') {
                    result = { type: 'browser_overridable', entry: entry };
                }
            } else {
                // Another extension binding — warning
                if (!result) {
                    result = { type: 'extension', entry: entry };
                }
            }
        });
        return result;
    },

    // ---- Mutations ----

    /**
     * Change a specific key slot for a binding.
     * @param {string} id
     * @param {string} newKeys - display format, e.g. "J" or "<Ctrl-t>"
     * @param {number} [index=0] - which key slot to update (for multi-key bindings)
     */
    updateBinding: function(id, newKeys, index) {
        var entry = this._entries.get(id);
        if (!entry) return;
        // WHY: Support both legacy single-key and new multi-key model.
        // Normalize entry.keys to array if needed.
        if (!Array.isArray(entry.keys)) {
            entry.keys = entry.keys ? [entry.keys] : [];
            entry.keysEncoded = entry.keysEncoded ? [entry.keysEncoded] : [];
        }
        var idx = index || 0;
        if (newKeys) {
            entry.keys[idx] = newKeys;
            entry.keysEncoded[idx] = keysToEncoded(newKeys);
        } else {
            // Empty key at this index — remove the slot
            entry.keys.splice(idx, 1);
            entry.keysEncoded.splice(idx, 1);
        }
        entry.source = 'user';
        this._detectConflicts();
    },

    /**
     * Add an additional keybinding to a command.
     * @param {string} id
     * @param {string} newKeys
     */
    addBinding: function(id, newKeys) {
        var entry = this._entries.get(id);
        if (!entry) return;
        if (!Array.isArray(entry.keys)) {
            entry.keys = entry.keys ? [entry.keys] : [];
            entry.keysEncoded = entry.keysEncoded ? [entry.keysEncoded] : [];
        }
        entry.keys.push(newKeys);
        entry.keysEncoded.push(keysToEncoded(newKeys));
        entry.source = 'user';
        this._detectConflicts();
    },

    /**
     * Remove a specific key slot from a multi-key binding.
     * @param {string} id
     * @param {number} index
     */
    removeKey: function(id, index) {
        var entry = this._entries.get(id);
        if (!entry) return;
        if (!Array.isArray(entry.keys)) {
            entry.keys = entry.keys ? [entry.keys] : [];
            entry.keysEncoded = entry.keysEncoded ? [entry.keysEncoded] : [];
        }
        entry.keys.splice(index, 1);
        entry.keysEncoded.splice(index, 1);
        entry.source = 'user';
        this._detectConflicts();
    },

    /**
     * Revert a binding to its default keys.
     * @param {string} id
     */
    resetBinding: function(id) {
        var entry = this._entries.get(id);
        if (!entry) return;
        var defaultKeys = this._defaults.get(id);
        if (defaultKeys === undefined) return;
        // WHY: defaults are stored as single strings; wrap in array
        entry.keys = Array.isArray(defaultKeys) ? defaultKeys.slice() : (defaultKeys ? [defaultKeys] : []);
        entry.keysEncoded = entry.keys.map(function(k) { return k ? keysToEncoded(k) : ''; });
        entry.source = 'default';
        this._detectConflicts();
    },

    /**
     * Unbind all keys from a binding.
     * @param {string} id
     */
    removeBinding: function(id) {
        var entry = this._entries.get(id);
        if (!entry) return;
        entry.keys = [];
        entry.keysEncoded = [];
        entry.source = 'user';
        this._detectConflicts();
    },

    // ---- Presets ----

    /**
     * Apply a named preset. Resets all extension bindings to preset defaults.
     * @param {string} presetName - "kitingkeys" | "vimium" | "minimal"
     */
    applyPreset: function(presetName) {
        if (presetName === 'kitingkeys') {
            // Reset all extension entries to their defaults
            this._entries.forEach(function(entry) {
                if (entry.source === 'browser') return;
                var defaultKeys = this._defaults.get(entry.id);
                if (defaultKeys !== undefined) {
                    entry.keys = defaultKeys;
                    entry.keysEncoded = defaultKeys ? keysToEncoded(defaultKeys) : '';
                    entry.source = 'default';
                }
            }.bind(this));
        } else if (presetName === 'vimium') {
            // Apply vimium preset: reset all to defaults first, then the
            // vimium mappings will be applied by the caller via initFromTrie
            // after loading the vimium defaults module.
            this._entries.forEach(function(entry) {
                if (entry.source === 'browser') return;
                var defaultKeys = this._defaults.get(entry.id);
                if (defaultKeys !== undefined) {
                    entry.keys = defaultKeys;
                    entry.keysEncoded = defaultKeys ? keysToEncoded(defaultKeys) : '';
                    entry.source = 'default';
                }
            }.bind(this));
        } else if (presetName === 'minimal') {
            // Minimal preset: unbind everything except essential navigation
            this._entries.forEach(function(entry) {
                if (entry.source === 'browser') return;
                entry.keys = '';
                entry.keysEncoded = '';
                entry.source = 'user';
            }.bind(this));
        }
        this._detectConflicts();
    },

    // ---- Import/Export ----

    /**
     * Export all user-modified bindings as a JSON string.
     * @returns {string}
     */
    exportBindings: function() {
        var overrides = {};
        this._entries.forEach(function(entry) {
            if (entry.source === 'browser') return;
            var defaultKeys = this._defaults.get(entry.id);
            if (entry.keys !== defaultKeys) {
                overrides[entry.id] = {
                    keys: entry.keys,
                    defaultKeys: defaultKeys,
                    command: entry.command,
                    mode: entry.mode,
                };
            }
        }.bind(this));
        return JSON.stringify(overrides, null, 2);
    },

    /**
     * Import bindings from a JSON string (as produced by exportBindings).
     * @param {string} json
     */
    importBindings: function(json) {
        var overrides;
        try {
            overrides = JSON.parse(json);
        } catch (e) {
            throw new Error('Invalid JSON: ' + e.message);
        }

        for (var id in overrides) {
            if (!overrides.hasOwnProperty(id)) continue;
            var override = overrides[id];
            var entry = this._entries.get(id);
            if (entry) {
                entry.keys = override.keys;
                entry.keysEncoded = override.keys ? keysToEncoded(override.keys) : '';
                entry.source = 'user';
            }
        }
        this._detectConflicts();
    },
};

export { BindingRegistry, FEATURE_GROUPS };
