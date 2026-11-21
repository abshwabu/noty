<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useCommandStore, eventToHotkeyString } from '../../stores/commands';
import {
  X,
  FileCode,
  FolderOpen,
  Palette,
  Keyboard,
  Puzzle,
  Info,
  RefreshCw,
  RotateCcw,
  Check,
  AlertTriangle,
  Download,
  Trash2,
} from 'lucide-vue-next';

const settings = useSettingsStore();
const commandStore = useCommandStore();

const activeSection = ref<'editor' | 'files' | 'appearance' | 'hotkeys' | 'plugins' | 'about'>('editor');

const hotkeyFilter = ref('');
const recordingCommandId = ref<string | null>(null);
const importStatus = ref<string | null>(null);

const filteredCommands = () => {
  const query = hotkeyFilter.value.trim().toLowerCase();
  if (!query) return commandStore.commandList;
  return commandStore.commandList.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(query) ||
      (cmd.hotkeys && cmd.hotkeys.toLowerCase().includes(query)) ||
      cmd.section.toLowerCase().includes(query)
  );
};

function startRecording(cmdId: string) {
  recordingCommandId.value = cmdId;
}

function handleRecordingKeydown(e: KeyboardEvent) {
  if (!recordingCommandId.value) return;

  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    recordingCommandId.value = null;
    return;
  }

  const hotkey = eventToHotkeyString(e);
  if (hotkey) {
    commandStore.setHotkey(recordingCommandId.value, hotkey);
    recordingCommandId.value = null;
  }
}

async function handleImportObsidian() {
  importStatus.value = 'Importing...';
  const res = await commandStore.importObsidianHotkeys();
  if (res.error) {
    importStatus.value = res.error;
  } else {
    importStatus.value = `Imported ${res.imported} hotkey(s) from .obsidian/hotkeys.json`;
  }
  setTimeout(() => {
    importStatus.value = null;
  }, 4000);
}

onMounted(() => {
  window.addEventListener('keydown', handleRecordingKeydown, true);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleRecordingKeydown, true);
});

const accentPresets = [
  '#8b5cf6', // Purple (default)
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#06b6d4', // Cyan
];

