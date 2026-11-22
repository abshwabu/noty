import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../stores/vault';

export async function mergeNotes(
  sourcePath: string,
  targetPath: string,
  position: 'append' | 'prepend' = 'append'
): Promise<boolean> {
  const vault = useVaultStore();
  const sourceContent = await invoke<string>('vault_read_file', { relativePath: sourcePath });
  const targetContent = await invoke<string>('vault_read_file', { relativePath: targetPath });

  const separator = '\n\n---\n\n';
  const combined = position === 'append'
    ? `${targetContent.trim()}${separator}${sourceContent.trim()}\n`
    : `${sourceContent.trim()}${separator}${targetContent.trim()}\n`;

  await invoke('vault_write_file', { relativePath: targetPath, content: combined });
  await vault.deleteItem(sourcePath);
  return true;
}

export async function extractSelectionToNote(
  _activePath: string,
  selectedText: string,
  newNoteTitle: string,
  newFolder: string = ''
): Promise<{ newPath: string; wikilink: string }> {
  const vault = useVaultStore();

  const fileName = `${newNoteTitle.trim()}.md`;
  const newPath = newFolder.trim() ? `${newFolder.trim()}/${fileName}` : fileName;

  const content = `# ${newNoteTitle.trim()}\n\n${selectedText.trim()}\n`;

  if (newFolder.trim()) {
    await vault.createFolder('', newFolder.trim());
  }

  await invoke('vault_write_file', { relativePath: newPath, content });
  await vault.refreshTree();

  const wikilink = `[[${newNoteTitle.trim()}]]`;
  return { newPath, wikilink };
}
