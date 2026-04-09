/**
 * settingsShell.js — Settings page shell: sidebar navigation, search/filter
 * dispatch, preset handling, and version display.
 *
 * WHY an ES module: keeps the shell logic decoupled from keybindingsTable,
 * keyInputWidget, and the Ace editor so each can be developed/tested independently.
 */

/**
 * Initialize the settings shell — tab switching, search, filter chips,
 * preset dropdown, and version display.
 * Call once after DOMContentLoaded.
 */
export function initSettingsShell() {
    initTabSwitching();
    initSearch();
    initFilterChips();
    initPresetDropdown();
    initVersionDisplay();
    initSaveRevertBar();
}

/* ---- Tab switching ---- */

// WHY: module-level counter so both tab switching and the save/revert bar
// can check whether there are unsaved keybinding edits.
let _pendingCount = 0;

function initTabSwitching() {
    const sidebarItems = document.querySelectorAll('#settings-sidebar li[data-tab]');
    const panels = document.querySelectorAll('.tab-panel');
    const header = document.getElementById('settings-header');

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.dataset.tab;

            // WHY: warn before navigating away from keybindings tab with unsaved edits
            const currentTab = document.querySelector('#settings-sidebar li.active');
            if (currentTab && currentTab.dataset.tab === 'keybindings' && tabName !== 'keybindings' && _pendingCount > 0) {
                if (!confirm('You have unsaved changes. Leave the Keybindings tab?')) {
                    return;
                }
            }

            // WHY: update both sidebar active state and panel visibility in one pass
            sidebarItems.forEach(li => li.classList.remove('active'));
            item.classList.add('active');

            panels.forEach(panel => {
                const isTarget = panel.id === `tab-${tabName}`;
                panel.classList.toggle('active', isTarget);
                // WHY: style.display needed alongside .active because some panels
                // use flex layout (advanced tab) while others use block
                if (isTarget) {
                    panel.style.display = '';
                } else {
                    panel.style.display = 'none';
                }
            });

            // WHY: header bar (search/filter/presets) is only relevant on the keybindings tab
            header.style.display = tabName === 'keybindings' ? '' : 'none';
        });
    });
}

/* ---- Search input with mode toggle (command vs key) ---- */

