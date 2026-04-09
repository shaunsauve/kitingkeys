/**
 * KeybindingsTable — renders the searchable, filterable keybindings table
 * with inline editing and conflict display.
 *
 * Satisfies F001 (unified table), F002 (search/filter), F004 (conflicts),
 * F005 (inline editing), F006 (context actions).
 *
 * Listens for custom events dispatched by settingsShell.js:
 *   kitingkeys:searchBindings  — text search
 *   kitingkeys:filterBindings  — filter chip selection
 */

import { KeyInputWidget } from './keyInputWidget.js';
import KeyboardUtils from '../content_scripts/common/keyboardUtils.js';

/**
 * Parse a key binding string into structured tokens.
 * WHY: Every previous approach (regex split, indexOf, etc.) broke on edge cases.
 * This parses ONCE and returns a clean object for comparison.
 *
 * Examples:
 *   "t"           → { modifiers: [], key: "t" }
 *   "<Ctrl-t>"    → { modifiers: ["ctrl"], key: "t" }
 *   "<Ctrl-Shift-F12>" → { modifiers: ["ctrl", "shift"], key: "f12" }
 *   "gg"          → { modifiers: [], key: "gg" }
 *   "<Alt-Space>"  → { modifiers: ["alt"], key: "space" }
 *
 * @param {string} keyStr - display format key string
 * @returns {{ modifiers: string[], key: string }}
 */
function parseKeyBinding(keyStr) {
    if (!keyStr) return { modifiers: [], key: '' };

    var s = keyStr.trim();
    var mods = [];
    var key = '';

    // Bracketed format: <Modifier-...-Key>
    if (s.charAt(0) === '<' && s.charAt(s.length - 1) === '>') {
        var inner = s.slice(1, -1); // strip < >
        // Known modifiers to extract (order matters for greedy match)
        var knownMods = ['Ctrl', 'Alt', 'Shift', 'Meta'];
        for (var i = 0; i < knownMods.length; i++) {
            var prefix = knownMods[i] + '-';
            if (inner.indexOf(prefix) === 0 || inner.indexOf(prefix) > 0) {
                // Check if this modifier appears as a prefix segment
                var idx = inner.indexOf(prefix);
                if (idx !== -1) {
                    mods.push(knownMods[i].toLowerCase());
                    inner = inner.slice(0, idx) + inner.slice(idx + prefix.length);
                }
            }
        }
        key = inner.toLowerCase();
    }
    // Display format with +: Ctrl+T, Ctrl+Shift+T
    else if (s.indexOf('+') !== -1) {
        var parts = s.split('+');
        var knownModSet = { ctrl: 1, alt: 1, shift: 1, meta: 1, cmd: 1 };
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].trim().toLowerCase();
            if (knownModSet[p]) {
                mods.push(p === 'cmd' ? 'ctrl' : p);
            } else {
                key = p;
            }
        }
    }
    // Plain key: t, gg, G, /
    else {
        key = s.toLowerCase();
    }

    return { modifiers: mods.sort(), key: key };
}

/**
 * Check if a parsed binding matches a search query.
 * @param {{ modifiers: string[], key: string }} parsed - from parseKeyBinding
 * @param {string} queryKey - the literal key to match (lowercase), or '' for any
 * @param {string[]} queryMods - modifier names to require (lowercase), or [] for none
 * @param {boolean} strictMods - if true and queryMods is empty, only match bindings with NO modifiers
 * @returns {boolean}
 */
function bindingMatchesSearch(parsed, queryKey, queryMods, strictMods) {
    // Key match: exact or empty query (match any)
    if (queryKey && parsed.key !== queryKey) return false;

    // Modifier match
    if (queryMods.length > 0) {
        // All query modifiers must be present in the binding
        for (var i = 0; i < queryMods.length; i++) {
            if (parsed.modifiers.indexOf(queryMods[i]) === -1) return false;
        }
        return true;
    }

    // No query modifiers
    if (strictMods && queryKey) {
        // Strict: only match if binding also has no modifiers
        return parsed.modifiers.length === 0;
    }

    return true;
}

