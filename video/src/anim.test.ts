import { describe, expect, it } from 'vitest';
import { BEAT, count, fr, pop, ramp, typed } from './anim';

describe('animation helpers', () => {
  it('ramps from 0 to 1 over a window, clamped', () => {
    expect(ramp(0, 10, 20)).toBe(0);
    expect(ramp(20, 10, 20)).toBe(0.5);
    expect(ramp(99, 10, 20)).toBe(1);
  });

  it('springs from 0 once started', () => {
    expect(pop(5, 30, 10)).toBe(0);
    expect(pop(200, 30, 10)).toBeCloseTo(1, 2);
  });

  it('types text at a given speed', () => {
    expect(typed('abcdef', 0, 30, 10)).toBe('');
    expect(typed('abcdef', 30, 30, 0, 3)).toBe('abc');
    expect(typed('abcdef', 999, 30, 0)).toBe('abcdef');
  });

  it('counts between two values and writes French numbers', () => {
    expect(count(15, 10, 10, 0, 2)).toBe(1);
    expect(fr(1.5)).toBe('1,50');
    expect(fr(12.345, 1)).toBe('12,3');
  });

  it('beats every 15 frames', () => {
    expect(BEAT).toBe(15);
  });
});
