import { describe, expect, it } from 'vitest';
import { commandName, editorItems } from './editors';
import type { EditorInfo } from './types';

const VSCODE: EditorInfo = { id: 'vscode', label: 'VS Code', command: 'code' };
const ZED: EditorInfo = { id: 'zed', label: 'Zed', command: '"C:\\Programs\\Zed\\bin\\zed.exe"' };

function picked() {
  const got: (string | null)[] = [];
  return { got, open: (editor: string | null) => got.push(editor) };
}

describe('editorItems', () => {
  it('offers the editor of the settings first, then the other installed ones', () => {
    const p = picked();
    const items = editorItems('Éditer dans', [VSCODE, ZED], ZED.command, p.open);
    expect(items.map((i) => [i.label, i.hint])).toEqual([
      ['Éditer dans Zed', 'par défaut'],
      ['Éditer dans VS Code', undefined],
    ]);
    items.forEach((i) => i.onClick!());
    // The default one opens with the settings' command.
    expect(p.got).toEqual([null, 'vscode']);
  });

  it('names a custom command after its program', () => {
    const items = editorItems('Ouvrir dans', [VSCODE], '"C:\\Sublime Text\\subl.exe" -n', () => {});
    expect(items.map((i) => i.label)).toEqual(['Ouvrir dans subl', 'Ouvrir dans VS Code']);
  });

  it('keeps a single entry without hint, and can be disabled', () => {
    const items = editorItems('Éditer dans', [], '', () => {}, true);
    expect(items).toMatchObject([{ label: 'Éditer dans code', disabled: true }]);
    expect(items[0].hint).toBeUndefined();
  });
});

describe('commandName', () => {
  it('keeps the program of a command, without folder nor extension', () => {
    expect(commandName('code')).toBe('code');
    expect(commandName('  cursor --reuse-window ')).toBe('cursor');
    expect(commandName('C:/tools/nvim-qt.exe')).toBe('nvim-qt');
    expect(commandName('"C:\\Program Files\\Zed\\zed.exe" --new')).toBe('zed');
  });
});
