<script setup lang="ts">
import { ref } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import { useBookmarksStore } from '../../stores/bookmarks';
import type { BookmarkItem } from '../../types/bookmarks';
import {
  Bookmark,
  BookmarkCheck,
  FileText,
  Search,
  Hash,
  Folder,
  FolderOpen,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  FolderPlus,
} from 'lucide-vue-next';

const workspace = useWorkspaceStore();
const bookmarksStore = useBookmarksStore();

const expandedGroups = ref<Record<string, boolean>>({});

function isGroupExpanded(id: string) {
  return expandedGroups.value[id] !== false; // Default expanded
}

function toggleGroup(id: string) {
  expandedGroups.value[id] = !isGroupExpanded(id);
}

function handleItemClick(item: BookmarkItem) {
  if (item.type === 'file' && item.path) {
    workspace.openNote(item.path);
  } else if (item.type === 'heading' && item.path) {
    workspace.openNote(item.path);
  } else if (item.type === 'search' && item.query) {
    workspace.layout.leftSidebar.activePanel = 'search';
    workspace.layout.leftSidebar.collapsed = false;
  }
}

function handleAddGroup() {
  const name = prompt('Enter bookmark group name:');
  if (name && name.trim()) {
    bookmarksStore.addGroup(name.trim());
  }
}
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
        <Bookmark class="w-3.5 h-3.5 text-[var(--text-accent)]" />
        <span>Bookmarks</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          @click="handleAddGroup"
          class="p-1 rounded hover:bg-[var(--background-modifier-hover)] text-[var(--text-muted)] hover:text-[var(--text-normal)] transition-colors"
          title="New bookmark group"
        >
          <FolderPlus class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="workspace.activeNotePath"
          @click="bookmarksStore.toggleFileBookmark(workspace.activeNotePath)"
          class="p-1 rounded hover:bg-[var(--background-modifier-hover)] text-[var(--text-muted)] hover:text-[var(--text-accent)] transition-colors"
          :title="bookmarksStore.isBookmarked(workspace.activeNotePath) ? 'Remove bookmark' : 'Bookmark active note'"
        >
          <BookmarkCheck v-if="bookmarksStore.isBookmarked(workspace.activeNotePath)" class="w-4 h-4 text-[var(--text-accent)]" />
          <Plus v-else class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Bookmark list -->
    <div v-if="bookmarksStore.items.length > 0" class="flex-1 overflow-y-auto space-y-1">
      <template v-for="item in bookmarksStore.items" :key="item.id">
        <!-- 1. Group Item -->
        <div v-if="item.type === 'group'" class="space-y-0.5">
          <div
            @click="toggleGroup(item.id)"
            class="group flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--background-modifier-hover)] cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-normal)] font-semibold text-[11px]"
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <component
                :is="isGroupExpanded(item.id) ? ChevronDown : ChevronRight"
                class="w-3 h-3 text-[var(--text-muted)] shrink-0"
              />
              <component :is="isGroupExpanded(item.id) ? FolderOpen : Folder" class="w-3.5 h-3.5 text-[var(--text-accent)] shrink-0" />
              <span class="truncate">{{ item.title }}</span>
            </div>
            <button
              @click.stop="bookmarksStore.removeBookmark(item.id)"
              class="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 rounded transition-opacity"
              title="Delete group"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>

          <!-- Group Children -->
          <div v-if="isGroupExpanded(item.id) && item.items && item.items.length > 0" class="pl-4 space-y-0.5">
            <div
              v-for="sub in item.items"
              :key="sub.id"
              @click="handleItemClick(sub)"
              class="group flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--background-modifier-hover)] cursor-pointer transition-colors"
            >
              <div class="flex items-center gap-2 min-w-0">
                <FileText v-if="sub.type === 'file'" class="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-accent)] shrink-0" />
                <Search v-else-if="sub.type === 'search'" class="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <Hash v-else class="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span class="truncate">{{ sub.title }}</span>
              </div>
              <button
                @click.stop="bookmarksStore.removeBookmark(sub.id)"
                class="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-muted)] hover:text-red-400 rounded transition-opacity"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <!-- 2. Top-level Bookmark (File, Search, Heading) -->
        <div
          v-else
          @click="handleItemClick(item)"
          class="group flex items-center justify-between px-2 py-1.5 rounded hover:bg-[var(--background-modifier-hover)] cursor-pointer transition-colors"
        >
          <div class="flex items-center gap-2 min-w-0">
            <FileText v-if="item.type === 'file'" class="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-accent)] shrink-0" />
            <Search v-else-if="item.type === 'search'" class="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <Hash v-else-if="item.type === 'heading'" class="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span class="truncate">{{ item.title }}</span>
          </div>
          <button
            @click.stop="bookmarksStore.removeBookmark(item.id)"
            class="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-muted)] hover:text-red-400 rounded transition-opacity"
            title="Remove bookmark"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </template>
    </div>

    <div v-else class="text-center py-12 text-[var(--text-muted)] italic space-y-1">
      <div>No bookmarks yet.</div>
      <div class="text-[10px] text-[var(--text-faint)]">Bookmark files, searches, headings, and organize with groups.</div>
    </div>
  </div>
</template>
