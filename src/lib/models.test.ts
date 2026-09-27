import { describe, expect, it } from 'vitest';
import { displayModel, modelLabel, supportsAuto, supportsEffort } from './models';

describe('displayModel', () => {
  it.each([
    ['claude-opus-5-5', 'Opus 5.5'],
    ['claude-sonnet-5', 'Sonnet 5'],
    ['claude-haiku-4-5-20251001', 'Haiku 4.5'],
    ['claude-fable-5-1', 'Fable 5.1'],
    ['claude-opus-4-8', 'Opus 4.8'],
    ['gpt-unknown', 'gpt-unknown'],
  ])('%s → %s', (id, want) => expect(displayModel(id)).toBe(want));
});

describe('modelLabel', () => {
  it('names CLI aliases and full ids', () => {
    expect(modelLabel('opus')).toBe('Opus');
    expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5');
  });
});

describe('capabilities', () => {
  it('Haiku supports neither effort nor auto mode', () => {
    expect(supportsEffort('haiku')).toBe(false);
    expect(supportsAuto('claude-haiku-4-5-20251001')).toBe(false);
    expect(supportsEffort('opus')).toBe(true);
    expect(supportsAuto('fable')).toBe(true);
  });
});
