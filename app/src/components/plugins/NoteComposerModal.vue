<script setup lang="ts">
import { ref, computed } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import { useVaultStore } from '../../stores/vault';
import { mergeNotes, extractSelectionToNote } from '../../services/composer';
import {
  GitMerge,
  X,
  Check,
} from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const workspace = useWorkspaceStore();
const vault = useVaultStore();

const activeTab = ref<'extract' | 'merge'>('extract');

// Extract state
const extractTitle = ref('');
const extractFolder = ref('');
const selectedText = ref('');

// Merge state
const targetNotePath = ref('');
const mergePosition = ref<'append' | 'prepend'>('append');

const statusMessage = ref<string | null>(null);

const availableNotes = computed(() => {
  const current = workspace.activeNotePath;
  return vault.allFilePaths.filter((p) => p.endsWith('.md') && p !== current);
});

async function handleExtract() {
  if (!extractTitle.value.trim()) return;
  const currentPath = workspace.activeNotePath;
  if (!currentPath) return;

  const res = await extractSelectionToNote(
    currentPath,
    selectedText.value || 'Extracted note content',
    extractTitle.value,
    extractFolder.value
  );

  // Dispatch replacement event to replace selection with [[Wikilink]]
  window.dispatchEvent(
    new CustomEvent('noty:format-selection', {
      detail: { prefix: res.wikilink, suffix: '' },
    })
  );

  statusMessage.value = `Extracted note to ${res.newPath} and inserted ${res.wikilink}`;
  setTimeout(() => {
    emit('close');
  }, 1000);
}

async function handleMerge() {
  const currentPath = workspace.activeNotePath;
  if (!currentPath || !targetNotePath.value) return;

  await mergeNotes(currentPath, targetNotePath.value, mergePosition.value);
  statusMessage.value = `Successfully merged into ${targetNotePath.value}`;
  workspace.openNote(targetNotePath.value);
  setTimeout(() => {
    emit('close');
  }, 1000);
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150"
    @click.self="$emit('close')"
  >
    <div class="bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-[var(--text-normal)]">
      <!-- Header -->
      <div class="p-3 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)] flex items-center justify-between">
        <div class="flex items-center gap-2 font-semibold text-xs text-[var(--text-accent)]">
          <GitMerge class="w-4 h-4" />
          <span>Note Composer</span>
        </div>
        <button
          @click="$emit('close')"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)]"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-[var(--background-modifier-border)] text-xs">
        <button
          @click="activeTab = 'extract'"
          class="flex-1 py-2 font-medium text-center border-b-2 transition-colors"
          :class="activeTab === 'extract' ? 'border-[var(--interactive-accent)] text-[var(--text-accent)] bg-[var(--background-secondary-alt)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
        >
          Extract selection
        </button>
        <button
          @click="activeTab = 'merge'"
          class="flex-1 py-2 font-medium text-center border-b-2 transition-colors"
          :class="activeTab === 'merge' ? 'border-[var(--interactive-accent)] text-[var(--text-accent)] bg-[var(--background-secondary-alt)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
        >
          Merge notes
        </button>
      </div>

      <!-- Tab 1: Extract selection -->
      <div v-if="activeTab === 'extract'" class="p-4 space-y-3 text-xs">
        <div>
          <label class="block font-medium mb-1 text-[var(--text-muted)]">New note title</label>
          <input
            v-model="extractTitle"
            type="text"
            placeholder="e.g. Concept Architecture"
            class="w-full bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] rounded px-3 py-1.5 outline-none focus:border-[var(--interactive-accent)] text-[var(--text-normal)]"
          />
        </div>

        <div>
          <label class="block font-medium mb-1 text-[var(--text-muted)]">Folder (optional)</label>
          <input
            v-model="extractFolder"
            type="text"
            placeholder="e.g. Concepts"
            class="w-full bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] rounded px-3 py-1.5 outline-none focus:border-[var(--interactive-accent)] text-[var(--text-normal)]"
          />
        </div>

        <div class="pt-2">
          <button
            @click="handleExtract"
            :disabled="!extractTitle.trim()"
            class="w-full py-2 bg-[var(--interactive-accent)] text-white font-medium rounded hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Extract to Note & Insert Link
          </button>
        </div>
      </div>

      <!-- Tab 2: Merge notes -->
      <div v-else class="p-4 space-y-3 text-xs">
        <div>
          <label class="block font-medium mb-1 text-[var(--text-muted)]">Target note to merge into</label>
          <select
            v-model="targetNotePath"
            class="w-full bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 outline-none text-[var(--text-normal)] cursor-pointer"
          >
            <option value="" disabled>Select a note...</option>
            <option v-for="n in availableNotes" :key="n" :value="n">
              {{ n }}
            </option>
          </select>
        </div>

        <div>
          <label class="block font-medium mb-1 text-[var(--text-muted)]">Position</label>
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" v-model="mergePosition" value="append" class="accent-[var(--interactive-accent)]" />
              <span>Append to bottom</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" v-model="mergePosition" value="prepend" class="accent-[var(--interactive-accent)]" />
              <span>Prepend to top</span>
            </label>
          </div>
        </div>

        <div class="pt-2">
          <button
            @click="handleMerge"
            :disabled="!targetNotePath"
            class="w-full py-2 bg-[var(--interactive-accent)] text-white font-medium rounded hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Merge and Delete Current Note
          </button>
        </div>
      </div>

      <!-- Feedback -->
      <div v-if="statusMessage" class="p-2.5 bg-emerald-950/40 border-t border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
        <Check class="w-4 h-4" />
        <span>{{ statusMessage }}</span>
      </div>
    </div>
  </div>
</template>
