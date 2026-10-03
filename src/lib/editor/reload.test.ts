import { describe, expect, it } from 'vitest';
import { reloadChange } from './reload';

const apply = (text: string, c: { from: number; to: number; insert: string }) => text.slice(0, c.from) + c.insert + text.slice(c.to);
const high = (code: number) => code >= 0xd800 && code < 0xdc00;
const low = (code: number) => code >= 0xdc00 && code < 0xe000;

describe('reloadChange', () => {
  it('is nothing for the same text', () => {
    expect(reloadChange('a\nb\n', 'a\nb\n')).toBeNull();
    expect(reloadChange('', '')).toBeNull();
  });

  it('keeps the common start and end, replacing only what is between', () => {
    expect(reloadChange('one\ntwo\nthree\n', 'one\n2\nthree\n')).toEqual({ from: 4, to: 7, insert: '2' });
    expect(reloadChange('a\nb\n', 'x\ny\na\nb\n')).toEqual({ from: 0, to: 0, insert: 'x\ny\n' });
    expect(reloadChange('a\nb\nc\n', 'a\nc\n')).toEqual({ from: 2, to: 4, insert: '' });
    expect(reloadChange('', 'new')).toEqual({ from: 0, to: 0, insert: 'new' });
    expect(reloadChange('old', '')).toEqual({ from: 0, to: 3, insert: '' });
  });

  it('does not count the same characters twice when the start and the end overlap', () => {
    expect(reloadChange('aa', 'aaa')).toEqual({ from: 2, to: 2, insert: 'a' });
    expect(reloadChange('aaa', 'aa')).toEqual({ from: 2, to: 3, insert: '' });
    expect(reloadChange('ab', 'aab')).toEqual({ from: 1, to: 1, insert: 'a' });
  });

  it('never cuts a character made of two code units', () => {
    expect(reloadChange('a\u{1F600}b', 'a\u{1F601}b')).toEqual({ from: 1, to: 3, insert: '\u{1F601}' });
  });

  it('always yields a change that turns the one text into the other, off the middle of a pair', () => {
    const texts = [
      '',
      'a',
      'aa',
      'ab',
      'ba',
      'a\nb',
      'abab',
      'baba',
      'xabx',
      '\u{1F600}a',
      'a\u{1F600}',
      '\u{1F601}\u{1F600}',
      '\u{1F600}',
    ];
    for (const a of texts)
      for (const b of texts) {
        const c = reloadChange(a, b);
        expect(c === null ? a : apply(a, c)).toBe(b);
        if (c) for (const at of [c.from, c.to]) expect(high(a.charCodeAt(at - 1)) && low(a.charCodeAt(at))).toBe(false);
      }
  });
});
