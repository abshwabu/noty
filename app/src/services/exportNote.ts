import { invoke } from '@tauri-apps/api/core';
import { useVaultStore } from '../stores/vault';

export function markdownToSimpleHtml(md: string, title: string): string {
  let body = md
    // Escape basic html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headings
    .replace(/^# (.*$)/gim, '<h1 style="font-size: 2rem; border-bottom: 1px solid #333; padding-bottom: 0.5rem; margin-top: 1.5rem;">$1</h1>')
    .replace(/^## (.*$)/gim, '<h2 style="font-size: 1.5rem; margin-top: 1.25rem;">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 style="font-size: 1.25rem; margin-top: 1rem;">$1</h3>')
    // Bold & Italic
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/~~(.*?)~~/gim, '<del>$1</del>')
    // Inline code & code blocks
    .replace(/`([^`]+)`/gim, '<code style="background: #222; padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>')
    // Task lists
    .replace(/^- \[x\] (.*$)/gim, '<li style="list-style: none;"><input type="checkbox" checked disabled /> $1</li>')
    .replace(/^- \[ \] (.*$)/gim, '<li style="list-style: none;"><input type="checkbox" disabled /> $1</li>')
    // Bullet lists
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    // Blockquote
    .replace(/^> (.*$)/gim, '<blockquote style="border-left: 4px solid #8b5cf6; padding-left: 1rem; color: #888; font-style: italic;">$1</blockquote>')
    // Line breaks
    .replace(/\n\n/gim, '</p><p style="margin-top: 0.75rem; line-height: 1.6;">')
    .replace(/\n/gim, '<br />');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #1e1e1e;
      color: #dcddde;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      line-height: 1.6;
    }
    a { color: #8b5cf6; text-decoration: none; }
    hr { border: 0; border-top: 1px solid #333; margin: 2rem 0; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { border: 1px solid #333; padding: 8px 12px; text-align: left; }
    th { background-color: #2a2a2a; }
    @media print {
      body { background-color: #fff; color: #000; }
      a { color: #000; }
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

export async function exportNoteToHtml(notePath: string, content: string): Promise<string> {
  const vault = useVaultStore();
  const title = notePath.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
  const htmlContent = markdownToSimpleHtml(content, title);
  const outPath = notePath.replace(/\.md$/, '.html');

  await invoke('vault_write_file', {
    relativePath: outPath,
    content: htmlContent,
  });

  await vault.refreshTree();
  return outPath;
}

export function exportNoteToPdf(noteTitle: string): void {
  // Use browser window.print() with styled media print
  const originalTitle = document.title;
  document.title = noteTitle;
  window.print();
  document.title = originalTitle;
}
