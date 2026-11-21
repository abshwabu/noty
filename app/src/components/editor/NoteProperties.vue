<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Tag,
  Calendar,
  CheckSquare,
  Hash,
  AlignLeft,
} from 'lucide-vue-next';

export interface PropertyField {
  key: string;
  type: 'text' | 'list' | 'number' | 'checkbox' | 'date';
  value: any;
}

const props = defineProps<{
  content: string;
}>();

const emit = defineEmits<{
  (e: 'update:content', newContent: string): void;
}>();

const isFolded = ref(false);
const showAddMenu = ref(false);
const newPropKey = ref('');
const newPropType = ref<'text' | 'list' | 'number' | 'checkbox' | 'date'>('text');

// Extract frontmatter string from full document
const frontmatterMatch = computed(() => {
  const match = props.content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return match;
});

const rawYaml = computed(() => {
  return frontmatterMatch.value ? frontmatterMatch.value[1] : null;
});

const properties = ref<PropertyField[]>([]);

// Infer property type from value
function inferType(key: string, val: any): PropertyField['type'] {
  if (key === 'tags' || Array.isArray(val)) return 'list';
  if (typeof val === 'boolean') return 'checkbox';
  if (typeof val === 'number') return 'number';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return 'date';
  return 'text';
}

// Parse YAML into reactive property items
function parseProperties() {
  if (!rawYaml.value) {
    properties.value = [];
    return;
  }
  try {
    const parsed = yamlLoad(rawYaml.value) as Record<string, any> | null;
    if (parsed && typeof parsed === 'object') {
      properties.value = Object.entries(parsed).map(([key, val]) => ({
        key,
        type: inferType(key, val),
        value: Array.isArray(val) ? [...val] : val,
      }));
      return;
    }
  } catch (err) {
    console.warn('Failed to parse frontmatter YAML:', err);
  }
  properties.value = [];
}

// Watch content changes and update parsed properties
watch(
  () => rawYaml.value,
  () => {
    parseProperties();
  },
  { immediate: true }
);

// Save updated properties back to document
function saveProperties() {
  const obj: Record<string, any> = {};
  for (const prop of properties.value) {
    if (!prop.key.trim()) continue;
    let val = prop.value;
    if (prop.type === 'number') {
      val = val === '' ? null : Number(val);
    } else if (prop.type === 'checkbox') {
      val = Boolean(val);
    } else if (prop.type === 'list') {
      val = Array.isArray(val) ? val : [val].filter(Boolean);
    }
    obj[prop.key] = val;
  }

  const newYaml = yamlDump(obj, { indent: 2, lineWidth: -1 }).trim();
  let updatedDoc = '';

  if (frontmatterMatch.value) {
    const fullHeader = frontmatterMatch.value[0];
    const body = props.content.slice(fullHeader.length);
    if (newYaml) {
      updatedDoc = `---\n${newYaml}\n---\n` + (body.startsWith('\n') ? body.slice(1) : body);
    } else {
      updatedDoc = body; // All properties removed
    }
  } else if (newYaml) {
    updatedDoc = `---\n${newYaml}\n---\n\n` + props.content;
  } else {
    return;
  }

  emit('update:content', updatedDoc);
}

function addProperty() {
  const key = newPropKey.value.trim();
  if (!key) return;

  let defaultValue: any = '';
  if (newPropType.value === 'checkbox') defaultValue = false;
  else if (newPropType.value === 'number') defaultValue = 0;
  else if (newPropType.value === 'list') defaultValue = [];
  else if (newPropType.value === 'date') defaultValue = new Date().toISOString().split('T')[0];

  properties.value.push({
    key,
    type: newPropType.value,
    value: defaultValue,
  });

  newPropKey.value = '';
  showAddMenu.value = false;
  saveProperties();
}

function removeProperty(index: number) {
  properties.value.splice(index, 1);
  saveProperties();
}

