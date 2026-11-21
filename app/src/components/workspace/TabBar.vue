<script setup lang="ts">
import { ref } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import type { WorkspaceLeaf, WorkspaceTab } from '../../types/workspace';
import TabContextMenu from '../TabContextMenu.vue';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MoreVertical,
  Pin,
  X,
  FileText,
  SplitSquareVertical,
  SplitSquareHorizontal,
  Link2,
} from 'lucide-vue-next';

const props = defineProps<{
  leaf: WorkspaceLeaf;
}>();

const workspace = useWorkspaceStore();

const showPaneMenu = ref(false);

const contextMenuState = ref<{
  show: boolean;
  x: number;
  y: number;
  tab: WorkspaceTab | null;
}>({
  show: false,
  x: 0,
  y: 0,
  tab: null,
});

function handleTabClick(tab: WorkspaceTab) {
  props.leaf.activeTabId = tab.id;
  workspace.setActiveLeaf(props.leaf.id);
  workspace.syncLinkedLeaves(props.leaf, tab.path);
}

function handleTabClose(tab: WorkspaceTab, e: MouseEvent) {
  e.stopPropagation();
  workspace.closeTab(props.leaf.id, tab.id);
}

function handleTabContextMenu(tab: WorkspaceTab, e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  contextMenuState.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    tab,
  };
}

function handleTabAction(action: string) {
  const tab = contextMenuState.value.tab;
  if (!tab) return;

  switch (action) {
    case 'close':
      workspace.closeTab(props.leaf.id, tab.id);
      break;
    case 'close-others':
      workspace.closeOtherTabs(props.leaf.id, tab.id);
      break;
    case 'close-right':
      workspace.closeTabsToRight(props.leaf.id, tab.id);
      break;
    case 'close-all':
      workspace.closeAllTabs(props.leaf.id);
      break;
    case 'toggle-pin':
      workspace.togglePinTab(props.leaf.id, tab.id);
      break;
    case 'split-right':
      workspace.splitLeaf(props.leaf.id, 'horizontal', true);
      break;
    case 'split-down':
      workspace.splitLeaf(props.leaf.id, 'vertical', true);
      break;
    case 'popout':
      if (typeof window !== 'undefined') {
        window.open(window.location.href, '_blank', 'width=800,height=600');
      }
      break;
    case 'copy-path':
      navigator.clipboard.writeText(tab.path);
      break;
    case 'link': {
      // Find other leaves to link with
      const otherLeaves = workspace.allOpenLeaves.filter((l) => l.id !== props.leaf.id);
      if (otherLeaves.length > 0) {
        workspace.linkLeaves(props.leaf.id, otherLeaves[0].id);
      }
      break;
    }
  }
}

function handleNewTab() {
  workspace.openNote('Untitled Note.md', { leafId: props.leaf.id, newTab: true });
}

// Drag & Drop
const isDragOver = ref(false);

function handleDragStart(tab: WorkspaceTab, e: DragEvent) {
  workspace.draggedTabInfo = { leafId: props.leaf.id, tabId: tab.id };
  e.dataTransfer?.setData('text/plain', tab.id);
  e.dataTransfer!.effectAllowed = 'move';
}

function handleDragOver(e: DragEvent) {
  if (!workspace.draggedTabInfo) return;
  e.preventDefault();
  isDragOver.value = true;
  e.dataTransfer!.dropEffect = 'move';
}

function handleDragLeave() {
  isDragOver.value = false;
}

function handleDrop(targetIndex?: number) {
  isDragOver.value = false;
  if (workspace.draggedTabInfo) {
    const { leafId, tabId } = workspace.draggedTabInfo;
    workspace.moveTab(leafId, props.leaf.id, tabId, targetIndex);
    workspace.draggedTabInfo = null;
  }
}
</script>

