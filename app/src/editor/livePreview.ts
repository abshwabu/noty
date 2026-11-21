import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
import { parseWikilinkInner, handleWikilinkClick } from './links';
import { useVaultStore } from '../stores/vault';
import { getActivePinia } from 'pinia';
import { vaultSearch } from '../services/search';

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
});

// --- WIDGETS ---

class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-task-checkbox-wrap inline-flex items-center align-middle mr-1.5 cursor-pointer';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.className =
      'cm-task-checkbox w-4 h-4 rounded text-[var(--interactive-accent)] border-[var(--background-modifier-border)] focus:ring-0 cursor-pointer';

    input.addEventListener('click', (e) => {
      e.stopPropagation();
      const newChar = input.checked ? 'x' : ' ';
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 1, insert: newChar },
      });
    });

    wrap.appendChild(input);
    return wrap;
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('hr');
    hr.className = 'cm-hr my-4 border-t border-[var(--background-modifier-border)] opacity-60';
    return hr;
  }
}

class WikilinkWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly displayText: string,
    readonly isResolved: boolean,
    readonly heading?: string
  ) {
    super();
  }

  eq(other: WikilinkWidget) {
    return (
      other.target === this.target &&
      other.displayText === this.displayText &&
      other.isResolved === this.isResolved &&
      other.heading === this.heading
    );
  }

  toDOM(): HTMLElement {
    const a = document.createElement('span');
    a.className = this.isResolved
      ? 'cm-wikilink text-[var(--text-accent)] hover:underline cursor-pointer font-medium'
      : 'cm-wikilink cm-link-unresolved text-[var(--text-muted)] opacity-70 hover:opacity-100 hover:text-[var(--text-accent)] underline decoration-dashed cursor-pointer font-medium';
    a.textContent = this.displayText;
    a.setAttribute('data-wikilink-target', this.target);
    a.setAttribute('title', this.isResolved ? `Open ${this.target}` : `Create ${this.target}`);

    a.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleWikilinkClick(this.target, this.isResolved, this.heading);
    });

    return a;
  }
}

class EmbedWidget extends WidgetType {
  constructor(readonly target: string) {
    super();
  }

  eq(other: EmbedWidget) {
    return other.target === this.target;
  }

  toDOM(): HTMLElement {
    const ext = this.target.split('.').pop()?.toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '');
    const isPdf = ext === 'pdf';

