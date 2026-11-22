<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';
import { useSettingsStore } from '../stores/settings';
import { usePluginsStore } from '../stores/plugins';
import SlashCommandMenu, { type SlashItem } from './editor/SlashCommandMenu.vue';
import { saveSnapshot } from '../services/recovery';
import { formatDateCustom } from '../services/dailyNotes';
import type { EditorViewMode } from '../types/workspace';
import { Compartment, EditorState, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  lineNumbers as cmLineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { codeFolding, foldGutter, foldKeymap } from '@codemirror/language';
import { vim } from '@replit/codemirror-vim';
import { livePreviewPlugin } from '../editor/livePreview';
import { wikilinkAutocomplete } from '../editor/autocomplete';
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
  Search,
  X,
  Replace,
  ChevronDown,
  ChevronUp,
} from 'lucide-vue-next';

const props = defineProps<{
  path?: string;
  leafId?: string;
}>();

const vault = useVaultStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const plugins = usePluginsStore();

const slashMenuState = ref({
  show: false,
  filter: '',
  from: 0,
  to: 0,
  x: 0,
  y: 0,
});

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

const setSearchMatchesEffect = StateEffect.define<{
  matches: { from: number; to: number }[];
  activeIndex: number;
}>();

const searchHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setSearchMatchesEffect)) {
        if (!e.value.matches.length) {
          return Decoration.none;
        }
        const builder = new RangeSetBuilder<Decoration>();
        e.value.matches.forEach((m, idx) => {
          if (idx === e.value.activeIndex) {
            builder.add(
              m.from,
              m.to,
              Decoration.mark({
                class: 'cm-search-match cm-search-match-active bg-amber-400 text-black font-semibold rounded px-0.5',
              })
            );
          } else {
            builder.add(
              m.from,
              m.to,
              Decoration.mark({
                class: 'cm-search-match bg-amber-400/30 text-amber-200 rounded px-0.5',
              })
            );
          }
        });
        return builder.finish();
      }
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// In-note Find & Replace state
const showFindBar = ref(false);
const showReplaceRow = ref(false);
const findQuery = ref('');
const replaceQuery = ref('');
const findCaseSensitive = ref(false);
const findRegex = ref(false);
const findWholeWord = ref(false);
const matchRanges = ref<{ from: number; to: number }[]>([]);
const activeMatchIndex = ref(0);
const findInputRef = ref<HTMLInputElement | null>(null);

