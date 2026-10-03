<script lang="ts">
  import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
  import { search, searchKeymap } from '@codemirror/search';
  import { Compartment, EditorState, type Extension } from '@codemirror/state';
  import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
  import { onDestroy, onMount, untrack } from 'svelte';
  import type { LineChanges } from '../../lib/editor/changes';
  import { changeGutter, setChanges } from '../../lib/editor/gutter';
  import { editorTheme, PHRASES } from '../../lib/editor/theme';

  // `docKey` names the file shown: another one replaces the whole editor state. `version` changes
  // when the same file's text was replaced from disk.
  let {
    docKey,
    text,
    version,
    language = null,
    indent,
    changes,
    reveal = null,
    onchange,
    oncursor,
  }: {
    docKey: string;
    text: string;
    version: number;
    language?: Extension | null;
    indent: { tabs: boolean; size: number };
    changes: LineChanges;
    reveal?: { line: number; seq: number } | null;
    onchange: (text: string) => void;
    oncursor: (pos: { line: number; col: number }) => void;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  const lang = new Compartment();
  const ind = new Compartment();
  /** A text replaced from outside is not the user typing. */
  let applying = false;
  let shownKey = untrack(() => docKey);
  let shownVersion = untrack(() => version);

  const indentExt = (i: { tabs: boolean; size: number }) => [
    indentUnit.of(i.tabs ? '\t' : ' '.repeat(i.size)),
    EditorState.tabSize.of(i.tabs ? 4 : i.size),
  ];

  function makeState(doc: string) {
    return EditorState.create({
      doc,
      extensions: [
        changeGutter(),
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        search({ top: true }),
        EditorState.phrases.of(PHRASES),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
        editorTheme,
        lang.of(untrack(() => language) ?? []),
        ind.of(indentExt(untrack(() => indent))),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !applying) onchange(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            oncursor({ line: line.number, col: head - line.from + 1 });
          }
        }),
      ],
    });
  }

  onMount(() => {
    view = new EditorView({ state: makeState(untrack(() => text)), parent: host });
    view.dispatch({ effects: setChanges.of(untrack(() => changes)) });
  });
  onDestroy(() => view?.destroy());

  $effect(() => {
    const k = docKey;
    const v = version;
    untrack(() => {
      if (!view) return;
      if (k !== shownKey) {
        shownKey = k;
        shownVersion = v;
        view.setState(makeState(text));
        view.dispatch({ effects: setChanges.of(changes) });
      } else if (v !== shownVersion) {
        shownVersion = v;
        const head = Math.min(view.state.selection.main.head, text.length);
        applying = true;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: head } });
        applying = false;
      }
    });
  });

  $effect(() => {
    const l = language;
    untrack(() => view?.dispatch({ effects: lang.reconfigure(l ?? []) }));
  });

  $effect(() => {
    const i = indent;
    untrack(() => view?.dispatch({ effects: ind.reconfigure(indentExt(i)) }));
  });

  $effect(() => {
    const c = changes;
    untrack(() => view?.dispatch({ effects: setChanges.of(c) }));
  });

  $effect(() => {
    const r = reveal;
    if (!r) return;
    untrack(() => {
      if (!view) return;
      const n = Math.min(Math.max(1, r.line), view.state.doc.lines);
      const pos = view.state.doc.line(n).from;
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
      view.focus();
    });
  });
</script>

<div class="code" bind:this={host}></div>

<style>
  .code {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .code :global(.cm-editor) {
    height: 100%;
  }
  .code :global(.cm-editor.cm-focused) {
    outline: none;
  }
</style>
