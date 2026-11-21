<script setup lang="ts">
import { computed } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import { Link2, FileText } from 'lucide-vue-next';

const workspace = useWorkspaceStore();

const activeNoteTitle = computed(() => {
  if (!workspace.activeNotePath) return '';
  return workspace.activeNotePath.split('/').pop()?.replace(/\.md$/, '') || '';
});

// Mock linked mentions for the active note
const linkedMentions = computed(() => {
  if (!activeNoteTitle.value) return [];
  return [
    {
      sourcePath: 'Welcome.md',
      sourceTitle: 'Welcome',
      snippet: `...learning about [[${activeNoteTitle.value}]] and markdown note taking...`,
    },
    {
      sourcePath: 'Projects/Noty.md',
      sourceTitle: 'Noty',
      snippet: `...offline-first note linking with [[${activeNoteTitle.value}]]...`,
    },
  ];
});

function openNote(path: string) {
  workspace.openNote(path);
}
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none">
    <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
      <Link2 class="w-3.5 h-3.5 text-[var(--text-accent)]" />
      <span>Backlinks</span>
    </div>

    <div v-if="activeNoteTitle">
      <div class="text-[11px] text-[var(--text-muted)] mb-2 font-medium">
        Mentions of <span class="text-[var(--text-accent)] font-semibold">"{{ activeNoteTitle }}"</span>
      </div>

      <div class="space-y-2">
        <div
          v-for="mention in linkedMentions"
          :key="mention.sourcePath"
          class="border border-[var(--background-modifier-border)] rounded bg-[var(--background-secondary-alt)] p-2 hover:border-[var(--background-modifier-border-hover)] cursor-pointer transition-colors"
          @click="openNote(mention.sourcePath)"
        >
          <div class="flex items-center gap-1.5 font-medium text-[var(--text-normal)] hover:text-[var(--text-accent)] truncate mb-1">
            <FileText class="w-3.5 h-3.5 text-[var(--text-accent)] shrink-0" />
            <span>{{ mention.sourceTitle }}</span>
          </div>
          <div class="text-[11px] text-[var(--text-muted)] italic truncate">
            {{ mention.snippet }}
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-10 text-[var(--text-muted)] italic">
      No note selected.
    </div>
  </div>
</template>