const zoomPresets = [80, 90, 100, 110, 125, 150];
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none"
    @click.self="settings.showSettingsModal = false"
  >
    <div class="bg-[var(--background-primary)] border border-[var(--background-modifier-border)] w-full max-w-3xl h-[80vh] rounded-xl shadow-2xl flex overflow-hidden text-[var(--text-normal)]">
      <!-- Left Sidebar Sections -->
      <aside class="w-52 bg-[var(--background-secondary)] border-r border-[var(--background-modifier-border)] p-3 flex flex-col justify-between shrink-0">
        <div>
          <div class="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-2 py-1 mb-2">
            Options
          </div>
          <nav class="space-y-0.5 text-xs">
            <button
              @click="activeSection = 'editor'"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded transition-colors text-left"
              :class="activeSection === 'editor' ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]'"
            >
              <FileCode class="w-4 h-4 shrink-0" />
              <span>Editor</span>
            </button>

            <button
              @click="activeSection = 'files'"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded transition-colors text-left"
              :class="activeSection === 'files' ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]'"
            >
              <FolderOpen class="w-4 h-4 shrink-0" />
              <span>Files & Links</span>
            </button>

            <button
              @click="activeSection = 'appearance'"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded transition-colors text-left"
              :class="activeSection === 'appearance' ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]'"
            >
              <Palette class="w-4 h-4 shrink-0" />
              <span>Appearance</span>
            </button>

            <button
              @click="activeSection = 'hotkeys'"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded transition-colors text-left"
              :class="activeSection === 'hotkeys' ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]'"
            >
              <Keyboard class="w-4 h-4 shrink-0" />
              <span>Hotkeys</span>
            </button>

            <button
              @click="activeSection = 'plugins'"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded transition-colors text-left"
              :class="activeSection === 'plugins' ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]'"
            >
              <Puzzle class="w-4 h-4 shrink-0" />
              <span>Core plugins</span>
            </button>

            <button
              @click="activeSection = 'about'"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded transition-colors text-left"
              :class="activeSection === 'about' ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]'"
            >
              <Info class="w-4 h-4 shrink-0" />
              <span>About</span>
            </button>
          </nav>
        </div>
      </aside>

      <!-- Right Detail Content Panel -->
      <main class="flex-1 flex flex-col overflow-hidden bg-[var(--background-primary)]">
        <!-- Top header with Close X button -->
        <div class="h-12 px-6 border-b border-[var(--background-modifier-border)] flex items-center justify-between shrink-0">
          <h2 class="text-sm font-semibold capitalize">{{ activeSection === 'files' ? 'Files & Links' : activeSection }}</h2>
          <button
            @click="settings.showSettingsModal = false"
            class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          <!-- 1. EDITOR SECTION -->
          <div v-if="activeSection === 'editor'" class="space-y-4">
            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Default view for new tabs</div>
                <div class="text-[var(--text-muted)] text-[11px]">Choose whether new notes open in Editing or Reading mode.</div>
              </div>
              <select
                v-model="settings.editor.defaultViewMode"
                @change="settings.saveSettings()"
                class="bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] rounded px-2 py-1 outline-none text-xs"
              >
                <option value="edit">Editing view</option>
                <option value="reading">Reading view</option>
              </select>
            </div>

            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Show line numbers</div>
                <div class="text-[var(--text-muted)] text-[11px]">Display line numbers in editor gutter.</div>
              </div>
              <input
                type="checkbox"
                v-model="settings.editor.lineNumbers"
                @change="settings.saveSettings()"
                class="w-4 h-4 accent-[var(--interactive-accent)]"
              />
            </div>

            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Readable line length</div>
                <div class="text-[var(--text-muted)] text-[11px]">Center the editor content to a comfortable width.</div>
              </div>
              <input
                type="checkbox"
                v-model="settings.editor.readableLineLength"
                @change="settings.saveSettings()"
                class="w-4 h-4 accent-[var(--interactive-accent)]"
              />
            </div>

            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Auto pair brackets & quotes</div>
                <div class="text-[var(--text-muted)] text-[11px]">Automatically close brackets and quotes as you type.</div>
              </div>
              <input
                type="checkbox"
                v-model="settings.editor.autoPairBrackets"
                @change="settings.saveSettings()"
                class="w-4 h-4 accent-[var(--interactive-accent)]"
              />
            </div>

            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Fold headings & indent</div>
                <div class="text-[var(--text-muted)] text-[11px]">Show folding arrows in the editor gutter for headings and lists.</div>
              </div>
              <input
                type="checkbox"
                v-model="settings.editor.foldHeadings"
                @change="settings.saveSettings()"
                class="w-4 h-4 accent-[var(--interactive-accent)]"
              />
            </div>

            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Spellcheck</div>
                <div class="text-[var(--text-muted)] text-[11px]">Enable browser spellcheck highlight in editor.</div>
              </div>
              <input
                type="checkbox"
                v-model="settings.editor.spellcheck"
                @change="settings.saveSettings()"
                class="w-4 h-4 accent-[var(--interactive-accent)]"
              />
            </div>

            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Vim keybindings</div>
                <div class="text-[var(--text-muted)] text-[11px]">Enable modal Vim keybindings for navigation and editing.</div>
              </div>
              <input
                type="checkbox"
                v-model="settings.editor.vimMode"
                @change="settings.saveSettings()"
                class="w-4 h-4 accent-[var(--interactive-accent)]"
              />
            </div>

            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Font size</div>
                <div class="text-[var(--text-muted)] text-[11px]">Editor text size in pixels.</div>
              </div>
              <input
                type="number"
                min="11"
                max="32"
                v-model="settings.editor.fontSize"
                @change="settings.saveSettings(); settings.applyAppearance()"
                class="w-20 bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] rounded px-2 py-1 outline-none text-xs"
              />
            </div>
          </div>

          <!-- 2. FILES & LINKS SECTION -->
          <div v-else-if="activeSection === 'files'" class="space-y-4">
            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Default location for new notes</div>
                <div class="text-[var(--text-muted)] text-[11px]">Where newly created notes are saved in the vault.</div>
              </div>
              <select
                v-model="settings.files.newFileLocation"
                @change="settings.saveSettings()"
                class="bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] rounded px-2 py-1 outline-none text-xs"
              >
                <option value="root">Vault root</option>
                <option value="current">Same folder as current note</option>
                <option value="folder">Specified folder</option>
              </select>
            </div>

            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Attachment folder path</div>
                <div class="text-[var(--text-muted)] text-[11px]">Subfolder where pasted/dragged images and files are saved.</div>
              </div>
              <input
                type="text"
                v-model="settings.files.attachmentFolderPath"
                @change="settings.saveSettings()"
                class="w-48 bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1 outline-none text-xs"
              />
            </div>

            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Confirm file deletion</div>
                <div class="text-[var(--text-muted)] text-[11px]">Prompt before moving files to trash (.trash).</div>
              </div>
              <input
                type="checkbox"
                v-model="settings.files.confirmDelete"
                @change="settings.saveSettings()"
                class="w-4 h-4 accent-[var(--interactive-accent)]"
              />
            </div>
          </div>

          <!-- 3. APPEARANCE SECTION -->
          <div v-else-if="activeSection === 'appearance'" class="space-y-4">
            <!-- Base theme -->
            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Base color scheme</div>
                <div class="text-[var(--text-muted)] text-[11px]">Switch between dark and light Obsidian themes.</div>
              </div>
              <div class="flex gap-1.5">
                <button
                  @click="settings.setBaseTheme('dark')"
                  class="px-3 py-1 rounded text-xs transition-colors"
                  :class="settings.appearance.baseTheme === 'dark' ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
                >
                  Dark
                </button>
                <button
                  @click="settings.setBaseTheme('light')"
                  class="px-3 py-1 rounded text-xs transition-colors"
                  :class="settings.appearance.baseTheme === 'light' ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
                >
                  Light
                </button>
                <button
                  @click="settings.setBaseTheme('system')"
                  class="px-3 py-1 rounded text-xs transition-colors"
                  :class="settings.appearance.baseTheme === 'system' ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
                >
                  System
                </button>
              </div>
            </div>

            <!-- Accent Color -->
            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Accent color</div>
                <div class="text-[var(--text-muted)] text-[11px]">Color used for active highlights, focus rings, and badges.</div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  v-for="color in accentPresets"
                  :key="color"
                  @click="settings.setAccentColor(color)"
                  class="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center transition-transform hover:scale-110"
                  :style="{ backgroundColor: color }"
                >
                  <Check v-if="settings.appearance.accentColor === color" class="w-3.5 h-3.5 text-white" />
                </button>
                <input
                  type="color"
                  v-model="settings.appearance.accentColor"
                  @change="settings.setAccentColor(settings.appearance.accentColor)"
                  class="w-6 h-6 rounded-full border-none cursor-pointer bg-transparent"
                />
              </div>
            </div>

            <!-- Zoom Level -->
            <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
              <div>
                <div class="font-medium text-sm">Interface zoom</div>
                <div class="text-[var(--text-muted)] text-[11px]">Adjust scaling of the application layout.</div>
              </div>
              <div class="flex items-center gap-1.5">
                <button
                  v-for="z in zoomPresets"
                  :key="z"
                  @click="settings.setZoom(z)"
                  class="px-2 py-1 rounded text-[11px]"
                  :class="settings.appearance.zoomLevel === z ? 'bg-[var(--interactive-accent)] text-white font-semibold' : 'bg-[var(--background-secondary)] text-[var(--text-muted)] hover:text-[var(--text-normal)]'"
                >
                  {{ z }}%
                </button>
              </div>
            </div>

            <!-- CSS Snippets -->
            <div class="pt-2">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <div class="font-medium text-sm">CSS snippets (.noty/snippets/)</div>
                  <div class="text-[var(--text-muted)] text-[11px]">Custom CSS files applied to your vault.</div>
                </div>
                <button
                  @click="settings.refreshSnippets()"
                  class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] flex items-center gap-1"
                  title="Reload snippets"
                >
                  <RefreshCw class="w-3.5 h-3.5" />
                  <span>Reload</span>
                </button>
              </div>

              <div v-if="settings.availableSnippets.length > 0" class="border border-[var(--background-modifier-border)] rounded bg-[var(--background-secondary)] p-2 space-y-2">
                <div
                  v-for="snippet in settings.availableSnippets"
                  :key="snippet"
                  class="flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--background-modifier-hover)]"
                >
                  <span class="font-mono text-xs">{{ snippet }}.css</span>
                  <input
                    type="checkbox"
                    :checked="settings.appearance.enabledSnippets.includes(snippet)"
                    @change="settings.toggleSnippet(snippet)"
                    class="w-4 h-4 accent-[var(--interactive-accent)]"
                  />
                </div>
              </div>
              <div v-else class="text-[var(--text-muted)] italic text-[11px] p-2 bg-[var(--background-secondary)] rounded border border-[var(--background-modifier-border)]">
                No .css snippets found in <code class="text-[var(--text-accent)]">.noty/snippets/</code>. Add CSS files there to customize your UI.
              </div>
            </div>
          </div>

          <!-- 4. HOTKEYS SECTION -->
          <div v-else-if="activeSection === 'hotkeys'" class="space-y-4">
            <!-- Top Controls: Filter & Actions -->
            <div class="flex flex-wrap items-center justify-between gap-2.5">
              <input
                v-model="hotkeyFilter"
                type="text"
                placeholder="Filter commands or hotkeys..."
                class="flex-1 min-w-[200px] bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] rounded px-3 py-1.5 text-xs outline-none focus:border-[var(--interactive-accent)]"
              />
              <div class="flex items-center gap-2">
                <button
                  @click="handleImportObsidian"
                  class="px-2.5 py-1.5 rounded border border-[var(--background-modifier-border)] hover:bg-[var(--background-modifier-hover)] text-xs flex items-center gap-1.5 text-[var(--text-normal)] transition-colors"
                  title="Import hotkeys from .obsidian/hotkeys.json"
                >
                  <Download class="w-3.5 h-3.5 text-[var(--text-accent)]" />
                  <span>Import from Obsidian</span>
                </button>
                <button
                  @click="commandStore.resetAllHotkeys()"
                  class="px-2.5 py-1.5 rounded border border-[var(--background-modifier-border)] hover:bg-[var(--background-modifier-hover)] text-xs flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-normal)] transition-colors"
                  title="Reset all hotkeys to default"
                >
                  <RotateCcw class="w-3.5 h-3.5" />
                  <span>Reset all</span>
                </button>
              </div>
            </div>

            <!-- Import feedback message -->
            <div
              v-if="importStatus"
              class="px-3 py-2 rounded bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] text-xs flex items-center gap-2 text-[var(--text-accent)]"
            >
              <Check class="w-4 h-4 text-emerald-400" />
              <span>{{ importStatus }}</span>
            </div>

            <!-- Conflicts Banner -->
            <div
              v-if="commandStore.conflicts.length > 0"
              class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1.5"
            >
              <div class="flex items-center gap-2 font-semibold">
                <AlertTriangle class="w-4 h-4 text-amber-400" />
                <span>{{ commandStore.conflicts.length }} hotkey conflict(s) detected:</span>
              </div>
              <ul class="list-disc ml-5 space-y-0.5 text-[11px] text-amber-200/90">
                <li v-for="cf in commandStore.conflicts" :key="cf.commandId + cf.hotkey">
                  <span class="font-mono font-bold text-amber-300">{{ cf.hotkey }}</span> is assigned to both
                  <span class="font-semibold">{{ cf.commandName }}</span> and
                  <span class="font-semibold">{{ cf.conflictingCommandName }}</span>
                </li>
              </ul>
            </div>

            <!-- Hotkeys Table -->
            <div class="border border-[var(--background-modifier-border)] rounded-lg bg-[var(--background-secondary)] divide-y divide-[var(--background-modifier-border)] overflow-hidden">
              <div
                v-for="cmd in filteredCommands()"
                :key="cmd.id"
                class="flex items-center justify-between p-2.5 px-3.5 text-xs hover:bg-[var(--background-modifier-hover)] transition-colors"
              >
                <!-- Command Info -->
                <div class="min-w-0 mr-3">
                  <div class="font-medium text-[var(--text-normal)] truncate">{{ cmd.name }}</div>
                  <div class="text-[10px] text-[var(--text-muted)] flex items-center gap-2">
                    <span class="font-mono">{{ cmd.id }}</span>
                    <span>•</span>
                    <span>{{ cmd.section }}</span>
                  </div>
                </div>

                <!-- Hotkey Actions & Recorder -->
                <div class="flex items-center gap-2 shrink-0">
                  <!-- Recording State -->
                  <div
                    v-if="recordingCommandId === cmd.id"
                    class="px-3 py-1 rounded bg-[var(--interactive-accent)] text-white font-mono text-[11px] font-semibold animate-pulse flex items-center gap-1.5 shadow-sm"
                  >
                    <span>Press hotkey...</span>
                    <button
                      @click="recordingCommandId = null"
                      class="text-white/80 hover:text-white text-xs ml-1"
                    >
                      ✕
                    </button>
                  </div>

                  <!-- Active Hotkey Badge (Click to record) -->
                  <button
                    v-else
                    @click="startRecording(cmd.id)"
                    class="px-2.5 py-1 rounded font-mono text-[11px] font-semibold border cursor-pointer transition-all hover:scale-102"
                    :class="
                      cmd.hotkeys
                        ? 'bg-[var(--background-modifier-form-field)] border-[var(--background-modifier-border)] text-[var(--text-accent)] hover:border-[var(--interactive-accent)]'
                        : 'bg-transparent border-dashed border-[var(--background-modifier-border)] text-[var(--text-muted)] hover:text-[var(--text-normal)]'
                    "
                    title="Click to assign or change hotkey"
                  >
                    {{ cmd.hotkeys || '+ assign' }}
                  </button>

                  <!-- Reset to default button -->
                  <button
                    v-if="cmd.hotkeys !== cmd.defaultHotkeys"
                    @click="commandStore.resetHotkey(cmd.id)"
                    class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-border)] transition-colors"
                    title="Reset to default hotkey"
                  >
                    <RotateCcw class="w-3.5 h-3.5" />
                  </button>

                  <!-- Remove hotkey button -->
                  <button
                    v-if="cmd.hotkeys"
                    @click="commandStore.removeHotkey(cmd.id)"
                    class="p-1 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--background-modifier-border)] transition-colors"
                    title="Remove hotkey"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 5. CORE PLUGINS SECTION -->
          <div v-else-if="activeSection === 'plugins'" class="space-y-3">
            <div
              v-for="p in settings.plugins"
              :key="p.id"
              class="flex items-center justify-between p-3 rounded border border-[var(--background-modifier-border)] bg-[var(--background-secondary)]"
            >
              <div>
                <div class="font-medium text-sm text-[var(--text-normal)]">{{ p.name }}</div>
                <div class="text-[var(--text-muted)] text-[11px]">{{ p.description }}</div>
              </div>
              <input
                type="checkbox"
                :checked="p.enabled"
                @change="settings.togglePlugin(p.id)"
                class="w-4 h-4 accent-[var(--interactive-accent)]"
              />
            </div>
          </div>

          <!-- 6. ABOUT SECTION -->
          <div v-else-if="activeSection === 'about'" class="space-y-4">
            <div class="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-[var(--interactive-accent)]/20 text-[var(--text-accent)] flex items-center justify-center font-bold text-lg">
                N
              </div>
              <div>
                <h3 class="font-bold text-base text-[var(--text-normal)]">Noty</h3>
                <p class="text-xs text-[var(--text-muted)]">Version 0.1.0 • Offline-first Obsidian-compatible notes app</p>
                <p class="text-[11px] text-[var(--text-faint)] mt-1">Built with Tauri 2 + Vue 3 + CodeMirror 6</p>
              </div>
            </div>

            <div class="text-xs text-[var(--text-muted)] leading-relaxed space-y-2">
              <p>
                Noty stores notes as plain Markdown files in your local filesystem. It respects and discovers Obsidian vault configurations (<code class="text-[var(--text-accent)]">.obsidian/</code>), attachment folders, and themes.
              </p>
              <p>
                All workspace layouts, tabs, and split panes are automatically persisted in <code class="text-[var(--text-accent)]">.noty/workspace.json</code> and restored upon launch.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
