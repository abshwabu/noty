import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import type {
  AppSettings,
  EditorSettings,
  FilesLinksSettings,
  AppearanceSettings,
  HotkeyItem,
  CorePluginItem,
} from '../types/workspace';

const defaultEditorSettings: EditorSettings = {
  defaultViewMode: 'edit',
  lineNumbers: true,
  readableLineLength: true,
  autoPairBrackets: true,
  spellcheck: false,
  fontSize: 14,
  tabSize: 4,
};

const defaultFilesSettings: FilesLinksSettings = {
  newFileLocation: 'root',
  newFileFolder: '',
  attachmentFolderPath: 'attachments',
  confirmDelete: true,
};

const defaultAppearanceSettings: AppearanceSettings = {
  baseTheme: 'dark',
  accentColor: '#8b5cf6',
  fontInterface: '',
  fontText: '',
  fontMonospace: '',
  zoomLevel: 100,
  enabledSnippets: [],
};

const defaultHotkeys: HotkeyItem[] = [
  { id: 'quick-switcher', name: 'Quick switcher', keys: 'Ctrl+O', defaultKeys: 'Ctrl+O' },
  { id: 'new-note', name: 'Create new note', keys: 'Ctrl+N', defaultKeys: 'Ctrl+N' },
  { id: 'save-file', name: 'Save active file', keys: 'Ctrl+S', defaultKeys: 'Ctrl+S' },
  { id: 'toggle-left-sidebar', name: 'Toggle left sidebar', keys: 'Ctrl+\\', defaultKeys: 'Ctrl+\\' },
  { id: 'toggle-right-sidebar', name: 'Toggle right sidebar', keys: 'Ctrl+Alt+\\', defaultKeys: 'Ctrl+Alt+\\' },
  { id: 'open-settings', name: 'Open settings', keys: 'Ctrl+,', defaultKeys: 'Ctrl+,' },
  { id: 'close-tab', name: 'Close active tab', keys: 'Ctrl+W', defaultKeys: 'Ctrl+W' },
  { id: 'split-right', name: 'Split pane right', keys: 'Ctrl+Shift+D', defaultKeys: 'Ctrl+Shift+D' },
  { id: 'toggle-mode', name: 'Toggle Edit / Reading view', keys: 'Ctrl+E', defaultKeys: 'Ctrl+E' },
];

const defaultPlugins: CorePluginItem[] = [
  { id: 'files', name: 'File explorer', description: 'See and manage the files and folders in your vault.', enabled: true },
  { id: 'search', name: 'Search', description: 'Search for keywords and phrases throughout your notes.', enabled: true },
  { id: 'bookmarks', name: 'Bookmarks', description: 'Bookmark your most important files, folders, and searches.', enabled: true },
  { id: 'tags', name: 'Tags view', description: 'Display all tags in your vault and their occurrences.', enabled: true },
  { id: 'outline', name: 'Outline', description: 'Display the heading structure of the active note.', enabled: true },
  { id: 'backlinks', name: 'Backlinks', description: 'Show incoming links to the current note from other files.', enabled: true },
  { id: 'outgoing', name: 'Outgoing links', description: 'Show all outgoing links from the active note.', enabled: true },
  { id: 'properties', name: 'Properties', description: 'View and edit document frontmatter YAML properties.', enabled: true },
];

