<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../../stores/vault';
import { useWorkspaceStore } from '../../stores/workspace';
import {
  Table as TableIcon,
  Plus,
  ArrowUpDown,
  Search,
  FileText,
} from 'lucide-vue-next';

interface BaseConfig {
  title: string;
  folder: string;
  tagFilter: string;
  columns: string[];
  sortBy: string;
  sortDesc: boolean;
  groupBy: string;
  filterText: string;
}

interface NoteRow {
  path: string;
  title: string;
  properties: Record<string, any>;
  rawContent: string;
}

const props = defineProps<{
  path: string;
  leafId?: string;
}>();

const vault = useVaultStore();
const workspace = useWorkspaceStore();

const config = ref<BaseConfig>({
  title: 'Database View',
  folder: '',
  tagFilter: '',
  columns: ['title', 'status', 'tags', 'priority', 'date'],
  sortBy: 'title',
  sortDesc: false,
  groupBy: '',
  filterText: '',
});

const rows = ref<NoteRow[]>([]);
const isLoading = ref(false);
const saveStatus = ref<'Saved' | 'Saving...'>('Saved');

async function loadBase() {
  isLoading.value = true;
  try {
    const raw = await invoke<string>('vault_read_file', { relativePath: props.path });
    if (raw && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        config.value = { ...config.value, ...parsed };
      } catch {}
    }
    await loadNotesData();
  } finally {
    isLoading.value = false;
  }
}

async function loadNotesData() {
  const loadedRows: NoteRow[] = [];
  const targetFolder = config.value.folder?.trim().toLowerCase();

  for (const relPath of vault.allFilePaths) {
    if (!relPath.endsWith('.md')) continue;
    if (targetFolder && !relPath.toLowerCase().startsWith(targetFolder)) continue;

    try {
      const content = await invoke<string>('vault_read_file', { relativePath: relPath });
      const propsMap = extractFrontmatterProps(content);

      if (config.value.tagFilter) {
        const targetTag = config.value.tagFilter.replace(/^#/, '').toLowerCase();
        const tags = Array.isArray(propsMap.tags) ? propsMap.tags : [propsMap.tags];
        if (!tags.some((t: any) => String(t).toLowerCase().includes(targetTag))) {
          continue;
        }
      }

      const title = relPath.split('/').pop()?.replace(/\.md$/, '') || relPath;
      loadedRows.push({
        path: relPath,
        title,
        properties: propsMap,
        rawContent: content,
      });
    } catch {}
  }

  rows.value = loadedRows;
}

function extractFrontmatterProps(text: string): Record<string, any> {
  const map: Record<string, any> = {};
  if (!text.startsWith('---')) return map;
  const endIdx = text.indexOf('\n---', 3);
  if (endIdx === -1) return map;

  const yamlStr = text.slice(3, endIdx).trim();
  const lines = yamlStr.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      let val: any = line.slice(colonIdx + 1).trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val
          .slice(1, -1)
          .split(',')
          .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''));
      }
      map[key] = val;
    }
  }
  return map;
}

let saveDebounce: any = null;
function triggerSave() {
  saveStatus.value = 'Saving...';
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(async () => {
    try {
      await invoke('vault_write_file', {
        relativePath: props.path,
        content: JSON.stringify(config.value, null, 2),
      });
      saveStatus.value = 'Saved';
    } catch (e) {
      console.warn('Failed to save base configuration:', e);
    }
  }, 400);
}

// Filtered and sorted rows
const filteredRows = computed(() => {
  let list = rows.value.slice();

  // Text filter
  const filter = config.value.filterText.trim().toLowerCase();
  if (filter) {
    list = list.filter((r) => {
      if (r.title.toLowerCase().includes(filter)) return true;
      return Object.values(r.properties).some((v) =>
        String(v).toLowerCase().includes(filter)
      );
    });
  }

  // Sort
  const key = config.value.sortBy;
  const desc = config.value.sortDesc;
  if (key) {
    list.sort((a, b) => {
      const valA = key === 'title' ? a.title : a.properties[key] || '';
      const valB = key === 'title' ? b.title : b.properties[key] || '';
      const comp = String(valA).localeCompare(String(valB), undefined, { numeric: true });
      return desc ? -comp : comp;
    });
  }

  return list;
});

