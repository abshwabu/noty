import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import type { BookmarkItem } from '../types/bookmarks';

export const useBookmarksStore = defineStore('bookmarks', {
  state: () => ({
    items: [
      {
        id: 'bm-welcome',
        type: 'file',
        path: 'Welcome.md',
        title: 'Welcome',
      },
      {
        id: 'bm-import',
        type: 'file',
        path: 'Obsidian Import.md',
        title: 'Obsidian Import',
      },
      {
        id: 'bm-search-todo',
        type: 'search',
        query: 'task-todo:',
        title: 'Pending Tasks',
      },
    ] as BookmarkItem[],
    isLoaded: false,
  }),

  getters: {
    isBookmarked: (state) => (path: string): boolean => {
      const checkItem = (item: BookmarkItem): boolean => {
        if (item.type === 'file' && item.path === path) return true;
        if (item.items) return item.items.some(checkItem);
        return false;
      };
      return state.items.some(checkItem);
    },
  },

  actions: {
    async loadBookmarks() {
      try {
        let raw = await invoke<string | null>('vault_read_config', { configName: 'bookmarks' });
        if (!raw) {
          // Check obsidian bookmarks.json
          try {
            raw = await invoke<string | null>('vault_read_file', { relativePath: '.obsidian/bookmarks.json' });
          } catch {}
        }
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.items)) {
            this.items = parsed.items;
          }
        }
      } catch (err) {
        console.warn('Failed to load bookmarks config:', err);
      } finally {
        this.isLoaded = true;
      }
    },

    async saveBookmarks() {
      try {
        await invoke('vault_write_config', {
          configName: 'bookmarks',
          content: JSON.stringify({ items: this.items }, null, 2),
        });
      } catch (err) {
        console.warn('Failed to save bookmarks:', err);
      }
    },

    addFileBookmark(path: string, customTitle?: string) {
      if (this.isBookmarked(path)) return;
      const title = customTitle || path.split('/').pop()?.replace(/\.md$/, '') || path;
      this.items.push({
        id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'file',
        path,
        title,
      });
      this.saveBookmarks();
    },

    addSearchBookmark(query: string, customTitle?: string) {
      const title = customTitle || `Search: ${query}`;
      this.items.push({
        id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'search',
        query,
        title,
      });
      this.saveBookmarks();
    },

    addHeadingBookmark(path: string, heading: string) {
      const subpath = heading.startsWith('#') ? heading : `#${heading}`;
      this.items.push({
        id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'heading',
        path,
        subpath,
        title: `${path.split('/').pop()?.replace(/\.md$/, '')} > ${heading.replace(/^#+\s*/, '')}`,
      });
      this.saveBookmarks();
    },

    addGroup(groupTitle: string) {
      this.items.push({
        id: `bm-grp-${Date.now()}`,
        type: 'group',
        title: groupTitle || 'New Bookmark Group',
        items: [],
      });
      this.saveBookmarks();
    },

    removeBookmark(id: string) {
      const removeRecursive = (list: BookmarkItem[]): boolean => {
        const idx = list.findIndex((b) => b.id === id);
        if (idx !== -1) {
          list.splice(idx, 1);
          return true;
        }
        for (const item of list) {
          if (item.items && removeRecursive(item.items)) {
            return true;
          }
        }
        return false;
      };

      removeRecursive(this.items);
      this.saveBookmarks();
    },

    toggleFileBookmark(path: string) {
      if (this.isBookmarked(path)) {
        // Find and remove
        const item = this.items.find((i) => i.type === 'file' && i.path === path);
        if (item) {
          this.removeBookmark(item.id);
        }
      } else {
        this.addFileBookmark(path);
      }
    },
  },
});
