<script setup lang="ts">
import { computed } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import { useVaultStore } from '../../stores/vault';
import type { WorkspaceTab } from '../../types/workspace';
import {
  X,
  Plus,
  FileText,
  Check,
} from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const workspace = useWorkspaceStore();
const vault = useVaultStore();

interface FlattenedTab {
  leafId: string;
  tab: WorkspaceTab;
  isActive: boolean;
}

const allTabs = computed<FlattenedTab[]>(() => {
  const tabsList: FlattenedTab[] = [];
  function traverse(node: any) {
    if (!node) return;
    if (node.type === 'leaf' && node.leaf) {
      for (const t of node.leaf.tabs) {
        tabsList.push({
          leafId: node.leaf.id,
          tab: t,
          isActive: node.leaf.activeTabId === t.id,
        });
      }
    } else if (node.type === 'split' && node.children) {
      for (const child of node.children) traverse(child);
    }
  }
  traverse(workspace.layout.root);
  return tabsList;
});

function selectTab(leafId: string, tabId: string, filePath: string) {
  workspace.setActiveTab(leafId, tabId);
  vault.activeFilePath = filePath;
  emit('close');
}

function closeTab(leafId: string, tabId: string, e: Event) {
  e.stopPropagation();
  workspace.closeTab(leafId, tabId);
  if (allTabs.value.length <= 1) {
    emit('close');
  }
}

async function handleNewNote() {
  const path = await vault.createFile('', 'Untitled Note');
  if (path) {
    workspace.openNote(path, { newTab: true });
    emit('close');
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-[var(--background-primary)] flex flex-col select-none animate-in fade-in duration-150">
    <!-- Top Header -->
    <div class="h-14 px-4 flex items-center justify-between border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)] shrink-0">
      <div class="font-bold text-sm text-[var(--text-normal)]">
        Open Tabs ({{ allTabs.length }})
      </div>
      <button
        @click="emit('close')"
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-xs font-semibold text-[var(--text-accent)] active:bg-[var(--background-modifier-hover)] transition-colors"
      >
        Done
      </button>
    </div>

    <!-- Tabs Grid View -->
    <div class="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
      <div
        v-for="item in allTabs"
        :key="item.tab.id"
        @click="selectTab(item.leafId, item.tab.id, item.tab.path)"
        class="h-36 p-3 rounded-xl border flex flex-col justify-between transition-all relative overflow-hidden bg-[var(--background-secondary)] active:scale-[0.98] cursor-pointer"
        :class="[
          item.isActive
            ? 'border-[var(--interactive-accent)] shadow-lg shadow-[var(--interactive-accent)]/10 ring-1 ring-[var(--interactive-accent)]'
            : 'border-[var(--background-modifier-border)] hover:border-[var(--text-muted)]',
        ]"
      >
        <!-- Card Header -->
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <FileText class="w-4 h-4 text-[var(--text-accent)] shrink-0" />
            <span class="font-semibold text-xs text-[var(--text-normal)] truncate">
              {{ item.tab.title }}
            </span>
          </div>

          <button
            @click="closeTab(item.leafId, item.tab.id, $event)"
            class="min-w-[28px] min-h-[28px] flex items-center justify-center -mr-1 -mt-1 rounded-full text-[var(--text-muted)] hover:text-red-400 active:bg-[var(--background-modifier-border)] transition-colors"
            title="Close Tab"
            aria-label="Close Tab"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Path Preview -->
        <div class="text-[10px] text-[var(--text-faint)] truncate my-auto">
          {{ item.tab.path }}
        </div>

        <!-- Card Footer -->
        <div class="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-2 border-t border-[var(--background-modifier-border)]/50">
          <span class="capitalize">{{ item.tab.previewMode || 'live' }} view</span>
          <span v-if="item.isActive" class="flex items-center gap-0.5 text-[var(--text-accent)] font-medium">
            <Check class="w-3 h-3" /> Active
          </span>
        </div>
      </div>
    </div>

    <!-- Bottom Actions -->
    <div class="h-16 px-4 flex items-center justify-between border-t border-[var(--background-modifier-border)] bg-[var(--background-secondary)] shrink-0 safe-area-bottom">
      <button
        @click="handleNewNote"
        class="min-h-[44px] px-4 rounded-xl bg-[var(--interactive-accent)] text-white text-xs font-semibold flex items-center gap-2 active:opacity-90 shadow-md transition-opacity"
      >
        <Plus class="w-4 h-4" />
        New Tab
      </button>

      <button
        @click="emit('close')"
        class="min-h-[44px] px-4 rounded-xl bg-[var(--background-modifier-border)] text-[var(--text-normal)] text-xs font-medium flex items-center gap-1.5 active:bg-[var(--background-modifier-hover)] transition-colors"
      >
        Close
      </button>
    </div>
  </div>
</template>
