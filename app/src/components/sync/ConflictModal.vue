<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSyncStore } from '../../stores/sync';
import {
  X,
  AlertTriangle,
  FileText,
  CheckCircle,
  Copy,
  ArrowRightLeft,
} from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const syncStore = useSyncStore();
const selectedConflictIndex = ref(0);

const currentConflict = computed(() => {
  if (syncStore.conflicts.length === 0) return null;
  const idx = Math.min(selectedConflictIndex.value, syncStore.conflicts.length - 1);
  return syncStore.conflicts[idx];
});

async function handleResolve(resolution: 'local' | 'remote' | 'keep_both') {
  if (!currentConflict.value) return;
  await syncStore.resolveConflict(currentConflict.value.id, resolution);
  if (syncStore.conflicts.length === 0) {
    emit('close');
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="w-full max-w-5xl h-[85vh] bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[var(--text-normal)]">
      <!-- Header -->
      <div class="px-5 py-3 border-b border-[var(--background-modifier-border)] flex items-center justify-between shrink-0 bg-[var(--background-secondary)]">
        <div class="flex items-center gap-2">
          <AlertTriangle class="w-5 h-5 text-amber-500" />
          <h2 class="text-base font-semibold">Sync Conflict Resolution</h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
            {{ syncStore.conflicts.length }} conflict{{ syncStore.conflicts.length > 1 ? 's' : '' }}
          </span>
        </div>
        <button
          @click="emit('close')"
          class="p-1 rounded hover:bg-[var(--background-modifier-hover)] text-[var(--text-muted)] hover:text-[var(--text-normal)] transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Main Body -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Sidebar: Conflicts list -->
        <div class="w-64 border-r border-[var(--background-modifier-border)] bg-[var(--background-secondary)] p-3 overflow-y-auto shrink-0 flex flex-col gap-1">
          <div class="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2 py-1">
            Conflicted Files
          </div>
          <button
            v-for="(c, idx) in syncStore.conflicts"
            :key="c.id"
            @click="selectedConflictIndex = idx"
            :class="[
              'w-full text-left px-2.5 py-2 rounded text-xs flex items-center gap-2 transition-colors truncate',
              selectedConflictIndex === idx
                ? 'bg-[var(--interactive-accent)] text-white font-medium'
                : 'hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)]'
            ]"
          >
            <FileText class="w-3.5 h-3.5 shrink-0" />
            <span class="truncate">{{ c.path }}</span>
          </button>
        </div>

        <!-- Content Area -->
        <div v-if="currentConflict" class="flex-1 flex flex-col overflow-hidden">
          <!-- File info header -->
          <div class="px-5 py-2.5 bg-[var(--background-secondary)] border-b border-[var(--background-modifier-border)] flex items-center justify-between text-xs">
            <span class="font-mono text-[var(--text-accent)] font-semibold">{{ currentConflict.path }}</span>
            <span class="text-[var(--text-muted)]">
              Conflicted copy preserved: <code class="text-[11px] bg-[var(--background-primary)] px-1.5 py-0.5 rounded">{{ currentConflict.conflicted_file_path }}</code>
            </span>
          </div>

          <!-- Side-by-side diff view -->
          <div class="flex-1 grid grid-cols-2 gap-px bg-[var(--background-modifier-border)] overflow-hidden">
            <!-- Left: Local Version -->
            <div class="flex flex-col bg-[var(--background-primary)] overflow-hidden">
              <div class="px-4 py-2 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)] flex items-center justify-between">
                <span class="text-xs font-semibold text-blue-400">Local Version (This Device)</span>
                <span class="text-[10px] text-[var(--text-muted)] font-mono">{{ currentConflict.local_hash.slice(0, 8) }}</span>
              </div>
              <pre class="flex-1 p-4 font-mono text-xs overflow-auto select-text whitespace-pre-wrap leading-relaxed text-[var(--text-normal)]">{{ currentConflict.local_content }}</pre>
            </div>

            <!-- Right: Remote Version -->
            <div class="flex flex-col bg-[var(--background-primary)] overflow-hidden">
              <div class="px-4 py-2 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)] flex items-center justify-between">
                <span class="text-xs font-semibold text-emerald-400">Remote Version (Server)</span>
                <span class="text-[10px] text-[var(--text-muted)] font-mono">{{ currentConflict.remote_hash.slice(0, 8) }}</span>
              </div>
              <pre class="flex-1 p-4 font-mono text-xs overflow-auto select-text whitespace-pre-wrap leading-relaxed text-[var(--text-normal)]">{{ currentConflict.remote_content }}</pre>
            </div>
          </div>

          <!-- Resolution Actions Footer -->
          <div class="px-5 py-3 border-t border-[var(--background-modifier-border)] bg-[var(--background-secondary)] flex items-center justify-between shrink-0">
            <div class="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
              <ArrowRightLeft class="w-3.5 h-3.5" />
              <span>Choose which version to preserve as active file:</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="handleResolve('local')"
                class="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                title="Keep your local file and discard remote changes"
              >
                Keep Local Version
              </button>
              <button
                @click="handleResolve('remote')"
                class="px-3 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                title="Overwrite local file with server content"
              >
                Keep Remote Version
              </button>
              <button
                @click="handleResolve('keep_both')"
                class="px-3 py-1.5 rounded text-xs font-medium bg-[var(--background-modifier-border)] hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)] transition-colors"
                title="Preserve local file and retain the conflict copy file alongside it"
              >
                Keep Both Versions
              </button>
            </div>
          </div>
        </div>

        <!-- Empty state when no conflicts -->
        <div v-else class="flex-1 flex flex-col items-center justify-center p-8 text-center text-[var(--text-muted)]">
          <CheckCircle class="w-12 h-12 text-emerald-500 mb-3" />
          <h3 class="text-base font-medium text-[var(--text-normal)]">No Active Conflicts</h3>
          <p class="text-xs mt-1">All files are in sync across your devices.</p>
        </div>
      </div>
    </div>
  </div>
</template>
