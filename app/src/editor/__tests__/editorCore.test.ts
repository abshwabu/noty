// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { livePreviewPlugin } from '../livePreview';
import {
  insertSmartNewline,
  toggleTaskUnderCursor,
} from '../keymaps';
import {
  getCachedEditorState,
  setCachedEditorState,
  clearAllCachedEditorStates,
} from '../stateCache';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

describe('Editor Core - State & Cache', () => {
  it('preserves EditorState across tab switches', () => {
    clearAllCachedEditorStates();
    const state1 = EditorState.create({
      doc: '# Note 1\nSome initial text.',
      extensions: [markdown()],
    });

    setCachedEditorState('Note 1.md', state1);
    const retrieved = getCachedEditorState('Note 1.md');

    expect(retrieved).toBeDefined();
    expect(retrieved?.doc.toString()).toBe('# Note 1\nSome initial text.');
  });
});

describe('Editor Core - Smart List Continuation', () => {
  it('continues unordered bullet list on Enter', () => {
    const parent = document.createElement('div');
    const state = EditorState.create({
      doc: '- First bullet item',
      selection: { anchor: 19 },
      extensions: [markdown()],
    });
    const view = new EditorView({ state, parent });

    const handled = insertSmartNewline(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- First bullet item\n- ');
  });

  it('breaks out of empty unordered bullet list on Enter', () => {
    const parent = document.createElement('div');
    const state = EditorState.create({
      doc: '- ',
      selection: { anchor: 2 },
      extensions: [markdown()],
    });
    const view = new EditorView({ state, parent });

    const handled = insertSmartNewline(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });

  it('increments numbered list on Enter', () => {
    const parent = document.createElement('div');
    const state = EditorState.create({
      doc: '1. First ordered item',
      selection: { anchor: 21 },
      extensions: [markdown()],
    });
    const view = new EditorView({ state, parent });

    const handled = insertSmartNewline(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('1. First ordered item\n2. ');
  });

  it('continues task list item on Enter', () => {
    const parent = document.createElement('div');
    const state = EditorState.create({
      doc: '- [ ] Finish project',
      selection: { anchor: 20 },
      extensions: [markdown()],
    });
    const view = new EditorView({ state, parent });

    const handled = insertSmartNewline(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- [ ] Finish project\n- [ ] ');
  });

  it('breaks out of empty task list on Enter', () => {
    const parent = document.createElement('div');
    const state = EditorState.create({
      doc: '- [ ] ',
      selection: { anchor: 6 },
      extensions: [markdown()],
    });
    const view = new EditorView({ state, parent });

    const handled = insertSmartNewline(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });

  it('toggles task item checkbox under cursor', () => {
    const parent = document.createElement('div');
    const state = EditorState.create({
      doc: '- [ ] Buy groceries',
      selection: { anchor: 3 },
      extensions: [markdown()],
    });
    const view = new EditorView({ state, parent });

    const handled = toggleTaskUnderCursor(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- [x] Buy groceries');

    // Toggle back
    const handledBack = toggleTaskUnderCursor(view);
    expect(handledBack).toBe(true);
    expect(view.state.doc.toString()).toBe('- [ ] Buy groceries');
  });
});

describe('Editor Core - Frontmatter YAML & Round-Trip Edits', () => {
  it('parses frontmatter and serializes back without corrupting markdown body', () => {
    const originalDoc = `---
title: My First Note
tags: [project, obsidian]
published: true
rating: 5
date: 2026-11-21
---

# Heading 1

This is the note body.
- Item 1
- Item 2
`;

    const match = originalDoc.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    expect(match).toBeTruthy();
    const rawYaml = match![1];

    const parsed = yamlLoad(rawYaml) as any;
    expect(parsed.title).toBe('My First Note');
    expect(parsed.tags).toEqual(['project', 'obsidian']);
    expect(parsed.published).toBe(true);
    expect(parsed.rating).toBe(5);

    // Modify a property and add a new one
    parsed.rating = 10;
    parsed.author = 'Antigravity';

    const newYaml = yamlDump(parsed, { indent: 2, lineWidth: -1 }).trim();
    const body = originalDoc.slice(match![0].length);
    const updatedDoc = `---\n${newYaml}\n---\n` + body;

    // Verify round-trip preserves body exactly
    expect(updatedDoc).toContain('# Heading 1\n\nThis is the note body.\n- Item 1\n- Item 2\n');
    expect(updatedDoc).toContain('rating: 10');
    expect(updatedDoc).toContain('author: Antigravity');
  });
});

describe('Editor Core - Performance with 10,000 Lines', () => {
  it('instantiates and handles a 10,000-line note smoothly', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 10000; i++) {
      if (i % 50 === 0) {
        lines.push(`## Section Heading ${i}`);
      } else if (i % 10 === 0) {
        lines.push(`- [ ] Task item on line ${i}`);
      } else if (i % 5 === 0) {
        lines.push(`> [!note] Callout on line ${i}`);
      } else {
        lines.push(`Line ${i}: Markdown with **bold**, *italic*, and \`inline code\`.`);
      }
    }
    const largeNote = lines.join('\n');

    const start = performance.now();
    const parent = document.createElement('div');
    const state = EditorState.create({
      doc: largeNote,
      extensions: [markdown(), livePreviewPlugin],
    });
    const view = new EditorView({ state, parent });
    const duration = performance.now() - start;

    expect(view.state.doc.lines).toBe(10000);
    expect(duration).toBeLessThan(500); // Must be fast and virtualized (< 500ms)
    view.destroy();
  });
});
