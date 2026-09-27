import { describe, expect, it } from 'vitest';
import { basename, dirname, fCountdown, fDur, fTok, fUsd, plural, relPath, tildify } from './format';

describe('fTok', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,0 k'],
    [182400, '182,4 k'],
    [1_000_000, '1,00 M'],
    [2_345_678, '2,35 M'],
    [3_200_000_000, '3,20 Md'],
  ])('%d → %s', (n, want) => expect(fTok(n)).toBe(want));
});

describe('fUsd', () => {
  const nbsp = (s: string) => s.replace(/\s/g, ' ');
  it('uses French decimals and a dollar suffix', () => expect(nbsp(fUsd(2.84))).toBe('2,84 $'));
  it('shows three decimals for small amounts so cents do not round to zero', () => expect(nbsp(fUsd(0.0062))).toBe('0,006 $'));
  it('keeps two decimals for zero', () => expect(nbsp(fUsd(0))).toBe('0,00 $'));
  it('groups thousands', () => expect(nbsp(fUsd(1284.6))).toBe('1 284,60 $'));
});

describe('fDur', () => {
  it.each([
    [0, '0m 00s'],
    [59_000, '0m 59s'],
    [312_000, '5m 12s'],
    [2_531_000, '42m 11s'],
    [3_920_000, '1h 05m'],
    [-5, '0m 00s'],
  ])('%d ms → %s', (ms, want) => expect(fDur(ms)).toBe(want));
});

describe('fCountdown', () => {
  const now = 1_000_000_000_000;
  it('formats hours and minutes', () => expect(fCountdown(now + (1 * 3600 + 48 * 60) * 1000, now)).toBe('1h48'));
  it('switches to days beyond 24h', () => expect(fCountdown(now + (2 * 86400 + 5 * 3600) * 1000, now)).toBe('2j 5h'));
  it('never goes negative', () => expect(fCountdown(now - 10_000, now)).toBe('0h00'));
  it('shows a dash when unknown', () => expect(fCountdown(null, now)).toBe('—'));
});

describe('paths', () => {
  it('relPath strips the base case-insensitively and normalizes slashes', () => {
    expect(relPath('C:\\Code\\App', 'c:\\code\\app\\src\\main.ts')).toBe('src/main.ts');
  });
  it('relPath leaves unrelated paths untouched', () => {
    expect(relPath('C:\\code\\app', 'C:\\code\\application\\x.ts')).toBe('C:/code/application/x.ts');
  });
  it('basename and dirname handle both separators', () => {
    expect(basename('src\\middleware\\auth.ts')).toBe('auth.ts');
    expect(dirname('src/middleware/auth.ts')).toBe('src/middleware');
    expect(dirname('README.md')).toBe('.');
  });
  it('tildify shortens the home folder only', () => {
    expect(tildify('C:\\Users\\guill\\dev\\app')).toBe('~/dev/app');
    expect(tildify('D:\\work\\app')).toBe('D:\\work\\app');
  });
});

describe('plural', () => {
  it('agrees with the count', () => {
    expect(plural(1, 'fichier', 'fichiers')).toBe('1 fichier');
    expect(plural(3, 'fichier', 'fichiers')).toBe('3 fichiers');
  });
});