// Grouped rows
const groupedRows = computed<Record<string, NoteRow[]>>(() => {
  const groupKey = config.value.groupBy;
  if (!groupKey) {
    return { 'All Notes': filteredRows.value };
  }

  const groups: Record<string, NoteRow[]> = {};
  for (const r of filteredRows.value) {
    const gVal = String(r.properties[groupKey] || 'No ' + groupKey);
    if (!groups[gVal]) groups[gVal] = [];
    groups[gVal].push(r);
  }
  return groups;
});

function toggleSort(col: string) {
  if (config.value.sortBy === col) {
    config.value.sortDesc = !config.value.sortDesc;
  } else {
    config.value.sortBy = col;
    config.value.sortDesc = false;
  }
  triggerSave();
}

async function updateCell(row: NoteRow, col: string, newVal: string) {
  row.properties[col] = newVal;

  // Update markdown file frontmatter
  let content = row.rawContent;
  let newContent = '';

  if (content.startsWith('---')) {
    const endIdx = content.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const frontmatter = content.slice(3, endIdx);
      const rest = content.slice(endIdx + 4);
      const lines = frontmatter.split('\n');
      let found = false;
      const updatedLines = lines.map((l) => {
        if (l.trim().startsWith(`${col}:`)) {
          found = true;
          return `${col}: ${newVal}`;
        }
        return l;
      });
      if (!found) {
        updatedLines.push(`${col}: ${newVal}`);
      }
      newContent = `---\n${updatedLines.join('\n').trim()}\n---${rest}`;
    }
  } else {
    newContent = `---\n${col}: ${newVal}\n---\n\n${content}`;
  }

  row.rawContent = newContent;
  await invoke('vault_write_file', {
    relativePath: row.path,
    content: newContent,
  });
}

async function createNewRow() {
  const title = prompt('Enter note title:', 'Untitled Item');
  if (!title) return;

  const folder = config.value.folder?.trim() || '';
  const newPath = folder ? `${folder}/${title}.md` : `${title}.md`;

  const frontmatterLines = config.value.columns
    .filter((c) => c !== 'title')
    .map((c) => `${c}: `);

  const initialText = `---\n${frontmatterLines.join('\n')}\n---\n\n# ${title}\n`;

  await invoke('vault_write_file', {
    relativePath: newPath,
    content: initialText,
  });

  await vault.refreshTree();
  await loadNotesData();
}

function openNote(path: string) {
  workspace.openNote(path);
}

onMounted(() => {
  loadBase();
});

