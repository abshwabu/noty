import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';

export interface ParsedWikilink {
  raw: string;
  targetNote: string;
  alias?: string;
  heading?: string;
  block?: string;
  isEmbed: boolean;
  displayText: string;
  isResolved: boolean;
}

/**
 * Parses an inner wikilink string (without enclosing [[ ]])
 */
export function parseWikilinkInner(inner: string, isEmbed = false, availableFiles: string[] = []): ParsedWikilink {
  const trimmed = inner.trim();
  let mainPart = trimmed;
  let alias: string | undefined;

  // 1. Alias: [[Note|Alias]]
  const pipeIdx = mainPart.indexOf('|');
  if (pipeIdx !== -1) {
    alias = mainPart.slice(pipeIdx + 1).trim();
    mainPart = mainPart.slice(0, pipeIdx).trim();
  }

  // 2. Block: [[Note#^block]] or [[#^block]]
  let block: string | undefined;
  const blockIdx = mainPart.indexOf('^');
  if (blockIdx !== -1) {
    block = mainPart.slice(blockIdx + 1).trim();
    mainPart = mainPart.slice(0, blockIdx).trim();
  }

  // 3. Heading: [[Note#Heading]] or [[#Heading]]
  let heading: string | undefined;
  const headingIdx = mainPart.indexOf('#');
  if (headingIdx !== -1) {
    heading = mainPart.slice(headingIdx + 1).trim();
    mainPart = mainPart.slice(0, headingIdx).trim();
  }

  const targetNote = mainPart;

  // Determine display text
  let displayText = alias;
  if (!displayText) {
    if (heading) {
      displayText = targetNote ? `${targetNote} > ${heading}` : `#${heading}`;
    } else if (block) {
      displayText = targetNote ? `${targetNote} > ^${block}` : `^${block}`;
    } else {
      displayText = targetNote;
    }
  }

  // Resolution check
  const isResolved = checkIsResolved(targetNote, availableFiles);

  return {
    raw: inner,
    targetNote,
    alias,
    heading,
    block,
    isEmbed,
    displayText: displayText || targetNote || 'Untitled',
    isResolved,
  };
}

export function checkIsResolved(target: string, availableFiles: string[]): boolean {
  if (!target) return true; // heading in current note
  const cleanTarget = target.toLowerCase().trim();
  const targetWithMd = cleanTarget.endsWith('.md') ? cleanTarget : `${cleanTarget}.md`;

  return availableFiles.some((f) => {
    const cleanFile = f.toLowerCase();
    const stem = cleanFile.split('/').pop()?.replace(/\.md$/, '') || '';
    return cleanFile === cleanTarget || cleanFile === targetWithMd || stem === cleanTarget;
  });
}

/**
 * Handles clicking a wikilink in editor or reading view.
 * If unresolved, creates the note in the vault and opens it.
 */
export async function handleWikilinkClick(
  targetNote: string,
  isResolved: boolean,
  heading?: string
) {
  const vault = useVaultStore();
  const workspace = useWorkspaceStore();

  if (!targetNote) {
    // Scroll to heading in current note
    if (heading) {
      const headingEl = document.getElementById(`heading-${encodeURIComponent(heading)}`);
      headingEl?.scrollIntoView({ behavior: 'smooth' });
    }
    return;
  }

  // If not resolved, create the note
  if (!isResolved) {
    const parentFolder = '';
    const noteName = targetNote.replace(/\.md$/, '');
    const newPath = await vault.createFile(parentFolder, noteName);
    if (newPath) {
      workspace.openNote(newPath);
    }
    return;
  }

  // Find exact path matching target note
  const allFiles = vault.allFilePaths;
  const targetWithMd = targetNote.endsWith('.md') ? targetNote : `${targetNote}.md`;
  const matched =
    allFiles.find((f) => f.toLowerCase() === targetNote.toLowerCase()) ||
    allFiles.find((f) => f.toLowerCase() === targetWithMd.toLowerCase()) ||
    allFiles.find(
      (f) =>
        f.split('/').pop()?.replace(/\.md$/, '').toLowerCase() ===
        targetNote.toLowerCase()
    );

  const pathToOpen = matched || targetWithMd;
  workspace.openNote(pathToOpen);
}
