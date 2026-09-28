// The track: A minor at 120 BPM, one chord per bar, arranged on the script.

import { barOf, SECONDS_PER_BAR, TOTAL_BARS } from '../src/timeline';
import { clap, crash, hat, kick, master, midiHz, mix, noise, note, riser, type Mix, type Voice } from './synth';

const BEAT = SECONDS_PER_BAR / 4;
/** Am, F, C, G: bass note, then the chord's tones (MIDI). */
const CHORDS = [
  { bass: 45, tones: [57, 60, 64] },
  { bass: 41, tones: [57, 60, 65] },
  { bass: 48, tones: [55, 60, 64] },
  { bass: 43, tones: [55, 59, 62] },
];

const DROP = barOf('projects');
const CALM = barOf('notify');
const DROP2 = barOf('git');
const END = barOf('outro');

type Part = 'intro' | 'build' | 'drop' | 'calm' | 'end';

function partOf(bar: number): Part {
  if (bar >= END) return 'end';
  if (bar >= DROP2) return 'drop';
  if (bar >= CALM) return 'calm';
  if (bar >= DROP) return 'drop';
  return bar >= barOf('chaos') ? 'build' : 'intro';
}

/** Every event, in seconds. Notes: [start, duration, MIDI note, filter cutoff]. */
export interface Score {
  kicks: number[];
  claps: number[];
  hats: [number, number][];
  bass: [number, number, number, number][];
  arp: [number, number, number, number][];
  pads: [number, number, number[]][];
  risers: [number, number][];
  crashes: number[];
}

export function score(): Score {
  const s: Score = { kicks: [], claps: [], hats: [], bass: [], arp: [], pads: [], risers: [], crashes: [] };
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const t0 = bar * SECONDS_PER_BAR;
    const chord = CHORDS[bar % 4];
    const part = partOf(bar);
    const beats = [0, 1, 2, 3].map((b) => t0 + b * BEAT);

    if (part !== 'end' || bar < END + 3) s.pads.push([t0, SECONDS_PER_BAR, chord.tones]);

    if (part !== 'end' || bar === END) {
      const cutoff = part === 'intro' || part === 'build' ? 500 + bar * 500 : part === 'calm' ? 1800 : part === 'end' ? 1500 : 3400;
      const arp = [...chord.tones, chord.tones[0] + 12];
      for (let i = 0; i < 16; i++) s.arp.push([t0 + (i * BEAT) / 4, BEAT / 4, arp[i % 4] + (part === 'drop' ? 12 : 0), cutoff]);
    }

    if (part === 'build' && bar < DROP - 1) s.kicks.push(beats[0], beats[2]);
    if (part === 'build' || part === 'calm') s.bass.push([t0, SECONDS_PER_BAR * 0.95, chord.bass, 300]);

    if (part === 'drop') {
      s.kicks.push(...beats);
      s.claps.push(beats[1], beats[3]);
      for (let i = 0; i < 16; i++) s.hats.push([t0 + (i * BEAT) / 4, i % 2 ? 0.13 : 0.05]);
      for (const b of beats) s.bass.push([b + BEAT / 2, BEAT / 2 - 0.02, chord.bass, 700]);
    }
    if (part === 'calm') for (const b of beats) s.hats.push([b + BEAT / 2, 0.06]);

    if (bar === DROP - 1 || bar === DROP2 - 1) s.risers.push([t0, SECONDS_PER_BAR]);
    if (bar === DROP || bar === DROP2 || bar === END) s.crashes.push(t0);
    if (bar === END) s.kicks.push(t0);
  }
  return s;
}

const BASS: Voice = { wave: 'saw', attack: 0.004, decay: 0.12, sustain: 0.6, release: 0.03, cutoff: 700 };
const ARP: Voice = { wave: 'square', attack: 0.002, decay: 0.07, sustain: 0, release: 0.05, cutoff: 3000 };
const PAD: Voice = { wave: 'saw', attack: 0.5, decay: 1, sustain: 0.8, release: 0.9, cutoff: 1100, detune: 9 };

export function render(sc: Score = score()): Mix {
  const m = mix(TOTAL_BARS * SECONDS_PER_BAR);
  const rnd = noise(7);
  for (const t of sc.kicks) kick(m, t);
  for (const t of sc.claps) clap(m, t, rnd);
  for (const [t, gain] of sc.hats) hat(m, t, rnd, gain);
  for (const [t, d, n, cutoff] of sc.bass) note(m, t, d, midiHz(n), 0.34, { ...BASS, cutoff });
  for (const [t, d, n, cutoff] of sc.arp) note(m, t, d, midiHz(n), 0.1, { ...ARP, cutoff });
  for (const [t, d, tones] of sc.pads) for (const n of tones) note(m, t, d, midiHz(n), 0.08, PAD);
  for (const [t, d] of sc.risers) riser(m, t, d, rnd);
  for (const t of sc.crashes) crash(m, t, rnd);
  master(m);
  return m;
}
