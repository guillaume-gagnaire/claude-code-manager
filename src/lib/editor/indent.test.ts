import { describe, expect, it } from 'vitest';
import { detectIndent } from './indent';

describe('detectIndent', () => {
  it('finds tabs', () => {
    expect(detectIndent('a\n\tb\n\t\tc\n')).toEqual({ tabs: true, size: 4 });
  });
  it('finds the width of space indentation', () => {
    expect(detectIndent('a\n    b\n        c\n    d\n')).toEqual({ tabs: false, size: 4 });
    expect(detectIndent('a\n  b\n    c\n  d\n')).toEqual({ tabs: false, size: 2 });
  });
  it('takes two spaces when nothing is indented', () => {
    expect(detectIndent('a\nb\n')).toEqual({ tabs: false, size: 2 });
    expect(detectIndent('')).toEqual({ tabs: false, size: 2 });
  });
});
