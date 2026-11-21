<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useVaultStore } from '../../stores/vault';
import { useWorkspaceStore } from '../../stores/workspace';
import { getOutline } from '../../services/metadata';
import type { HeadingItem } from '../../types/metadata';
import { ListTree, FileText } from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();

const headings = ref<HeadingItem[]>([]);
const activeNotePath = computed(() => workspace.activeNotePath || vault.activeFilePath || '');

async function loadOutline() {
  if (!activeNotePath.value) {
    headings.value = [];
    return;
  }

  // Parse directly from current content in memory for instant responsiveness
  const content = vault.activeFileContent;
  if (content) {
    const lines = content.split('\n');
    const result: HeadingItem[] = [];
    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        result.push({
          level: match[1].length,
          text: match[2].trim(),
          line_number: index + 1,
        });
      }
    });
    headings.value = result;
    return;
  }

  try {
    headings.value = await getOutline(activeNotePath.value);
  } catch {
    headings.value = [];
  }
}

function handleHeadingClick(h: HeadingItem) {
  // In Reading view or live preview, scroll to line or heading
  const lineEl = document.querySelector(`[data-line="${h.line_number}"]`);
  if (lineEl) {
    lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Find heading by text
  const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const match = allHeadings.find((el) => el.textContent?.trim() === h.text);
  if (match) {
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

watch([activeNotePath, () => vault.activeFileContent], () => {
  loadOutline();
});

onMounted(() => {
  loadOutline();
});
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none overflow-hidden">
    <!-- Header -->
    <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <ListTree class="w-3.5 h-3.5 text-[var(--text-accent)]" />
        <span>Outline</span>
      </div>
      <span v-if="headings.length > 0" class="text-[10px] bg-[var(--background-secondary)] px-1.5 py-0.2 rounded-full">
        {{ headings.length }}
      </span>
    </div>

    <!-- Empty State -->
    <div v-if="!activeNotePath" class="flex-1 flex flex-col items-center justify-center text-center p-4 text-[var(--text-muted)]">
      <FileText class="w-8 h-8 mb-2 opacity-40" />
      <p class="text-xs">No active note selected</p>
    </div>

    <div v-else-if="headings.length === 0" class="flex-1 flex flex-col items-center justify-center text-center p-4 text-[var(--text-muted)]">
      <ListTree class="w-8 h-8 mb-2 opacity-40" />
      <p class="text-xs">No headings in this note</p>
    </div>

    <!-- Headings List -->
    <div v-else class="flex-1 overflow-y-auto space-y-1 pr-1">
      <div
        v-for="(h, i) in headings"
        :key="i"
        @click="handleHeadingClick(h)"
        class="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-accent)] cursor-pointer truncate transition-colors group"
        :style="{ paddingLeft: `${(h.level - 1) * 12 + 6}px` }"
        :title="`${h.text} (Line ${h.line_number})`"
      >
        <span class="text-[10px] text-[var(--text-muted)] group-hover:text-[var(--text-accent)] font-mono font-semibold shrink-0">
          H{{ h.level }}
        </span>
        <span class="truncate font-medium">{{ h.text }}</span>
      </div>
    </div>
  </div>
</template>
