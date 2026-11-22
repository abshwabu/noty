<script setup lang="ts">
import { computed } from 'vue';
import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';
import { usePluginsStore } from '../stores/plugins';
import {
  PanelLeft,
  PanelRight,
  Link2,
} from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();
const plugins = usePluginsStore();

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

      <!-- Right sidebar toggle -->
      <button
        @click="workspace.toggleRightSidebar()"
        class="hover:text-[var(--text-normal)] transition-colors flex items-center gap-1"
        :title="workspace.layout.rightSidebar.collapsed ? 'Expand right sidebar' : 'Collapse right sidebar'"
      >
        <PanelRight class="w-3.5 h-3.5" />
      </button>
    </div>
  </footer>
</template>
