<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import EditorContextMenu from './EditorContextMenu.vue';
import {
  FileText,
  Save,
  BookOpen,
  Edit3,
  Image as ImageIcon,
} from 'lucide-vue-next';

const props = defineProps<{
  path?: string;
  leafId?: string;
}>();

const vault = useVaultStore();
const workspace = useWorkspaceStore();

const activePath = computed(() => props.path || vault.activeFilePath || '');
const noteContent = ref('');
const isReadingMode = ref(false);
const saveStatus = ref<'Saved' | 'Saving...' | 'Unsaved changes'>('Saved');

const editorContainer = ref<HTMLDivElement | null>(null);
let editorView: EditorView | null = null;
let saveDebounceTimer: any = null;

// Context Menu state
const contextMenuState = ref({
  show: false,
  x: 0,
  y: 0,
});

const isImageAttachment = computed(() => {
  const ext = activePath.value.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext || '');
});

const fileName = computed(() => {
  if (!activePath.value) return '';
  return activePath.value.split('/').pop() || '';
});

function toggleReadingMode() {
  isReadingMode.value = !isReadingMode.value;
  if (!isReadingMode.value) {
    setTimeout(initCodeMirror, 50);
  }
}

// Load Note Content
async function loadFileContent() {
  if (!activePath.value || isImageAttachment.value) return;
  try {
    const content = await invoke<string>('vault_read_file', {
      relativePath: activePath.value,
    });
    noteContent.value = content;
    initCodeMirror();
  } catch (err) {
    console.warn(`Failed to read file ${activePath.value}:`, err);
  }
}

async function saveFileContent(text?: string) {
  if (!activePath.value) return;
  const contentToSave = text !== undefined ? text : noteContent.value;
  saveStatus.value = 'Saving...';
  try {
    await invoke('vault_write_file', {
      relativePath: activePath.value,
      content: contentToSave,
    });
    saveStatus.value = 'Saved';
  } catch (err) {
    saveStatus.value = 'Unsaved changes';
  }
}