function changePropertyType(prop: PropertyField, newType: PropertyField['type']) {
  prop.type = newType;
  if (newType === 'checkbox') prop.value = Boolean(prop.value);
  else if (newType === 'number') prop.value = Number(prop.value) || 0;
  else if (newType === 'list') prop.value = Array.isArray(prop.value) ? prop.value : [String(prop.value)].filter(Boolean);
  else if (newType === 'date') prop.value = new Date().toISOString().split('T')[0];
  saveProperties();
}

// Tag / list handling
const newTagInput = ref<Record<string, string>>({});
function addTagItem(prop: PropertyField) {
  const tag = (newTagInput.value[prop.key] || '').trim();
  if (!tag) return;
  if (!Array.isArray(prop.value)) prop.value = [];
  if (!prop.value.includes(tag)) {
    prop.value.push(tag);
    newTagInput.value[prop.key] = '';
    saveProperties();
  }
}

function removeTagItem(prop: PropertyField, tagIdx: number) {
  if (Array.isArray(prop.value)) {
    prop.value.splice(tagIdx, 1);
    saveProperties();
  }
}
</script>

<template>
  <div
    class="border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)] text-[var(--text-normal)] text-xs select-none transition-all"
  >
    <!-- Header: Properties fold toggle & count -->
    <div
      class="px-6 py-2 flex items-center justify-between cursor-pointer hover:bg-[var(--background-modifier-hover)] transition-colors"
      @click="isFolded = !isFolded"
    >
      <div class="flex items-center gap-1.5 font-semibold text-[var(--text-muted)]">
        <component :is="isFolded ? ChevronRight : ChevronDown" class="w-3.5 h-3.5" />
        <span>Properties</span>
        <span
          v-if="properties.length > 0"
          class="ml-1 px-1.5 py-0.2 rounded-full bg-[var(--background-modifier-border)] text-[10px]"
        >
          {{ properties.length }}
        </span>
      </div>

      <div class="flex items-center gap-1" @click.stop>
        <button
          @click="showAddMenu = !showAddMenu"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-border)] transition-colors flex items-center gap-1 text-[11px]"
          title="Add property"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Add property</span>
        </button>
      </div>
    </div>

    <!-- Add Property Dropdown / Bar -->
    <div
      v-if="showAddMenu && !isFolded"
      class="px-6 py-2 bg-[var(--background-secondary-alt)] border-t border-[var(--background-modifier-border)] flex flex-wrap items-center gap-2"
    >
      <input
        v-model="newPropKey"
        type="text"
        placeholder="Property name..."
        class="px-2 py-1 bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
        @keydown.enter="addProperty"
      />
      <select
        v-model="newPropType"
        class="px-2 py-1 bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded text-xs text-[var(--text-normal)] focus:outline-none"
      >
        <option value="text">Text</option>
        <option value="list">List / Tags</option>
        <option value="number">Number</option>
        <option value="checkbox">Checkbox</option>
        <option value="date">Date</option>
      </select>
      <button
        @click="addProperty"
        class="px-2.5 py-1 bg-[var(--interactive-accent)] hover:opacity-90 text-white rounded text-xs font-medium"
      >
        Add
      </button>
      <button
        @click="showAddMenu = false"
        class="px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-normal)]"
      >
        Cancel
      </button>
    </div>

    <!-- Properties List -->
    <div v-if="!isFolded && properties.length > 0" class="px-6 py-2 space-y-1.5">
      <div
        v-for="(prop, idx) in properties"
        :key="prop.key + idx"
        class="group flex items-center gap-2 py-1 hover:bg-[var(--background-modifier-hover)] rounded px-1.5 transition-colors"
      >
        <!-- Icon based on type -->
        <div class="w-4 h-4 text-[var(--text-muted)] flex items-center justify-center shrink-0">
          <Tag v-if="prop.type === 'list'" class="w-3.5 h-3.5" />
          <Hash v-else-if="prop.type === 'number'" class="w-3.5 h-3.5" />
          <CheckSquare v-else-if="prop.type === 'checkbox'" class="w-3.5 h-3.5" />
          <Calendar v-else-if="prop.type === 'date'" class="w-3.5 h-3.5" />
          <AlignLeft v-else class="w-3.5 h-3.5" />
        </div>

        <!-- Property Name -->
        <span class="w-28 truncate font-medium text-[var(--text-normal)]" :title="prop.key">
          {{ prop.key }}
        </span>

        <!-- Property Value Editor -->
        <div class="flex-1 min-w-0">
          <!-- Text Type -->
          <input
            v-if="prop.type === 'text'"
            v-model="prop.value"
            @blur="saveProperties"
            @keydown.enter="saveProperties"
            type="text"
            class="w-full px-2 py-0.5 bg-transparent hover:bg-[var(--background-primary)] border border-transparent hover:border-[var(--background-modifier-border)] focus:border-[var(--interactive-accent)] rounded text-xs focus:outline-none"
          />

          <!-- Number Type -->
          <input
            v-else-if="prop.type === 'number'"
            v-model.number="prop.value"
            @blur="saveProperties"
            @keydown.enter="saveProperties"
            type="number"
            class="w-32 px-2 py-0.5 bg-transparent hover:bg-[var(--background-primary)] border border-transparent hover:border-[var(--background-modifier-border)] focus:border-[var(--interactive-accent)] rounded text-xs focus:outline-none"
          />

          <!-- Checkbox Type -->
          <div v-else-if="prop.type === 'checkbox'" class="flex items-center">
            <input
              v-model="prop.value"
              @change="saveProperties"
              type="checkbox"
              class="w-4 h-4 rounded text-[var(--interactive-accent)] border-[var(--background-modifier-border)] focus:ring-0 cursor-pointer"
            />
          </div>

          <!-- Date Type -->
          <input
            v-else-if="prop.type === 'date'"
            v-model="prop.value"
            @change="saveProperties"
            type="date"
            class="px-2 py-0.5 bg-transparent hover:bg-[var(--background-primary)] border border-transparent hover:border-[var(--background-modifier-border)] focus:border-[var(--interactive-accent)] rounded text-xs focus:outline-none text-[var(--text-normal)]"
          />

          <!-- List / Tags Type -->
          <div v-else-if="prop.type === 'list'" class="flex flex-wrap items-center gap-1.5">
            <span
              v-for="(tag, tagIdx) in prop.value"
              :key="tagIdx"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--background-modifier-border)] text-[var(--text-accent)] text-[11px]"
            >
              <span>{{ tag }}</span>
              <button
                @click="removeTagItem(prop, Number(tagIdx))"
                class="hover:text-red-400 text-xs ml-0.5"
              >
                ×
              </button>
            </span>
            <input
              v-model="newTagInput[prop.key]"
              @keydown.enter="addTagItem(prop)"
              placeholder="+ add tag"
              class="px-1.5 py-0.5 bg-transparent text-[11px] w-20 focus:w-28 transition-all focus:outline-none text-[var(--text-normal)] placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>

        <!-- Type Selector Dropdown on hover -->
        <select
          :value="prop.type"
          @change="(e) => changePropertyType(prop, (e.target as HTMLSelectElement).value as any)"
          class="opacity-0 group-hover:opacity-100 transition-opacity bg-transparent text-[10px] text-[var(--text-muted)] cursor-pointer focus:outline-none"
        >
          <option value="text">Text</option>
          <option value="list">List</option>
          <option value="number">Number</option>
          <option value="checkbox">Checkbox</option>
          <option value="date">Date</option>
        </select>

        <!-- Delete Property Button -->
        <button
          @click="removeProperty(idx)"
          class="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-red-400 transition-opacity"
          title="Delete property"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
