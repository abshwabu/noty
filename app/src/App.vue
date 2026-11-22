<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from './stores/vault';
import { useWorkspaceStore } from './stores/workspace';
import { useSettingsStore } from './stores/settings';
import { useCommandStore } from './stores/commands';
import { usePluginsStore } from './stores/plugins';
import { useBookmarksStore } from './stores/bookmarks';
import { useDeviceStore } from './stores/device';
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
import MobileHeader from './components/mobile/MobileHeader.vue';
import MobileKeyboardToolbar from './components/mobile/MobileKeyboardToolbar.vue';
import MobileTabSwitcher from './components/mobile/MobileTabSwitcher.vue';
import MobileDrawer from './components/mobile/MobileDrawer.vue';
import { X } from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const commandStore = useCommandStore();
const plugins = usePluginsStore();
const bookmarks = useBookmarksStore();
const deviceStore = useDeviceStore();

function handleKeydown(e: KeyboardEvent) {
  commandStore.handleGlobalKeydown(e);
}

function handleOpenCalendar() {
  workspace.showCalendarModal = true;
}

function handleOpenTemplates() {
  workspace.showTemplatesModal = true;
}

async function handleAndroidShare(e: any) {
  const text = e.detail?.text || '';
  if (!text) return;
  const dateStr = new Date().toISOString().slice(0, 10);
  const title = `Shared Note ${dateStr}`;
  const path = await vault.createFile('', title);
  if (path) {
    await invoke('vault_write_file', {
      relativePath: path,
      content: `# ${title}\n\n${text}\n`,
    });
    await vault.refreshTree();
    workspace.openNote(path, { newTab: true });
  }
}

async function handleAndroidAction(e: any) {
  const action = e.detail?.action;
  if (action === 'new-note') {
    const path = await vault.createFile('', 'Untitled Note');
    if (path) workspace.openNote(path, { newTab: true });
  } else if (action === 'daily-note') {
    await commandStore.executeCommand('app:daily-note');
  }
}

onMounted(async () => {
  deviceStore.initListeners();

  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('noty:open-calendar-modal', handleOpenCalendar);
  window.addEventListener('noty:open-templates-modal', handleOpenTemplates);
  window.addEventListener('noty:android-share', handleAndroidShare);
  window.addEventListener('noty:android-action', handleAndroidAction);

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

  // Handle URL parameters for mobile shortcuts or intents
  if (typeof window !== 'undefined' && window.location.search) {
    const urlParams = new URLSearchParams(window.location.search);
    const shareText = urlParams.get('share_text');
    const actionParam = urlParams.get('action');
    if (shareText) {
      handleAndroidShare({ detail: { text: shareText } });
    } else if (actionParam) {
      handleAndroidAction({ detail: { action: actionParam } });
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('noty:open-calendar-modal', handleOpenCalendar);
  window.removeEventListener('noty:open-templates-modal', handleOpenTemplates);
  window.removeEventListener('noty:android-share', handleAndroidShare);
  window.removeEventListener('noty:android-action', handleAndroidAction);
});
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-[var(--background-primary)] text-[var(--text-normal)] overflow-hidden font-sans select-none">
    <!-- Mobile Top Header Bar -->
    <MobileHeader v-if="deviceStore.isMobile" />

    <!-- App Workspace Shell -->
    <div class="flex-1 flex overflow-hidden relative">
      <!-- Desktop Left Ribbon (Icon Bar) -->
      <Ribbon v-if="!deviceStore.isMobile" />

      <!-- Desktop Left Sidebar -->
      <Sidebar v-if="!deviceStore.isMobile" side="left" />

      <!-- Center Workspace Area (Split Panes on desktop, Single Pane on mobile) -->
      <main class="flex-1 h-full min-w-0 flex flex-col overflow-hidden relative bg-[var(--background-primary)]">
        <WorkspaceSplitView :node="workspace.layout.root" />
      </main>

      <!-- Desktop Right Sidebar -->
      <Sidebar v-if="!deviceStore.isMobile" side="right" />
    </div>

    <!-- Mobile Bottom Keyboard Toolbar -->
    <MobileKeyboardToolbar v-if="deviceStore.isMobile" />

    <!-- Desktop Bottom Status Bar -->
    <StatusBar v-if="!deviceStore.isMobile" />

    <!-- Mobile Drawers (Swipe-in / Overlay) -->
    <MobileDrawer v-if="deviceStore.isMobile && deviceStore.activeDrawer === 'left'" side="left" />
    <MobileDrawer v-if="deviceStore.isMobile && deviceStore.activeDrawer === 'right'" side="right" />

    <!-- Mobile Tab Switcher Modal -->
    <MobileTabSwitcher
      v-if="deviceStore.isMobile && deviceStore.showTabSwitcher"
      @close="deviceStore.showTabSwitcher = false"
    />

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
      class="fixed bottom-14 md:bottom-8 right-4 z-50 max-w-md bg-red-950/90 border border-red-800 text-red-200 px-4 py-2.5 rounded-lg shadow-2xl flex items-center justify-between gap-3 text-xs backdrop-blur-sm"
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
