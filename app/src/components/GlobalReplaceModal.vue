<script setup lang="ts">
import { ref, computed } from 'vue';
import { useVaultStore } from '../stores/vault';
import { vaultPreviewGlobalReplace, vaultExecuteGlobalReplace } from '../services/search';
import type { ReplacePreviewItem, GlobalReplaceRequest } from '../types/search';
import {
  X,
  Replace,
  Search,
  Check,
  CheckSquare,
  Square,
  AlertTriangle,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-vue-next';

const vault = useVaultStore();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const searchQuery = ref('');
const replacement = ref('');
const isCaseSensitive = ref(false);
const isRegex = ref(false);

const isPreviewing = ref(false);
const isExecuting = ref(false);
const previewItems = ref<ReplacePreviewItem[]>([]);
const hasPreviewed = ref(false);
const showConfirmDialog = ref(false);
const selectedPaths = ref<Record<string, boolean>>({});
const expandedPaths = ref<Record<string, boolean>>({});
const resultMessage = ref<string | null>(null);

// Group previews by file
const groupedPreviews = computed(() => {
  const groups: Record<string, ReplacePreviewItem[]> = {};
  for (const item of previewItems.value) {
    if (!groups[item.file_path]) {
      groups[item.file_path] = [];
    }
    groups[item.file_path].push(item);
  }
  return groups;
});

const totalFilesCount = computed(() => Object.keys(groupedPreviews.value).length);
const selectedFilesCount = computed(() => {
  return Object.keys(selectedPaths.value).filter((p) => selectedPaths.value[p]).length;
});
const totalMatchesCount = computed(() => {
  let count = 0;
  for (const [path, items] of Object.entries(groupedPreviews.value)) {
    if (selectedPaths.value[path]) {
      count += items.length;
    }
  }
  return count;
});

async function handlePreview() {
  if (!searchQuery.value.trim()) return;

  isPreviewing.value = true;
  resultMessage.value = null;
  try {
    const req: GlobalReplaceRequest = {
      search_query: searchQuery.value,
      replacement: replacement.value,
      case_sensitive: isCaseSensitive.value,
      regex: isRegex.value,
    };
    const items = await vaultPreviewGlobalReplace(req);
    previewItems.value = items;
    hasPreviewed.value = true;

    // Default: select all files and expand first few
    const sel: Record<string, boolean> = {};
    const exp: Record<string, boolean> = {};
    Object.keys(groupedPreviews.value).forEach((path, idx) => {
      sel[path] = true;
      exp[path] = idx < 3;
    });
    selectedPaths.value = sel;
    expandedPaths.value = exp;
  } finally {
    isPreviewing.value = false;
  }
}

function toggleSelectAll() {
  const allSelected = selectedFilesCount.value === totalFilesCount.value;
  const newSel: Record<string, boolean> = {};
  Object.keys(groupedPreviews.value).forEach((p) => {
    newSel[p] = !allSelected;
  });
  selectedPaths.value = newSel;
}

async function handleConfirmReplace() {
  showConfirmDialog.value = false;
  isExecuting.value = true;

  try {
    const targets = Object.keys(selectedPaths.value).filter((p) => selectedPaths.value[p]);
    const req: GlobalReplaceRequest = {
      search_query: searchQuery.value,
      replacement: replacement.value,
      case_sensitive: isCaseSensitive.value,
      regex: isRegex.value,
      target_paths: targets,
    };

    const res = await vaultExecuteGlobalReplace(req);
    resultMessage.value = `Successfully replaced ${res.occurrences_replaced} occurrences across ${res.files_modified} notes.`;
    hasPreviewed.value = false;
    previewItems.value = [];
  } catch (err: any) {
    vault.errorMessage = String(err);
  } finally {
    isExecuting.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
    <div class="bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="h-12 border-b border-[var(--background-modifier-border)] px-4 flex items-center justify-between bg-[var(--background-secondary)] shrink-0">
        <div class="flex items-center gap-2 font-semibold text-sm text-[var(--text-accent)]">
          <Replace class="w-4 h-4" />
          <span>Global Vault Replace</span>
        </div>
        <button
          @click="$emit('close')"
          class="p-1.5 rounded-md hover:bg-[var(--background-modifier-hover)] text-[var(--text-muted)] hover:text-[var(--text-normal)] transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Controls & Input Form -->
      <div class="p-4 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary-alt)] space-y-3 shrink-0">
        <div class="grid grid-cols-2 gap-3">
          <!-- Find Input -->
          <div>
            <label class="block text-[11px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider">
              Find
            </label>
            <div class="relative flex items-center">
              <Search class="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-muted)]" />
              <input
                v-model="searchQuery"
                @keydown.enter="handlePreview"
                type="text"
                placeholder="Text or /regex/ to find..."
                class="w-full pl-8 pr-3 py-1.5 bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-md text-xs text-[var(--text-normal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--interactive-accent)] font-mono"
              />
            </div>
          </div>

          <!-- Replace Input -->
          <div>
            <label class="block text-[11px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wider">
              Replace With
            </label>
            <div class="relative flex items-center">
              <Replace class="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-muted)]" />
              <input
                v-model="replacement"
                @keydown.enter="handlePreview"
                type="text"
                placeholder="Replacement text..."
                class="w-full pl-8 pr-3 py-1.5 bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-md text-xs text-[var(--text-normal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--interactive-accent)] font-mono"
              />
            </div>
          </div>
        </div>

        <!-- Options & Action Buttons -->
        <div class="flex items-center justify-between pt-1">
          <div class="flex items-center gap-2">
            <!-- Case Sensitive Toggle -->
            <button
              @click="isCaseSensitive = !isCaseSensitive"
              class="px-2 py-1 rounded border text-xs font-mono flex items-center gap-1 transition-colors"
              :class="isCaseSensitive ? 'bg-[var(--interactive-accent)] text-white border-transparent' : 'border-[var(--background-modifier-border)] text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
              title="Match Case (Case Sensitive)"
            >
              <span>Aa</span>
            </button>

            <!-- Regex Toggle -->
            <button
              @click="isRegex = !isRegex"
              class="px-2 py-1 rounded border text-xs font-mono flex items-center gap-1 transition-colors"
              :class="isRegex ? 'bg-[var(--interactive-accent)] text-white border-transparent' : 'border-[var(--background-modifier-border)] text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
              title="Use Regular Expression"
            >
              <span>.*</span>
            </button>
          </div>

          <div class="flex items-center gap-2">
            <button
              @click="handlePreview"
              :disabled="!searchQuery.trim() || isPreviewing"
              class="px-3 py-1.5 rounded bg-[var(--background-modifier-hover)] hover:bg-[var(--background-modifier-border)] text-xs font-medium text-[var(--text-normal)] transition-colors disabled:opacity-50"
            >
              {{ isPreviewing ? 'Scanning...' : 'Preview Changes' }}
            </button>

            <button
              v-if="hasPreviewed && totalMatchesCount > 0"
              @click="showConfirmDialog = true"
              :disabled="isExecuting"
              class="px-3 py-1.5 rounded bg-[var(--interactive-accent)] hover:opacity-90 text-xs font-medium text-white transition-opacity flex items-center gap-1.5"
            >
              <Check class="w-3.5 h-3.5" />
              <span>Replace All ({{ totalMatchesCount }})</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Result Banner -->
      <div v-if="resultMessage" class="p-3 bg-emerald-950/60 border-b border-emerald-800 text-emerald-200 text-xs flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Check class="w-4 h-4 text-emerald-400" />
          <span>{{ resultMessage }}</span>
        </div>
        <button @click="resultMessage = null" class="text-emerald-400 hover:text-white">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Preview List Body -->
      <div class="flex-1 overflow-y-auto p-4 text-xs select-text">
        <div v-if="!hasPreviewed && !resultMessage" class="h-full flex flex-col items-center justify-center text-center text-[var(--text-muted)] p-8">
          <Replace class="w-10 h-10 mb-2 opacity-30" />
          <p class="font-medium">Enter a find pattern and replacement text to preview diffs</p>
          <p class="text-[11px] opacity-75 mt-1">Changes are not saved until you review and confirm</p>
        </div>

        <div v-else-if="hasPreviewed && previewItems.length === 0" class="h-full flex flex-col items-center justify-center text-center text-[var(--text-muted)] p-8">
          <Search class="w-10 h-10 mb-2 opacity-30" />
          <p class="font-medium">No matching occurrences found in vault</p>
        </div>

        <div v-else-if="hasPreviewed" class="space-y-3">
          <!-- Selection Toolbar -->
          <div class="flex items-center justify-between pb-2 border-b border-[var(--background-modifier-border)] text-xs text-[var(--text-muted)] select-none">
            <button @click="toggleSelectAll" class="flex items-center gap-1.5 hover:text-[var(--text-normal)]">
              <component :is="selectedFilesCount === totalFilesCount ? CheckSquare : Square" class="w-3.5 h-3.5 text-[var(--text-accent)]" />
              <span>Select All Files ({{ selectedFilesCount }} of {{ totalFilesCount }})</span>
            </button>
            <span class="font-mono text-[11px]">{{ previewItems.length }} total occurrences</span>
          </div>

          <!-- Grouped File Diffs -->
          <div
            v-for="(items, filePath) in groupedPreviews"
            :key="filePath"
            class="rounded-lg border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] overflow-hidden"
          >
            <!-- File Header -->
            <div class="px-3 py-2 bg-[var(--background-secondary-alt)] border-b border-[var(--background-modifier-border)] flex items-center justify-between select-none">
              <div class="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  v-model="selectedPaths[filePath]"
                  class="rounded text-[var(--interactive-accent)] border-[var(--background-modifier-border)] cursor-pointer"
                />
                <button
                  @click="expandedPaths[filePath] = !expandedPaths[filePath]"
                  class="flex items-center gap-1.5 font-medium text-[var(--text-normal)] hover:text-[var(--text-accent)] truncate"
                >
                  <component :is="expandedPaths[filePath] ? ChevronDown : ChevronRight" class="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <FileText class="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <span class="truncate">{{ filePath }}</span>
                </button>
              </div>
              <span class="text-[10px] bg-[var(--background-modifier-hover)] px-2 py-0.5 rounded text-[var(--text-muted)] font-mono">
                {{ items.length }} {{ items.length === 1 ? 'match' : 'matches' }}
              </span>
            </div>

            <!-- Diffs Table -->
            <div v-if="expandedPaths[filePath]" class="divide-y divide-[var(--background-modifier-border)]">
              <div
                v-for="(diff, idx) in items"
                :key="idx"
                class="p-2.5 space-y-1 font-mono text-[11px] leading-relaxed"
              >
                <div class="text-[10px] text-[var(--text-muted)] mb-0.5">Line {{ diff.line_number }}</div>
                <!-- Original Line -->
                <div class="flex items-start gap-2 bg-red-950/25 px-2 py-1 rounded text-red-300">
                  <span class="text-red-400 select-none">-</span>
                  <span class="break-all">{{ diff.original_line }}</span>
                </div>
                <!-- Replaced Line -->
                <div class="flex items-start gap-2 bg-emerald-950/25 px-2 py-1 rounded text-emerald-300">
                  <span class="text-emerald-400 select-none">+</span>
                  <span class="break-all">{{ diff.replaced_line }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Confirmation Dialog Modal -->
      <div
        v-if="showConfirmDialog"
        class="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none"
      >
        <div class="bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4">
          <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-bold text-sm text-[var(--text-normal)]">Confirm Global Replace</h3>
              <p class="text-xs text-[var(--text-muted)] mt-1">
                You are about to replace <strong class="text-[var(--text-accent)]">{{ totalMatchesCount }} occurrences</strong> across <strong class="text-[var(--text-accent)]">{{ selectedFilesCount }} files</strong> on disk.
              </p>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button
              @click="showConfirmDialog = false"
              class="px-3 py-1.5 rounded hover:bg-[var(--background-modifier-hover)] text-xs text-[var(--text-muted)] hover:text-[var(--text-normal)]"
            >
              Cancel
            </button>
            <button
              @click="handleConfirmReplace"
              class="px-3 py-1.5 rounded bg-[var(--interactive-accent)] hover:opacity-90 text-xs font-semibold text-white shadow-sm"
            >
              Yes, Replace All
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
