export interface BacklinkItem {
  source_path: string;
  source_title: string;
  line_number: number;
  context_snippet: string;
  alias?: string | null;
  heading?: string | null;
}

export interface UnlinkedMentionItem {
  source_path: string;
  source_title: string;
  line_number: number;
  match_text: string;
  context_snippet: string;
}

export interface BacklinksResult {
  linked_mentions: BacklinkItem[];
  unlinked_mentions: UnlinkedMentionItem[];
}

export interface OutgoingLinkItem {
  target_note: string;
  display_text: string;
  heading?: string | null;
  block?: string | null;
  is_embed: boolean;
  is_resolved: boolean;
  line_number: number;
}

export interface TagCountItem {
  tag: string;
  count: number;
  files: string[];
}

export interface HeadingItem {
  level: number;
  text: string;
  line_number: number;
}

export interface GraphNode {
  id: string;
  name: string;
  path: string;
  link_count: number;
  tags: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
