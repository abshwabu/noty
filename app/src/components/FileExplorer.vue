<script setup lang="ts">
import { ref } from 'vue';
import { useVaultStore } from '../stores/vault';
import type { SortOption } from '../types/vault';
import FileTreeItem from './FileTreeItem.vue';
import ContextMenu from './ContextMenu.vue';
import {
  FilePlus,
  FolderPlus,
  ArrowUpDown,
  Minimize2,
  Trash2,
  Search,
  X,
  ChevronDown,
} from 'lucide-vue-next';

const store = useVaultStore();

// Context menu state
const contextMenuState = ref<{
  show: boolean;
  x: number;
  y: number;
  isFolder: boolean;
  relativePath: string;
}>({
  show: false,
  x: 0,
  y: 0,
  isFolder: false,
  relativePath: '',
});

// Inline creation modal / prompt state
const creationModal = ref<{
  show: boolean;
  isFolder: boolean;
  parentRelPath: string;
  name: string;
}>({
  show: false,
  isFolder: false,
  parentRelPath: '',
  name: '',
});

// Sort dropdown
const showSortDropdown = ref(false);
const sortOptions: { label: string; value: SortOption }[] = [
  { label: 'File name (A to Z)', value: 'name-asc' },
  { label: 'File name (Z to A)', value: 'name-desc' },
  { label: 'Modified time (new to old)', value: 'modified-desc' },
  { label: 'Modified time (old to new)', value: 'modified-asc' },
];

// Root drop zone
const isRootDragOver = ref(false);

function handleContextMenu(event: { x: number; y: number; isFolder: boolean; relativePath: string }) {
  contextMenuState.value = {
    show: true,
    ...event,
  };
}

function handleContextSelect(action: 'new-note' | 'new-folder' | 'rename' | 'delete' | 'copy-path') {
  const { relativePath, isFolder } = contextMenuState.value;

  if (action === 'new-note') {
    openCreationModal(isFolder ? relativePath : getParentRelPath(relativePath), false);
  } else if (action === 'new-folder') {
    openCreationModal(isFolder ? relativePath : getParentRelPath(relativePath), true);
  } else if (action === 'delete') {
    store.deleteItem(relativePath);
  } else if (action === 'copy-path') {
    navigator.clipboard.writeText(relativePath);
  }
}

