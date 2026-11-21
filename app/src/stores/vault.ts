import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  VaultInfo,
  RecentVault,
  FileNode,
  TrashItem,
  FileChangeEvent,
  WorkspaceConfig,
  SortOption,
} from '../types/vault';

export const useVaultStore = defineStore('vault', {
  state: () => ({
    currentVault: null as VaultInfo | null,
    recentVaults: [] as RecentVault[],
    fileTree: [] as FileNode[],
    activeFilePath: null as string | null,
    activeFileContent: '' as string,
    isSaving: false,
    saveStatus: 'Saved' as 'Saved' | 'Saving...' | 'Unsaved changes',
    collapsedFolders: new Set<string>(),
    sortBy: 'name-asc' as SortOption,
    searchQuery: '',
    trashItems: [] as TrashItem[],
    showTrashModal: false,
    showVaultSwitcher: false,
    watcherUnlisten: null as UnlistenFn | null,
    draggedItemPath: null as string | null,
    isLoading: false,
    errorMessage: null as string | null,
  }),

  getters: {
    hasActiveVault(): boolean {
      return !!this.currentVault;
    },

    allFilePaths(): string[] {
      const paths: string[] = [];
      const traverse = (nodes: FileNode[]) => {
        for (const n of nodes) {
          if (!n.is_dir) {
            paths.push(n.relative_path);
          }
          if (n.children) {
            traverse(n.children);
          }
        }
      };
      traverse(this.fileTree);
      return paths;
    },

    activeFileNode(): FileNode | null {
      if (!this.activeFilePath) return null;
      const findNode = (nodes: FileNode[]): FileNode | null => {
        for (const node of nodes) {
          if (node.relative_path === this.activeFilePath) return node;
          if (node.children) {
            const found = findNode(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      return findNode(this.fileTree);
    },

    sortedFileTree(): FileNode[] {
      const sortNodes = (nodes: FileNode[]): FileNode[] => {
        const sorted = [...nodes].sort((a, b) => {
          // Directories always first
          if (a.is_dir !== b.is_dir) {
            return a.is_dir ? -1 : 1;
          }
          switch (this.sortBy) {
            case 'name-asc':
              return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            case 'name-desc':
              return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
            case 'modified-desc':
              return b.modified_at - a.modified_at;
            case 'modified-asc':
              return a.modified_at - b.modified_at;
            default:
              return a.name.localeCompare(b.name);
          }
        });

        return sorted.map((node) => {
          if (node.children) {
            return { ...node, children: sortNodes(node.children) };
          }
          return node;
        });
      };

      const filterNodes = (nodes: FileNode[], query: string): FileNode[] => {
        if (!query.trim()) return nodes;
        const lower = query.toLowerCase();
        const result: FileNode[] = [];

        for (const node of nodes) {
          if (node.is_dir && node.children) {
            const matchingChildren = filterNodes(node.children, query);
            if (matchingChildren.length > 0 || node.name.toLowerCase().includes(lower)) {
              result.push({
                ...node,
                children: matchingChildren.length > 0 ? matchingChildren : node.children,
              });
            }
          } else if (node.name.toLowerCase().includes(lower)) {
            result.push(node);
          }
        }
        return result;
      };

      const sorted = sortNodes(this.fileTree);
      return filterNodes(sorted, this.searchQuery);
    },
  },

  actions: {
    async init() {
      try {
        this.isLoading = true;
        // 1. Fetch recents
        await this.loadRecentVaults();

        // 2. Try fetching current vault or open most recent
        const current = await invoke<VaultInfo | null>('vault_get_current');
        if (current) {
          await this.setupVault(current);
        } else if (this.recentVaults.length > 0) {
          await this.openVault(this.recentVaults[0].path);
        } else {
          // Prompt user or open default vault
          this.showVaultSwitcher = true;
        }

        // 3. Register live filesystem event listener
        await this.setupWatcherListener();
      } catch (err: any) {
        console.error('Failed to initialize vault store:', err);
        this.errorMessage = String(err);
      } finally {
        this.isLoading = false;
      }
    },

    async setupWatcherListener() {
      if (this.watcherUnlisten) {
        this.watcherUnlisten();
        this.watcherUnlisten = null;
      }

      try {
        this.watcherUnlisten = await listen<FileChangeEvent>('vault:file-changed', async (event) => {
          console.log('[Watcher Event]:', event.payload);
          const { event_type, relative_path } = event.payload;

          // Always refresh tree on external FS changes
          await this.refreshTree();

          // Handle active file updates
          if (this.activeFilePath && relative_path === this.activeFilePath) {
            if (event_type === 'delete') {
              this.activeFilePath = null;
              this.activeFileContent = '';
            } else if (event_type === 'modify') {
              // Reload content if modified externally
              try {
                const updated = await invoke<string>('vault_read_file', { relativePath: relative_path });
                this.activeFileContent = updated;
                this.saveStatus = 'Saved';
              } catch (e) {
                console.warn('Failed to reload modified file:', e);
              }
            }
          }
        });
      } catch (err) {
        console.warn('Could not attach watcher listener:', err);
      }
    },

    async loadRecentVaults() {
      try {
        this.recentVaults = await invoke<RecentVault[]>('vault_get_recents');
      } catch (err) {
        console.warn('Failed to load recent vaults:', err);
      }
    },

    async setupVault(info: VaultInfo) {
      this.currentVault = info;
      this.showVaultSwitcher = false;

      // Load workspace config
      try {
        const configStr = await invoke<string | null>('vault_read_config', {
          configName: 'workspace',
        });
        if (configStr) {
          const cfg = JSON.parse(configStr) as WorkspaceConfig;
          if (cfg.collapsed_folders) {
            this.collapsedFolders = new Set(cfg.collapsed_folders);
          }
          if (cfg.sort_by) {
            this.sortBy = cfg.sort_by;
          }
          if (cfg.active_file) {
            // Attempt to open last active note
            try {
              await this.openFile(cfg.active_file);
            } catch {
              // File might have been deleted, ignore
            }
          }
        }
      } catch (err) {
        console.warn('Could not read workspace.json:', err);
      }

      // Load tree
      await this.refreshTree();
      await this.loadRecentVaults();
    },

    async openVault(path?: string) {
      try {
        this.isLoading = true;
        this.errorMessage = null;
        const info = await invoke<VaultInfo>('vault_open', { path });
        await this.setupVault(info);
      } catch (err: any) {
        this.errorMessage = `Failed to open vault: ${err}`;
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async pickAndOpenVault() {
      try {
        const folderPath = await invoke<string | null>('vault_pick_folder');
        if (folderPath) {
          await this.openVault(folderPath);
        }
      } catch (err: any) {
        this.errorMessage = `Folder picker error: ${err}`;
      }
    },

    async createVault(name: string, parentPath?: string) {
      try {
        this.isLoading = true;
        const info = await invoke<VaultInfo>('vault_create', { name, parentPath });
        await this.setupVault(info);
      } catch (err: any) {
        this.errorMessage = `Failed to create vault: ${err}`;
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async removeRecentVault(path: string) {
      try {
        await invoke('vault_remove_recent', { path });
        await this.loadRecentVaults();
      } catch (err: any) {
        this.errorMessage = `Failed to remove recent vault: ${err}`;
      }
    },

    async refreshTree() {
      if (!this.currentVault) return;
      try {
        this.fileTree = await invoke<FileNode[]>('vault_list_tree');
      } catch (err: any) {
        console.warn('Failed to refresh tree:', err);
      }
    },

    async saveWorkspaceConfig() {
      if (!this.currentVault) return;
      const config: WorkspaceConfig = {
        collapsed_folders: Array.from(this.collapsedFolders),
        active_file: this.activeFilePath,
        sort_by: this.sortBy,
      };
      try {
        await invoke('vault_write_config', {
          configName: 'workspace',
          content: JSON.stringify(config, null, 2),
        });
      } catch (err) {
        console.warn('Failed to save workspace config:', err);
      }
    },

    toggleFolderCollapse(relativePath: string) {
      if (this.collapsedFolders.has(relativePath)) {
        this.collapsedFolders.delete(relativePath);
      } else {
        this.collapsedFolders.add(relativePath);
      }
      this.saveWorkspaceConfig();
    },

    setSortBy(sort: SortOption) {
      this.sortBy = sort;
      this.saveWorkspaceConfig();
    },

    async openFile(relativePath: string) {
      try {
        const content = await invoke<string>('vault_read_file', { relativePath });
        this.activeFilePath = relativePath;
        this.activeFileContent = content;
        this.saveStatus = 'Saved';
        this.saveWorkspaceConfig();
      } catch (err: any) {
        this.errorMessage = `Failed to open note ${relativePath}: ${err}`;
      }
    },

    async saveCurrentFile(content?: string) {
      if (!this.activeFilePath) return;
      const textToSave = content !== undefined ? content : this.activeFileContent;
      this.isSaving = true;
      this.saveStatus = 'Saving...';
      try {
        await invoke('vault_write_file', {
          relativePath: this.activeFilePath,
          content: textToSave,
        });
        this.saveStatus = 'Saved';
      } catch (err: any) {
        this.saveStatus = 'Unsaved changes';
        this.errorMessage = `Failed to save file: ${err}`;
      } finally {
        this.isSaving = false;
      }
    },

    async createFile(parentRelPath: string, name: string) {
      try {
        let cleanName = name.trim();
        if (!cleanName.endsWith('.md')) {
          cleanName += '.md';
        }
        const relPath = parentRelPath ? `${parentRelPath.replace(/\/$/, '')}/${cleanName}` : cleanName;
        await invoke<string>('vault_create_file', {
          relativePath: relPath,
          content: `# ${cleanName.replace(/\.md$/, '')}\n\n`,
        });
        await this.refreshTree();
        await this.openFile(relPath);
        return relPath;
      } catch (err: any) {
        this.errorMessage = `Failed to create file: ${err}`;
        throw err;
      }
    },

    async createFolder(parentRelPath: string, name: string) {
      try {
        const cleanName = name.trim();
        const relPath = parentRelPath ? `${parentRelPath.replace(/\/$/, '')}/${cleanName}` : cleanName;
        await invoke<string>('vault_create_folder', { relativePath: relPath });
        await this.refreshTree();
        // Expand parent and newly created folder
        this.collapsedFolders.delete(relPath);
        if (parentRelPath) this.collapsedFolders.delete(parentRelPath);
        this.saveWorkspaceConfig();
      } catch (err: any) {
        this.errorMessage = `Failed to create folder: ${err}`;
        throw err;
      }
    },

    async renameItem(oldRelativePath: string, newName: string) {
      try {
        const cleanName = newName.trim();
        if (!cleanName) return;

        // Keep parent folder path
        const parts = oldRelativePath.split('/');
        parts[parts.length - 1] = cleanName;
        const newRelativePath = parts.join('/');

        if (oldRelativePath === newRelativePath) return;

        await invoke('vault_rename', {
          oldRelativePath,
          newRelativePath,
        });

        // Update active file path if it was renamed
        if (this.activeFilePath === oldRelativePath) {
          this.activeFilePath = newRelativePath;
        } else if (this.activeFilePath?.startsWith(oldRelativePath + '/')) {
          this.activeFilePath = this.activeFilePath.replace(oldRelativePath + '/', newRelativePath + '/');
        }

        // Update collapsed folders set
        if (this.collapsedFolders.has(oldRelativePath)) {
          this.collapsedFolders.delete(oldRelativePath);
          this.collapsedFolders.add(newRelativePath);
        }

        await this.refreshTree();
        this.saveWorkspaceConfig();
      } catch (err: any) {
        this.errorMessage = `Failed to rename: ${err}`;
        throw err;
      }
    },

    async moveItem(sourceRelativePath: string, targetFolderRelativePath: string) {
      try {
        const newRelPath = await invoke<string>('vault_move', {
          sourceRelativePath,
          targetFolderRelativePath,
        });

        if (this.activeFilePath === sourceRelativePath) {
          this.activeFilePath = newRelPath;
        } else if (this.activeFilePath?.startsWith(sourceRelativePath + '/')) {
          this.activeFilePath = this.activeFilePath.replace(sourceRelativePath + '/', newRelPath + '/');
        }

        await this.refreshTree();
        this.saveWorkspaceConfig();
      } catch (err: any) {
        this.errorMessage = `Failed to move item: ${err}`;
        throw err;
      }
    },

    async deleteItem(relativePath: string) {
      try {
        await invoke('vault_delete', { relativePath });
        if (this.activeFilePath === relativePath || this.activeFilePath?.startsWith(relativePath + '/')) {
          this.activeFilePath = null;
          this.activeFileContent = '';
        }
        await this.refreshTree();
        this.saveWorkspaceConfig();
      } catch (err: any) {
        this.errorMessage = `Failed to delete item: ${err}`;
        throw err;
      }
    },

    async loadTrash() {
      try {
        this.trashItems = await invoke<TrashItem[]>('vault_list_trash');
      } catch (err: any) {
        this.errorMessage = `Failed to load trash: ${err}`;
      }
    },

    async restoreTrashItem(itemId: string) {
      try {
        const restoredPath = await invoke<string>('vault_restore_trash', { itemId });
        await this.loadTrash();
        await this.refreshTree();
        return restoredPath;
      } catch (err: any) {
        this.errorMessage = `Failed to restore item: ${err}`;
        throw err;
      }
    },

    async emptyTrash() {
      try {
        await invoke('vault_empty_trash');
        this.trashItems = [];
      } catch (err: any) {
        this.errorMessage = `Failed to empty trash: ${err}`;
        throw err;
      }
    },
  },
});
