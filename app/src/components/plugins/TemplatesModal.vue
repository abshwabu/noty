<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import { getAvailableTemplates, readAndResolveTemplate } from '../../services/templates';
import { FileText, X, LayoutTemplate } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const workspace = useWorkspaceStore();

const query = ref('');
const selectedIndex = ref(0);
const templates = ref<string[]>([]);

onMounted(() => {
  templates.value = getAvailableTemplates();
});

const filteredTemplates = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return templates.value;
  return templates.value.filter((t) => t.toLowerCase().includes(q));
});

async function chooseTemplate(path: string) {
  const activePath = workspace.activeNotePath || 'Untitled';
  const title = activePath.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';

  const resolved = await readAndResolveTemplate(path, title);

  // Dispatch text insertion event to the active note editor
  window.dispatchEvent(
    new CustomEvent('noty:insert-text', {
      detail: { text: resolved },
    })
  );

  emit('close');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % Math.max(1, filteredTemplates.value.length);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value =
      (selectedIndex.value - 1 + filteredTemplates.value.length) % Math.max(1, filteredTemplates.value.length);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (filteredTemplates.value[selectedIndex.value]) {
      chooseTemplate(filteredTemplates.value[selectedIndex.value]);
    }
  } else if (e.key === 'Escape') {
    emit('close');
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/70 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150"
    @click.self="$emit('close')"
  >
    <div
      class="bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-[var(--text-normal)]"
      @keydown="handleKeydown"
    >
      <!-- Search Input -->
      <div class="relative flex items-center p-3 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)]">
        <LayoutTemplate class="w-4 h-4 text-[var(--text-accent)] mr-2 shrink-0" />
        <input
          v-model="query"
          type="text"
          placeholder="Choose template to insert..."
          autofocus
          class="flex-1 bg-transparent text-sm text-[var(--text-normal)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <button
          @click="$emit('close')"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)]"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Template List -->
      <div class="max-h-72 overflow-y-auto p-1.5 space-y-1">
        <div
          v-if="filteredTemplates.length > 0"
          v-for="(tpl, idx) in filteredTemplates"
          :key="tpl"
          @click="chooseTemplate(tpl)"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors"
          :class="idx === selectedIndex ? 'bg-[var(--interactive-accent)] text-white' : 'hover:bg-[var(--background-modifier-hover)] text-[var(--text-normal)]'"
        >
          <FileText class="w-3.5 h-3.5 shrink-0" :class="idx === selectedIndex ? 'text-white' : 'text-[var(--text-accent)]'" />
          <div class="truncate flex-1 font-medium">{{ tpl.split('/').pop()?.replace(/\.md$/, '') }}</div>
          <span class="text-[10px] opacity-75 font-mono truncate max-w-[150px]">{{ tpl }}</span>
        </div>

        <div v-else class="py-8 text-center text-xs text-[var(--text-muted)] italic">
          <div v-if="templates.length === 0">
            No templates found. Create a markdown note in your <code class="text-[var(--text-accent)]">templates/</code> folder.
          </div>
          <div v-else>
            No templates matching "{{ query }}"
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
