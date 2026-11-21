export type SidebarPanelId =
  | 'files'
  | 'search'
  | 'bookmarks'
  | 'tags'
  | 'outline'
  | 'backlinks'
  | 'outgoing'
  | 'properties';

export interface SidebarState {
  collapsed: boolean;
  width: number;
  activePanel: SidebarPanelId;
  panels: SidebarPanelId[];
}

export interface WorkspaceTab {
  id: string;
  path: string;
  title: string;
  isPinned: boolean;
  previewMode?: 'edit' | 'reading';
}

export interface WorkspaceLeaf {
  id: string;
  type: 'leaf';
  tabs: WorkspaceTab[];
  activeTabId: string;
  history: string[];
  historyIndex: number;
  linkedLeafId?: string;
}

export interface WorkspaceSplit {
  id: string;
  type: 'split';
  direction: 'horizontal' | 'vertical';
  children: (WorkspaceSplit | WorkspaceLeaf)[];
  flexRatios: number[];
}

export type WorkspaceNode = WorkspaceSplit | WorkspaceLeaf;

export interface WorkspaceLayout {
  leftSidebar: SidebarState;
  rightSidebar: SidebarState;
  root: WorkspaceNode;
  activeLeafId: string;
}

export interface EditorSettings {
  defaultViewMode: 'edit' | 'reading';
  lineNumbers: boolean;
  readableLineLength: boolean;
  autoPairBrackets: boolean;
  spellcheck: boolean;
  fontSize: number;
  tabSize: number;
}

export interface FilesLinksSettings {
  newFileLocation: 'root' | 'current' | 'folder';
  newFileFolder: string;
  attachmentFolderPath: string;
  confirmDelete: boolean;
}

export interface AppearanceSettings {
  baseTheme: 'dark' | 'light' | 'system';
  accentColor: string;
  fontInterface: string;
  fontText: string;
  fontMonospace: string;
  zoomLevel: number;
  enabledSnippets: string[];
}

export interface HotkeyItem {
  id: string;
  name: string;
  keys: string;
  defaultKeys: string;
}

export interface CorePluginItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface AppSettings {
  editor: EditorSettings;
  files: FilesLinksSettings;
  appearance: AppearanceSettings;
  hotkeys: HotkeyItem[];
  plugins: CorePluginItem[];
}
