<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';
import { usePluginsStore } from '../stores/plugins';
import { useSyncStore } from '../stores/sync';
import ConflictModal from './sync/ConflictModal.vue';
import {
  PanelLeft,
  PanelRight,
  Link2,
  Cloud,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
} from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();
const plugins = usePluginsStore();
const syncStore = useSyncStore();

const showConflictModal = ref(false);

onMounted(() => {
  syncStore.loadConfig().then(() => {
    syncStore.triggerOnOpenSync();
  });
});

async function handleSyncClick() {
  if (syncStore.isSyncing) return;
  try {
    await syncStore.syncNow();
  } catch (e) {
    console.warn('Sync failed:', e);
  }
}

const activeTab = computed(() => workspace.activeTab);

const wordCount = computed(() => {
  const content = vault.activeFileContent;
  if (!content) return 0;
  return content.trim().split(/\s+/).filter(Boolean).length;
});

const charCount = computed(() => {
  return vault.activeFileContent.length;
});

const backlinkCount = computed(() => {
  return 2; // Linked mentions count for active note
});
</script>

<template>
  <footer class="status-bar h-6 px-3 bg-[var(--status-bar-background)] border-t border-[var(--background-modifier-border)] flex items-center justify-between text-[11px] text-[var(--text-muted)] select-none shrink-0 z-20">
    <!-- Left Section -->
    <div class="flex items-center gap-3">
      <!-- Left sidebar toggle -->
      <button
        @click="workspace.toggleLeftSidebar()"
        class="hover:text-[var(--text-normal)] transition-colors flex items-center gap-1"
        :title="workspace.layout.leftSidebar.collapsed ? 'Expand left sidebar' : 'Collapse left sidebar'"
      >
        <PanelLeft class="w-3.5 h-3.5" />
      </button>

      <!-- Backlink count -->
      <div
        v-if="activeTab && plugins.isEnabled('backlinks')"
        @click="workspace.layout.rightSidebar.activePanel = 'backlinks'; workspace.layout.rightSidebar.collapsed = false"
        class="flex items-center gap-1 hover:text-[var(--text-normal)] cursor-pointer transition-colors"
        title="View backlinks"
      >
        <Link2 class="w-3 h-3 text-[var(--text-accent)]" />
        <span>{{ backlinkCount }} backlinks</span>
      </div>
    </div>

    <!-- Center Section -->
    <div class="truncate max-w-sm hidden sm:block text-[var(--text-faint)]">
      {{ activeTab?.path || 'No note selected' }}
    </div>

    <!-- Right Section -->
    <div class="flex items-center gap-3">
      <span v-if="activeTab && plugins.isEnabled('word-count')">{{ wordCount }} words</span>
      <span v-if="activeTab && plugins.isEnabled('word-count')" class="hidden md:inline">{{ charCount }} characters</span>

      <!-- Mode indicator -->
      <button
        v-if="activeTab"
        @click="() => {
          if (!activeTab) return;
          const current = activeTab.previewMode || 'live';
          activeTab.previewMode = current === 'live' ? 'reading' : current === 'reading' ? 'source' : 'live';
        }"
        class="px-1.5 py-0.5 rounded bg-[var(--background-modifier-hover)] hover:bg-[var(--background-modifier-border)] text-[var(--text-normal)] text-[10px] cursor-pointer transition-colors"
        title="Click to toggle view mode (Ctrl+E)"
      >
        {{ activeTab.previewMode === 'reading' ? 'Reading' : activeTab.previewMode === 'source' ? 'Source' : 'Live Preview' }}
      </button>

      <!-- Sync Status Indicator -->
      <div class="flex items-center gap-1.5 border-l border-[var(--background-modifier-border)] pl-3">
        <!-- Conflict button if conflicts exist -->
        <button
          v-if="syncStore.status.unresolved_conflicts_count > 0"
          @click="showConflictModal = true"
          class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 font-medium text-[10px] cursor-pointer transition-colors"
          title="Resolve sync conflicts"
        >
          <AlertTriangle class="w-3 h-3 text-amber-500" />
          <span>{{ syncStore.status.unresolved_conflicts_count }} conflict{{ syncStore.status.unresolved_conflicts_count > 1 ? 's' : '' }}</span>
        </button>

        <!-- Sync trigger icon button -->
        <button
          @click="handleSyncClick"
          :class="[
            'flex items-center gap-1 hover:text-[var(--text-normal)] cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-[var(--background-modifier-hover)]',
            syncStore.syncError ? 'text-rose-400' : 'text-[var(--text-muted)]'
          ]"
          :title="syncStore.isSyncing ? 'Syncing...' : syncStore.syncError ? `Sync error: ${syncStore.syncError} (click to retry)` : `Last synced: ${syncStore.lastSyncRelativeTime} (click to sync now)`"
        >
          <RefreshCw v-if="syncStore.isSyncing" class="w-3 h-3 animate-spin text-[var(--interactive-accent)]" />
          <AlertCircle v-else-if="syncStore.syncError" class="w-3 h-3 text-rose-500" />
          <Cloud v-else :class="['w-3 h-3', syncStore.isConfigured ? 'text-[var(--text-accent)]' : 'opacity-60']" />
          <span class="text-[10px] hidden lg:inline">{{ syncStore.isSyncing ? 'Syncing...' : syncStore.lastSyncRelativeTime }}</span>
        </button>
      </div>

      <!-- Right sidebar toggle -->
      <button
        @click="workspace.toggleRightSidebar()"
        class="hover:text-[var(--text-normal)] transition-colors flex items-center gap-1"
        :title="workspace.layout.rightSidebar.collapsed ? 'Expand right sidebar' : 'Collapse right sidebar'"
      >
        <PanelRight class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Conflict Resolution Modal -->
    <ConflictModal v-if="showConflictModal" @close="showConflictModal = false" />
  </footer>
</template>
