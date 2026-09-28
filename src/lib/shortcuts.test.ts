import { beforeEach, describe, expect, it } from 'vitest';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
import { handleShortcut, isAppShortcut } from './shortcuts';
import { app } from './state.svelte';

const key = (k: string, mods: Partial<KeyboardEventInit> = {}) => new KeyboardEvent('keydown', { key: k, ctrlKey: true, ...mods });

describe('handleShortcut', () => {
  beforeEach(() =>
    resetApp({ projects: [project(), project({ id: 'p2', name: 'studio' })], agents: [agent(), agent({ id: 'a2', createdAt: 2 })] }),
  );

  it('switches project with Ctrl+digit', () => {
    fakeBackend();
    expect(handleShortcut(key('2'))).toBe(true);
    expect(app.project?.id).toBe('p2');
    expect(handleShortcut(key('9'))).toBe(false);
  });

  it('creates an agent with Ctrl+N', () => {
    const backend = fakeBackend({ create_agent: () => agent({ id: 'a3', createdAt: 3 }) });
    expect(handleShortcut(key('n'))).toBe(true);
    expect(backend.called('create_agent')).toEqual([{ cmd: 'create_agent', args: { projectId: 'p1', model: null } }]);
  });

  it('cycles agents with Ctrl+Tab and Ctrl+Shift+Tab', () => {
    fakeBackend();
    handleShortcut(key('Tab'));
    expect(app.agent?.id).toBe('a2');
    handleShortcut(key('Tab', { shiftKey: true }));
    expect(app.agent?.id).toBe('a1');
  });

  it('opens the settings with Ctrl+,', () => {
    fakeBackend();
    handleShortcut(key(','));
    expect(app.modal).toEqual({ kind: 'settings' });
  });

  it('switches the screen layout with Ctrl+Shift+L', () => {
    fakeBackend();
    expect(handleShortcut(key('L', { shiftKey: true }))).toBe(true);
    expect(app.split).toBe(true);
    handleShortcut(key('L', { shiftKey: true }));
    expect(app.split).toBe(false);
  });

  it('toggles the files panel with Ctrl+Shift+B, except in the split layout where it is always shown', () => {
    fakeBackend();
    expect(handleShortcut(key('B', { shiftKey: true }))).toBe(true);
    expect(app.filesOpen).toBe(true);
    app.toggleLayout();
    expect(handleShortcut(key('B', { shiftKey: true }))).toBe(false);
    expect(app.filesOpen).toBe(true);
  });

  it('does nothing behind an open dialog', () => {
    const backend = fakeBackend();
    app.modal = { kind: 'newProject' };
    expect(handleShortcut(key('n'))).toBe(false);
    expect(handleShortcut(key('2'))).toBe(false);
    expect(backend.called('create_agent')).toHaveLength(0);
    expect(app.project?.id).toBe('p1');
  });

  it('ignores keys without Ctrl, and Ctrl+Alt (AltGr on French keyboards)', () => {
    fakeBackend();
    expect(handleShortcut(new KeyboardEvent('keydown', { key: 'n' }))).toBe(false);
    expect(handleShortcut(key('2', { altKey: true }))).toBe(false);
  });
});

describe('isAppShortcut', () => {
  it('lets navigation shortcuts through the terminal but leaves shell keys to the shell', () => {
    expect(isAppShortcut(key('3'))).toBe(true);
    expect(isAppShortcut(key('Tab'))).toBe(true);
    expect(isAppShortcut(key('j'))).toBe(true);
    expect(isAppShortcut(key(','))).toBe(true);
    expect(isAppShortcut(key('c'))).toBe(false); // SIGINT
    expect(isAppShortcut(key('r'))).toBe(false); // reverse search
    expect(isAppShortcut(key('n'))).toBe(false); // readline: next history
    expect(isAppShortcut(new KeyboardEvent('keydown', { key: '3' }))).toBe(false);
  });
});
