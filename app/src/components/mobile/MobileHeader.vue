<script setup lang="ts">
import { computed } from 'vue';
import { useVaultStore } from '../../stores/vault';
import { useWorkspaceStore } from '../../stores/workspace';
import { useDeviceStore } from '../../stores/device';
import { useCommandStore } from '../../stores/commands';
import {
  Menu,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();
const deviceStore = useDeviceStore();
const commandStore = useCommandStore();

const activeTabTitle = computed(() => {
  const path = workspace.activeNotePath;
  if (!path) return vault.currentVault?.name || 'Noty';
  return path.split('/').pop()?.replace(/\.md$/, '') || path;
});

const openTabsCount = computed(() => {
  let count = 0;
  function countLeafTabs(node: any) {
    if (!node) return;
    if (node.type === 'leaf' && node.leaf?.tabs) {
      count += node.leaf.tabs.length;
    } else if (node.type === 'split' && node.children) {
      for (const child of node.children) countLeafTabs(child);
    }
  }
  countLeafTabs(workspace.layout.root);
  return count || 1;
});

function openQuickSwitcher() {
  commandStore.showQuickSwitcher = true;
}
</script>

<template>
  <header
    class="h-12 w-full px-3 flex items-center justify-between border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)] shrink-0 z-20 select-none"
  >
    <!-- Left Drawer Trigger (Hamburger Menu) -->
    <button
      @click="deviceStore.openLeftDrawer()"
      class="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-muted)] active:text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded-md transition-colors"
      title="Open navigation drawer"
      aria-label="Open navigation drawer"
    >
      <Menu class="w-5 h-5" />
    </button>

    <!-- Center Title / Quick Switcher Trigger -->
    <button
      @click="openQuickSwitcher"
      class="flex-1 min-h-[44px] px-2 flex items-center justify-center gap-1.5 overflow-hidden text-center text-xs font-semibold text-[var(--text-normal)] active:opacity-75 transition-opacity"
      title="Tap to switch notes"
    >
      <span class="truncate max-w-[180px]">{{ activeTabTitle }}</span>
      <ChevronDown class="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
    </button>

    <!-- Right Actions: Tab Switcher & Right Drawer -->
    <div class="flex items-center gap-1">
      <!-- Mobile Tab Switcher Button -->
      <button
        @click="deviceStore.toggleTabSwitcher()"
        class="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-muted)] active:text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded-md transition-colors relative"
        title="View open tabs"
        aria-label="View open tabs"
      >
        <div class="w-5 h-5 border-2 border-[var(--text-muted)] rounded flex items-center justify-center text-[10px] font-bold">
          {{ openTabsCount }}
        </div>
      </button>

      <!-- Right Drawer Trigger (Outline / Backlinks / Properties) -->
      <button
        @click="deviceStore.openRightDrawer()"
        class="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-muted)] active:text-[var(--text-normal)] active:bg-[var(--background-modifier-hover)] rounded-md transition-colors"
        title="Open outline and backlinks drawer"
        aria-label="Open outline and backlinks drawer"
      >
        <SlidersHorizontal class="w-4 h-4" />
      </button>
    </div>
  </header>
</template>
