// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { parseWikilinkInner, checkIsResolved } from '../links';
import { wikilinkAndTagCompletionSource } from '../autocomplete';
import { setupBrowserMockBackend } from '../../mocks/browserBackend';
import {
  getBacklinks,
  getOutgoingLinks,
  getTags,
  getOutline,
  getGraphData,
  updateLinksOnRename,
} from '../../services/metadata';
import { EditorState } from '@codemirror/state';

describe('Links Parsing and Resolution', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const availableFiles = ['Welcome.md', 'Obsidian Import.md', 'Projects/Noty.md'];

  it('parses standard wikilinks correctly', () => {
    const res = parseWikilinkInner('Welcome', false, availableFiles);
    expect(res.targetNote).toBe('Welcome');
    expect(res.displayText).toBe('Welcome');
    expect(res.isResolved).toBe(true);
    expect(res.isEmbed).toBe(false);
  });

  it('parses wikilinks with alias', () => {
    const res = parseWikilinkInner('Welcome|Start Here', false, availableFiles);
    expect(res.targetNote).toBe('Welcome');
    expect(res.alias).toBe('Start Here');
    expect(res.displayText).toBe('Start Here');
    expect(res.isResolved).toBe(true);
  });

  it('parses wikilinks with heading and block anchors', () => {
    const resHeading = parseWikilinkInner('Welcome#Architecture', false, availableFiles);
    expect(resHeading.targetNote).toBe('Welcome');
    expect(resHeading.heading).toBe('Architecture');
    expect(resHeading.displayText).toBe('Welcome > Architecture');

    const resBlock = parseWikilinkInner('Welcome#^block-1', false, availableFiles);
    expect(resBlock.targetNote).toBe('Welcome');
    expect(resBlock.block).toBe('block-1');
    expect(resBlock.displayText).toBe('Welcome > ^block-1');
  });

  it('identifies unresolved links when target is missing', () => {
    const res = parseWikilinkInner('Nonexistent Note', false, availableFiles);
    expect(res.targetNote).toBe('Nonexistent Note');
    expect(res.isResolved).toBe(false);
  });

  it('checkIsResolved handles stem, case-insensitivity, and extension matches', () => {
    expect(checkIsResolved('welcome', availableFiles)).toBe(true);
    expect(checkIsResolved('Welcome.md', availableFiles)).toBe(true);
    expect(checkIsResolved('Noty', availableFiles)).toBe(true);
    expect(checkIsResolved('Projects/Noty.md', availableFiles)).toBe(true);
    expect(checkIsResolved('Random Note', availableFiles)).toBe(false);
  });
});

describe('Metadata Service and IPC Mock', () => {
  beforeEach(() => {
    setupBrowserMockBackend();
  });

  it('retrieves backlinks with linked and unlinked mentions', async () => {
    const res = await getBacklinks('Welcome.md');
    expect(res.linked_mentions).toBeDefined();
    expect(res.unlinked_mentions).toBeDefined();
    expect(res.linked_mentions.length).toBeGreaterThanOrEqual(1);
  });

  it('retrieves outgoing links and identifies embeds', async () => {
    const res = await getOutgoingLinks('Welcome.md');
    expect(res.length).toBeGreaterThan(0);
    expect(res.some((l) => l.is_embed)).toBe(true);
    expect(res.some((l) => !l.is_resolved)).toBe(true);
  });

  it('retrieves tags list with counts', async () => {
    const tags = await getTags();
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.some((t) => t.tag === 'obsidian' || t.tag === 'tauri')).toBe(true);
  });

  it('retrieves outline headings for note', async () => {
    const headings = await getOutline('Welcome.md');
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0].level).toBeGreaterThanOrEqual(1);
    expect(headings[0].text).toBeDefined();
  });

  it('retrieves graph view nodes and edges', async () => {
    const graph = await getGraphData();
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.edges.length).toBeGreaterThanOrEqual(1);
  });

  it('calls updateLinksOnRename successfully', async () => {
    const count = await updateLinksOnRename('Old.md', 'New.md');
    expect(typeof count).toBe('number');
  });
});

describe('CodeMirror Autocomplete Trigger', () => {
  it('triggers wikilink autocomplete on [[', async () => {
    const state = EditorState.create({
      doc: 'Here is a reference [[Wel',
      selection: { anchor: 25 },
    });

    const mockContext: any = {
      state,
      pos: 25,
      matchBefore: () => null,
    };

    const res = await wikilinkAndTagCompletionSource(mockContext);
    expect(res).not.toBeNull();
    expect(res?.options.length).toBeGreaterThan(0);
  });

  it('triggers tag autocomplete on #', async () => {
    const state = EditorState.create({
      doc: 'Note content with #tau',
      selection: { anchor: 22 },
    });

    const mockContext: any = {
      state,
      pos: 22,
      matchBefore: () => null,
    };

    const res = await wikilinkAndTagCompletionSource(mockContext);
    expect(res).not.toBeNull();
    expect(res?.options.length).toBeGreaterThan(0);
  });
});