function getParentRelPath(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

function openCreationModal(parentRelPath: string = '', isFolder: boolean = false) {
  creationModal.value = {
    show: true,
    isFolder,
    parentRelPath,
    name: '',
  };
}

async function handleCreateSubmit() {
  const name = creationModal.value.name.trim();
  if (!name) return;

  if (creationModal.value.isFolder) {
    await store.createFolder(creationModal.value.parentRelPath, name);
  } else {
    await store.createFile(creationModal.value.parentRelPath, name);
  }
  creationModal.value.show = false;
}

function collapseAll() {
  const collectFolderPaths = (nodes: any[]): string[] => {
    let paths: string[] = [];
    for (const node of nodes) {
      if (node.is_dir) {
        paths.push(node.relative_path);
        if (node.children) {
          paths = paths.concat(collectFolderPaths(node.children));
        }
      }
    }
    return paths;
  };
  const allFolders = collectFolderPaths(store.fileTree);
  store.collapsedFolders = new Set(allFolders);
  store.saveWorkspaceConfig();
}

// Dragging to root folder
function handleRootDragOver(e: DragEvent) {
  if (!store.draggedItemPath) return;
  // If already at root (no slash), skip
  if (!store.draggedItemPath.includes('/')) return;
  e.preventDefault();
  isRootDragOver.value = true;
}

async function handleRootDrop(e: DragEvent) {
  e.preventDefault();
  isRootDragOver.value = false;
  if (store.draggedItemPath && store.draggedItemPath.includes('/')) {
    await store.moveItem(store.draggedItemPath, '');
    store.draggedItemPath = null;
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-[#1c1c20] border-r border-[#27272a] select-none text-zinc-300">
    <!-- Vault Switcher Header -->
    <div class="p-3 border-b border-[#27272a] flex items-center justify-between gap-2">
      <button
        @click="store.showVaultSwitcher = true"
        class="flex items-center gap-2 hover:bg-zinc-800/80 px-2 py-1.5 rounded text-left flex-1 min-w-0 transition-colors group"
      >
        <div class="w-6 h-6 rounded bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0">
          {{ store.currentVault?.name?.charAt(0)?.toUpperCase() || 'V' }}
        </div>
        <div class="truncate flex-1">
          <div class="text-xs font-semibold text-zinc-100 truncate group-hover:text-purple-300 flex items-center gap-1.5">
            <span>{{ store.currentVault?.name || 'No Vault Open' }}</span>
            <span
              v-if="store.currentVault?.has_obsidian"
              class="px-1 py-0.2 text-[10px] bg-purple-500/20 text-purple-300 rounded font-normal shrink-0"
              title="Obsidian format detected"
            >
              Obsidian
            </span>
          </div>
          <div class="text-[10px] text-zinc-500 truncate" :title="store.currentVault?.path">
            {{ store.currentVault?.path || 'Click to select or create' }}
          </div>
        </div>
        <ChevronDown class="w-3.5 h-3.5 text-zinc-400 group-hover:text-white shrink-0" />
      </button>
    </div>

    <!-- Toolbar: New note, New folder, Sort, Trash -->
    <div class="px-3 py-2 flex items-center justify-between border-b border-[#27272a]/60 text-zinc-400">
      <span class="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Files</span>
      <div class="flex items-center gap-1">
        <!-- New Note -->
        <button
          @click="openCreationModal('', false)"
          class="p-1 hover:text-white hover:bg-zinc-800 rounded transition-colors"
          title="New Note (at root)"
        >
          <FilePlus class="w-4 h-4" />
        </button>

        <!-- New Folder -->
        <button
          @click="openCreationModal('', true)"
          class="p-1 hover:text-white hover:bg-zinc-800 rounded transition-colors"
          title="New Folder"
        >
          <FolderPlus class="w-4 h-4" />
        </button>

        <!-- Sort Menu -->
        <div class="relative">
          <button
            @click="showSortDropdown = !showSortDropdown"
            class="p-1 hover:text-white hover:bg-zinc-800 rounded transition-colors"
            title="Sort options"
          >
            <ArrowUpDown class="w-4 h-4" />
          </button>
          <div
            v-if="showSortDropdown"
            class="absolute right-0 top-7 z-40 w-52 bg-[#1f1f23] border border-[#3f3f46] rounded-md shadow-xl py-1 text-xs"
          >
            <div
              v-for="opt in sortOptions"
              :key="opt.value"
              @click="store.setSortBy(opt.value); showSortDropdown = false"
              class="px-3 py-1.5 cursor-pointer hover:bg-purple-600/30 flex items-center justify-between"
              :class="store.sortBy === opt.value ? 'text-purple-300 font-semibold' : 'text-zinc-300'"
            >
              <span>{{ opt.label }}</span>
              <span v-if="store.sortBy === opt.value">✓</span>
            </div>
          </div>
        </div>

        <!-- Collapse All -->
        <button
          @click="collapseAll"
          class="p-1 hover:text-white hover:bg-zinc-800 rounded transition-colors"
          title="Collapse all folders"
        >
          <Minimize2 class="w-4 h-4" />
        </button>

        <!-- Trash -->
        <button
          @click="store.showTrashModal = true"
          class="p-1 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
          title="Open Trash (.trash)"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Search / Filter input -->
    <div class="px-3 py-1.5 border-b border-[#27272a]/40">
      <div class="relative flex items-center">
        <Search class="w-3.5 h-3.5 absolute left-2 text-zinc-500 pointer-events-none" />
        <input
          v-model="store.searchQuery"
          type="text"
          placeholder="Filter notes..."
          class="w-full bg-[#141416] text-zinc-200 text-xs rounded pl-7 pr-6 py-1 border border-transparent focus:border-purple-500/50 outline-none placeholder:text-zinc-600"
        />
        <button
          v-if="store.searchQuery"
          @click="store.searchQuery = ''"
          class="absolute right-1.5 text-zinc-500 hover:text-zinc-300"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- File Tree List -->
    <div
      class="flex-1 overflow-y-auto px-1 py-1 relative"
      @dragover="handleRootDragOver"
      @dragleave="isRootDragOver = false"
      @drop="handleRootDrop"
    >
      <!-- Tree Nodes -->
      <template v-if="store.sortedFileTree.length > 0">
        <FileTreeItem
          v-for="node in store.sortedFileTree"
          :key="node.id"
          :node="node"
          @context-menu="handleContextMenu"
          @inline-create="(ev) => openCreationModal(ev.parentRelPath, ev.isDir)"
        />
      </template>

      <!-- Empty State -->
      <div v-else class="p-6 text-center text-zinc-500 text-xs flex flex-col items-center gap-3">
        <p v-if="store.searchQuery">No files matching "{{ store.searchQuery }}"</p>
        <template v-else>
          <p>Vault is empty</p>
          <button
            @click="openCreationModal('', false)"
            class="px-3 py-1.5 bg-purple-600/30 text-purple-300 hover:bg-purple-600/40 rounded text-xs transition-colors flex items-center gap-1.5"
          >
            <FilePlus class="w-3.5 h-3.5" />
            <span>Create first note</span>
          </button>
        </template>
      </div>

      <!-- Root Dropzone Highlight -->
      <div
        v-if="isRootDragOver"
        class="mx-2 my-2 p-2 border-2 border-dashed border-purple-500/80 bg-purple-500/10 rounded text-center text-xs text-purple-300 pointer-events-none"
      >
        Move to root
      </div>
    </div>

    <!-- Creation Dialog Modal -->
    <div
      v-if="creationModal.show"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      @click.self="creationModal.show = false"
    >
      <div class="bg-[#202024] border border-[#3f3f46] w-full max-w-sm rounded-lg shadow-2xl p-4 text-zinc-200">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <component :is="creationModal.isFolder ? FolderPlus : FilePlus" class="w-4 h-4 text-purple-400" />
          <span>{{ creationModal.isFolder ? 'Create New Folder' : 'Create New Note' }}</span>
        </h3>
        <p v-if="creationModal.parentRelPath" class="text-xs text-zinc-500 mb-2 truncate">
          Inside: <span class="text-zinc-300">{{ creationModal.parentRelPath }}</span>
        </p>
        <form @submit.prevent="handleCreateSubmit">
          <input
            v-model="creationModal.name"
            autofocus
            type="text"
            :placeholder="creationModal.isFolder ? 'Folder name...' : 'Note title...'"
            class="w-full bg-[#141416] border border-[#3f3f46] rounded px-3 py-2 text-sm text-white outline-none focus:border-purple-500 mb-4"
          />
          <div class="flex justify-end gap-2 text-xs">
            <button
              type="button"
              @click="creationModal.show = false"
              class="px-3 py-1.5 rounded hover:bg-zinc-700/60 text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Context Menu -->
    <ContextMenu
      v-if="contextMenuState.show"
      :x="contextMenuState.x"
      :y="contextMenuState.y"
      :is-folder="contextMenuState.isFolder"
      :relative-path="contextMenuState.relativePath"
      @select="handleContextSelect"
      @close="contextMenuState.show = false"
    />
  </div>
</template>
