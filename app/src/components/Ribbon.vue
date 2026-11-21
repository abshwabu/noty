<script setup lang="ts">
import { useWorkspaceStore } from '../stores/workspace';
import { useVaultStore } from '../stores/vault';
import { useSettingsStore } from '../stores/settings';
import { useCommandStore } from '../stores/commands';
import {
  PanelLeft,
  FolderOpen,
  FilePlus,
  Search,
  Settings,
  Trash2,
  Share2,
  Command as CommandIcon,
  Layers,
} from 'lucide-vue-next';

const workspace = useWorkspaceStore();
const vault = useVaultStore();
const settings = useSettingsStore();
const commandStore = useCommandStore();

function handleNewNote() {
  const newName = 'Untitled Note';
  vault.createFile('', newName).then((path) => {
    if (path) {
      workspace.openNote(path, { newTab: true });
    }
  });
}
</script>

<template>
  <div class="workspace-ribbon w-11 h-full bg-[var(--ribbon-background)] border-r border-[var(--background-modifier-border)] flex flex-col justify-between items-center py-2 shrink-0 select-none z-20">
    <!-- Top Action Icons -->
    <div class="flex flex-col items-center gap-1 w-full">
      <!-- Toggle Left Sidebar -->
      <button
        @click="workspace.toggleLeftSidebar()"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        :title="workspace.layout.leftSidebar.collapsed ? 'Expand left sidebar (Ctrl+\\)' : 'Collapse left sidebar (Ctrl+\\)'"
      >
        <PanelLeft class="w-4 h-4" />
      </button>

      <!-- Quick Switcher -->
      <button
        @click="commandStore.showQuickSwitcher = true"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Quick switcher (Ctrl+O)"
      >
        <Layers class="w-4 h-4" />
      </button>

      <!-- Command Palette -->
      <button
        @click="commandStore.showCommandPalette = true"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Open command palette (Ctrl+P)"
      >
        <CommandIcon class="w-4 h-4" />
      </button>

      <!-- Global Search in Files -->
      <button
        @click="workspace.layout.leftSidebar.activePanel = 'search'; workspace.layout.leftSidebar.collapsed = false"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Search in files (Ctrl+Shift+F)"
      >
        <Search class="w-4 h-4" />
      </button>

      <!-- Open Vault Switcher -->
      <button
        @click="vault.showVaultSwitcher = true"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Open another vault (Ctrl+Shift+O)"
      >
        <FolderOpen class="w-4 h-4" />
      </button>

      <!-- Create New Note -->
      <button
        @click="handleNewNote"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Create new note (Ctrl+N)"
      >
        <FilePlus class="w-4 h-4" />
      </button>

      <!-- Graph View Icon Placeholder -->
      <button
        @click="workspace.openNote('Welcome.md')"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Open graph view"
      >
        <Share2 class="w-4 h-4" />
      </button>
    </div>

    <!-- Bottom Action Icons -->
    <div class="flex flex-col items-center gap-1 w-full">
      <!-- Trash Bin -->
      <button
        @click="vault.showTrashModal = true"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Open trash"
      >
        <Trash2 class="w-4 h-4" />
      </button>

      <!-- Settings Cog -->
      <button
        @click="settings.showSettingsModal = true"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Open settings (Ctrl+,)"
      >
        <Settings class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
