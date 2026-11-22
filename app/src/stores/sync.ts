import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type {
  SyncConfig,
  SyncStatus,
  SyncLog,
  SyncConflict,
  SyncSummary,
  RemoteVault,
} from '../types/sync';

export const useSyncStore = defineStore('sync', () => {
  const config = ref<SyncConfig>({
    server_url: 'http://localhost:8080',
    token: '',
    device_id: '',
    device_name: 'Desktop Device',
    vault_id: '',
    vault_name: '',
    e2ee_passphrase: null,
    auto_sync_minutes: 0,
    auto_sync_on_open: false,
    excluded_patterns: [],
    last_synced_at: null,
    last_cursor: 0,
  });

  const status = ref<SyncStatus>({
    is_syncing: false,
    last_synced_at: null,
    configured: false,
    vault_name: '',
    unresolved_conflicts_count: 0,
  });

  const isSyncing = ref(false);
  const syncError = ref<string | null>(null);
  const logs = ref<SyncLog[]>([]);
  const conflicts = ref<SyncConflict[]>([]);
  const remoteVaults = ref<RemoteVault[]>([]);
  const autoSyncIntervalId = ref<number | null>(null);

  const isConfigured = computed(() => {
    return Boolean(config.value.token && config.value.vault_id);
  });

  const lastSyncRelativeTime = computed(() => {
    if (!status.value.last_synced_at) return 'Never synced';
    const seconds = Math.floor((Date.now() - status.value.last_synced_at * 1000) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(status.value.last_synced_at * 1000).toLocaleDateString();
  });

  async function loadConfig() {
    try {
      const cfg = await invoke<SyncConfig>('sync_get_config');
      config.value = cfg;
      await refreshStatus();
      await fetchLogs();
      await fetchConflicts();
      setupAutoSyncTimer();
    } catch (e: any) {
      console.error('Failed to load sync config:', e);
    }
  }

  async function saveConfig() {
    try {
      await invoke('sync_save_config', { config: config.value });
      await refreshStatus();
      setupAutoSyncTimer();
    } catch (e: any) {
      syncError.value = String(e);
      throw e;
    }
  }

  async function login(username: string, password: string, deviceName: string) {
    try {
      syncError.value = null;
      const resp = await invoke<{
        token: string;
        device: { id: string; name: string };
        user: { id: string; username: string };
      }>('sync_login', {
        serverUrl: config.value.server_url,
        username,
        password,
        deviceName: deviceName || config.value.device_name,
      });

      config.value.token = resp.token;
      config.value.device_id = resp.device.id;
      config.value.device_name = resp.device.name;

      await saveConfig();
      await fetchRemoteVaults();
      return resp;
    } catch (e: any) {
      syncError.value = String(e);
      throw e;
    }
  }

  async function fetchRemoteVaults() {
    if (!config.value.token) return;
    try {
      const list = await invoke<RemoteVault[]>('sync_list_vaults', {
        serverUrl: config.value.server_url,
        token: config.value.token,
      });
      remoteVaults.value = list;
    } catch (e: any) {
      console.error('Failed to list remote vaults:', e);
    }
  }

  async function createRemoteVault(name: string) {
    try {
      const v = await invoke<RemoteVault>('sync_create_vault', {
        serverUrl: config.value.server_url,
        token: config.value.token,
        name,
      });
      config.value.vault_id = v.id;
      config.value.vault_name = v.name;
      await saveConfig();
      await fetchRemoteVaults();
      return v;
    } catch (e: any) {
      syncError.value = String(e);
      throw e;
    }
  }

  async function syncNow(): Promise<SyncSummary> {
    if (isSyncing.value) {
      throw new Error('Sync already in progress');
    }
    isSyncing.value = true;
    syncError.value = null;

    try {
      const summary = await invoke<SyncSummary>('sync_now');
      status.value.last_synced_at = summary.timestamp;
      await refreshStatus();
      await fetchLogs();
      await fetchConflicts();
      return summary;
    } catch (e: any) {
      syncError.value = String(e);
      await fetchLogs();
      throw e;
    } finally {
      isSyncing.value = false;
    }
  }

  async function uploadVault(vaultId: string) {
    isSyncing.value = true;
    try {
      const summary = await invoke<SyncSummary>('sync_upload_vault', { vaultId });
      await refreshStatus();
      await fetchLogs();
      return summary;
    } finally {
      isSyncing.value = false;
    }
  }

  async function downloadVault(vaultId: string) {
    isSyncing.value = true;
    try {
      const summary = await invoke<SyncSummary>('sync_download_vault', { vaultId });
      await refreshStatus();
      await fetchLogs();
      return summary;
    } finally {
      isSyncing.value = false;
    }
  }

  async function refreshStatus() {
    try {
      const st = await invoke<SyncStatus>('sync_get_status');
      status.value = st;
    } catch (e) {
      console.error('Failed to get sync status:', e);
    }
  }

  async function fetchLogs() {
    try {
      const items = await invoke<SyncLog[]>('sync_get_logs', { limit: 100 });
      logs.value = items;
    } catch (e) {
      console.error('Failed to get sync logs:', e);
    }
  }

  async function fetchConflicts() {
    try {
      const items = await invoke<SyncConflict[]>('sync_get_conflicts');
      conflicts.value = items;
      status.value.unresolved_conflicts_count = items.length;
    } catch (e) {
      console.error('Failed to get sync conflicts:', e);
    }
  }

  async function resolveConflict(conflictId: number, resolution: 'local' | 'remote' | 'keep_both') {
    try {
      await invoke('sync_resolve_conflict', { conflictId, resolution });
      await fetchConflicts();
      await fetchLogs();
    } catch (e: any) {
      syncError.value = String(e);
      throw e;
    }
  }

  function setupAutoSyncTimer() {
    if (autoSyncIntervalId.value) {
      window.clearInterval(autoSyncIntervalId.value);
      autoSyncIntervalId.value = null;
    }

    const minutes = config.value.auto_sync_minutes;
    if (minutes > 0 && isConfigured.value) {
      autoSyncIntervalId.value = window.setInterval(() => {
        if (!isSyncing.value) {
          syncNow().catch((e) => console.warn('Auto-sync error:', e));
        }
      }, minutes * 60 * 1000);
    }
  }

  // Auto-sync on open if enabled
  function triggerOnOpenSync() {
    if (config.value.auto_sync_on_open && isConfigured.value && !isSyncing.value) {
      syncNow().catch((e) => console.warn('On-open sync error:', e));
    }
  }

  return {
    config,
    status,
    isSyncing,
    syncError,
    logs,
    conflicts,
    remoteVaults,
    isConfigured,
    lastSyncRelativeTime,
    loadConfig,
    saveConfig,
    login,
    fetchRemoteVaults,
    createRemoteVault,
    syncNow,
    uploadVault,
    downloadVault,
    refreshStatus,
    fetchLogs,
    fetchConflicts,
    resolveConflict,
    setupAutoSyncTimer,
    triggerOnOpenSync,
  };
});
