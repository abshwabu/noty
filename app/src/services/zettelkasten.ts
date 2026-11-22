import { invoke } from '@tauri-apps/api/core';
import { usePluginsStore } from '../stores/plugins';
import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';
import { formatDateCustom } from './dailyNotes';
import { applyTemplateVariables } from './templates';

export async function createZettelkastenNote(optionalTitle?: string): Promise<string> {
  const plugins = usePluginsStore();
  const vault = useVaultStore();
  const workspace = useWorkspaceStore();

  const now = new Date();
  const format = plugins.zkPrefixer.format || 'YYYYMMDDHHmm';
  const prefix = formatDateCustom(now, format);

  const cleanTitle = optionalTitle?.trim() || '';
  const noteName = cleanTitle ? `${prefix} ${cleanTitle}` : prefix;
  const fileName = `${noteName}.md`;

  const folder = plugins.zkPrefixer.folder?.trim() || '';
  const fullPath = folder ? `${folder}/${fileName}` : fileName;

  let content = `# ${noteName}\n\n`;

  if (plugins.zkPrefixer.template) {
    try {
      const rawTpl = await invoke<string>('vault_read_file', {
        relativePath: plugins.zkPrefixer.template,
      });
      if (rawTpl) {
        content = applyTemplateVariables(rawTpl, noteName, now);
      }
    } catch {}
  }

  if (folder) {
    await vault.createFolder('', folder);
  }

  await invoke('vault_write_file', {
    relativePath: fullPath,
    content,
  });

  await vault.refreshTree();
  workspace.openNote(fullPath);
  return fullPath;
}
