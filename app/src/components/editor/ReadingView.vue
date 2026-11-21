<script setup lang="ts">
import { computed, ref, onMounted, nextTick, watch } from 'vue';
import katex from 'katex';
import mermaid from 'mermaid';
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Info,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  Flame,
} from 'lucide-vue-next';

const props = defineProps<{
  content: string;
}>();

const emit = defineEmits<{
  (e: 'update:content', newContent: string): void;
}>();

const readingContainer = ref<HTMLDivElement | null>(null);
const copiedCodeIdx = ref<number | null>(null);
const calloutsFolded = ref<Record<number, boolean>>({});

// Rendered HTML blocks
interface RenderedBlock {
  id: number;
  type: 'html' | 'code' | 'mermaid' | 'math-block' | 'callout' | 'table';
  content?: string;
  lang?: string;
  code?: string;
  calloutType?: string;
  calloutTitle?: string;
  calloutBody?: string;
  rawStartIndex: number;
  rawEndIndex: number;
}

// Interactive Task Checkbox toggle
function handleCheckboxClick(lineIndexInDoc: number, isCheckedNow: boolean) {
  const lines = props.content.split('\n');
  if (lineIndexInDoc >= 0 && lineIndexInDoc < lines.length) {
    const line = lines[lineIndexInDoc];
    const updatedLine = isCheckedNow
      ? line.replace(/^(\s*[-*+]\s+\[) (\].*)$/, '$1x$2')
      : line.replace(/^(\s*[-*+]\s+\[)[xX](\].*)$/, '$1 $2');

    lines[lineIndexInDoc] = updatedLine;
    emit('update:content', lines.join('\n'));
  }
}