function updateMatches() {
  const q = findQuery.value;
  if (!q || !editorView) {
    matchRanges.value = [];
    activeMatchIndex.value = 0;
    if (editorView) {
      editorView.dispatch({
        effects: setSearchMatchesEffect.of({ matches: [], activeIndex: -1 }),
      });
    }
    return;
  }

  const docText = editorView.state.doc.toString();
  const ranges: { from: number; to: number }[] = [];

  try {
    let re: RegExp;
    if (findRegex.value) {
      re = new RegExp(q, findCaseSensitive.value ? 'g' : 'gi');
    } else {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = findWholeWord.value ? `\\b${escaped}\\b` : escaped;
      re = new RegExp(pattern, findCaseSensitive.value ? 'g' : 'gi');
    }

    let m: RegExpExecArray | null;
    while ((m = re.exec(docText)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      ranges.push({
        from: m.index,
        to: m.index + m[0].length,
      });
    }
  } catch {
    // invalid regex
  }

  matchRanges.value = ranges;
  if (ranges.length > 0) {
    if (activeMatchIndex.value >= ranges.length) {
      activeMatchIndex.value = 0;
    }
    highlightAndScrollActive();
  } else {
    activeMatchIndex.value = 0;
    if (editorView) {
      editorView.dispatch({
        effects: setSearchMatchesEffect.of({ matches: [], activeIndex: -1 }),
      });
    }
  }
}

function highlightAndScrollActive() {
  if (!editorView || matchRanges.value.length === 0) return;
  const current = matchRanges.value[activeMatchIndex.value];
  if (!current) return;

  editorView.dispatch({
    effects: setSearchMatchesEffect.of({
      matches: matchRanges.value,
      activeIndex: activeMatchIndex.value,
    }),
    selection: { anchor: current.from, head: current.to },
    scrollIntoView: true,
  });
}

function nextMatch() {
  if (matchRanges.value.length === 0) return;
  activeMatchIndex.value = (activeMatchIndex.value + 1) % matchRanges.value.length;
  highlightAndScrollActive();
}

function prevMatch() {
  if (matchRanges.value.length === 0) return;
  activeMatchIndex.value =
    (activeMatchIndex.value - 1 + matchRanges.value.length) % matchRanges.value.length;
  highlightAndScrollActive();
}

function replaceCurrent() {
  if (!editorView || matchRanges.value.length === 0) return;
  const current = matchRanges.value[activeMatchIndex.value];
  if (!current) return;

  const rep = replaceQuery.value;
  editorView.dispatch({
    changes: { from: current.from, to: current.to, insert: rep },
  });
  updateMatches();
}

function replaceAll() {
  if (!editorView || matchRanges.value.length === 0) return;
  const rep = replaceQuery.value;

  const changes = matchRanges.value.slice().reverse().map((r) => ({
    from: r.from,
    to: r.to,
    insert: rep,
  }));

  editorView.dispatch({ changes });
  updateMatches();
}

function closeFindBar() {
  showFindBar.value = false;
  showReplaceRow.value = false;
  findQuery.value = '';
  matchRanges.value = [];
  activeMatchIndex.value = 0;
  if (editorView) {
    editorView.dispatch({
      effects: setSearchMatchesEffect.of({ matches: [], activeIndex: -1 }),
    });
    editorView.focus();
  }
}

function openFind(replace: boolean = false) {
  showFindBar.value = true;
  if (replace) {
    showReplaceRow.value = true;
  }
  nextTick(() => {
    findInputRef.value?.focus();
    findInputRef.value?.select();
  });
}

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

function handleSlashSelect(item: SlashItem) {
  if (!editorView) return;
  const { from, to } = slashMenuState.value;

  let insertText = '';
  switch (item.id) {
    case 'h1': insertText = '# '; break;
    case 'h2': insertText = '## '; break;
    case 'h3': insertText = '### '; break;
    case 'bullet': insertText = '- '; break;
    case 'number': insertText = '1. '; break;
    case 'task': insertText = '- [ ] '; break;
    case 'quote': insertText = '> '; break;
    case 'callout': insertText = '> [!note]\n> '; break;
    case 'code': insertText = '```\n\n```'; break;
    case 'math': insertText = '$$\n\n$$'; break;
    case 'table': insertText = '| Header 1 | Header 2 |\n|---|---|\n| Cell 1 | Cell 2 |\n'; break;
    case 'hr': insertText = '---\n'; break;
    case 'mermaid': insertText = '```mermaid\ngraph TD;\n  A-->B;\n```\n'; break;
    case 'date': insertText = formatDateCustom(new Date(), 'YYYY-MM-DD'); break;
    case 'time': insertText = formatDateCustom(new Date(), 'HH:mm'); break;
    case 'template':
      slashMenuState.value.show = false;
      window.dispatchEvent(new CustomEvent('noty:open-templates-modal'));
      return;
  }

  editorView.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor: from + insertText.length },
  });
  slashMenuState.value.show = false;
  editorView.focus();
}

function onInsertText(e: any) {
  const text = e.detail?.text || '';
  if (!editorView || !text) return;
  const sel = editorView.state.selection.main;
  editorView.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length },
  });
  editorView.focus();
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

    // File recovery periodic snapshot
    if (plugins.isEnabled('file-recovery') && activePath.value) {
      saveSnapshot(activePath.value, contentToSave);
    }
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
      wikilinkAutocomplete(),
      searchHighlightField,
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
          key: 'Mod-f',
          run: () => {
            openFind(false);
            return true;
          },
        },
        {
          key: 'Mod-h',
          run: () => {
            openFind(true);
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

          if (showFindBar.value) {
            updateMatches();
          }

          // Slash command trigger check
          if (plugins.isEnabled('slash-commands')) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            const textBefore = line.text.slice(0, pos - line.from);
            const match = textBefore.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);

            if (match) {
              const coords = editorView?.coordsAtPos(pos);
              if (coords) {
                slashMenuState.value = {
                  show: true,
                  filter: match[1],
                  from: line.from + textBefore.lastIndexOf('/'),
                  to: pos,
                  x: Math.min(window.innerWidth - 270, Math.max(10, coords.left)),
                  y: coords.bottom,
                };
              }
            } else {
              slashMenuState.value.show = false;
            }
          } else {
            slashMenuState.value.show = false;
          }
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
    closeFindBar();
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

