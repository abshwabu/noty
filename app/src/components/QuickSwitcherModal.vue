<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';
import { useCommandStore } from '../stores/commands';
import type { FileNode } from '../types/vault';
import {
  Search,
  FileText,
  FilePlus,
  Hash,
  CornerDownLeft,
} from 'lucide-vue-next';

const vault = useVaultStore();
const workspace = useWorkspaceStore();
const commandStore = useCommandStore();

const searchQuery = ref('');
const selectedIndex = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);

interface SwitcherItem {
  id: string;
  type: 'file' | 'heading' | 'create';
  title: string;
  subTitle?: string;
  path: string;
  score: number;
}

// Flatten all files from vault.fileTree
function getAllFiles(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  const traverse = (list: FileNode[]) => {
    for (const node of list) {
      if (!node.is_dir) {
        result.push(node);
      } else if (node.children) {
        traverse(node.children);
      }
    }
  };
  traverse(nodes);
  return result;
}

// Fuzzy score
function calculateFuzzyScore(text: string, query: string): { matches: boolean; score: number } {
  if (!query) return { matches: true, score: 0 };
  const target = text.toLowerCase();
  const search = query.toLowerCase();

  if (target === search) return { matches: true, score: 200 };
  if (target.startsWith(search)) return { matches: true, score: 150 };
  if (target.includes(search)) return { matches: true, score: 100 - target.indexOf(search) };

  let sIdx = 0;
  let score = 0;
  let prevIdx = -1;

  for (let i = 0; i < target.length; i++) {
    if (sIdx < search.length && target[i] === search[sIdx]) {
      if (prevIdx === i - 1) score += 10;
      score += 4;
      prevIdx = i;
      sIdx++;
    }
  }

  return { matches: sIdx === search.length, score };
}

const switcherItems = computed<SwitcherItem[]>(() => {
  const query = searchQuery.value.trim();
  const allFiles = getAllFiles(vault.fileTree);
  const items: SwitcherItem[] = [];

  // Check if query is searching for a heading: "Note#heading" or "#heading"
  const isHeadingSearch = query.includes('#');
  let notePart = query;
  let headingPart = '';

  if (isHeadingSearch) {
    const parts = query.split('#');
    notePart = parts[0].trim();
    headingPart = parts[1].trim();
  }

  // 1. Match files
  for (const file of allFiles) {
    const fileNameWithoutExt = file.name.replace(/\.md$/, '');
    const searchTarget = `${fileNameWithoutExt} ${file.relative_path}`;

    const scoreResult = calculateFuzzyScore(
      searchTarget,
      isHeadingSearch ? notePart : query
    );

    if (scoreResult.matches) {
      if (isHeadingSearch && headingPart) {
        // Add heading search item
        items.push({
          id: `heading_${file.relative_path}_${headingPart}`,
          type: 'heading',
          title: `${fileNameWithoutExt} > #${headingPart}`,
          subTitle: file.relative_path,
          path: file.relative_path,
          score: scoreResult.score + 20,
        });
      } else {
        items.push({
          id: file.relative_path,
          type: 'file',
          title: fileNameWithoutExt,
          subTitle: file.relative_path !== file.name ? file.relative_path : undefined,
          path: file.relative_path,
          score: scoreResult.score,
        });
      }
    }
  }

  // Sort items by score descending
  items.sort((a, b) => b.score - a.score);

  // 2. Create-on-enter option if query is not empty and exact file doesn't already exist
  if (query && !isHeadingSearch) {
    const exactExists = allFiles.some(
      (f) =>
        f.name.replace(/\.md$/, '').toLowerCase() === query.toLowerCase() ||
        f.relative_path.toLowerCase() === `${query.toLowerCase()}.md`
    );

    if (!exactExists) {
      items.unshift({
        id: `create_${query}`,
        type: 'create',
        title: `Create note: "${query}"`,
        subTitle: 'Press Enter to create and open',
        path: `${query}.md`,
        score: 9999,
      });
    }
  }

  return items;
});

