# Noty Hotkeys Reference

This document provides a comprehensive guide to all default keyboard shortcuts in **Noty** (mirroring Obsidian's keyboard layout). All hotkeys are fully remappable via **Settings > Hotkeys** or by editing `.noty/hotkeys.json`.

---

## 1. General & Command Navigation

| Shortcut | Command Name | Command ID | Description |
| :--- | :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>P</kbd> | Open command palette | `app:open-command-palette` | Fuzzy search and run any application action with recent commands first |
| <kbd>Ctrl</kbd> + <kbd>O</kbd> | Quick switcher: Open note | `app:open-quick-switcher` | Search notes, headings (`#`), and create-on-enter |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd> | Manage vaults | `app:open-vault-switcher` | Switch between existing vaults or create/open a new vault |
| <kbd>Ctrl</kbd> + <kbd>,</kbd> | Open settings | `app:open-settings` | Open the preferences modal (Editor, Files, Appearance, Hotkeys) |
| <kbd>Esc</kbd> | Close palette / modal | — | Dismisses open modals, command palette, and quick switcher |

---

## 2. File & Note Management

| Shortcut | Command Name | Command ID | Description |
| :--- | :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>N</kbd> | Create new note | `app:new-note` | Creates a new untitled note and opens it in a new tab |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd> | Create note in new pane | `app:new-note-split` | Creates a new note and opens it in a side-by-side split pane |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save active file | `app:save-file` | Forces immediate atomic write to the filesystem |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>D</kbd> | Open today's daily note | `app:daily-note` | Opens or creates `YYYY-MM-DD.md` in the vault root |
| <kbd>F2</kbd> | Rename active file | `app:rename-file` | Prompts for a new note name and renames across the vault |

---

## 3. Workspace & Layout

| Shortcut | Command Name | Command ID | Description |
| :--- | :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>\</kbd> | Split pane right | `app:split-right` | Splits the current workspace pane horizontally |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | Split pane down | `app:split-down` | Splits the current workspace pane vertically |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>\</kbd> | Toggle left sidebar | `app:toggle-left-sidebar` | Collapses or expands the left panel ribbon |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>\</kbd> | Toggle right sidebar | `app:toggle-right-sidebar` | Collapses or expands the right panel ribbon |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | Search in files | `app:global-search` | Opens the search panel in the left sidebar |
| <kbd>Ctrl</kbd> + <kbd>G</kbd> | Open graph view | `app:graph-view` | Opens the interactive note graph view |

---

## 4. Tabs & Navigation History

| Shortcut | Command Name | Command ID | Description |
| :--- | :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>W</kbd> | Close active tab | `app:close-tab` | Closes the current note tab in the active pane |
| <kbd>Ctrl</kbd> + <kbd>Tab</kbd> | Next tab in pane | `app:next-tab` | Cycles focus to the next open tab |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Tab</kbd> | Previous tab in pane | `app:prev-tab` | Cycles focus to the previous open tab |
| <kbd>Alt</kbd> + <kbd>←</kbd> | Navigate back | `app:nav-back` | Jumps back to the previous note in pane history |
| <kbd>Alt</kbd> + <kbd>→</kbd> | Navigate forward | `app:nav-forward` | Jumps forward in pane navigation history |

---

## 5. Editor & Markdown Formatting

| Shortcut | Command Name | Command ID | Description |
| :--- | :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>E</kbd> | Toggle Edit / Reading view | `app:toggle-preview` | Cycles between Live Preview, Reading view, and Source mode |
| <kbd>Ctrl</kbd> + <kbd>B</kbd> | Format: Bold | `editor:bold` | Wraps selection in `**bold**` delimiters |
| <kbd>Ctrl</kbd> + <kbd>I</kbd> | Format: Italic | `editor:italic` | Wraps selection in `*italic*` delimiters |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | Insert link / wikilink | `editor:insert-link` | Wraps selection in `[[wikilink]]` syntax |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Toggle task checkbox | `editor:toggle-task` | Toggles `- [ ]` and `- [x]` on the current line |
| <kbd>Ctrl</kbd> + <kbd>]</kbd> | Indent line / list item | `editor:indent` | Indents list item or text block |
| <kbd>Ctrl</kbd> + <kbd>[</kbd> | Outdent line / list item | `editor:outdent` | Outdents list item or text block |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | Find in active note | `app:in-note-find` | Opens in-editor search |

---

## 6. Obsidian Configuration Compatibility

- **Configuration File**: Custom hotkeys are saved to `.<appname>/hotkeys.json`.
- **Obsidian Import**: In **Settings > Hotkeys**, click **Import from Obsidian** to automatically load keyboard shortcuts from an existing `.obsidian/hotkeys.json` file.
- **Conflict Detection**: The hotkeys settings page actively detects duplicate bindings and highlights conflicts with a warning.
- **Android / Bluetooth Keyboards**: All shortcut events listen to standard web keyboard events, supporting external Bluetooth and USB keyboards on Android devices, alongside one-tap icons on the Left Ribbon.