function onOpenInNoteFind(e: any) {
  const replace = Boolean(e?.detail?.replace);
  openFind(replace);
}

function onInsertLinePrefix(e: any) {
  if (!editorView || isImageAttachment.value || currentMode.value === 'reading') return;
  const prefix = e.detail?.prefix || '';
  const state = editorView.state;
  const line = state.doc.lineAt(state.selection.main.head);
  editorView.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
  });
  editorView.focus();
}

function onEditorUndo() {
  if (editorView) undo(editorView);
}

function onEditorRedo() {
  if (editorView) redo(editorView);
}

// Background-safe flush when Android/browser pauses or backgrounds app
function handleAppPauseFlush() {
  if (editorView && activePath.value) {
    const currentDoc = editorView.state.doc.toString();
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    saveFileContent(currentDoc);
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    handleAppPauseFlush();
  }
}

onMounted(() => {
  window.addEventListener('noty:format-selection', onFormatSelection);
  window.addEventListener('noty:insert-line-prefix', onInsertLinePrefix);
  window.addEventListener('noty:editor-undo', onEditorUndo);
  window.addEventListener('noty:editor-redo', onEditorRedo);
  window.addEventListener('noty:toggle-task', onToggleTask);
  window.addEventListener('noty:indent-line', onIndentLine);
  window.addEventListener('noty:open-in-note-find', onOpenInNoteFind);
  window.addEventListener('noty:insert-text', onInsertText);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', handleAppPauseFlush);
  window.addEventListener('beforeunload', handleAppPauseFlush);
  loadFileContent();
});

