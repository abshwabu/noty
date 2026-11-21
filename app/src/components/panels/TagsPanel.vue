<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Tag, Hash, ChevronDown, ChevronRight } from 'lucide-vue-next';
import { useWorkspaceStore } from '../../stores/workspace';
import { useVaultStore } from '../../stores/vault';
import { getTags } from '../../services/metadata';
import type { TagCountItem } from '../../types/metadata';

const workspace = useWorkspaceStore();
const vault = useVaultStore();

const rawTags = ref<TagCountItem[]>([]);
const collapsedMap = ref<Record<string, boolean>>({});

interface TagTreeNode {
  name: string;
  fullTag: string;
  count: number;
  children: TagTreeNode[];
}

async function loadTags() {
  try {
    rawTags.value = await getTags();
  } catch (err) {
    console.warn('Failed to load tags:', err);
  }
}

// Build nested tag tree from raw tags e.g. ["project/tauri/mobile", "project/backend"]
const tagTree = computed<TagTreeNode[]>(() => {
  const rootNodes: Record<string, any> = {};

  for (const item of rawTags.value) {
    const parts = item.tag.split('/');
    let currentLevel = rootNodes;
    let accumulatedPath = '';

    parts.forEach((part, idx) => {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      if (!currentLevel[part]) {
        currentLevel[part] = {
          name: part,
          fullTag: accumulatedPath,
          count: 0,
          childrenMap: {},
        };
      }
      if (idx === parts.length - 1) {
        currentLevel[part].count += item.count;
      }
      currentLevel = currentLevel[part].childrenMap;
    });
  }

  function convertMapToTree(map: Record<string, any>): TagTreeNode[] {
    return Object.values(map)
      .map((node) => ({
        name: node.name,
        fullTag: node.fullTag,
        count: node.count,
        children: convertMapToTree(node.childrenMap),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  return convertMapToTree(rootNodes);
});

function handleTagClick(fullTag: string) {
  // Activate search panel with #tag
  vault.searchQuery = `#${fullTag}`;
  workspace.layout.leftSidebar.activePanel = 'search';
  workspace.layout.leftSidebar.collapsed = false;
}

function toggleCollapse(fullTag: string, e: MouseEvent) {
  e.stopPropagation();
  collapsedMap.value[fullTag] = !collapsedMap.value[fullTag];
}

onMounted(() => {
  loadTags();
});
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none overflow-hidden">
    <!-- Header -->
    <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <Tag class="w-3.5 h-3.5 text-[var(--text-accent)]" />
        <span>Tags</span>
      </div>
      <span v-if="rawTags.length > 0" class="text-[10px] bg-[var(--background-secondary)] px-1.5 py-0.2 rounded-full">
        {{ rawTags.length }}
      </span>
    </div>

    <!-- Empty State -->
    <div v-if="rawTags.length === 0" class="flex-1 flex flex-col items-center justify-center text-center p-4 text-[var(--text-muted)]">
      <Hash class="w-8 h-8 mb-2 opacity-40" />
      <p class="text-xs">No tags found in vault</p>
    </div>

    <!-- Nested Tag Tree -->
    <div v-else class="flex-1 overflow-y-auto space-y-1 pr-1">
      <template v-for="node in tagTree" :key="node.fullTag">
        <!-- Recursive Component / Tree Item Template -->
        <div class="space-y-0.5">
          <div
            @click="handleTagClick(node.fullTag)"
            class="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[var(--background-modifier-hover)] cursor-pointer text-[var(--text-normal)] hover:text-[var(--text-accent)] transition-colors group"
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <button
                v-if="node.children.length > 0"
                @click="toggleCollapse(node.fullTag, $event)"
                class="p-0.5 hover:bg-[var(--background-secondary)] rounded text-[var(--text-muted)]"
              >
                <component :is="collapsedMap[node.fullTag] ? ChevronRight : ChevronDown" class="w-3 h-3" />
              </button>
              <Hash v-else class="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-accent)] shrink-0" />
              <span class="truncate font-medium">{{ node.name }}</span>
            </div>
            <span class="text-[10px] bg-[var(--background-secondary)] px-1.5 py-0.5 rounded text-[var(--text-muted)]">
              {{ node.count }}
            </span>
          </div>

          <!-- Children Sub-Tree -->
          <div
            v-if="node.children.length > 0 && !collapsedMap[node.fullTag]"
            class="pl-4 border-l border-[var(--background-modifier-border)] ml-2 space-y-0.5"
          >
            <div
              v-for="child in node.children"
              :key="child.fullTag"
              @click="handleTagClick(child.fullTag)"
              class="flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--background-modifier-hover)] cursor-pointer text-[var(--text-normal)] hover:text-[var(--text-accent)] transition-colors group"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <Hash class="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-accent)] shrink-0" />
                <span class="truncate font-medium">{{ child.name }}</span>
              </div>
              <span class="text-[10px] bg-[var(--background-secondary)] px-1.5 py-0.5 rounded text-[var(--text-muted)]">
                {{ child.count }}
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
