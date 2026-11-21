<script setup lang="ts">
import { ref } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import { Bookmark, BookmarkCheck, FileText, Trash2, Plus } from 'lucide-vue-next';

const workspace = useWorkspaceStore();
const bookmarks = ref<string[]>([
  'Welcome.md',
  'Obsidian Import.md',
]);

const isCurrentBookmarked = () => {
  return workspace.activeNotePath && bookmarks.value.includes(workspace.activeNotePath);
};

function toggleCurrentBookmark() {
  if (!workspace.activeNotePath) return;
  const path = workspace.activeNotePath;
  const idx = bookmarks.value.indexOf(path);
  if (idx !== -1) {
    bookmarks.value.splice(idx, 1);
  } else {
    bookmarks.value.push(path);
  }
}

function removeBookmark(path: string) {
  const idx = bookmarks.value.indexOf(path);
  if (idx !== -1) {
    bookmarks.value.splice(idx, 1);
  }
}

function openNote(path: string) {
  workspace.openNote(path);
}
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none">
    <div class="flex items-center justify-between mb-3">
      <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
        <Bookmark class="w-3.5 h-3.5 text-[var(--text-accent)]" />
        <span>Bookmarks</span>
      </div>
      <button
        v-if="workspace.activeNotePath"
        @click="toggleCurrentBookmark"
        class="p-1 rounded hover:bg-[var(--background-modifier-hover)] text-[var(--text-muted)] hover:text-[var(--text-accent)] transition-colors"
        :title="isCurrentBookmarked() ? 'Remove bookmark' : 'Bookmark active note'"
      >
        <BookmarkCheck v-if="isCurrentBookmarked()" class="w-4 h-4 text-[var(--text-accent)]" />
        <Plus v-else class="w-4 h-4" />
      </button>
    </div>

    <!-- Bookmark list -->
    <div v-if="bookmarks.length > 0" class="flex-1 overflow-y-auto space-y-1">
      <div
        v-for="path in bookmarks"
        :key="path"
        @click="openNote(path)"
        class="group flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[var(--background-modifier-hover)] cursor-pointer transition-colors"
      >
        <div class="flex items-center gap-2 min-w-0">
          <FileText class="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-accent)] shrink-0" />
          <span class="truncate">{{ path.split('/').pop() }}</span>
        </div>
        <button
          @click.stop="removeBookmark(path)"
          class="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-muted)] hover:text-red-400 rounded transition-opacity"
          title="Remove bookmark"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div v-else class="text-center py-10 text-[var(--text-muted)] italic">
      No bookmarked notes yet.
    </div>
  </div>
</template>
