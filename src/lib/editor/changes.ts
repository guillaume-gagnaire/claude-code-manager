// Lines of the editor that differ from the reference version (HEAD, or where a worktree's branch
// left its base): drawn in the gutter and counted in the header.

import { Chunk } from '@codemirror/merge';
import { Text } from '@codemirror/state';

export interface LineChanges {
  /** Lines (1-based) added or modified. */
  changed: number[];
  /** Lines (1-based) above which lines were removed. */
  deleted: number[];
  count: number;
}

const doc = (s: string) => Text.of(s.split('\n'));

export function lineChanges(base: string | null, current: string): LineChanges {
  const b = doc(current);
  if (base === null) {
    // A trailing line break opens an empty last line: not a line of the file.
    const last = b.lines > 1 && b.line(b.lines).length === 0 ? b.lines - 1 : b.lines;
    const changed = Array.from({ length: last }, (_, i) => i + 1);
    return { changed, deleted: [], count: changed.length };
  }
  const changed = new Set<number>();
  const deleted = new Set<number>();
  for (const c of Chunk.build(doc(base), b)) {
    if (c.toB > c.fromB) {
      const first = b.lineAt(c.fromB).number;
      const last = b.lineAt(c.endB).number;
      for (let n = first; n <= last; n++) changed.add(n);
    } else if (c.toA > c.fromA) {
      deleted.add(Math.min(b.lineAt(c.fromB).number, b.lines));
    }
  }
  const sorted = (s: Set<number>) => [...s].sort((x, y) => x - y);
  return { changed: sorted(changed), deleted: sorted(deleted), count: changed.size };
}
