<script setup lang="ts">
import { ref } from 'vue';
import { Tag, Hash } from 'lucide-vue-next';
import { useWorkspaceStore } from '../../stores/workspace';

const workspace = useWorkspaceStore();

interface TagInfo {
  tag: string;
  count: number;
}

const tags = ref<TagInfo[]>([
  { tag: 'obsidian', count: 4 },
  { tag: 'project', count: 3 },
  { tag: 'rust', count: 2 },
  { tag: 'tauri', count: 2 },
  { tag: 'notes', count: 5 },
  { tag: 'todo', count: 1 },
]);

function handleTagClick(_tag: string) {
  // Activate search with #tag
  workspace.layout.leftSidebar.activePanel = 'search';
  workspace.layout.leftSidebar.collapsed = false;
}
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none">
    <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
      <Tag class="w-3.5 h-3.5 text-[var(--text-accent)]" />
      <span>Tags</span>
    </div>

    <!-- Tags List -->
    <div v-if="tags.length > 0" class="flex-1 overflow-y-auto space-y-1">
      <div
        v-for="item in tags"
        :key="item.tag"
        @click="handleTagClick(item.tag)"
        class="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[var(--background-modifier-hover)] cursor-pointer text-[var(--text-normal)] hover:text-[var(--text-accent)] transition-colors group"
      >
        <div class="flex items-center gap-1.5 min-w-0">
          <Hash class="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-accent)] shrink-0" />
          <span class="truncate font-medium">{{ item.tag }}</span>
        </div>
        <span class="text-[10px] bg-[var(--background-modifier-hover)] px-1.5 py-0.5 rounded text-[var(--text-muted)]">
          {{ item.count }}
        </span>
      </div>
    </div>

    <div v-else class="text-center py-10 text-[var(--text-muted)] italic">
      No tags found in notes. Use #tag in notes to organize.
    </div>
  </div>
</template>
