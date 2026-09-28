import { loadFont as loadUi } from '@remotion/google-fonts/HankenGrotesk';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

// The app's fonts; loadFont holds each frame until they are loaded.
export const UI = loadUi('normal', { weights: ['400', '500', '600', '700', '800'], subsets: ['latin', 'latin-ext'] }).fontFamily;
export const MONO = loadMono('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] }).fontFamily;

/** The app's colours (src/app.css). */
export const C = {
  bg: '#1b1917',
  panel: '#211f1c',
  elev: '#2a2724',
  elev2: '#34302c',
  user: '#302c28',
  term: '#131210',
  bar: '#171513',
  line: 'rgba(255, 236, 214, 0.08)',
  line2: 'rgba(255, 236, 214, 0.15)',
  text: '#ede7df',
  muted: '#a8a095',
  dim: '#6f685f',
  spark: '#D97757',
  ok: 'oklch(0.76 0.12 150)',
  wait: 'oklch(0.82 0.13 80)',
  del: 'oklch(0.72 0.14 25)',
  info: 'oklch(0.74 0.12 235)',
} as const;

/** A project colour, from its hue. */
export const hue = (h: number) => `oklch(0.72 0.12 ${h})`;
/** `color` at `pct` % opacity. */
export const soft = (color: string, pct: number) => `color-mix(in oklch, ${color} ${pct}%, transparent)`;
