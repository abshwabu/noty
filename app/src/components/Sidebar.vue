<script setup lang="ts">
import { ref, computed } from 'vue';
import { useWorkspaceStore } from '../stores/workspace';
import type { SidebarPanelId } from '../types/workspace';
import FileExplorer from './FileExplorer.vue';
import SearchPanel from './panels/SearchPanel.vue';
import BookmarksPanel from './panels/BookmarksPanel.vue';
import TagsPanel from './panels/TagsPanel.vue';
import OutlinePanel from './panels/OutlinePanel.vue';
import BacklinksPanel from './panels/BacklinksPanel.vue';
import OutgoingLinksPanel from './panels/OutgoingLinksPanel.vue';
import PropertiesPanel from './panels/PropertiesPanel.vue';
import {
  Folder,
  Search,
  Bookmark,
  Tag,
  ListTree,
  Link2,
  ExternalLink,
  SlidersHorizontal,
  PanelLeftClose,
  PanelRightClose,
} from 'lucide-vue-next';

const props = defineProps<{
  side: 'left' | 'right';
}>();

const workspace = useWorkspaceStore();

const sidebarState = computed(() => {
  return props.side === 'left' ? workspace.layout.leftSidebar : workspace.layout.rightSidebar;
});

const isCollapsed = computed(() => sidebarState.value.collapsed);

const panelIcons: Record<SidebarPanelId, any> = {
  files: Folder,
  search: Search,
  bookmarks: Bookmark,
  tags: Tag,
  outline: ListTree,
  backlinks: Link2,
  outgoing: ExternalLink,
  properties: SlidersHorizontal,
};

const panelLabels: Record<SidebarPanelId, string> = {
  files: 'File Explorer',
  search: 'Search',
  bookmarks: 'Bookmarks',
  tags: 'Tags',
  outline: 'Outline',
  backlinks: 'Backlinks',
  outgoing: 'Outgoing links',
  properties: 'Properties',
};

// Panel Drag & Drop between sidebars
const isDragOver = ref(false);

function handleTabDragStart(panelId: SidebarPanelId, e: DragEvent) {
  workspace.draggedPanelId = panelId;
  e.dataTransfer?.setData('text/plain', panelId);
  e.dataTransfer!.effectAllowed = 'move';
}

function handleTabDragOver(e: DragEvent) {
  if (!workspace.draggedPanelId) return;
  e.preventDefault();
  isDragOver.value = true;
  e.dataTransfer!.dropEffect = 'move';
}

function handleTabDragLeave() {
  isDragOver.value = false;
}

function handleTabDrop(targetIndex?: number) {
  isDragOver.value = false;
  if (workspace.draggedPanelId) {
    workspace.moveSidebarPanel(workspace.draggedPanelId, props.side, targetIndex);
    workspace.draggedPanelId = null;
  }
}

// Resizing
const isResizing = ref(false);
let startX = 0;
let startWidth = 0;

function startResize(e: MouseEvent) {
  isResizing.value = true;
  startX = e.clientX;
  startWidth = sidebarState.value.width;

  const onMouseMove = (ev: MouseEvent) => {
    if (!isResizing.value) return;
    const delta = props.side === 'left' ? ev.clientX - startX : startX - ev.clientX;
    workspace.setSidebarWidth(props.side, startWidth + delta);
  };

  const onMouseUp = () => {
    isResizing.value = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}
</script>

<template>
  <div
    v-show="!isCollapsed"
    class="sidebar-container h-full flex flex-col bg-[var(--background-secondary)] shrink-0 select-none relative transition-all"
    :class="[
      side === 'left' ? 'border-r border-[var(--background-modifier-border)]' : 'border-l border-[var(--background-modifier-border)]',
      isDragOver ? 'ring-2 ring-[var(--interactive-accent)] ring-inset' : '',
    ]"
    :style="{ width: `${sidebarState.width}px` }"
  >
    <!-- Top Panel Tab Bar (Obsidian-style) -->
    <div
      class="h-9 px-2 flex items-center justify-between border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary-alt)] shrink-0"
      @dragover="handleTabDragOver"
      @dragleave="handleTabDragLeave"
      @drop="handleTabDrop()"
    >
      <!-- Panel Tab Icons -->
      <div class="flex items-center gap-0.5 overflow-x-auto min-w-0">
        <button
          v-for="(panelId, idx) in sidebarState.panels"
          :key="panelId"
          draggable="true"
          @dragstart="(e) => handleTabDragStart(panelId, e)"
          @dragover.stop="handleTabDragOver"
          @drop.stop="handleTabDrop(idx)"
          @click="sidebarState.activePanel = panelId"
          class="p-1.5 rounded transition-colors flex items-center justify-center shrink-0"
          :class="[
            sidebarState.activePanel === panelId
              ? 'text-[var(--text-accent)] bg-[var(--background-modifier-hover)] font-semibold shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]',
          ]"
          :title="`${panelLabels[panelId]} (drag to reorder or move to other sidebar)`"
        >
          <component :is="panelIcons[panelId]" class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Close / Collapse Sidebar button -->
      <button
        @click="props.side === 'left' ? workspace.toggleLeftSidebar() : workspace.toggleRightSidebar()"
        class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] shrink-0"
        :title="props.side === 'left' ? 'Collapse sidebar' : 'Collapse right sidebar'"
      >
        <PanelLeftClose v-if="props.side === 'left'" class="w-3.5 h-3.5" />
        <PanelRightClose v-else class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Active Panel Body -->
    <div class="flex-1 overflow-hidden relative">
      <FileExplorer v-if="sidebarState.activePanel === 'files'" />
      <SearchPanel v-else-if="sidebarState.activePanel === 'search'" />
      <BookmarksPanel v-else-if="sidebarState.activePanel === 'bookmarks'" />
      <TagsPanel v-else-if="sidebarState.activePanel === 'tags'" />
      <OutlinePanel v-else-if="sidebarState.activePanel === 'outline'" />
      <BacklinksPanel v-else-if="sidebarState.activePanel === 'backlinks'" />
      <OutgoingLinksPanel v-else-if="sidebarState.activePanel === 'outgoing'" />
      <PropertiesPanel v-else-if="sidebarState.activePanel === 'properties'" />
      <div v-else class="p-6 text-center text-xs text-[var(--text-muted)] italic">
        Select a panel from above
      </div>
    </div>

    <!-- Resizer Drag Handle -->
    <div
      class="absolute top-0 bottom-0 w-1.5 z-30 cursor-col-resize hover:bg-[var(--interactive-accent)] transition-colors opacity-0 hover:opacity-100"
      :class="side === 'left' ? '-right-1' : '-left-1'"
      @mousedown="startResize"
    />
  </div>
</template>
