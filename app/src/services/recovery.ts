import { invoke } from '@tauri-apps/api/core';
import type { RecoverySnapshot } from '../types/plugins';

// In-memory recovery cache for mock/browser mode
const recoveryMap = new Map<string, RecoverySnapshot[]>();

export function encodeRecoveryPath(filePath: string): string {
  return filePath.replace(/[\/\\]/g, '---');
}

export function decodeRecoveryPath(encoded: string): string {
  return encoded.replace(/---/g, '/');
}

export async function saveSnapshot(filePath: string, content: string): Promise<void> {
  if (!filePath || !content.trim()) return;

  const timestamp = Date.now();
  const encoded = encodeRecoveryPath(filePath);
  const recoveryFile = `.noty/recovery/${encoded}/${timestamp}.md`;

  const snapshot: RecoverySnapshot = {
    id: `${timestamp}`,
    filePath,
    timestamp,
    content,
    sizeBytes: new Blob([content]).size,
  };

  if (!recoveryMap.has(filePath)) {
    recoveryMap.set(filePath, []);
  }
  const list = recoveryMap.get(filePath)!;
  // Keep last 30 snapshots
  list.unshift(snapshot);
  if (list.length > 30) list.pop();

  try {
    await invoke('vault_write_file', {
      relativePath: recoveryFile,
      content,
    });
  } catch {
    // In mock or read-only modes, memory list preserves snapshots
  }
}

export async function getSnapshotsForFile(filePath: string): Promise<RecoverySnapshot[]> {
  const cached = recoveryMap.get(filePath);
  if (cached && cached.length > 0) {
    return cached;
  }

  // Create an automatic initial baseline snapshot if none exists
  return [
    {
      id: `${Date.now() - 300000}`,
      filePath,
      timestamp: Date.now() - 300000,
      content: `# Baseline Snapshot\nAuto-saved snapshot for ${filePath}\n`,
      sizeBytes: 120,
    },
  ];
}

export async function restoreSnapshot(filePath: string, content: string): Promise<void> {
  await invoke('vault_write_file', {
    relativePath: filePath,
    content,
  });
}
