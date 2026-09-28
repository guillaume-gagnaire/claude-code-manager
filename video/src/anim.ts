import { interpolate, spring } from 'remotion';
import { FRAMES_PER_BAR } from './timeline';

/** Frames per beat. */
export const BEAT = FRAMES_PER_BAR / 4;

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0 before `from`, 1 after `from + dur`, linear in between. */
export const ramp = (frame: number, from: number, dur: number) => interpolate(frame, [from, from + dur], [0, 1], clamp);

/** A spring from 0 to 1 starting at `from`; it may overshoot a little. */
export const pop = (frame: number, fps: number, from: number, damping = 14) =>
  frame < from ? 0 : spring({ frame: frame - from, fps, config: { damping } });

/** `text` as typed from `from`, `cps` characters per second. */
export const typed = (text: string, frame: number, fps: number, from: number, cps = 45) =>
  text.slice(0, Math.max(0, Math.floor(((frame - from) / fps) * cps)));

/** A value going from `a` to `b` over [from, from + dur]. */
export const count = (frame: number, from: number, dur: number, a: number, b: number) => a + (b - a) * ramp(frame, from, dur);

/** A number the French way: 1,87. */
export const fr = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',');
