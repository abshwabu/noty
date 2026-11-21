<script setup lang="ts">
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../../stores/vault';
import { useWorkspaceStore } from '../../stores/workspace';
import { Search, X, FileText } from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();

const query = ref('');
const isCaseSensitive = ref(false);

interface SearchMatch {
  lineNum: number;
  text: string;
}

interface SearchResult {
  path: string;
  name: string;
  matches: SearchMatch[];
  expanded: boolean;
}

// In-memory search through files
const searchResults = ref<SearchResult[]>([]);
const isSearching = ref(false);

async function performSearch() {
  const q = query.value.trim();
  if (!q) {
    searchResults.value = [];
    return;
  }

  isSearching.value = true;
  const results: SearchResult[] = [];
  const targetTerm = isCaseSensitive.value ? q : q.toLowerCase();

  const scanNode = async (node: any) => {
    if (!node.is_dir && (node.extension === 'md' || !node.extension)) {
      try {
        const content = await invoke<string>('vault_read_file', { relativePath: node.relative_path });
        const lines = content.split('\n');
        const matches: SearchMatch[] = [];

        lines.forEach((line: string, idx: number) => {
          const comp = isCaseSensitive.value ? line : line.toLowerCase();
          if (comp.includes(targetTerm)) {
            matches.push({
              lineNum: idx + 1,
              text: line.trim(),
            });
          }
        });

        const nameMatch = isCaseSensitive.value ? node.name.includes(targetTerm) : node.name.toLowerCase().includes(targetTerm);
        if (matches.length > 0 || nameMatch) {
          results.push({
            path: node.relative_path,
            name: node.name,
            matches: matches.slice(0, 5),
            expanded: true,
          });
        }
      } catch (e) {
        // file unreadable
      }
    }
    if (node.children) {
      for (const child of node.children) {
        await scanNode(child);
      }
    }
  };

  for (const rootNode of vault.fileTree) {
    await scanNode(rootNode);
  }

  searchResults.value = results;
  isSearching.value = false;
}

function openNote(path: string) {
  workspace.openNote(path);
}
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none">
    <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Search</div>

    <!-- Search Input -->
    <div class="relative flex items-center mb-3">
      <Search class="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-muted)] pointer-events-none" />
      <input
        v-model="query"
        @keydown.enter="performSearch"
        type="text"
        placeholder="Type and press Enter..."
        class="w-full bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] rounded pl-8 pr-7 py-1.5 text-xs outline-none focus:border-[var(--interactive-accent)]"
      />
      <button
        v-if="query"
        @click="query = ''; searchResults = []"
        class="absolute right-2 text-[var(--text-muted)] hover:text-[var(--text-normal)]"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Match stats -->
    <div v-if="searchResults.length > 0" class="text-[11px] text-[var(--text-muted)] mb-2 px-1">
      Found in {{ searchResults.length }} note{{ searchResults.length === 1 ? '' : 's' }}
    </div>

    <!-- Results list -->
    <div class="flex-1 overflow-y-auto space-y-2">
      <div
        v-for="res in searchResults"
        :key="res.path"
        class="border border-[var(--background-modifier-border)] rounded bg-[var(--background-secondary-alt)] p-2"
      >
        <div
          @click="openNote(res.path)"
          class="flex items-center gap-1.5 font-medium text-[var(--text-normal)] hover:text-[var(--text-accent)] cursor-pointer truncate"
        >
          <FileText class="w-3.5 h-3.5 text-[var(--text-accent)] shrink-0" />
          <span class="truncate">{{ res.name }}</span>
          <span class="text-[10px] text-[var(--text-muted)] ml-auto shrink-0">({{ res.matches.length }})</span>
        </div>

        <div v-if="res.matches.length > 0" class="mt-1.5 space-y-1 pl-4 border-l border-[var(--background-modifier-border)]">
          <div
            v-for="(match, i) in res.matches"
            :key="i"
            @click="openNote(res.path)"
            class="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-normal)] cursor-pointer truncate hover:bg-[var(--background-modifier-hover)] px-1 py-0.5 rounded"
          >
            <span class="text-[9px] text-[var(--text-faint)] mr-1">L{{ match.lineNum }}:</span>
            <span>{{ match.text }}</span>
          </div>
        </div>
      </div>

      <div v-if="searchResults.length === 0 && query && !isSearching" class="text-center py-8 text-[var(--text-muted)] italic">
        No matching notes found.
      </div>
    </div>
  </div>
</template>
