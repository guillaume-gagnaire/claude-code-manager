import { beforeAll, describe, expect, it } from 'vitest';
import { barOf, SECONDS_PER_BAR, TOTAL_BARS } from '../src/timeline';
import { render, score } from './song';
import { SR, type Mix } from './synth';

const beatsOf = (fromBar: number, toBar: number) =>
  Array.from({ length: (toBar - fromBar) * 4 }, (_, i) => fromBar * SECONDS_PER_BAR + (i * SECONDS_PER_BAR) / 4);
const within = (times: number[], fromBar: number, toBar: number) =>
  times.filter((t) => t >= fromBar * SECONDS_PER_BAR && t < toBar * SECONDS_PER_BAR);

describe('score', () => {
  const sc = score();

  it('kicks on every beat of both drops, and never while the notifications breathe', () => {
    expect(sc.kicks).toEqual(expect.arrayContaining([...beatsOf(barOf('projects'), barOf('notify')), ...beatsOf(barOf('git'), barOf('outro'))]));
    expect(within(sc.kicks, barOf('notify'), barOf('git'))).toEqual([]);
  });

  it('rises during the bar before each drop, and crashes on them and on the logo', () => {
    expect(sc.risers).toEqual([
      [(barOf('projects') - 1) * SECONDS_PER_BAR, SECONDS_PER_BAR],
      [(barOf('git') - 1) * SECONDS_PER_BAR, SECONDS_PER_BAR],
    ]);
    expect(sc.crashes).toEqual([barOf('projects'), barOf('git'), barOf('outro')].map((b) => b * SECONDS_PER_BAR));
  });
});

describe('render', () => {
  let m: Mix;
  beforeAll(() => {
    m = render();
  });
  const rms = (fromBar: number, toBar: number) => {
    let sum = 0;
    const a = Math.round(fromBar * SECONDS_PER_BAR * SR);
    const b = Math.round(toBar * SECONDS_PER_BAR * SR);
    for (let i = a; i < b; i++) sum += m.l[i] ** 2 + m.r[i] ** 2;
    return Math.sqrt(sum / (2 * (b - a)));
  };

  it('lasts exactly as long as the video', () => {
    expect(m.l.length).toBe(Math.ceil(TOTAL_BARS * SECONDS_PER_BAR * SR));
    expect(m.r.length).toBe(m.l.length);
  });

  it('peaks just under -1 dBFS: loud, never clipping', () => {
    let peak = 0;
    for (const ch of [m.l, m.r]) for (const x of ch) peak = Math.max(peak, Math.abs(x));
    expect(peak).toBeLessThanOrEqual(0.892);
    expect(peak).toBeGreaterThan(0.85);
  });

  it('is much louder after the drop than in the intro', () => {
    expect(rms(barOf('projects'), barOf('projects') + 2)).toBeGreaterThan(2 * rms(0, 2));
  });
});
