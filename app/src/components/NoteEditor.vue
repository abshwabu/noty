<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';
import { useSettingsStore } from '../stores/settings';
import type { EditorViewMode } from '../types/workspace';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers as cmLineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { codeFolding, foldGutter, foldKeymap } from '@codemirror/language';
import { vim } from '@replit/codemirror-vim';
import { livePreviewPlugin } from '../editor/livePreview';
import { insertSmartNewline, smartIndent, smartOutdent, toggleTaskUnderCursor } from '../editor/keymaps';
import { createAttachmentHandler } from '../editor/attachments';
import { getCachedEditorState, setCachedEditorState } from '../editor/stateCache';
import NoteProperties from './editor/NoteProperties.vue';
import ReadingView from './editor/ReadingView.vue';
import EditorContextMenu from './EditorContextMenu.vue';
import {
  FileText,
  BookOpen,
  Edit3,
  Code,
  Image as ImageIcon,
} from 'lucide-vue-next';

const props = defineProps<{
  path?: string;
  leafId?: string;
}>();

const vault = useVaultStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();

const activePath = computed(() => props.path || vault.activeFilePath || '');
const noteContent = ref('');
const currentMode = ref<EditorViewMode>('live');
const saveStatus = ref<'Saved' | 'Saving...' | 'Unsaved changes'>('Saved');

const editorContainer = ref<HTMLDivElement | null>(null);
let editorView: EditorView | null = null;
let saveDebounceTimer: any = null;

// CodeMirror dynamic configuration compartments
const lineNumbersCompartment = new Compartment();
const vimCompartment = new Compartment();
const livePreviewCompartment = new Compartment();
const foldCompartment = new Compartment();

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

// Mode Switching: live <-> reading <-> source
function setMode(mode: EditorViewMode) {
  currentMode.value = mode;

  // Persist mode on active tab
  if (props.leafId) {
    const leaf = workspace.findLeaf(workspace.layout.root, props.leafId);
    if (leaf) {
      const tab = leaf.tabs.find((t) => t.id === leaf.activeTabId);
      if (tab) {
        tab.previewMode = mode;
      }
    }
  }

  if (mode === 'reading') {
    if (editorView) {
      setCachedEditorState(activePath.value, editorView.state);
      editorView.destroy();
      editorView = null;
    }
  } else {
    nextTick(() => {
      initOrReconfigureCodeMirror();
    });
  }
}

function toggleMode() {
  if (currentMode.value === 'live') {
    setMode('reading');
  } else if (currentMode.value === 'reading') {
    setMode('source');
  } else {
    setMode('live');
  }
}

// Load note content
async function loadFileContent() {
  if (!activePath.value || isImageAttachment.value) return;
  try {
    const content = await invoke<string>('vault_read_file', {
      relativePath: activePath.value,
    });
    noteContent.value = content;
    vault.activeFileContent = content;

    // Restore tab's saved mode or default mode from settings
    if (props.leafId) {
      const leaf = workspace.findLeaf(workspace.layout.root, props.leafId);
      const tab = leaf?.tabs.find((t) => t.id === leaf.activeTabId);
      if (tab?.previewMode) {
        currentMode.value = tab.previewMode === 'edit' ? 'live' : tab.previewMode;
      } else {
        const defaultMode = settings.editor.defaultViewMode;
        currentMode.value = defaultMode === 'edit' ? 'live' : defaultMode;
      }
    }

    if (currentMode.value !== 'reading') {
      nextTick(() => {
        initOrReconfigureCodeMirror();
      });
    }
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

// Update content from properties component or reading view checkbox
function handleExternalContentUpdate(updatedText: string) {
  noteContent.value = updatedText;
  vault.activeFileContent = updatedText;

  if (editorView) {
    // Dispatch transaction to CodeMirror to keep editor state in sync without breaking undo
    const currentDoc = editorView.state.doc.toString();
    if (currentDoc !== updatedText) {
      editorView.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: updatedText },
      });
    }
  }

  saveStatus.value = 'Saving...';
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveFileContent(updatedText);
  }, 400);
}

// CodeMirror Theme
function getCustomTheme() {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--background-primary)',
        color: 'var(--text-normal)',
        height: '100%',
        fontSize: `${settings.editor.fontSize || 14}px`,
      },
      '.cm-content': {
        fontFamily: 'var(--font-text)',
        padding: '24px 32px',
        lineHeight: '1.7',
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--interactive-accent)',
        borderLeftWidth: '2px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'rgba(124, 58, 237, 0.28) !important',
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
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--background-modifier-hover)',
        color: 'var(--text-normal)',
      },
      '.cm-foldGutter': {
        paddingRight: '6px',
        cursor: 'pointer',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--background-secondary)',
        border: '1px solid var(--background-modifier-border)',
        color: 'var(--text-accent)',
        borderRadius: '3px',
        padding: '0 4px',
        margin: '0 2px',
      },
    },
    { dark: true }
  );
}