// Simple and robust parser for Obsidian markdown blocks
const renderedBlocks = computed<RenderedBlock[]>(() => {
  const blocks: RenderedBlock[] = [];
  const lines = props.content.split('\n');
  let i = 0;
  let blockId = 0;

  // Skip frontmatter
  if (lines[0]?.trim() === '---') {
    i++;
    while (i < lines.length && lines[i].trim() !== '---') {
      i++;
    }
    i++; // Skip closing ---
  }

  while (i < lines.length) {
    const line = lines[i];

    // 1. Mermaid or Fenced Code Blocks (```lang)
    const codeMatch = line.match(/^```([a-zA-Z0-9_-]*)/);
    if (codeMatch) {
      const lang = codeMatch[1].toLowerCase();
      const codeLines: string[] = [];
      const startLine = i;
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const fullCode = codeLines.join('\n');

      if (lang === 'mermaid') {
        blocks.push({
          id: blockId++,
          type: 'mermaid',
          code: fullCode,
          rawStartIndex: startLine,
          rawEndIndex: i,
        });
      } else {
        blocks.push({
          id: blockId++,
          type: 'code',
          lang: lang || 'text',
          code: fullCode,
          rawStartIndex: startLine,
          rawEndIndex: i,
        });
      }
      continue;
    }

    // 2. Display Math ($$)
    if (line.trim().startsWith('$$')) {
      const mathLines: string[] = [];
      const startLine = i;
      if (line.trim() === '$$') {
        i++;
        while (i < lines.length && lines[i].trim() !== '$$') {
          mathLines.push(lines[i]);
          i++;
        }
        i++;
      } else {
        // Single line $$ math $$
        const match = line.match(/\$\$(.*?)\$\$/);
        if (match) mathLines.push(match[1]);
        i++;
      }
      blocks.push({
        id: blockId++,
        type: 'math-block',
        code: mathLines.join('\n'),
        rawStartIndex: startLine,
        rawEndIndex: i,
      });
      continue;
    }

    // 3. Callout (> [!type] Title)
    const calloutMatch = line.match(/^>\s*\[!([a-zA-Z0-9_-]+)\]([+-]?)(.*)$/);
    if (calloutMatch) {
      const calloutType = calloutMatch[1].toLowerCase();
      const calloutTitle = calloutMatch[3].trim() || calloutMatch[1];
      const bodyLines: string[] = [];
      const startLine = i;
      i++;
      while (i < lines.length && lines[i].startsWith('>')) {
        bodyLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        id: blockId++,
        type: 'callout',
        calloutType,
        calloutTitle,
        calloutBody: renderInlineMarkdown(bodyLines.join('\n')),
        rawStartIndex: startLine,
        rawEndIndex: i,
      });
      continue;
    }

    // 4. Tables (| header | header |)
    if (line.startsWith('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
      const tableLines: string[] = [];
      const startLine = i;
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({
        id: blockId++,
        type: 'table',
        code: JSON.stringify(tableLines),
        rawStartIndex: startLine,
        rawEndIndex: i,
      });
      continue;
    }

    // 5. Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = renderInlineMarkdown(headingMatch[2]);
      const cls = [
        '',
        'text-2xl font-bold border-b border-[var(--background-modifier-border)] pb-2 mt-6 mb-3',
        'text-xl font-bold mt-5 mb-2.5',
        'text-lg font-bold mt-4 mb-2',
        'text-base font-semibold mt-3 mb-1.5',
        'text-sm font-semibold mt-2.5 mb-1',
        'text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mt-2 mb-1',
      ][level];

      blocks.push({
        id: blockId++,
        type: 'html',
        content: `<h${level} class="${cls}">${title}</h${level}>`,
        rawStartIndex: i,
        rawEndIndex: i + 1,
      });
      i++;
      continue;
    }

    // 6. Horizontal Rule (---, ***)
    if (/^([-*_]){3,}\s*$/.test(line)) {
      blocks.push({
        id: blockId++,
        type: 'html',
        content: '<hr class="my-6 border-t border-[var(--background-modifier-border)] opacity-60" />',
        rawStartIndex: i,
        rawEndIndex: i + 1,
      });
      i++;
      continue;
    }

    // 7. Task list item (- [ ] or - [x])
    const taskMatch = line.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s*)(.*)$/);
    if (taskMatch) {
      const checked = taskMatch[2].toLowerCase() === 'x';
      const text = renderInlineMarkdown(taskMatch[4]);
      const lineNum = i;

      blocks.push({
        id: blockId++,
        type: 'html',
        content: `
          <div class="flex items-start gap-2.5 py-1">
            <input
              type="checkbox"
              ${checked ? 'checked' : ''}
              data-task-line="${lineNum}"
              class="reading-task-checkbox w-4 h-4 mt-0.5 rounded text-[var(--interactive-accent)] border-[var(--background-modifier-border)] cursor-pointer"
            />
            <span class="${checked ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-normal)]'}">${text}</span>
          </div>
        `,
        rawStartIndex: i,
        rawEndIndex: i + 1,
      });
      i++;
      continue;
    }

    // 8. Normal bullet list item (- , * )
    const bulletMatch = line.match(/^(\s*)([-*+]\s+)(.*)$/);
    if (bulletMatch) {
      const text = renderInlineMarkdown(bulletMatch[3]);
      blocks.push({
        id: blockId++,
        type: 'html',
        content: `<li class="ml-5 list-disc text-[var(--text-normal)] py-0.5">${text}</li>`,
        rawStartIndex: i,
        rawEndIndex: i + 1,
      });
      i++;
      continue;
    }

    // 9. Ordered list item (1. )
    const numMatch = line.match(/^(\s*)(\d+\.\s+)(.*)$/);
    if (numMatch) {
      const text = renderInlineMarkdown(numMatch[3]);
      blocks.push({
        id: blockId++,
        type: 'html',
        content: `<li class="ml-5 list-decimal text-[var(--text-normal)] py-0.5">${text}</li>`,
        rawStartIndex: i,
        rawEndIndex: i + 1,
      });
      i++;
      continue;
    }

    // 10. Blockquote (> )
    if (line.startsWith('>')) {
      const quoteText = renderInlineMarkdown(line.replace(/^>\s?/, ''));
      blocks.push({
        id: blockId++,
        type: 'html',
        content: `<blockquote class="border-l-4 border-[var(--interactive-accent)] pl-4 py-1 my-2 italic text-[var(--text-muted)] bg-[var(--background-secondary)] rounded-r">${quoteText}</blockquote>`,
        rawStartIndex: i,
        rawEndIndex: i + 1,
      });
      i++;
      continue;
    }

    // 11. Blank line
    if (!line.trim()) {
      blocks.push({
        id: blockId++,
        type: 'html',
        content: '<div class="h-3"></div>',
        rawStartIndex: i,
        rawEndIndex: i + 1,
      });
      i++;
      continue;
    }

    // 12. Standard Paragraph
    blocks.push({
      id: blockId++,
      type: 'html',
      content: `<p class="leading-relaxed text-[var(--text-normal)] py-1">${renderInlineMarkdown(line)}</p>`,
      rawStartIndex: i,
      rawEndIndex: i + 1,
    });
    i++;
  }

  return blocks;
});

// Render inline markdown tokens: bold, italic, strike, highlight, inline code, wikilinks, inline math
function renderInlineMarkdown(text: string): string {
  // Strip comments %% %%
  let out = text.replace(/%%[\s\S]*?%%/g, '');

  // Math: $math$
  out = out.replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (_, math) => {
    try {
      return katex.renderToString(math, { throwOnError: false, displayMode: false });
    } catch {
      return `<code class="text-red-400">$${math}$</code>`;
    }
  });

  // Wikilinks: [[Note Name]] or ![[Image.png]]
  out = out.replace(/!\[\[(.*?)\]\]/g, (_, target) => {
    return `<div class="my-3 flex justify-center"><img src="/${target}" alt="${target}" class="max-h-96 rounded border border-[var(--background-modifier-border)] object-contain shadow-sm" /></div>`;
  });

  out = out.replace(/\[\[(.*?)\]\]/g, (_, target) => {
    return `<a class="text-[var(--text-accent)] hover:underline cursor-pointer font-medium">[[${target}]]</a>`;
  });

  // Highlight: ==text==
  out = out.replace(/==([^=\n]+)==/g, '<mark class="bg-[var(--text-highlight-bg,rgba(250,204,21,0.25))] px-1 py-0.2 rounded text-[var(--text-normal)]">$1</mark>');

  // Strikethrough: ~~text~~
  out = out.replace(/~~([^~\n]+)~~/g, '<del class="line-through text-[var(--text-muted)]">$1</del>');

  // Bold: **text**
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong class="font-bold text-[var(--text-normal)]">$1</strong>');

  // Italic: *text*
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em class="italic">$1</em>');

  // Inline Code: `code`
  out = out.replace(/(?<!`)`([^`\n]+)`(?!`)/g, '<code class="px-1.5 py-0.5 rounded bg-[var(--background-secondary)] font-mono text-xs text-[var(--text-accent)] border border-[var(--background-modifier-border)]">$1</code>');

  // Footnote references: [^1]
  out = out.replace(/\[\^([^\]]+)\]/g, '<sup class="text-xs text-[var(--text-accent)] cursor-pointer font-mono font-bold">[$1]</sup>');

  return out;
}