function initSearch() {
    const searchInput = document.getElementById('searchBindings');
    const modeToggle = document.getElementById('searchModeToggle');
    const clearBtn = document.getElementById('searchClear');
    let debounceTimer = null;
    let searchMode = 'command'; // 'command' or 'key'

    // Show/hide clear button based on input content
    function updateClearBtn() {
        if (clearBtn) {
            clearBtn.style.display = searchInput.value ? '' : 'none';
        }
    }

    // WHY: Clear button handler is defined later (after key mode state vars)
    // so it can reset _lastBaseKey and _heldMods. See _initClearButton below.

    // Mode toggle buttons
    modeToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-search-mode]');
        if (!btn) return;

        searchMode = btn.dataset.searchMode;
        modeToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update input appearance and behavior
        if (searchMode === 'key') {
            searchInput.classList.add('key-mode');
            searchInput.placeholder = 'Press a key to search...';
            searchInput.value = '';
            searchInput.readOnly = true; // prevent typing — we capture keydown instead
            searchInput.focus();
        } else {
            searchInput.classList.remove('key-mode');
            searchInput.placeholder = 'Search by command name...';
            searchInput.value = '';
            searchInput.readOnly = false;
        }

        // Clear current search
        document.dispatchEvent(new CustomEvent('kitingkeys:searchBindings', {
            detail: { query: '', mode: searchMode }
        }));
    });

    // Command mode: normal text input with debounce
    searchInput.addEventListener('input', () => {
        updateClearBtn();
        if (searchMode !== 'command') return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            document.dispatchEvent(new CustomEvent('kitingkeys:searchBindings', {
                detail: { query: searchInput.value.trim(), mode: 'command' }
            }));
        }, 150);
    });

    // WHY: Key mode tracks both the base key AND held modifiers, updating
    // the table results in real-time. Holding Ctrl narrows to Ctrl combos.
    // Adding Shift narrows further. Releasing modifiers widens back.
    // The search input shows the current match state: e.g. "ctrl + t"
    let _heldMods = { ctrl: false, alt: false, shift: false, meta: false };
    let _lastBaseKey = '';  // the literal key portion being searched

    // Clear button — resets both command and key search state
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.readOnly = (searchMode === 'key');
            _lastBaseKey = '';
            _heldMods = { ctrl: false, alt: false, shift: false, meta: false };
            updateClearBtn();
            _clearSearchFeedback();
            document.dispatchEvent(new CustomEvent('kitingkeys:searchBindings', {
                detail: { query: '', mode: searchMode, modifiers: [] }
            }));
            searchInput.focus();
        });
    }

    function _dispatchKeySearch() {
        // Build modifier list from held state
        const mods = [];
        if (_heldMods.ctrl || _heldMods.meta) mods.push('ctrl');  // treat meta as ctrl for matching
        if (_heldMods.alt) mods.push('alt');
        if (_heldMods.shift) mods.push('shift');

        // Display: show held modifiers + base key
        let display = mods.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' + ');
        if (_lastBaseKey) {
            display = display ? display + ' + ' + _lastBaseKey : _lastBaseKey;
        }
        searchInput.value = display || '';
        updateClearBtn();

        document.dispatchEvent(new CustomEvent('kitingkeys:searchBindings', {
            detail: {
                query: _lastBaseKey,
                mode: 'key',
                modifiers: mods,  // active modifiers for filtering
            }
        }));

        // Show/hide locked keys feedback when modifiers are held
        if (mods.length > 0 && !_lastBaseKey) {
            const modName = _heldMods.meta ? 'Meta' : (_heldMods.ctrl ? 'Ctrl' : mods[0]);
            _showLockedKeysInSearch(modName);
        } else {
            _clearSearchFeedback();
        }
    }

    searchInput.addEventListener('keydown', (e) => {
        if (searchMode !== 'key') return;

        // Escape: clear everything
        if (e.key === 'Escape') {
            _lastBaseKey = '';
            _heldMods = { ctrl: false, alt: false, shift: false, meta: false };
            searchInput.value = '';
            updateClearBtn();
            _clearSearchFeedback();
            document.dispatchEvent(new CustomEvent('kitingkeys:searchBindings', {
                detail: { query: '', mode: 'key', modifiers: [] }
            }));
            e.preventDefault();
            return;
        }

        // Track modifier key presses — update results dynamically
        if (e.key === 'Control') { _heldMods.ctrl = true; e.preventDefault(); _dispatchKeySearch(); return; }
        if (e.key === 'Meta')    { _heldMods.meta = true; e.preventDefault(); _dispatchKeySearch(); return; }
        if (e.key === 'Alt')     { _heldMods.alt = true;  e.preventDefault(); _dispatchKeySearch(); return; }
        if (e.key === 'Shift')   { _heldMods.shift = true; e.preventDefault(); _dispatchKeySearch(); return; }

        e.preventDefault();
        e.stopPropagation();

        // Non-modifier key: set as the base key and dispatch
        let baseKey = e.key;
        if (baseKey.length === 1) baseKey = baseKey.toLowerCase();
        _lastBaseKey = baseKey;
        _dispatchKeySearch();
    });

    searchInput.addEventListener('keyup', (e) => {
        if (searchMode !== 'key') return;

        // Track modifier releases — widen results dynamically
        let changed = false;
        if (e.key === 'Control') { _heldMods.ctrl = false; changed = true; }
        if (e.key === 'Meta')    { _heldMods.meta = false; changed = true; }
        if (e.key === 'Alt')     { _heldMods.alt = false;  changed = true; }
        if (e.key === 'Shift')   { _heldMods.shift = false; changed = true; }
        if (changed) _dispatchKeySearch();
    });

    // WHY: When focus is lost (e.g., browser intercepted a locked combo),
    // reset modifier state since keyup events won't fire.
    searchInput.addEventListener('blur', () => {
        if (searchMode !== 'key') return;
        _heldMods = { ctrl: false, alt: false, shift: false, meta: false };
        // Keep _lastBaseKey so results persist; just release modifiers
        _dispatchKeySearch();
    });
}

// Feedback element for key search mode — shows locked keys when modifier held
let _searchFeedbackEl = null;

function _showLockedKeysInSearch(modifier) {
    // WHY: Access the registry via window global set by options.js
    const registry = window.__kitingkeys_registry;
    if (!registry) {
        _showSearchFeedback('\uD83D\uDD12 ' + modifier + ': some combos are browser-locked', 'warning');
        return;
    }
    const all = registry.getAllBindings();
    const locked = [];
    for (let i = 0; i < all.length; i++) {
        const entry = all[i];
        if (entry.source !== 'browser' || entry.overridable) continue;
        const keys = (entry.keys || '').toLowerCase();
        if (modifier === 'Meta' && (keys.indexOf('meta') !== -1 || keys.indexOf('ctrl') !== -1)) {
            locked.push(entry.keys);
        } else if (modifier === 'Ctrl' && keys.indexOf('ctrl') !== -1) {
            locked.push(entry.keys);
        }
    }
    if (locked.length === 0) return;
    const list = locked.slice(0, 12).join(', ') + (locked.length > 12 ? ', ...' : '');
    _showSearchFeedback('\uD83D\uDD12 Locked: ' + list, 'warning');
}