<template>
  <div
    class="workspace-tab-header h-10 px-2 bg-[var(--background-secondary-alt)] border-b border-[var(--background-modifier-border)] flex items-center justify-between gap-1 select-none shrink-0"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop()"
  >
    <!-- Left Navigation buttons: Back / Forward -->
    <div class="flex items-center gap-0.5 shrink-0 pr-1">
      <button
        @click="workspace.navigateBack(leaf.id)"
        :disabled="!workspace.canGoBack(leaf.id)"
        class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] disabled:opacity-30 disabled:hover:bg-transparent"
        title="Back"
      >
        <ChevronLeft class="w-3.5 h-3.5" />
      </button>
      <button
        @click="workspace.navigateForward(leaf.id)"
        :disabled="!workspace.canGoForward(leaf.id)"
        class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] disabled:opacity-30 disabled:hover:bg-transparent"
        title="Forward"
      >
        <ChevronRight class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Tab Strip -->
    <div class="flex items-center gap-1 flex-1 overflow-x-auto min-w-0 h-full py-1">
      <div
        v-for="(tab, index) in leaf.tabs"
        :key="tab.id"
        draggable="true"
        @dragstart="(e) => handleDragStart(tab, e)"
        @dragover.stop="handleDragOver"
        @drop.stop="handleDrop(index)"
        @click="handleTabClick(tab)"
        @contextmenu="(e) => handleTabContextMenu(tab, e)"
        class="group relative flex items-center gap-1.5 px-3 py-1 rounded-t text-xs cursor-pointer transition-all border-t-2 shrink-0 max-w-48"
        :class="[
          tab.id === leaf.activeTabId
            ? 'bg-[var(--tab-background-active)] text-[var(--text-normal)] border-[var(--interactive-accent)] font-medium shadow-xs'
            : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] border-transparent',
        ]"
        :title="tab.path"
      >
        <!-- Pin Icon -->
        <Pin v-if="tab.isPinned" class="w-3 h-3 text-[var(--text-accent)] shrink-0" />
        <FileText v-else class="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />

        <!-- Title -->
        <span class="truncate">{{ tab.title }}</span>

        <!-- Close Button (only if unpinned) -->
        <button
          v-if="!tab.isPinned"
          @click="(e) => handleTabClose(tab, e)"
          class="p-0.5 rounded-full hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-normal)] opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0"
          title="Close tab (Ctrl+W)"
        >
          <X class="w-3 h-3" />
        </button>
      </div>

      <!-- New Tab '+' Button -->
      <button
        @click="handleNewTab"
        class="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] shrink-0"
        title="New tab (Ctrl+N)"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Right Pane Actions Menu -->
    <div class="flex items-center gap-1 shrink-0 relative">
      <!-- Linked pane indicator -->
      <span
        v-if="leaf.linkedLeafId"
        class="p-1 text-[var(--text-accent)]"
        title="Linked with another pane"
      >
        <Link2 class="w-3.5 h-3.5" />
      </span>

      <button
        @click="showPaneMenu = !showPaneMenu"
        class="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
        title="Pane actions"
      >
        <MoreVertical class="w-3.5 h-3.5" />
      </button>

      <!-- Pane Actions Dropdown -->
      <div
        v-if="showPaneMenu"
        class="absolute right-0 top-8 z-40 w-48 bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded-md shadow-2xl py-1 text-xs text-[var(--text-normal)]"
        @click="showPaneMenu = false"
      >
        <div
          @click="workspace.splitLeaf(leaf.id, 'horizontal', true)"
          class="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
        >
          <SplitSquareVertical class="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span>Split right</span>
        </div>
        <div
          @click="workspace.splitLeaf(leaf.id, 'vertical', true)"
          class="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
        >
          <SplitSquareHorizontal class="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span>Split down</span>
        </div>
        <div
          @click="workspace.closeLeaf(leaf.id)"
          class="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer text-red-400"
        >
          <X class="w-3.5 h-3.5" />
          <span>Close pane</span>
        </div>
      </div>
    </div>

    <!-- Tab Context Menu -->
    <TabContextMenu
      v-if="contextMenuState.show"
      :x="contextMenuState.x"
      :y="contextMenuState.y"
      :leaf-id="leaf.id"
      :tab-id="contextMenuState.tab?.id || ''"
      :is-pinned="contextMenuState.tab?.isPinned || false"
      :path="contextMenuState.tab?.path || ''"
      @action="handleTabAction"
      @close="contextMenuState.show = false"
    />
  </div>
</template>