function initCodeMirror() {
  if (!editorContainer.value || isImageAttachment.value || isReadingMode.value) return;

  if (editorView) {
    editorView.destroy();
    editorView = null;
  }

  const customTheme = EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--background-primary)',
        color: 'var(--text-normal)',
        height: '100%',
        fontSize: 'var(--font-size-normal)',
      },
      '.cm-content': {
        fontFamily: 'var(--font-text)',
        padding: '24px 32px',
        lineHeight: '1.65',
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--interactive-accent)',
        borderLeftWidth: '2px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'rgba(124, 58, 237, 0.3) !important',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--background-secondary-alt)',
        color: 'var(--text-muted)',
        border: 'none',
        borderRight: '1px solid var(--background-modifier-border)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--background-modifier-hover)',
      },
    },
    { dark: true }
  );

  const state = EditorState.create({
    doc: noteContent.value,
    extensions: [
      basicSetup,
      markdown(),
      customTheme,
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            saveFileContent();
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newDoc = update.state.doc.toString();
          noteContent.value = newDoc;
          saveStatus.value = 'Saving...';

          clearTimeout(saveDebounceTimer);
          saveDebounceTimer = setTimeout(() => {
            saveFileContent(newDoc);
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

function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  contextMenuState.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
  };
}

function handleContextAction(action: string) {
  switch (action) {
    case 'copy-link': {
      const link = `[[${fileName.value.replace(/\.md$/, '')}]]`;
      navigator.clipboard.writeText(link);
      break;
    }
    case 'toggle-mode':
      isReadingMode.value = !isReadingMode.value;
      if (!isReadingMode.value) {
        setTimeout(initCodeMirror, 50);
      }
      break;
    case 'split-right':
      if (props.leafId) workspace.splitLeaf(props.leafId, 'horizontal', true);
      break;
    case 'split-down':
      if (props.leafId) workspace.splitLeaf(props.leafId, 'vertical', true);
      break;
    case 'popout':
      if (typeof window !== 'undefined') {
        window.open(window.location.href, '_blank', 'width=800,height=600');
      }
      break;
  }
}

watch(
  () => activePath.value,
  () => {
    loadFileContent();
  }
);

onMounted(() => {
  loadFileContent();
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
  <div
    class="h-full flex flex-col bg-[var(--background-primary)] select-none text-[var(--text-normal)] overflow-hidden"
    @contextmenu="handleContextMenu"
  >
    <!-- Note Toolbar Header -->
    <div
      v-if="activePath"
      class="h-10 px-4 border-b border-[var(--background-modifier-border)] flex items-center justify-between shrink-0 bg-[var(--background-secondary-alt)]"
    >
      <div class="flex items-center gap-2 min-w-0">
        <FileText class="w-4 h-4 text-[var(--text-accent)] shrink-0" />
        <span class="text-xs font-semibold text-[var(--text-normal)] truncate">{{ fileName }}</span>
      </div>

      <div class="flex items-center gap-2 text-xs shrink-0">
        <!-- Mode Switcher (Edit vs Reading) -->
        <button
          @click="toggleReadingMode"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors flex items-center gap-1 text-[11px]"
          :title="isReadingMode ? 'Switch to Editing (Ctrl+E)' : 'Switch to Reading (Ctrl+E)'"
        >
          <component :is="isReadingMode ? Edit3 : BookOpen" class="w-3.5 h-3.5" />
          <span>{{ isReadingMode ? 'Reading' : 'Editing' }}</span>
        </button>

        <!-- Save status -->
        <div class="flex items-center gap-1.5 text-[var(--text-muted)] text-[11px] px-1">
          <span
            class="w-2 h-2 rounded-full"
            :class="{
              'bg-emerald-400': saveStatus === 'Saved',
              'bg-amber-400 animate-pulse': saveStatus === 'Saving...',
              'bg-red-400': saveStatus === 'Unsaved changes',
            }"
          />
          <span>{{ saveStatus }}</span>
        </div>

        <button
          @click="saveFileContent()"
          class="p-1 text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] rounded transition-colors"
          title="Save note (Ctrl+S)"
        >
          <Save class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Main View Body -->
    <div class="flex-1 overflow-hidden relative">
      <!-- Attachment Preview -->
      <div
        v-if="isImageAttachment"
        class="h-full flex flex-col items-center justify-center p-8 text-center"
      >
        <div class="max-w-xl p-6 bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded-lg shadow-xl">
          <ImageIcon class="w-12 h-12 text-[var(--text-accent)] mx-auto mb-3" />
          <div class="text-sm font-semibold text-[var(--text-normal)] mb-1">{{ fileName }}</div>
          <div class="text-xs text-[var(--text-muted)]">Attachment: {{ activePath }}</div>
        </div>
      </div>

      <!-- Reading / Preview Mode -->
      <div
        v-else-if="isReadingMode"
        class="h-full overflow-y-auto p-8 select-text text-[var(--text-normal)] space-y-4 max-w-3xl mx-auto leading-relaxed"
      >
        <h1 class="text-2xl font-bold border-b border-[var(--background-modifier-border)] pb-2 text-[var(--text-normal)]">
          {{ fileName.replace(/\.md$/, '') }}
        </h1>
        <div class="whitespace-pre-wrap font-sans text-sm">{{ noteContent }}</div>
      </div>

      <!-- CodeMirror Editor (Editing Mode) -->
      <div v-else ref="editorContainer" class="h-full w-full select-text" />
    </div>

    <!-- Context Menu -->
    <EditorContextMenu
      v-if="contextMenuState.show"
      :x="contextMenuState.x"
      :y="contextMenuState.y"
      :path="activePath"
      :is-reading-mode="isReadingMode"
      @action="handleContextAction"
      @close="contextMenuState.show = false"
    />
  </div>
</template>

<style>
.cm-editor {
  height: 100% !important;
}
</style>
