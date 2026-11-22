<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Sigma,
  Table,
  Minus,
  Calendar,
  Clock,
  LayoutTemplate,
  GitBranch,
  Sparkles,
} from 'lucide-vue-next';

export interface SlashItem {
  id: string;
  title: string;
  description: string;
  icon: any;
  action: () => void;
}

const props = defineProps<{
  filter: string;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  (e: 'select', item: SlashItem): void;
  (e: 'close'): void;
}>();

const selectedIndex = ref(0);

const items: SlashItem[] = [
  {
    id: 'h1',
    title: 'Heading 1',
    description: 'Big section heading',
    icon: Heading1,
    action: () => {},
  },
  {
    id: 'h2',
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: Heading2,
    action: () => {},
  },
  {
    id: 'h3',
    title: 'Heading 3',
    description: 'Small subsection heading',
    icon: Heading3,
    action: () => {},
  },
  {
    id: 'task',
    title: 'To-do List',
    description: 'Checkbox task item',
    icon: CheckSquare,
    action: () => {},
  },
  {
    id: 'bullet',
    title: 'Bullet List',
    description: 'Simple bulleted list',
    icon: List,
    action: () => {},
  },
  {
    id: 'number',
    title: 'Numbered List',
    description: 'Ordered numbering list',
    icon: ListOrdered,
    action: () => {},
  },
  {
    id: 'callout',
    title: 'Callout Note',
    description: 'Styled callout box (> [!note])',
    icon: Sparkles,
    action: () => {},
  },
  {
    id: 'quote',
    title: 'Quote',
    description: 'Blockquote line',
    icon: Quote,
    action: () => {},
  },
  {
    id: 'code',
    title: 'Code Block',
    description: 'Syntax highlighted code block',
    icon: Code,
    action: () => {},
  },
  {
    id: 'math',
    title: 'Math Block',
    description: 'KaTeX display equation ($$)',
    icon: Sigma,
    action: () => {},
  },
  {
    id: 'table',
    title: 'Table',
    description: 'Markdown grid table',
    icon: Table,
    action: () => {},
  },
  {
    id: 'hr',
    title: 'Divider',
    description: 'Horizontal line divider',
    icon: Minus,
    action: () => {},
  },
  {
    id: 'mermaid',
    title: 'Mermaid Diagram',
    description: 'Flowchart or sequence diagram',
    icon: GitBranch,
    action: () => {},
  },
  {
    id: 'template',
    title: 'Insert Template',
    description: 'Choose template with variables',
    icon: LayoutTemplate,
    action: () => {},
  },
  {
    id: 'date',
    title: 'Today\'s Date',
    description: 'Insert current date (YYYY-MM-DD)',
    icon: Calendar,
    action: () => {},
  },
  {
    id: 'time',
    title: 'Current Time',
    description: 'Insert current time (HH:mm)',
    icon: Clock,
    action: () => {},
  },
];

const filteredItems = computed(() => {
  const q = props.filter.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) => item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
  );
});

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    selectedIndex.value = (selectedIndex.value + 1) % Math.max(1, filteredItems.value.length);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    selectedIndex.value =
      (selectedIndex.value - 1 + filteredItems.value.length) % Math.max(1, filteredItems.value.length);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (filteredItems.value[selectedIndex.value]) {
      emit('select', filteredItems.value[selectedIndex.value]);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, true);
});
</script>

<template>
  <div
    class="fixed z-50 bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded-xl shadow-2xl w-64 max-h-72 overflow-y-auto p-1.5 space-y-0.5 text-xs select-none backdrop-blur-md animate-in fade-in duration-100"
    :style="{ top: `${y + 8}px`, left: `${x}px` }"
  >
    <div class="px-2 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
      Slash Commands
    </div>

    <div
      v-for="(item, idx) in filteredItems"
      :key="item.id"
      @click="$emit('select', item)"
      class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
      :class="idx === selectedIndex ? 'bg-[var(--interactive-accent)] text-white' : 'hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)]'"
    >
      <component :is="item.icon" class="w-3.5 h-3.5 shrink-0" :class="idx === selectedIndex ? 'text-white' : 'text-[var(--text-accent)]'" />
      <div class="min-w-0 flex-1">
        <div class="font-medium truncate">{{ item.title }}</div>
        <div class="text-[10px] truncate" :class="idx === selectedIndex ? 'text-white/80' : 'text-[var(--text-muted)]'">
          {{ item.description }}
        </div>
      </div>
    </div>

    <div v-if="filteredItems.length === 0" class="py-4 text-center text-xs text-[var(--text-muted)] italic">
      No matching commands
    </div>
  </div>
</template>
