<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { FileNode } from '../types/vault';
import { useVaultStore } from '../stores/vault';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  Image as ImageIcon,
  File,
} from 'lucide-vue-next';

const props = defineProps<{
  node: FileNode;
  depth?: number;
}>();

const emit = defineEmits<{
  (e: 'context-menu', event: { x: number; y: number; isFolder: boolean; relativePath: string }): void;
  (e: 'inline-create', event: { parentRelPath: string; isDir: boolean }): void;
}>();

const store = useVaultStore();
const depth = computed(() => props.depth || 0);

const isCollapsed = computed(() => store.collapsedFolders.has(props.node.relative_path));
const isActive = computed(() => !props.node.is_dir && store.activeFilePath === props.node.relative_path);

// Inline rename state
const isEditing = ref(false);
const editName = ref(props.node.name);
const inputRef = ref<HTMLInputElement | null>(null);

// Drag & drop state
const isDragOver = ref(false);

const fileIcon = computed(() => {
  if (props.node.is_dir) {
    return isCollapsed.value ? Folder : FolderOpen;
  }
  const ext = props.node.extension?.toLowerCase();
  if (ext === 'md' || ext === 'markdown') return FileText;
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext || '')) return ImageIcon;
  if (['json', 'js', 'ts', 'rs', 'html', 'css', 'yaml', 'yml'].includes(ext || '')) return FileCode;
  return File;
});

function handleClick() {
  if (props.node.is_dir) {
    store.toggleFolderCollapse(props.node.relative_path);
  } else {
    store.openFile(props.node.relative_path);
  }
}

function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  emit('context-menu', {
    x: e.clientX,
    y: e.clientY,
    isFolder: props.node.is_dir,
    relativePath: props.node.relative_path,
  });
}

// Touch long-press context menu detection for Android / mobile
let touchTimer: ReturnType<typeof setTimeout> | null = null;
let touchStartX = 0;
let touchStartY = 0;

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;

  touchTimer = setTimeout(() => {
    emit('context-menu', {
      x: touchStartX,
      y: touchStartY,
      isFolder: props.node.is_dir,
      relativePath: props.node.relative_path,
    });
    touchTimer = null;
  }, 500);
}

function handleTouchMove(e: TouchEvent) {
  if (!touchTimer) return;
  const touch = e.touches[0];
  if (Math.abs(touch.clientX - touchStartX) > 10 || Math.abs(touch.clientY - touchStartY) > 10) {
    clearTimeout(touchTimer);
    touchTimer = null;
  }
}

function handleTouchEnd() {
  if (touchTimer) {
    clearTimeout(touchTimer);
    touchTimer = null;
  }
}

function startRename() {
  editName.value = props.node.name;
  isEditing.value = true;
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus();
      // Select name without extension if file
      const dotIndex = editName.value.lastIndexOf('.');
      if (!props.node.is_dir && dotIndex > 0) {
        inputRef.value.setSelectionRange(0, dotIndex);
      } else {
        inputRef.value.select();
      }
    }
  });
}

async function commitRename() {
  if (!isEditing.value) return;
  const newName = editName.value.trim();
  isEditing.value = false;
  if (newName && newName !== props.node.name) {
    await store.renameItem(props.node.relative_path, newName);
  }
}

function cancelRename() {
  isEditing.value = false;
  editName.value = props.node.name;
}

// Drag & Drop
function handleDragStart(e: DragEvent) {
  store.draggedItemPath = props.node.relative_path;
  e.dataTransfer?.setData('text/plain', props.node.relative_path);
  e.dataTransfer!.effectAllowed = 'move';
}

function handleDragOver(e: DragEvent) {
  if (!store.draggedItemPath || store.draggedItemPath === props.node.relative_path) return;
  // Prevent dropping folder into itself
  if (props.node.is_dir && store.draggedItemPath.startsWith(props.node.relative_path + '/')) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  isDragOver.value = true;
  e.dataTransfer!.dropEffect = 'move';
}

function handleDragLeave() {
  isDragOver.value = false;
}

async function handleDrop(e: DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  isDragOver.value = false;

  const source = store.draggedItemPath || e.dataTransfer?.getData('text/plain');
  if (!source || source === props.node.relative_path) return;

  const targetFolder = props.node.is_dir
    ? props.node.relative_path
    : props.node.relative_path.split('/').slice(0, -1).join('/');

  await store.moveItem(source, targetFolder);
  store.draggedItemPath = null;
}

defineExpose({
  startRename,
});
</script>

<template>
  <div class="file-tree-item select-none text-[13px]">
    <!-- Row Item -->
    <div
      class="group flex items-center gap-1.5 px-2 py-1 my-0.5 rounded cursor-pointer transition-colors relative min-h-[38px] md:min-h-0"
      :class="[
        isActive
          ? 'bg-purple-600/25 text-purple-300 font-medium'
          : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-white',
        isDragOver ? 'bg-purple-500/30 border border-dashed border-purple-400' : '',
      ]"
      :style="{ paddingLeft: `${depth * 14 + 8}px` }"
      draggable="true"
      @click="handleClick"
      @contextmenu="handleContextMenu"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd"
      @dragstart="handleDragStart"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <!-- Folder Collapse Chevron -->
      <span
        v-if="node.is_dir"
        class="w-4 h-4 flex items-center justify-center text-zinc-400 hover:text-white shrink-0"
        @click.stop="store.toggleFolderCollapse(node.relative_path)"
      >
        <ChevronRight v-if="isCollapsed" class="w-3.5 h-3.5 transition-transform" />
        <ChevronDown v-else class="w-3.5 h-3.5 transition-transform" />
      </span>
      <span v-else class="w-4 h-4 shrink-0" />

      <!-- Item Icon -->
      <component
        :is="fileIcon"
        class="w-4 h-4 shrink-0"
        :class="[
          node.is_dir
            ? 'text-amber-400/80 group-hover:text-amber-400'
            : isActive
            ? 'text-purple-400'
            : 'text-zinc-400 group-hover:text-zinc-300',
        ]"
      />

      <!-- Node Name / Inline Editor -->
      <div v-if="isEditing" class="flex-1" @click.stop>
        <input
          ref="inputRef"
          v-model="editName"
          class="w-full bg-[#18181b] border border-purple-500 text-white px-1.5 py-0.5 rounded text-xs outline-none focus:ring-1 focus:ring-purple-400"
          @keydown.enter="commitRename"
          @keydown.esc="cancelRename"
          @blur="commitRename"
        />
      </div>

      <span v-else class="flex-1 truncate tracking-tight" :title="node.name">
        {{ node.name }}
      </span>
    </div>

    <!-- Recursive Children for Directories -->
    <div v-if="node.is_dir && !isCollapsed && node.children && node.children.length > 0">
      <FileTreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        @context-menu="(ev) => emit('context-menu', ev)"
        @inline-create="(ev) => emit('inline-create', ev)"
      />
    </div>

    <!-- Empty Directory Indicator -->
    <div
      v-else-if="node.is_dir && !isCollapsed && (!node.children || node.children.length === 0)"
      class="text-xs text-zinc-500 italic py-1"
      :style="{ paddingLeft: `${(depth + 1) * 14 + 16}px` }"
    >
      (Empty folder)
    </div>
  </div>
</template>
