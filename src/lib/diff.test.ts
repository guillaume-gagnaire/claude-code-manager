import { describe, expect, it } from 'vitest';
import { fileLines, parseUnifiedDiff, patchLines, splitRows } from './diff';

const DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index 1111111..2222222 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,3 +10,4 @@ export function x() {
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 return a;
diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
diff --git a/logo.png b/logo.png
Binary files a/logo.png and b/logo.png differ
diff --git a/old.ts b/old.ts
deleted file mode 100644
--- a/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-gone
`;

describe('parseUnifiedDiff', () => {
  const files = parseUnifiedDiff(DIFF);

  it('splits the diff per file with status and counts', () => {
    expect(files.map((f) => [f.path, f.status, f.add, f.del, f.binary])).toEqual([
      ['src/auth.ts', 'M', 2, 1, false],
      ['new.txt', 'A', 2, 0, false],
      ['logo.png', 'M', 0, 0, true],
      ['old.ts', 'D', 0, 1, false],
    ]);
  });

  it('numbers old and new lines from the hunk header', () => {
    const lines = files[0].hunks[0].lines;
    expect(lines.map((l) => [l.kind, l.oldNo, l.newNo, l.text])).toEqual([
      ['ctx', 10, 10, 'const a = 1;'],
      ['del', 11, null, 'const b = 2;'],
      ['add', null, 11, 'const b = 3;'],
      ['add', null, 12, 'const c = 4;'],
      ['ctx', 12, 13, 'return a;'],
    ]);
  });

  it('handles CRLF line endings', () => {
    const f = parseUnifiedDiff(DIFF.replace(/\n/g, '\r\n'));
    expect(f[0].hunks[0].lines[1]).toMatchObject({ kind: 'del', text: 'const b = 2;' });
  });
});

describe('fileLines', () => {
  it('puts each hunk header before the hunk’s lines', () => {
    const [file] = parseUnifiedDiff(DIFF);
    expect(fileLines(file).map((l) => [l.kind, l.text])).toEqual([
      ['meta', '@@ -10,3 +10,4 @@ export function x() {'],
      ['ctx', 'const a = 1;'],
      ['del', 'const b = 2;'],
      ['add', 'const b = 3;'],
      ['add', 'const c = 4;'],
      ['ctx', 'return a;'],
    ]);
  });
});

describe('patchLines', () => {
  it('numbers structuredPatch hunks and separates them', () => {
    const lines = patchLines([
      { oldStart: 1, newStart: 1, lines: [' a', '-b', '+c'] },
      { oldStart: 20, newStart: 20, lines: ['+z'] },
    ]);
    expect(lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ['ctx', 1, 1],
      ['del', 2, null],
      ['add', null, 2],
      ['meta', null, null],
      ['add', null, 20],
    ]);
  });
});

describe('splitRows', () => {
  it('pairs deletions with following additions and pads the shorter side', () => {
    const rows = splitRows(patchLines([{ oldStart: 1, newStart: 1, lines: [' a', '-b', '-c', '+B', ' d', '+e'] }]));
    expect(rows.map((r) => [r.left?.text ?? null, r.right?.text ?? null])).toEqual([
      ['a', 'a'],
      ['b', 'B'],
      ['c', null],
      ['d', 'd'],
      [null, 'e'],
    ]);
  });
});

describe('parseUnifiedDiff inside hunks', () => {
  it('keeps changed lines that look like file headers (SQL/Lua comments)', () => {
    const files = parseUnifiedDiff(`diff --git a/q.sql b/q.sql
--- a/q.sql
+++ b/q.sql
@@ -1,2 +1,2 @@
--- old comment
+++ new comment
 select 1;
`);
    expect(files[0].hunks[0].lines.map((l) => [l.kind, l.text])).toEqual([
      ['del', '-- old comment'],
      ['add', '++ new comment'],
      ['ctx', 'select 1;'],
    ]);
    expect(files[0].add).toBe(1);
    expect(files[0].del).toBe(1);
  });
});