async function handleSelectItem(item: SwitcherItem) {
  commandStore.showQuickSwitcher = false;

  if (item.type === 'create') {
    // Create new note and open
    const cleanName = item.path.replace(/\.md$/, '');
    const newPath = await vault.createFile('', cleanName);
    if (newPath) {
      workspace.openNote(newPath, { newTab: true });
    }
  } else {
    // Open existing note
    workspace.openNote(item.path);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (switcherItems.value.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % switcherItems.value.length;
      scrollToSelected();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (switcherItems.value.length > 0) {
      selectedIndex.value =
        (selectedIndex.value - 1 + switcherItems.value.length) % switcherItems.value.length;
      scrollToSelected();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = switcherItems.value[selectedIndex.value];
    if (target) {
      handleSelectItem(target);
    }
  } else if (e.key === 'Escape') {
    commandStore.showQuickSwitcher = false;
  }
}

function scrollToSelected() {
  nextTick(() => {
    const el = document.querySelector(`.switcher-item-${selectedIndex.value}`);
    el?.scrollIntoView({ block: 'nearest' });
  });
}

onMounted(() => {
  searchInput.value?.focus();
});
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-20 px-4"
    @click.self="commandStore.showQuickSwitcher = false"
  >
    <div
      class="w-full max-w-xl bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-100"
    >
      <!-- Search Input Header -->
      <div class="p-3 border-b border-[var(--background-modifier-border)] flex items-center gap-2.5 bg-[var(--background-secondary-alt)]">
        <Search class="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          @keydown="handleKeydown"
          type="text"
          placeholder="Open or create note... (type # for headings)"
          class="flex-1 bg-transparent text-sm text-[var(--text-normal)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        <kbd class="px-1.5 py-0.5 rounded bg-[var(--background-modifier-border)] text-[10px] text-[var(--text-muted)] font-mono">
          ESC
        </kbd>
      </div>

      <!-- Results List -->
      <div class="flex-1 overflow-y-auto p-1.5 divide-y divide-transparent">
        <div
          v-for="(item, idx) in switcherItems"
          :key="item.id"
          :class="[
            `switcher-item-${idx}`,
            'flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs select-none',
            selectedIndex === idx
              ? 'bg-[var(--interactive-accent)] text-white font-medium'
              : 'hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)]',
          ]"
          @click="handleSelectItem(item)"
          @mouseenter="selectedIndex = idx"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <FilePlus
              v-if="item.type === 'create'"
              class="w-4 h-4 shrink-0 text-emerald-400"
            />
            <Hash
              v-else-if="item.type === 'heading'"
              class="w-4 h-4 shrink-0"
              :class="selectedIndex === idx ? 'text-white' : 'text-[var(--text-accent)]'"
            />
            <FileText
              v-else
              class="w-4 h-4 shrink-0"
              :class="selectedIndex === idx ? 'text-white' : 'text-[var(--text-muted)]'"
            />

            <div class="min-w-0">
              <div class="truncate font-medium">{{ item.title }}</div>
              <div
                v-if="item.subTitle"
                class="text-[10px] truncate"
                :class="selectedIndex === idx ? 'text-white/80' : 'text-[var(--text-muted)]'"
              >
                {{ item.subTitle }}
              </div>
            </div>
          </div>

          <div v-if="selectedIndex === idx" class="shrink-0 text-white/80 flex items-center gap-1 text-[11px]">
            <span>Open</span>
            <CornerDownLeft class="w-3 h-3" />
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-if="switcherItems.length === 0"
          class="p-8 text-center text-xs text-[var(--text-muted)] select-none"
        >
          No matching notes found. Type a note name to create one.
        </div>
      </div>

      <!-- Footer Help Hints -->
      <div class="px-4 py-2 border-t border-[var(--background-modifier-border)] bg-[var(--background-secondary)] flex items-center justify-between text-[11px] text-[var(--text-muted)] select-none">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <kbd class="px-1 rounded bg-[var(--background-modifier-border)] text-[10px]">↑</kbd>
            <kbd class="px-1 rounded bg-[var(--background-modifier-border)] text-[10px]">↓</kbd>
            to navigate
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1 rounded bg-[var(--background-modifier-border)] text-[10px]">↵</kbd>
            to open / create
          </span>
        </div>
        <div class="flex items-center gap-1 text-[var(--text-faint)]">
          <span>Quick Switcher (Ctrl+O)</span>
        </div>
      </div>
    </div>
  </div>
</template>
