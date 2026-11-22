<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useCommandStore, eventToHotkeyString } from '../../stores/commands';
import { usePluginsStore } from '../../stores/plugins';
import { useWorkspaceStore } from '../../stores/workspace';
import { useSyncStore } from '../../stores/sync';
import ConflictModal from '../sync/ConflictModal.vue';
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
  SlidersHorizontal,
  Cloud,
  Lock,
  Upload,
  Terminal,
  Server,
  ShieldCheck,
  ExternalLink,
} from 'lucide-vue-next';

const settings = useSettingsStore();
const commandStore = useCommandStore();
const pluginsStore = usePluginsStore();
const workspace = useWorkspaceStore();
const syncStore = useSyncStore();

const activeSection = ref<'editor' | 'files' | 'appearance' | 'hotkeys' | 'plugins' | 'sync' | 'about'>('editor');
const expandedPlugin = ref<string | null>(null);

const loginUsername = ref('');
const loginPassword = ref('');
const loginDeviceName = ref('');
const loginLoading = ref(false);
const syncActionLoading = ref(false);
const syncFeedback = ref<string | null>(null);
const newVaultName = ref('');
const showConflictModal = ref(false);

async function handleLogin() {
  if (!loginUsername.value || !loginPassword.value) return;
  loginLoading.value = true;
  syncFeedback.value = null;
  try {
    await syncStore.login(loginUsername.value, loginPassword.value, loginDeviceName.value);
    syncFeedback.value = 'Logged in and device connected successfully!';
  } catch (e: any) {
    syncFeedback.value = `Login failed: ${e.message || e}`;
  } finally {
    loginLoading.value = false;
  }
}

async function handleCreateRemoteVault() {
  if (!newVaultName.value.trim()) return;
  try {
    await syncStore.createRemoteVault(newVaultName.value.trim());
    newVaultName.value = '';
    syncFeedback.value = 'New server vault created and selected!';
  } catch (e: any) {
    syncFeedback.value = `Failed to create vault: ${e.message || e}`;
  }
}

async function handleManualSync() {
  syncActionLoading.value = true;
  syncFeedback.value = null;
  try {
    const res = await syncStore.syncNow();
    syncFeedback.value = `Sync complete! Pushed: ${res.pushed}, Pulled: ${res.pulled}, Merged: ${res.merged}, Conflicts: ${res.conflicts}`;
  } catch (e: any) {
    syncFeedback.value = `Sync error: ${e.message || e}`;
  } finally {
    syncActionLoading.value = false;
  }
}

async function handleUploadVault() {
  if (!syncStore.config.vault_id) return;
  syncActionLoading.value = true;
  syncFeedback.value = null;
  try {
    const res = await syncStore.uploadVault(syncStore.config.vault_id);
    syncFeedback.value = `Vault uploaded successfully! Pushed ${res.pushed} file(s).`;
  } catch (e: any) {
    syncFeedback.value = `Upload error: ${e.message || e}`;
  } finally {
    syncActionLoading.value = false;
  }
}

