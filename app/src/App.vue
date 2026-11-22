<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useVaultStore } from './stores/vault';
import { useWorkspaceStore } from './stores/workspace';
import { useSettingsStore } from './stores/settings';
import { useCommandStore } from './stores/commands';
import { usePluginsStore } from './stores/plugins';
import { useBookmarksStore } from './stores/bookmarks';
import Ribbon from './components/Ribbon.vue';
import Sidebar from './components/Sidebar.vue';
import WorkspaceSplitView from './components/workspace/WorkspaceSplitView.vue';
import StatusBar from './components/StatusBar.vue';
import VaultSwitcherModal from './components/VaultSwitcherModal.vue';
import TrashModal from './components/TrashModal.vue';
import SettingsModal from './components/settings/SettingsModal.vue';
import CommandPaletteModal from './components/CommandPaletteModal.vue';
import QuickSwitcherModal from './components/QuickSwitcherModal.vue';
import HoverPreviewPopover from './components/HoverPreviewPopover.vue';
import GraphViewModal from './components/GraphViewModal.vue';
import GlobalReplaceModal from './components/GlobalReplaceModal.vue';
import CalendarModal from './components/plugins/CalendarModal.vue';
import TemplatesModal from './components/plugins/TemplatesModal.vue';
import NoteComposerModal from './components/plugins/NoteComposerModal.vue';
import FileRecoveryModal from './components/plugins/FileRecoveryModal.vue';
import { X } from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const commandStore = useCommandStore();
const plugins = usePluginsStore();
const bookmarks = useBookmarksStore();

function handleKeydown(e: KeyboardEvent) {
  commandStore.handleGlobalKeydown(e);
}

function handleOpenCalendar() {
  workspace.showCalendarModal = true;
}

function handleOpenTemplates() {
  workspace.showTemplatesModal = true;
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('noty:open-calendar-modal', handleOpenCalendar);
  window.addEventListener('noty:open-templates-modal', handleOpenTemplates);

  // Initialize plugins, vault, settings, bookmarks
  await plugins.loadPluginsConfig();
  await bookmarks.loadBookmarks();

  // Initialize command registry & load hotkeys
  commandStore.initCoreCommands();

  // Initialize vault, settings, and workspace layout
  await vault.init();
  await settings.loadSettings();
  await workspace.loadLayout();
  await commandStore.loadHotkeysFromVault();

  // If a note was active in workspace layout, activate it
  if (workspace.activeNotePath) {
    vault.activeFilePath = workspace.activeNotePath;
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('noty:open-calendar-modal', handleOpenCalendar);
  window.removeEventListener('noty:open-templates-modal', handleOpenTemplates);
});
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-[var(--background-primary)] text-[var(--text-normal)] overflow-hidden font-sans select-none">
    <!-- App Workspace Shell -->
    <div class="flex-1 flex overflow-hidden relative">
      <!-- 1. Left Ribbon (Icon Bar) -->
      <Ribbon />

      <!-- 2. Left Sidebar (Collapsible, Draggable Panels) -->
      <Sidebar side="left" />

      <!-- 3. Center Workspace Area (Split Panes & Tabs) -->
      <main class="flex-1 h-full min-w-0 flex flex-col overflow-hidden relative bg-[var(--background-primary)]">
        <WorkspaceSplitView :node="workspace.layout.root" />
      </main>

      <!-- 4. Right Sidebar (Collapsible, Draggable Panels) -->
      <Sidebar side="right" />
    </div>

    <!-- 5. Bottom Status Bar -->
    <StatusBar />

    <!-- Modals -->
    <GraphViewModal v-if="workspace.showGraphView" @close="workspace.showGraphView = false" />
    <GlobalReplaceModal v-if="workspace.showGlobalReplaceModal" @close="workspace.showGlobalReplaceModal = false" />
    <CalendarModal v-if="workspace.showCalendarModal" @close="workspace.showCalendarModal = false" />
    <TemplatesModal v-if="workspace.showTemplatesModal" @close="workspace.showTemplatesModal = false" />
    <NoteComposerModal v-if="workspace.showComposerModal" @close="workspace.showComposerModal = false" />
    <FileRecoveryModal v-if="workspace.showRecoveryModal" @close="workspace.showRecoveryModal = false" />
    <CommandPaletteModal v-if="commandStore.showCommandPalette" />
    <QuickSwitcherModal v-if="commandStore.showQuickSwitcher" />
    <VaultSwitcherModal v-if="vault.showVaultSwitcher" />
    <TrashModal v-if="vault.showTrashModal" />
    <SettingsModal v-if="settings.showSettingsModal" />

    <!-- Global Hover Preview for Wikilinks -->
    <HoverPreviewPopover />

    <!-- Error Banner / Toast -->
    <div
      v-if="vault.errorMessage"
      class="fixed bottom-8 right-4 z-50 max-w-md bg-red-950/90 border border-red-800 text-red-200 px-4 py-2.5 rounded-lg shadow-2xl flex items-center justify-between gap-3 text-xs backdrop-blur-sm"
    >
      <div class="truncate">{{ vault.errorMessage }}</div>
      <button @click="vault.errorMessage = null" class="text-red-400 hover:text-white">
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: var(--background-primary);
}
</style>
