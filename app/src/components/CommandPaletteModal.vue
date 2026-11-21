<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useCommandStore, type AppCommand } from '../stores/commands';
import {
  Search,
  Command as CommandIcon,
  Clock,
} from 'lucide-vue-next';

const commandStore = useCommandStore();
const searchQuery = ref('');
const selectedIndex = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);

// Fuzzy matching score helper
function fuzzyMatch(text: string, query: string): { matches: boolean; score: number } {
  if (!query) return { matches: true, score: 0 };
  const target = text.toLowerCase();
  const search = query.toLowerCase();

  // Direct substring bonus
  if (target.includes(search)) {
    return { matches: true, score: 100 - target.indexOf(search) };
  }

  // Subsequence matching
  let searchIdx = 0;
  let score = 0;
  let prevMatchIdx = -1;

  for (let i = 0; i < target.length; i++) {
    if (searchIdx < search.length && target[i] === search[searchIdx]) {
      // Consecutive match bonus
      if (prevMatchIdx === i - 1) score += 10;
      score += 5;
      prevMatchIdx = i;
      searchIdx++;
    }
  }

  return { matches: searchIdx === search.length, score };
}

const filteredCommands = computed<AppCommand[]>(() => {
  const query = searchQuery.value.trim();

  if (!query) {
    // Show recents first, then remaining commands
    const recents = commandStore.recentCommands;
    const recentIds = new Set(recents.map((c) => c.id));
    const others = commandStore.commandList.filter((c) => !recentIds.has(c.id));
    return [...recents, ...others];
  }

  // Filter and rank by fuzzy score
  const scored = commandStore.commandList
    .map((cmd) => {
      const match = fuzzyMatch(`${cmd.name} ${cmd.section} ${cmd.id}`, query);
      return { cmd, match };
    })
    .filter((item) => item.match.matches)
    .sort((a, b) => b.match.score - a.match.score);

  return scored.map((item) => item.cmd);
});

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (filteredCommands.value.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % filteredCommands.value.length;
      scrollToSelected();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (filteredCommands.value.length > 0) {
      selectedIndex.value =
        (selectedIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length;
      scrollToSelected();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const targetCmd = filteredCommands.value[selectedIndex.value];
    if (targetCmd) {
      commandStore.executeCommand(targetCmd.id);
    }
  } else if (e.key === 'Escape') {
    commandStore.showCommandPalette = false;
  }
}

function scrollToSelected() {
  nextTick(() => {
    const el = document.querySelector(`.palette-item-${selectedIndex.value}`);
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
    @click.self="commandStore.showCommandPalette = false"
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
          placeholder="Type a command or search..."
          class="flex-1 bg-transparent text-sm text-[var(--text-normal)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        <kbd class="px-1.5 py-0.5 rounded bg-[var(--background-modifier-border)] text-[10px] text-[var(--text-muted)] font-mono">
          ESC
        </kbd>
      </div>

      <!-- Command List -->
      <div class="flex-1 overflow-y-auto p-1.5 divide-y divide-transparent">
        <div
          v-if="!searchQuery && commandStore.recentCommands.length > 0"
          class="px-3 py-1 text-[10px] font-semibold tracking-wider uppercase text-[var(--text-muted)] flex items-center gap-1"
        >
          <Clock class="w-3 h-3" />
          <span>Recent Commands</span>
        </div>

        <div
          v-for="(cmd, idx) in filteredCommands"
          :key="cmd.id"
          :class="[
            `palette-item-${idx}`,
            'flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs select-none',
            selectedIndex === idx
              ? 'bg-[var(--interactive-accent)] text-white font-medium'
              : 'hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)]',
          ]"
          @click="commandStore.executeCommand(cmd.id)"
          @mouseenter="selectedIndex = idx"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <CommandIcon
              class="w-4 h-4 shrink-0"
              :class="selectedIndex === idx ? 'text-white' : 'text-[var(--text-muted)]'"
            />
            <div class="min-w-0">
              <div class="truncate">{{ cmd.name }}</div>
              <div
                class="text-[10px] truncate"
                :class="selectedIndex === idx ? 'text-white/80' : 'text-[var(--text-muted)]'"
              >
                {{ cmd.section }}
              </div>
            </div>
          </div>

          <!-- Hotkey Badge -->
          <div v-if="cmd.hotkeys" class="shrink-0 ml-3">
            <kbd
              class="px-2 py-0.5 rounded font-mono text-[11px] shadow-2xs border"
              :class="
                selectedIndex === idx
                  ? 'bg-white/20 text-white border-white/30'
                  : 'bg-[var(--background-secondary)] text-[var(--text-accent)] border-[var(--background-modifier-border)]'
              "
            >
              {{ cmd.hotkeys }}
            </kbd>
          </div>
        </div>

        <!-- Empty Results -->
        <div
          v-if="filteredCommands.length === 0"
          class="p-8 text-center text-xs text-[var(--text-muted)] select-none"
        >
          No matching commands found.
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
            to select
          </span>
        </div>
        <div class="flex items-center gap-1 text-[var(--text-faint)]">
          <span>Command Palette</span>
        </div>
      </div>
    </div>
  </div>
</template>
