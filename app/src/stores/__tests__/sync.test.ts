// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSyncStore } from '../sync';
import { setupBrowserMockBackend } from '../../mocks/browserBackend';

describe('Sync Client Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setupBrowserMockBackend();
  });

  it('loads sync configuration and sets configured status', async () => {
    const store = useSyncStore();
    await store.loadConfig();

    expect(store.config.server_url).toBe('http://localhost:8080');
    expect(store.config.device_id).toBe('dev_mock_001');
    expect(store.config.vault_name).toBe('Work Notes');
    expect(store.isConfigured).toBe(true);
    expect(store.status.configured).toBe(true);
  });

  it('authenticates user and receives device token', async () => {
    const store = useSyncStore();
    const resp = await store.login('owner', 'secret123', 'My Laptop');

    expect(resp.token).toContain('mock_bearer_token');
    expect(store.config.token).toBe(resp.token);
    expect(store.config.device_name).toBe('My Laptop');
    expect(store.remoteVaults.length).toBeGreaterThan(0);
  });

  it('creates new remote vault and updates active vault_id', async () => {
    const store = useSyncStore();
    const v = await store.createRemoteVault('Engineering Notes');

    expect(v.name).toBe('Engineering Notes');
    expect(store.config.vault_id).toBe(v.id);
    expect(store.config.vault_name).toBe('Engineering Notes');
  });

  it('executes manual sync cycle and updates sync timestamp and logs', async () => {
    const store = useSyncStore();
    await store.loadConfig();

    const summary = await store.syncNow();
    expect(summary.pushed).toBe(1);
    expect(summary.pulled).toBe(0);
    expect(summary.conflicts).toBe(0);
    expect(store.isSyncing).toBe(false);
    expect(store.lastSyncRelativeTime).toBe('Just now');
    expect(store.logs.length).toBeGreaterThan(0);
  });

  it('handles conflict resolution and clears active conflict state', async () => {
    const store = useSyncStore();
    store.conflicts = [
      {
        id: 42,
        path: 'notes/conflict.md',
        base_hash: 'base_1',
        local_hash: 'loc_1',
        remote_hash: 'rem_1',
        local_content: 'Local text',
        remote_content: 'Remote text',
        conflicted_file_path: 'notes/conflict.sync-conflict-dev-1.md',
        created_at: 1700000000,
        resolved: false,
      },
    ];

    await store.resolveConflict(42, 'local');
    expect(store.syncError).toBeNull();
  });

  it('respects auto-sync timer settings (off by default)', () => {
    const store = useSyncStore();
    expect(store.config.auto_sync_minutes).toBe(0);
    expect(store.config.auto_sync_on_open).toBe(false);

    // Setting timer
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    store.config.auto_sync_minutes = 5;
    store.config.token = 'mock_tok';
    store.config.vault_id = 'vlt_1';
    store.setupAutoSyncTimer();

    expect(setIntervalSpy).toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });
});
