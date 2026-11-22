// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { setupBrowserMockBackend } from '../../mocks/browserBackend';
import { formatDateCustom, getDailyNotePath } from '../../services/dailyNotes';
import { applyTemplateVariables } from '../../services/templates';
import {
  convertMarkdownLinksToWikilinks,
  convertWikilinksToMarkdownLinks,
  convertHtmlFormattingToMarkdown,
} from '../../services/converter';
import { usePluginsStore } from '../../stores/plugins';
import { useBookmarksStore } from '../../stores/bookmarks';
import type { CanvasData } from '../../types/canvas';

describe('Phase 08 - Core Plugins', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setupBrowserMockBackend();
  });

  describe('Daily Notes & Date Formatting', () => {
    it('formats dates correctly according to format tokens', () => {
      // 2026-04-15 09:30:45
      const date = new Date(2026, 3, 15, 9, 30, 45);
      expect(formatDateCustom(date, 'YYYY-MM-DD')).toBe('2026-04-15');
      expect(formatDateCustom(date, 'YYYY/MM/DD')).toBe('2026/04/15');
      expect(formatDateCustom(date, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-04-15 09:30:45');
      expect(formatDateCustom(date, 'YYYY-[W]WW')).toMatch(/2026-W\d{2}/);
    });

    it('generates the daily note path based on configured folder and pattern', () => {
      const plugins = usePluginsStore();
      const testDate = new Date(2026, 10, 22);

      // Default root path
      plugins.dailyNotes.folder = '';
      plugins.dailyNotes.format = 'YYYY-MM-DD';
      expect(getDailyNotePath(testDate)).toBe('2026-11-22.md');

      // Custom journal folder
      plugins.dailyNotes.folder = 'Daily Notes';
      plugins.dailyNotes.format = 'YYYY/MM/YYYY-MM-DD';
      expect(getDailyNotePath(testDate)).toBe('Daily Notes/2026/11/2026-11-22.md');
    });
  });

  describe('Templates Variable Substitution', () => {
    it('replaces {{title}}, {{date}}, and {{time}} accurately', () => {
      const plugins = usePluginsStore();
      plugins.templates.dateFormat = 'YYYY-MM-DD';
      plugins.templates.timeFormat = 'HH:mm';

      const date = new Date(2026, 0, 1, 14, 5);
      const template = '# {{title}}\nDate: {{date}}\nTime: {{time}}\nCustom: {{date:YYYY/MM}}';

      const result = applyTemplateVariables(template, 'My Special Note', date);
      expect(result).toContain('# My Special Note');
      expect(result).toContain('Date: 2026-01-01');
      expect(result).toContain('Time: 14:05');
      expect(result).toContain('Custom: 2026/01');
    });
  });

  describe('Format Converter', () => {
    it('converts markdown links to wikilinks without corrupting web URLs', () => {
      const input = 'Check [Architecture](Architecture.md) and [External](https://obsidian.md).';
      const output = convertMarkdownLinksToWikilinks(input);
      expect(output).toBe('Check [[Architecture]] and [External](https://obsidian.md).');

      const withAlias = 'See [my doc](notes/Guide.md)';
      const outputAlias = convertMarkdownLinksToWikilinks(withAlias);
      expect(outputAlias).toBe('See [[notes/Guide|my doc]]');
    });

    it('converts wikilinks to markdown links', () => {
      const input = 'Read [[Roadmap]] and [[Meeting|standup meeting]].';
      const output = convertWikilinksToMarkdownLinks(input);
      expect(output).toBe('Read [Roadmap](Roadmap.md) and [standup meeting](Meeting.md).');
    });

    it('converts HTML tags to Markdown syntax', () => {
      const input = '<b>bold</b> and <i>italic</i> and <code>code</code> and <s>del</s>';
      const output = convertHtmlFormattingToMarkdown(input);
      expect(output).toBe('**bold** and *italic* and `code` and ~~del~~');
    });
  });

  describe('Bookmarks System', () => {
    it('adds and toggles file bookmarks', () => {
      const bookmarks = useBookmarksStore();
      expect(bookmarks.isBookmarked('Notes/Daily.md')).toBe(false);

      bookmarks.toggleFileBookmark('Notes/Daily.md');
      expect(bookmarks.isBookmarked('Notes/Daily.md')).toBe(true);

      bookmarks.toggleFileBookmark('Notes/Daily.md');
      expect(bookmarks.isBookmarked('Notes/Daily.md')).toBe(false);
    });

    it('creates search and heading bookmarks and groups', () => {
      const bookmarks = useBookmarksStore();
      bookmarks.items = []; // reset for isolated test
      bookmarks.addSearchBookmark('tag:#project', 'Project Notes');
      bookmarks.addHeadingBookmark('Docs/Guide.md', 'Installation');
      bookmarks.addGroup('Favorites');

      expect(bookmarks.items.length).toBe(3);
      expect(bookmarks.items[0].type).toBe('search');
      expect(bookmarks.items[0].query).toBe('tag:#project');
      expect(bookmarks.items[1].type).toBe('heading');
      expect(bookmarks.items[1].subpath).toBe('#Installation');
      expect(bookmarks.items[2].type).toBe('group');
    });
  });

  describe('Canvas JSON Specification Compatibility', () => {
    it('serializes and parses valid Obsidian JSON Canvas v1.0 data', () => {
      const canvas: CanvasData = {
        nodes: [
          {
            id: 'n1',
            type: 'text',
            text: '# Welcome to Canvas',
            x: 100,
            y: 150,
            width: 250,
            height: 120,
            color: '1', // Red
          },
          {
            id: 'n2',
            type: 'file',
            file: 'Architecture.md',
            x: 450,
            y: 150,
            width: 300,
            height: 200,
            color: '4', // Green
          },
        ],
        edges: [
          {
            id: 'e1-2',
            fromNode: 'n1',
            fromSide: 'right',
            toNode: 'n2',
            toSide: 'left',
            toEnd: 'arrow',
            label: 'references',
          },
        ],
      };

      const rawJson = JSON.stringify(canvas, null, 2);
      const parsed: CanvasData = JSON.parse(rawJson);

      expect(parsed.nodes).toHaveLength(2);
      expect(parsed.edges).toHaveLength(1);
      expect(parsed.nodes[0].type).toBe('text');
      expect(parsed.nodes[1].type).toBe('file');
      expect(parsed.edges[0].fromNode).toBe('n1');
      expect(parsed.edges[0].toNode).toBe('n2');
      expect(parsed.edges[0].toEnd).toBe('arrow');
      expect(parsed.edges[0].label).toBe('references');
    });
  });

  describe('Core Plugins Store State', () => {
    it('manages core plugins enabled states', () => {
      const plugins = usePluginsStore();
      expect(plugins.isEnabled('daily-notes')).toBe(true);

      plugins.togglePlugin('daily-notes');
      expect(plugins.isEnabled('daily-notes')).toBe(false);

      plugins.setPluginEnabled('daily-notes', true);
      expect(plugins.isEnabled('daily-notes')).toBe(true);
    });
  });
});
