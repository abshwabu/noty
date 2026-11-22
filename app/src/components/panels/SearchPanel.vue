<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useWorkspaceStore } from '../../stores/workspace';
import { vaultSearch } from '../../services/search';
import type { FileSearchResult, SearchResponse, SearchOptions } from '../../types/search';
import {
  Search,
  X,
  FileText,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  Check,
  Replace,
  HelpCircle,
  Loader2,
} from 'lucide-vue-next';

const workspace = useWorkspaceStore();

const query = ref('');
const isCaseSensitive = ref(false);
const isRegex = ref(false);
const isMoreContext = ref(false);
const sortBy = ref<'matches-desc' | 'mtime-desc' | 'mtime-asc' | 'name-asc' | 'name-desc'>('matches-desc');

const searchResponse = ref<SearchResponse | null>(null);
const isSearching = ref(false);
const expandedNotes = ref<Record<string, boolean>>({});
const showHelp = ref(false);
const copiedNotice = ref(false);

const results = computed<FileSearchResult[]>(() => searchResponse.value?.results || []);
const totalMatches = computed(() => searchResponse.value?.total_matches || 0);
const totalFiles = computed(() => searchResponse.value?.total_files || 0);
const queryTime = computed(() => searchResponse.value?.duration_ms || 0);

// Performance / Chunked virtual rendering for mobile devices
const displayLimit = ref(50);
const visibleResults = computed(() => {
  return results.value.slice(0, displayLimit.value);
});

function handleResultsScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
    if (displayLimit.value < results.value.length) {
      displayLimit.value += 50;
    }
  }
}

let searchDebounceTimer: any = null;

async function executeSearch() {
  const q = query.value.trim();
  if (!q) {
    searchResponse.value = null;
    return;
  }

  isSearching.value = true;
  try {
    const options: SearchOptions = {
      case_sensitive: isCaseSensitive.value,
      regex: isRegex.value,
      more_context: isMoreContext.value,
      sort_by: sortBy.value,
    };
    const resp = await vaultSearch(q, options);
    searchResponse.value = resp;

    // By default, expand all returned notes
    const exp: Record<string, boolean> = {};
    for (const r of resp.results) {
      exp[r.file_path] = true;
    }
    expandedNotes.value = exp;
  } catch (err) {
    console.warn('Search error:', err);
  } finally {
    isSearching.value = false;
  }
}

function handleInput() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    executeSearch();
  }, 250);
}

function toggleExpandNote(path: string) {
  expandedNotes.value[path] = !expandedNotes.value[path];
}

function toggleExpandAll() {
  const allExpanded = results.value.length > 0 && results.value.every((r) => expandedNotes.value[r.file_path]);
  const newExp: Record<string, boolean> = {};
  for (const r of results.value) {
    newExp[r.file_path] = !allExpanded;
  }
  expandedNotes.value = newExp;
}

function openNote(path: string) {
  workspace.openNote(path);
}

function openGlobalReplace() {
  workspace.showGlobalReplaceModal = true;
}

async function copyResults() {
  if (!results.value.length) return;

  const lines: string[] = [`## Search Results for "${query.value}"\n`];
  for (const r of results.value) {
    lines.push(`### [[${r.file_path.replace(/\.md$/, '')}]] (${r.matches.length} matches)`);
    for (const m of r.matches) {
      lines.push(`- Line ${m.line_number}: \`${m.line_text.trim()}\``);
    }
    lines.push('');
  }

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    copiedNotice.value = true;
    setTimeout(() => {
      copiedNotice.value = false;
    }, 2000);
  } catch (e) {
    console.error('Failed to copy search results:', e);
  }
}

// Watch option changes to re-trigger search
watch([isCaseSensitive, isRegex, isMoreContext, sortBy], () => {
  if (query.value.trim()) {
    executeSearch();
  }
});

