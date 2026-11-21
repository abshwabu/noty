<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useVaultStore } from '../../stores/vault';
import { useWorkspaceStore } from '../../stores/workspace';
import { getOutgoingLinks } from '../../services/metadata';
import type { OutgoingLinkItem } from '../../types/metadata';
import { ExternalLink, FileText, Image as ImageIcon, Plus } from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();

const outgoingLinks = ref<OutgoingLinkItem[]>([]);
const isLoading = ref(false);

const activeNotePath = computed(() => workspace.activeNotePath || vault.activeFilePath || '');

async function loadOutgoingLinks() {
  if (!activeNotePath.value) {
    outgoingLinks.value = [];
    return;
  }
  isLoading.value = true;
  try {
    outgoingLinks.value = await getOutgoingLinks(activeNotePath.value);
  } finally {
    isLoading.value = false;
  }
}

async function handleOpenLink(item: OutgoingLinkItem) {
  if (item.is_resolved) {
    const path = item.target_note.endsWith('.md')
      ? item.target_note
      : `${item.target_note}.md`;
    workspace.openNote(path);
  } else {
    // Unresolved -> Create note and open it
    const newPath = await vault.createFile('', item.target_note);
    if (newPath) {
      workspace.openNote(newPath);
      await loadOutgoingLinks();
    }
  }
}

watch(activeNotePath, () => {
  loadOutgoingLinks();
});

onMounted(() => {
  loadOutgoingLinks();
});
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none overflow-hidden">
    <!-- Header -->
    <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <ExternalLink class="w-3.5 h-3.5 text-[var(--text-accent)]" />
        <span>Outgoing Links</span>
      </div>
      <span v-if="outgoingLinks.length > 0" class="text-[10px] bg-[var(--background-secondary)] px-1.5 py-0.2 rounded-full">
        {{ outgoingLinks.length }}
      </span>
    </div>

    <!-- Empty State -->
    <div v-if="!activeNotePath" class="flex-1 flex flex-col items-center justify-center text-center p-4 text-[var(--text-muted)]">
      <FileText class="w-8 h-8 mb-2 opacity-40" />
      <p class="text-xs">No active note selected</p>
    </div>

    <div v-else-if="outgoingLinks.length === 0" class="flex-1 flex flex-col items-center justify-center text-center p-4 text-[var(--text-muted)]">
      <ExternalLink class="w-8 h-8 mb-2 opacity-40" />
      <p class="text-xs">No outgoing links in this note</p>
    </div>

    <!-- List -->
    <div v-else class="flex-1 overflow-y-auto space-y-1.5 pr-1">
      <div
        v-for="(link, idx) in outgoingLinks"
        :key="idx"
        @click="handleOpenLink(link)"
        class="flex items-center justify-between px-2.5 py-2 rounded bg-[var(--background-secondary)] hover:bg-[var(--background-modifier-hover)] border border-[var(--background-modifier-border)] cursor-pointer transition-colors group"
      >
        <div class="flex items-center gap-2 min-w-0">
          <component
            :is="link.is_embed ? ImageIcon : FileText"
            class="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-accent)] shrink-0"
          />
          <div class="min-w-0">
            <span
              class="font-medium truncate block"
              :class="link.is_resolved ? 'text-[var(--text-normal)] group-hover:text-[var(--text-accent)]' : 'text-[var(--text-muted)] opacity-75 underline decoration-dashed'"
            >
              {{ link.display_text }}
            </span>
            <span v-if="link.heading" class="text-[10px] text-[var(--text-muted)] block">
              #{{ link.heading }}
            </span>
          </div>
        </div>

        <!-- Resolved / Unresolved Badge -->
        <span
          v-if="!link.is_resolved"
          class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium flex items-center gap-1"
          title="Unresolved link - click to create note"
        >
          <Plus class="w-2.5 h-2.5" />
          <span>Create</span>
        </span>
        <span
          v-else-if="link.is_embed"
          class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[var(--background-modifier-hover)] text-[var(--text-muted)] font-mono"
        >
          embed
        </span>
      </div>
    </div>
  </div>
</template>
