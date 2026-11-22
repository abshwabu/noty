import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../stores/vault';
import { createZipArchive, parseZipArchive, type ZipEntryInput } from './zipVault';

/**
 * Returns the default app-private storage path for Android or fallback
 */
export function getDefaultAndroidVaultPath(): string {
  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
    return '/data/user/0/com.noty.app/files/vault';
  }
  return 'default-vault';
}

/**
 * Exports the entire active vault as a standard ZIP file
 */
export async function exportVaultToZip(): Promise<Blob> {
  const vault = useVaultStore();
  const fileEntries: ZipEntryInput[] = [];

  // Gather all vault files
  const paths = vault.allFilePaths;
  for (const relPath of paths) {
    try {
      const content = await invoke<string>('vault_read_file', { relativePath: relPath });
      if (content !== undefined && content !== null) {
        fileEntries.push({
          path: relPath,
          content,
        });
      }
    } catch (err) {
      console.warn(`Could not read file for zip export: ${relPath}`, err);
    }
  }

  // Also include .noty configuration files if available
  const configs = ['workspace', 'hotkeys', 'appearance', 'plugins', 'bookmarks'];
  for (const cfg of configs) {
    try {
      const cfgContent = await invoke<string | null>('vault_read_config', { configName: cfg });
      if (cfgContent) {
        fileEntries.push({
          path: `.noty/${cfg}.json`,
          content: cfgContent,
        });
      }
    } catch {}
  }

  const zipBytes = createZipArchive(fileEntries);
  return new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' });
}

/**
 * Imports a ZIP file into the current vault, recreating all files and folders
 */
export async function importVaultFromZip(
  zipData: Uint8Array | ArrayBuffer
): Promise<{ importedCount: number }> {
  const vault = useVaultStore();
  const bytes = zipData instanceof Uint8Array ? zipData : new Uint8Array(zipData);
  const entries = parseZipArchive(bytes);
  let count = 0;
  const decoder = new TextDecoder('utf-8');

  for (const entry of entries) {
    if (entry.isDir) {
      const folderPath = entry.path.replace(/\/$/, '');
      if (folderPath) {
        await vault.createFolder('', folderPath);
      }
    } else {
      const textContent = decoder.decode(entry.data);
      // Ensure parent directory exists
      if (entry.path.includes('/')) {
        const parentDir = entry.path.slice(0, entry.path.lastIndexOf('/'));
        await vault.createFolder('', parentDir);
      }
      await invoke('vault_write_file', {
        relativePath: entry.path,
        content: textContent,
      });
      count++;
    }
  }

  await vault.refreshTree();
  return { importedCount: count };
}

/**
 * Triggers a browser download of a generated blob
 */
export function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
