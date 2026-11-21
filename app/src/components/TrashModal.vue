<script setup lang="ts">
import { onMounted } from 'vue';
import { useVaultStore } from '../stores/vault';
import {
  Trash2,
  RotateCcw,
  X,
  FileText,
  Folder,
} from 'lucide-vue-next';

const store = useVaultStore();

onMounted(async () => {
  await store.loadTrash();
});

async function handleRestore(id: string) {
  await store.restoreTrashItem(id);
}

async function handleEmpty() {
  if (confirm('Permanently delete all items in trash? This cannot be undone.')) {
    await store.emptyTrash();
  }
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none"
    @click.self="store.showTrashModal = false"
  >
    <div class="bg-[#1e1e24] border border-[#3f3f46] w-full max-w-xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-[#2d2d34] flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center">
            <Trash2 class="w-4 h-4" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-zinc-100">Trash Bin (.trash)</h2>
            <p class="text-xs text-zinc-400">Deleted files can be restored to their original location</p>
          </div>
        </div>
        <button
          @click="store.showTrashModal = false"
          class="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Action bar -->
      <div class="px-6 py-2.5 bg-[#25252d] border-b border-[#2d2d34] flex items-center justify-between text-xs">
        <span class="text-zinc-400 font-medium">
          {{ store.trashItems.length }} item{{ store.trashItems.length === 1 ? '' : 's' }} in trash
        </span>
        <button
          v-if="store.trashItems.length > 0"
          @click="handleEmpty"
          class="px-2.5 py-1 text-red-400 hover:text-white hover:bg-red-500/30 rounded border border-red-500/40 transition-colors font-medium flex items-center gap-1.5"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Empty Trash</span>
        </button>
      </div>

      <!-- List -->
      <div class="p-6 overflow-y-auto space-y-2 flex-1">
        <div v-if="store.trashItems.length > 0" class="space-y-1.5">
          <div
            v-for="item in store.trashItems"
            :key="item.id"
            class="flex items-center justify-between p-3 rounded-lg border border-[#2d2d34] bg-[#24242c] hover:bg-[#2a2a34] transition-all"
          >
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <component
                :is="item.is_dir ? Folder : FileText"
                class="w-5 h-5 shrink-0"
                :class="item.is_dir ? 'text-amber-400' : 'text-zinc-400'"
              />
              <div class="min-w-0 flex-1">
                <div class="text-xs font-medium text-zinc-200 truncate">
                  {{ item.original_relative_path }}
                </div>
                <div class="text-[11px] text-zinc-500 flex items-center gap-2">
                  <span>Deleted {{ formatDate(item.deleted_at) }}</span>
                  <span>•</span>
                  <span>{{ formatSize(item.size) }}</span>
                </div>
              </div>
            </div>

            <div class="ml-3 shrink-0">
              <button
                @click="handleRestore(item.id)"
                class="px-2.5 py-1 text-xs bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 rounded font-medium transition-colors flex items-center gap-1"
                title="Restore note to vault"
              >
                <RotateCcw class="w-3.5 h-3.5" />
                <span>Restore</span>
              </button>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-12 text-zinc-500 text-xs flex flex-col items-center gap-2">
          <Trash2 class="w-8 h-8 opacity-40 text-zinc-600 mb-1" />
          <p>Trash is empty.</p>
        </div>
      </div>
    </div>
  </div>
</template>
