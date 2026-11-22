export type BookmarkType = 'file' | 'search' | 'heading' | 'group';

export interface BookmarkItem {
  id: string;
  type: BookmarkType;
  path?: string; // For file and heading
  subpath?: string; // For heading (e.g. #Heading)
  query?: string; // For search
  title: string;
  items?: BookmarkItem[]; // For group
}

export interface BookmarksData {
  items: BookmarkItem[];
}
