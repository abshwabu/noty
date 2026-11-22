export interface SyncConfig {
  server_url: string;
  token: string;
  device_id: string;
  device_name: string;
  vault_id: string;
  vault_name: string;
  e2ee_passphrase?: string | null;
  auto_sync_minutes: number;
  auto_sync_on_open: boolean;
  excluded_patterns: string[];
  last_synced_at?: number | null;
  last_cursor: number;
}

export interface SyncStatus {
  is_syncing: boolean;
  last_synced_at: number | null;
  configured: boolean;
  vault_name: string;
  unresolved_conflicts_count: number;
}

export interface SyncLog {
  id: number;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: string | null;
}

export interface SyncConflict {
  id: number;
  path: string;
  base_hash: string;
  local_hash: string;
  remote_hash: string;
  local_content: string;
  remote_content: string;
  conflicted_file_path: string;
  created_at: number;
  resolved: boolean;
}

export interface SyncSummary {
  pushed: number;
  pulled: number;
  merged: number;
  conflicts: number;
  deleted_local: number;
  deleted_remote: number;
  timestamp: number;
  error?: string | null;
}

export interface RemoteVault {
  id: string;
  name: string;
  version_retention_days: number;
}
