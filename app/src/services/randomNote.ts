import { useVaultStore } from '../stores/vault';
import { useWorkspaceStore } from '../stores/workspace';

export function openRandomNote(): string | null {
  const vault = useVaultStore();
  const workspace = useWorkspaceStore();

  const mdFiles = vault.allFilePaths.filter(
    (p) => p.endsWith('.md') && !p.startsWith('.') && !p.includes('/.trash/')
  );

  if (mdFiles.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * mdFiles.length);
  const selectedPath = mdFiles[randomIndex];

  workspace.openNote(selectedPath);
  return selectedPath;
}
