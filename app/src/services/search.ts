import { invoke } from '@tauri-apps/api/core';
import type {
  SearchOptions,
  SearchResponse,
  GlobalReplaceRequest,
  GlobalReplaceResult,
  ReplacePreviewItem,
} from '../types/search';

export async function vaultSearch(
  query: string,
  options?: SearchOptions
): Promise<SearchResponse> {
  try {
    return await invoke<SearchResponse>('vault_search', {
      query,
      options: options || {},
    });
  } catch (err) {
    console.warn('Failed to execute search via Tauri invoke:', err);
    return {
      results: [],
      total_files: 0,
      total_matches: 0,
      duration_ms: 0,
    };
  }
}

export async function vaultPreviewGlobalReplace(
  request: GlobalReplaceRequest
): Promise<ReplacePreviewItem[]> {
  try {
    return await invoke<ReplacePreviewItem[]>('vault_preview_global_replace', {
      request,
    });
  } catch (err) {
    console.warn('Failed to preview global replace via Tauri invoke:', err);
    return [];
  }
}

export async function vaultExecuteGlobalReplace(
  request: GlobalReplaceRequest
): Promise<GlobalReplaceResult> {
  try {
    return await invoke<GlobalReplaceResult>('vault_execute_global_replace', {
      request,
    });
  } catch (err) {
    console.warn('Failed to execute global replace via Tauri invoke:', err);
    return {
      files_modified: 0,
      occurrences_replaced: 0,
    };
  }
}
