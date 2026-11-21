<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue';
import {
  Link,
  BookOpen,
  Edit3,
  SplitSquareVertical,
  SplitSquareHorizontal,
  ExternalLink,
} from 'lucide-vue-next';

const props = defineProps<{
  x: number;
  y: number;
  path: string;
  isReadingMode: boolean;
}>();

const emit = defineEmits<{
  (e: 'action', action: 'copy-link' | 'toggle-mode' | 'split-right' | 'split-down' | 'popout'): void;
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

function handleAction(action: any) {
  emit('action', action);
  emit('close');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

function handleClickOutside(e: MouseEvent) {
  const el = document.getElementById('editor-context-menu');
  if (el && !el.contains(e.target as Node)) emit('close');
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
    id="editor-context-menu"
    class="fixed z-50 min-w-44 bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded-md shadow-2xl py-1 text-xs text-[var(--text-normal)] select-none backdrop-blur-md"
    :style="{ top: posTop, left: posLeft }"
  >
    <div
      @click="handleAction('copy-link')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
    >
      <Link class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Copy Obsidian link</span>
    </div>

    <div
      @click="handleAction('toggle-mode')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer border-b border-[var(--background-modifier-border)]"
    >
      <component :is="isReadingMode ? Edit3 : BookOpen" class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>{{ isReadingMode ? 'Switch to Editing' : 'Switch to Reading' }}</span>
    </div>

    <div
      @click="handleAction('split-right')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
    >
      <SplitSquareVertical class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Split right</span>
    </div>

    <div
      @click="handleAction('split-down')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
    >
      <SplitSquareHorizontal class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Split down</span>
    </div>

    <div
      @click="handleAction('popout')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
    >
      <ExternalLink class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Open in popout window</span>
    </div>
  </div>
</template>
