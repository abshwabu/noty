<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue';
import {
  X,
  XCircle,
  Pin,
  PinOff,
  SplitSquareVertical,
  SplitSquareHorizontal,
  ExternalLink,
  Copy,
  Link2,
} from 'lucide-vue-next';

const props = defineProps<{
  x: number;
  y: number;
  leafId: string;
  tabId: string;
  isPinned: boolean;
  path: string;
}>();

const emit = defineEmits<{
  (e: 'action', action: 'close' | 'close-others' | 'close-right' | 'close-all' | 'toggle-pin' | 'split-right' | 'split-down' | 'popout' | 'copy-path' | 'link'): void;
  (e: 'close'): void;
}>();

const posTop = computed(() => {
  const height = typeof window !== 'undefined' ? window.innerHeight : 800;
  return `${Math.min(props.y, height - 280)}px`;
});

const posLeft = computed(() => {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
  return `${Math.min(props.x, width - 200)}px`;
});

function handleAction(action: any) {
  emit('action', action);
  emit('close');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

function handleClickOutside(e: MouseEvent) {
  const el = document.getElementById('tab-context-menu');
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
    id="tab-context-menu"
    class="fixed z-50 min-w-48 bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded-md shadow-2xl py-1 text-xs text-[var(--text-normal)] select-none backdrop-blur-md"
    :style="{ top: posTop, left: posLeft }"
  >
    <div
      @click="handleAction('close')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
    >
      <X class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Close</span>
    </div>

    <div
      @click="handleAction('close-others')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
    >
      <XCircle class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Close others</span>
    </div>

    <div
      @click="handleAction('close-right')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
    >
      <X class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Close tabs to the right</span>
    </div>

    <div
      @click="handleAction('close-all')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer border-b border-[var(--background-modifier-border)]"
    >
      <XCircle class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Close all</span>
    </div>

    <div
      @click="handleAction('toggle-pin')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
    >
      <component :is="isPinned ? PinOff : Pin" class="w-3.5 h-3.5 text-[var(--text-accent)]" />
      <span>{{ isPinned ? 'Unpin tab' : 'Pin tab' }}</span>
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
      @click="handleAction('link')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
    >
      <Link2 class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Link with pane...</span>
    </div>

    <div
      @click="handleAction('popout')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer"
    >
      <ExternalLink class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Open in popout window</span>
    </div>

    <div
      @click="handleAction('copy-path')"
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer border-t border-[var(--background-modifier-border)]"
    >
      <Copy class="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <span>Copy note path</span>
    </div>
  </div>
</template>
