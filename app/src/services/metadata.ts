import { invoke } from '@tauri-apps/api/core';
import type {
  BacklinksResult,
  OutgoingLinkItem,
  TagCountItem,
  HeadingItem,
  GraphData,
} from '../types/metadata';

export async function getBacklinks(relativePath: string): Promise<BacklinksResult> {
  try {
    return await invoke<BacklinksResult>('vault_get_backlinks', { relativePath });
  } catch (err) {
    console.warn('Failed to get backlinks via Tauri invoke:', err);
    return { linked_mentions: [], unlinked_mentions: [] };
  }
}

export async function getOutgoingLinks(relativePath: string): Promise<OutgoingLinkItem[]> {
  try {
    return await invoke<OutgoingLinkItem[]>('vault_get_outgoing_links', { relativePath });
  } catch (err) {
    console.warn('Failed to get outgoing links via Tauri invoke:', err);
    return [];
  }
}

export async function getTags(): Promise<TagCountItem[]> {
  try {
    return await invoke<TagCountItem[]>('vault_get_tags');
  } catch (err) {
    console.warn('Failed to get tags via Tauri invoke:', err);
    return [];
  }
}

export async function getOutline(relativePath: string): Promise<HeadingItem[]> {
  try {
    return await invoke<HeadingItem[]>('vault_get_outline', { relativePath });
  } catch (err) {
    console.warn('Failed to get outline via Tauri invoke:', err);
    return [];
  }
}

export async function getGraphData(): Promise<GraphData> {
  try {
    return await invoke<GraphData>('vault_get_graph_data');
  } catch (err) {
    console.warn('Failed to get graph data via Tauri invoke:', err);
    return { nodes: [], edges: [] };
  }
}

export async function updateLinksOnRename(oldPath: string, newPath: string): Promise<number> {
  try {
    return await invoke<number>('vault_update_links_on_rename', { oldPath, newPath });
  } catch (err) {
    console.warn('Failed to update links on rename via Tauri invoke:', err);
    return 0;
  }
}
