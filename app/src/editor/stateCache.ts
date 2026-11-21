import type { EditorState } from '@codemirror/state';

/**
 * In-memory cache for CodeMirror EditorState instances keyed by relative file path.
 * Storing EditorState preserves:
 * 1. Undo/redo history (history extension state)
 * 2. Selection ranges & cursor position
 * 3. Fold state & viewport position
 */
const editorStateMap = new Map<string, EditorState>();

export function getCachedEditorState(path: string): EditorState | undefined {
  return editorStateMap.get(path);
}

export function setCachedEditorState(path: string, state: EditorState): void {
  editorStateMap.set(path, state);
}

export function deleteCachedEditorState(path: string): void {
  editorStateMap.delete(path);
}

export function clearAllCachedEditorStates(): void {
  editorStateMap.clear();
}
