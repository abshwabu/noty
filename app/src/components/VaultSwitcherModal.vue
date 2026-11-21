<script setup lang="ts">
import { ref } from 'vue';
import { useVaultStore } from '../stores/vault';
import {
  FolderOpen,
  PlusCircle,
  Clock,
  Trash2,
  X,
  CheckCircle2,
  Folder,
  Sparkles,
} from 'lucide-vue-next';

const store = useVaultStore();

const newVaultName = ref('');
const isCreating = ref(false);

async function handleOpenPicker() {
  await store.pickAndOpenVault();
}

async function handleOpenRecent(path: string) {
  await store.openVault(path);
}

async function handleRemoveRecent(e: Event, path: string) {
  e.stopPropagation();
  await store.removeRecentVault(path);
}

async function handleCreateVault() {
  if (!newVaultName.value.trim()) return;
  try {
    isCreating.value = true;
    await store.createVault(newVaultName.value.trim());
    newVaultName.value = '';
  } finally {
    isCreating.value = false;
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
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none"
    @click.self="store.hasActiveVault ? (store.showVaultSwitcher = false) : null"
  >
    <div class="bg-[#1e1e24] border border-[#3f3f46] w-full max-w-xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-[#2d2d34] flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
            <FolderOpen class="w-4 h-4" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-zinc-100">Vault Switcher</h2>
            <p class="text-xs text-zinc-400">Open an existing Obsidian / markdown vault or create a new one</p>
          </div>
        </div>
        <button
          v-if="store.hasActiveVault"
          @click="store.showVaultSwitcher = false"
          class="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 overflow-y-auto space-y-6">
        <!-- Quick Actions -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <!-- Open Folder -->
          <button
            @click="handleOpenPicker"
            class="flex items-center gap-3 p-3.5 rounded-lg border border-[#3f3f46] bg-[#272730] hover:bg-[#2e2e3a] hover:border-purple-500/50 transition-all text-left group"
          >
            <div class="w-9 h-9 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <FolderOpen class="w-5 h-5" />
            </div>
            <div>
              <div class="text-xs font-semibold text-zinc-100 group-hover:text-purple-300">Open Folder as Vault</div>
              <div class="text-[11px] text-zinc-400">Select an existing folder or Obsidian vault</div>
            </div>
          </button>

          <!-- Create Section -->
          <div class="flex flex-col justify-center p-3.5 rounded-lg border border-[#3f3f46] bg-[#272730]">
            <div class="text-xs font-semibold text-zinc-100 mb-2 flex items-center gap-1.5">
              <PlusCircle class="w-3.5 h-3.5 text-purple-400" />
              <span>Create New Vault</span>
            </div>
            <form @submit.prevent="handleCreateVault" class="flex gap-2">
              <input
                v-model="newVaultName"
                type="text"
                placeholder="Vault name..."
                class="flex-1 bg-[#18181e] border border-[#3f3f46] rounded px-2.5 py-1 text-xs text-white outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                :disabled="!newVaultName.trim() || isCreating"
                class="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
              >
                Create
              </button>
            </form>
          </div>
        </div>

        <!-- Recent Vaults List -->
        <div>
          <div class="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Clock class="w-3.5 h-3.5 text-zinc-500" />
            <span>Recent Vaults</span>
          </div>

          <div v-if="store.recentVaults.length > 0" class="space-y-1.5">
            <div
              v-for="vault in store.recentVaults"
              :key="vault.path"
              @click="handleOpenRecent(vault.path)"
              class="flex items-center justify-between p-3 rounded-lg border border-[#2d2d34] bg-[#24242c] hover:bg-[#2b2b36] hover:border-purple-500/40 cursor-pointer transition-all group"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <Folder class="w-5 h-5 text-zinc-400 group-hover:text-purple-400 shrink-0" />
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-medium text-zinc-200 flex items-center gap-2">
                    <span class="truncate">{{ vault.name }}</span>
                    <span
                      v-if="store.currentVault?.path === vault.path"
                      class="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-normal flex items-center gap-1"
                    >
                      <CheckCircle2 class="w-3 h-3" />
                      Current
                    </span>
                  </div>
                  <div class="text-[11px] text-zinc-500 truncate" :title="vault.path">
                    {{ vault.path }}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-3 shrink-0 ml-3">
                <span class="text-[10px] text-zinc-500">
                  {{ formatDate(vault.last_opened) }}
                </span>
                <button
                  @click="(e) => handleRemoveRecent(e, vault.path)"
                  class="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove from recents"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-6 text-zinc-500 text-xs italic">
            No recent vaults found. Open or create a vault above.
          </div>
        </div>

        <!-- Android / Platform notice -->
        <div class="bg-purple-950/20 border border-purple-800/30 rounded-lg p-3 text-xs text-purple-200/80 flex items-start gap-2.5">
          <Sparkles class="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <span class="font-medium text-purple-300">Obsidian & Android Ready:</span>
            Existing <code class="text-purple-200 bg-purple-900/40 px-1 rounded">.obsidian</code> settings, attachment folders, and themes are automatically discovered. On Android, vaults default to app-private storage or any selected SAF folder.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
