// A tiny synthesizer: every instrument adds its samples into a stereo mix.

export const SR = 44100;

export interface Mix {
  l: Float32Array;
  r: Float32Array;
}

export const mix = (seconds: number): Mix => {
  const n = Math.ceil(seconds * SR);
  return { l: new Float32Array(n), r: new Float32Array(n) };
};

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Deterministic white noise in [-1, 1] (mulberry32). */
export function noise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

/** Adds `v` at sample `i`, panned from -1 (left) to 1 (right). */
function add(m: Mix, i: number, v: number, pan = 0) {
  if (i < 0 || i >= m.l.length) return;
  m.l[i] += v * Math.min(1, 1 - pan);
  m.r[i] += v * Math.min(1, 1 + pan);
}

/** One-pole low-pass coefficient for a cutoff in Hz. */
const lowpass = (hz: number) => 1 - Math.exp((-2 * Math.PI * hz) / SR);

export function kick(m: Mix, t: number, gain = 0.95) {
  const start = Math.round(t * SR);
  let phase = 0;
  for (let i = 0; i < 0.42 * SR; i++) {
    const s = i / SR;
    phase += (2 * Math.PI * (46 + 110 * Math.exp(-s * 28))) / SR;
    const click = i < 90 ? (1 - i / 90) * 0.3 * Math.sin(phase * 7) : 0;
    add(m, start + i, (Math.sin(phase) * Math.exp(-s * 7.5) + click) * gain);
  }
}

export function clap(m: Mix, t: number, rnd: () => number, gain = 0.4) {
  const start = Math.round(t * SR);
  let prev = 0;
  let y = 0;
  for (let i = 0; i < 0.22 * SR; i++) {
    const s = i / SR;
    // Three quick bursts, then a short tail.
    const bursts = [0, 0.011, 0.022].reduce((a, b) => a + (s >= b ? Math.exp(-(s - b) * 180) : 0), 0);
    const env = Math.min(1, bursts) * 0.8 + Math.exp(-s * 22) * 0.45;
    const n = rnd();
    y += 0.45 * (n - prev - y);
    prev = n;
    add(m, start + i, y * env * gain);
  }
}

export function hat(m: Mix, t: number, rnd: () => number, gain: number, pan = 0.25) {
  const start = Math.round(t * SR);
  let prev = 0;
  for (let i = 0; i < 0.08 * SR; i++) {
    const n = rnd();
    add(m, start + i, (n - prev) * Math.exp(-(i / SR) * 60) * gain, pan);
    prev = n;
  }
}

export interface Voice {
  wave: 'saw' | 'square';
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  cutoff: number;
  /** Two voices detuned by ± this many cents, spread left and right. */
  detune?: number;
}

/** A note of `dur` seconds (plus its release), through a low-pass filter. */
export function note(m: Mix, t: number, dur: number, hz: number, gain: number, v: Voice) {
  const start = Math.round(t * SR);
  const len = Math.round((dur + v.release) * SR);
  const a = lowpass(v.cutoff);
  const voices = v.detune ? [-v.detune, v.detune] : [0];
  const level = (s: number) => (s < v.attack ? s / v.attack : v.sustain + (1 - v.sustain) * Math.exp(-(s - v.attack) / v.decay));
  voices.forEach((cents, k) => {
    const f = hz * 2 ** (cents / 1200);
    const pan = voices.length > 1 ? (k ? 0.6 : -0.6) : 0;
    let phase = k * 0.37;
    let y = 0;
    for (let i = 0; i < len; i++) {
      const s = i / SR;
      phase = (phase + f / SR) % 1;
      const osc = v.wave === 'saw' ? 2 * phase - 1 : phase < 0.5 ? 1 : -1;
      y += a * (osc - y);
      const env = s < dur ? level(s) : level(dur) * Math.exp(-(s - dur) / Math.max(v.release / 4, 0.001));
      add(m, start + i, (y * env * gain) / voices.length, pan);
    }
  });
}

/** Filtered noise opening up and growing over `dur` seconds. */
export function riser(m: Mix, t: number, dur: number, rnd: () => number, gain = 0.3) {
  const start = Math.round(t * SR);
  const len = Math.round(dur * SR);
  let y = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len;
    y += lowpass(200 * 40 ** p) * (rnd() - y);
    add(m, start + i, y * p * p * gain, Math.sin(p * 12) * 0.4);
  }
}

export function crash(m: Mix, t: number, rnd: () => number, gain = 0.2) {
  const start = Math.round(t * SR);
  let prev = 0;
  for (let i = 0; i < 2.2 * SR; i++) {
    const n = rnd();
    add(m, start + i, (n - prev) * Math.exp(-(i / SR) * 2.2) * gain, i % 2 ? 0.35 : -0.35);
    prev = n;
  }
}

/** Soft clipping, then the whole mix scaled to `peak`, with a fade out. */
export function master(m: Mix, peak = 0.89, fadeOut = 1.5) {
  let max = 0;
  for (const ch of [m.l, m.r]) {
    for (let i = 0; i < ch.length; i++) {
      ch[i] = Math.tanh(ch[i] * 1.2);
      max = Math.max(max, Math.abs(ch[i]));
    }
  }
  const g = max > 0 ? peak / max : 1;
  const fade = Math.round(fadeOut * SR);
  for (const ch of [m.l, m.r]) for (let i = 0; i < ch.length; i++) ch[i] *= g * Math.min(1, (ch.length - i) / fade);
}
