// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useCommandStore,
  normalizeHotkey,
  eventToHotkeyString,
} from '../commands';

describe('Command Registry & Hotkey Normalizer', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('normalizes hotkey strings with consistent modifier ordering', () => {
    expect(normalizeHotkey('ctrl+p')).toBe('Ctrl+P');
    expect(normalizeHotkey('shift+ctrl+n')).toBe('Ctrl+Shift+N');
    expect(normalizeHotkey('alt+ctrl+shift+\\')).toBe('Ctrl+Alt+Shift+\\');
    expect(normalizeHotkey('alt+arrowleft')).toBe('Alt+ArrowLeft');
    expect(normalizeHotkey('ctrl+enter')).toBe('Ctrl+Enter');
  });

  it('converts KeyboardEvent into normalized hotkey string', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'p',
      ctrlKey: true,
    });
    expect(eventToHotkeyString(event)).toBe('Ctrl+P');

    const eventWithShift = new KeyboardEvent('keydown', {
      key: 'n',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(eventToHotkeyString(eventWithShift)).toBe('Ctrl+Shift+N');
  });

  it('registers commands and executes callback with recents tracking', async () => {
    const store = useCommandStore();
    let executed = false;

    store.registerCommand({
      id: 'test:action',
      name: 'Test Action',
      section: 'General',
      defaultHotkeys: 'Ctrl+T',
      callback: () => {
        executed = true;
      },
    });

    expect(store.commands['test:action']).toBeDefined();
    expect(store.commands['test:action'].hotkeys).toBe('Ctrl+T');

    await store.executeCommand('test:action');
    expect(executed).toBe(true);
    expect(store.recentCommandIds[0]).toBe('test:action');
  });

  it('remaps, removes, and resets hotkeys', () => {
    const store = useCommandStore();
    store.registerCommand({
      id: 'test:remap',
      name: 'Test Remap',
      section: 'General',
      defaultHotkeys: 'Ctrl+R',
      callback: () => {},
    });

    // Remap
    store.setHotkey('test:remap', 'Ctrl+Shift+R');
    expect(store.commands['test:remap'].hotkeys).toBe('Ctrl+Shift+R');
    expect(store.hotkeysMap.get('Ctrl+Shift+R')).toBe('test:remap');

    // Remove
    store.removeHotkey('test:remap');
    expect(store.commands['test:remap'].hotkeys).toBe('');

    // Reset
    store.resetHotkey('test:remap');
    expect(store.commands['test:remap'].hotkeys).toBe('Ctrl+R');
  });

  it('detects hotkey conflicts when same shortcut is assigned to multiple commands', () => {
    const store = useCommandStore();
    store.registerCommand({
      id: 'test:cmd1',
      name: 'Command One',
      section: 'General',
      defaultHotkeys: 'Ctrl+K',
      callback: () => {},
    });

    store.registerCommand({
      id: 'test:cmd2',
      name: 'Command Two',
      section: 'Editor',
      defaultHotkeys: 'Ctrl+K',
      callback: () => {},
    });

    expect(store.conflicts.length).toBe(1);
    expect(store.conflicts[0].hotkey).toBe('Ctrl+K');
    expect(store.conflicts[0].commandId).toBe('test:cmd2');
    expect(store.conflicts[0].conflictingCommandId).toBe('test:cmd1');
  });

  it('initializes all Obsidian core commands properly', () => {
    const store = useCommandStore();
    store.initCoreCommands();

    const ids = Object.keys(store.commands);
    expect(ids).toContain('app:open-command-palette');
    expect(ids).toContain('app:open-quick-switcher');
    expect(ids).toContain('app:new-note');
    expect(ids).toContain('app:save-file');
    expect(ids).toContain('app:toggle-preview');
    expect(ids).toContain('app:open-settings');
    expect(ids).toContain('editor:bold');
    expect(ids).toContain('editor:italic');
    expect(ids).toContain('editor:insert-link');
    expect(ids).toContain('editor:toggle-task');
  });
});