watch(() => props.path, () => {
  loadBase();
});
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--background-primary)] text-[var(--text-normal)] select-none overflow-hidden">
    <!-- Base Header & Controls Toolbar -->
    <div class="p-3 border-b border-[var(--background-modifier-border)] bg-[var(--background-secondary)] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
      <div class="flex items-center gap-2">
        <TableIcon class="w-4 h-4 text-[var(--text-accent)]" />
        <span class="font-bold text-sm">{{ config.title || 'Database View' }}</span>
        <span class="text-[10px] text-[var(--text-muted)] bg-[var(--background-primary)] px-2 py-0.5 rounded-full border border-[var(--background-modifier-border)]">
          {{ filteredRows.length }} items
        </span>
      </div>

      <!-- Search & Filters -->
      <div class="flex items-center gap-2">
        <div class="relative flex items-center">
          <Search class="w-3.5 h-3.5 absolute left-2 text-[var(--text-muted)] pointer-events-none" />
          <input
            v-model="config.filterText"
            @input="triggerSave"
            type="text"
            placeholder="Filter database items..."
            class="bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] rounded pl-7 pr-3 py-1 text-xs outline-none focus:border-[var(--interactive-accent)] w-44"
          />
        </div>

        <!-- Group By selector -->
        <select
          v-model="config.groupBy"
          @change="triggerSave"
          class="bg-[var(--background-secondary-alt)] border border-[var(--background-modifier-border)] rounded text-xs px-2 py-1 outline-none text-[var(--text-normal)] cursor-pointer"
        >
          <option value="">No Grouping</option>
          <option v-for="col in config.columns.filter(c => c !== 'title')" :key="col" :value="col">
            Group by {{ col }}
          </option>
        </select>

        <!-- Add Row Button -->
        <button
          @click="createNewRow"
          class="px-2.5 py-1 bg-[var(--interactive-accent)] text-white font-medium text-xs rounded hover:opacity-90 flex items-center gap-1 transition-opacity shadow-xs"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>New</span>
        </button>
      </div>
    </div>

    <!-- Table Container -->
    <div class="flex-1 overflow-auto p-4">
      <div v-for="(groupList, groupName) in groupedRows" :key="groupName" class="mb-6">
        <!-- Group Header if grouped -->
        <div v-if="config.groupBy" class="font-bold text-xs uppercase tracking-wider text-[var(--text-accent)] mb-2 flex items-center gap-1.5">
          <span>{{ groupName }}</span>
          <span class="text-[10px] text-[var(--text-muted)] font-normal">({{ groupList.length }})</span>
        </div>

        <div class="border border-[var(--background-modifier-border)] rounded-lg overflow-hidden shadow-sm bg-[var(--background-secondary)]">
          <table class="w-full text-xs text-left border-collapse">
            <!-- Table Header -->
            <thead>
              <tr class="bg-[var(--background-secondary-alt)] border-b border-[var(--background-modifier-border)] text-[var(--text-muted)]">
                <th
                  v-for="col in config.columns"
                  :key="col"
                  @click="toggleSort(col)"
                  class="p-2.5 font-semibold cursor-pointer hover:text-[var(--text-normal)] border-r border-[var(--background-modifier-border)] last:border-r-0 select-none uppercase tracking-wider text-[10px]"
                >
                  <div class="flex items-center justify-between gap-1">
                    <span>{{ col }}</span>
                    <ArrowUpDown class="w-3 h-3 opacity-60" />
                  </div>
                </th>
              </tr>
            </thead>

            <!-- Table Body -->
            <tbody class="divide-y divide-[var(--background-modifier-border)]">
              <tr
                v-for="row in groupList"
                :key="row.path"
                class="hover:bg-[var(--background-modifier-hover)] transition-colors group"
              >
                <!-- Title column (opens note on click) -->
                <td class="p-2 font-medium text-[var(--text-normal)] border-r border-[var(--background-modifier-border)]">
                  <div class="flex items-center gap-1.5 cursor-pointer hover:text-[var(--text-accent)]" @click="openNote(row.path)">
                    <FileText class="w-3.5 h-3.5 text-[var(--text-accent)] shrink-0" />
                    <span class="truncate">{{ row.title }}</span>
                  </div>
                </td>

                <!-- Dynamic Property columns (inline editable) -->
                <td
                  v-for="col in config.columns.filter(c => c !== 'title')"
                  :key="col"
                  class="p-1 border-r border-[var(--background-modifier-border)] last:border-r-0"
                >
                  <input
                    :value="Array.isArray(row.properties[col]) ? row.properties[col].join(', ') : (row.properties[col] || '')"
                    @change="updateCell(row, col, ($event.target as HTMLInputElement).value)"
                    class="w-full bg-transparent px-1.5 py-1 text-xs text-[var(--text-normal)] rounded outline-none hover:bg-[var(--background-modifier-form-field)] focus:bg-[var(--background-modifier-form-field)] focus:ring-1 focus:ring-[var(--interactive-accent)] transition-all"
                    placeholder="—"
                  />
                </td>
              </tr>

              <tr v-if="groupList.length === 0">
                <td :colspan="config.columns.length" class="p-6 text-center text-xs text-[var(--text-muted)] italic">
                  No notes found matching this view.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
