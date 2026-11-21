import { mockIPC } from '@tauri-apps/api/mocks';
import type { FileNode, TrashItem, RecentVault, VaultInfo } from '../types/vault';

export function setupBrowserMockBackend() {
  if (typeof window === 'undefined' || (window as any).__TAURI_INTERNALS__) {
    return;
  }

  console.info('[Noty] Browser development mode detected: initializing mock vault backend');

  let currentVault: VaultInfo = {
    name: 'Obsidian Notes',
    path: '/home/user/Documents/Obsidian Notes',
    has_obsidian: true,
    obsidian_hints: {
      attachment_folder: 'attachments',
      new_file_location: 'notes',
      theme: 'dark',
    },
  };

  const recentVaults: RecentVault[] = [
    {
      name: 'Obsidian Notes',
      path: '/home/user/Documents/Obsidian Notes',
      last_opened: Math.floor(Date.now() / 1000) - 120,
    },
    {
      name: 'Work Vault',
      path: '/home/user/Documents/Work Vault',
      last_opened: Math.floor(Date.now() / 1000) - 86400 * 2,
    },
  ];

  const filesMap = new Map<string, string>([
    [
      'Welcome.md',
      '# Welcome to Noty 🚀\n\nNoty is an offline-first Obsidian-compatible markdown notes app built with **Tauri 2 + Vue 3**.\n\n### Key Features:\n- **Vault System**: Works with standard `.md` files and attachments.\n- **Obsidian Compatibility**: Discovers `.obsidian` configurations, attachment folders, and themes.\n- **Atomic Writes**: Safe temp-file writes preserving UTF-8 and line endings (LF/CRLF).\n- **Restorable Trash**: Items moved to `.trash` can be restored to their original paths.\n- **Drag & Drop**: Easily rearrange notes and folders in the sidebar.\n',
    ],
    [
      'Obsidian Import.md',
      '# Obsidian Vault Import\n\nExisting Obsidian vaults work natively without file conversions.\n\n- Detected attachment folder: `attachments`\n- Detected theme: `dark`\n',
    ],
    [
      'Projects/Noty.md',
      '# Noty Architecture\n\n- Rust backend with `notify` filesystem watcher\n- Pinia store managing file tree and workspace configuration\n- CodeMirror 6 markdown editor\n',
    ],
    [
      'Projects/Tauri 2.md',
      '# Tauri 2 Features\n\n- Multiplatform support (Linux + Android)\n- Secure IPC and permissions\n- Minimal binary size footprint\n',
    ],
  ]);

  let trashItems: TrashItem[] = [
    {
      id: 'trash_1',
      original_relative_path: 'Old Draft.md',
      trash_filename: '1732178000_Old Draft.md',
      deleted_at: Math.floor(Date.now() / 1000) - 3600,
      is_dir: false,
      size: 142,
    },
  ];

  let workspaceConfig: any = {
    collapsed_folders: [],
    active_file: 'Welcome.md',
    sort_by: 'name-asc',
  };

  mockIPC((cmd, args: any) => {
    switch (cmd) {
      case 'vault_get_current':
        return currentVault;

      case 'vault_get_recents':
        return recentVaults;

      case 'vault_remove_recent': {
        const idx = recentVaults.findIndex((v) => v.path === args.path);
        if (idx !== -1) recentVaults.splice(idx, 1);
        return null;
      }

      case 'vault_pick_folder':
        return '/home/user/Documents/My New Vault';

      case 'vault_open': {
        const path = args.path || '/home/user/Documents/Default Vault';
        const name = path.split('/').pop() || 'Vault';
        currentVault = {
          name,
          path,
          has_obsidian: path.includes('Obsidian'),
          obsidian_hints: path.includes('Obsidian')
            ? { attachment_folder: 'attachments', theme: 'dark' }
            : undefined,
        };
        return currentVault;
      }

      case 'vault_create': {
        const name = args.name;
        currentVault = {
          name,
          path: `/home/user/Documents/${name}`,
          has_obsidian: false,
        };
        recentVaults.unshift({
          name,
          path: currentVault.path,
          last_opened: Math.floor(Date.now() / 1000),
        });
        return currentVault;
      }

      case 'vault_list_tree': {
        const rootNodes: FileNode[] = [];
        const dirMap = new Map<string, FileNode>();

        // Build directories
        for (const filePath of filesMap.keys()) {
          const parts = filePath.split('/');
          let currentPath = '';

          for (let i = 0; i < parts.length - 1; i++) {
            const folderName = parts[i];
            const prevPath = currentPath;
            currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;

            if (!dirMap.has(currentPath)) {
              const folderNode: FileNode = {
                id: currentPath,
                name: folderName,
                path: `${currentVault.path}/${currentPath}`,
                relative_path: currentPath,
                is_dir: true,
                size: 0,
                modified_at: Date.now() / 1000,
                children: [],
              };
              dirMap.set(currentPath, folderNode);

              if (prevPath && dirMap.has(prevPath)) {
                dirMap.get(prevPath)!.children!.push(folderNode);
              } else if (!prevPath) {
                rootNodes.push(folderNode);
              }
            }
          }

          // File node
          const fileName = parts[parts.length - 1];
          const fileNode: FileNode = {
            id: filePath,
            name: fileName,
            path: `${currentVault.path}/${filePath}`,
            relative_path: filePath,
            is_dir: false,
            extension: fileName.split('.').pop(),
            size: (filesMap.get(filePath) || '').length,
            modified_at: Date.now() / 1000,
          };

          if (parts.length > 1) {
            const parentPath = parts.slice(0, -1).join('/');
            dirMap.get(parentPath)?.children?.push(fileNode);
          } else {
            rootNodes.push(fileNode);
          }
        }

        return rootNodes;
      }

      case 'vault_read_file': {
        const content = filesMap.get(args.relativePath);
        if (content !== undefined) return content;
        return '# Untitled Note\n';
      }

      case 'vault_write_file': {
        filesMap.set(args.relativePath, args.content);
        return true;
      }

      case 'vault_create_file': {
        filesMap.set(args.relativePath, args.content || '');
        return args.relativePath;
      }

      case 'vault_create_folder': {
        // Mock folder creation
        filesMap.set(`${args.relativePath}/.placeholder`, '');
        return args.relativePath;
      }

      case 'vault_rename': {
        const content = filesMap.get(args.oldRelativePath);
        if (content !== undefined) {
          filesMap.delete(args.oldRelativePath);
          filesMap.set(args.newRelativePath, content);
        }
        return true;
      }

      case 'vault_move': {
        const content = filesMap.get(args.sourceRelativePath);
        const fileName = args.sourceRelativePath.split('/').pop() || '';
        const newRel = args.targetFolderRelativePath
          ? `${args.targetFolderRelativePath}/${fileName}`
          : fileName;

        if (content !== undefined) {
          filesMap.delete(args.sourceRelativePath);
          filesMap.set(newRel, content);
        }
        return newRel;
      }

      case 'vault_delete': {
        const content = filesMap.get(args.relativePath) || '';
        filesMap.delete(args.relativePath);
        const trashItem: TrashItem = {
          id: `trash_${Date.now()}`,
          original_relative_path: args.relativePath,
          trash_filename: `${Date.now()}_${args.relativePath.split('/').pop()}`,
          deleted_at: Math.floor(Date.now() / 1000),
          is_dir: false,
          size: content.length,
        };
        trashItems.push(trashItem);
        return trashItem;
      }

      case 'vault_list_trash':
        return trashItems;

      case 'vault_restore_trash': {
        const idx = trashItems.findIndex((t) => t.id === args.itemId);
        if (idx !== -1) {
          const item = trashItems.splice(idx, 1)[0];
          filesMap.set(item.original_relative_path, '# Restored Note\n');
          return item.original_relative_path;
        }
        return 'restored.md';
      }

      case 'vault_empty_trash':
        trashItems = [];
        return true;

      case 'vault_read_config':
        return JSON.stringify(workspaceConfig);

      case 'vault_write_config':
        try {
          workspaceConfig = JSON.parse(args.content);
        } catch {}
        return true;

      case 'vault_list_snippets':
        return ['translucent-ui', 'custom-accents'];

      case 'vault_read_snippet':
        if (args.snippetName.includes('translucent')) {
          return '/* Translucent sidebar snippet */\n.workspace-ribbon, .sidebar-container { backdrop-filter: blur(8px); }';
        }
        return '/* Custom Accent Snippet */\n:root { --interactive-accent: #8b5cf6; }';

      case 'vault_write_snippet':
        return true;

      case 'vault_open_popout':
        if (typeof window !== 'undefined') {
          window.open(window.location.href, '_blank', 'width=800,height=600');
        }
        return true;

      default:
        console.warn('[Mock IPC] Unhandled command:', cmd, args);
        return null;
    }
  }, { shouldMockEvents: true });
}
