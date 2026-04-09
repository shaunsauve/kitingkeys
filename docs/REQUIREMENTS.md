# Requirements

## Functional Requirements

### Settings UI — Keyboard Shortcuts Editor

**F001** — Unified keybinding table
- Display ALL keybindings in a single searchable, filterable table
- Columns: Command, Keybinding, Mode, Source, Conflict
- Sources: `default` (built-in), `user` (customized), `browser` (Chrome/Brave native)
- Browser bindings shown inline as reference rows (greyed, not editable)
- Acceptance: All ~100 extension bindings + ~60 browser bindings visible in one view
- Priority: P1

**F002** — Search and filter
- Text search filters by command name, key sequence, or category
- Filter chips: All / Extension only / Browser only / Conflicts only / User modified
- Acceptance: Typing "scroll" shows all scroll-related bindings from all sources
- Priority: P1

**F003** — Dual-mode key input (capture + manual compose)
- **Capture mode**: Click keybinding cell → listen for keystrokes → record exact combo pressed → Enter to confirm, Esc to cancel
- **Manual compose mode**: Toggle buttons for Ctrl/Alt/Shift/Meta + text input for the character/key name. Allows constructing combos that are hard to physically type (e.g., Hyper+F13, or combos that the OS intercepts before they reach the browser)
- Toggle between modes via a switch/button in the key editor
- Both modes produce the same internal key representation
- Acceptance: User can bind `<Ctrl-Alt-Shift-/>` via either pressing it or toggling Ctrl+Alt+Shift and typing `/`
- Priority: P1

**F004** — Conflict detection
- `⚠` when two extension commands share the same key
- `🔒` for non-overridable browser shortcuts (Ctrl+T, Ctrl+W, etc.)
- `↔` when an extension binding shadows an overridable browser key (Space, F5, etc.)
- Show conflict details on hover/click
- Warn on save if user binds a key that conflicts
- Acceptance: Binding `x` shows `↔ Close tab (Ctrl+W)` is not conflicted, but binding `<Ctrl-t>` shows `🔒 browser: Open new tab`
- Priority: P1

**F005** — Inline editing
- Click a keybinding cell to enter edit mode (no modal popup)
- The cell transforms into the key input widget (F003)
- Enter confirms, Esc cancels, Backspace clears (unbinds)
- Changes persist to chrome.storage immediately
- Acceptance: Click `j` → press `J` → cell now shows `J`, scroll-down is rebound
- Priority: P1

**F006** — Context actions per binding
- Right-click or action button: "Reset to default", "Remove keybinding", "Copy as JS"
- "Copy as JS" outputs `api.mapkey(...)` or `api.unmap(...)` for the Ace editor
- Acceptance: Right-click a user-modified binding → "Reset to default" restores original
- Priority: P2

**F007** — Preset system
- Dropdown in header: KitingKeys Defaults, Vimium Style, Minimal (unmap all)
- Confirmation dialog before applying
- Import/Export as JSON
- Acceptance: Select "Vimium Style" → all bindings update to Vimium layout, table reflects changes immediately
- Priority: P1

**F008** — Sidebar navigation
- Left sidebar with tabs: Keybindings, Advanced JS, Proxy, About
- Keybindings is the default/landing tab
- Advanced JS preserves the Ace editor for power users
- About includes attribution to Surfingkeys/brookhong
- Acceptance: All existing settings functionality accessible, no feature loss
- Priority: P1

**F009** — Binding registry
- Single data structure merging default bindings, user overrides, and browser defaults
- Built on page load from: default.js mappings + browserDefaults.js + chrome.storage user overrides
- Exposes: getAllBindings(), getConflicts(), applyPreset(), resetBinding(), updateBinding()
- Acceptance: Registry is the sole source of truth for the table; edits propagate to storage and back
- Priority: P1

### Settings UI — Key Input Widget

**F010** — Capture mode widget
- Captures full key event: modifiers (Ctrl, Alt, Shift, Meta) + key character
- Displays the chord being built in real-time (e.g., `Ctrl+` as user holds Ctrl)
- Supports multi-key sequences (e.g., `g g`) via successive captures
- Uses existing KeyboardUtils.getKeyChar() for consistent encoding
- Priority: P1

**F011** — Manual compose widget
- Four toggle buttons: Ctrl, Alt, Shift, Meta (visually highlighted when active)
- Text input or dropdown for the key character (letters, numbers, symbols, special keys like F1-F12, Arrow keys, Space, etc.)
- Special keys selectable from a dropdown since they can't be typed as single chars
- Produces the same `<Modifier-Key>` format as capture mode
- Priority: P1

## Non-Functional Requirements

**N001** — Performance
- Table renders <200ms with 200 rows
- Search filters <50ms
- No virtual scrolling needed unless binding count exceeds 500
- Priority: P1

**N002** — Accessibility
- Keyboard-navigable table (arrow keys, Enter to edit, Esc to cancel)
- ARIA labels on interactive elements
- Priority: P2

**N003** — Visual consistency
- Clean, minimal design inspired by VSCode keyboard shortcuts editor
- Dark/light theme support via existing SK theme system
- Monospace font for key sequences
- Priority: P1

**N004** — Backward compatibility
- Ace editor still works for users who prefer JS-based config
- Existing chrome.storage format unchanged (basicMappings, snippets)
- Edits in table generate equivalent JS that the Ace editor can consume
- Priority: P1
