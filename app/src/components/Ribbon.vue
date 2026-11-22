<script setup lang="ts">
import { useWorkspaceStore } from '../stores/workspace';
import { useVaultStore } from '../stores/vault';
import { useSettingsStore } from '../stores/settings';
import { useCommandStore } from '../stores/commands';
import { usePluginsStore } from '../stores/plugins';
import { openRandomNote } from '../services/randomNote';
import { invoke } from '@tauri-apps/api/core';
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
  Calendar,
  Dices,
  LayoutGrid,
  Table,
} from 'lucide-vue-next';

const workspace = useWorkspaceStore();
const vault = useVaultStore();
const settings = useSettingsStore();
const commandStore = useCommandStore();
const plugins = usePluginsStore();

function handleNewNote() {
  const newName = 'Untitled Note';
  vault.createFile('', newName).then((path) => {
    if (path) {
      workspace.openNote(path, { newTab: true });
    }
  });
}

async function createNewCanvas() {
  const name = 'Untitled Canvas.canvas';
  const initial = JSON.stringify({ nodes: [], edges: [] }, null, 2);
  await invoke('vault_write_file', { relativePath: name, content: initial });
  await vault.refreshTree();
  workspace.openNote(name, { newTab: true });
}

async function createNewBase() {
  const name = 'Untitled Database.base';
  const initial = JSON.stringify(
    {
      title: 'Database View',
      folder: '',
      tagFilter: '',
      columns: ['title', 'status', 'tags', 'priority'],
      sortBy: 'title',
      sortDesc: false,
      groupBy: '',
      filterText: '',
    },
    null,
    2
  );
  await invoke('vault_write_file', { relativePath: name, content: initial });
  await vault.refreshTree();
  workspace.openNote(name, { newTab: true });
}
function openCalendar() {
  window.dispatchEvent(new CustomEvent('noty:open-calendar-modal'));
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

      <!-- Daily Notes Calendar -->
      <button
        v-if="plugins.isEnabled('daily-notes')"
        @click="openCalendar"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Open daily notes calendar"
      >
        <Calendar class="w-4 h-4 text-[var(--text-accent)]" />
      </button>

      <!-- New Canvas -->
      <button
        v-if="plugins.isEnabled('canvas')"
        @click="createNewCanvas"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Create new canvas"
      >
        <LayoutGrid class="w-4 h-4 text-purple-400" />
      </button>

      <!-- New Base / Database View -->
      <button
        v-if="plugins.isEnabled('bases')"
        @click="createNewBase"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Create new database view"
      >
        <Table class="w-4 h-4 text-amber-400" />
      </button>

      <!-- Random Note -->
      <button
        v-if="plugins.isEnabled('random-note')"
        @click="openRandomNote"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Open random note"
      >
        <Dices class="w-4 h-4 text-emerald-400" />
      </button>

      <!-- Graph View Icon -->
      <button
        v-if="plugins.isEnabled('graph')"
        @click="workspace.showGraphView = true"
        class="w-8 h-8 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
        title="Open graph view (Ctrl+G)"
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
