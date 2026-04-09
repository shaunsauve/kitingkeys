import KeyboardUtils from "../content_scripts/common/keyboardUtils.js";

// WHY: Subset of KeyboardUtils.specialKeys that are useful for manual composition.
// The full list includes obscure keys (ScrollLock, PrintScreen, etc.) that clutter the UI.
const COMPOSE_SPECIAL_KEYS = [
    "Esc", "Space", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9",
    "F10", "F11", "F12", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Backspace", "Enter", "Tab", "Delete", "End", "Home", "PageDown", "PageUp",
];

const MODIFIERS = ["Ctrl", "Alt", "Shift", "Meta"];

/**
 * Dual-mode key input widget supporting live keystroke capture and manual composition.
 * Both modes produce the same output format compatible with KeyboardUtils.encodeKeystroke().
 */
class KeyInputWidget {
    constructor(options = {}) {
        this._onConfirm = options.onConfirm || (() => {});
        this._onCancel = options.onCancel || (() => {});
        this._initialValue = options.initialValue || "";
        this._commandName = options.commandName || "Edit keybinding";
        this._registry = options.registry || null;
        this._mode = "capture";
        this._container = null;
        this._targetEl = null;
        this._savedContent = null;

        // Capture mode state
        this._modifiersHeldOnBlur = false;  // tracks if Ctrl/Cmd was held when focus was lost
        this._feedbackEl = null;
        this._capturedKeys = [];       // array of encoded key strings
        this._currentChord = "";       // chord being built (held modifiers + key)
        this._sequenceTimer = null;
        this._heldModifiers = { ctrl: false, alt: false, shift: false, meta: false };

        // Compose mode state
        this._composeModifiers = { Ctrl: false, Alt: false, Shift: false, Meta: false };
        this._composeChar = "";
        this._composeSpecial = "";
    }

    mount(targetElement) {
        this._targetEl = targetElement;

        // WHY: Render as a centered dialog overlay rather than inline in the
        // table cell. The cell is too narrow for compose mode's modifier
        // toggles and special key dropdown. A dialog gives room to breathe
        // and is the standard pattern (VSCode does the same).
        this._overlay = _createElement("div", "kiw-overlay");
        this._dialog = _createElement("div", "kiw-dialog");

        // Dialog header showing which command is being edited
        var header = _createElement("div", "kiw-dialog-header");
        header.textContent = this._commandName || "Edit keybinding";
        this._dialog.appendChild(header);

        this._container = _createElement("div", "kiw-container");
        this._dialog.appendChild(this._container);

        this._overlay.appendChild(this._dialog);
        document.body.appendChild(this._overlay);

        // WHY: Click on overlay backdrop (outside dialog) cancels, matching
        // standard modal behavior.
        this._overlay.addEventListener("click", (e) => {
            if (e.target === this._overlay) this._cancel();
        });

        this._render();
    }

    unmount() {
        if (this._sequenceTimer) {
            clearTimeout(this._sequenceTimer);
        }
        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._dialog = null;
        this._container = null;
        this._targetEl = null;
    }

    /**
     * Show inline feedback (error or warning) below the widget.
     * @param {string} message - text to display
     * @param {"error"|"warning"|"info"} type - controls color
     */
    showFeedback(message, type) {
        this.clearFeedback();
        if (!this._container) return;
        var el = _createElement("div", "kiw-feedback kiw-feedback-" + (type || "info"));
        el.textContent = message;
        this._container.appendChild(el);
        this._feedbackEl = el;
    }

    clearFeedback() {
        if (this._feedbackEl && this._feedbackEl.parentNode) {
            this._feedbackEl.parentNode.removeChild(this._feedbackEl);
        }
        this._feedbackEl = null;
    }

