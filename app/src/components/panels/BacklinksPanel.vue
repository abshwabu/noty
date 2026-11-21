<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useVaultStore } from '../../stores/vault';
import { useWorkspaceStore } from '../../stores/workspace';
import { getBacklinks } from '../../services/metadata';
import type { BacklinksResult, UnlinkedMentionItem } from '../../types/metadata';
import { Link2, Link, FileText, ChevronDown, ChevronRight } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';

const vault = useVaultStore();
const workspace = useWorkspaceStore();

const backlinks = ref<BacklinksResult>({
  linked_mentions: [],
  unlinked_mentions: [],
});
const isLoading = ref(false);
const linkedOpen = ref(true);
const unlinkedOpen = ref(true);
const linkingMap = ref<Record<string, boolean>>({});

const activeNotePath = computed(() => workspace.activeNotePath || vault.activeFilePath || '');
const activeNoteStem = computed(() => {
  if (!activeNotePath.value) return '';
  return activeNotePath.value.split('/').pop()?.replace(/\.md$/, '') || '';
});

async function loadBacklinks() {
  if (!activeNotePath.value) {
    backlinks.value = { linked_mentions: [], unlinked_mentions: [] };
    return;
  }
  isLoading.value = true;
  try {
    backlinks.value = await getBacklinks(activeNotePath.value);
  } finally {
    isLoading.value = false;
  }
}

function openSourceNote(path: string) {
  workspace.openNote(path);
}

/**
 * One-click "Link" button for unlinked mentions
 * Replaces the unlinked word in the source note with [[Target Note]]
 */
async function handleLinkMention(mention: UnlinkedMentionItem) {
  const key = `${mention.source_path}:${mention.line_number}`;
  linkingMap.value[key] = true;

  try {
    const content = await invoke<string>('vault_read_file', {
      relativePath: mention.source_path,
    });
    const lines = content.split('\n');
    const lineIdx = mention.line_number - 1;

    if (lineIdx >= 0 && lineIdx < lines.length) {
      const line = lines[lineIdx];
      // Regex replace case-insensitively the first unlinked occurrence of match_text
      const re = new RegExp(`(?<!\\[\\[)(${escapeRegExp(mention.match_text)})(?!\\]\\])`, 'i');
      lines[lineIdx] = line.replace(re, `[[${activeNoteStem.value}]]`);

      const updated = lines.join('\n');
      await invoke('vault_write_file', {
        relativePath: mention.source_path,
        content: updated,
      });

      // Reload backlinks after update
      await loadBacklinks();
    }
  } catch (err) {
    console.error('Failed to link unlinked mention:', err);
  } finally {
    linkingMap.value[key] = false;
  }
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

watch(activeNotePath, () => {
  loadBacklinks();
});

onMounted(() => {
  loadBacklinks();
});
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none overflow-hidden">
    <!-- Header -->
    <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <Link2 class="w-3.5 h-3.5 text-[var(--text-accent)]" />
        <span>Backlinks</span>
      </div>
      <span v-if="activeNoteStem" class="text-[10px] text-[var(--text-muted)] font-normal truncate max-w-[120px]">
        for {{ activeNoteStem }}
      </span>
    </div>

    <!-- Empty State -->
    <div v-if="!activeNoteStem" class="flex-1 flex flex-col items-center justify-center text-center p-4 text-[var(--text-muted)]">
      <FileText class="w-8 h-8 mb-2 opacity-40" />
      <p class="text-xs">No active note selected</p>
    </div>

    <div v-else class="flex-1 overflow-y-auto space-y-3 pr-1">
      <!-- Section 1: Linked Mentions -->
      <div>
        <button
          @click="linkedOpen = !linkedOpen"
          class="w-full flex items-center justify-between py-1 px-1.5 rounded hover:bg-[var(--background-modifier-hover)] font-medium text-xs text-[var(--text-muted)] hover:text-[var(--text-normal)] transition-colors"
        >
          <div class="flex items-center gap-1">
            <component :is="linkedOpen ? ChevronDown : ChevronRight" class="w-3.5 h-3.5" />
            <span>Linked mentions</span>
          </div>
          <span class="text-[10px] px-1.5 py-0.2 bg-[var(--background-secondary)] rounded-full">
            {{ backlinks.linked_mentions.length }}
          </span>
        </button>

        <div v-if="linkedOpen" class="mt-1 space-y-1.5 pl-2">
          <div
            v-if="backlinks.linked_mentions.length === 0"
            class="text-[11px] text-[var(--text-muted)] py-1 italic pl-1"
          >
            No linked mentions found
          </div>
          <div
            v-for="(mention, idx) in backlinks.linked_mentions"
            :key="idx"
            @click="openSourceNote(mention.source_path)"
            class="p-2 rounded bg-[var(--background-secondary)] hover:bg-[var(--background-modifier-hover)] border border-[var(--background-modifier-border)] cursor-pointer transition-colors group"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="font-semibold text-[var(--text-accent)] group-hover:underline truncate">
                {{ mention.source_title }}
              </span>
              <span class="text-[10px] text-[var(--text-muted)] font-mono">
                line {{ mention.line_number }}
              </span>
            </div>
            <p class="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed font-mono">
              {{ mention.context_snippet }}
            </p>
          </div>
        </div>
      </div>

      <!-- Section 2: Unlinked Mentions -->
      <div>
        <button
          @click="unlinkedOpen = !unlinkedOpen"
          class="w-full flex items-center justify-between py-1 px-1.5 rounded hover:bg-[var(--background-modifier-hover)] font-medium text-xs text-[var(--text-muted)] hover:text-[var(--text-normal)] transition-colors"
        >
          <div class="flex items-center gap-1">
            <component :is="unlinkedOpen ? ChevronDown : ChevronRight" class="w-3.5 h-3.5" />
            <span>Unlinked mentions</span>
          </div>
          <span class="text-[10px] px-1.5 py-0.2 bg-[var(--background-secondary)] rounded-full">
            {{ backlinks.unlinked_mentions.length }}
          </span>
        </button>

        <div v-if="unlinkedOpen" class="mt-1 space-y-1.5 pl-2">
          <div
            v-if="backlinks.unlinked_mentions.length === 0"
            class="text-[11px] text-[var(--text-muted)] py-1 italic pl-1"
          >
            No unlinked mentions found
          </div>
          <div
            v-for="(mention, idx) in backlinks.unlinked_mentions"
            :key="idx"
            class="p-2 rounded bg-[var(--background-secondary)] border border-[var(--background-modifier-border)]"
          >
            <div class="flex items-center justify-between mb-1">
              <span
                @click="openSourceNote(mention.source_path)"
                class="font-semibold text-[var(--text-normal)] hover:text-[var(--text-accent)] cursor-pointer hover:underline truncate"
              >
                {{ mention.source_title }}
              </span>
              <!-- One-Click Link Button -->
              <button
                @click="handleLinkMention(mention)"
                :disabled="linkingMap[`${mention.source_path}:${mention.line_number}`]"
                class="px-2 py-0.5 rounded bg-[var(--interactive-accent)] hover:opacity-90 text-[var(--text-on-accent,white)] font-medium text-[10px] flex items-center gap-1 transition-opacity disabled:opacity-50"
                title="Convert this mention to a [[wikilink]]"
              >
                <Link class="w-3 h-3" />
                <span>{{ linkingMap[`${mention.source_path}:${mention.line_number}`] ? 'Linking...' : 'Link' }}</span>
              </button>
            </div>
            <p class="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed font-mono">
              {{ mention.context_snippet }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