function _showSearchFeedback(text, type) {
    _clearSearchFeedback();
    const header = document.getElementById('settings-header');
    if (!header) return;
    _searchFeedbackEl = document.createElement('div');
    _searchFeedbackEl.className = 'search-feedback search-feedback-' + type;
    _searchFeedbackEl.textContent = text;
    header.appendChild(_searchFeedbackEl);
}

function _clearSearchFeedback() {
    if (_searchFeedbackEl && _searchFeedbackEl.parentNode) {
        _searchFeedbackEl.parentNode.removeChild(_searchFeedbackEl);
    }
    _searchFeedbackEl = null;
}

/* ---- Filter chips ---- */

function initFilterChips() {
    const chipContainer = document.getElementById('filterChips');

    chipContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-filter]');
        if (!btn) return;

        // WHY: single-select — only one filter active at a time
        chipContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.dispatchEvent(new CustomEvent('kitingkeys:filterBindings', {
            detail: { filter: btn.dataset.filter }
        }));
    });
}

/* ---- Preset dropdown ---- */

function initPresetDropdown() {
    const dropdown = document.getElementById('presetDropdown');
    const importInput = document.getElementById('importFileInput');

    dropdown.addEventListener('change', () => {
        const value = dropdown.value;
        if (!value) return;

        // WHY: reset dropdown to placeholder so the same option can be re-selected
        dropdown.value = '';

        if (value === 'export') {
            handleExport();
        } else if (value === 'import') {
            handleImport(importInput);
        } else {
            document.dispatchEvent(new CustomEvent('kitingkeys:applyPreset', {
                detail: { preset: value }
            }));
        }
    });

    // WHY: file input change handler is separate so it fires after user picks a file
    if (importInput) {
        importInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    document.dispatchEvent(new CustomEvent('kitingkeys:applyPreset', {
                        detail: { preset: 'import', data }
                    }));
                } catch (err) {
                    console.error('KitingKeys: failed to parse import JSON', err);
                    alert('Invalid JSON file. Please select a valid KitingKeys export.');
                }
            };
            reader.readAsText(file);

            // WHY: clear the input so re-importing the same file triggers change again
            importInput.value = '';
        });
    }
}

function handleExport() {
    // WHY: dispatch event so the keybindings module (which owns the data) can
    // provide the JSON payload. We listen for the response event.
    const responseHandler = (e) => {
        document.removeEventListener('kitingkeys:exportReady', responseHandler);
        const blob = new Blob([JSON.stringify(e.detail.data, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kitingkeys-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    document.addEventListener('kitingkeys:exportReady', responseHandler);
    document.dispatchEvent(new CustomEvent('kitingkeys:applyPreset', {
        detail: { preset: 'export' }
    }));
}

function handleImport(importInput) {
    if (importInput) {
        importInput.click();
    }
}

/* ---- Version display ---- */

function initVersionDisplay() {
    const versionSpan = document.getElementById('version');
    if (!versionSpan) return;

    // WHY: chrome.runtime may not exist in test environments
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
            versionSpan.textContent = chrome.runtime.getManifest().version;
        }
    } catch (_) {
        // Silently ignore — version display is non-critical
    }
}

/* ---- Save / Revert bar (T017: draft model) ---- */

function initSaveRevertBar() {
    const bar = document.getElementById('save-revert-bar');
    const countSpan = document.getElementById('pending-count');
    const saveBtn = document.getElementById('save-btn');
    const revertBtn = document.getElementById('revert-btn');

    if (!bar || !saveBtn || !revertBtn) return;

    // WHY: Show/hide the bar based on pending change count dispatched by options.js
    document.addEventListener('kitingkeys:pendingChangesUpdated', (e) => {
        const count = (e.detail && e.detail.count) || 0;
        _pendingCount = count;

        if (count > 0) {
            bar.style.display = '';
            countSpan.textContent = count + ' unsaved change' + (count !== 1 ? 's' : '');
        } else {
            bar.style.display = 'none';
        }
    });

    saveBtn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('kitingkeys:saveChanges'));
    });

    revertBtn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('kitingkeys:revertChanges'));
    });
}

/* ---- Auto-init on DOMContentLoaded ---- */
// WHY: auto-init so the HTML just needs <script type="module" src="settingsShell.js">
// without extra boilerplate. Named export still available for testing.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsShell);
} else {
    initSettingsShell();
}