    /**
     * Show a three-column overlay of all bindings matching the currently held
     * modifiers. Updates live as modifiers are pressed/released.
     *
     * Left column:  user-assigned bindings (source=user)
     * Center column: default extension bindings (source=default)
     * Right column:  browser-locked bindings (source=browser, overridable=false)
     *                rendered on a red-tinted background
     *
     * Each row shows the key combo with the held modifier(s) bolded.
     */
    _showModifierOverlay() {
        this._hideModifierOverlay();
        if (!this._registry || !this._dialog) return;

        // Build the modifier prefix string from currently held keys
        var mods = [];
        if (this._heldModifiers.ctrl) mods.push('Ctrl');
        if (this._heldModifiers.alt) mods.push('Alt');
        if (this._heldModifiers.shift) mods.push('Shift');
        if (this._heldModifiers.meta) mods.push('Meta');
        if (mods.length === 0) return;

        var modPrefix = mods.join('-').toLowerCase();

        // Collect matching bindings into three buckets
        var userBindings = [];
        var defaultBindings = [];
        var lockedBindings = [];

        var all = this._registry.getAllBindings();
        for (var i = 0; i < all.length; i++) {
            var entry = all[i];
            if (!entry.keys) continue;
            var keyLower = entry.keys.toLowerCase().replace(/[<>]/g, '');

            // Check if the key contains ALL held modifiers
            var matchesAll = true;
            for (var m = 0; m < mods.length; m++) {
                if (keyLower.indexOf(mods[m].toLowerCase()) === -1) {
                    matchesAll = false;
                    break;
                }
            }
            if (!matchesAll) continue;

            var item = { keys: entry.keys, command: entry.command };
            if (entry.source === 'browser' && !entry.overridable) {
                lockedBindings.push(item);
            } else if (entry.source === 'user') {
                userBindings.push(item);
            } else if (entry.source === 'default') {
                defaultBindings.push(item);
            }
            // browser+overridable goes into default column
            else if (entry.source === 'browser' && entry.overridable) {
                defaultBindings.push(item);
            }
        }

        // Build the overlay element
        var overlay = _createElement('div', 'kiw-mod-overlay');

        // Header showing held modifiers
        var header = _createElement('div', 'kiw-mod-overlay-header');
        header.innerHTML = mods.map(function(m) { return '<b>' + m + '</b>'; }).join(' + ') + ' held — showing matching bindings';
        overlay.appendChild(header);

        var columns = _createElement('div', 'kiw-mod-overlay-columns');

        // Left: user assigned
        columns.appendChild(this._buildOverlayColumn('User', userBindings, 'kiw-col-user', mods));
        // Center: defaults
        columns.appendChild(this._buildOverlayColumn('Defaults', defaultBindings, 'kiw-col-default', mods));
        // Right: browser locked
        columns.appendChild(this._buildOverlayColumn('Browser Locked', lockedBindings, 'kiw-col-locked', mods));

        overlay.appendChild(columns);
        this._dialog.appendChild(overlay);
        this._modOverlay = overlay;
    }

    _buildOverlayColumn(title, items, className, heldMods) {
        var col = _createElement('div', 'kiw-mod-col ' + className);
        var h = _createElement('div', 'kiw-mod-col-title');
        h.textContent = title + ' (' + items.length + ')';
        col.appendChild(h);

        if (items.length === 0) {
            var empty = _createElement('div', 'kiw-mod-col-empty');
            empty.textContent = '(none)';
            col.appendChild(empty);
        } else {
            for (var i = 0; i < items.length; i++) {
                var row = _createElement('div', 'kiw-mod-col-row');
                // Bold the held modifier names in the key display
                var keyHtml = items[i].keys;
                for (var m = 0; m < heldMods.length; m++) {
                    keyHtml = keyHtml.replace(
                        new RegExp('(' + heldMods[m] + ')', 'gi'),
                        '<b>$1</b>'
                    );
                }
                row.innerHTML = '<span class="kiw-mod-key">' + keyHtml + '</span> ' +
                    '<span class="kiw-mod-cmd">' + items[i].command + '</span>';
                col.appendChild(row);
            }
        }
        return col;
    }

    _hideModifierOverlay() {
        if (this._modOverlay && this._modOverlay.parentNode) {
            this._modOverlay.parentNode.removeChild(this._modOverlay);
        }
        this._modOverlay = null;
    }

    getMode() {
        return this._mode;
    }

    setMode(mode) {
        if (mode !== "capture" && mode !== "compose") return;
        this._mode = mode;
        this._resetCaptureState();
        this._resetComposeState();
        this._render();
    }

