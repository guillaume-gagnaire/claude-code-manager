import { describe, expect, it } from 'vitest';
import { lineChanges } from './changes';

describe('lineChanges', () => {
  it('marks the lines changed or added since the reference', () => {
    expect(lineChanges('a\nb\nc\n', 'a\nB\nc\n')).toEqual({ changed: [2], deleted: [], count: 1 });
    expect(lineChanges('a\nb\nc\n', 'a\nb\nx\ny\nc\n')).toEqual({ changed: [3, 4], deleted: [], count: 2 });
  });

  it('marks an added blank line', () => {
    expect(lineChanges('a\nb\n', 'a\n\nb\n')).toEqual({ changed: [2], deleted: [], count: 1 });
  });

  it('marks where lines were removed', () => {
    expect(lineChanges('a\nb\nc\n', 'a\nc\n')).toEqual({ changed: [], deleted: [2], count: 0 });
  });

  it('counts every line of a new file, nothing for the same text', () => {
    expect(lineChanges(null, 'a\nb')).toEqual({ changed: [1, 2], deleted: [], count: 2 });
    expect(lineChanges(null, 'a\nb\n')).toEqual({ changed: [1, 2], deleted: [], count: 2 });
    expect(lineChanges('a\n', 'a\n')).toEqual({ changed: [], deleted: [], count: 0 });
  });

  it('marks nothing for an empty new file', () => {
    expect(lineChanges(null, '')).toEqual({ changed: [], deleted: [], count: 0 });
  });

  it('keeps a removal at the end of the file on its last line', () => {
    expect(lineChanges('a\nb\nc', 'a\nb')).toEqual({ changed: [], deleted: [2], count: 0 });
  });

  it('tells apart a modification that also removes lines', () => {
    expect(lineChanges('a\nb\nc\nd\n', 'a\nX\nd\n')).toEqual({ changed: [2], deleted: [], count: 1 });
  });
});

describe('lineChanges on big files', () => {
  const numbered = (n: number, tag: (i: number) => string) => Array.from({ length: n }, (_, i) => tag(i + 1)).join('\n') + '\n';

  // Line `i`: its number, then 77 letters and spaces that depend on `i` and `salt` (a fixed pseudo-random run),
  // the kind of text that a character-by-character diff finds hard.
  const alphabet = 'abcdefghijklmnopqrstuvwxyz ';
  const text = (i: number, salt: number) => {
    let seed = i * 7919 + salt * 104729 + 1;
    let out = `${i} `;
    for (let n = 0; n < 77; n++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      out += alphabet[Math.floor((seed / 2147483648) * alphabet.length)];
    }
    return out;
  };

  it('finds every 10th line changed in a 3000-line file, at once', () => {
    const base = numbered(3000, (i) => text(i, 0));
    const current = numbered(3000, (i) => text(i, i % 10 === 0 ? 1 : 0));
    expect(base.length).toBeGreaterThan(240_000);
    const start = performance.now();
    const result = lineChanges(base, current);
    const elapsed = performance.now() - start;
    expect(result.changed).toEqual(Array.from({ length: 300 }, (_, i) => (i + 1) * 10));
    expect(result.deleted).toEqual([]);
    expect(result.count).toBe(300);
    expect(elapsed).toBeLessThan(300);
  });

  it('gives an answer at once for a 60 KB file rewritten from top to bottom', () => {
    const base = numbered(3000, (i) => `old line number ${String(i).padStart(4, '0')}`);
    const current = numbered(3000, (i) => `new line number ${String(i).padStart(4, '0')}`);
    expect(base.length).toBeGreaterThan(60_000);
    const start = performance.now();
    const result = lineChanges(base, current);
    const elapsed = performance.now() - start;
    expect(result.changed).toEqual(Array.from({ length: 3000 }, (_, i) => i + 1));
    expect(result.count).toBe(3000);
    expect(elapsed).toBeLessThan(300);
  });

  it('works with as many distinct lines as there are characters to stand for them, marks nothing beyond', () => {
    // 0x100..0xFFFF without the surrogates: 63232 distinct lines.
    const lines = Array.from({ length: 63231 }, (_, i) => `l${i}`);
    const base = lines.join('\n');
    const one = [...lines];
    one[100] = 'X';
    expect(lineChanges(base, one.join('\n'))).toEqual({ changed: [101], deleted: [], count: 1 });
    const two = [...one];
    two[200] = 'Y';
    expect(lineChanges(base, two.join('\n'))).toEqual({ changed: [], deleted: [], count: 0 });
  });
});
