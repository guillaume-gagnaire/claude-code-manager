import { describe, expect, it } from 'vitest';
import { applyCompletion, detectTrigger, filterCommands } from './complete';

describe('detectTrigger', () => {
  it('detects a slash command only at the very start', () => {
    expect(detectTrigger('/comp', 5)).toEqual({ kind: 'command', query: 'comp', start: 0, end: 5 });
    expect(detectTrigger('fais /comp', 10)).toBeNull();
    expect(detectTrigger('/compact now', 12)).toBeNull();
  });

  it('accepts namespaced commands', () => {
    expect(detectTrigger('/gsd:pro', 8)).toMatchObject({ kind: 'command', query: 'gsd:pro' });
  });

  it('detects an @ mention after a space or at the start', () => {
    expect(detectTrigger('Relis @src/au', 13)).toEqual({ kind: 'file', query: 'src/au', start: 6, end: 13 });
    expect(detectTrigger('@', 1)).toEqual({ kind: 'file', query: '', start: 0, end: 1 });
  });

  it('ignores e-mail addresses', () => {
    expect(detectTrigger('contact@example', 15)).toBeNull();
  });

  it('only looks at the text before the caret', () => {
    expect(detectTrigger('Relis @src puis', 10)).toMatchObject({ kind: 'file', query: 'src' });
    expect(detectTrigger('Relis @src puis', 15)).toBeNull();
  });
});

describe('applyCompletion', () => {
  it('replaces the mention token and keeps the rest of the text', () => {
    const text = 'Relis @au puis teste';
    const t = detectTrigger(text, 9)!;
    expect(applyCompletion(text, t, 'src/auth.ts')).toEqual({ text: 'Relis @src/auth.ts puis teste', caret: 19 });
  });

  it('replaces a partially typed word after the caret', () => {
    const text = 'Relis @auxxx';
    const t = detectTrigger(text, 9)!;
    expect(applyCompletion(text, t, 'src/auth.ts').text).toBe('Relis @src/auth.ts ');
  });

  it('inserts a command with a trailing space', () => {
    const t = detectTrigger('/co', 3)!;
    expect(applyCompletion('/co', t, 'compact')).toEqual({ text: '/compact ', caret: 9 });
  });
});

describe('filterCommands', () => {
  const cmds = [{ name: 'commit' }, { name: 'compact' }, { name: 'gsd:commit-all' }, { name: 'review' }];
  it('lists prefix matches before substring matches', () => {
    expect(filterCommands(cmds, 'com').map((c) => c.name)).toEqual(['commit', 'compact', 'gsd:commit-all']);
  });
  it('is case-insensitive and honours the limit', () => {
    expect(filterCommands(cmds, 'COM', 1).map((c) => c.name)).toEqual(['commit']);
  });
});
