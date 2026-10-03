import { bracketMatching } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { editorTheme } from './theme';

// jsdom has no cascade, so compare the rules CodeMirror injects: our rule must be at least as specific as
// the base theme's one (a class counts for as much as another) and come after it, or the base wins.
function rules(): { selectors: string[]; body: string; at: number }[] {
  const view = new EditorView({
    state: EditorState.create({ doc: 'a', extensions: [editorTheme, bracketMatching()] }),
    parent: document.body,
  });
  const css = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
  view.destroy();
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim()),
    body: m[2],
    at: m.index,
  }));
}
const specificity = (selector: string) => (selector.match(/\.[^\s.>:,+~]+/g) ?? []).length;
const strongest = (r: { selectors: string[] }, within: RegExp) => Math.max(...r.selectors.filter((s) => within.test(s)).map(specificity));

describe('editorTheme', () => {
  it('tints the focused selection with the accent, over the base theme', () => {
    const all = rules();
    const ours = all.find((r) => r.body.includes('var(--accent) 28%'))!;
    const base = all.filter(
      (r) =>
        /cm-focused > \.cm-scroller > \.cm-selectionLayer \.cm-selectionBackground/.test(r.selectors.join()) && !r.body.includes('var('),
    );
    const focused = /cm-focused > \.cm-scroller > \.cm-selectionLayer \.cm-selectionBackground/;
    expect(base.length).toBeGreaterThan(0);
    for (const b of base) {
      expect(strongest(ours, focused)).toBeGreaterThanOrEqual(strongest(b, focused));
      expect(ours.at).toBeGreaterThan(b.at);
    }
  });

  it('styles the matching bracket while focused, over the base theme', () => {
    const all = rules();
    const ours = all.find((r) => r.body.includes('var(--elev2)'))!;
    const base = all.find((r) => r.selectors.some((s) => /\.cm-focused \.cm-matchingBracket/.test(s)) && !r.body.includes('var('))!;
    const focused = /\.cm-focused \.cm-matchingBracket/;
    expect(strongest(ours, focused)).toBeGreaterThanOrEqual(strongest(base, focused));
    expect(ours.at).toBeGreaterThan(base.at);
  });
});