async function handleDownloadVault() {
  if (!syncStore.config.vault_id) return;
  syncActionLoading.value = true;
  syncFeedback.value = null;
  try {
    const res = await syncStore.downloadVault(syncStore.config.vault_id);
    syncFeedback.value = `Vault downloaded successfully! Pulled ${res.pulled} file(s).`;
  } catch (e: any) {
    syncFeedback.value = `Download error: ${e.message || e}`;
  } finally {
    syncActionLoading.value = false;
  }
}

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
              @click="activeSection = 'sync'"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded transition-colors text-left"
              :class="activeSection === 'sync' ? 'bg-[var(--interactive-accent)] text-white font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]'"
            >
              <Cloud class="w-4 h-4 shrink-0" />
              <span>Sync</span>
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
              v-for="p in pluginsStore.plugins"
              :key="p.id"
              class="rounded border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] overflow-hidden transition-colors"
            >
              <div class="flex items-center justify-between p-3">
                <div class="flex-1 pr-3">
                  <div class="font-medium text-sm text-[var(--text-normal)] flex items-center gap-2">
                    {{ p.name }}
                    <span
                      v-if="p.hasSettings && p.enabled"
                      class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--background-primary)] text-[var(--text-muted)] border border-[var(--background-modifier-border)]"
                    >
                      Configurable
                    </span>
                  </div>
                  <div class="text-[var(--text-muted)] text-[11px] mt-0.5">{{ p.description }}</div>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    v-if="p.hasSettings && p.enabled"
                    @click="expandedPlugin = expandedPlugin === p.id ? null : p.id"
                    class="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-border)] transition-colors"
                    :class="{ 'text-[var(--interactive-accent)] bg-[var(--background-modifier-border)]': expandedPlugin === p.id }"
                    title="Plugin settings"
                  >
                    <SlidersHorizontal class="w-4 h-4" />
                  </button>
                  <input
                    type="checkbox"
                    :checked="p.enabled"
                    @change="pluginsStore.togglePlugin(p.id)"
                    class="w-4 h-4 accent-[var(--interactive-accent)] cursor-pointer"
                  />
                </div>
              </div>

              <!-- Collapsible Plugin Settings Panel -->
              <div
                v-if="p.hasSettings && p.enabled && expandedPlugin === p.id"
                class="px-4 py-3 border-t border-[var(--background-modifier-border)] bg-[var(--background-primary)] space-y-3 text-xs"
              >
                <!-- Daily notes settings -->
                <div v-if="p.id === 'daily-notes'" class="space-y-3">
                  <div>
                    <label class="block text-[var(--text-muted)] font-medium mb-1">New file location</label>
                    <input
                      v-model="pluginsStore.dailyNotes.folder"
                      @change="pluginsStore.saveDailyNotesConfig()"
                      type="text"
                      placeholder="e.g. Daily or Journal (leave empty for vault root)"
                      class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                    />
                  </div>
                  <div>
                    <label class="block text-[var(--text-muted)] font-medium mb-1">Date format</label>
                    <input
                      v-model="pluginsStore.dailyNotes.format"
                      @change="pluginsStore.saveDailyNotesConfig()"
                      type="text"
                      placeholder="YYYY-MM-DD"
                      class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                    />
                    <div class="text-[10px] text-[var(--text-faint)] mt-1">Supports YYYY, MM, DD, dddd, etc.</div>
                  </div>
                  <div>
                    <label class="block text-[var(--text-muted)] font-medium mb-1">Template file location</label>
                    <input
                      v-model="pluginsStore.dailyNotes.template"
                      @change="pluginsStore.saveDailyNotesConfig()"
                      type="text"
                      placeholder="e.g. templates/daily.md"
                      class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                    />
                  </div>
                  <label class="flex items-center gap-2 pt-1 cursor-pointer">
                    <input
                      v-model="pluginsStore.dailyNotes.openOnStartup"
                      @change="pluginsStore.saveDailyNotesConfig()"
                      type="checkbox"
                      class="w-3.5 h-3.5 accent-[var(--interactive-accent)]"
                    />
                    <span class="text-[var(--text-normal)]">Open daily note on startup</span>
                  </label>
                </div>

                <!-- Templates settings -->
                <div v-else-if="p.id === 'templates'" class="space-y-3">
                  <div>
                    <label class="block text-[var(--text-muted)] font-medium mb-1">Template folder location</label>
                    <input
                      v-model="pluginsStore.templates.folder"
                      @change="pluginsStore.saveTemplatesConfig()"
                      type="text"
                      placeholder="templates"
                      class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                    />
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-[var(--text-muted)] font-medium mb-1">Date format</label>
                      <input
                        v-model="pluginsStore.templates.dateFormat"
                        @change="pluginsStore.saveTemplatesConfig()"
                        type="text"
                        placeholder="YYYY-MM-DD"
                        class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                      />
                    </div>
                    <div>
                      <label class="block text-[var(--text-muted)] font-medium mb-1">Time format</label>
                      <input
                        v-model="pluginsStore.templates.timeFormat"
                        @change="pluginsStore.saveTemplatesConfig()"
                        type="text"
                        placeholder="HH:mm"
                        class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                      />
                    </div>
                  </div>
                  <div class="text-[10px] text-[var(--text-faint)]">
                    Use <code v-pre class="text-[var(--text-accent)]">{{date}}</code>, <code v-pre class="text-[var(--text-accent)]">{{time}}</code>, or <code v-pre class="text-[var(--text-accent)]">{{title}}</code> in your template files.
                  </div>
                </div>

                <!-- File recovery settings -->
                <div v-else-if="p.id === 'file-recovery'" class="space-y-3">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-[var(--text-muted)] font-medium mb-1">Snapshot interval (minutes)</label>
                      <input
                        v-model.number="pluginsStore.fileRecovery.intervalMinutes"
                        type="number"
                        min="1"
                        max="60"
                        class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                      />
                    </div>
                    <div>
                      <label class="block text-[var(--text-muted)] font-medium mb-1">Retention (days)</label>
                      <input
                        v-model.number="pluginsStore.fileRecovery.historyDurationDays"
                        type="number"
                        min="1"
                        max="365"
                        class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                      />
                    </div>
                  </div>
                  <div>
                    <button
                      @click="workspace.showRecoveryModal = true; settings.showSettingsModal = false"
                      class="px-3 py-1.5 rounded bg-[var(--background-modifier-border)] hover:bg-[var(--interactive-accent)] hover:text-white transition-colors text-xs font-medium text-[var(--text-normal)]"
                    >
                      View file recovery snapshots
                    </button>
                  </div>
                </div>

                <!-- Zettelkasten prefixer settings -->
                <div v-else-if="p.id === 'zk-prefixer'" class="space-y-3">
                  <div>
                    <label class="block text-[var(--text-muted)] font-medium mb-1">Prefix format</label>
                    <input
                      v-model="pluginsStore.zkPrefixer.format"
                      @change="pluginsStore.saveZkPrefixerConfig()"
                      type="text"
                      placeholder="YYYYMMDDHHmm"
                      class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                    />
                  </div>
                  <div>
                    <label class="block text-[var(--text-muted)] font-medium mb-1">New file location</label>
                    <input
                      v-model="pluginsStore.zkPrefixer.folder"
                      @change="pluginsStore.saveZkPrefixerConfig()"
                      type="text"
                      placeholder="e.g. zettelkasten (leave empty for vault root)"
                      class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                    />
                  </div>
                  <div>
                    <label class="block text-[var(--text-muted)] font-medium mb-1">Template file location</label>
                    <input
                      v-model="pluginsStore.zkPrefixer.template"
                      @change="pluginsStore.saveZkPrefixerConfig()"
                      type="text"
                      placeholder="e.g. templates/zettel.md"
                      class="w-full bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 6. SYNC SECTION -->
          <div v-else-if="activeSection === 'sync'" class="space-y-6">
            <!-- Sync Feedback Banner -->
            <div
              v-if="syncFeedback"
              class="p-3 rounded bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] text-xs flex items-center justify-between"
            >
              <span :class="syncFeedback.includes('error') || syncFeedback.includes('failed') ? 'text-rose-400' : 'text-emerald-400'">
                {{ syncFeedback }}
              </span>
              <button @click="syncFeedback = null" class="text-[var(--text-muted)] hover:text-[var(--text-normal)]">
                <X class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Active Conflict Warning Banner -->
            <div
              v-if="syncStore.status.unresolved_conflicts_count > 0"
              class="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300"
            >
              <div class="flex items-center gap-2">
                <AlertTriangle class="w-4 h-4 text-amber-400 shrink-0" />
                <span>You have <strong>{{ syncStore.status.unresolved_conflicts_count }} unresolved sync conflict(s)</strong>.</span>
              </div>
              <button
                @click="showConflictModal = true"
                class="px-2.5 py-1 rounded bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition-colors"
              >
                Resolve Conflicts
              </button>
            </div>

            <!-- Sync Controls & Status -->
            <div class="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-semibold text-sm flex items-center gap-2 text-[var(--text-normal)]">
                    <Cloud class="w-4 h-4 text-[var(--text-accent)]" />
                    <span>Sync Status</span>
                  </h3>
                  <div class="text-[var(--text-muted)] text-[11px] mt-0.5">
                    Last synced: <span class="text-[var(--text-normal)] font-medium">{{ syncStore.lastSyncRelativeTime }}</span>
                    <span v-if="syncStore.config.vault_name" class="ml-2 font-mono text-[var(--text-accent)]">({{ syncStore.config.vault_name }})</span>
                  </div>
                </div>

                <!-- Sync Now Button -->
                <button
                  @click="handleManualSync"
                  :disabled="syncStore.isSyncing || !syncStore.isConfigured"
                  class="flex items-center gap-1.5 px-4 py-2 rounded bg-[var(--interactive-accent)] hover:bg-[var(--interactive-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors text-xs shadow"
                >
                  <RefreshCw :class="['w-3.5 h-3.5', syncStore.isSyncing ? 'animate-spin' : '']" />
                  <span>{{ syncStore.isSyncing ? 'Syncing...' : 'Sync Now' }}</span>
                </button>
              </div>

              <!-- Initial Setup Buttons -->
              <div v-if="syncStore.isConfigured" class="pt-3 border-t border-[var(--background-modifier-border)] grid grid-cols-2 gap-3">
                <button
                  @click="handleUploadVault"
                  :disabled="syncActionLoading || syncStore.isSyncing"
                  class="flex items-center justify-center gap-2 px-3 py-2 rounded bg-[var(--background-primary)] border border-[var(--background-modifier-border)] hover:border-[var(--interactive-accent)] text-[var(--text-normal)] transition-colors text-xs font-medium"
                  title="Upload all local notes to this server vault"
                >
                  <Upload class="w-3.5 h-3.5 text-[var(--text-accent)]" />
                  <span>Upload this vault to server</span>
                </button>
                <button
                  @click="handleDownloadVault"
                  :disabled="syncActionLoading || syncStore.isSyncing"
                  class="flex items-center justify-center gap-2 px-3 py-2 rounded bg-[var(--background-primary)] border border-[var(--background-modifier-border)] hover:border-[var(--interactive-accent)] text-[var(--text-normal)] transition-colors text-xs font-medium"
                  title="Download all notes from this server vault"
                >
                  <Download class="w-3.5 h-3.5 text-[var(--text-accent)]" />
                  <span>Download vault from server</span>
                </button>
              </div>
            </div>

            <!-- Server Connection & Account -->
            <div class="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] space-y-3">
              <h3 class="font-semibold text-sm flex items-center gap-2 text-[var(--text-normal)]">
                <Server class="w-4 h-4 text-blue-400" />
                <span>Server & Account</span>
              </h3>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[var(--text-muted)] text-[11px] mb-1 font-medium">Server URL</label>
                  <input
                    v-model="syncStore.config.server_url"
                    @change="syncStore.saveConfig()"
                    type="text"
                    placeholder="https://sync.example.com"
                    class="w-full bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                  />
                </div>
                <div>
                  <label class="block text-[var(--text-muted)] text-[11px] mb-1 font-medium">Device Name</label>
                  <input
                    v-model="syncStore.config.device_name"
                    @change="syncStore.saveConfig()"
                    type="text"
                    placeholder="e.g. Work MacBook, Pixel 8"
                    class="w-full bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label class="block text-[var(--text-muted)] text-[11px] mb-1 font-medium">Username</label>
                  <input
                    v-model="loginUsername"
                    type="text"
                    placeholder="Username"
                    class="w-full bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                  />
                </div>
                <div>
                  <label class="block text-[var(--text-muted)] text-[11px] mb-1 font-medium">Password</label>
                  <input
                    v-model="loginPassword"
                    type="password"
                    placeholder="Password"
                    class="w-full bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                  />
                </div>
              </div>

              <div class="flex items-center justify-between pt-2">
                <span class="text-[11px] text-[var(--text-muted)]">
                  Status: <span :class="syncStore.config.token ? 'text-emerald-400 font-medium' : 'text-amber-400'">
                    {{ syncStore.config.token ? `Connected (${syncStore.config.device_name})` : 'Not Connected' }}
                  </span>
                </span>
                <button
                  @click="handleLogin"
                  :disabled="loginLoading || !loginUsername || !loginPassword"
                  class="px-3 py-1.5 rounded bg-[var(--interactive-accent)] hover:bg-[var(--interactive-accent-hover)] disabled:opacity-40 text-white font-medium text-xs transition-colors"
                >
                  {{ loginLoading ? 'Connecting...' : syncStore.config.token ? 'Re-authenticate' : 'Log In & Connect' }}
                </button>
              </div>
            </div>

            <!-- Vault Selection -->
            <div v-if="syncStore.config.token" class="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] space-y-3">
              <h3 class="font-semibold text-sm flex items-center gap-2 text-[var(--text-normal)]">
                <FolderOpen class="w-4 h-4 text-amber-400" />
                <span>Remote Vault</span>
              </h3>

              <div v-if="syncStore.remoteVaults.length > 0" class="space-y-2">
                <label class="block text-[var(--text-muted)] text-[11px]">Select server vault to sync with:</label>
                <select
                  v-model="syncStore.config.vault_id"
                  @change="() => {
                    const sel = syncStore.remoteVaults.find(v => v.id === syncStore.config.vault_id);
                    if (sel) syncStore.config.vault_name = sel.name;
                    syncStore.saveConfig();
                  }"
                  class="w-full bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                >
                  <option v-for="v in syncStore.remoteVaults" :key="v.id" :value="v.id">
                    {{ v.name }} (ID: {{ v.id }})
                  </option>
                </select>
              </div>

              <div class="pt-2 flex items-center gap-2">
                <input
                  v-model="newVaultName"
                  type="text"
                  placeholder="Or create new server vault..."
                  class="flex-1 bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                />
                <button
                  @click="handleCreateRemoteVault"
                  :disabled="!newVaultName.trim()"
                  class="px-3 py-1.5 rounded bg-[var(--background-modifier-border)] hover:bg-[var(--interactive-accent)] hover:text-white disabled:opacity-40 transition-colors text-xs font-medium"
                >
                  Create
                </button>
              </div>
            </div>

            <!-- End-to-End Encryption (E2EE) -->
            <div class="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] space-y-3">
              <h3 class="font-semibold text-sm flex items-center gap-2 text-[var(--text-normal)]">
                <Lock class="w-4 h-4 text-emerald-400" />
                <span>End-to-End Encryption (E2EE)</span>
              </h3>
              <p class="text-[11px] text-[var(--text-muted)] leading-relaxed">
                When an encryption passphrase is set, all notes and media blobs are encrypted locally with <strong class="text-[var(--text-normal)]">XChaCha20-Poly1305</strong> before being sent to the server. The server stores only ciphertext and cannot read your data.
              </p>
              <div>
                <label class="block text-[var(--text-muted)] text-[11px] mb-1 font-medium">Vault Encryption Passphrase (Optional)</label>
                <input
                  v-model="syncStore.config.e2ee_passphrase"
                  @change="syncStore.saveConfig()"
                  type="password"
                  placeholder="Leave empty for standard server storage"
                  class="w-full bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded px-2.5 py-1.5 text-xs text-[var(--text-normal)] focus:outline-none focus:border-[var(--interactive-accent)]"
                />
              </div>
            </div>

            <!-- Automation & Schedule Settings -->
            <div class="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] space-y-3">
              <h3 class="font-semibold text-sm flex items-center gap-2 text-[var(--text-normal)]">
                <SlidersHorizontal class="w-4 h-4 text-purple-400" />
                <span>Sync Schedule</span>
              </h3>

              <div class="flex items-center justify-between py-2 border-b border-[var(--background-modifier-border)]">
                <div>
                  <div class="font-medium">Auto-sync frequency</div>
                  <div class="text-[var(--text-muted)] text-[11px]">Sync automatically in the background (0 = manual only).</div>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="syncStore.config.auto_sync_minutes"
                    @change="syncStore.saveConfig()"
                    type="number"
                    min="0"
                    max="1440"
                    class="w-20 bg-[var(--background-primary)] border border-[var(--background-modifier-border)] rounded px-2 py-1 text-xs text-center outline-none"
                  />
                  <span class="text-[11px] text-[var(--text-muted)]">minutes</span>
                </div>
              </div>

              <div class="flex items-center justify-between py-2">
                <div>
                  <div class="font-medium">Sync on application open</div>
                  <div class="text-[var(--text-muted)] text-[11px]">Automatically check and pull changes when Noty launches.</div>
                </div>
                <input
                  v-model="syncStore.config.auto_sync_on_open"
                  @change="syncStore.saveConfig()"
                  type="checkbox"
                  class="w-4 h-4 accent-[var(--interactive-accent)] rounded"
                />
              </div>
            </div>

            <!-- Selective Sync Details -->
            <div class="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] space-y-2">
              <h3 class="font-semibold text-sm flex items-center gap-2 text-[var(--text-normal)]">
                <ShieldCheck class="w-4 h-4 text-cyan-400" />
                <span>Selective Sync & Exclusions</span>
              </h3>
              <p class="text-[11px] text-[var(--text-muted)] leading-relaxed">
                By default, internal metadata and local workspace settings (<code class="text-[var(--text-accent)]">workspace.json</code>, <code class="text-[var(--text-accent)]">appearance.json</code>, <code class="text-[var(--text-accent)]">.git/</code>, <code class="text-[var(--text-accent)]">.trash/</code>) are kept device-local and ignored by the sync engine.
              </p>
            </div>

            <!-- Live Sync Activity Logs -->
            <div class="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-sm flex items-center gap-2 text-[var(--text-normal)]">
                  <Terminal class="w-4 h-4 text-emerald-400" />
                  <span>Sync Activity Log</span>
                </h3>
                <button
                  @click="syncStore.fetchLogs()"
                  class="text-[11px] text-[var(--text-accent)] hover:underline flex items-center gap-1"
                >
                  <RefreshCw class="w-3 h-3" />
                  <span>Refresh</span>
                </button>
              </div>

              <div class="h-44 bg-[var(--background-primary)] rounded border border-[var(--background-modifier-border)] p-2.5 font-mono text-[11px] overflow-y-auto space-y-1">
                <div v-if="syncStore.logs.length === 0" class="text-[var(--text-faint)] italic">
                  No sync logs recorded yet.
                </div>
                <div
                  v-for="log in syncStore.logs"
                  :key="log.id"
                  class="flex items-start gap-2 leading-relaxed"
                >
                  <span class="text-[var(--text-faint)] shrink-0">
                    {{ new Date(log.timestamp * 1000).toLocaleTimeString() }}
                  </span>
                  <span
                    :class="[
                      'uppercase text-[9px] font-bold px-1 rounded shrink-0',
                      log.level === 'error' ? 'bg-rose-500/20 text-rose-400' : log.level === 'warn' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                    ]"
                  >
                    {{ log.level }}
                  </span>
                  <span class="text-[var(--text-normal)] flex-1">{{ log.message }}</span>
                  <span v-if="log.details" class="text-[var(--text-muted)] truncate max-w-xs">{{ log.details }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Conflict Resolution Modal -->
          <ConflictModal v-if="showConflictModal" @close="showConflictModal = false" />

          <!-- 7. ABOUT SECTION -->
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