onUnmounted(() => {
  window.removeEventListener('noty:format-selection', onFormatSelection);
  window.removeEventListener('noty:insert-line-prefix', onInsertLinePrefix);
  window.removeEventListener('noty:editor-undo', onEditorUndo);
  window.removeEventListener('noty:editor-redo', onEditorRedo);
  window.removeEventListener('noty:toggle-task', onToggleTask);
  window.removeEventListener('noty:indent-line', onIndentLine);
  window.removeEventListener('noty:open-in-note-find', onOpenInNoteFind);
  window.removeEventListener('noty:insert-text', onInsertText);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', handleAppPauseFlush);
  window.removeEventListener('beforeunload', handleAppPauseFlush);
  if (activePath.value && editorView) {
    handleAppPauseFlush();
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
      class="flex-1 flex flex-col min-h-0 overflow-hidden relative"
    >
      <!-- Floating In-Note Find/Replace Bar -->
      <div
        v-if="showFindBar"
        class="absolute top-3 right-5 z-30 bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded-lg shadow-2xl p-2 w-84 text-xs backdrop-blur-md space-y-1.5 animate-in fade-in duration-150"
      >
        <!-- Find Row -->
        <div class="flex items-center gap-1">
          <div class="relative flex-1 flex items-center">
            <Search class="w-3.5 h-3.5 absolute left-2 text-[var(--text-muted)] pointer-events-none" />
            <input
              ref="findInputRef"
              v-model="findQuery"
              @input="updateMatches"
              @keydown.enter.exact.prevent="nextMatch"
              @keydown.shift.enter.prevent="prevMatch"
              @keydown.esc="closeFindBar"
              type="text"
              placeholder="Find in note..."
              class="w-full bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] rounded pl-7 pr-6 py-1 text-xs outline-none focus:border-[var(--interactive-accent)]"
            />
            <button
              v-if="findQuery"
              @click="findQuery = ''; updateMatches()"
              class="absolute right-1.5 text-[var(--text-muted)] hover:text-[var(--text-normal)]"
            >
              <X class="w-3 h-3" />
            </button>
          </div>

          <!-- Match counter -->
          <span class="text-[10px] text-[var(--text-muted)] px-1 shrink-0 font-mono">
            {{ matchRanges.length > 0 ? `${activeMatchIndex + 1}/${matchRanges.length}` : (findQuery ? '0/0' : '') }}
          </span>

          <!-- Prev / Next buttons -->
          <button
            @click="prevMatch"
            :disabled="matchRanges.length === 0"
            class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] disabled:opacity-40 transition-colors"
            title="Previous match (Shift+Enter)"
          >
            <ChevronUp class="w-3.5 h-3.5" />
          </button>
          <button
            @click="nextMatch"
            :disabled="matchRanges.length === 0"
            class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] disabled:opacity-40 transition-colors"
            title="Next match (Enter)"
          >
            <ChevronDown class="w-3.5 h-3.5" />
          </button>

          <!-- Toggle Replace Row -->
          <button
            @click="showReplaceRow = !showReplaceRow"
            :class="[
              'p-1 rounded transition-colors',
              showReplaceRow
                ? 'bg-[var(--interactive-accent)] text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]'
            ]"
            title="Toggle Replace mode (Ctrl+H)"
          >
            <Replace class="w-3.5 h-3.5" />
          </button>

          <!-- Close button -->
          <button
            @click="closeFindBar"
            class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
            title="Close (Escape)"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Toggles: Case sensitive, Regex, Whole word -->
        <div class="flex items-center gap-1 px-0.5">
          <button
            @click="findCaseSensitive = !findCaseSensitive; updateMatches()"
            :class="[
              'px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors border',
              findCaseSensitive
                ? 'bg-[var(--interactive-accent)] text-white border-[var(--interactive-accent)]'
                : 'bg-[var(--background-secondary-alt)] text-[var(--text-muted)] border-[var(--background-modifier-border)] hover:text-[var(--text-normal)]'
            ]"
            title="Match case"
          >
            Aa
          </button>
          <button
            @click="findRegex = !findRegex; updateMatches()"
            :class="[
              'px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors border',
              findRegex
                ? 'bg-[var(--interactive-accent)] text-white border-[var(--interactive-accent)]'
                : 'bg-[var(--background-secondary-alt)] text-[var(--text-muted)] border-[var(--background-modifier-border)] hover:text-[var(--text-normal)]'
            ]"
            title="Regular expression"
          >
            .*
          </button>
          <button
            @click="findWholeWord = !findWholeWord; updateMatches()"
            :class="[
              'px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors border',
              findWholeWord
                ? 'bg-[var(--interactive-accent)] text-white border-[var(--interactive-accent)]'
                : 'bg-[var(--background-secondary-alt)] text-[var(--text-muted)] border-[var(--background-modifier-border)] hover:text-[var(--text-normal)]'
            ]"
            title="Match whole word"
          >
            \b
          </button>
        </div>

        <!-- Replace Row -->
        <div v-if="showReplaceRow" class="flex items-center gap-1 pt-1 border-t border-[var(--background-modifier-border)]">
          <div class="relative flex-1">
            <input
              v-model="replaceQuery"
              @keydown.enter.exact.prevent="replaceCurrent"
              @keydown.esc="closeFindBar"
              type="text"
              placeholder="Replace with..."
              class="w-full bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] rounded px-2.5 py-1 text-xs outline-none focus:border-[var(--interactive-accent)]"
            />
          </div>
          <button
            @click="replaceCurrent"
            :disabled="matchRanges.length === 0"
            class="px-2 py-1 bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] hover:border-[var(--interactive-accent)] rounded text-[11px] text-[var(--text-normal)] hover:text-white hover:bg-[var(--interactive-accent)] disabled:opacity-40 transition-colors"
          >
            Replace
          </button>
          <button
            @click="replaceAll"
            :disabled="matchRanges.length === 0"
            class="px-2 py-1 bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] hover:border-[var(--interactive-accent)] rounded text-[11px] text-[var(--text-normal)] hover:text-white hover:bg-[var(--interactive-accent)] disabled:opacity-40 transition-colors"
          >
            All
          </button>
        </div>
      </div>

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

      <!-- Floating Slash Commands Menu -->
      <SlashCommandMenu
        v-if="slashMenuState.show"
        :filter="slashMenuState.filter"
        :x="slashMenuState.x"
        :y="slashMenuState.y"
        @select="handleSlashSelect"
        @close="slashMenuState.show = false"
      />
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