    // --- Internal rendering ---

    _render() {
        if (!this._container) return;
        this._container.innerHTML = "";

        this._container.appendChild(this._buildModeToggle());

        if (this._mode === "capture") {
            this._container.appendChild(this._buildCaptureUI());
            this._container.appendChild(this._buildHint("Enter=confirm  Esc=cancel  Backspace=clear"));
        } else {
            this._container.appendChild(this._buildComposeUI());
            this._container.appendChild(this._buildResultPreview());
            this._container.appendChild(this._buildHint("Enter=confirm  Esc=cancel"));
        }
    }

    _buildModeToggle() {
        const row = _createElement("div", "kiw-mode-toggle");

        const captureBtn = _createElement("button", "kiw-mode-btn");
        captureBtn.textContent = "Capture";
        captureBtn.type = "button";
        if (this._mode === "capture") captureBtn.classList.add("active");
        captureBtn.addEventListener("click", () => this.setMode("capture"));

        const composeBtn = _createElement("button", "kiw-mode-btn");
        composeBtn.textContent = "Compose";
        composeBtn.type = "button";
        if (this._mode === "compose") composeBtn.classList.add("active");
        composeBtn.addEventListener("click", () => this.setMode("compose"));

        row.appendChild(captureBtn);
        row.appendChild(composeBtn);
        return row;
    }

    _buildCaptureUI() {
        const area = _createElement("div", "kiw-capture-area");
        area.tabIndex = 0; // WHY: make div focusable so it receives keyboard events

        this._updateCaptureDisplay(area);

        area.addEventListener("keydown", (e) => this._handleCaptureKeydown(e));
        area.addEventListener("keyup", (e) => this._handleCaptureKeyup(e));

        // WHY: When the user holds Ctrl/Cmd and presses a locked browser key (Ctrl+T,
        // Ctrl+W, etc.), the browser processes it BEFORE the keydown event reaches
        // this handler — the event never fires. Instead, the browser action (new tab,
        // close tab) steals focus. We detect this by listening for blur/visibility
        // changes while modifiers are held, then show the locked-key error when the
        // user returns.
        area.addEventListener("blur", () => {
            if (this._heldModifiers.ctrl || this._heldModifiers.meta) {
                this._modifiersHeldOnBlur = true;
            }
        });

        area.addEventListener("focus", () => {
            if (this._modifiersHeldOnBlur) {
                this._modifiersHeldOnBlur = false;
                // Reset held modifiers since keys were released during focus loss
                this._heldModifiers = { ctrl: false, alt: false, shift: false, meta: false };
                this.showFeedback(
                    '\uD83D\uDD12 browser — intercepted (try Compose mode)',
                    'error'
                );
                this._updateCaptureDisplay();
            }
        });

        // WHY: auto-focus after mount so user can immediately start typing
        requestAnimationFrame(() => area.focus());

        this._captureArea = area;
        return area;
    }

