<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useVaultStore } from './stores/vault';
import FileExplorer from './components/FileExplorer.vue';
import NoteEditor from './components/NoteEditor.vue';
import VaultSwitcherModal from './components/VaultSwitcherModal.vue';
import TrashModal from './components/TrashModal.vue';
import { PanelLeftClose, PanelLeft, X } from 'lucide-vue-next';

const store = useVaultStore();
const isSidebarOpen = ref(true);

function handleKeydown(e: KeyboardEvent) {
  // Ctrl+N / Cmd+N -> New Note
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    store.createFile('', 'Untitled Note');
  }
  // Ctrl+O / Cmd+O -> Open Vault Switcher
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    store.showVaultSwitcher = true;
  }
  // Ctrl+\ / Cmd+\ -> Toggle Sidebar
  if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
    e.preventDefault();
    isSidebarOpen.value = !isSidebarOpen.value;
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  await store.init();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-[#141416] text-zinc-100 overflow-hidden font-sans">
    <!-- App Workspace Body -->
    <div class="flex-1 flex overflow-hidden relative">
      <!-- File Explorer Sidebar -->
      <aside
        v-show="isSidebarOpen"
        class="w-64 md:w-72 shrink-0 h-full border-r border-[#27272a] flex flex-col z-10 transition-all"
      >
        <FileExplorer />
      </aside>

      <!-- Sidebar Toggle Floating Button -->
      <button
        @click="isSidebarOpen = !isSidebarOpen"
        class="absolute z-20 top-2.5 transition-all p-1.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white shadow-md border border-zinc-700/60 backdrop-blur-md"
        :class="isSidebarOpen ? 'left-[16.5rem] md:left-[18.5rem]' : 'left-3'"
        :title="isSidebarOpen ? 'Collapse sidebar (Ctrl+\\)' : 'Expand sidebar (Ctrl+\\)'"
      >
        <PanelLeftClose v-if="isSidebarOpen" class="w-3.5 h-3.5" />
        <PanelLeft v-else class="w-3.5 h-3.5" />
      </button>

      <!-- Note Editor / Main Area -->
      <main class="flex-1 h-full min-w-0 flex flex-col overflow-hidden">
        <NoteEditor />
      </main>
    </div>

    <!-- Error Banner / Toast -->
    <div
      v-if="store.errorMessage"
      class="fixed bottom-4 right-4 z-50 max-w-md bg-red-950/90 border border-red-800 text-red-200 px-4 py-2.5 rounded-lg shadow-2xl flex items-center justify-between gap-3 text-xs backdrop-blur-sm"
    >
      <div class="truncate">{{ store.errorMessage }}</div>
      <button @click="store.errorMessage = null" class="text-red-400 hover:text-white">
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Modals -->
    <VaultSwitcherModal v-if="store.showVaultSwitcher" />
    <TrashModal v-if="store.showTrashModal" />
  </div>
</template>

<style>
/* Base Reset */
html,
body,
#app {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: #141416;
}
</style>
