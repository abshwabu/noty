// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { setupBrowserMockBackend } from '../../mocks/browserBackend';
import {
  vaultSearch,
  vaultPreviewGlobalReplace,
  vaultExecuteGlobalReplace,
} from '../../services/search';
import type { GlobalReplaceRequest, SearchOptions } from '../../types/search';

describe('Vault Search and Global Replace', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setupBrowserMockBackend();
  });

  it('performs basic search across mock notes', async () => {
    const res = await vaultSearch('Obsidian');
    expect(res).toBeDefined();
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.total_matches).toBeGreaterThan(0);

    const firstResult = res.results[0];
    expect(firstResult.file_path).toBeDefined();
    expect(firstResult.matches.length).toBeGreaterThan(0);
    expect(firstResult.matches[0].line_text.toLowerCase()).toContain('obsidian');
  });

  it('supports case-sensitive search options', async () => {
    const insensitive = await vaultSearch('markdown', { case_sensitive: false });
    const sensitive = await vaultSearch('markdown', { case_sensitive: true });

    expect(insensitive.results.length).toBeGreaterThan(0);
    expect(sensitive.results.length).toBeGreaterThan(0);

    // Capitalized 'Markdown' when case sensitive should return 0 because mock files only contain 'markdown'
    const capitalStrict = await vaultSearch('Markdown', { case_sensitive: true });
    expect(capitalStrict.results.length).toBe(0);
  });

  it('extracts multi-line before/after context when more_context is true', async () => {
    const options: SearchOptions = {
      more_context: true,
    };
    const res = await vaultSearch('Noty', options);
    expect(res.results.length).toBeGreaterThan(0);

    const matchWithContext = res.results
      .flatMap((r) => r.matches)
      .find((m) => (m.before_context && m.before_context.length > 0) || (m.after_context && m.after_context.length > 0));

    expect(matchWithContext).toBeDefined();
  });

  it('previews global replace correctly across vault files', async () => {
    const req: GlobalReplaceRequest = {
      search_query: 'Noty',
      replacement: 'SuperNoty',
      case_sensitive: false,
      regex: false,
    };

    const previews = await vaultPreviewGlobalReplace(req);
    expect(previews.length).toBeGreaterThan(0);

    for (const item of previews) {
      expect(item.original_line).toContain('Noty');
      expect(item.replaced_line).toContain('SuperNoty');
      expect(item.line_number).toBeGreaterThan(0);
    }
  });

  it('executes global replace across notes', async () => {
    const req: GlobalReplaceRequest = {
      search_query: 'offline-first',
      replacement: 'local-first',
      case_sensitive: false,
      regex: false,
    };

    const result = await vaultExecuteGlobalReplace(req);
    expect(result.files_modified).toBeGreaterThan(0);
    expect(result.occurrences_replaced).toBeGreaterThan(0);

    // Verify replacement by searching for the new text
    const searchAfter = await vaultSearch('local-first');
    expect(searchAfter.total_matches).toBeGreaterThan(0);
  });
});