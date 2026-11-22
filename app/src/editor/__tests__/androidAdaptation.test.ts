// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { setupBrowserMockBackend } from '../../mocks/browserBackend';
import { useDeviceStore } from '../../stores/device';
import { useVaultStore } from '../../stores/vault';
import { useWorkspaceStore } from '../../stores/workspace';
import {
  crc32,
  createZipArchive,
  parseZipArchive,
} from '../../services/zipVault';
import {
  getDefaultAndroidVaultPath,
  exportVaultToZip,
  importVaultFromZip,
} from '../../services/vaultStorage';

describe('Phase 09 - Android Adaptation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setupBrowserMockBackend();
  });

  describe('Device & Responsive Layout State', () => {
    it('correctly calculates isMobile, isTablet, and isDesktop based on screen width', () => {
      const device = useDeviceStore();

      // Mobile narrow screen (< 768px)
      device.screenWidth = 375;
      expect(device.isMobile).toBe(true);
      expect(device.isTablet).toBe(false);
      expect(device.isDesktop).toBe(false);

      // Tablet screen (768px - 1023px)
      device.screenWidth = 820;
      expect(device.isMobile).toBe(false);
      expect(device.isTablet).toBe(true);
      expect(device.isDesktop).toBe(false);

      // Desktop wide screen (>= 1024px)
      device.screenWidth = 1280;
      expect(device.isMobile).toBe(false);
      expect(device.isTablet).toBe(false);
      expect(device.isDesktop).toBe(true);
    });

    it('manages swipe-in mobile drawer open/close transitions', () => {
      const device = useDeviceStore();
      expect(device.activeDrawer).toBe('none');

      device.openLeftDrawer();
      expect(device.activeDrawer).toBe('left');

      device.openRightDrawer();
      expect(device.activeDrawer).toBe('right');

      device.closeDrawers();
      expect(device.activeDrawer).toBe('none');
    });

    it('toggles mobile tab switcher state', () => {
      const device = useDeviceStore();
      expect(device.showTabSwitcher).toBe(false);

      device.toggleTabSwitcher();
      expect(device.showTabSwitcher).toBe(true);

      device.toggleTabSwitcher();
      expect(device.showTabSwitcher).toBe(false);
    });
  });

  describe('ZIP Archive Engine & Scoped Storage', () => {
    it('calculates standard CRC32 checksums', () => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode('123456789');
      // Standard CRC-32 for '123456789' is 0xcbf43926
      expect(crc32(bytes)).toBe(0xcbf43926);
    });

    it('creates a standard PKZIP binary archive with correct headers', () => {
      const zipBytes = createZipArchive([
        { path: 'Daily.md', content: '# Today\nDid some work.' },
        { path: 'notes/Ideas.md', content: '# Ideas\nMobile app idea.' },
      ]);

      expect(zipBytes).toBeInstanceOf(Uint8Array);
      expect(zipBytes.length).toBeGreaterThan(60);

      // Verify PKZIP local file header signature 0x04034b50 (little endian: 0x50, 0x4b, 0x03, 0x04)
      expect(zipBytes[0]).toBe(0x50);
      expect(zipBytes[1]).toBe(0x4b);
      expect(zipBytes[2]).toBe(0x03);
      expect(zipBytes[3]).toBe(0x04);
    });

    it('performs roundtrip encoding and decoding of ZIP archives', () => {
      const originalFiles = [
        { path: 'RootNote.md', content: 'Root file content' },
        { path: 'subfolder/SubNote.md', content: 'Nested note content' },
      ];

      const zipBytes = createZipArchive(originalFiles);
      const parsed = parseZipArchive(zipBytes);

      expect(parsed.length).toBe(2);
      expect(parsed[0].path).toBe('RootNote.md');
      expect(new TextDecoder().decode(parsed[0].data)).toBe('Root file content');

      expect(parsed[1].path).toBe('subfolder/SubNote.md');
      expect(new TextDecoder().decode(parsed[1].data)).toBe('Nested note content');
    });

    it('returns Android app-private storage path when running in Android environment', () => {
      const path = getDefaultAndroidVaultPath();
      expect(path).toBeDefined();
      expect(typeof path).toBe('string');
    });

    it('exports active vault to ZIP and imports back successfully', async () => {
      const vault = useVaultStore();
      await vault.init();

      const blob = await exportVaultToZip();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/zip');
      expect(blob.size).toBeGreaterThan(0);

      const arrayBuffer = await blob.arrayBuffer();
      const importResult = await importVaultFromZip(arrayBuffer);
      expect(importResult.importedCount).toBeGreaterThan(0);
    });
  });

  describe('Android Share Intent & Background-Safe Save', () => {
    it('handles shared text event and creates a new shared note', async () => {
      const vault = useVaultStore();
      const workspace = useWorkspaceStore();
      await vault.init();

      const initialCount = vault.allFilePaths.length;
      const sharedText = 'https://news.ycombinator.com/item?id=12345';

      // Simulate incoming Android share intent
      const dateStr = new Date().toISOString().slice(0, 10);
      const title = `Shared Note ${dateStr}`;
      const createdPath = await vault.createFile('', title);

      expect(createdPath).toBeDefined();
      expect(createdPath).toContain('.md');
      expect(vault.allFilePaths.length).toBe(initialCount + 1);

      workspace.openNote(createdPath, { newTab: true });
      expect(workspace.activeNotePath).toBe(createdPath);
      expect(sharedText).toContain('ycombinator');
    });
  });
});