    _buildComposeUI() {
        const compose = _createElement("div", "kiw-compose");

        // Modifier toggle pills
        const modRow = _createElement("div", "kiw-modifiers");
        for (const mod of MODIFIERS) {
            const btn = _createElement("button", "kiw-mod-btn");
            btn.textContent = mod;
            btn.type = "button";
            if (this._composeModifiers[mod]) btn.classList.add("active");
            btn.addEventListener("click", () => {
                this._composeModifiers[mod] = !this._composeModifiers[mod];
                btn.classList.toggle("active");
                this._updateComposeResult();
            });
            modRow.appendChild(btn);
        }
        compose.appendChild(modRow);

        // Key character input + special key dropdown
        const keyRow = _createElement("div", "kiw-key-row");

        const charInput = _createElement("input", "kiw-key-input");
        charInput.type = "text";
        charInput.maxLength = 1;
        charInput.placeholder = "key";
        charInput.value = this._composeChar;
        charInput.disabled = this._composeSpecial !== "";

        const orLabel = _createElement("span", "kiw-or-label");
        orLabel.textContent = "or";

        const specialSelect = _createElement("select", "kiw-special-select");
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "Special key...";
        specialSelect.appendChild(defaultOpt);
        for (const key of COMPOSE_SPECIAL_KEYS) {
            const opt = document.createElement("option");
            opt.value = key;
            opt.textContent = key;
            if (key === this._composeSpecial) opt.selected = true;
            specialSelect.appendChild(opt);
        }
        specialSelect.disabled = this._composeChar !== "";

        // WHY: Mutual exclusion — typing a char disables the dropdown and vice versa.
        charInput.addEventListener("input", () => {
            this._composeChar = charInput.value;
            if (this._composeChar) {
                specialSelect.value = "";
                specialSelect.disabled = true;
                this._composeSpecial = "";
            } else {
                specialSelect.disabled = false;
            }
            this._updateComposeResult();
        });

        specialSelect.addEventListener("change", () => {
            this._composeSpecial = specialSelect.value;
            if (this._composeSpecial) {
                charInput.value = "";
                charInput.disabled = true;
                this._composeChar = "";
            } else {
                charInput.disabled = false;
            }
            this._updateComposeResult();
        });

        // Global keydown handler for Enter/Esc in compose mode
        const composeKeyHandler = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this._confirmCompose();
            } else if (e.key === "Escape") {
                e.preventDefault();
                this._cancel();
            }
        };
        charInput.addEventListener("keydown", composeKeyHandler);
        specialSelect.addEventListener("keydown", composeKeyHandler);

        keyRow.appendChild(charInput);
        keyRow.appendChild(orLabel);
        keyRow.appendChild(specialSelect);
        compose.appendChild(keyRow);

        // WHY: auto-focus the char input so user can start composing immediately
        requestAnimationFrame(() => charInput.focus());

        this._composeCharInput = charInput;
        this._composeSpecialSelect = specialSelect;
        return compose;
    }

    _buildResultPreview() {
        const row = _createElement("div", "kiw-result");
        const label = _createElement("span", "kiw-result-label");
        label.textContent = "Result:";
        this._resultValue = _createElement("span", "kiw-result-value");
        this._resultValue.textContent = this._getComposeResult() || "(none)";
        row.appendChild(label);
        row.appendChild(this._resultValue);
        return row;
    }

    _buildHint(text) {
        const hint = _createElement("div", "kiw-hint");
        hint.textContent = text;
        return hint;
    }

    // --- Capture mode logic ---

    _handleCaptureKeydown(e) {
        e.preventDefault();
        e.stopPropagation();

        // Track held modifiers and show preemptive warning for Ctrl/Cmd
        if (e.key === "Control" || e.key === "Meta") {
            if (e.key === "Control") this._heldModifiers.ctrl = true;
            if (e.key === "Meta") this._heldModifiers.meta = true;
            this._updateCaptureDisplay();
            this._showModifierOverlay();
            return;
        }
        if (e.key === "Alt")     { this._heldModifiers.alt = true;  this._updateCaptureDisplay(); this._showModifierOverlay(); return; }
        if (e.key === "Shift")   { this._heldModifiers.shift = true; this._updateCaptureDisplay(); this._showModifierOverlay(); return; }

        // Control keys
        if (e.key === "Enter" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            this._confirmCapture();
            return;
        }
        if (e.key === "Escape") {
            this._cancel();
            return;
        }
        if (e.key === "Backspace" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            this._resetCaptureState();
            this._updateCaptureDisplay();
            return;
        }

        // WHY: Use KeyboardUtils.getKeyChar to encode the keystroke the same way
        // the rest of the extension does, ensuring format consistency.
        const encoded = KeyboardUtils.getKeyChar(e);
        if (!encoded) return;

        // Key successfully captured — clear modifier overlay and feedback
        this._hideModifierOverlay();
        this.clearFeedback();

        // Clear the sequence timer — user is still typing
        if (this._sequenceTimer) {
            clearTimeout(this._sequenceTimer);
            this._sequenceTimer = null;
        }

        this._capturedKeys.push(encoded);
        this._currentChord = "";
        this._updateCaptureDisplay();

        // WHY: 500ms timeout for multi-key sequences (e.g., "gg", ";e").
        // If no key arrives within the window, we treat the sequence as complete,
        // but we don't auto-confirm — user still needs Enter.
        this._sequenceTimer = setTimeout(() => {
            this._sequenceTimer = null;
        }, 500);
    }

    _handleCaptureKeyup(e) {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === "Control") this._heldModifiers.ctrl = false;
        if (e.key === "Alt")     this._heldModifiers.alt = false;
        if (e.key === "Shift")   this._heldModifiers.shift = false;
        if (e.key === "Meta")    this._heldModifiers.meta = false;
        this._updateCaptureDisplay();

        // WHY: Update or hide the modifier overlay as modifiers are released.
        if (this._hasHeldModifiers()) {
            this._showModifierOverlay();
        } else {
            this._hideModifierOverlay();
        }
    }

    _updateCaptureDisplay(area) {
        const el = area || this._captureArea;
        if (!el) return;

        if (this._capturedKeys.length === 0 && !this._hasHeldModifiers()) {
            el.textContent = "Press keys...";
            el.classList.add("listening");
            return;
        }

        el.classList.remove("listening");

        // Show captured keys decoded + any currently held modifiers
        let display = this._capturedKeys.map(k => KeyboardUtils.decodeKeystroke(k)).join("");
        if (this._hasHeldModifiers()) {
            const mods = this._getHeldModifierPrefix();
            display += mods;
        }
        el.textContent = display || "Press keys...";
    }

    _hasHeldModifiers() {
        return this._heldModifiers.ctrl || this._heldModifiers.alt ||
               this._heldModifiers.shift || this._heldModifiers.meta;
    }

    _getHeldModifierPrefix() {
        let prefix = "";
        if (this._heldModifiers.ctrl)  prefix += "Ctrl+";
        if (this._heldModifiers.alt)   prefix += "Alt+";
        if (this._heldModifiers.shift) prefix += "Shift+";
        if (this._heldModifiers.meta)  prefix += "Meta+";
        return prefix;
    }

    _resetCaptureState() {
        this._capturedKeys = [];
        this._currentChord = "";
        this._heldModifiers = { ctrl: false, alt: false, shift: false, meta: false };
        if (this._sequenceTimer) {
            clearTimeout(this._sequenceTimer);
            this._sequenceTimer = null;
        }
    }

    _confirmCapture() {
        if (this._capturedKeys.length === 0) {
            // Confirming empty = clear the binding
            this._onConfirm("");
        } else {
            const encoded = this._capturedKeys.join("");
            this._onConfirm(encoded);
        }
    }

    // --- Compose mode logic ---

    _getComposeResult() {
        const keyPart = this._composeSpecial || this._composeChar;
        if (!keyPart) return "";

        const hasModifier = MODIFIERS.some(m => this._composeModifiers[m]);
        const isSpecial = this._composeSpecial !== "";

        // WHY: Only wrap in angle brackets when there are modifiers or the key name
        // is multi-character (special keys). Single plain chars stay unwrapped.
        if (!hasModifier && !isSpecial) {
            return keyPart;
        }

        let result = "";
        if (this._composeModifiers.Ctrl)  result += "Ctrl-";
        if (this._composeModifiers.Alt)   result += "Alt-";
        if (this._composeModifiers.Meta)  result += "Meta-";
        if (this._composeModifiers.Shift) result += "Shift-";
        result += keyPart;

        return "<" + result + ">";
    }

    _updateComposeResult() {
        if (this._resultValue) {
            const result = this._getComposeResult();
            this._resultValue.textContent = result || "(none)";
        }
    }

    _resetComposeState() {
        this._composeModifiers = { Ctrl: false, Alt: false, Shift: false, Meta: false };
        this._composeChar = "";
        this._composeSpecial = "";
    }

    _confirmCompose() {
        const decoded = this._getComposeResult();
        if (!decoded) {
            this._onConfirm("");
            return;
        }
        const encoded = KeyboardUtils.encodeKeystroke(decoded);
        this._onConfirm(encoded);
    }

    // --- Shared ---

    _cancel() {
        this._onCancel();
    }
}

function _createElement(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
}

export { KeyInputWidget };
