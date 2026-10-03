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
});
