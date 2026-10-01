import { describe, expect, it } from 'vitest';
import { keyLabel, primaryKey } from './platform';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('platform', () => {
  it('uses Cmd on macOS and Ctrl elsewhere', () => {
    expect(primaryKey(key({ key: 'j', metaKey: true }), true)).toBe(true);
    expect(primaryKey(key({ key: 'j', ctrlKey: true }), true)).toBe(false);
    expect(primaryKey(key({ key: 'j', ctrlKey: true }), false)).toBe(true);
    expect(primaryKey(key({ key: 'j', metaKey: true }), false)).toBe(false);
  });

  it('writes shortcuts the macOS way', () => {
    expect(keyLabel('Ctrl+J', true)).toBe('⌘J');
    expect(keyLabel('Ctrl+Shift+F', true)).toBe('⇧⌘F');
    expect(keyLabel('Ctrl+Maj+L', true)).toBe('⇧⌘L');
    expect(keyLabel('Ctrl+Tab', true)).toBe('Ctrl+Tab');
    expect(keyLabel('Ctrl+J', false)).toBe('Ctrl+J');
  });
});
