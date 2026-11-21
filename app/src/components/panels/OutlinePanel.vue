<script setup lang="ts">
import { computed } from 'vue';
import { useVaultStore } from '../../stores/vault';
import { ListTree } from 'lucide-vue-next';

const vault = useVaultStore();

interface HeadingItem {
  level: number;
  text: string;
  line: number;
}

const headings = computed<HeadingItem[]>(() => {
  const content = vault.activeFileContent;
  if (!content) return [];

  const lines = content.split('\n');
  const result: HeadingItem[] = [];

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      result.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index + 1,
      });
    }
  });

  return result;
});
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none">
    <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
      <ListTree class="w-3.5 h-3.5 text-[var(--text-accent)]" />
      <span>Outline</span>
    </div>

    <div v-if="headings.length > 0" class="flex-1 overflow-y-auto space-y-1">
      <div
        v-for="(h, i) in headings"
        :key="i"
        class="px-2 py-1 rounded hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-accent)] cursor-pointer truncate transition-colors"
        :style="{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }"
        :title="h.text"
      >
        <span class="text-[10px] text-[var(--text-faint)] mr-1.5 font-mono">H{{ h.level }}</span>
        <span>{{ h.text }}</span>
      </div>
    </div>

    <div v-else class="text-center py-10 text-[var(--text-muted)] italic">
      No headings in this note.
    </div>
  </div>
</template>
