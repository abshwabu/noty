<script setup lang="ts">
import { computed } from 'vue';
import { useVaultStore } from '../../stores/vault';
import { SlidersHorizontal, Tag, Calendar, User } from 'lucide-vue-next';

const vault = useVaultStore();

interface PropertyItem {
  key: string;
  value: string;
  type: 'text' | 'tags' | 'date';
}

const properties = computed<PropertyItem[]>(() => {
  const content = vault.activeFileContent;
  if (!content) return [];

  // Parse YAML Frontmatter
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return [
      { key: 'tags', value: 'notes, obsidian', type: 'tags' },
      { key: 'created', value: new Date().toISOString().split('T')[0], type: 'date' },
    ];
  }

  const yamlLines = match[1].split('\n');
  const result: PropertyItem[] = [];

  yamlLines.forEach((line) => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      result.push({
        key,
        value: val,
        type: key.toLowerCase().includes('tag') ? 'tags' : key.toLowerCase().includes('date') ? 'date' : 'text',
      });
    }
  });

  return result.length > 0
    ? result
    : [
        { key: 'tags', value: 'project', type: 'tags' },
        { key: 'created', value: new Date().toISOString().split('T')[0], type: 'date' },
      ];
});
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none">
    <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <SlidersHorizontal class="w-3.5 h-3.5 text-[var(--text-accent)]" />
        <span>Properties</span>
      </div>
    </div>

    <!-- Properties Key-Value Table -->
    <div class="space-y-2 flex-1 overflow-y-auto">
      <div
        v-for="prop in properties"
        :key="prop.key"
        class="border border-[var(--background-modifier-border)] rounded bg-[var(--background-secondary-alt)] p-2"
      >
        <div class="text-[10px] uppercase font-semibold text-[var(--text-muted)] mb-1 flex items-center gap-1">
          <Tag v-if="prop.type === 'tags'" class="w-3 h-3 text-[var(--text-accent)]" />
          <Calendar v-else-if="prop.type === 'date'" class="w-3 h-3 text-[var(--text-accent)]" />
          <User v-else class="w-3 h-3 text-[var(--text-accent)]" />
          <span>{{ prop.key }}</span>
        </div>
        <div class="text-xs text-[var(--text-normal)] font-mono bg-[var(--background-modifier-form-field)] px-2 py-1 rounded border border-[var(--background-modifier-border)]">
          {{ prop.value || '(empty)' }}
        </div>
      </div>
    </div>
  </div>
</template>
