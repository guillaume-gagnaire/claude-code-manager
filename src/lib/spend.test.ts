import { describe, expect, it } from 'vitest';
import { agent } from '../test/ipc';
import { fSpentUsd, spent } from './spend';

describe('spent', () => {
  it('adds the running turn to what the finished turns used, as an estimate', () => {
    const s = spent(agent({ tokens: 1000, cost: 0.5, liveTokens: 250, liveCost: 0.125 }));
    expect(s).toEqual({ tokens: 1250, cost: 0.625, estimated: true });
    expect(fSpentUsd(s)).toBe('≈ 0,63 $');
  });

  it('is exact between turns', () => {
    const s = spent(agent({ tokens: 1000, cost: 0.05 }));
    expect(s).toEqual({ tokens: 1000, cost: 0.05, estimated: false });
    expect(fSpentUsd(s)).toBe('0,050 $');
  });
});