function initOrReconfigureCodeMirror() {
  if (!editorContainer.value || isImageAttachment.value || currentMode.value === 'reading') {
    return;
  }

  // If view already exists, reconfigure compartments
  if (editorView) {
    editorView.dispatch({
      effects: [
        livePreviewCompartment.reconfigure(
          currentMode.value === 'live' ? livePreviewPlugin : []
        ),
        lineNumbersCompartment.reconfigure(
          settings.editor.lineNumbers ? cmLineNumbers() : []
        ),
        vimCompartment.reconfigure(settings.editor.vimMode ? vim() : []),
        foldCompartment.reconfigure(
          settings.editor.foldHeadings ? [codeFolding(), foldGutter()] : []
        ),
      ],
    });
    return;
  }

  // Check cached EditorState for tab switch history preservation
  const cached = getCachedEditorState(activePath.value);

  if (cached) {
    editorView = new EditorView({
      state: cached,
      parent: editorContainer.value,
    });
    return;
  }

  // Create new state
  const state = EditorState.create({
    doc: noteContent.value,
    extensions: [
      EditorView.lineWrapping,
      markdown(),
      getCustomTheme(),
      history(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      livePreviewCompartment.of(
        currentMode.value === 'live' ? livePreviewPlugin : []
      ),
      lineNumbersCompartment.of(
        settings.editor.lineNumbers ? cmLineNumbers() : []
      ),
      vimCompartment.of(settings.editor.vimMode ? vim() : []),
      foldCompartment.of(
        settings.editor.foldHeadings !== false ? [codeFolding(), foldGutter()] : []
      ),
      settings.editor.autoPairBrackets ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : [],
      createAttachmentHandler({
        getAttachmentFolderPath: () => settings.files.attachmentFolderPath,
      }),
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            saveFileContent();
            return true;
          },
        },
        {
          key: 'Mod-e',
          run: () => {
            toggleMode();
            return true;
          },
        },
        {
          key: 'Enter',
          run: insertSmartNewline,
        },
        {
          key: 'Tab',
          run: smartIndent,
        },
        {
          key: 'Shift-Tab',
          run: smartOutdent,
        },
        ...foldKeymap,
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newDoc = update.state.doc.toString();
          noteContent.value = newDoc;
          vault.activeFileContent = newDoc;
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

// Watchers
watch(
  () => activePath.value,
  (_newPath, oldPath) => {
    if (oldPath && editorView) {
      setCachedEditorState(oldPath, editorView.state);
      editorView.destroy();
      editorView = null;
    }
    loadFileContent();
  }
);

watch(
  () => [
    settings.editor.lineNumbers,
    settings.editor.vimMode,
    settings.editor.foldHeadings,
    settings.editor.fontSize,
  ],
  () => {
    initOrReconfigureCodeMirror();
  }
);

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
      toggleMode();
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

function onFormatSelection(e: any) {
  if (!editorView || isImageAttachment.value || currentMode.value === 'reading') return;
  const { prefix, suffix } = e.detail;
  const state = editorView.state;
  const sel = state.selection.main;
  const selectedText = state.sliceDoc(sel.from, sel.to);
  const replacement = `${prefix}${selectedText}${suffix}`;
  editorView.dispatch({
    changes: { from: sel.from, to: sel.to, insert: replacement },
    selection: { anchor: sel.from + prefix.length, head: sel.to + prefix.length },
  });
  editorView.focus();
}

function onToggleTask() {
  if (!editorView || isImageAttachment.value || currentMode.value === 'reading') return;
  toggleTaskUnderCursor(editorView);
}

function onIndentLine(e: any) {
  if (!editorView || isImageAttachment.value || currentMode.value === 'reading') return;
  if (e.detail?.isIndent) {
    smartIndent(editorView);
  } else {
    smartOutdent(editorView);
  }
}

onMounted(() => {
  window.addEventListener('noty:format-selection', onFormatSelection);
  window.addEventListener('noty:toggle-task', onToggleTask);
  window.addEventListener('noty:indent-line', onIndentLine);
  loadFileContent();
});

onUnmounted(() => {
  window.removeEventListener('noty:format-selection', onFormatSelection);
  window.removeEventListener('noty:toggle-task', onToggleTask);
  window.removeEventListener('noty:indent-line', onIndentLine);
  if (activePath.value && editorView) {
    setCachedEditorState(activePath.value, editorView.state);
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
        <!-- 3-Way Mode Switcher: Live Preview | Source | Reading -->
        <div class="flex items-center bg-[var(--background-primary)] p-0.5 rounded border border-[var(--background-modifier-border)]">
          <button
            @click="setMode('live')"
            class="px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors"
            :class="currentMode === 'live' ? 'bg-[var(--interactive-accent)] text-white font-medium shadow-xs' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
            title="Live Preview (Obsidian style - Ctrl+E)"
          >
            <Edit3 class="w-3 h-3" />
            <span class="hidden sm:inline">Live</span>
          </button>
          <button
            @click="setMode('source')"
            class="px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors"
            :class="currentMode === 'source' ? 'bg-[var(--interactive-accent)] text-white font-medium shadow-xs' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
            title="Source mode (Raw Markdown)"
          >
            <Code class="w-3 h-3" />
            <span class="hidden sm:inline">Source</span>
          </button>
          <button
            @click="setMode('reading')"
            class="px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors"
            :class="currentMode === 'reading' ? 'bg-[var(--interactive-accent)] text-white font-medium shadow-xs' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
            title="Reading view (Rendered HTML)"
          >
            <BookOpen class="w-3 h-3" />
            <span class="hidden sm:inline">Reading</span>
          </button>
        </div>

        <!-- Save status -->
        <div class="flex items-center gap-1.5 text-[var(--text-muted)] text-[11px] px-1">
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="{
              'bg-emerald-500': saveStatus === 'Saved',
              'bg-amber-500 animate-pulse': saveStatus === 'Saving...',
              'bg-rose-500': saveStatus === 'Unsaved changes',
            }"
          ></span>
          <span class="hidden md:inline">{{ saveStatus }}</span>
        </div>
      </div>
    </div>

    <!-- Active Note View Area -->
    <div
      v-if="activePath && !isImageAttachment"
      class="flex-1 flex flex-col min-h-0 overflow-hidden"
    >
      <!-- Frontmatter / Properties Header -->
      <NoteProperties
        :content="noteContent"
        @update:content="handleExternalContentUpdate"
      />

      <!-- Content Area -->
      <div
        class="flex-1 min-h-0 overflow-y-auto"
        :class="{ 'max-w-3xl mx-auto w-full': settings.editor.readableLineLength }"
      >
        <!-- CodeMirror Editor (Live Preview or Source Mode) -->
        <div
          v-show="currentMode !== 'reading'"
          ref="editorContainer"
          class="h-full w-full"
          :spellcheck="settings.editor.spellcheck"
        ></div>

        <!-- Reading View (Rendered HTML with interactive tasks, callouts, math, mermaid) -->
        <ReadingView
          v-if="currentMode === 'reading'"
          :content="noteContent"
          @update:content="handleExternalContentUpdate"
        />
      </div>
    </div>

    <!-- Image Attachment Viewer -->
    <div
      v-else-if="activePath && isImageAttachment"
      class="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--background-primary)]"
    >
      <div class="p-4 bg-[var(--background-secondary)] rounded-lg border border-[var(--background-modifier-border)] shadow-md max-w-2xl max-h-[80%] flex flex-col items-center">
        <ImageIcon class="w-10 h-10 text-[var(--text-muted)] mb-3" />
        <span class="text-sm font-semibold mb-2">{{ fileName }}</span>
        <span class="text-xs text-[var(--text-muted)]">Image Attachment</span>
      </div>
    </div>

    <!-- Empty State: No File Selected -->
    <div
      v-else
      class="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] select-none p-6 text-center"
    >
      <FileText class="w-12 h-12 mb-3 stroke-[1.2] opacity-40" />
      <p class="text-sm font-medium text-[var(--text-normal)] mb-1">No note open</p>
      <p class="text-xs opacity-75 max-w-xs">
        Select a note from the file explorer or create a new note with <kbd class="px-1.5 py-0.5 rounded bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] text-[10px]">Ctrl+N</kbd>
      </p>
    </div>

    <!-- Editor Context Menu -->
    <EditorContextMenu
      v-if="contextMenuState.show"
      :x="contextMenuState.x"
      :y="contextMenuState.y"
      :path="activePath"
      :is-reading-mode="currentMode === 'reading'"
      @action="handleContextAction"
      @close="contextMenuState.show = false"
    />
  </div>
</template>
