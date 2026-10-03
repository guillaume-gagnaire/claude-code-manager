import { javascript } from '@codemirror/lang-javascript';
import { ensureSyntaxTree, indentUnit, syntaxTree } from '@codemirror/language';
import { openSearchPanel } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import CodeEditor from './CodeEditor.svelte';

const none = { changed: [], deleted: [], count: 0 };
const base = { indent: { tabs: false, size: 2 }, changes: none, oncursor: () => {} };

function viewOf(container: HTMLElement): EditorView {
  return EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)!;
}

describe('CodeEditor', () => {
  it('shows the text and reports what is typed', async () => {
    const onchange = vi.fn();
    const { container } = render(CodeEditor, { ...base, docKey: 'k1', text: 'const a = 1;\n', version: 0, onchange });
    await tick();
    const view = viewOf(container);
    expect(view.state.doc.toString()).toBe('const a = 1;\n');
    view.dispatch({ changes: { from: 0, insert: '// x\n' } });
    expect(onchange).toHaveBeenLastCalledWith('// x\nconst a = 1;\n');
  });

  it('takes a reloaded text without reporting it as typed, and another file in full', async () => {
    const onchange = vi.fn();
    const { container, rerender } = render(CodeEditor, { ...base, docKey: 'k1', text: 'a\n', version: 0, onchange });
    await tick();
    await rerender({ ...base, docKey: 'k1', text: 'agent\n', version: 1, onchange });
    expect(viewOf(container).state.doc.toString()).toBe('agent\n');
    await rerender({ ...base, docKey: 'k2', text: 'other\n', version: 0, onchange });
    expect(viewOf(container).state.doc.toString()).toBe('other\n');
    expect(onchange).not.toHaveBeenCalled();
  });

  it('reports the cursor line and column', async () => {
    const oncursor = vi.fn();
    const { container } = render(CodeEditor, { ...base, oncursor, docKey: 'k1', text: 'ab\ncd\n', version: 0, onchange: () => {} });
    await tick();
    viewOf(container).dispatch({ selection: { anchor: 4 } });
    expect(oncursor).toHaveBeenLastCalledWith({ line: 2, col: 2 });
  });

  it('keeps reporting what is typed after a reloaded text', async () => {
    const onchange = vi.fn();
    const { container, rerender } = render(CodeEditor, { ...base, docKey: 'k1', text: 'a\n', version: 0, onchange });
    await tick();
    await rerender({ ...base, docKey: 'k1', text: 'agent\n', version: 1, onchange });
    viewOf(container).dispatch({ changes: { from: 0, insert: 'x' } });
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenLastCalledWith('xagent\n');
  });

  it('keeps the cursor in place when the text is reloaded, within the new text', async () => {
    const props = { ...base, docKey: 'k1', version: 0, onchange: () => {} };
    const { container, rerender } = render(CodeEditor, { ...props, text: 'abc\ndef\n' });
    await tick();
    viewOf(container).dispatch({ selection: { anchor: 6 } });
    await rerender({ ...props, text: 'abc\ndef\nghi\n', version: 1 });
    expect(viewOf(container).state.selection.main.head).toBe(6);
    await rerender({ ...props, text: 'a', version: 2 });
    expect(viewOf(container).state.selection.main.head).toBe(1);
  });

  it('marks the changed lines in the gutter, follows new changes and applies those of another file', async () => {
    const marked = (c: HTMLElement) => [...c.querySelectorAll('.cm-change')].map((e) => e.className);
    const props = { ...base, docKey: 'k1', text: 'a\nb\nc\n', version: 0, onchange: () => {} };
    const { container, rerender } = render(CodeEditor, { ...props, changes: { changed: [2], deleted: [], count: 1 } });
    await tick();
    expect(marked(container)).toEqual(['cm-change changed']);
    await rerender({ ...props, changes: { changed: [1], deleted: [3], count: 1 } });
    expect(marked(container)).toEqual(['cm-change changed', 'cm-change deleted']);
    await rerender({ ...props, docKey: 'k2', text: 'x\ny\n', changes: { changed: [2], deleted: [], count: 1 } });
    expect(marked(container)).toEqual(['cm-change changed']);
  });

  it('moves the cursor to the line to reveal, within the file', async () => {
    const props = { ...base, docKey: 'k1', text: 'a\nb\nc\n', version: 0, onchange: () => {} };
    const { container, rerender } = render(CodeEditor, props);
    await tick();
    await rerender({ ...props, reveal: { line: 2, seq: 1 } });
    expect(viewOf(container).state.selection.main.head).toBe(2);
    await rerender({ ...props, reveal: { line: 99, seq: 2 } });
    expect(viewOf(container).state.selection.main.head).toBe(6);
  });

  it('takes the language once it is loaded', async () => {
    const props = { ...base, docKey: 'k1', text: 'const a = 1;\n', version: 0, onchange: () => {} };
    const { container, rerender } = render(CodeEditor, props);
    await tick();
    expect(syntaxTree(viewOf(container).state).length).toBe(0);
    await rerender({ ...props, language: javascript() });
    expect(ensureSyntaxTree(viewOf(container).state, 100)?.type.name).toBe('Script');
  });

  it('opens its search panel in French', async () => {
    const { container } = render(CodeEditor, { ...base, docKey: 'k1', text: 'abc\n', version: 0, onchange: () => {} });
    await tick();
    expect(openSearchPanel(viewOf(container))).toBe(true);
    const panel = container.querySelector('.cm-search') as HTMLElement;
    expect(panel.querySelector('input[name=search]')?.getAttribute('placeholder')).toBe('Rechercher');
    expect(panel.querySelector('button[name=next]')?.textContent).toBe('suivant');
    expect(panel.querySelector('button[name=close]')?.getAttribute('aria-label')).toBe('fermer');
  });

  it('indents the way the project does, and follows a change of style', async () => {
    const props = { ...base, docKey: 'k1', text: '', version: 0, onchange: () => {} };
    const { container, rerender } = render(CodeEditor, { ...props, indent: { tabs: false, size: 4 } });
    await tick();
    expect(viewOf(container).state.facet(indentUnit)).toBe('    ');
    await rerender({ ...props, indent: { tabs: true, size: 4 } });
    expect(viewOf(container).state.facet(indentUnit)).toBe('\t');
  });
});
