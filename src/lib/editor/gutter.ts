// Gutter marks of the lines changed since the reference version.

import { RangeSet, StateEffect, StateField, type Range, type Text } from '@codemirror/state';
import { gutter, GutterMarker } from '@codemirror/view';
import type { LineChanges } from './changes';

class ChangeMark extends GutterMarker {
  constructor(readonly kind: string) {
    super();
  }
  eq(other: GutterMarker) {
    return other instanceof ChangeMark && other.kind === this.kind;
  }
  toDOM() {
    const d = document.createElement('div');
    d.className = `cm-change ${this.kind}`;
    return d;
  }
}

const CHANGED = new ChangeMark('changed');
const DELETED = new ChangeMark('deleted');
const BOTH = new ChangeMark('changed deleted');

export const setChanges = StateEffect.define<LineChanges>();

export function markerRanges(doc: Text, c: LineChanges): Range<GutterMarker>[] {
  const kinds = new Map<number, ChangeMark>();
  for (const n of c.deleted) kinds.set(n, DELETED);
  for (const n of c.changed) kinds.set(n, kinds.has(n) ? BOTH : CHANGED);
  return [...kinds.keys()]
    .filter((n) => n >= 1 && n <= doc.lines)
    .sort((a, b) => a - b)
    .map((n) => kinds.get(n)!.range(doc.line(n).from));
}

const marks = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    for (const e of tr.effects) if (e.is(setChanges)) return RangeSet.of(markerRanges(tr.state.doc, e.value));
    return tr.docChanged ? set.map(tr.changes) : set;
  },
});

export const changeGutter = () => [marks, gutter({ class: 'cm-change-gutter', markers: (v) => v.state.field(marks) })];
