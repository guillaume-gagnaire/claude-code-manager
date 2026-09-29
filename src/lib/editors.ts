// "Open in" menu entries for the installed editors.

import type { MenuItem } from './menu.svelte';
import type { EditorInfo } from './types';

/** The program of an editor command, to name it: `"C:\…\zed.exe" --new` → `zed`. */
export function commandName(command: string): string {
  const c = command.trim();
  const program = c.startsWith('"') ? c.slice(1).split('"')[0] : c.split(/\s+/)[0];
  return program
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(exe|cmd|bat|com)$/i, '');
}

/**
 * One entry per editor, the one of the settings first. `open` gets the id of the editor picked,
 * null for the settings' own command.
 */
export function editorItems(
  verb: string,
  editors: EditorInfo[],
  command: string,
  open: (editor: string | null) => void,
  disabled = false,
): MenuItem[] {
  const configured = command.trim() || 'code';
  const def = editors.find((e) => e.command === configured);
  const items: MenuItem[] = [
    { label: `${verb} ${def?.label ?? commandName(configured)}`, onClick: () => open(null), disabled },
    ...editors.filter((e) => e !== def).map((e) => ({ label: `${verb} ${e.label}`, onClick: () => open(e.id), disabled })),
  ];
  if (items.length > 1) items[0].hint = 'par défaut';
  return items;
}
