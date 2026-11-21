<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { vaultSearch } from '../../services/search';
import { useWorkspaceStore } from '../../stores/workspace';
import type { SearchResponse } from '../../types/search';
import { Search, FileText, ChevronDown, ChevronRight, RefreshCw, Loader2 } from 'lucide-vue-next';

const props = defineProps<{
  query: string;
}>();

const workspace = useWorkspaceStore();

const searchResponse = ref<SearchResponse | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const expandedNotes = ref<Record<string, boolean>>({});

async function runQuery() {
  const q = props.query.trim();
  if (!q) {
    searchResponse.value = null;
    return;
  }

  isLoading.value = true;
  error.value = null;
  try {
    const res = await vaultSearch(q);
    searchResponse.value = res;
    const exp: Record<string, boolean> = {};
    for (const item of res.results) {
      exp[item.file_path] = true;
    }
    expandedNotes.value = exp;
  } catch (err: any) {
    error.value = String(err);
  } finally {
    isLoading.value = false;
  }
}

function openNote(path: string) {
  workspace.openNote(path);
}

function toggleExpand(path: string) {
  expandedNotes.value[path] = !expandedNotes.value[path];
}

onMounted(() => {
  runQuery();
});

watch(() => props.query, () => {
  runQuery();
});
</script>

<template>
  <div class="my-4 border border-[var(--background-modifier-border)] rounded-lg bg-[var(--background-secondary-alt)] overflow-hidden shadow-sm">
    <!-- Header -->
    <div class="px-3 py-2 bg-[var(--background-secondary)] border-b border-[var(--background-modifier-border)] flex items-center justify-between">
      <div class="flex items-center gap-2 text-xs font-semibold text-[var(--text-accent)]">
        <Search class="w-3.5 h-3.5" />
        <span class="font-mono text-[11px] truncate text-[var(--text-normal)]">{{ props.query }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="searchResponse" class="text-[10px] text-[var(--text-muted)] bg-[var(--background-primary)] px-2 py-0.5 rounded-full border border-[var(--background-modifier-border)]">
          {{ searchResponse.total_matches }} in {{ searchResponse.total_files }}
        </span>
        <button
          @click="runQuery"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
          title="Refresh query results"
        >
          <RefreshCw :class="['w-3.5 h-3.5', isLoading ? 'animate-spin' : '']" />
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="p-2 space-y-1.5 max-h-80 overflow-y-auto">
      <div v-if="isLoading && !searchResponse" class="py-4 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
        <Loader2 class="w-4 h-4 animate-spin text-[var(--interactive-accent)]" />
        <span>Executing query...</span>
      </div>

      <div v-else-if="error" class="py-2 px-3 text-xs text-red-400 bg-red-950/20 rounded border border-red-900/40">
        {{ error }}
      </div>

      <div v-else-if="searchResponse && searchResponse.results.length === 0" class="py-4 text-center text-xs text-[var(--text-muted)] italic">
        No notes matched this query.
      </div>

      <div
        v-else-if="searchResponse"
        v-for="res in searchResponse.results"
        :key="res.file_path"
        class="border border-[var(--background-modifier-border)] rounded bg-[var(--background-primary)] overflow-hidden text-xs"
      >
        <div
          @click="toggleExpand(res.file_path)"
          class="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer select-none group"
        >
          <component
            :is="expandedNotes[res.file_path] ? ChevronDown : ChevronRight"
            class="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-normal)] shrink-0"
          />
          <FileText class="w-3.5 h-3.5 text-[var(--text-accent)] shrink-0" />
          <span
            @click.stop="openNote(res.file_path)"
            class="font-medium text-[var(--text-normal)] hover:text-[var(--text-accent)] truncate"
          >
            {{ res.file_title || res.file_path }}
          </span>
          <span class="text-[10px] text-[var(--text-muted)] ml-auto shrink-0">
            ({{ res.matches.length }})
          </span>
        </div>

        <div
          v-if="expandedNotes[res.file_path] && res.matches.length > 0"
          class="border-t border-[var(--background-modifier-border)] bg-[var(--background-secondary-alt)] px-3 py-1 space-y-1"
        >
          <div
            v-for="(match, mIdx) in res.matches"
            :key="mIdx"
            @click="openNote(res.file_path)"
            class="py-0.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-normal)] cursor-pointer truncate flex items-center gap-1.5"
          >
            <span class="text-[9px] font-mono text-[var(--text-faint)]">L{{ match.line_number }}:</span>
            <span class="truncate">{{ match.line_text }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>