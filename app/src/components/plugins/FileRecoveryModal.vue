<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import { useVaultStore } from '../../stores/vault';
import { getSnapshotsForFile, restoreSnapshot } from '../../services/recovery';
import type { RecoverySnapshot } from '../../types/plugins';
import {
  History,
  RotateCcw,
  X,
  Check,
} from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const workspace = useWorkspaceStore();
const vault = useVaultStore();

const targetFile = ref(workspace.activeNotePath || '');
const snapshots = ref<RecoverySnapshot[]>([]);
const selectedSnapshot = ref<RecoverySnapshot | null>(null);
const statusMessage = ref<string | null>(null);

const availableNotes = computed(() => {
  return vault.allFilePaths.filter((p) => p.endsWith('.md'));
});

async function loadSnapshots() {
  if (!targetFile.value) return;
  const list = await getSnapshotsForFile(targetFile.value);
  snapshots.value = list;
  selectedSnapshot.value = list[0] || null;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString();
}

async function handleRestore() {
  if (!selectedSnapshot.value || !targetFile.value) return;

  await restoreSnapshot(targetFile.value, selectedSnapshot.value.content);
  statusMessage.value = `Restored snapshot from ${formatTime(selectedSnapshot.value.timestamp)}`;

  // Refresh workspace content
  if (workspace.activeNotePath === targetFile.value) {
    vault.activeFileContent = selectedSnapshot.value.content;
  }

  setTimeout(() => {
    emit('close');
  }, 1200);
}

onMounted(() => {
  if (!targetFile.value && availableNotes.value.length > 0) {
    targetFile.value = availableNotes.value[0];
  }
  loadSnapshots();
});
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150"
    @click.self="$emit('close')"
  >
    <div class="bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden text-[var(--text-normal)]">
      <!-- Header -->
      <div class="p-3 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)] flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2 font-semibold text-xs text-[var(--text-accent)]">
          <History class="w-4 h-4" />
          <span>File Recovery Snapshots</span>
        </div>
        <button
          @click="$emit('close')"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)]"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- File selector -->
      <div class="p-3 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary-alt)] flex items-center gap-2 shrink-0 text-xs">
        <span class="text-[var(--text-muted)] font-medium">File:</span>
        <select
          v-model="targetFile"
          @change="loadSnapshots"
          class="flex-1 bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1 text-xs outline-none text-[var(--text-normal)] cursor-pointer"
        >
          <option v-for="f in availableNotes" :key="f" :value="f">
            {{ f }}
          </option>
        </select>
      </div>

      <!-- Main Body -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Snapshot List Sidebar -->
        <div class="w-56 border-r border-[var(--background-modifier-border)] p-2 overflow-y-auto space-y-1 shrink-0 text-xs bg-[var(--background-secondary)]">
          <div class="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-2 py-1">
            Snapshots ({{ snapshots.length }})
          </div>

          <div
            v-for="snap in snapshots"
            :key="snap.id"
            @click="selectedSnapshot = snap"
            class="p-2 rounded cursor-pointer transition-colors"
            :class="selectedSnapshot?.id === snap.id ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)]'"
          >
            <div class="truncate text-[11px]">{{ formatTime(snap.timestamp) }}</div>
            <div class="text-[10px] opacity-75 mt-0.5">{{ snap.sizeBytes }} bytes</div>
          </div>

          <div v-if="snapshots.length === 0" class="py-8 text-center text-[var(--text-muted)] italic text-[11px]">
            No snapshots recorded yet.
          </div>
        </div>

        <!-- Snapshot Content Preview -->
        <div class="flex-1 flex flex-col overflow-hidden bg-[var(--background-primary)]">
          <div class="p-2 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary-alt)] flex items-center justify-between text-xs shrink-0">
            <span class="text-[var(--text-muted)]">
              {{ selectedSnapshot ? formatTime(selectedSnapshot.timestamp) : 'Select a snapshot' }}
            </span>
            <button
              v-if="selectedSnapshot"
              @click="handleRestore"
              class="px-2.5 py-1 bg-[var(--interactive-accent)] text-white rounded text-xs font-medium hover:opacity-90 flex items-center gap-1.5 transition-opacity"
            >
              <RotateCcw class="w-3.5 h-3.5" />
              <span>Restore this snapshot</span>
            </button>
          </div>

          <div class="flex-1 p-3 overflow-y-auto font-mono text-xs leading-relaxed select-text whitespace-pre-wrap">
            {{ selectedSnapshot?.content || 'No content preview available' }}
          </div>
        </div>
      </div>

      <!-- Feedback -->
      <div v-if="statusMessage" class="p-2.5 bg-emerald-950/40 border-t border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2 shrink-0">
        <Check class="w-4 h-4" />
        <span>{{ statusMessage }}</span>
      </div>
    </div>
  </div>
</template>
