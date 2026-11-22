import { invoke } from '@tauri-apps/api/core';
import { usePluginsStore } from '../stores/plugins';
import { useVaultStore } from '../stores/vault';
import { formatDateCustom } from './dailyNotes';

export function applyTemplateVariables(
  content: string,
  title: string,
  date: Date = new Date()
): string {
  const plugins = usePluginsStore();
  const defaultDateFmt = plugins.templates.dateFormat || 'YYYY-MM-DD';
  const defaultTimeFmt = plugins.templates.timeFormat || 'HH:mm';

  let out = content;

  // 1. Replace {{title}}
  out = out.replace(/\{\{\s*title\s*\}\}/gi, title);

  // 2. Replace {{date:FORMAT}} and {{date}}
  out = out.replace(/\{\{\s*date(?::([^}]+))?\s*\}\}/gi, (_, customFmt) => {
    const fmt = customFmt ? customFmt.trim() : defaultDateFmt;
    return formatDateCustom(date, fmt);
  });

  // 3. Replace {{time:FORMAT}} and {{time}}
  out = out.replace(/\{\{\s*time(?::([^}]+))?\s*\}\}/gi, (_, customFmt) => {
    const fmt = customFmt ? customFmt.trim() : defaultTimeFmt;
    return formatDateCustom(date, fmt);
  });

  return out;
}

export function getAvailableTemplates(): string[] {
  const vault = useVaultStore();
  const plugins = usePluginsStore();
  const folder = plugins.templates.folder?.toLowerCase().trim() || 'templates';

  return vault.allFilePaths.filter((path) => {
    if (!path.endsWith('.md')) return false;
    const lower = path.toLowerCase();
    return lower.startsWith(`${folder}/`) || lower.includes('/templates/') || lower.includes('template');
  });
}

export async function readAndResolveTemplate(
  templatePath: string,
  targetNoteTitle: string
): Promise<string> {
  const raw = await invoke<string>('vault_read_file', { relativePath: templatePath });
  return applyTemplateVariables(raw || '', targetNoteTitle, new Date());
}
