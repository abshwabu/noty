import { invoke } from '@tauri-apps/api/core';
import { usePluginsStore } from '../stores/plugins';
import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';
import { applyTemplateVariables } from './templates';

export function formatDateCustom(date: Date, fmt: string): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const YYYY = date.getFullYear().toString();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  // ISO Week calculation
  const tempDate = new Date(date.getTime());
  tempDate.setHours(0, 0, 0, 0);
  tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7));
  const week1 = new Date(tempDate.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  const WW = pad(weekNum);

  return fmt
    .replace(/YYYY/g, YYYY)
    .replace(/MM/g, MM)
    .replace(/DD/g, DD)
    .replace(/\[W\]WW/g, `W${WW}`)
    .replace(/WW/g, WW)
    .replace(/HH/g, HH)
    .replace(/mm/g, mm)
    .replace(/ss/g, ss);
}

export function getDailyNotePath(date: Date): string {
  const plugins = usePluginsStore();
  const fmt = plugins.dailyNotes.format || 'YYYY-MM-DD';
  const fileName = `${formatDateCustom(date, fmt)}.md`;
  const folder = plugins.dailyNotes.folder?.trim();
  return folder ? `${folder}/${fileName}` : fileName;
}

export async function openOrCreateDailyNote(date: Date = new Date()): Promise<string> {
  const vault = useVaultStore();
  const workspace = useWorkspaceStore();
  const plugins = usePluginsStore();

  const relPath = getDailyNotePath(date);
  const baseTitle = relPath.split('/').pop()?.replace(/\.md$/, '') || 'Daily Note';

  // Check if file already exists in vault
  const exists = vault.allFilePaths.some((p) => p.toLowerCase() === relPath.toLowerCase());

  if (!exists) {
    let initialContent = `# ${baseTitle}\n\n`;

    // If template is configured, read template
    if (plugins.dailyNotes.template) {
      try {
        const tplPath = plugins.dailyNotes.template.endsWith('.md')
          ? plugins.dailyNotes.template
          : `${plugins.dailyNotes.template}.md`;
        const rawTpl = await invoke<string>('vault_read_file', { relativePath: tplPath });
        if (rawTpl) {
          initialContent = applyTemplateVariables(rawTpl, baseTitle, date);
        }
      } catch (err) {
        console.warn('Could not read daily note template, using default header:', err);
      }
    }

    const dir = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
    if (dir) {
      await vault.createFolder('', dir);
    }

    await invoke('vault_write_file', {
      relativePath: relPath,
      content: initialContent,
    });
    await vault.refreshTree();
  }

  workspace.openNote(relPath);
  return relPath;
}

export async function navigateDailyNote(offsetDays: number) {
  const workspace = useWorkspaceStore();
  const currentPath = workspace.activeNotePath || '';
  const currentFileName = currentPath.split('/').pop()?.replace(/\.md$/, '') || '';

  // Attempt to parse YYYY-MM-DD from active note
  let baseDate = new Date();
  const match = currentFileName.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    baseDate = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
  }

  const targetDate = new Date(baseDate.getTime() + offsetDays * 86400000);
  await openOrCreateDailyNote(targetDate);
}