    if (isImage) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'cm-embed-image my-3 flex justify-center';
      const img = document.createElement('img');
      img.src = this.target.startsWith('/') ? this.target : `/${this.target}`;
      img.alt = this.target;
      img.className = 'max-h-96 rounded border border-[var(--background-modifier-border)] object-contain shadow-sm';
      imgWrap.appendChild(img);
      return imgWrap;
    }

    if (isPdf) {
      const pdfWrap = document.createElement('div');
      pdfWrap.className =
        'cm-embed-pdf my-3 p-3 bg-[var(--background-secondary)] rounded border border-[var(--background-modifier-border)] flex items-center justify-between';
      pdfWrap.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 font-mono text-[10px] font-bold">PDF</span>
          <span class="text-xs text-[var(--text-normal)] font-medium">${this.target}</span>
        </div>
        <span class="text-[11px] text-[var(--text-muted)]">Embedded Document</span>
      `;
      return pdfWrap;
    }

    const noteWrap = document.createElement('div');
    noteWrap.className =
      'cm-embed-note my-3 p-3 bg-[var(--background-secondary-alt)] border-l-4 border-[var(--interactive-accent)] rounded-r cursor-pointer';
    noteWrap.setAttribute('data-wikilink-target', this.target);
    noteWrap.innerHTML = `
      <div class="text-[11px] font-semibold text-[var(--text-accent)] mb-1 flex items-center gap-1.5">
        <span>📄 Transclusion: ${this.target}</span>
      </div>
      <div class="text-xs text-[var(--text-muted)] italic">Click to view note [[${this.target}]]</div>
    `;
    noteWrap.addEventListener('click', () => {
      handleWikilinkClick(this.target, true);
    });
    return noteWrap;
  }
}

class MarkdownLinkWidget extends WidgetType {
  constructor(readonly label: string, readonly url: string) {
    super();
  }

  eq(other: MarkdownLinkWidget) {
    return other.label === this.label && other.url === this.url;
  }

  toDOM(): HTMLElement {
    const a = document.createElement('a');
    a.className = 'cm-markdown-link text-[var(--text-accent)] hover:underline cursor-pointer font-medium';
    a.textContent = this.label;
    a.href = this.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    return a;
  }
}

class MathWidget extends WidgetType {
  constructor(
    readonly mathText: string,
    readonly isBlock: boolean
  ) {
    super();
  }

  eq(other: MathWidget) {
    return other.mathText === this.mathText && other.isBlock === this.isBlock;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = this.isBlock
      ? 'cm-math-block block text-center my-3 py-2 px-3 bg-[var(--background-secondary)] rounded select-none cursor-pointer'
      : 'cm-math-inline inline-block px-1 bg-[var(--background-secondary)] rounded select-none cursor-pointer';

    try {
      span.innerHTML = katex.renderToString(this.mathText, {
        throwOnError: false,
        displayMode: this.isBlock,
      });
    } catch {
      span.textContent = this.mathText;
      span.className += ' text-red-400';
    }
    return span;
  }
}

let mermaidCounter = 0;
class MermaidWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }

  eq(other: MermaidWidget) {
    return other.code === this.code;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className =
      'cm-mermaid-block my-3 p-4 bg-[var(--background-secondary)] rounded border border-[var(--background-modifier-border)] flex justify-center items-center overflow-x-auto';

    const id = `mermaid-cm-${++mermaidCounter}`;
    mermaid
      .render(id, this.code.trim())
      .then(({ svg }) => {
        container.innerHTML = svg;
      })
      .catch((err) => {
        container.innerHTML = `<pre class="text-xs text-red-400 p-2">Mermaid Error:\n${err.message || err}</pre>`;
      });

    return container;
  }
}

class TableWidget extends WidgetType {
  constructor(readonly rawLines: string[]) {
    super();
  }

  eq(other: TableWidget) {
    return (
      other.rawLines.length === this.rawLines.length &&
      other.rawLines.every((line, i) => line === this.rawLines[i])
    );
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-table-wrapper my-3 overflow-x-auto rounded border border-[var(--background-modifier-border)]';

    const table = document.createElement('table');
    table.className = 'w-full text-sm border-collapse';

    if (this.rawLines.length === 0) return wrapper;

    const thead = document.createElement('thead');
    const headerCols = this.rawLines[0]
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => (idx !== 0 && idx !== arr.length - 1) || arr.length <= 2);

    const trHead = document.createElement('tr');
    trHead.className = 'bg-[var(--background-secondary-alt)] border-b border-[var(--background-modifier-border)]';
    for (const col of headerCols) {
      const th = document.createElement('th');
      th.className = 'px-3 py-2 text-left font-semibold text-[var(--text-normal)] border-r border-[var(--background-modifier-border)] last:border-r-0';
      th.textContent = col;
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let i = 2; i < this.rawLines.length; i++) {
      const rowCols = this.rawLines[i]
        .split('|')
        .map((c) => c.trim())
        .filter((_, idx, arr) => (idx !== 0 && idx !== arr.length - 1) || arr.length <= 2);

      const tr = document.createElement('tr');
      tr.className = 'border-b border-[var(--background-modifier-border)] hover:bg-[var(--background-modifier-hover)] transition-colors';
      for (const col of rowCols) {
        const td = document.createElement('td');
        td.className = 'px-3 py-2 text-[var(--text-normal)] border-r border-[var(--background-modifier-border)] last:border-r-0';
        td.textContent = col;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }
}

class QueryEmbedWidget extends WidgetType {
  constructor(readonly query: string) {
    super();
  }

  eq(other: QueryEmbedWidget) {
    return other.query === this.query;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className =
      'cm-query-embed-block my-3 rounded-lg border border-[var(--background-modifier-border)] bg-[var(--background-secondary-alt)] overflow-hidden shadow-sm text-xs select-none';

    const header = document.createElement('div');
    header.className =
      'px-3 py-2 bg-[var(--background-secondary)] border-b border-[var(--background-modifier-border)] flex items-center justify-between text-xs font-semibold text-[var(--text-accent)]';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'font-mono text-[11px] text-[var(--text-normal)] truncate';
    titleSpan.textContent = `query: ${this.query.trim()}`;

    const badge = document.createElement('span');
    badge.className =
      'query-count-badge text-[10px] text-[var(--text-muted)] bg-[var(--background-primary)] px-2 py-0.5 rounded-full border border-[var(--background-modifier-border)]';
    badge.textContent = 'Searching...';

    header.appendChild(titleSpan);
    header.appendChild(badge);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'p-2 space-y-1.5 max-h-72 overflow-y-auto';
    container.appendChild(body);

    vaultSearch(this.query.trim())
      .then((res) => {
        badge.textContent = `${res.total_matches} in ${res.total_files}`;
        if (res.results.length === 0) {
          body.innerHTML = '<div class="py-3 text-center text-xs text-[var(--text-muted)] italic">No notes matched this query.</div>';
          return;
        }

        body.innerHTML = '';
        for (const r of res.results) {
          const item = document.createElement('div');
          item.className =
            'border border-[var(--background-modifier-border)] rounded bg-[var(--background-primary)] overflow-hidden text-xs';

          const itemHead = document.createElement('div');
          itemHead.className =
            'flex items-center gap-1.5 px-2 py-1.5 hover:bg-[var(--background-modifier-hover)] cursor-pointer select-none';
          itemHead.innerHTML = `
            <span class="font-medium text-[var(--text-normal)] hover:text-[var(--text-accent)] truncate">${r.file_title || r.file_path}</span>
            <span class="text-[10px] text-[var(--text-muted)] ml-auto shrink-0">(${r.matches.length})</span>
          `;
          itemHead.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleWikilinkClick(r.file_path, true);
          });
          item.appendChild(itemHead);

          if (r.matches.length > 0) {
            const list = document.createElement('div');
            list.className =
              'border-t border-[var(--background-modifier-border)] bg-[var(--background-secondary-alt)] px-3 py-1 space-y-1';
            for (const m of r.matches.slice(0, 5)) {
              const lineEl = document.createElement('div');
              lineEl.className =
                'py-0.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-normal)] cursor-pointer truncate flex items-center gap-1.5';
              lineEl.innerHTML = `<span class="text-[9px] font-mono text-[var(--text-faint)]">L${m.line_number}:</span><span class="truncate">${m.line_text}</span>`;
              lineEl.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleWikilinkClick(r.file_path, true);
              });
              list.appendChild(lineEl);
            }
            item.appendChild(list);
          }

          body.appendChild(item);
        }
      })
      .catch((err) => {
        body.innerHTML = `<div class="py-2 px-3 text-xs text-red-400">Query error: ${String(err)}</div>`;
      });

    return container;
  }
}

interface QueuedDeco {
  from: number;
  to: number;
  deco: Decoration;
  isLine?: boolean;
}

// --- DECORATIONS BUILDER ---

function buildLivePreviewDecorations(view: EditorView): DecorationSet {
  const queued: QueuedDeco[] = [];
  const { doc, selection } = view.state;
  const cursorHead = selection.main.head;
  const cursorLine = doc.lineAt(cursorHead).number;

  // Viewport virtualization for smooth 10,000-line performance
  for (const { from, to } of view.visibleRanges) {
    let pos = from;

    while (pos < to) {
      const line = doc.lineAt(pos);
      const isCursorOnLine = line.number === cursorLine;
      const text = line.text;

      // 1. Headings (# through ######)
      const headingMatch = text.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const markerLen = headingMatch[1].length + 1; // "# "

        if (!isCursorOnLine) {
          // Conceal the '# ' marker
          queued.push({
            from: line.from,
            to: line.from + markerLen,
            deco: Decoration.replace({}),
          });
        }
        queued.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({
            class: `cm-heading cm-heading-${level}`,
          }),
          isLine: true,
        });
      }

      // 2. Horizontal Rule (---, ***, ___)
      const hrMatch = text.match(/^([-*_]){3,}\s*$/);
      if (hrMatch && !isCursorOnLine) {
        queued.push({
          from: line.from,
          to: line.to,
          deco: Decoration.replace({
            widget: new HorizontalRuleWidget(),
          }),
        });
        pos = line.to + 1;
        continue;
      }

      // 3. Task List Items (- [ ] or - [x])
      const taskMatch = text.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s*)/);
      if (taskMatch) {
        const checkPos = line.from + taskMatch[1].length;
        const isChecked = taskMatch[2].toLowerCase() === 'x';
        const widgetFrom = line.from + taskMatch[1].length - 1; // include '['
        const widgetTo = line.from + taskMatch[1].length + 2; // include ']'

        queued.push({
          from: widgetFrom,
          to: widgetTo,
          deco: Decoration.replace({
            widget: new TaskCheckboxWidget(isChecked, checkPos),
          }),
        });
      }

      // 4. Callout Header (> [!note])
      const calloutMatch = text.match(/^>\s*\[!([a-zA-Z0-9_-]+)\]([+-]?)(.*)$/);
      if (calloutMatch) {
        const calloutType = calloutMatch[1].toLowerCase();
        queued.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({
            class: `cm-callout-line cm-callout-${calloutType}`,
          }),
          isLine: true,
        });
      } else if (text.startsWith('> ')) {
        queued.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({
            class: 'cm-blockquote-line',
          }),
          isLine: true,
        });
      }

      // 5. Inline Formatting (bold, italic, strike, highlight, inline code, comments, inline math)
      if (!isCursorOnLine) {
        collectInlineFormatting(line.from, text, queued);
      }

      pos = line.to + 1;
    }
  }

  // 6. Multi-line Block Widgets (Mermaid & Math)
  collectBlockWidgets(view, queued);

  // Sort strictly by from ascending; line decorations first at same position
  queued.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    if (a.isLine && !b.isLine) return -1;
    if (!a.isLine && b.isLine) return 1;
    return a.to - b.to;
  });

  const builder = new RangeSetBuilder<Decoration>();
  let lastReplaceEnd = -1;

  for (const item of queued) {
    // Prevent overlapping replace decorations which crash CodeMirror's RangeSetBuilder
    if (!item.isLine && (item.deco.spec as any).replace) {
      if (item.from < lastReplaceEnd) {
        continue;
      }
      lastReplaceEnd = item.to;
    }
    builder.add(item.from, item.to, item.deco);
  }

  return builder.finish();
}

function collectInlineFormatting(
  lineFrom: number,
  text: string,
  queued: QueuedDeco[]
) {
  // Highlight: ==text==
  const highlightRegex = /==([^=\n]+)==/g;
  let match: RegExpExecArray | null;
  while ((match = highlightRegex.exec(text)) !== null) {
    const start = lineFrom + match.index;
    const end = start + match[0].length;
    queued.push({ from: start, to: start + 2, deco: Decoration.replace({}) });
    queued.push({
      from: start + 2,
      to: end - 2,
      deco: Decoration.mark({ class: 'cm-highlight' }),
    });
    queued.push({ from: end - 2, to: end, deco: Decoration.replace({}) });
  }

  // Strikethrough: ~~text~~
  const strikeRegex = /~~([^~\n]+)~~/g;
  while ((match = strikeRegex.exec(text)) !== null) {
    const start = lineFrom + match.index;
    const end = start + match[0].length;
    queued.push({ from: start, to: start + 2, deco: Decoration.replace({}) });
    queued.push({
      from: start + 2,
      to: end - 2,
      deco: Decoration.mark({ class: 'cm-strikethrough line-through text-[var(--text-muted)]' }),
    });
    queued.push({ from: end - 2, to: end, deco: Decoration.replace({}) });
  }

  // Bold: **text**
  const boldRegex = /\*\*([^*\n]+)\*\*/g;
  while ((match = boldRegex.exec(text)) !== null) {
    const start = lineFrom + match.index;
    const end = start + match[0].length;
    queued.push({ from: start, to: start + 2, deco: Decoration.replace({}) });
    queued.push({
      from: start + 2,
      to: end - 2,
      deco: Decoration.mark({ class: 'cm-bold font-bold' }),
    });
    queued.push({ from: end - 2, to: end, deco: Decoration.replace({}) });
  }

  // Italic: *text*
  const italicRegex = /(?<!\*)\*([^*\n]+)\*(?!\*)/g;
  while ((match = italicRegex.exec(text)) !== null) {
    const start = lineFrom + match.index;
    const end = start + match[0].length;
    queued.push({ from: start, to: start + 1, deco: Decoration.replace({}) });
    queued.push({
      from: start + 1,
      to: end - 1,
      deco: Decoration.mark({ class: 'cm-italic italic' }),
    });
    queued.push({ from: end - 1, to: end, deco: Decoration.replace({}) });
  }

  // Inline Code: `code`
  const codeRegex = /(?<!`)`([^`\n]+)`(?!`)/g;
  while ((match = codeRegex.exec(text)) !== null) {
    const start = lineFrom + match.index;
    const end = start + match[0].length;
    queued.push({ from: start, to: start + 1, deco: Decoration.replace({}) });
    queued.push({
      from: start + 1,
      to: end - 1,
      deco: Decoration.mark({
        class: 'cm-inline-code px-1.5 py-0.5 rounded bg-[var(--background-secondary)] font-mono text-sm text-[var(--text-accent)]',
      }),
    });
    queued.push({ from: end - 1, to: end, deco: Decoration.replace({}) });
  }

  // Inline Math: $math$
  const mathRegex = /(?<!\$)\$([^$\n]+)\$(?!\$)/g;
  while ((match = mathRegex.exec(text)) !== null) {
    const start = lineFrom + match.index;
    const end = start + match[0].length;
    queued.push({
      from: start,
      to: end,
      deco: Decoration.replace({
        widget: new MathWidget(match[1], false),
      }),
    });
  }

  // Comments: %%comment%%
  const commentRegex = /%%([\s\S]*?)%%/g;
  while ((match = commentRegex.exec(text)) !== null) {
    const start = lineFrom + match.index;
    const end = start + match[0].length;
    queued.push({
      from: start,
      to: end,
      deco: Decoration.replace({}),
    });
  }

  // Embeds: ![[Note]] or ![[image.png]]
  const embedRegex = /!\[\[([^\]]+)\]\]/g;
  while ((match = embedRegex.exec(text)) !== null) {
    const start = lineFrom + match.index;
    const end = start + match[0].length;
    queued.push({
      from: start,
      to: end,
      deco: Decoration.replace({
        widget: new EmbedWidget(match[1].trim()),
      }),
    });
  }

  // Wikilinks: [[Note]], [[Note|Alias]], [[Note#Heading]], [[Note#^block]]
  const wikilinkRegex = /(?<!!)\[\[([^\]]+)\]\]/g;
  const availableFiles = getActivePinia() ? useVaultStore().allFilePaths : [];

  while ((match = wikilinkRegex.exec(text)) !== null) {
    const start = lineFrom + match.index;
    const end = start + match[0].length;
    const parsed = parseWikilinkInner(match[1], false, availableFiles);

    queued.push({
      from: start,
      to: end,
      deco: Decoration.replace({
        widget: new WikilinkWidget(
          parsed.targetNote,
          parsed.displayText,
          parsed.isResolved,
          parsed.heading
        ),
      }),
    });
  }

  // Markdown links: [label](url)
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = mdLinkRegex.exec(text)) !== null) {
    const start = lineFrom + match.index;
    const end = start + match[0].length;
    queued.push({
      from: start,
      to: end,
      deco: Decoration.replace({
        widget: new MarkdownLinkWidget(match[1], match[2]),
      }),
    });
  }

  // Tags: #tag or #nested/tag
  const tagRegex = /(?:^|\s)(#[a-zA-Z0-9_\-/]+)/g;
  while ((match = tagRegex.exec(text)) !== null) {
    const matchStr = match[1];
    const matchIndex = match.index + (match[0].length - matchStr.length);
    const start = lineFrom + matchIndex;
    const end = start + matchStr.length;

    // Ignore hex colors like #fff or #ffffff
    if (/^#[0-9a-fA-F]{3,6}$/.test(matchStr)) {
      continue;
    }

    queued.push({
      from: start,
      to: end,
      deco: Decoration.mark({
        class: 'cm-tag px-1 py-0.2 rounded bg-[var(--background-modifier-hover)] text-[var(--text-accent)] font-medium text-xs',
      }),
    });
  }
}

