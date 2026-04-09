# Architecture

## Overview

KitingKeys settings UI is a single-page app served from `pages/options.html`. It replaces the legacy Surfingkeys basic/advanced dual-mode UI with a VSCode-style keyboard shortcuts editor.

The page has a sidebar nav (Keybindings | Advanced JS | Proxy | About) with the keybindings table as the primary view. All binding data flows through a central Binding Registry that merges three sources into one flat, searchable, editable list.

## Components

### Binding Registry (`src/pages/bindingRegistry.js`)
- **Purpose:** Single source of truth for all keybindings across all sources
- **Responsibilities:**
  - Merge default mappings, browser defaults, and user overrides into a unified list
  - Expose CRUD operations: `getAllBindings()`, `updateBinding(id, newKeys)`, `resetBinding(id)`, `removeBinding(id)`
  - Detect conflicts between bindings (same key, different commands)
  - Apply presets (replace all user overrides with a preset's mapping set)
  - Export/import bindings as JSON
- **Interfaces:**
  - Input: default.js trie data (via `surfingkeys:defaultSettingsLoaded` event), browserDefaults.js static data, chrome.storage user overrides
  - Output: flat array of `BindingEntry` objects consumed by the table renderer
- **Data shape:**
  ```
  BindingEntry {
    id: string           // unique: "ext:scroll-down" or "browser:ctrl-t"
    command: string       // human-readable: "Scroll down"
    keys: string          // display format: "j" or "Ctrl+T"
    keysEncoded: string   // internal trie format
    mode: string          // "normal" | "insert" | "visual" | "browser"
    source: "default" | "user" | "browser"
    category: string      // "Scrolling" | "Tabs" | "Navigation" | ...
    overridable: boolean  // browser entries only
    conflicts: ConflictEntry[]
  }
  ```
- **Dependencies:** KeyboardUtils (encode/decode), browserDefaults.js
- **Constraints:** Reads from the mode system's trie but does not modify it directly — writes go through the existing `api.mapkey`/`api.unmap` pipeline

### Keybindings Table (`src/pages/keybindingsTable.js`)
- **Purpose:** Renders and manages the interactive binding table UI
- **Responsibilities:**
  - Render binding entries as table rows with Command, Key, Mode, Source, Conflict columns
  - Handle search input — filter rows by text match on command/key/category
  - Handle filter chips — toggle visibility by source/conflict/modified status
  - Delegate to Key Input Widget for inline editing
  - Context menu: reset, remove, copy-as-JS
- **Interfaces:**
  - Input: BindingEntry[] from registry
  - Output: User edit events → registry.updateBinding()
- **Dependencies:** Binding Registry, Key Input Widget
- **Constraints:** Pure DOM rendering, no framework. Rows are plain HTML built via template literals (matching existing codebase style).

### Key Input Widget (`src/pages/keyInputWidget.js`)
- **Purpose:** Dual-mode key input — capture live keystrokes OR manually compose key combos
- **Responsibilities:**
  - **Capture mode:** Listen for keydown, display building chord in real-time, support multi-key sequences, confirm on Enter, cancel on Esc
  - **Manual mode:** Render four toggle buttons (Ctrl, Alt, Shift, Meta) + a text input with special-key dropdown (F1-F12, arrows, Space, Esc, etc.)
  - Both modes produce the same output: a key string in `<Modifier-Key>` format
  - Toggle switch to flip between modes
- **Interfaces:**
  - Input: Current key value (to pre-populate), target cell element
  - Output: `onConfirm(newKeyString)`, `onCancel()`
  - Uses KeyboardUtils.encodeKeystroke / decodeKeystroke for format consistency
- **Layout (capture mode):**
  ```
  ┌─────────────────────────────────────────┐
  │ [Capture ◉] [Compose ○]                │
  │                                         │
  │  Press keys...     Ctrl+Alt+            │
  │                                         │
  │  [Enter to confirm]  [Esc to cancel]    │
  └─────────────────────────────────────────┘
  ```
- **Layout (compose mode):**
  ```
  ┌─────────────────────────────────────────┐
  │ [Capture ○] [Compose ◉]                │
  │                                         │
  │  [Ctrl] [Alt] [Shift] [Meta]  + [ / ]  │
  │                        ^^^on     ^^^key │
  │  Special: [▾ F1-F12, arrows, etc.]     │
  │                                         │
  │  Result: <Ctrl-Shift-/>                 │
  │  [Enter to confirm]  [Esc to cancel]    │
  └─────────────────────────────────────────┘
  ```
- **Dependencies:** KeyboardUtils
- **Constraints:** Must work inline (replaces the table cell content during edit), not as a modal/overlay

### Settings Page Shell (`src/pages/options.html` + `src/pages/settingsShell.js`)
- **Purpose:** Page layout with sidebar nav and tab content areas
- **Responsibilities:**
  - Sidebar: Keybindings, Advanced JS, Proxy, About tabs
  - Tab switching — shows/hides content panels
  - Header bar with preset dropdown and search (for keybindings tab)
  - Attribution in About tab
- **Dependencies:** All tab-specific components
- **Constraints:** Replaces the entire current options.html body structure

### Preset Manager (within Binding Registry)
- **Purpose:** Apply/export/import binding presets
- **Presets:**
  - **KitingKeys Defaults** — clears all user overrides, reverts to default.js
  - **Vimium Style** — unmaps all, applies Vimium-compatible bindings from vimiumDefaults.js
  - **Minimal** — unmaps all extension bindings, only browser defaults remain
- **Import/Export:** JSON format matching the BindingEntry[] shape (minus computed fields like conflicts)

## Data Flow

```
                    ┌──────────────┐
                    │  default.js  │ (trie built at content script load)
                    └──────┬───────┘
                           │ surfingkeys:defaultSettingsLoaded event
                           ▼
┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐
│ browserDefaults│─▶│ Binding Registry │◀─│ chrome.storage   │
│ .js (static)   │  │                  │  │ (user overrides) │
└────────────────┘  └────────┬─────────┘  └─────────────────┘
                             │
                    getAllBindings()
                             │
                             ▼
                    ┌──────────────────┐
                    │ Keybindings Table│
                    │   (renders rows) │
                    └────────┬─────────┘
                             │ user clicks cell
                             ▼
                    ┌──────────────────┐
                    │ Key Input Widget │
                    │ (capture/compose)│
                    └────────┬─────────┘
                             │ onConfirm(newKey)
                             ▼
                    registry.updateBinding()
                             │
                    ┌────────┴─────────┐
                    │ chrome.storage   │ (persist)
                    │ + api.mapkey()   │ (apply live)
                    └──────────────────┘
```

## Design Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| No framework (plain DOM) | Matches existing codebase; extension pages don't need React/Vue overhead | React — rejected: adds build complexity and 40KB+ for a single page |
| Inline editing, not modal | VSCode pattern; faster interaction; modal key picker was clunky | Keep modal — rejected: breaks flow, extra click |
| Dual-mode key input | Some combos can't be physically pressed (OS intercepts); manual compose is the escape hatch | Capture-only — rejected: user specifically requested manual compose |
| Browser bindings as inline rows | Seeing everything in one list is the whole point; separate section was confusing | Separate tab — rejected: defeats unified view |
| Binding Registry as data layer | Decouples data from UI; makes presets/export/import clean | Direct trie manipulation — rejected: trie is internal, hard to serialize |

## Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Trie data extraction | Default bindings are in a trie, not a flat list — need to walk it | Use existing `getMetas()` / trie walk; the `?` help page already does this |
| Live key capture in compose mode | Toggle buttons + text input is unusual UX | Preview the result string in real-time so user sees what they're building |
| Ace editor ↔ table sync | Edits in one should reflect in the other | Table writes to storage; Ace reads from storage on tab switch; no real-time sync needed |

## Implementation Sequence

1. **bindingRegistry.js** — data layer (no UI)
2. **keyInputWidget.js** — the dual-mode key editor (standalone, testable)
3. **keybindingsTable.js** — the main table (depends on 1 + 2)
4. **settingsShell.js + options.html rewrite** — page layout with sidebar
5. **Preset integration** — wire presets dropdown to registry
6. **Delete old UI code** — remove basicMappings, browserDefaultsSection, presetSection, advancedToggler
