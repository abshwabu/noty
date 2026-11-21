import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import type {
  WorkspaceLayout,
  WorkspaceNode,
  WorkspaceSplit,
  WorkspaceLeaf,
  WorkspaceTab,
  SidebarPanelId,
} from '../types/workspace';

export function findLeafInNode(node: WorkspaceNode, leafId: string): WorkspaceLeaf | null {
  if (node.type === 'leaf') {
    return node.id === leafId ? node : null;
  }
  for (const child of node.children) {
    const found = findLeafInNode(child, leafId);
    if (found) return found;
  }
  return null;
}

export function findParentSplitInNode(root: WorkspaceNode, targetId: string): { split: WorkspaceSplit; index: number } | null {
  if (root.type === 'leaf') return null;
  const idx = root.children.findIndex((c) => c.id === targetId);
  if (idx !== -1) {
    return { split: root, index: idx };
  }
  for (const child of root.children) {
    if (child.type === 'split') {
      const found = findParentSplitInNode(child, targetId);
      if (found) return found;
    }
  }
  return null;
}

function createDefaultTab(path: string = 'Welcome.md'): WorkspaceTab {
  const fileName = path.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
  return {
    id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    path,
    title: fileName,
    isPinned: false,
    previewMode: 'edit',
  };
}

function createDefaultLeaf(tabPath: string = 'Welcome.md'): WorkspaceLeaf {
  const initialTab = createDefaultTab(tabPath);
  return {
    id: `leaf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'leaf',
    tabs: [initialTab],
    activeTabId: initialTab.id,
    history: [tabPath],
    historyIndex: 0,
  };
}

function createDefaultLayout(): WorkspaceLayout {
  const leaf = createDefaultLeaf();
  return {
    leftSidebar: {
      collapsed: false,
      width: 260,
      activePanel: 'files',
      panels: ['files', 'search', 'bookmarks', 'tags'],
    },
    rightSidebar: {
      collapsed: false,
      width: 260,
      activePanel: 'outline',
      panels: ['outline', 'backlinks', 'outgoing', 'properties'],
    },
    root: leaf,
    activeLeafId: leaf.id,
  };
}

let saveDebounceTimer: any = null;

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    layout: createDefaultLayout(),
    isLoaded: false,
    showGraphView: false,
    draggedTabInfo: null as { leafId: string; tabId: string } | null,
    draggedPanelId: null as SidebarPanelId | null,
  }),

  getters: {
    activeLeaf(state): WorkspaceLeaf | null {
      return findLeafInNode(state.layout.root, state.layout.activeLeafId);
    },

    activeTab(): WorkspaceTab | null {
      const leaf = this.activeLeaf;
      if (!leaf) return null;
      return leaf.tabs.find((t) => t.id === leaf.activeTabId) || leaf.tabs[0] || null;
    },

    activeNotePath(): string | null {
      return this.activeTab?.path || null;
    },

    allOpenLeaves(state): WorkspaceLeaf[] {
      const leaves: WorkspaceLeaf[] = [];
      const traverse = (node: WorkspaceNode) => {
        if (node.type === 'leaf') {
          leaves.push(node);
        } else if (node.type === 'split') {
          node.children.forEach(traverse);
        }
      };
      traverse(state.layout.root);
      return leaves;
    },
  },

  actions: {
    findLeaf(node: WorkspaceNode, leafId: string): WorkspaceLeaf | null {
      return findLeafInNode(node, leafId);
    },

    findParentSplit(root: WorkspaceNode, targetId: string): { split: WorkspaceSplit; index: number } | null {
      return findParentSplitInNode(root, targetId);
    },

    async loadLayout() {
      try {
        const configStr = await invoke<string | null>('vault_read_config', {
          configName: 'workspace',
        });
        if (configStr) {
          const parsed = JSON.parse(configStr);
          if (parsed.root && parsed.left_sidebar && parsed.right_sidebar) {
            this.layout = {
              leftSidebar: parsed.left_sidebar,
              rightSidebar: parsed.right_sidebar,
              root: parsed.root,
              activeLeafId: parsed.active_leaf_id || '',
            };
            // Ensure valid activeLeafId
            const active = this.findLeaf(this.layout.root, this.layout.activeLeafId);
            if (!active) {
              const all = this.allOpenLeaves;
              if (all.length > 0) {
                this.layout.activeLeafId = all[0].id;
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load workspace layout, using default:', err);
      } finally {
        this.isLoaded = true;
      }
    },

    triggerAutoSave() {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(() => {
        this.saveLayout();
      }, 500);
    },

    async saveLayout() {
      const activePath = this.activeNotePath;
      const payload = {
        left_sidebar: this.layout.leftSidebar,
        right_sidebar: this.layout.rightSidebar,
        root: this.layout.root,
        active_leaf_id: this.layout.activeLeafId,
        active_file: activePath,
      };

      try {
        await invoke('vault_write_config', {
          configName: 'workspace',
          content: JSON.stringify(payload, null, 2),
        });
      } catch (err) {
        console.warn('Failed to save workspace layout:', err);
      }
    },

    setActiveLeaf(leafId: string) {
      this.layout.activeLeafId = leafId;
      this.triggerAutoSave();
    },

    setActiveTab(leafId: string, tabId: string) {
      const leaf = this.findLeaf(this.layout.root, leafId);
      if (leaf && leaf.tabs.some((t) => t.id === tabId)) {
        leaf.activeTabId = tabId;
        this.layout.activeLeafId = leafId;
        this.triggerAutoSave();
      }
    },

    openNote(path: string, options?: { newTab?: boolean; splitDirection?: 'horizontal' | 'vertical'; leafId?: string }) {
      const targetLeafId = options?.leafId || this.layout.activeLeafId;
      let leaf = this.findLeaf(this.layout.root, targetLeafId);

      if (!leaf) {
        const all = this.allOpenLeaves;
        if (all.length > 0) {
          leaf = all[0];
          this.layout.activeLeafId = leaf.id;
        } else {
          leaf = createDefaultLeaf(path);
          this.layout.root = leaf;
          this.layout.activeLeafId = leaf.id;
          this.triggerAutoSave();
          return;
        }
      }

      // Check if splitting is requested
      if (options?.splitDirection) {
        this.splitLeaf(leaf.id, options.splitDirection, false);
        const newLeaf = this.activeLeaf;
        if (newLeaf) {
          this.openNote(path, { leafId: newLeaf.id });
        }
        return;
      }

      // Check if file is already open in this leaf
      const existingTab = leaf.tabs.find((t) => t.path === path);
      if (existingTab && !options?.newTab) {
        leaf.activeTabId = existingTab.id;
        this.updateLeafHistory(leaf, path);
        this.syncLinkedLeaves(leaf, path);
        this.triggerAutoSave();
        return;
      }

      // If active tab is not pinned and newTab is not forced, reuse active unpinned tab
      const currentActiveTab = leaf.tabs.find((t) => t.id === leaf.activeTabId);
      if (currentActiveTab && !currentActiveTab.isPinned && !options?.newTab) {
        currentActiveTab.path = path;
        currentActiveTab.title = path.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
        this.updateLeafHistory(leaf, path);
        this.syncLinkedLeaves(leaf, path);
        this.triggerAutoSave();
        return;
      }

      // Create new tab
      const newTab = createDefaultTab(path);
      leaf.tabs.push(newTab);
      leaf.activeTabId = newTab.id;
      this.updateLeafHistory(leaf, path);
      this.syncLinkedLeaves(leaf, path);
      this.triggerAutoSave();
    },

    updateLeafHistory(leaf: WorkspaceLeaf, path: string) {
      if (leaf.history[leaf.historyIndex] === path) return;
      leaf.history = leaf.history.slice(0, leaf.historyIndex + 1);
      leaf.history.push(path);
      leaf.historyIndex = leaf.history.length - 1;
    },

    canGoBack(leafId: string): boolean {
      const leaf = this.findLeaf(this.layout.root, leafId);
      return !!leaf && leaf.historyIndex > 0;
    },

    canGoForward(leafId: string): boolean {
      const leaf = this.findLeaf(this.layout.root, leafId);
      return !!leaf && leaf.historyIndex < leaf.history.length - 1;
    },

    navigateBack(leafId: string) {
      const leaf = this.findLeaf(this.layout.root, leafId);
      if (!leaf || leaf.historyIndex <= 0) return;
      leaf.historyIndex--;
      const targetPath = leaf.history[leaf.historyIndex];
      const activeTab = leaf.tabs.find((t) => t.id === leaf.activeTabId);
      if (activeTab && !activeTab.isPinned) {
        activeTab.path = targetPath;
        activeTab.title = targetPath.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
      } else {
        this.openNote(targetPath, { leafId, newTab: true });
      }
      this.syncLinkedLeaves(leaf, targetPath);
      this.triggerAutoSave();
    },

    navigateForward(leafId: string) {
      const leaf = this.findLeaf(this.layout.root, leafId);
      if (!leaf || leaf.historyIndex >= leaf.history.length - 1) return;
      leaf.historyIndex++;
      const targetPath = leaf.history[leaf.historyIndex];
      const activeTab = leaf.tabs.find((t) => t.id === leaf.activeTabId);
      if (activeTab && !activeTab.isPinned) {
        activeTab.path = targetPath;
        activeTab.title = targetPath.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
      } else {
        this.openNote(targetPath, { leafId, newTab: true });
      }
      this.syncLinkedLeaves(leaf, targetPath);
      this.triggerAutoSave();
    },

    syncLinkedLeaves(sourceLeaf: WorkspaceLeaf, path: string) {
      if (!sourceLeaf.linkedLeafId) return;
      const linked = this.findLeaf(this.layout.root, sourceLeaf.linkedLeafId);
      if (linked) {
        const activeTab = linked.tabs.find((t) => t.id === linked.activeTabId);
        if (activeTab && !activeTab.isPinned) {
          activeTab.path = path;
          activeTab.title = path.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
        }
      }
    },

    linkLeaves(leafAId: string, leafBId: string) {
      const leafA = this.findLeaf(this.layout.root, leafAId);
      const leafB = this.findLeaf(this.layout.root, leafBId);
      if (leafA && leafB && leafAId !== leafBId) {
        leafA.linkedLeafId = leafBId;
        leafB.linkedLeafId = leafAId;
        this.triggerAutoSave();
      }
    },

    unlinkLeaf(leafId: string) {
      const leaf = this.findLeaf(this.layout.root, leafId);
      if (leaf?.linkedLeafId) {
        const other = this.findLeaf(this.layout.root, leaf.linkedLeafId);
        if (other) other.linkedLeafId = undefined;
        leaf.linkedLeafId = undefined;
        this.triggerAutoSave();
      }
    },

    closeTab(leafId: string, tabId: string) {
      const leaf = this.findLeaf(this.layout.root, leafId);
      if (!leaf) return;

      const tabIdx = leaf.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return;

      // Don't close pinned tabs without unpinning
      if (leaf.tabs[tabIdx].isPinned) return;

      leaf.tabs.splice(tabIdx, 1);

      if (leaf.tabs.length === 0) {
        // If leaf has no more tabs, close the leaf unless it's the very last leaf in workspace
        const all = this.allOpenLeaves;
        if (all.length > 1) {
          this.closeLeaf(leafId);
        } else {
          const freshTab = createDefaultTab('Untitled.md');
          leaf.tabs.push(freshTab);
          leaf.activeTabId = freshTab.id;
        }
      } else if (leaf.activeTabId === tabId) {
        const nextIdx = Math.min(tabIdx, leaf.tabs.length - 1);
        leaf.activeTabId = leaf.tabs[nextIdx].id;
      }

      this.triggerAutoSave();
    },

    closeOtherTabs(leafId: string, tabId: string) {
      const leaf = this.findLeaf(this.layout.root, leafId);
      if (!leaf) return;
      leaf.tabs = leaf.tabs.filter((t) => t.id === tabId || t.isPinned);
      leaf.activeTabId = tabId;
      this.triggerAutoSave();
    },

    closeTabsToRight(leafId: string, tabId: string) {
      const leaf = this.findLeaf(this.layout.root, leafId);
      if (!leaf) return;
      const idx = leaf.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return;
      leaf.tabs = leaf.tabs.filter((t, i) => i <= idx || t.isPinned);
      if (!leaf.tabs.some((t) => t.id === leaf.activeTabId)) {
        leaf.activeTabId = tabId;
      }
      this.triggerAutoSave();
    },

    closeAllTabs(leafId: string) {
      const leaf = this.findLeaf(this.layout.root, leafId);
      if (!leaf) return;
      leaf.tabs = leaf.tabs.filter((t) => t.isPinned);
      if (leaf.tabs.length === 0) {
        const all = this.allOpenLeaves;
        if (all.length > 1) {
          this.closeLeaf(leafId);
        } else {
          const freshTab = createDefaultTab('Untitled.md');
          leaf.tabs.push(freshTab);
          leaf.activeTabId = freshTab.id;
        }
      } else {
        leaf.activeTabId = leaf.tabs[0].id;
      }
      this.triggerAutoSave();
    },

    togglePinTab(leafId: string, tabId: string) {
      const leaf = this.findLeaf(this.layout.root, leafId);
      if (!leaf) return;
      const tab = leaf.tabs.find((t) => t.id === tabId);
      if (tab) {
        tab.isPinned = !tab.isPinned;
        // Pinned tabs move to front
        leaf.tabs.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return 0;
        });
        this.triggerAutoSave();
      }
    },

    splitLeaf(leafId: string, direction: 'horizontal' | 'vertical', copyActiveTab: boolean = true) {
      const leaf = this.findLeaf(this.layout.root, leafId);
      if (!leaf) return;

      const activeTab = leaf.tabs.find((t) => t.id === leaf.activeTabId);
      const notePath = copyActiveTab && activeTab ? activeTab.path : 'Welcome.md';
      const newLeaf = createDefaultLeaf(notePath);

      if (this.layout.root.id === leafId) {
        // Root itself is the leaf
        this.layout.root = {
          id: `split_${Date.now()}`,
          type: 'split',
          direction,
          children: [leaf, newLeaf],
          flexRatios: [1, 1],
        };
      } else {
        const parentInfo = this.findParentSplit(this.layout.root, leafId);
        if (parentInfo) {
          const { split, index } = parentInfo;
          if (split.direction === direction) {
            split.children.splice(index + 1, 0, newLeaf);
            split.flexRatios = split.children.map(() => 1);
          } else {
            const nestedSplit: WorkspaceSplit = {
              id: `split_${Date.now()}`,
              type: 'split',
              direction,
              children: [leaf, newLeaf],
              flexRatios: [1, 1],
            };
            split.children[index] = nestedSplit;
          }
        }
      }

      this.layout.activeLeafId = newLeaf.id;
      this.triggerAutoSave();
    },

    closeLeaf(leafId: string) {
      const all = this.allOpenLeaves;
      if (all.length <= 1) return; // Keep at least one leaf open

      const parentInfo = this.findParentSplit(this.layout.root, leafId);
      if (!parentInfo) return;

      const { split, index } = parentInfo;
      split.children.splice(index, 1);

      // Clean up split if only 1 child remains
      if (split.children.length === 1) {
        const remainingChild = split.children[0];
        if (this.layout.root.id === split.id) {
          this.layout.root = remainingChild;
        } else {
          const grandParent = this.findParentSplit(this.layout.root, split.id);
          if (grandParent) {
            grandParent.split.children[grandParent.index] = remainingChild;
          }
        }
      }

      // Switch active leaf if the closed one was active
      if (this.layout.activeLeafId === leafId) {
        const remainingLeaves = this.allOpenLeaves;
        if (remainingLeaves.length > 0) {
          this.layout.activeLeafId = remainingLeaves[0].id;
        }
      }

      this.triggerAutoSave();
    },

    moveTab(sourceLeafId: string, targetLeafId: string, tabId: string, targetIndex?: number) {
      const sourceLeaf = this.findLeaf(this.layout.root, sourceLeafId);
      const targetLeaf = this.findLeaf(this.layout.root, targetLeafId);
      if (!sourceLeaf || !targetLeaf) return;

      const tabIdx = sourceLeaf.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return;

      const [tab] = sourceLeaf.tabs.splice(tabIdx, 1);

      if (sourceLeafId === targetLeafId) {
        const dest = targetIndex !== undefined ? targetIndex : targetLeaf.tabs.length;
        sourceLeaf.tabs.splice(dest, 0, tab);
      } else {
        const dest = targetIndex !== undefined ? targetIndex : targetLeaf.tabs.length;
        targetLeaf.tabs.splice(dest, 0, tab);
        targetLeaf.activeTabId = tab.id;
        this.layout.activeLeafId = targetLeaf.id;

        if (sourceLeaf.tabs.length === 0) {
          this.closeLeaf(sourceLeafId);
        } else if (sourceLeaf.activeTabId === tabId) {
          sourceLeaf.activeTabId = sourceLeaf.tabs[Math.max(0, tabIdx - 1)].id;
        }
      }

      this.triggerAutoSave();
    },

    // Sidebar panel drag & drop between sidebars
    moveSidebarPanel(panelId: SidebarPanelId, targetSidebar: 'left' | 'right', targetIndex?: number) {
      const leftPanels = this.layout.leftSidebar.panels;
      const rightPanels = this.layout.rightSidebar.panels;

      // Remove from current sidebar
      const leftIdx = leftPanels.indexOf(panelId);
      if (leftIdx !== -1) leftPanels.splice(leftIdx, 1);
      const rightIdx = rightPanels.indexOf(panelId);
      if (rightIdx !== -1) rightPanels.splice(rightIdx, 1);

      const targetList = targetSidebar === 'left' ? leftPanels : rightPanels;
      const dest = targetIndex !== undefined ? targetIndex : targetList.length;
      targetList.splice(dest, 0, panelId);

      // Ensure active panels are valid
      if (!leftPanels.includes(this.layout.leftSidebar.activePanel) && leftPanels.length > 0) {
        this.layout.leftSidebar.activePanel = leftPanels[0];
      }
      if (!rightPanels.includes(this.layout.rightSidebar.activePanel) && rightPanels.length > 0) {
        this.layout.rightSidebar.activePanel = rightPanels[0];
      }

      // Activate the moved panel in target sidebar
      if (targetSidebar === 'left') {
        this.layout.leftSidebar.activePanel = panelId;
        this.layout.leftSidebar.collapsed = false;
      } else {
        this.layout.rightSidebar.activePanel = panelId;
        this.layout.rightSidebar.collapsed = false;
      }

      this.triggerAutoSave();
    },

    toggleLeftSidebar() {
      this.layout.leftSidebar.collapsed = !this.layout.leftSidebar.collapsed;
      this.triggerAutoSave();
    },

    toggleRightSidebar() {
      this.layout.rightSidebar.collapsed = !this.layout.rightSidebar.collapsed;
      this.triggerAutoSave();
    },

    setSidebarWidth(sidebar: 'left' | 'right', width: number) {
      const clamped = Math.max(180, Math.min(500, width));
      if (sidebar === 'left') {
        this.layout.leftSidebar.width = clamped;
      } else {
        this.layout.rightSidebar.width = clamped;
      }
      this.triggerAutoSave();
    },
  },
});