function collectBlockWidgets(view: EditorView, queued: QueuedDeco[]) {
  const { doc, selection } = view.state;
  const cursorHead = selection.main.head;
  const fullText = doc.toString();

  // 1. Mermaid code blocks: ```mermaid ... ```
  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)\n```/g;
  let mMatch: RegExpExecArray | null;
  while ((mMatch = mermaidRegex.exec(fullText)) !== null) {
    const from = mMatch.index;
    const to = from + mMatch[0].length;
    const code = mMatch[1];

    if (cursorHead < from || cursorHead > to) {
      queued.push({
        from,
        to,
        deco: Decoration.replace({
          widget: new MermaidWidget(code),
          block: true,
        }),
      });
    }
  }

  // 2. Block Math: $$ math $$
  const blockMathRegex = /\$\$\s*\n?([\s\S]*?)\n?\$\$/g;
  let mathMatch: RegExpExecArray | null;
  while ((mathMatch = blockMathRegex.exec(fullText)) !== null) {
    const from = mathMatch.index;
    const to = from + mathMatch[0].length;
    const mathText = mathMatch[1];

    if (cursorHead < from || cursorHead > to) {
      queued.push({
        from,
        to,
        deco: Decoration.replace({
          widget: new MathWidget(mathText, true),
          block: true,
        }),
      });
    }
  }

  // 3. Markdown Tables: | Header | Header |\n| --- | --- |\n| Cell | Cell |
  const tableRegex = /(^\|[^\n]+\|\r?\n\|[-:\s|]+\|\r?\n(?:\|[^\n]+\|\r?\n?)*)/gm;
  let tMatch: RegExpExecArray | null;
  while ((tMatch = tableRegex.exec(fullText)) !== null) {
    const from = tMatch.index;
    const to = from + tMatch[0].length;
    const rawLines = tMatch[0].trim().split(/\r?\n/);

    if (rawLines.length >= 2 && (cursorHead < from || cursorHead > to)) {
      queued.push({
        from,
        to,
        deco: Decoration.replace({
          widget: new TableWidget(rawLines),
          block: true,
        }),
      });
    }
  }

  // 4. Embedded Search Query blocks: ```query ... ```
  const queryRegex = /```query\s*\n([\s\S]*?)\n```/g;
  let qMatch: RegExpExecArray | null;
  while ((qMatch = queryRegex.exec(fullText)) !== null) {
    const from = qMatch.index;
    const to = from + qMatch[0].length;
    const queryStr = qMatch[1];

    if (cursorHead < from || cursorHead > to) {
      queued.push({
        from,
        to,
        deco: Decoration.replace({
          widget: new QueryEmbedWidget(queryStr),
          block: true,
        }),
      });
    }
  }
}

/**
 * CodeMirror 6 ViewPlugin that manages Live Preview decorations
 */
export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = buildLivePreviewDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
