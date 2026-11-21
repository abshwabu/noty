export interface ObsidianHints {
  attachment_folder?: string;
  new_file_location?: string;
  theme?: string;
}

export interface VaultInfo {
  name: string;
  path: string;
  has_obsidian: boolean;
  obsidian_hints?: ObsidianHints;
}

export interface RecentVault {
  path: string;
  name: string;
  last_opened: number;
}

export interface FileNode {
  id: string;
  name: string;
  path: string;
  relative_path: string;
  is_dir: boolean;
  extension?: string;
  size: number;
  modified_at: number;
  children?: FileNode[];
}

export interface TrashItem {
  id: string;
  original_relative_path: string;
  trash_filename: string;
  deleted_at: number;
  is_dir: boolean;
  size: number;
}

export interface FileChangeEvent {
  event_type: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  relative_path: string;
  is_dir: boolean;
}

export interface WorkspaceConfig {
  collapsed_folders: string[];
  active_file: string | null;
  sort_by: SortOption;
}

export type SortOption = 'name-asc' | 'name-desc' | 'modified-desc' | 'modified-asc';