// WHY: Mode display names keep the data layer's lowercase mode values
// separate from what the user sees.
const MODE_LABELS = {
    normal: 'Normal',
    insert: 'Insert',
    visual: 'Visual',
    browser: 'Browser',
};

/**
 * Determine the conflict indicator for a binding entry.
 * Returns { icon, label, tooltip } or null if no conflict.
 */
function describeConflict(entry) {
    if (!entry.conflicts || entry.conflicts.length === 0) return null;

    var parts = [];
    var icon = '';

    for (var i = 0; i < entry.conflicts.length; i++) {
        var c = entry.conflicts[i];

        if (c.source === 'browser') {
            // WHY: Distinguish non-overridable browser keys (hard block) from
            // overridable ones (extension can shadow them).
            if (entry.source === 'browser') {
                // Two browser entries sharing a key — shouldn't happen, but handle gracefully
                icon = icon || '\u26A0';
                parts.push(c.command + ' (browser)');
            } else {
                // Extension key shadows a browser key
                icon = '\u2194';  // ↔
                parts.push(c.command + ' (browser)');
            }
        } else if (entry.source === 'browser' && !entry.overridable) {
            // This is a locked browser key conflicting with an extension binding
            icon = '\uD83D\uDD12';  // 🔒
            parts.push(c.command);
        } else {
            // Two extension bindings share the same key
            icon = '\u26A0';  // ⚠
            parts.push(c.command + ' (' + c.source + ')');
        }
    }

    var label = icon + ' ' + parts[0];
    var tooltip = parts.join('\n');
    return { icon: icon, label: label, tooltip: tooltip };
}

/**
 * Build the "Copy as JS" string for an entry.
 */
