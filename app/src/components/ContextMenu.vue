<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue';
import { FilePlus, FolderPlus, Edit3, Trash2, Copy } from 'lucide-vue-next';

export interface ContextMenuAction {
  label: string;
  action: 'new-note' | 'new-folder' | 'rename' | 'delete' | 'copy-path';
  icon: any;
  danger?: boolean;
}

const props = defineProps<{
  x: number;
  y: number;
  isFolder: boolean;
  relativePath: string;
}>();

const emit = defineEmits<{
  (e: 'select', action: 'new-note' | 'new-folder' | 'rename' | 'delete' | 'copy-path'): void;
  (e: 'close'): void;
}>();

const posTop = computed(() => {
  const height = typeof window !== 'undefined' ? window.innerHeight : 800;
  return `${Math.min(props.y, height - 200)}px`;
});

const posLeft = computed(() => {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
  return `${Math.min(props.x, width - 180)}px`;
});

const actions: ContextMenuAction[] = [
  ...(props.isFolder
    ? [
        { label: 'New Note in Folder', action: 'new-note' as const, icon: FilePlus },
        { label: 'New Subfolder', action: 'new-folder' as const, icon: FolderPlus },
      ]
    : []),
  { label: 'Rename', action: 'rename' as const, icon: Edit3 },
  { label: 'Copy Path', action: 'copy-path' as const, icon: Copy },
  { label: 'Move to Trash', action: 'delete' as const, icon: Trash2, danger: true },
];

function handleAction(action: 'new-note' | 'new-folder' | 'rename' | 'delete' | 'copy-path') {
  emit('select', action);
  emit('close');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}

function handleClickOutside(e: MouseEvent) {
  const el = document.getElementById('vault-context-menu');
  if (el && !el.contains(e.target as Node)) {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('mousedown', handleClickOutside);
});
</script>

<template>
  <div
    id="vault-context-menu"
    class="fixed z-50 min-w-44 bg-[#1f1f23] border border-[#3f3f46] rounded-md shadow-2xl py-1 text-sm text-zinc-200 select-none backdrop-blur-md"
    :style="{
      top: posTop,
      left: posLeft,
    }"
  >
    <div
      v-for="item in actions"
      :key="item.action"
      @click.stop="handleAction(item.action)"
      class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors"
      :class="item.danger ? 'text-red-400 hover:bg-red-500/20' : 'hover:bg-[#323238] hover:text-white'"
    >
      <component :is="item.icon" class="w-4 h-4 opacity-75" />
      <span>{{ item.label }}</span>
    </div>
  </div>
</template>
