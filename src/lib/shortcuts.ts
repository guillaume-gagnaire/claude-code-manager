// Global keyboard shortcuts, routed in one place.

import { app } from './state.svelte';

/**
 * Shortcuts the terminal hands over to the app. Shell keys (Ctrl+C, Ctrl+R, Ctrl+N…) stay
 * with the shell; Ctrl+J is only a line feed there, which Enter already sends.
 */
export function isAppShortcut(e: KeyboardEvent): boolean {
  if (!e.ctrlKey || e.altKey) return false;
  return /^[1-9]$/.test(e.key) || e.key === 'Tab' || e.key === ',' || e.key.toLowerCase() === 'j';
}

/** Runs the shortcut matching `e`. Returns true when the event was handled. */
export function handleShortcut(e: KeyboardEvent): boolean {
  // Ctrl+Alt is AltGr on French keyboards (e.g. AltGr+2 = ~): never a shortcut.
  if (!e.ctrlKey || e.altKey || app.modal) return false;
  const k = e.key.toLowerCase();
  if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
    const p = app.projects[Number(e.key) - 1];
    if (!p) return false;
    app.selectProject(p.id);
    return true;
  }
  if (k === 'n' && !e.shiftKey && app.project) {
    app.newAgent();
    return true;
  }
  if (k === 'j') {
    app.nextWaiting();
    return true;
  }
  if (k === ',') {
    app.modal = { kind: 'settings' };
    return true;
  }
  if (k === 't' && !e.shiftKey && app.project) {
    const projectId = app.project.id;
    import('./term-actions').then((m) => m.newTerminal(projectId));
    return true;
  }
  if (k === 'b' && e.shiftKey && !app.split) {
    app.filesOpen = !app.filesOpen;
    return true;
  }
  if (k === 'l' && e.shiftKey) {
    app.toggleLayout();
    return true;
  }
  if (e.key === 'Tab' && app.project) {
    const list = app.projectAgents;
    if (!list.length) return false;
    const i = list.findIndex((a) => a.id === app.agent?.id);
    app.selectAgent(list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].id);
    return true;
  }
  return false;
}