// Copy Code Block Content
async function copyCode(code: string, blockId: number) {
  try {
    await navigator.clipboard.writeText(code);
    copiedCodeIdx.value = blockId;
    setTimeout(() => {
      if (copiedCodeIdx.value === blockId) copiedCodeIdx.value = null;
    }, 2000);
  } catch (err) {
    console.warn('Failed to copy code:', err);
  }
}

// Render KaTeX for display math blocks
function renderDisplayMath(latex: string): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: true });
  } catch {
    return `<div class="text-red-400 p-2 font-mono text-xs">${latex}</div>`;
  }
}

// Render Table Block
function parseTable(code: string): { headers: string[]; rows: string[][] } {
  try {
    const rawLines: string[] = JSON.parse(code);
    if (rawLines.length === 0) return { headers: [], rows: [] };

    const headers = rawLines[0]
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => (idx !== 0 && idx !== arr.length - 1) || arr.length <= 2);

    const rows: string[][] = [];
    for (let i = 2; i < rawLines.length; i++) {
      const cols = rawLines[i]
        .split('|')
        .map((c) => c.trim())
        .filter((_, idx, arr) => (idx !== 0 && idx !== arr.length - 1) || arr.length <= 2);
      rows.push(cols);
    }
    return { headers, rows };
  } catch {
    return { headers: [], rows: [] };
  }
}

// Render Mermaid diagrams on mount/update
async function renderMermaidDiagrams() {
  await nextTick();
  const elements = readingContainer.value?.querySelectorAll('.mermaid-target');
  if (!elements) return;

  elements.forEach(async (el, idx) => {
    const code = el.getAttribute('data-code');
    if (!code) return;
    try {
      const id = `mermaid-reading-${idx}-${Date.now()}`;
      const { svg } = await mermaid.render(id, code.trim());
      el.innerHTML = svg;
    } catch (err: any) {
      el.innerHTML = `<pre class="text-xs text-red-400 p-2">Mermaid Diagram Error:\n${err.message || err}</pre>`;
    }
  });
}

function handleContainerClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target && target.classList.contains('reading-task-checkbox')) {
    const lineStr = target.getAttribute('data-task-line');
    if (lineStr !== null) {
      const lineNum = parseInt(lineStr, 10);
      const isChecked = (target as HTMLInputElement).checked;
      handleCheckboxClick(lineNum, isChecked);
    }
  }
}

watch(
  () => props.content,
  () => {
    renderMermaidDiagrams();
  }
);

onMounted(() => {
  renderMermaidDiagrams();
});
</script>