export const useSettingsStore = defineStore('settings', {
  state: (): AppSettings & {
    availableSnippets: string[];
    showSettingsModal: boolean;
    activeSettingsSection: string;
  } => ({
    editor: { ...defaultEditorSettings },
    files: { ...defaultFilesSettings },
    appearance: { ...defaultAppearanceSettings },
    hotkeys: [...defaultHotkeys],
    plugins: [...defaultPlugins],
    availableSnippets: [],
    showSettingsModal: false,
    activeSettingsSection: 'editor',
  }),

  actions: {
    async loadSettings() {
      // 1. Load appearance.json
      try {
        const rawApp = await invoke<string | null>('vault_read_config', { configName: 'appearance' });
        if (rawApp) {
          const parsed = JSON.parse(rawApp);
          this.appearance = { ...this.appearance, ...parsed };
        }
      } catch (err) {
        console.warn('Failed to load appearance config:', err);
      }

      // 2. Load app.json (editor, files, plugins)
      try {
        const rawAppConfig = await invoke<string | null>('vault_read_config', { configName: 'app' });
        if (rawAppConfig) {
          const parsed = JSON.parse(rawAppConfig);
          if (parsed.editor) this.editor = { ...this.editor, ...parsed.editor };
          if (parsed.files) this.files = { ...this.files, ...parsed.files };
          if (parsed.plugins) this.plugins = parsed.plugins;
        }
      } catch (err) {
        console.warn('Failed to load app config:', err);
      }

      // 3. Load hotkeys.json
      try {
        const rawHotkeys = await invoke<string | null>('vault_read_config', { configName: 'hotkeys' });
        if (rawHotkeys) {
          const parsed = JSON.parse(rawHotkeys);
          if (Array.isArray(parsed)) this.hotkeys = parsed;
        }
      } catch (err) {
        console.warn('Failed to load hotkeys config:', err);
      }

      // 4. Refresh available CSS snippets
      await this.refreshSnippets();

      // 5. Apply to DOM
      await this.applyAppearance();
    },

    async saveSettings() {
      try {
        // Save appearance.json
        await invoke('vault_write_config', {
          configName: 'appearance',
          content: JSON.stringify(this.appearance, null, 2),
        });

        // Save app.json
        await invoke('vault_write_config', {
          configName: 'app',
          content: JSON.stringify(
            {
              editor: this.editor,
              files: this.files,
              plugins: this.plugins,
            },
            null,
            2
          ),
        });

        // Save hotkeys.json
        await invoke('vault_write_config', {
          configName: 'hotkeys',
          content: JSON.stringify(this.hotkeys, null, 2),
        });
      } catch (err) {
        console.warn('Failed to save settings:', err);
      }
    },

    async applyAppearance() {
      if (typeof document === 'undefined') return;

      const root = document.documentElement;
      const body = document.body;

      // Theme
      const isDark =
        this.appearance.baseTheme === 'dark' ||
        (this.appearance.baseTheme === 'system' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);

      root.setAttribute('data-theme', isDark ? 'dark' : 'light');

      // Accent color
      if (this.appearance.accentColor) {
        root.style.setProperty('--interactive-accent', this.appearance.accentColor);
        root.style.setProperty('--text-accent', this.appearance.accentColor);
        root.style.setProperty('--background-modifier-border-focus', this.appearance.accentColor);
      }

      // Fonts
      if (this.appearance.fontInterface) {
        root.style.setProperty('--font-interface', this.appearance.fontInterface);
      } else {
        root.style.removeProperty('--font-interface');
      }

      if (this.appearance.fontText) {
        root.style.setProperty('--font-text', this.appearance.fontText);
      } else {
        root.style.removeProperty('--font-text');
      }

      if (this.appearance.fontMonospace) {
        root.style.setProperty('--font-monospace', this.appearance.fontMonospace);
      } else {
        root.style.removeProperty('--font-monospace');
      }

      // Font size
      if (this.editor.fontSize) {
        root.style.setProperty('--font-size-normal', `${this.editor.fontSize}px`);
      }

      // Interface Zoom
      const zoom = this.appearance.zoomLevel || 100;
      (body.style as any).zoom = `${zoom / 100}`;

      // CSS Snippets
      await this.applySnippets();
    },

    async refreshSnippets() {
      try {
        this.availableSnippets = await invoke<string[]>('vault_list_snippets');
      } catch (err) {
        console.warn('Failed to list snippets:', err);
        this.availableSnippets = [];
      }
    },

    async applySnippets() {
      if (typeof document === 'undefined') return;

      let styleEl = document.getElementById('custom-css-snippets') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'custom-css-snippets';
        document.head.appendChild(styleEl);
      }

      let combinedCss = '';
      for (const snippetName of this.appearance.enabledSnippets) {
        try {
          const css = await invoke<string>('vault_read_snippet', { snippetName });
          combinedCss += `\n/* Snippet: ${snippetName} */\n${css}\n`;
        } catch (err) {
          console.warn(`Failed to load snippet ${snippetName}:`, err);
        }
      }

      styleEl.textContent = combinedCss;
    },

    async toggleSnippet(snippetName: string) {
      const idx = this.appearance.enabledSnippets.indexOf(snippetName);
      if (idx === -1) {
        this.appearance.enabledSnippets.push(snippetName);
      } else {
        this.appearance.enabledSnippets.splice(idx, 1);
      }
      await this.saveSettings();
      await this.applySnippets();
    },

    async setBaseTheme(theme: 'dark' | 'light' | 'system') {
      this.appearance.baseTheme = theme;
      await this.saveSettings();
      await this.applyAppearance();
    },

    async setAccentColor(color: string) {
      this.appearance.accentColor = color;
      await this.saveSettings();
      await this.applyAppearance();
    },

    async setZoom(zoom: number) {
      this.appearance.zoomLevel = Math.max(70, Math.min(200, zoom));
      await this.saveSettings();
      await this.applyAppearance();
    },

    async updateHotkey(id: string, keys: string) {
      const hotkey = this.hotkeys.find((h) => h.id === id);
      if (hotkey) {
        hotkey.keys = keys;
        await this.saveSettings();
      }
    },

    async resetHotkeys() {
      this.hotkeys = [...defaultHotkeys];
      await this.saveSettings();
    },

    async togglePlugin(id: string) {
      const p = this.plugins.find((item) => item.id === id);
      if (p) {
        p.enabled = !p.enabled;
        await this.saveSettings();
      }
    },
  },
});
