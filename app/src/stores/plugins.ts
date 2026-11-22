import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import type {
  CorePluginDefinition,
  DailyNotesSettings,
  TemplatesSettings,
  FileRecoverySettings,
  ZkPrefixerSettings,
} from '../types/plugins';

const defaultPluginDefinitions: CorePluginDefinition[] = [
  { id: 'file-explorer', name: 'File explorer', description: 'See and manage the files and folders in your vault.', enabled: true },
  { id: 'search', name: 'Search', description: 'Search for keywords and phrases throughout your notes.', enabled: true },
  { id: 'quick-switcher', name: 'Quick switcher', description: 'Quickly search for and open notes.', enabled: true },
  { id: 'graph', name: 'Graph view', description: 'Visualize relationships between your notes.', enabled: true },
  { id: 'backlinks', name: 'Backlinks', description: 'Show incoming links to the current note from other files.', enabled: true },
  { id: 'outgoing-links', name: 'Outgoing links', description: 'Show all outgoing links from the active note.', enabled: true },
  { id: 'outline', name: 'Outline', description: 'Display the heading structure of the active note.', enabled: true },
  { id: 'properties', name: 'Properties', description: 'View and edit document frontmatter YAML properties.', enabled: true },
  { id: 'daily-notes', name: 'Daily notes', description: 'Create or open today\'s daily note, with calendar picker.', enabled: true, hasSettings: true },
  { id: 'templates', name: 'Templates', description: 'Insert pre-defined templates with variable substitution.', enabled: true, hasSettings: true },
  { id: 'slash-commands', name: 'Slash commands', description: 'Trigger formatting blocks and actions by typing "/" in editor.', enabled: true },
  { id: 'bookmarks', name: 'Bookmarks', description: 'Bookmark notes, searches, headings, and groups.', enabled: true },
  { id: 'canvas', name: 'Canvas', description: 'Infinite visual whiteboard with cards, connections, and groups.', enabled: true },
  { id: 'bases', name: 'Bases (Database views)', description: 'Interactive property-driven table view of vault notes.', enabled: true },
  { id: 'note-composer', name: 'Note composer', description: 'Merge notes and extract selections to new notes.', enabled: true },
  { id: 'random-note', name: 'Random note', description: 'Open a random note from your vault.', enabled: true },
  { id: 'word-count', name: 'Word count', description: 'Display word and character counts in status bar and details.', enabled: true },
  { id: 'file-recovery', name: 'File recovery', description: 'Periodic snapshots and one-click version diff restore.', enabled: true, hasSettings: true },
  { id: 'format-converter', name: 'Format converter', description: 'Convert between Markdown links and wikilinks.', enabled: true },
  { id: 'zk-prefixer', name: 'Zettelkasten prefixer', description: 'Create unique timestamp-prefixed atomic notes.', enabled: true, hasSettings: true },
  { id: 'export-pdf-html', name: 'Export', description: 'Export notes to styled HTML or PDF.', enabled: true },
];

export const usePluginsStore = defineStore('plugins', {
  state: () => ({
    plugins: defaultPluginDefinitions.map((p) => ({ ...p })),
    dailyNotes: {
      folder: '',
      format: 'YYYY-MM-DD',
      template: '',
      openOnStartup: false,
    } as DailyNotesSettings,
    templates: {
      folder: 'templates',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm',
    } as TemplatesSettings,
    fileRecovery: {
      intervalMinutes: 5,
      historyDurationDays: 7,
    } as FileRecoverySettings,
    zkPrefixer: {
      folder: '',
      format: 'YYYYMMDDHHmm',
      template: '',
    } as ZkPrefixerSettings,
    isLoaded: false,
  }),

  getters: {
    isEnabled: (state) => (id: string): boolean => {
      const p = state.plugins.find((item) => item.id === id);
      return p ? p.enabled : false;
    },
  },

  actions: {
    togglePlugin(id: string) {
      const p = this.plugins.find((item) => item.id === id);
      if (p) {
        p.enabled = !p.enabled;
        this.savePluginsConfig();
      }
    },

    setPluginEnabled(id: string, enabled: boolean) {
      const p = this.plugins.find((item) => item.id === id);
      if (p && p.enabled !== enabled) {
        p.enabled = enabled;
        this.savePluginsConfig();
      }
    },

    async loadPluginsConfig() {
      // 1. Load enabled states from .noty/plugins.json or .obsidian/core-plugins.json
      try {
        let raw = await invoke<string | null>('vault_read_config', { configName: 'plugins' });
        if (!raw) {
          raw = await invoke<string | null>('vault_read_config', { configName: 'core-plugins' });
        }
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Obsidian list of enabled plugin IDs
            const enabledSet = new Set(parsed);
            for (const p of this.plugins) {
              if (enabledSet.has(p.id)) {
                p.enabled = true;
              }
            }
          } else if (typeof parsed === 'object') {
            for (const [id, enabled] of Object.entries(parsed)) {
              const p = this.plugins.find((item) => item.id === id);
              if (p) {
                p.enabled = Boolean(enabled);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load plugins config:', err);
      }

      // 2. Load daily-notes.json
      try {
        const rawDn = await invoke<string | null>('vault_read_config', { configName: 'daily-notes' });
        if (rawDn) {
          const parsed = JSON.parse(rawDn);
          this.dailyNotes = { ...this.dailyNotes, ...parsed };
        }
      } catch (err) {
        console.warn('Failed to load daily-notes config:', err);
      }

      // 3. Load templates.json
      try {
        const rawTpl = await invoke<string | null>('vault_read_config', { configName: 'templates' });
        if (rawTpl) {
          const parsed = JSON.parse(rawTpl);
          this.templates = { ...this.templates, ...parsed };
        }
      } catch (err) {
        console.warn('Failed to load templates config:', err);
      }

      // 4. Load zk-prefixer.json
      try {
        const rawZk = await invoke<string | null>('vault_read_config', { configName: 'zk-prefixer' });
        if (rawZk) {
          const parsed = JSON.parse(rawZk);
          this.zkPrefixer = { ...this.zkPrefixer, ...parsed };
        }
      } catch (err) {
        console.warn('Failed to load zk-prefixer config:', err);
      }

      this.isLoaded = true;
    },

    async savePluginsConfig() {
      try {
        const mapping: Record<string, boolean> = {};
        for (const p of this.plugins) {
          mapping[p.id] = p.enabled;
        }
        await invoke('vault_write_config', {
          configName: 'plugins',
          content: JSON.stringify(mapping, null, 2),
        });
      } catch (err) {
        console.warn('Failed to save plugins config:', err);
      }
    },

    async saveDailyNotesConfig() {
      try {
        await invoke('vault_write_config', {
          configName: 'daily-notes',
          content: JSON.stringify(this.dailyNotes, null, 2),
        });
      } catch (err) {
        console.warn('Failed to save daily-notes config:', err);
      }
    },

    async saveTemplatesConfig() {
      try {
        await invoke('vault_write_config', {
          configName: 'templates',
          content: JSON.stringify(this.templates, null, 2),
        });
      } catch (err) {
        console.warn('Failed to save templates config:', err);
      }
    },

    async saveZkPrefixerConfig() {
      try {
        await invoke('vault_write_config', {
          configName: 'zk-prefixer',
          content: JSON.stringify(this.zkPrefixer, null, 2),
        });
      } catch (err) {
        console.warn('Failed to save zk-prefixer config:', err);
      }
    },
  },
});
