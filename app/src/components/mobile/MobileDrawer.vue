<script setup lang="ts">
import { computed } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import { useDeviceStore } from '../../stores/device';
import { useVaultStore } from '../../stores/vault';
import { useSettingsStore } from '../../stores/settings';
import type { SidebarPanelId } from '../../types/workspace';
import FileExplorer from '../FileExplorer.vue';
import SearchPanel from '../panels/SearchPanel.vue';
import BookmarksPanel from '../panels/BookmarksPanel.vue';
import TagsPanel from '../panels/TagsPanel.vue';
import OutlinePanel from '../panels/OutlinePanel.vue';
import BacklinksPanel from '../panels/BacklinksPanel.vue';
import OutgoingLinksPanel from '../panels/OutgoingLinksPanel.vue';
import PropertiesPanel from '../panels/PropertiesPanel.vue';
import {
  X,
  Folder,
  Search,
  Bookmark,
  Tag,
  ListTree,
  Link2,
  ExternalLink,
  SlidersHorizontal,
  FilePlus,
  Calendar,
  Settings as SettingsIcon,
  Trash2,
} from 'lucide-vue-next';

const props = defineProps<{
  side: 'left' | 'right';
}>();

const workspace = useWorkspaceStore();
const deviceStore = useDeviceStore();
const vault = useVaultStore();
const settings = useSettingsStore();

const sidebarState = computed(() => {
  return props.side === 'left' ? workspace.layout.leftSidebar : workspace.layout.rightSidebar;
});

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
  files: 'Files',
  search: 'Search',
  bookmarks: 'Bookmarks',
  tags: 'Tags',
  outline: 'Outline',
  backlinks: 'Backlinks',
  outgoing: 'Outgoing',
  properties: 'Properties',
};

async function handleNewNote() {
  const path = await vault.createFile('', 'Untitled Note');
  if (path) {
    workspace.openNote(path, { newTab: true });
    deviceStore.closeDrawers();
  }
}

function handleOpenSettings() {
  settings.showSettingsModal = true;
  deviceStore.closeDrawers();
}

function handleOpenTrash() {
  vault.showTrashModal = true;
  deviceStore.closeDrawers();
}

function handleOpenCalendar() {
  workspace.showCalendarModal = true;
  deviceStore.closeDrawers();
}
</script>

<template>
  <div class="fixed inset-0 z-40 select-none flex">
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      @click="deviceStore.closeDrawers()"
    />

    <!-- Drawer Content Window -->
    <div
      class="relative z-50 h-full w-[88vw] max-w-[340px] bg-[var(--background-secondary)] text-[var(--text-normal)] flex flex-col shadow-2xl transition-transform duration-200"
      :class="[
        side === 'left'
          ? 'mr-auto border-r border-[var(--background-modifier-border)] animate-in slide-in-from-left duration-200'
          : 'ml-auto border-l border-[var(--background-modifier-border)] animate-in slide-in-from-right duration-200',
      ]"
    >
      <!-- Drawer Top Bar -->
      <div class="h-14 px-3 flex items-center justify-between border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary-alt)] shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-7 h-7 rounded-lg bg-[var(--interactive-accent)]/20 text-[var(--text-accent)] flex items-center justify-center font-bold text-xs">
            N
          </div>
          <span class="font-bold text-xs text-[var(--text-normal)] truncate">
            {{ side === 'left' ? vault.currentVault?.name || 'Noty Vault' : 'Note Details' }}
          </span>
        </div>

        <button
          @click="deviceStore.closeDrawers()"
          class="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] active:text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] transition-colors"
          title="Close drawer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Panel Tabs Bar -->
      <div class="h-11 px-2 flex items-center gap-1 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)] shrink-0 overflow-x-auto">
        <button
          v-for="panelId in sidebarState.panels"
          :key="panelId"
          @click="sidebarState.activePanel = panelId"
          class="min-h-[36px] px-2.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors shrink-0"
          :class="[
            sidebarState.activePanel === panelId
              ? 'bg-[var(--background-modifier-border)] text-[var(--text-accent)] font-semibold'
              : 'text-[var(--text-muted)] active:text-[var(--text-normal)]',
          ]"
        >
          <component :is="panelIcons[panelId]" class="w-3.5 h-3.5" />
          <span>{{ panelLabels[panelId] }}</span>
        </button>
      </div>

      <!-- Drawer Main Body -->
      <div class="flex-1 overflow-hidden relative">
        <FileExplorer v-if="sidebarState.activePanel === 'files'" />
        <SearchPanel v-else-if="sidebarState.activePanel === 'search'" />
        <BookmarksPanel v-else-if="sidebarState.activePanel === 'bookmarks'" />
        <TagsPanel v-else-if="sidebarState.activePanel === 'tags'" />
        <OutlinePanel v-else-if="sidebarState.activePanel === 'outline'" />
        <BacklinksPanel v-else-if="sidebarState.activePanel === 'backlinks'" />
        <OutgoingLinksPanel v-else-if="sidebarState.activePanel === 'outgoing'" />
        <PropertiesPanel v-else-if="sidebarState.activePanel === 'properties'" />
      </div>

      <!-- Left Drawer Footer Actions -->
      <div
        v-if="side === 'left'"
        class="h-13 px-3 flex items-center justify-between border-t border-[var(--background-modifier-border)] bg-[var(--background-secondary-alt)] shrink-0"
      >
        <button
          @click="handleNewNote"
          class="min-h-[40px] px-3 rounded-lg bg-[var(--interactive-accent)] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm active:opacity-90"
        >
          <FilePlus class="w-4 h-4" />
          <span>New Note</span>
        </button>

        <div class="flex items-center gap-1">
          <button
            @click="handleOpenCalendar"
            class="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] active:text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] transition-colors"
            title="Daily calendar"
          >
            <Calendar class="w-4 h-4" />
          </button>
          <button
            @click="handleOpenTrash"
            class="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] active:text-red-400 active:bg-[var(--background-modifier-hover)] transition-colors"
            title="Trash"
          >
            <Trash2 class="w-4 h-4" />
          </button>
          <button
            @click="handleOpenSettings"
            class="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] active:text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] transition-colors"
            title="Settings"
          >
            <SettingsIcon class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
