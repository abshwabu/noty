<script setup lang="ts">
import { computed } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import type { WorkspaceLeaf } from '../../types/workspace';
import TabBar from './TabBar.vue';
import NoteEditor from '../NoteEditor.vue';

const props = defineProps<{
  leaf: WorkspaceLeaf;
}>();

const workspace = useWorkspaceStore();

const isActiveLeaf = computed(() => workspace.layout.activeLeafId === props.leaf.id);

const activeTab = computed(() => {
  return props.leaf.tabs.find((t) => t.id === props.leaf.activeTabId) || props.leaf.tabs[0] || null;
});

function handlePaneClick() {
  workspace.setActiveLeaf(props.leaf.id);
}
</script>

<template>
  <div
    class="workspace-leaf-container h-full w-full flex flex-col bg-[var(--background-primary)] overflow-hidden transition-all"
    :class="[
      isActiveLeaf ? 'ring-1 ring-[var(--interactive-accent)]/50' : 'opacity-95',
    ]"
    @click="handlePaneClick"
  >
    <!-- Tab Bar -->
    <TabBar :leaf="leaf" />

    <!-- Pane Content View -->
    <div class="flex-1 overflow-hidden relative">
      <NoteEditor
        v-if="activeTab"
        :path="activeTab.path"
        :leaf-id="leaf.id"
      />
      <div v-else class="h-full flex flex-col items-center justify-center text-xs text-[var(--text-muted)] italic">
        No active note in this pane
      </div>
    </div>
  </div>
</template>