function copyAsJs(entry) {
    // WHY: Produce the api.mapkey() call format that users paste into their settings JS.
    var keys = entry.keys || '';
    if (entry.mode === 'normal') {
        return "api.mapkey('" + keys + "', '" + entry.command.replace(/'/g, "\\'") + "', function() { /* ... */ });";
    }
    return "api.mapkey('" + keys + "', '" + entry.command.replace(/'/g, "\\'") + "', function() { /* ... */ }, { domain: /" + entry.mode + "/ });";
}


class KeybindingsTable {
    constructor(containerElement, registry) {
        this._container = containerElement;
        this._registry = registry;

        // Current filter/search state
        this._searchQuery = '';
        this._searchMode = 'command';
        this._searchModifiers = [];
        this._filterType = 'all';

        // Active inline editor — only one at a time
        this._activeWidget = null;
        this._activeWidgetCell = null;
        this._activeWidgetEntryId = null;

        // Active context menu
        this._activeMenu = null;

        // Bind event listeners
        this._onSearch = this._onSearch.bind(this);
        this._onFilter = this._onFilter.bind(this);
        this._onDocClick = this._onDocClick.bind(this);

        document.addEventListener('kitingkeys:searchBindings', this._onSearch);
        document.addEventListener('kitingkeys:filterBindings', this._onFilter);
        // WHY: Dismiss context menu on any click outside it
        document.addEventListener('click', this._onDocClick);
    }

    // ---- Public API ----

    render() {
        this._container.innerHTML = '';

        var table = document.createElement('table');
        table.id = 'keybindings-table';

        // Header
        var thead = document.createElement('thead');
        thead.innerHTML =
            '<tr>' +
            '<th>Command</th>' +
            '<th>Keybinding</th>' +
            '<th>Mode</th>' +
            '<th>Source</th>' +
            '<th>Conflict</th>' +
            '<th></th>' +
            '</tr>';
        table.appendChild(thead);

        // Body
        var tbody = document.createElement('tbody');
        var bindings = this._registry.getAllBindings();

        for (var i = 0; i < bindings.length; i++) {
            tbody.appendChild(this._buildRow(bindings[i]));
        }

        table.appendChild(tbody);
        this._container.appendChild(table);
        this._tbody = tbody;

        // Apply any existing filter/search
        this._applyVisibility();
    }

    refresh() {
        this._closeWidget();
        this._dismissMenu();
        this.render();
    }

    /**
     * Mark rows with pending (unsaved) changes.
     * @param {Set<string>} pendingIds - set of binding ids with pending changes
     */
    markPending(pendingIds) {
        if (!this._tbody) return;
        var rows = this._tbody.children;
        for (var i = 0; i < rows.length; i++) {
            var id = rows[i].dataset.bindingId;
            rows[i].classList.toggle('pending-change', pendingIds.has(id));
        }
    }

    search(query, mode, modifiers) {
        this._searchQuery = (query || '').toLowerCase();
        this._searchMode = mode || 'command';
        this._searchModifiers = modifiers || [];  // active modifier names for key mode
        this._applyVisibility();
    }

    filter(type) {
        this._filterType = type || 'all';
        this._applyVisibility();
    }

    // ---- Row building ----

    _buildRow(entry) {
        var tr = document.createElement('tr');
        tr.dataset.bindingId = entry.id;
        tr.dataset.source = entry.source;
        tr.className = 'source-' + entry.source;

        // Command
        var tdCommand = document.createElement('td');
        tdCommand.className = 'col-command';
        tdCommand.textContent = entry.command;
        tr.appendChild(tdCommand);

        // Keybinding — supports multiple keys per command
        var tdKey = document.createElement('td');
        tdKey.className = 'col-key';
        var keysArr = Array.isArray(entry.keys) ? entry.keys : (entry.keys ? [entry.keys] : []);
        var isEditable = entry.source !== 'browser';

        for (var ki = 0; ki < keysArr.length; ki++) {
            if (!keysArr[ki]) continue;
            var keyRow = document.createElement('div');
            keyRow.className = 'key-slot';
            keyRow.dataset.keyIndex = ki;

            var kbd = document.createElement('kbd');
            kbd.textContent = keysArr[ki];
            keyRow.appendChild(kbd);

            if (isEditable && keysArr.length > 1) {
                // WHY: Show remove button only when there are multiple bindings
                var removeBtn = document.createElement('button');
                removeBtn.className = 'key-slot-remove';
                removeBtn.textContent = '\u00D7'; // ×
                removeBtn.title = 'Remove this binding';
                removeBtn.type = 'button';
                removeBtn.addEventListener('click', this._onRemoveKey.bind(this, entry.id, ki));
                keyRow.appendChild(removeBtn);
            }

            if (isEditable) {
                kbd.addEventListener('click', this._onKeyClick.bind(this, entry.id, tdKey, ki));
            }
            tdKey.appendChild(keyRow);
        }

        // "+" button to add another binding
        if (isEditable) {
            var addBtn = document.createElement('button');
            addBtn.className = 'key-slot-add';
            addBtn.textContent = '+';
            addBtn.title = 'Add another keybinding';
            addBtn.type = 'button';
            addBtn.addEventListener('click', this._onAddKey.bind(this, entry.id, tdKey));
            tdKey.appendChild(addBtn);
        }

        tr.appendChild(tdKey);

        // Mode
        var tdMode = document.createElement('td');
        tdMode.className = 'col-mode';
        tdMode.textContent = MODE_LABELS[entry.mode] || entry.mode;
        tr.appendChild(tdMode);

        // Source badge
        var tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        var badge = document.createElement('span');
        if (entry.source === 'browser') {
            badge.className = 'badge-locked';
            badge.textContent = '\uD83D\uDD12 browser';
        } else if (entry.source === 'user') {
            badge.className = 'badge-source-user';
            badge.textContent = 'user';
        } else {
            badge.className = 'badge-source-default';
            badge.textContent = 'default';
        }
        tdSource.appendChild(badge);
        tr.appendChild(tdSource);

        // Conflict
        var tdConflict = document.createElement('td');
        tdConflict.className = 'col-conflict';
        var conflict = describeConflict(entry);
        if (conflict) {
            tdConflict.textContent = conflict.label;
            tdConflict.title = conflict.tooltip;
        }
        tr.appendChild(tdConflict);

        // Actions
        var tdActions = document.createElement('td');
        tdActions.className = 'col-actions';
        if (entry.source !== 'browser') {
            var btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.title = 'Actions';
            btn.type = 'button';
            btn.textContent = '\u22EE';  // ⋮
            btn.addEventListener('click', this._onActionsClick.bind(this, entry.id, btn));
            tdActions.appendChild(btn);
        }
        tr.appendChild(tdActions);

        return tr;
    }

    // ---- Visibility (search + filter) ----

    _applyVisibility() {
        if (!this._tbody) return;

        var rows = this._tbody.children;
        for (var i = 0; i < rows.length; i++) {
            var tr = rows[i];
            var id = tr.dataset.bindingId;
            var source = tr.dataset.source;

            // Filter check
            var passesFilter = true;
            switch (this._filterType) {
                case 'extension':
                    passesFilter = (source === 'default' || source === 'user');
                    break;
                case 'browser':
                    passesFilter = (source === 'browser');
                    break;
                case 'conflicts':
                    passesFilter = tr.querySelector('.col-conflict').textContent.trim() !== '';
                    break;
                case 'modified':
                    passesFilter = (source === 'user');
                    break;
                // 'all' passes everything
            }

            // Search check
            var passesSearch = true;
            if (this._searchQuery) {
                if (this._searchMode === 'key') {
                    // WHY: Use parseKeyBinding for structured token comparison
                    // instead of fragile string splitting. Each kbd element is
                    // parsed independently; row matches if ANY slot matches.
                    var kbdEls = tr.querySelectorAll('.col-key kbd');
                    var qKey = this._searchQuery.toLowerCase();
                    var qMods = this._searchModifiers.map(function(m) { return m.toLowerCase(); });
                    // WHY: strict=false when no modifiers held — pressing 't' shows ALL
                    // bindings with 't' as the literal key: t, Ctrl-t, Alt-t, etc.
                    // strict=true only when modifiers ARE held — Ctrl+t shows only Ctrl-t,
                    // not plain t or Alt-t.
                    var strict = false;
                    var anySlotMatches = false;

                    for (var ki = 0; ki < kbdEls.length; ki++) {
                        var parsed = parseKeyBinding(kbdEls[ki].textContent);
                        if (bindingMatchesSearch(parsed, qKey, qMods, strict)) {
                            anySlotMatches = true;
                            break;
                        }
                    }

                    // Empty rows match when search is empty
                    if (kbdEls.length === 0 && !qKey && qMods.length === 0) {
                        anySlotMatches = true;
                    }

                    passesSearch = anySlotMatches;
                } else {
                    // Command search: match against command name, key, mode
                    var searchText = (
                        tr.querySelector('.col-command').textContent + ' ' +
                        tr.querySelector('.col-key').textContent + ' ' +
                        tr.querySelector('.col-mode').textContent
                    ).toLowerCase();
                    passesSearch = searchText.indexOf(this._searchQuery) !== -1;
                }
            }

            tr.style.display = (passesFilter && passesSearch) ? '' : 'none';
        }
    }

    // ---- Inline editing (F005) ----

    _onKeyClick(entryId, cell, keyIndex) {
        // WHY: If already editing this cell, do nothing
        if (this._activeWidgetEntryId === entryId) return;

        // Close any existing widget first
        this._closeWidget();

        var entry = this._findEntry(entryId);
        if (!entry) return;

        var editIndex = keyIndex || 0;
        var keysArr = Array.isArray(entry.keys) ? entry.keys : (entry.keys ? [entry.keys] : []);
        var currentValue = keysArr[editIndex] || '';

        this._activeWidgetEntryId = entryId;
        this._activeWidgetCell = cell;

        // WHY: Add editing class so CSS can show the accent border
        cell.classList.add('editing');

        var self = this;
        var widget = new KeyInputWidget({
            initialValue: currentValue,
            commandName: entry.command || 'Edit keybinding',
            registry: this._registry,
            onConfirm: function(newKeys) {
                // WHY: Validate against registry before accepting. If the key is
                // bound to a locked browser shortcut, show a red error and keep
                // the widget open so the user knows it was captured correctly
                // but cannot be assigned.
                if (newKeys) {
                    var decoded = KeyboardUtils.decodeKeystroke(newKeys);
                    var conflict = self._registry.checkConflict(decoded, entryId);

                    if (conflict && conflict.type === 'locked') {
                        // Hard block — show error, don't accept
                        widget.showFeedback(
                            '\uD83D\uDD12 browser — ' + conflict.entry.command,
                            'error'
                        );
                        return; // keep widget open
                    }

                    if (conflict && conflict.type === 'browser_overridable') {
                        // Overridable browser key — show info, allow it
                        widget.showFeedback(
                            '\u2194 browser — overrides ' + conflict.entry.command,
                            'info'
                        );
                        // Brief pause so user sees the message, then accept
                        setTimeout(function() {
                            self._registry.updateBinding(entryId, newKeys, editIndex);
                            self._closeWidget();
                            self._refreshRow(entryId);
                            document.dispatchEvent(new CustomEvent('kitingkeys:bindingChanged', {
                                detail: { id: entryId, newKeys: newKeys }
                            }));
                        }, 1200);
                        return;
                    }

                    if (conflict && conflict.type === 'extension') {
                        // Extension conflict — warn but allow
                        widget.showFeedback(
                            '\u26A0 conflicts with ' + conflict.entry.command,
                            'warning'
                        );
                        setTimeout(function() {
                            self._registry.updateBinding(entryId, newKeys, editIndex);
                            self._closeWidget();
                            self._refreshRow(entryId);
                            document.dispatchEvent(new CustomEvent('kitingkeys:bindingChanged', {
                                detail: { id: entryId, newKeys: newKeys }
                            }));
                        }, 1500);
                        return;
                    }
                }

                // No conflict — accept immediately
                self._registry.updateBinding(entryId, newKeys, editIndex);
                self._closeWidget();
                self._refreshRow(entryId);
                document.dispatchEvent(new CustomEvent('kitingkeys:bindingChanged', {
                    detail: { id: entryId, newKeys: newKeys }
                }));
            },
            onCancel: function() {
                self._closeWidget();
            },
        });

        widget.mount(cell);
        this._activeWidget = widget;
    }

    _onRemoveKey(entryId, keyIndex, e) {
        e.stopPropagation(); // don't trigger cell click
        this._registry.removeKey(entryId, keyIndex);
        this._refreshRow(entryId);
        document.dispatchEvent(new CustomEvent('kitingkeys:bindingChanged', {
            detail: { id: entryId, newKeys: '' }
        }));
    }

    _onAddKey(entryId, cell, e) {
        e.stopPropagation();
        // Open the key input widget to capture a new key for this command.
        // Use index = current keys length (appending a new slot).
        var entry = this._findEntry(entryId);
        if (!entry) return;
        var keysArr = Array.isArray(entry.keys) ? entry.keys : (entry.keys ? [entry.keys] : []);
        // Temporarily add an empty slot, then open editor at that index
        var newIndex = keysArr.length;
        this._onKeyClick(entryId, cell, newIndex);
    }

    _closeWidget() {
        if (this._activeWidget) {
            this._activeWidget.unmount();
            this._activeWidget = null;
        }
        if (this._activeWidgetCell) {
            this._activeWidgetCell.classList.remove('editing');
            this._activeWidgetCell = null;
        }
        this._activeWidgetEntryId = null;
    }

    /**
     * Re-render a single row after its binding changed, preserving position.
     */
    _refreshRow(entryId) {
        if (!this._tbody) return;

        var entry = this._findEntry(entryId);
        if (!entry) return;

        var rows = this._tbody.children;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].dataset.bindingId === entryId) {
                var newRow = this._buildRow(entry);
                this._tbody.replaceChild(newRow, rows[i]);
                break;
            }
        }

        // WHY: Conflicts may have changed on other rows too — re-render them.
        // A full refresh is simpler and the table is small enough to afford it.
        this._refreshConflictCells();
        this._applyVisibility();
    }

    /**
     * Update just the conflict cells for all rows without full re-render.
     */
    _refreshConflictCells() {
        if (!this._tbody) return;
        var bindings = this._registry.getAllBindings();
        var byId = {};
        for (var i = 0; i < bindings.length; i++) {
            byId[bindings[i].id] = bindings[i];
        }

        var rows = this._tbody.children;
        for (var j = 0; j < rows.length; j++) {
            var id = rows[j].dataset.bindingId;
            var entry = byId[id];
            if (!entry) continue;

            var cell = rows[j].querySelector('.col-conflict');
            var conflict = describeConflict(entry);
            cell.textContent = conflict ? conflict.label : '';
            cell.title = conflict ? conflict.tooltip : '';
        }
    }

    // ---- Context menu (F006) ----

    _onActionsClick(entryId, btn, e) {
        e.stopPropagation();
        this._dismissMenu();

        var entry = this._findEntry(entryId);
        if (!entry) return;

        var menu = document.createElement('div');
        menu.className = 'kb-context-menu';

        // "Reset to default" — only if user-modified
        if (entry.source === 'user') {
            var resetItem = this._menuItem('Reset to default', function() {
                this._registry.resetBinding(entryId);
                this._dismissMenu();
                this._refreshRow(entryId);
                // WHY: notify options.js so it can track this as a pending change
                document.dispatchEvent(new CustomEvent('kitingkeys:bindingChanged', {
                    detail: { id: entryId, newKeys: this._findEntry(entryId)?.keys || '' }
                }));
            }.bind(this));
            menu.appendChild(resetItem);
        }

        // "Remove keybinding"
        var removeItem = this._menuItem('Remove keybinding', function() {
            this._registry.removeBinding(entryId);
            this._dismissMenu();
            this._refreshRow(entryId);
            // WHY: notify options.js so it can track this as a pending change
            document.dispatchEvent(new CustomEvent('kitingkeys:bindingChanged', {
                detail: { id: entryId, newKeys: '' }
            }));
        }.bind(this));
        menu.appendChild(removeItem);

        // "Copy as JS"
        var copyItem = this._menuItem('Copy as JS', function() {
            var text = copyAsJs(entry);
            // WHY: navigator.clipboard may not be available in extension pages
            // without secure context — fall back to execCommand.
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
            } else {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            this._dismissMenu();
        }.bind(this));
        menu.appendChild(copyItem);

        // Position below the ⋮ button
        var rect = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = rect.bottom + 2 + 'px';
        menu.style.left = rect.left + 'px';

        document.body.appendChild(menu);
        this._activeMenu = menu;
    }

    _menuItem(label, onClick) {
        var item = document.createElement('div');
        item.className = 'kb-context-menu-item';
        item.textContent = label;
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            onClick();
        });
        return item;
    }

    _dismissMenu() {
        if (this._activeMenu) {
            this._activeMenu.remove();
            this._activeMenu = null;
        }
    }

    // ---- Event handlers ----

    _onSearch(e) {
        var detail = e.detail || {};
        this.search(detail.query || '', detail.mode || 'command', detail.modifiers || []);
    }

    _onFilter(e) {
        this.filter(e.detail ? e.detail.filter : 'all');
    }

    _onDocClick(e) {
        // Dismiss context menu if click is outside it
        if (this._activeMenu && !this._activeMenu.contains(e.target)) {
            this._dismissMenu();
        }
    }

    // ---- Helpers ----

    _findEntry(entryId) {
        var all = this._registry.getAllBindings();
        for (var i = 0; i < all.length; i++) {
            if (all[i].id === entryId) return all[i];
        }
        return null;
    }
}

export { KeybindingsTable };