<template>
  <div
    ref="readingContainer"
    class="reading-view-root px-8 py-6 text-[var(--text-normal)] leading-relaxed select-text overflow-y-auto h-full"
    @click="handleContainerClick"
  >
    <div
      v-for="block in renderedBlocks"
      :key="block.id"
      class="reading-block mb-1"
    >
      <!-- 1. Pure HTML Block (Paragraph, Heading, List, HR, Task) -->
      <div v-if="block.type === 'html'" v-html="block.content"></div>

      <!-- 2. Code Block -->
      <div
        v-else-if="block.type === 'code'"
        class="my-3 rounded border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] overflow-hidden"
      >
        <div class="flex items-center justify-between px-3 py-1.5 bg-[var(--background-secondary-alt)] border-b border-[var(--background-modifier-border)] text-[11px] text-[var(--text-muted)] font-mono">
          <span>{{ block.lang || 'text' }}</span>
          <button
            @click="copyCode(block.code || '', block.id)"
            class="flex items-center gap-1 hover:text-[var(--text-normal)] transition-colors p-0.5 rounded"
          >
            <component :is="copiedCodeIdx === block.id ? Check : Copy" class="w-3.5 h-3.5" />
            <span>{{ copiedCodeIdx === block.id ? 'Copied!' : 'Copy' }}</span>
          </button>
        </div>
        <pre class="p-3 text-xs font-mono overflow-x-auto text-[var(--text-normal)] leading-relaxed"><code>{{ block.code }}</code></pre>
      </div>

      <!-- 3. Mermaid Diagram -->
      <div
        v-else-if="block.type === 'mermaid'"
        class="my-4 p-4 rounded border border-[var(--background-modifier-border)] bg-[var(--background-secondary)] flex justify-center items-center overflow-x-auto"
      >
        <div class="mermaid-target" :data-code="block.code">Loading diagram...</div>
      </div>

      <!-- 4. Display Math Block -->
      <div
        v-else-if="block.type === 'math-block'"
        class="my-4 p-3 bg-[var(--background-secondary)] rounded border border-[var(--background-modifier-border)] flex justify-center overflow-x-auto"
        v-html="renderDisplayMath(block.code || '')"
      ></div>

      <!-- 5. Callout Block -->
      <div
        v-else-if="block.type === 'callout'"
        class="my-3 rounded-lg border border-[var(--interactive-accent)]/40 bg-[var(--background-secondary)] overflow-hidden shadow-sm"
      >
        <div
          class="flex items-center justify-between px-3.5 py-2 cursor-pointer bg-[var(--background-secondary-alt)] hover:bg-[var(--background-modifier-hover)] transition-colors"
          @click="calloutsFolded[block.id] = !calloutsFolded[block.id]"
        >
          <div class="flex items-center gap-2 font-semibold text-xs text-[var(--text-accent)]">
            <Lightbulb v-if="block.calloutType === 'tip'" class="w-4 h-4 text-amber-400" />
            <AlertTriangle v-else-if="block.calloutType === 'warning'" class="w-4 h-4 text-amber-500" />
            <Flame v-else-if="block.calloutType === 'danger'" class="w-4 h-4 text-rose-500" />
            <CheckCircle v-else-if="block.calloutType === 'success'" class="w-4 h-4 text-emerald-500" />
            <Info v-else class="w-4 h-4 text-indigo-400" />
            <span>{{ block.calloutTitle }}</span>
          </div>
          <component :is="calloutsFolded[block.id] ? ChevronRight : ChevronDown" class="w-4 h-4 text-[var(--text-muted)]" />
        </div>
        <div
          v-if="!calloutsFolded[block.id]"
          class="px-4 py-2.5 text-xs text-[var(--text-normal)] leading-relaxed border-t border-[var(--background-modifier-border)]/50"
          v-html="block.calloutBody"
        ></div>
      </div>

      <!-- 6. Table Block -->
      <div
        v-else-if="block.type === 'table'"
        class="my-4 overflow-x-auto rounded border border-[var(--background-modifier-border)]"
      >
        <table class="w-full text-xs border-collapse">
          <thead>
            <tr class="bg-[var(--background-secondary-alt)] border-b border-[var(--background-modifier-border)]">
              <th
                v-for="(header, hIdx) in parseTable(block.code || '').headers"
                :key="hIdx"
                class="px-3 py-2 text-left font-semibold text-[var(--text-normal)] border-r border-[var(--background-modifier-border)] last:border-r-0"
              >
                {{ header }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, rIdx) in parseTable(block.code || '').rows"
              :key="rIdx"
              class="border-b border-[var(--background-modifier-border)] last:border-b-0 hover:bg-[var(--background-modifier-hover)] transition-colors"
            >
              <td
                v-for="(cell, cIdx) in row"
                :key="cIdx"
                class="px-3 py-2 text-[var(--text-normal)] border-r border-[var(--background-modifier-border)] last:border-r-0"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
