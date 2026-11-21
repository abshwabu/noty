<script setup lang="ts">
import { computed } from 'vue';
import { useVaultStore } from '../../stores/vault';
import { useWorkspaceStore } from '../../stores/workspace';
import { ExternalLink, FileText } from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();

const outgoingLinks = computed<string[]>(() => {
  const content = vault.activeFileContent;
  if (!content) return [];

  // Match [[WikiLink]] or [[WikiLink|Alias]]
  const regex = /\[\[(.*?)\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    const raw = match[1];
    const linkTarget = raw.split('|')[0].trim();
    if (linkTarget && !links.includes(linkTarget)) {
      links.push(linkTarget);
    }
  }

  return links;
});

function handleOpenLink(target: string) {
  const path = target.endsWith('.md') ? target : `${target}.md`;
  workspace.openNote(path);
}
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none">
    <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
      <ExternalLink class="w-3.5 h-3.5 text-[var(--text-accent)]" />
      <span>Outgoing Links</span>
    </div>

    <div v-if="outgoingLinks.length > 0" class="flex-1 overflow-y-auto space-y-1">
      <div
        v-for="link in outgoingLinks"
        :key="link"
        @click="handleOpenLink(link)"
        class="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-[var(--background-modifier-hover)] hover:text-[var(--text-accent)] cursor-pointer transition-colors"
      >
        <FileText class="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
        <span class="truncate font-medium">{{ link }}</span>
      </div>
    </div>

    <div v-else class="text-center py-10 text-[var(--text-muted)] italic">
      No outgoing [[links]] found in this note.
    </div>
  </div>
</template>
