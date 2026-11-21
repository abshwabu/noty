import { EditorView } from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';

export interface AttachmentHandlerOptions {
  getAttachmentFolderPath: () => string;
  onSaved?: (relativePath: string) => void;
}

/**
 * Creates CodeMirror DOM event handlers for pasting and dropping media / attachments into the vault.
 */
export function createAttachmentHandler(options: AttachmentHandlerOptions) {
  return EditorView.domEventHandlers({
    paste(event: ClipboardEvent, view: EditorView) {
      const items = event.clipboardData?.items;
      if (!items) return false;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            saveAndInsertAttachment(file, view, options);
            return true;
          }
        }
      }
      return false;
    },

    drop(event: DragEvent, view: EditorView) {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return false;

      event.preventDefault();

      // Find drop coordinates and position cursor
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) {
        view.dispatch({ selection: { anchor: pos } });
      }

      for (let i = 0; i < files.length; i++) {
        saveAndInsertAttachment(files[i], view, options);
      }
      return true;
    },
  });
}

async function saveAndInsertAttachment(
  file: File,
  view: EditorView,
  options: AttachmentHandlerOptions
) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));

    const now = new Date();
    const timestamp =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    let filename = file.name;
    if (!filename || filename === 'image.png' || filename === 'blob') {
      const ext = file.type.split('/')[1] || 'png';
      filename = `Pasted image ${timestamp}.${ext}`;
    }

    const folder = options.getAttachmentFolderPath().trim().replace(/^\/+|\/+$/g, '') || 'attachments';
    const relativePath = `${folder}/${filename}`;

    // Write binary file to vault
    await invoke('vault_write_binary', {
      relativePath,
      dataBytes: bytes,
    });

    if (options.onSaved) {
      options.onSaved(relativePath);
    }

    // Insert markdown embed at current cursor
    const markdownEmbed = file.type.startsWith('image/')
      ? `![[${filename}]]\n`
      : `[${filename}](${relativePath})\n`;

    const state = view.state;
    view.dispatch(state.replaceSelection(markdownEmbed));
  } catch (err) {
    console.error('Failed to save attachment:', err);
  }
}
