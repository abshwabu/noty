export interface SearchMatchItem {
  line_number: number;
  line_text: string;
  match_start: number;
  match_end: number;
  before_context: string[];
  after_context: string[];
}

export interface FileSearchResult {
  file_path: string;
  file_title: string;
  modified_at: number;
  matches: SearchMatchItem[];
  total_matches: number;
  expanded?: boolean;
}

export interface SearchResponse {
  results: FileSearchResult[];
  total_files: number;
  total_matches: number;
  duration_ms: number;
}

export interface SearchOptions {
  case_sensitive?: boolean;
  regex?: boolean;
  sort_by?: 'matches-desc' | 'mtime-desc' | 'mtime-asc' | 'name-asc' | 'name-desc';
  more_context?: boolean;
}

export interface ReplacePreviewItem {
  file_path: string;
  line_number: number;
  original_line: string;
  replaced_line: string;
  selected?: boolean;
}

export interface GlobalReplaceRequest {
  search_query: string;
  replacement: string;
  case_sensitive: boolean;
  regex: boolean;
  target_paths?: string[];
}

export interface GlobalReplaceResult {
  files_modified: number;
  occurrences_replaced: number;
}
