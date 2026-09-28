import { describe, expect, it } from 'vitest';
import { barOf, captionOf, FRAMES_PER_BAR, SCENES, SECONDS_PER_BAR, TIMELINE, TOTAL_BARS, TOTAL_FRAMES } from './timeline';

describe('timeline', () => {
  it('lasts 41 bars of 2 s at 120 BPM: 82 s, 2 460 frames', () => {
    expect(FRAMES_PER_BAR).toBe(60);
    expect(SECONDS_PER_BAR).toBe(2);
    expect(TOTAL_BARS).toBe(41);
    expect(TOTAL_FRAMES).toBe(2460);
  });

  it('places the scenes end to end, each starting on a bar', () => {
    let next = 0;
    for (const s of TIMELINE) {
      expect(s.from).toBe(next);
      expect(s.from % FRAMES_PER_BAR).toBe(0);
      next = s.from + s.durationInFrames;
    }
    expect(next).toBe(TOTAL_FRAMES);
  });

  it('follows the script of the spec', () => {
    expect(SCENES.map((s) => s.id)).toEqual(['intro', 'chaos', 'projects', 'chat', 'notify', 'git', 'launch', 'stats', 'remote', 'outro']);
    expect([barOf('projects'), barOf('notify'), barOf('git'), barOf('outro')]).toEqual([6, 16, 20, 37]);
    expect(captionOf('chaos')).toBe('5 projets. 12 agents. 30 terminaux ?');
  });
});
