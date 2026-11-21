<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useVaultStore } from '../stores/vault';
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { FileText, Save, Image as ImageIcon } from 'lucide-vue-next';

const store = useVaultStore();
const editorContainer = ref<HTMLDivElement | null>(null);
let editorView: EditorView | null = null;
let saveDebounceTimer: any = null;

const isImageAttachment = computed(() => {
  const ext = store.activeFilePath?.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext || '');
});

const fileName = computed(() => {
  if (!store.activeFilePath) return '';
  return store.activeFilePath.split('/').pop() || '';
});

// Stats
const wordCount = computed(() => {
  if (!store.activeFileContent) return 0;
  return store.activeFileContent.trim().split(/\s+/).filter(Boolean).length;
});

const charCount = computed(() => {
  return store.activeFileContent.length;
});

function initCodeMirror() {
  if (!editorContainer.value || isImageAttachment.value) return;

  if (editorView) {
    editorView.destroy();
    editorView = null;
  }

  const customDarkTheme = EditorView.theme({
    '&': {
      backgroundColor: '#18181b',
      color: '#f4f4f5',
      height: '100%',
      fontSize: '15px',
    },
    '.cm-content': {
      fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '24px 32px',
      lineHeight: '1.65',
    },
    '.cm-cursor': {
      borderLeftColor: '#a855f7',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: '#4c1d95 !important',
    },
    '.cm-gutters': {
      backgroundColor: '#141416',
      color: '#52525b',
      border: 'none',
      borderRight: '1px solid #27272a',
    },
    '.cm-activeLine': {
      backgroundColor: '#27272a33',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#27272a44',
      color: '#a1a1aa',
    },
  }, { dark: true });

  const state = EditorState.create({
    doc: store.activeFileContent,
    extensions: [
      basicSetup,
      markdown(),
      customDarkTheme,
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            store.saveCurrentFile();
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newDoc = update.state.doc.toString();
          store.activeFileContent = newDoc;
          store.saveStatus = 'Saving...';

          clearTimeout(saveDebounceTimer);
          saveDebounceTimer = setTimeout(() => {
            store.saveCurrentFile(newDoc);
          }, 400);
        }
      }),
    ],
  });

  editorView = new EditorView({
    state,
    parent: editorContainer.value,
  });
}

// Watch activeFilePath or external content modifications
watch(
  () => store.activeFilePath,
  () => {
    initCodeMirror();
  }
);

watch(
  () => store.activeFileContent,
  (newContent) => {
    if (editorView && editorView.state.doc.toString() !== newContent) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: newContent,
        },
      });
    }
  }
);

onMounted(() => {
  if (store.activeFilePath) {
    initCodeMirror();
  }
});

onUnmounted(() => {
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
  clearTimeout(saveDebounceTimer);
});
</script>

<template>
  <div class="h-full flex flex-col bg-[#18181b] select-none text-zinc-200 overflow-hidden">
    <!-- Active File Header -->
    <template v-if="store.activeFilePath">
      <div class="h-12 px-6 border-b border-[#27272a] flex items-center justify-between shrink-0 bg-[#151518]">
        <div class="flex items-center gap-2.5 min-w-0">
          <FileText class="w-4 h-4 text-purple-400 shrink-0" />
          <span class="text-sm font-semibold text-zinc-100 truncate">{{ fileName }}</span>
          <span class="text-xs text-zinc-500 truncate hidden sm:inline" :title="store.activeFilePath">
            {{ store.activeFilePath }}
          </span>
        </div>

        <div class="flex items-center gap-3 text-xs shrink-0">
          <!-- Save status indicator -->
          <div class="flex items-center gap-1.5 text-zinc-400">
            <span
              class="w-2 h-2 rounded-full"
              :class="{
                'bg-emerald-400': store.saveStatus === 'Saved',
                'bg-amber-400 animate-pulse': store.saveStatus === 'Saving...',
                'bg-red-400': store.saveStatus === 'Unsaved changes',
              }"
            />
            <span class="text-[11px] font-medium">{{ store.saveStatus }}</span>
          </div>

          <button
            @click="store.saveCurrentFile()"
            class="p-1.5 hover:text-white hover:bg-zinc-800 rounded transition-colors text-zinc-400"
            title="Save note (Ctrl+S / Cmd+S)"
          >
            <Save class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Editor Body -->
      <div class="flex-1 overflow-hidden relative">
        <!-- Attachment Preview -->
        <div
          v-if="isImageAttachment"
          class="h-full flex flex-col items-center justify-center p-8 text-center"
        >
          <div class="max-w-xl p-4 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
            <ImageIcon class="w-12 h-12 text-purple-400 mx-auto mb-3" />
            <div class="text-sm font-semibold text-zinc-200 mb-1">{{ fileName }}</div>
            <div class="text-xs text-zinc-500">Attachment in vault: {{ store.activeFilePath }}</div>
          </div>
        </div>

        <!-- CodeMirror Editor -->
        <div v-else ref="editorContainer" class="h-full w-full select-text" />
      </div>

      <!-- Status Bar -->
      <div class="h-7 px-4 border-t border-[#27272a] bg-[#141416] flex items-center justify-between text-[11px] text-zinc-500 shrink-0">
        <div class="flex items-center gap-3">
          <span>UTF-8</span>
          <span>•</span>
          <span>{{ wordCount }} words</span>
          <span>•</span>
          <span>{{ charCount }} characters</span>
        </div>
        <div class="flex items-center gap-2">
          <span>Markdown</span>
        </div>
      </div>
    </template>

    <!-- Empty State -->
    <div v-else class="h-full flex flex-col items-center justify-center text-center p-8 select-none">
      <div class="w-16 h-16 rounded-2xl bg-purple-600/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4 shadow-lg shadow-purple-950/20">
        <FileText class="w-8 h-8" />
      </div>
      <h3 class="text-base font-semibold text-zinc-200 mb-1">No note selected</h3>
      <p class="text-xs text-zinc-500 max-w-sm mb-6">
        Select a note from the sidebar tree, or create a new note to start writing markdown.
      </p>
      <div class="flex gap-3">
        <button
          @click="store.createFile('', 'Untitled Note')"
          class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium transition-colors shadow-lg shadow-purple-900/30"
        >
          Create New Note
        </button>
        <button
          @click="store.showVaultSwitcher = true"
          class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors border border-zinc-700"
        >
          Switch Vault
        </button>
      </div>
    </div>
  </div>
</template>

<style>
/* Make CodeMirror fill parent */
.cm-editor {
  height: 100% !important;
}
</style>
