import { describe, expect, it } from 'vitest';
import { ancestors, treeRows } from './tree';

const files = ['src/b.ts', 'README.md', 'src/a/x.ts', 'package.json', 'src/A.ts'];
const shape = (rows: ReturnType<typeof treeRows>) => rows.map((r) => `${r.depth}${r.kind[0]} ${r.name}`);

describe('treeRows', () => {
  it('lists folders first, then files, each sorted, folders closed', () => {
    expect(shape(treeRows(files, {}, {}))).toEqual(['0d src', '0f package.json', '0f README.md']);
  });

  it('shows what an open folder holds, one level deeper', () => {
    const rows = treeRows(files, { src: true, 'src/a': true }, {});
    expect(shape(rows)).toEqual(['0d src', '1d a', '2f x.ts', '1f A.ts', '1f b.ts', '0f package.json', '0f README.md']);
    expect(rows[0]).toMatchObject({ path: 'src', open: true });
    expect(rows[2]).toMatchObject({ path: 'src/a/x.ts', kind: 'file' });
  });

  it('marks changed files and the folders holding them', () => {
    const rows = treeRows(files, {}, { 'src/a/x.ts': 'M', 'README.md': 'A' });
    expect(rows.find((r) => r.name === 'src')).toMatchObject({ changedInside: true });
    expect(rows.find((r) => r.name === 'README.md')).toMatchObject({ status: 'A' });
    expect(rows.find((r) => r.name === 'package.json')).toMatchObject({ status: null });
  });
});

describe('ancestors', () => {
  it('gives the folders above a file, outermost first', () => {
    expect(ancestors('src/a/x.ts')).toEqual(['src', 'src/a']);
    expect(ancestors('x.ts')).toEqual([]);
  });
});
