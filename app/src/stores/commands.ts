import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from './vault';
import { useWorkspaceStore } from './workspace';
import { useSettingsStore } from './settings';

export interface AppCommand {
  id: string;
  name: string;
  section: 'General' | 'Navigation' | 'Editor' | 'File' | 'View';
  icon?: any;
  defaultHotkeys?: string;
  hotkeys?: string;
  callback: () => void | Promise<void>;
}

export interface HotkeyConflict {
  commandId: string;
  commandName: string;
  conflictingCommandId: string;
  conflictingCommandName: string;
  hotkey: string;
}

export const useCommandStore = defineStore('commands', {
  state: () => ({
    commands: {} as Record<string, AppCommand>,
    recentCommandIds: [] as string[],
    showCommandPalette: false,
    showQuickSwitcher: false,
    isLoaded: false,
  }),

  getters: {
    commandList(state): AppCommand[] {
      return Object.values(state.commands);
    },

    recentCommands(state): AppCommand[] {
      return state.recentCommandIds
        .map((id) => state.commands[id])
        .filter(Boolean) as AppCommand[];
    },

    // Map of normalized hotkey string -> Command ID
    hotkeysMap(state): Map<string, string> {
      const map = new Map<string, string>();
      for (const cmd of Object.values(state.commands)) {
        if (cmd.hotkeys) {
          map.set(normalizeHotkey(cmd.hotkeys), cmd.id);
        }
      }
      return map;
    },

    // Detect all hotkey conflicts
    conflicts(state): HotkeyConflict[] {
      const seen = new Map<string, AppCommand>();
      const conflictList: HotkeyConflict[] = [];

      for (const cmd of Object.values(state.commands)) {
        if (!cmd.hotkeys) continue;
        const norm = normalizeHotkey(cmd.hotkeys);
        if (seen.has(norm)) {
          const existing = seen.get(norm)!;
          conflictList.push({
            commandId: cmd.id,
            commandName: cmd.name,
            conflictingCommandId: existing.id,
            conflictingCommandName: existing.name,
            hotkey: cmd.hotkeys,
          });
        } else {
          seen.set(norm, cmd);
        }
      }
      return conflictList;
    },
  },

  actions: {
    registerCommand(cmd: AppCommand) {
      // If hotkeys is not explicitly set, use defaultHotkeys
      const activeHotkeys = cmd.hotkeys !== undefined ? cmd.hotkeys : cmd.defaultHotkeys || '';
      this.commands[cmd.id] = {
        ...cmd,
        hotkeys: activeHotkeys,
      };
    },

    async executeCommand(commandId: string) {
      const cmd = this.commands[commandId];
      if (!cmd) return;

      // Update recent commands list
      this.recentCommandIds = [
        commandId,
        ...this.recentCommandIds.filter((id) => id !== commandId),
      ].slice(0, 10);

      // Save recent commands to localStorage
      try {
        localStorage.setItem('noty_recent_commands', JSON.stringify(this.recentCommandIds));
      } catch {
        // Ignore localStorage errors
      }

      // Close palettes if open
      this.showCommandPalette = false;
      this.showQuickSwitcher = false;

      // Execute callback
      try {
        await cmd.callback();
      } catch (err) {
        console.error(`Error executing command ${commandId}:`, err);
      }
    },

    setHotkey(commandId: string, keys: string) {
      const cmd = this.commands[commandId];
      if (cmd) {
        cmd.hotkeys = keys.trim();
        this.saveHotkeysToVault();
      }
    },

    removeHotkey(commandId: string) {
      const cmd = this.commands[commandId];
      if (cmd) {
        cmd.hotkeys = '';
        this.saveHotkeysToVault();
      }
    },

    resetHotkey(commandId: string) {
      const cmd = this.commands[commandId];
      if (cmd) {
        cmd.hotkeys = cmd.defaultHotkeys || '';
        this.saveHotkeysToVault();
      }
    },

    resetAllHotkeys() {
      for (const cmd of Object.values(this.commands)) {
        cmd.hotkeys = cmd.defaultHotkeys || '';
      }
      this.saveHotkeysToVault();
    },

    async loadHotkeysFromVault() {
      // 1. Load recent commands from localStorage
      try {
        const storedRecents = localStorage.getItem('noty_recent_commands');
        if (storedRecents) {
          this.recentCommandIds = JSON.parse(storedRecents);
        }
      } catch {
        // Ignore
      }

      // Check if Tauri is present
      if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
        return;
      }

      // 2. Load custom hotkeys from .noty/hotkeys.json
      try {
        const content = await invoke<string | null>('vault_read_config', {
          configName: 'hotkeys',
        });
        if (content) {
          const mapping = JSON.parse(content);
          if (typeof mapping === 'object' && mapping !== null) {
            // Can be array of { id, keys } or map of { id: keys }
            if (Array.isArray(mapping)) {
              for (const item of mapping) {
                if (item.id && this.commands[item.id]) {
                  this.commands[item.id].hotkeys = item.keys;
                }
              }
            } else {
              for (const [id, keys] of Object.entries(mapping)) {
                if (this.commands[id] && typeof keys === 'string') {
                  this.commands[id].hotkeys = keys;
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load hotkeys config:', err);
      }
    },

    async saveHotkeysToVault() {
      if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
        return;
      }
      try {
        const mapping: Record<string, string> = {};
        for (const [id, cmd] of Object.entries(this.commands)) {
          mapping[id] = cmd.hotkeys || '';
        }
        await invoke('vault_write_config', {
          configName: 'hotkeys',
          content: JSON.stringify(mapping, null, 2),
        });
      } catch (err) {
        console.warn('Failed to save hotkeys config:', err);
      }
    },

    /**
     * Import key mappings from an existing Obsidian .obsidian/hotkeys.json file
     */
    async importObsidianHotkeys(): Promise<{ imported: number; error?: string }> {
      try {
        const raw = await invoke<string>('vault_read_file', {
          relativePath: '.obsidian/hotkeys.json',
        });
        if (!raw) return { imported: 0, error: 'No .obsidian/hotkeys.json file found in vault' };

        const parsed = JSON.parse(raw);
        let count = 0;

        // Map Obsidian command IDs to Noty command IDs
        const obsidianIdMap: Record<string, string> = {
          'app:open-settings': 'app:open-settings',
          'app:toggle-left-sidebar': 'app:toggle-left-sidebar',
          'app:toggle-right-sidebar': 'app:toggle-right-sidebar',
          'workspace:close': 'app:close-tab',
          'workspace:next-tab': 'app:next-tab',
          'workspace:previous-tab': 'app:prev-tab',
          'workspace:split-vertical': 'app:split-right',
          'workspace:split-horizontal': 'app:split-down',
          'editor:toggle-bold': 'editor:bold',
          'editor:toggle-italics': 'editor:italic',
          'editor:insert-link': 'editor:insert-link',
          'editor:toggle-checklist-status': 'editor:toggle-task',
          'editor:indent-list': 'editor:indent',
          'editor:unindent-list': 'editor:outdent',
          'global-search:open': 'app:global-search',
          'switcher:open': 'app:open-quick-switcher',
          'command-palette:open': 'app:open-command-palette',
        };

        for (const [obsId, binding] of Object.entries(parsed)) {
          const notyId = obsidianIdMap[obsId] || obsId;
          if (this.commands[notyId] && Array.isArray(binding) && binding.length > 0) {
            const first = binding[0];
            const mods = first.modifiers ? first.modifiers.join('+').replace(/Mod/g, 'Ctrl') : '';
            const keyStr = first.key ? `${mods ? mods + '+' : ''}${first.key.toUpperCase()}` : '';
            if (keyStr) {
              this.commands[notyId].hotkeys = keyStr;
              count++;
            }
          }
        }

        if (count > 0) {
          await this.saveHotkeysToVault();
        }
        return { imported: count };
      } catch (err: any) {
        return { imported: 0, error: err.message || String(err) };
      }
    },

    /**
     * Global keyboard event handler
     */
    handleGlobalKeydown(e: KeyboardEvent): boolean {
      // Do not trigger hotkeys if user is actively typing in a standard input or textarea (unless Escape or Ctrl combo)
      const target = e.target as HTMLElement;
      const isInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      // Escape closes open palettes
      if (e.key === 'Escape') {
        if (this.showCommandPalette || this.showQuickSwitcher) {
          this.showCommandPalette = false;
          this.showQuickSwitcher = false;
          e.preventDefault();
          return true;
        }
      }

      const hotkeyString = eventToHotkeyString(e);
      if (!hotkeyString) return false;

      const norm = normalizeHotkey(hotkeyString);
      const commandId = this.hotkeysMap.get(norm);

      if (commandId) {
        // If in input and command is not Ctrl/Cmd combo or F-key, don't intercept normal typing
        if (isInput && !e.ctrlKey && !e.metaKey && !e.key.startsWith('F')) {
          return false;
        }
        e.preventDefault();
        e.stopPropagation();
        this.executeCommand(commandId);
        return true;
      }

      return false;
    },

    /**
     * Initialize and register all core commands mirroring Obsidian
     */
    initCoreCommands() {
      const vault = useVaultStore();
      const workspace = useWorkspaceStore();
      const settings = useSettingsStore();

      // 1. General & Palette Commands
      this.registerCommand({
        id: 'app:open-command-palette',
        name: 'Open command palette',
        section: 'General',
        defaultHotkeys: 'Ctrl+P',
        callback: () => {
          this.showCommandPalette = true;
          this.showQuickSwitcher = false;
        },
      });

      this.registerCommand({
        id: 'app:open-quick-switcher',
        name: 'Quick switcher: Open note',
        section: 'Navigation',
        defaultHotkeys: 'Ctrl+O',
        callback: () => {
          this.showQuickSwitcher = true;
          this.showCommandPalette = false;
        },
      });

      this.registerCommand({
        id: 'app:open-vault-switcher',
        name: 'Manage vaults / Open another vault',
        section: 'General',
        defaultHotkeys: 'Ctrl+Shift+O',
        callback: () => {
          vault.showVaultSwitcher = true;
        },
      });

      this.registerCommand({
        id: 'app:open-settings',
        name: 'Open settings',
        section: 'General',
        defaultHotkeys: 'Ctrl+,',
        callback: () => {
          settings.showSettingsModal = !settings.showSettingsModal;
        },
      });

      this.registerCommand({
        id: 'app:new-note',
        name: 'Create new note',
        section: 'File',
        defaultHotkeys: 'Ctrl+N',
        callback: async () => {
          const path = await vault.createFile('', 'Untitled Note');
          if (path) workspace.openNote(path, { newTab: true });
        },
      });

      this.registerCommand({
        id: 'app:new-note-split',
        name: 'Create new note in new pane',
        section: 'File',
        defaultHotkeys: 'Ctrl+Shift+N',
        callback: async () => {
          const path = await vault.createFile('', 'Untitled Note');
          if (path && workspace.layout.activeLeafId) {
            workspace.splitLeaf(workspace.layout.activeLeafId, 'horizontal', true);
            workspace.openNote(path);
          }
        },
      });

      this.registerCommand({
        id: 'app:save-file',
        name: 'Save active file',
        section: 'File',
        defaultHotkeys: 'Ctrl+S',
        callback: async () => {
          if (vault.activeFilePath && vault.activeFileContent !== undefined) {
            await invoke('vault_write_file', {
              relativePath: vault.activeFilePath,
              content: vault.activeFileContent,
            });
            vault.saveStatus = 'Saved';
          }
        },
      });

      this.registerCommand({
        id: 'app:toggle-preview',
        name: 'Toggle Edit / Reading view',
        section: 'View',
        defaultHotkeys: 'Ctrl+E',
        callback: () => {
          const tab = workspace.activeTab;
          if (tab) {
            const current = tab.previewMode || 'live';
            tab.previewMode = current === 'live' ? 'reading' : current === 'reading' ? 'source' : 'live';
          }
        },
      });

      this.registerCommand({
        id: 'app:close-tab',
        name: 'Close active tab',
        section: 'Navigation',
        defaultHotkeys: 'Ctrl+W',
        callback: () => {
          const leaf = workspace.activeLeaf;
          if (leaf && leaf.activeTabId) {
            workspace.closeTab(leaf.id, leaf.activeTabId);
          }
        },
      });

      this.registerCommand({
        id: 'app:next-tab',
        name: 'Next tab in pane',
        section: 'Navigation',
        defaultHotkeys: 'Ctrl+Tab',
        callback: () => {
          const leaf = workspace.activeLeaf;
          if (leaf && leaf.tabs.length > 1) {
            const curIdx = leaf.tabs.findIndex((t) => t.id === leaf.activeTabId);
            const nextIdx = (curIdx + 1) % leaf.tabs.length;
            workspace.setActiveTab(leaf.id, leaf.tabs[nextIdx].id);
          }
        },
      });

      this.registerCommand({
        id: 'app:prev-tab',
        name: 'Previous tab in pane',
        section: 'Navigation',
        defaultHotkeys: 'Ctrl+Shift+Tab',
        callback: () => {
          const leaf = workspace.activeLeaf;
          if (leaf && leaf.tabs.length > 1) {
            const curIdx = leaf.tabs.findIndex((t) => t.id === leaf.activeTabId);
            const prevIdx = (curIdx - 1 + leaf.tabs.length) % leaf.tabs.length;
            workspace.setActiveTab(leaf.id, leaf.tabs[prevIdx].id);
          }
        },
      });

      this.registerCommand({
        id: 'app:nav-back',
        name: 'Navigate back',
        section: 'Navigation',
        defaultHotkeys: 'Alt+ArrowLeft',
        callback: () => {
          if (workspace.layout.activeLeafId) {
            workspace.navigateBack(workspace.layout.activeLeafId);
          }
        },
      });

      this.registerCommand({
        id: 'app:nav-forward',
        name: 'Navigate forward',
        section: 'Navigation',
        defaultHotkeys: 'Alt+ArrowRight',
        callback: () => {
          if (workspace.layout.activeLeafId) {
            workspace.navigateForward(workspace.layout.activeLeafId);
          }
        },
      });

      this.registerCommand({
        id: 'app:split-right',
        name: 'Split pane right',
        section: 'View',
        defaultHotkeys: 'Ctrl+\\',
        callback: () => {
          if (workspace.layout.activeLeafId) {
            workspace.splitLeaf(workspace.layout.activeLeafId, 'horizontal', true);
          }
        },
      });

      this.registerCommand({
        id: 'app:split-down',
        name: 'Split pane down',
        section: 'View',
        defaultHotkeys: 'Ctrl+Shift+D',
        callback: () => {
          if (workspace.layout.activeLeafId) {
            workspace.splitLeaf(workspace.layout.activeLeafId, 'vertical', true);
          }
        },
      });

      this.registerCommand({
        id: 'app:daily-note',
        name: 'Open today\'s daily note',
        section: 'File',
        defaultHotkeys: 'Ctrl+Alt+D',
        callback: async () => {
          const today = new Date().toISOString().split('T')[0];
          const fileName = `${today}.md`;
          let existing = vault.activeFilePath === fileName;
          if (!existing) {
            // Check if file exists in file tree
            const found = vault.fileTree.some((f) => f.name === fileName);
            if (!found) {
              await vault.createFile('', today);
            }
            workspace.openNote(fileName, { newTab: true });
          }
        },
      });

      this.registerCommand({
        id: 'app:graph-view',
        name: 'Open graph view',
        section: 'View',
        defaultHotkeys: 'Ctrl+G',
        callback: () => {
          workspace.showGraphView = true;
        },
      });

      this.registerCommand({
        id: 'app:toggle-left-sidebar',
        name: 'Toggle left sidebar',
        section: 'View',
        defaultHotkeys: 'Ctrl+Shift+\\',
        callback: () => {
          workspace.toggleLeftSidebar();
        },
      });

      this.registerCommand({
        id: 'app:toggle-right-sidebar',
        name: 'Toggle right sidebar',
        section: 'View',
        defaultHotkeys: 'Ctrl+Alt+\\',
        callback: () => {
          workspace.toggleRightSidebar();
        },
      });

      this.registerCommand({
        id: 'app:global-search',
        name: 'Search in files (Global Search)',
        section: 'Navigation',
        defaultHotkeys: 'Ctrl+Shift+F',
        callback: () => {
          workspace.layout.leftSidebar.activePanel = 'search';
          workspace.layout.leftSidebar.collapsed = false;
        },
      });

      this.registerCommand({
        id: 'app:in-note-find',
        name: 'Find in active note',
        section: 'Editor',
        defaultHotkeys: 'Ctrl+F',
        callback: () => {
          // Focus or open CodeMirror search
          const activeEl = document.querySelector('.cm-content') as HTMLElement | null;
          activeEl?.focus();
        },
      });

      this.registerCommand({
        id: 'app:rename-file',
        name: 'Rename active file',
        section: 'File',
        defaultHotkeys: 'F2',
        callback: () => {
          if (vault.activeFilePath) {
            const currentName = vault.activeFilePath.split('/').pop()?.replace(/\.md$/, '') || '';
            const newName = prompt('Enter new file name:', currentName);
            if (newName && newName.trim() && newName !== currentName) {
              const dir = vault.activeFilePath.includes('/')
                ? vault.activeFilePath.slice(0, vault.activeFilePath.lastIndexOf('/'))
                : '';
              const newRel = dir ? `${dir}/${newName.trim()}.md` : `${newName.trim()}.md`;
              vault.renameItem(vault.activeFilePath, newRel);
            }
          }
        },
      });

      this.registerCommand({
        id: 'editor:bold',
        name: 'Format: Bold',
        section: 'Editor',
        defaultHotkeys: 'Ctrl+B',
        callback: () => {
          dispatchFormatting('**', '**');
        },
      });

      this.registerCommand({
        id: 'editor:italic',
        name: 'Format: Italic',
        section: 'Editor',
        defaultHotkeys: 'Ctrl+I',
        callback: () => {
          dispatchFormatting('*', '*');
        },
      });

      this.registerCommand({
        id: 'editor:insert-link',
        name: 'Insert link / wikilink',
        section: 'Editor',
        defaultHotkeys: 'Ctrl+K',
        callback: () => {
          dispatchFormatting('[[', ']]');
        },
      });

      this.registerCommand({
        id: 'editor:toggle-task',
        name: 'Toggle checkbox status under cursor',
        section: 'Editor',
        defaultHotkeys: 'Ctrl+Enter',
        callback: () => {
          toggleActiveTaskCheckbox();
        },
      });

      this.registerCommand({
        id: 'editor:indent',
        name: 'Indent line / list item',
        section: 'Editor',
        defaultHotkeys: 'Ctrl+]',
        callback: () => {
          indentActiveLine(true);
        },
      });

      this.registerCommand({
        id: 'editor:outdent',
        name: 'Outdent line / list item',
        section: 'Editor',
        defaultHotkeys: 'Ctrl+[',
        callback: () => {
          indentActiveLine(false);
        },
      });

      this.registerCommand({
        id: 'app:open-trash',
        name: 'View deleted files (.trash)',
        section: 'File',
        defaultHotkeys: '',
        callback: () => {
          vault.showTrashModal = true;
        },
      });

      this.isLoaded = true;
    },
  },
});

/**
 * Normalizes hotkey strings for comparison (e.g. "ctrl+shift+p" -> "Ctrl+Shift+P")
 */
export function normalizeHotkey(str: string): string {
  const parts = str
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  const modifiers: string[] = [];
  let mainKey = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') modifiers.push('Ctrl');
    else if (lower === 'alt' || lower === 'opt' || lower === 'option') modifiers.push('Alt');
    else if (lower === 'shift') modifiers.push('Shift');
    else if (lower === 'meta' || lower === 'cmd' || lower === 'command') modifiers.push('Meta');
    else {
      // Capitalize single letters or standard keys
      if (part.length === 1) {
        mainKey = part.toUpperCase();
      } else if (lower === 'arrowleft') {
        mainKey = 'ArrowLeft';
      } else if (lower === 'arrowright') {
        mainKey = 'ArrowRight';
      } else if (lower === 'arrowup') {
        mainKey = 'ArrowUp';
      } else if (lower === 'arrowdown') {
        mainKey = 'ArrowDown';
      } else if (lower === 'enter') {
        mainKey = 'Enter';
      } else if (lower === 'tab') {
        mainKey = 'Tab';
      } else {
        mainKey = part.charAt(0).toUpperCase() + part.slice(1);
      }
    }
  }

  // Consistent order: Ctrl -> Alt -> Shift -> Meta -> Key
  const sortedMods: string[] = [];
  if (modifiers.includes('Ctrl')) sortedMods.push('Ctrl');
  if (modifiers.includes('Alt')) sortedMods.push('Alt');
  if (modifiers.includes('Shift')) sortedMods.push('Shift');
  if (modifiers.includes('Meta')) sortedMods.push('Meta');

  return [...sortedMods, mainKey].join('+');
}

/**
 * Converts a KeyboardEvent into a readable hotkey string
 */
export function eventToHotkeyString(e: KeyboardEvent): string {
  const modifiers: string[] = [];
  if (e.ctrlKey) modifiers.push('Ctrl');
  if (e.altKey) modifiers.push('Alt');
  if (e.shiftKey) modifiers.push('Shift');
  if (e.metaKey) modifiers.push('Meta');

  let key = e.key;

  // Ignore modifier key presses on their own
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    return '';
  }

  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();

  return [...modifiers, key].join('+');
}

// Helpers for editor formatting actions
function dispatchFormatting(prefix: string, suffix: string) {
  const activeEl = document.activeElement as HTMLElement | null;
  if (!activeEl || !activeEl.classList.contains('cm-content')) return;

  const event = new CustomEvent('noty:format-selection', {
    detail: { prefix, suffix },
  });
  window.dispatchEvent(event);
}

function toggleActiveTaskCheckbox() {
  const event = new CustomEvent('noty:toggle-task');
  window.dispatchEvent(event);
}

function indentActiveLine(isIndent: boolean) {
  const event = new CustomEvent('noty:indent-line', {
    detail: { isIndent },
  });
  window.dispatchEvent(event);
}