// Format snippet with highlighted match
function formatSnippetHtml(match: any): string {
  const text = match.line_text;
  const start = match.match_start;
  const end = match.match_end;

  if (start >= 0 && end > start && end <= text.length) {
    const before = escapeHtml(text.slice(0, start));
    const matched = escapeHtml(text.slice(start, end));
    const after = escapeHtml(text.slice(end));
    return `${before}<mark class="bg-amber-400/40 text-amber-200 px-0.5 rounded font-medium">${matched}</mark>${after}`;
  }
  return escapeHtml(text);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
</script>

<template>
  <div class="h-full flex flex-col p-3 text-xs text-[var(--text-normal)] select-none">
    <!-- Panel Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wider">Search</div>
      <div class="flex items-center gap-1">
        <button
          @click="showHelp = !showHelp"
          :class="[
            'p-1 rounded transition-colors',
            showHelp
              ? 'bg-[var(--interactive-accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]'
          ]"
          title="Search operators syntax guide"
        >
          <HelpCircle class="w-3.5 h-3.5" />
        </button>
        <button
          @click="openGlobalReplace"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
          title="Global Search & Replace (Ctrl+Shift+H)"
        >
          <Replace class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Syntax Help Box -->
    <div
      v-if="showHelp"
      class="mb-3 p-2.5 rounded bg-[var(--background-secondary-alt)] border border-[var(--background-modifier-border)] text-[11px] space-y-1.5 animate-in fade-in duration-150"
    >
      <div class="font-semibold text-[var(--text-accent)] mb-1">Obsidian Search Operators:</div>
      <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px] text-[var(--text-muted)]">
        <div><span class="text-[var(--text-normal)]">path:</span> folder/</div>
        <div><span class="text-[var(--text-normal)]">file:</span> name.md</div>
        <div><span class="text-[var(--text-normal)]">tag:</span> #project</div>
        <div><span class="text-[var(--text-normal)]">line:</span> word1 word2</div>
        <div><span class="text-[var(--text-normal)]">section:</span> heading</div>
        <div><span class="text-[var(--text-normal)]">content:</span> body text</div>
        <div><span class="text-[var(--text-normal)]">task-todo:</span> fix</div>
        <div><span class="text-[var(--text-normal)]">task-done:</span> tested</div>
        <div><span class="text-[var(--text-normal)]">[status:</span> done]</div>
        <div><span class="text-[var(--text-normal)]">"exact</span> phrase"</div>
        <div><span class="text-[var(--text-normal)]">/pattern/</span> (regex)</div>
        <div><span class="text-[var(--text-normal)]">A OR B</span> / <span class="text-[var(--text-normal)]">-exclude</span></div>
      </div>
    </div>

    <!-- Search Input Field -->
    <div class="relative flex items-center mb-2">
      <Search class="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-muted)] pointer-events-none" />
      <input
        v-model="query"
        @input="handleInput"
        @keydown.enter="executeSearch"
        type="text"
        placeholder="Type query or operator (e.g. tag:todo)..."
        class="w-full bg-[var(--background-modifier-form-field)] border border-[var(--background-modifier-border)] text-[var(--text-normal)] rounded pl-8 pr-7 py-1.5 text-xs outline-none focus:border-[var(--interactive-accent)]"
      />
      <button
        v-if="query"
        @click="query = ''; searchResponse = null"
        class="absolute right-2 text-[var(--text-muted)] hover:text-[var(--text-normal)]"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Search Options & Filters Bar -->
    <div class="flex items-center justify-between gap-1 mb-2 px-0.5">
      <!-- Toggles: Case sensitive, Regex, More context -->
      <div class="flex items-center gap-1">
        <button
          @click="isCaseSensitive = !isCaseSensitive"
          :class="[
            'px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors border',
            isCaseSensitive
              ? 'bg-[var(--interactive-accent)] text-white border-[var(--interactive-accent)]'
              : 'bg-[var(--background-secondary)] text-[var(--text-muted)] border-[var(--background-modifier-border)] hover:text-[var(--text-normal)]'
          ]"
          title="Match case (case sensitive)"
        >
          Aa
        </button>

        <button
          @click="isRegex = !isRegex"
          :class="[
            'px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors border',
            isRegex
              ? 'bg-[var(--interactive-accent)] text-white border-[var(--interactive-accent)]'
              : 'bg-[var(--background-secondary)] text-[var(--text-muted)] border-[var(--background-modifier-border)] hover:text-[var(--text-normal)]'
          ]"
          title="Explain/treat search as regular expression"
        >
          .*
        </button>

        <button
          @click="isMoreContext = !isMoreContext"
          :class="[
            'px-1.5 py-0.5 rounded text-[10px] transition-colors border',
            isMoreContext
              ? 'bg-[var(--interactive-accent)] text-white border-[var(--interactive-accent)]'
              : 'bg-[var(--background-secondary)] text-[var(--text-muted)] border-[var(--background-modifier-border)] hover:text-[var(--text-normal)]'
          ]"
          title="Show more context (surrounding lines)"
        >
          More context
        </button>
      </div>

      <!-- Action buttons: Collapse all, Copy results -->
      <div class="flex items-center gap-1">
        <button
          v-if="results.length > 0"
          @click="toggleExpandAll"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
          title="Collapse / Expand all"
        >
          <ChevronsUpDown class="w-3.5 h-3.5" />
        </button>

        <button
          v-if="results.length > 0"
          @click="copyResults"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)] transition-colors"
          title="Copy search results to clipboard"
        >
          <Check v-if="copiedNotice" class="w-3.5 h-3.5 text-green-400" />
          <Copy v-else class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Sort selector & stats -->
    <div v-if="results.length > 0" class="flex items-center justify-between text-[11px] text-[var(--text-muted)] mb-2 px-0.5">
      <div>
        <span>{{ totalMatches }} match{{ totalMatches === 1 ? '' : 'es' }} in {{ totalFiles }} note{{ totalFiles === 1 ? '' : 's' }}</span>
        <span v-if="queryTime > 0" class="text-[10px] text-[var(--text-faint)] ml-1">({{ queryTime.toFixed(1) }} ms)</span>
      </div>

      <div class="flex items-center gap-1">
        <select
          v-model="sortBy"
          class="bg-[var(--background-secondary)] border border-[var(--background-modifier-border)] rounded text-[10px] text-[var(--text-normal)] px-1 py-0.5 outline-none cursor-pointer"
        >
          <option value="matches-desc">Most matches</option>
          <option value="mtime-desc">Modified (newest)</option>
          <option value="mtime-asc">Modified (oldest)</option>
          <option value="name-asc">Name (A to Z)</option>
          <option value="name-desc">Name (Z to A)</option>
        </select>
      </div>
    </div>

    <!-- Searching spinner -->
    <div v-if="isSearching" class="flex items-center justify-center py-6 text-[var(--text-muted)] gap-2">
      <Loader2 class="w-4 h-4 animate-spin text-[var(--interactive-accent)]" />
      <span>Searching vault...</span>
    </div>

    <!-- Results list -->
    <div
      v-else-if="results.length > 0"
      class="flex-1 overflow-y-auto space-y-1.5 pr-0.5"
      @scroll="handleResultsScroll"
    >
      <div
        v-for="res in visibleResults"
        :key="res.file_path"
        class="border border-[var(--background-modifier-border)] rounded-md bg-[var(--background-secondary-alt)] overflow-hidden transition-all"
      >
        <!-- Note Header -->
        <div
          @click="toggleExpandNote(res.file_path)"
          class="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer select-none group"
        >
          <component
            :is="expandedNotes[res.file_path] ? ChevronDown : ChevronRight"
            class="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-normal)] shrink-0 transition-transform"
          />
          <FileText class="w-3.5 h-3.5 text-[var(--text-accent)] shrink-0" />
          <span
            @click.stop="openNote(res.file_path)"
            class="font-medium text-[var(--text-normal)] hover:text-[var(--text-accent)] truncate"
            :title="res.file_path"
          >
            {{ res.file_title || res.file_path }}
          </span>
          <span class="text-[10px] text-[var(--text-muted)] ml-auto shrink-0 bg-[var(--background-secondary)] px-1.5 py-0.2 rounded-full border border-[var(--background-modifier-border)]">
            {{ res.matches.length }}
          </span>
        </div>

        <!-- Matching Lines Snippets -->
        <div
          v-if="expandedNotes[res.file_path] && res.matches.length > 0"
          class="border-t border-[var(--background-modifier-border)] bg-[var(--background-primary)] py-1 space-y-1"
        >
          <div
            v-for="(match, mIdx) in res.matches"
            :key="mIdx"
            @click="openNote(res.file_path)"
            class="px-2 py-1 hover:bg-[var(--background-modifier-hover)] cursor-pointer text-[11px] leading-relaxed transition-colors group"
          >
            <!-- Before Context (if more context enabled) -->
            <div
              v-if="isMoreContext && match.before_context && match.before_context.length > 0"
              class="text-[10px] text-[var(--text-faint)] italic border-l-2 border-[var(--background-modifier-border)] pl-1.5 mb-0.5 select-none"
            >
              <div v-for="(bLine, bIdx) in match.before_context" :key="bIdx" class="truncate">{{ bLine }}</div>
            </div>

            <!-- Matched Line with Highlight -->
            <div class="flex items-baseline gap-1.5 text-[var(--text-normal)]">
              <span class="text-[9px] font-mono text-[var(--text-faint)] group-hover:text-[var(--text-accent)] shrink-0 select-none">
                L{{ match.line_number }}:
              </span>
              <span class="truncate" v-html="formatSnippetHtml(match)"></span>
            </div>

            <!-- After Context (if more context enabled) -->
            <div
              v-if="isMoreContext && match.after_context && match.after_context.length > 0"
              class="text-[10px] text-[var(--text-faint)] italic border-l-2 border-[var(--background-modifier-border)] pl-1.5 mt-0.5 select-none"
            >
              <div v-for="(aLine, aIdx) in match.after_context" :key="aIdx" class="truncate">{{ aLine }}</div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="displayLimit < results.length"
        class="text-center py-2 text-[11px] text-[var(--text-faint)]"
      >
        Showing {{ visibleResults.length }} of {{ results.length }} notes...
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="query && !isSearching"
      class="flex-1 flex flex-col items-center justify-center p-4 text-center text-[var(--text-muted)] space-y-2"
    >
      <Search class="w-8 h-8 opacity-40 text-[var(--text-faint)]" />
      <div class="text-xs">No matching notes found.</div>
      <div class="text-[10px] text-[var(--text-faint)]">
        Try checking spelling, using wildcards or Obsidian operators like <span class="font-mono text-[var(--text-normal)]">tag:</span> or <span class="font-mono text-[var(--text-normal)]">path:</span>
      </div>
    </div>

    <!-- Initial Prompt -->
    <div
      v-else-if="!query"
      class="flex-1 flex flex-col items-center justify-center p-4 text-center text-[var(--text-muted)] space-y-2 select-none"
    >
      <Search class="w-8 h-8 opacity-30 text-[var(--text-faint)]" />
      <div class="text-xs text-[var(--text-muted)]">Type to search notes in your vault</div>
      <div class="text-[10px] text-[var(--text-faint)] max-w-[200px]">
        Full-text index with FTS5, path, tags, frontmatter, and regex support.
      </div>
    </div>
  </div>
</template>