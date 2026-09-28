# Vidéo de présentation — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une vidéo Remotion de 82 s (1920×1080, 30 i/s) qui présente « CCM - Claude Code Manager », avec une musique électro générée par code.

**Architecture:** Un dossier `video/` autonome.

- `src/timeline.ts` : les plans, exprimés en mesures (120 BPM, une mesure = 60 images) ; la vidéo et la musique en dérivent toutes les deux.
- `music/` : synthèse pure en TypeScript (score testable → rendu → WAV).
- `src/ui/` : l'interface de l'app recréée en composants React sans logique de temps.
- `src/scenes/` : anime ces composants à partir de `useCurrentFrame`.

**Tech Stack:** Remotion 4.0.529 (`remotion`, `@remotion/cli`, `@remotion/google-fonts`), React 19, TypeScript ~6.0, Vitest 3, tsx.

**Spec:** `docs/superpowers/specs/2026-09-28-video-presentation-design.md`

## Global Constraints

- **Versions** : Remotion `4.0.529` (identique pour tous les paquets `@remotion/*`), React `^19.2.0`, TypeScript `~6.0.3`, Vitest `^3.2.7`.
- **Format** : 1920×1080, 30 i/s, 120 BPM, une mesure = 60 images, 41 mesures = 2 460 images = 82 s.
- **Textes** : en français, exactement ceux du script de la spec. Nom affiché : « CCM - Claude Code Manager ».
- **Visuel** :
  - couleurs et polices de l'app (Hanken Grotesk, JetBrains Mono) ;
  - le logo de l'app (fenêtres empilées + étincelle), jamais le logo officiel de Claude ;
  - données fictives uniquement.
- **Périmètre** :
  - `video/` n'entre ni dans le build, ni dans les tests, ni dans la CI de l'app ;
  - il suit le Prettier racine (`singleQuote`, `printWidth: 140`) ;
  - `video/out/` et `video/public/music.wav` ne sont pas commités.

## Review Focus

- **Polices pas encore chargées au moment d'une image** : le texte sortirait en police de secours. `loadFont` bloque le rendu jusqu'au chargement ; c'est vérifié sur les images fixes de la tâche 4 et suivantes.
- **Musique et vidéo de durées différentes** : l'audio serait coupé ou il y aurait un blanc. C'est testé dans `song.test.ts` (durée du rendu égale à `TOTAL_BARS × SECONDS_PER_BAR`).
- **Saturation** : pas de craquement, crête sous −1 dBFS ; testé dans `song.test.ts`.
- **Textes qui débordent** des cartes ou des boutons : relu sur les images fixes de chaque plan (tâches 4 à 7).
- **Coupe hors mesure** : le montage se décalerait de la musique. C'est testé dans `timeline.test.ts` (plans jointifs, chacun démarre sur un multiple de 60 images).

---

### Task 1: Projet `video/`, timeline et outils d'animation

**Files:**

- Create: `video/package.json`, `video/tsconfig.json`, `video/remotion.config.ts`, `video/.gitignore`
- Create: `video/src/timeline.ts`, `video/src/anim.ts`
- Test: `video/src/timeline.test.ts`, `video/src/anim.test.ts`

**Interfaces:**

- Produces:
  - `FPS`, `BPM`, `FRAMES_PER_BAR`, `SECONDS_PER_BAR`, `TOTAL_BARS`, `TOTAL_FRAMES` ;
  - `type SceneId`, `interface Scene`, `SCENES`, `TIMELINE: Placed[]` ;
  - `barOf(id): number`, `captionOf(id): string` ;
  - `BEAT`, `ramp`, `pop`, `typed`, `count`, `fr`.

- [ ] **Step 1: Créer le projet**

<!-- file: video/package.json -->

```json
{
  "name": "ccm-video",
  "private": true,
  "type": "module",
  "scripts": {
    "studio": "remotion studio src/index.ts",
    "music": "tsx music/generate.ts",
    "stills": "tsx scripts/stills.ts",
    "render": "npm run music && remotion render src/index.ts Presentation out/presentation.mp4 --codec=h264 --crf=18",
    "test": "vitest run",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@remotion/cli": "4.0.529",
    "@remotion/google-fonts": "4.0.529",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "remotion": "4.0.529"
  },
  "devDependencies": {
    "@types/node": "^20.19.0",
    "@types/react": "^19.2.0",
    "tsx": "^4.23.0",
    "typescript": "~6.0.3",
    "vitest": "^3.2.7"
  }
}
```

<!-- file: video/tsconfig.json -->

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src", "music", "scripts", "remotion.config.ts"]
}
```

<!-- file: video/remotion.config.ts -->

```ts
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
```

<!-- file: video/.gitignore -->

```
node_modules
out
public/music.wav
```

Run: `cd video && npm install`
Expected: installation sans erreur.

- [ ] **Step 2: Écrire les tests de la timeline et des outils**

<!-- file: video/src/timeline.test.ts -->

```ts
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
```

<!-- file: video/src/anim.test.ts -->

```ts
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
```

Run: `cd video && npx vitest run`
Expected: FAIL (modules `./timeline` et `./anim` introuvables).

- [ ] **Step 3: Écrire la timeline et les outils**

<!-- file: video/src/timeline.ts -->

```ts
// The script, in bars: the video and the music are both built from it.

export const FPS = 30;
export const BPM = 120;
const BEATS_PER_BAR = 4;
/** 2 s per bar at 120 BPM: 60 frames. */
export const FRAMES_PER_BAR = (FPS * 60 * BEATS_PER_BAR) / BPM;
export const SECONDS_PER_BAR = FRAMES_PER_BAR / FPS;

export type SceneId = 'intro' | 'chaos' | 'projects' | 'chat' | 'notify' | 'git' | 'launch' | 'stats' | 'remote' | 'outro';

export interface Scene {
  id: SceneId;
  bars: number;
  caption: string;
}

export const SCENES: readonly Scene[] = [
  { id: 'intro', bars: 3, caption: 'Tous tes Claude Code, dans une seule fenêtre.' },
  { id: 'chaos', bars: 3, caption: '5 projets. 12 agents. 30 terminaux ?' },
  { id: 'projects', bars: 5, caption: 'Un onglet par projet. Autant d’agents que tu veux.' },
  { id: 'chat', bars: 5, caption: 'Un vrai chat. Des questions en un clic.' },
  { id: 'notify', bars: 4, caption: 'Il attend ta réponse ? Tu le sais tout de suite.' },
  { id: 'git', bars: 5, caption: 'Chaque modif, chaque branche, sous tes yeux.' },
  { id: 'launch', bars: 4, caption: 'Lance ton projet d’un clic. Vois quand ça plante.' },
  { id: 'stats', bars: 4, caption: 'Tokens, coût, quotas : en direct.' },
  { id: 'remote', bars: 4, caption: 'Et depuis ton téléphone.' },
  { id: 'outro', bars: 4, caption: 'Gratuit, open source, pour Windows.' },
];

export interface Placed extends Scene {
  startBar: number;
  from: number;
  durationInFrames: number;
}

export const TIMELINE: readonly Placed[] = SCENES.reduce<Placed[]>((list, s) => {
  const startBar = list.length ? list[list.length - 1].startBar + list[list.length - 1].bars : 0;
  return [...list, { ...s, startBar, from: startBar * FRAMES_PER_BAR, durationInFrames: s.bars * FRAMES_PER_BAR }];
}, []);

export const TOTAL_BARS = SCENES.reduce((n, s) => n + s.bars, 0);
export const TOTAL_FRAMES = TOTAL_BARS * FRAMES_PER_BAR;

const scene = (id: SceneId) => TIMELINE.find((s) => s.id === id)!;
export const barOf = (id: SceneId) => scene(id).startBar;
export const captionOf = (id: SceneId) => scene(id).caption;
```

<!-- file: video/src/anim.ts -->

```ts
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
```

- [ ] **Step 4: Lancer les tests**

Run: `cd video && npx vitest run && npx tsc --noEmit`
Expected: PASS, aucune erreur de type.

- [ ] **Step 5: Commit**

```bash
git add video/package.json video/package-lock.json video/tsconfig.json video/remotion.config.ts video/.gitignore video/src/timeline.ts video/src/timeline.test.ts video/src/anim.ts video/src/anim.test.ts
git commit -m "feat(video): Remotion project, timeline in bars and animation helpers"
```

---

### Task 2: Musique générée par code

**Files:**

- Create: `video/music/wav.ts`, `video/music/synth.ts`, `video/music/song.ts`, `video/music/generate.ts`
- Test: `video/music/wav.test.ts`, `video/music/song.test.ts`

**Interfaces:**

- Consumes: `barOf`, `SECONDS_PER_BAR`, `TOTAL_BARS` (task 1).
- Produces :
  - `encodeWav(l, r, sampleRate): Uint8Array` ;
  - `SR` ;
  - `score(): Score` ;
  - `render(score?): Mix` avec `interface Mix { l: Float32Array; r: Float32Array }` ;
  - le fichier `video/public/music.wav`.

- [ ] **Step 1: Écrire les tests**

<!-- file: video/music/wav.test.ts -->

```ts
import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';

describe('encodeWav', () => {
  it('writes a 16-bit stereo PCM file', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), new Float32Array([0.5, 2, -2]), 44100);
    const v = new DataView(wav.buffer);
    const text = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(3 * 4);
    expect(wav.length).toBe(44 + 12);
    // Interleaved left/right, clamped to [-1, 1].
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true), v.getInt16(54, true)]).toEqual([
      0, 16384, 32767, 32767, -32767,
    ]);
  });
});
```

<!-- file: video/music/song.test.ts -->

```ts
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
```

Run: `cd video && npx vitest run music`
Expected: FAIL (modules introuvables).

- [ ] **Step 2: Écrire l'encodeur WAV et la synthèse**

<!-- file: video/music/wav.ts -->

```ts
const toInt16 = (x: number) => Math.round(Math.max(-1, Math.min(1, x)) * 32767);

/** A 16-bit PCM stereo WAV file from samples in [-1, 1]. */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array {
  const data = left.length * 4;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, data, true);
  for (let i = 0; i < left.length; i++) {
    v.setInt16(44 + i * 4, toInt16(left[i]), true);
    v.setInt16(46 + i * 4, toInt16(right[i]), true);
  }
  return new Uint8Array(buf);
}
```

<!-- file: video/music/synth.ts -->

```ts
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
```

- [ ] **Step 3: Écrire le morceau et le générateur**

<!-- file: video/music/song.ts -->

```ts
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
```

<!-- file: video/music/generate.ts -->

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { render } from './song';
import { SR } from './synth';
import { encodeWav } from './wav';

const m = render();
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/music.wav', import.meta.url), encodeWav(m.l, m.r, SR));
console.log(`public/music.wav: ${(m.l.length / SR).toFixed(1)} s`);
```

- [ ] **Step 4: Lancer les tests et générer la piste**

Run: `cd video && npx vitest run && npx tsc --noEmit && npm run music`
Expected: PASS ; `public/music.wav: 82.0 s`.

- [ ] **Step 5: Commit**

```bash
git add video/music
git commit -m "feat(video): a code-generated electro track, arranged on the script"
```

---

### Task 3: L'interface recréée (thème, données, composants) et une planche de contrôle

**Files:**

- Create: `video/src/theme.ts`, `video/src/data.ts`
- Create (dans `video/src/ui/`) :
  - `Logo.tsx`, `Stage.tsx`, `Shell.tsx`, `Sidebar.tsx`, `Chat.tsx`, `Git.tsx`, `Runs.tsx` ;
  - `Toast.tsx`, `Keys.tsx`, `Stats.tsx`, `Phone.tsx`, `TermWindow.tsx`, `Cursor.tsx`.
- Create: `video/src/Gallery.tsx`, `video/src/Root.tsx`, `video/src/index.ts`

**Interfaces:**

- Consumes: `captionOf`, `pop`, `fr` (task 1).
- Produces (props exactes ci-dessous) :
  - `C`, `UI`, `MONO`, `hue`, `soft` ;
  - `TABS`, `AGENTS`, `STATUS`, `EMPTY_STATUS` ;
  - `Logo`, `Stage`, `Caption`, `AppWindow`, `Shell`, `Dot` ;
  - `AgentCard`, `AgentsSidebar`, `SectionHead` ;
  - `ConvHeader`, `Conversation`, `UserMsg`, `AssistantMsg`, `ToolCall`, `Diffstat`, `QuestionCard` ;
  - `FilesPanel`, `DiffPane`, `GitGraph`, `COMMITS` ;
  - `RunsSection`, `LogView` ;
  - `WinToast`, `AppToast`, `Keys`, `StatsView`, `Phone`, `TermWindow`, `Cursor`.

- [ ] **Step 1: Thème et données**

<!-- file: video/src/theme.ts -->

```ts
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
```

<!-- file: video/src/data.ts -->

```ts
// Demo data: made-up projects and agents.

import type { AgentInfo } from './ui/Sidebar';
import type { Status, Tab } from './ui/Shell';

export const TABS: Tab[] = [
  { name: 'demo-api', hue: 48, delta: 7, running: true },
  { name: 'studio-web', hue: 300, delta: 3 },
  { name: 'mobile-app', hue: 200, delta: 12, running: true },
  { name: 'infra', hue: 150 },
];

export const AGENTS: AgentInfo[] = [
  { name: 'refacto-auth', status: 'running', model: 'Opus', time: '12m 40s', tokens: '184 k', cost: '2,41 $', files: 6 },
  { name: 'tests-e2e', status: 'running', model: 'Sonnet', time: '8m 02s', tokens: '96 k', cost: '0,73 $', files: 3 },
  { name: 'pagination-users', status: 'running', model: 'Sonnet', time: '3m 15s', tokens: '41 k', cost: '0,32 $', files: 2 },
  { name: 'docs-api', status: 'done', model: 'Haiku', time: '1m 50s', tokens: '12 k', cost: '0,02 $', files: 1 },
  { name: 'fix-login', status: 'idle', model: 'Fable', time: '0m 00s', tokens: '0', cost: '0,00 $', files: 0 },
];

export const STATUS: Status = { active: 3, waiting: 0, done: 1, session: 22, weekly: 36, cost: 3.48, estimated: true };
export const EMPTY_STATUS: Status = { active: 0, waiting: 0, done: 0, session: 0, weekly: 0, cost: 0 };
```

- [ ] **Step 2: Logo, scène et cadre de l'app**

<!-- file: video/src/ui/Logo.tsx -->

```tsx
import type { FC } from 'react';
import { C } from '../theme';

/** The app logo. `stack` reveals the back, middle and front windows, `spark` the spark (0 to 1). */
export const Logo: FC<{ size: number; stack?: [number, number, number]; spark?: number; spin?: number }> = ({
  size,
  stack = [1, 1, 1],
  spark = 1,
  spin = 0,
}) => {
  const [back, mid, front] = stack;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
      <rect
        x="26"
        y="8"
        width="66"
        height="66"
        rx="14"
        fill="none"
        stroke={C.spark}
        strokeOpacity={0.35 * Math.min(1, back)}
        strokeWidth="5"
        transform={`translate(${(1 - back) * -18} ${(1 - back) * 18})`}
      />
      <rect
        x="17"
        y="17"
        width="66"
        height="66"
        rx="14"
        fill="none"
        stroke={C.spark}
        strokeOpacity={0.6 * Math.min(1, mid)}
        strokeWidth="5"
        transform={`translate(${(1 - mid) * -9} ${(1 - mid) * 9})`}
      />
      <rect
        x="8"
        y="26"
        width="66"
        height="66"
        rx="14"
        fill="#1b1512"
        stroke={C.spark}
        strokeWidth="5"
        opacity={Math.min(1, front)}
        transform={`translate(41 59) scale(${0.6 + 0.4 * front}) translate(-41 -59)`}
      />
      <g transform={`translate(41 59) rotate(${(1 - spark) * -120 + spin}) scale(${Math.max(0, spark)})`} stroke={C.spark} strokeLinecap="round">
        <path d="M0 -20V20M-20 0H20" strokeWidth="6.2" />
        <path d="M-11.8 -11.8L11.8 11.8M-11.8 11.8L11.8 -11.8" strokeWidth="5" />
      </g>
    </svg>
  );
};
```

<!-- file: video/src/ui/Stage.tsx -->

```tsx
import type { FC, ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { pop } from '../anim';
import { C, UI } from '../theme';

/** The backdrop of every scene: dark, with a warm glow. */
export const Stage: FC<{ children?: ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(1300px 760px at 50% 62%, color-mix(in oklch, ${C.spark} 13%, ${C.bg}), ${C.bg} 72%)`,
      fontFamily: UI,
      color: C.text,
      overflow: 'hidden',
    }}
  >
    {children}
  </AbsoluteFill>
);

/** The scene's text, word by word. */
export const Caption: FC<{ text: string; delay?: number; top?: number; size?: number }> = ({ text, delay = 4, top = 62, size = 50 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, textAlign: 'center', fontSize: size, fontWeight: 700, letterSpacing: -0.5 }}>
      {text.split(' ').map((w, i) => {
        const p = pop(frame, fps, delay + i * 3, 16);
        return (
          <span key={i} style={{ display: 'inline-block', margin: '0 0.13em', opacity: Math.min(1, p), transform: `translateY(${(1 - p) * 28}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** The app's window on the stage (1500×844, under the caption). */
export const AppWindow: FC<{ enter?: number; x?: number; scale?: number; children: ReactNode }> = ({ enter = 1, x = 0, scale = 1, children }) => (
  <div
    style={{
      position: 'absolute',
      left: 210 + x,
      top: 190,
      width: 1500,
      height: 844,
      opacity: Math.min(1, enter),
      transform: `scale(${scale * (0.9 + 0.1 * Math.min(1, enter))})`,
      transformOrigin: '50% 50%',
    }}
  >
    {children}
  </div>
);
```

<!-- file: video/src/ui/Shell.tsx -->

```tsx
import type { FC, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { fr } from '../anim';
import { C, hue, MONO, soft, UI } from '../theme';
import { Logo } from './Logo';

export interface Tab {
  name: string;
  hue: number;
  delta?: number;
  waiting?: number;
  running?: boolean;
  /** Appearance, 0 to 1. */
  enter?: number;
}

export interface Status {
  active: number;
  waiting: number;
  done: number;
  /** Quotas, in %. */
  session: number;
  weekly: number;
  cost: number;
  estimated?: boolean;
}

export const Dot: FC<{ color: string; size?: number; pulse?: boolean }> = ({ color, size = 8, pulse }) => {
  const frame = useCurrentFrame();
  const k = pulse ? (frame % 30) / 30 : 0;
  return (
    <span
      style={{
        display: 'inline-block',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: pulse ? `0 0 0 ${k * 7}px ${soft(color, (1 - k) * 45)}` : 'none',
      }}
    />
  );
};

const TitleBar: FC<{ tabs: Tab[]; active: number }> = ({ tabs, active }) => {
  const frame = useCurrentFrame();
  return (
    <header
      style={{
        height: 48,
        flex: 'none',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 4,
        padding: '0 14px',
        background: C.bar,
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div style={{ alignSelf: 'center', paddingRight: 12, display: 'flex' }}>
        <Logo size={26} />
      </div>
      {tabs.map((t, i) => {
        const e = t.enter ?? 1;
        if (e <= 0) return null;
        const on = i === active;
        return (
          <div
            key={t.name}
            style={{
              height: 38,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '0 15px',
              borderRadius: '9px 9px 0 0',
              background: on ? C.bg : 'transparent',
              border: `1px solid ${on ? C.line2 : 'transparent'}`,
              borderBottom: 'none',
              fontSize: 15,
              fontWeight: 600,
              color: on ? C.text : C.muted,
              opacity: Math.min(1, e),
              transform: `translateY(${(1 - e) * 20}px)`,
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 3, background: hue(t.hue) }} />
            {t.name}
            {t.running ? <Dot color={C.ok} size={6} /> : null}
            {t.delta ? (
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, background: C.elev, padding: '1px 6px', borderRadius: 4 }}>
                Δ {t.delta}
              </span>
            ) : null}
            {t.waiting ? (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#1b1512',
                  background: C.wait,
                  borderRadius: 9,
                  padding: '0 7px',
                  boxShadow: `0 0 0 ${3 + 3 * Math.sin(frame / 4)}px ${soft(C.wait, 30)}`,
                }}
              >
                {t.waiting}
              </span>
            ) : null}
          </div>
        );
      })}
      <div style={{ width: 30, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 20 }}>+</div>
      <div style={{ flex: 1 }} />
      <div style={{ alignSelf: 'center', display: 'flex', gap: 24, color: C.muted, fontSize: 14, fontFamily: UI }}>
        <span>Stats</span>
        <span>—</span>
        <span>☐</span>
        <span>✕</span>
      </div>
    </header>
  );
};

const Quota: FC<{ label: string; pct: number }> = ({ label, pct }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    {label}
    <span style={{ width: 80, height: 6, borderRadius: 3, background: C.elev2, overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: C.spark }} />
    </span>
    <b style={{ color: C.text }}>{Math.round(pct)} %</b>
  </span>
);

const StatusBar: FC<Status & { glow: number }> = ({ active, waiting, done, session, weekly, cost, estimated, glow }) => (
  <footer
    style={{
      height: 34,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      padding: '0 18px',
      borderTop: `1px solid ${C.line}`,
      background: C.bar,
      fontFamily: MONO,
      fontSize: 13,
      color: C.muted,
      boxShadow: glow ? `inset 0 0 0 2px ${soft(C.spark, 80 * glow)}, 0 0 ${40 * glow}px ${soft(C.spark, 40 * glow)}` : 'none',
    }}
  >
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Dot color={C.ok} /> {active} actif
    </span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Dot color={C.wait} /> {waiting} en attente
    </span>
    <span>
      <span style={{ color: C.ok }}>✓</span> {done} terminé
    </span>
    <span style={{ color: C.line2 }}>|</span>
    <Quota label="Session 5 h" pct={session} />
    <Quota label="Hebdo" pct={weekly} />
    <span style={{ color: C.line2 }}>|</span>
    <span>
      Aujourd'hui{' '}
      <b style={{ color: C.text }}>
        {estimated ? '≈ ' : ''}
        {fr(cost)} $
      </b>
    </span>
  </footer>
);

/** The app: tabs, sidebar, main area, status bar. */
export const Shell: FC<{
  tabs: Tab[];
  active?: number;
  sidebar?: ReactNode;
  children?: ReactNode;
  status: Status;
  glowStatus?: number;
}> = ({ tabs, active = 0, sidebar, children, status, glowStatus = 0 }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      borderRadius: 14,
      overflow: 'hidden',
      background: C.bg,
      border: `1px solid ${C.line2}`,
      boxShadow: '0 40px 120px rgba(0, 0, 0, 0.6)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: UI,
      color: C.text,
    }}
  >
    <TitleBar tabs={tabs} active={active} />
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {sidebar !== undefined ? (
        <aside
          style={{
            width: 300,
            flex: 'none',
            background: C.panel,
            borderRight: `1px solid ${C.line}`,
            display: 'flex',
            flexDirection: 'column',
            padding: '12px 10px',
            gap: 6,
          }}
        >
          {sidebar}
        </aside>
      ) : null}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>{children}</main>
    </div>
    <StatusBar {...status} glow={glowStatus} />
  </div>
);
```

- [ ] **Step 3: Barre latérale, chat et git**

<!-- file: video/src/ui/Sidebar.tsx -->

```tsx
import type { FC, ReactNode } from 'react';
import { C, MONO, soft } from '../theme';
import { Dot } from './Shell';

export type AgentStatus = 'running' | 'waiting' | 'idle' | 'done' | 'error';

export interface AgentInfo {
  name: string;
  status: AgentStatus;
  model: string;
  time: string;
  tokens: string;
  cost: string;
  files: number;
}

const LABEL: Record<AgentStatus, string> = { running: 'En cours', waiting: 'Question', idle: 'Prêt', done: 'Terminé', error: 'Erreur' };
const COLOR: Record<AgentStatus, string> = { running: C.ok, waiting: C.wait, idle: C.dim, done: C.ok, error: C.del };

export const SectionHead: FC<{ label: string; count?: string; action?: ReactNode }> = ({ label, count, action }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 8px' }}>
    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>{label}</span>
    {count ? <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>{count}</span> : null}
    <div style={{ flex: 1 }} />
    {action}
  </div>
);

export const Button: FC<{ children: ReactNode; pressed?: number; accent?: boolean }> = ({ children, pressed = 0, accent }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 28,
      padding: '0 11px',
      borderRadius: 6,
      border: `1px solid ${accent ? C.spark : C.line2}`,
      background: pressed ? soft(C.spark, 30 * pressed) : C.elev,
      fontSize: 13,
      fontWeight: 600,
      transform: `scale(${1 - 0.06 * pressed})`,
    }}
  >
    {children}
  </span>
);

export const AgentCard: FC<AgentInfo & { selected?: boolean; enter?: number; ring?: boolean }> = ({
  name,
  status,
  model,
  time,
  tokens,
  cost,
  files,
  selected,
  enter = 1,
  ring,
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      padding: '11px 12px',
      borderRadius: 10,
      border: `1px solid ${selected ? C.line2 : 'transparent'}`,
      background: selected ? C.elev : 'transparent',
      opacity: Math.min(1, enter),
      transform: `translateX(${(1 - enter) * -40}px)`,
      boxShadow: ring ? `0 0 0 2px ${soft(C.wait, 70)}, 0 0 28px ${soft(C.wait, 35)}` : 'none',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <Dot color={COLOR[status]} pulse={status === 'running' || status === 'waiting'} />
      <span style={{ flex: 1, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      {status === 'waiting' ? (
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1b1512', background: C.wait, borderRadius: 9, padding: '1px 8px' }}>Question</span>
      ) : (
        <span style={{ fontSize: 12, color: COLOR[status] }}>{LABEL[status]}</span>
      )}
    </div>
    <div style={{ display: 'flex', gap: 10, paddingLeft: 17, fontFamily: MONO, fontSize: 12, color: C.muted }}>
      <span>{model}</span>
      <span style={{ color: C.dim }}>·</span>
      <span>{time}</span>
    </div>
    <div style={{ display: 'flex', gap: 10, paddingLeft: 17, fontFamily: MONO, fontSize: 12, color: C.dim }}>
      <span>{tokens} tok</span>
      <span>{cost}</span>
      <span>{files} fich.</span>
    </div>
  </div>
);

/** The "Agents" section: its head, then one card per agent. */
export const AgentsSidebar: FC<{ agents: AgentInfo[]; selected?: string | null; enters?: number[]; ring?: string }> = ({
  agents,
  selected,
  enters,
  ring,
}) => (
  <>
    <SectionHead label="Agents" count={String(agents.length)} action={<Button>+ Nouvel agent</Button>} />
    {agents.map((a, i) => (
      <AgentCard key={a.name} {...a} selected={a.name === selected} enter={enters?.[i] ?? 1} ring={a.name === ring} />
    ))}
  </>
);
```

<!-- file: video/src/ui/Chat.tsx -->

```tsx
import type { FC, ReactNode } from 'react';
import { C, MONO, soft } from '../theme';
import { Cursor } from './Cursor';
import { Dot } from './Shell';

/** Text with `inline code`. */
const Rich: FC<{ text: string }> = ({ text }) => (
  <>
    {text.split('`').map((part, i) =>
      i % 2 ? (
        <code key={i} style={{ fontFamily: MONO, fontSize: '0.86em', background: C.elev2, padding: '1px 6px', borderRadius: 4 }}>
          {part}
        </code>
      ) : (
        <span key={i}>{part}</span>
      ),
    )}
  </>
);

export const ConvHeader: FC<{ name: string; status: 'running' | 'waiting' | 'done'; sub: string }> = ({ name, status, sub }) => (
  <div style={{ height: 64, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', borderBottom: `1px solid ${C.line}` }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: status === 'waiting' ? C.wait : C.ok }}>
          <Dot color={status === 'waiting' ? C.wait : C.ok} size={7} pulse={status !== 'done'} />
          {status === 'running' ? 'En cours' : status === 'waiting' ? 'Question' : 'Terminé'}
        </span>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>{sub}</span>
    </div>
  </div>
);

export const Conversation: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 14, padding: '22px 36px' }}>{children}</div>
);

/** Appearance of a message: fades and slides up. */
const enterStyle = (e: number) => ({ opacity: Math.min(1, e), transform: `translateY(${(1 - Math.min(1, e)) * 16}px)` });

export const UserMsg: FC<{ text: string; tag?: string; enter?: number }> = ({ text, tag, enter = 1 }) =>
  enter <= 0 ? null : (
    <div style={{ alignSelf: 'flex-end', maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, ...enterStyle(enter) }}>
      <div style={{ background: C.user, borderRadius: 14, padding: '11px 16px', fontSize: 17, lineHeight: 1.45 }}>
        <Rich text={text} />
      </div>
      {tag ? <span style={{ fontSize: 12, color: C.info }}>{tag}</span> : null}
    </div>
  );

export const AssistantMsg: FC<{ text: string }> = ({ text }) =>
  text ? (
    <div style={{ fontSize: 17, lineHeight: 1.55, maxWidth: '88%' }}>
      <Rich text={text} />
    </div>
  ) : null;

export const Diffstat: FC<{ add: number; del: number }> = ({ add, del }) => (
  <span style={{ fontFamily: MONO, fontSize: 13 }}>
    <span style={{ color: C.ok }}>+{add}</span> <span style={{ color: C.del }}>−{del}</span>
  </span>
);

const GLYPH: Record<string, string> = { Read: '◇', Edit: '✎', Bash: '$', Grep: '⌕', Write: '+' };

export const ToolCall: FC<{ tool: string; target: string; meta?: ReactNode; running?: boolean; enter?: number }> = ({
  tool,
  target,
  meta,
  running,
  enter = 1,
}) =>
  enter <= 0 ? null : (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 40,
        padding: '0 14px',
        borderRadius: 8,
        border: `1px solid ${C.line}`,
        background: soft(C.elev, 60),
        fontSize: 14,
        ...enterStyle(enter),
      }}
    >
      <span style={{ width: 18, textAlign: 'center', color: C.spark, fontFamily: MONO }}>{GLYPH[tool] ?? '•'}</span>
      <b>{tool}</b>
      <span style={{ fontFamily: MONO, fontSize: 13, color: C.muted }}>{target}</span>
      <div style={{ flex: 1 }} />
      {meta}
      {running ? <Dot color={C.ok} size={7} pulse /> : <span style={{ color: C.ok }}>✓</span>}
    </div>
  );

/** Claude's question, its options; `cursor` moves the pointer from afar onto option `target` (t: 0 to 1), then clicks. */
export const QuestionCard: FC<{
  question: string;
  options: string[];
  picked?: number | null;
  enter?: number;
  cursor?: { target: number; t: number; click: number };
}> = ({ question, options, picked = null, enter = 1, cursor }) =>
  enter <= 0 ? null : (
    <div
      style={{
        position: 'relative',
        borderRadius: 12,
        border: `1px solid ${soft(C.wait, 60)}`,
        background: soft(C.wait, 7),
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        ...enterStyle(enter),
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.wait }}>Question de Claude</span>
      <span style={{ fontSize: 18, fontWeight: 600 }}>{question}</span>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        {options.map((o, i) => (
          <span
            key={o}
            style={{
              minWidth: 120,
              height: 40,
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: `1px solid ${picked === i ? C.spark : C.line2}`,
              background: picked === i ? C.spark : cursor && cursor.target === i && cursor.t >= 1 ? C.elev2 : C.elev,
              color: picked === i ? '#1b1512' : C.text,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {o}
          </span>
        ))}
      </div>
      {cursor ? <Cursor x={18 + cursor.target * 130 + 70 + (1 - cursor.t) * 320} y={112 + (1 - cursor.t) * 140} click={cursor.click} /> : null}
    </div>
  );
```

<!-- file: video/src/ui/Cursor.tsx -->

```tsx
import type { FC } from 'react';
import { soft } from '../theme';

/** A mouse pointer at (x, y); `click` (0 to 1) draws its ripple. */
export const Cursor: FC<{ x: number; y: number; click?: number }> = ({ x, y, click = 0 }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, zIndex: 10 }}>
    {click > 0 && click < 1 ? (
      <span
        style={{
          position: 'absolute',
          left: -26 * click,
          top: -26 * click,
          width: 52 * click,
          height: 52 * click,
          borderRadius: '50%',
          border: `3px solid ${soft('#ffffff', (1 - click) * 90)}`,
        }}
      />
    ) : null}
    <svg width="26" height="32" viewBox="0 0 26 32" style={{ position: 'absolute', left: -3, top: -2, filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))' }}>
      <path d="M3 2 L3 26 L9 20 L13 30 L17 28 L13 18 L22 18 Z" fill="#ffffff" stroke="#1b1512" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  </div>
);
```

<!-- file: video/src/ui/Git.tsx -->

```tsx
import type { FC } from 'react';
import { C, MONO, soft } from '../theme';
import { Diffstat } from './Chat';

export const FilesPanel: FC<{ tab: 'files' | 'history'; files: { path: string; add: number; del: number }[]; selected: number }> = ({
  tab,
  files,
  selected,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <div style={{ display: 'flex', gap: 18, padding: '14px 18px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 14, fontWeight: 600 }}>
      <span style={{ color: tab === 'files' ? C.text : C.dim, borderBottom: tab === 'files' ? `2px solid ${C.spark}` : 'none', paddingBottom: 6 }}>
        Non commités {files.length}
      </span>
      <span style={{ color: tab === 'history' ? C.text : C.dim, borderBottom: tab === 'history' ? `2px solid ${C.spark}` : 'none', paddingBottom: 6 }}>
        Historique
      </span>
    </div>
    {tab === 'files'
      ? files.map((f, i) => (
          <div
            key={f.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: '0 10px',
              padding: '7px 10px',
              borderRadius: 6,
              background: i === selected ? C.elev : 'transparent',
              fontFamily: MONO,
              fontSize: 13,
            }}
          >
            <span style={{ color: C.wait }}>M</span>
            <span style={{ flex: 1 }}>{f.path}</span>
            <Diffstat add={f.add} del={f.del} />
          </div>
        ))
      : null}
  </div>
);

export interface DiffRow {
  kind: 'ctx' | 'chg' | 'add';
  l?: string;
  r?: string;
}

/** A side-by-side diff; `shown` rows are visible. */
export const DiffPane: FC<{ rows: DiffRow[]; shown: number; start: number }> = ({ rows, shown, start }) => (
  <div style={{ margin: '10px 14px', borderRadius: 8, border: `1px solid ${C.line}`, overflow: 'hidden', fontFamily: MONO, fontSize: 12.5 }}>
    {rows.slice(0, shown).map((row, i) => (
      <div key={i} style={{ display: 'flex', minHeight: 24 }}>
        {(['l', 'r'] as const).map((side) => {
          const text = row[side];
          const bg =
            row.kind === 'ctx' || text === undefined ? 'transparent' : side === 'l' ? soft(C.del, row.kind === 'chg' ? 16 : 0) : soft(C.ok, 16);
          return (
            <div key={side} style={{ flex: 1, display: 'flex', background: bg, borderLeft: side === 'r' ? `1px solid ${C.line}` : 'none' }}>
              <span style={{ width: 34, textAlign: 'right', paddingRight: 8, color: C.dim }}>{text === undefined ? '' : start + i}</span>
              <span style={{ whiteSpace: 'pre', color: C.text }}>{text ?? ''}</span>
            </div>
          );
        })}
      </div>
    ))}
  </div>
);

export interface Commit {
  lane: number;
  msg: string;
  hash: string;
  refs?: string[];
}

/** Newest first. Lane 0: main; lane 1: the agent's branch; lane 2: another agent. */
export const COMMITS: Commit[] = [
  { lane: 0, msg: 'Merge ccm/pagination-users', hash: 'f1a07b3', refs: ['main'] },
  { lane: 1, msg: 'Pagination de /users (limit, curseur)', hash: 'a3f9c21', refs: ['ccm/pagination-users'] },
  { lane: 1, msg: 'Tests de la pagination', hash: '7be01d4' },
  { lane: 0, msg: 'Corrige le login OAuth', hash: '19ce8a0' },
  { lane: 2, msg: 'Docs : endpoints v2', hash: 'c04d7f2', refs: ['ccm/docs-api'] },
  { lane: 1, msg: 'Prépare le modèle User', hash: '5d2e9ab' },
  { lane: 0, msg: 'Release 1.4.0', hash: 'e8a1f30', refs: ['v1.4.0'] },
];

const LANE = [C.muted, C.spark, 'oklch(0.72 0.12 200)'];

/** The git graph; rows before `from` (the merge) are hidden, `shown` rows appear from there. */
export const GitGraph: FC<{ commits: Commit[]; from: number; shown: number; highlight: number }> = ({ commits, from, shown, highlight }) => {
  const rows = commits.slice(from, from + shown);
  const y = (i: number) => 26 + i * 50;
  const x = (lane: number) => 28 + lane * 30;
  const last = commits.length - 1 - from;
  const lanes = [0, 1, 2].map((lane) => rows.map((c, i) => (c.lane === lane ? i : -1)).filter((i) => i >= 0));
  return (
    <div style={{ position: 'relative', margin: '8px 14px' }}>
      <svg width="120" height={y(Math.max(rows.length, 1))} style={{ position: 'absolute', left: 0, top: 0 }}>
        {lanes.map((idx, lane) => {
          if (!idx.length) return null;
          const top = lane === 0 ? 0 : idx[0];
          const bottom = lane === 0 ? rows.length - 1 : Math.min(idx[idx.length - 1] + 1, last);
          const color = lane === highlight ? C.spark : LANE[lane];
          const width = lane === highlight ? 4 : 2.5;
          return (
            <g key={lane} stroke={color} strokeWidth={width} fill="none">
              <line x1={x(lane)} y1={y(top)} x2={x(lane)} y2={y(Math.max(top, bottom - (lane ? 1 : 0)))} />
              {lane && bottom <= rows.length - 1 ? (
                <path d={`M${x(lane)} ${y(bottom - 1)} C ${x(lane)} ${y(bottom) - 10}, ${x(0)} ${y(bottom) - 30}, ${x(0)} ${y(bottom)}`} />
              ) : null}
            </g>
          );
        })}
        {from === 0 && rows.length > 1 ? (
          <path d={`M${x(1)} ${y(1)} C ${x(1)} ${y(0) + 20}, ${x(0)} ${y(0) + 30}, ${x(0)} ${y(0)}`} stroke={C.spark} strokeWidth={4} fill="none" />
        ) : null}
        {rows.map((c, i) => (
          <circle key={c.hash} cx={x(c.lane)} cy={y(i)} r={c.lane === highlight ? 8 : 6.5} fill={C.bg} stroke={c.lane === highlight ? C.spark : LANE[c.lane]} strokeWidth={3} />
        ))}
      </svg>
      <div style={{ paddingLeft: 120 }}>
        {rows.map((c) => (
          <div key={c.hash} style={{ height: 50, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            {c.refs?.map((r) => (
              <span
                key={r}
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: r.startsWith('ccm/pagination') ? soft(C.spark, 25) : C.elev2,
                  color: r.startsWith('ccm/pagination') ? C.spark : C.muted,
                }}
              >
                {r}
              </span>
            ))}
            <span style={{ color: c.lane === highlight ? C.text : C.muted, fontWeight: c.lane === highlight ? 600 : 400 }}>{c.msg}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>{c.hash}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Lancement, notifications, touches, stats, téléphone, terminaux**

<!-- file: video/src/ui/Runs.tsx -->

```tsx
import type { FC } from 'react';
import { C, MONO } from '../theme';
import { Cursor } from './Cursor';
import { Dot } from './Shell';
import { Button, SectionHead } from './Sidebar';

export type RunStatus = 'ready' | 'running' | 'crashed';

export interface Run {
  name: string;
  status: RunStatus;
  code?: number;
}

const LABEL = (r: Run) => (r.status === 'ready' ? 'prêt' : r.status === 'running' ? 'en cours' : `planté (code ${r.code})`);
const COLOR: Record<RunStatus, string> = { ready: C.dim, running: C.ok, crashed: C.del };

/** The "Lancement" section; `cursor` moves the pointer onto its button (t: 0 to 1), then clicks. */
export const RunsSection: FC<{ runs: Run[]; selected?: number; pressed?: number; cursor?: { t: number; click: number }; glow?: number }> = ({
  runs,
  selected,
  pressed = 0,
  cursor,
  glow = 0,
}) => {
  const running = runs.filter((r) => r.status === 'running').length;
  return (
    <div
      style={{
        position: 'relative',
        borderTop: `1px solid ${C.line}`,
        marginTop: 6,
        paddingTop: 6,
        borderRadius: 10,
        boxShadow: glow ? `0 0 0 2px rgba(217, 119, 87, ${0.7 * glow}), 0 0 40px rgba(217, 119, 87, ${0.3 * glow})` : 'none',
      }}
    >
      <SectionHead
        label="Lancement"
        count={`${running}/${runs.length}`}
        action={<Button pressed={pressed}>{running ? 'Tout arrêter' : 'Tout lancer'}</Button>}
      />
      {runs.map((r, i) => (
        <div
          key={r.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            height: 36,
            padding: '0 10px 0 12px',
            borderRadius: 6,
            background: i === selected ? C.elev : 'transparent',
            border: `1px solid ${i === selected ? C.line2 : 'transparent'}`,
          }}
        >
          <Dot color={COLOR[r.status]} size={7} pulse={r.status === 'running'} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{r.name}</span>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: COLOR[r.status] }}>{LABEL(r)}</span>
          <span style={{ width: 16, color: r.status === 'running' ? C.muted : C.ok, fontSize: 11 }}>{r.status === 'running' ? '■' : '▶'}</span>
        </div>
      ))}
      {cursor ? <Cursor x={236 - (1 - cursor.t) * 200} y={22 + (1 - cursor.t) * 180} click={cursor.click} /> : null}
    </div>
  );
};

/** A read-only log, as in the app's launch terminals. */
export const LogView: FC<{ lines: string[]; title: string; status: string; statusColor: string }> = ({ lines, title, status, statusColor }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <div style={{ height: 64, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, padding: '2px 7px', borderRadius: 4, background: C.elev2, color: C.info }}>PowerShell</span>
      <span style={{ fontFamily: MONO, fontSize: 13, color: statusColor, fontWeight: 600 }}>{status}</span>
    </div>
    <div style={{ flex: 1, background: C.term, padding: '16px 22px', fontFamily: MONO, fontSize: 15, lineHeight: 1.6, color: '#d8d0c4', whiteSpace: 'pre' }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: l.startsWith('$') ? C.dim : l.includes('ready') ? '#9bd8a9' : undefined }}>
          {l || ' '}
        </div>
      ))}
    </div>
  </div>
);
```

<!-- file: video/src/ui/Toast.tsx -->

```tsx
import type { FC } from 'react';
import { C, soft, UI } from '../theme';
import { Logo } from './Logo';

/** A Windows notification, at the bottom right of the screen. `enter` slides it in (0 to 1). */
export const WinToast: FC<{ title: string; body: string; enter: number }> = ({ title, body, enter }) => (
  <div
    style={{
      position: 'absolute',
      right: 36,
      bottom: 36,
      width: 460,
      padding: '16px 18px',
      borderRadius: 10,
      background: '#2b2b2b',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
      transform: `translateX(${(1 - enter) * 540}px)`,
      fontFamily: UI,
      color: '#ffffff',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#bbbbbb' }}>
      <Logo size={18} /> CCM - Claude Code Manager
    </div>
    <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>{title}</div>
    <div style={{ marginTop: 4, fontSize: 15, color: '#dddddd' }}>{body}</div>
  </div>
);

/** One of the app's own notifications, at the bottom right of its window. */
export const AppToast: FC<{ text: string; enter: number }> = ({ text, enter }) => (
  <div
    style={{
      position: 'absolute',
      right: 20,
      bottom: 20,
      padding: '12px 16px',
      borderRadius: 10,
      border: `1px solid ${C.del}`,
      background: soft(C.del, 14),
      backdropFilter: 'blur(6px)',
      fontSize: 15,
      fontWeight: 600,
      opacity: Math.min(1, enter),
      transform: `translateY(${(1 - enter) * 30}px)`,
    }}
  >
    {text}
  </div>
);
```

<!-- file: video/src/ui/Keys.tsx -->

```tsx
import type { FC } from 'react';
import { C, MONO } from '../theme';

/** Keys, big, in the middle of the screen; `press` (0 to 1) pushes them down. */
export const Keys: FC<{ keys: string[]; enter: number; press: number }> = ({ keys, enter, press }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: 470,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 18,
      opacity: Math.min(1, enter),
      transform: `scale(${0.8 + 0.2 * Math.min(1, enter)})`,
    }}
  >
    {keys.map((k, i) => (
      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {i ? <span style={{ fontSize: 44, color: C.muted }}>+</span> : null}
        <span
          style={{
            minWidth: 110,
            height: 110,
            padding: '0 26px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 18,
            background: C.elev,
            border: `2px solid ${C.line2}`,
            borderBottomWidth: 8 - 5 * press,
            transform: `translateY(${press * 5}px)`,
            fontFamily: MONO,
            fontSize: 44,
            fontWeight: 600,
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          }}
        >
          {k}
        </span>
      </div>
    ))}
  </div>
);
```

<!-- file: video/src/ui/Stats.tsx -->

```tsx
import type { FC } from 'react';
import { fr } from '../anim';
import { C, MONO } from '../theme';

const DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
/** Millions of tokens per day, split by model. */
const TOKENS = [3.1, 4.8, 2.2, 5.6, 6.9, 1.4, 4.1];
const MODELS = [
  { name: 'Opus', share: 0.5, color: '#D97757' },
  { name: 'Sonnet', share: 0.35, color: 'oklch(0.74 0.12 235)' },
  { name: 'Haiku', share: 0.15, color: 'oklch(0.76 0.12 150)' },
];

/** The stats page; `grow` holds each bar's growth (0 to 1), `total` and `cost` the counters. */
export const StatsView: FC<{ grow: number[]; total: number; cost: number; avg: number }> = ({ grow, total, cost, avg }) => (
  <div style={{ flex: 1, padding: '28px 40px', display: 'flex', flexDirection: 'column', gap: 26 }}>
    <div style={{ fontSize: 26, fontWeight: 700 }}>
      Statistiques <span style={{ color: C.dim, fontWeight: 500 }}>· 7 jours</span>
    </div>
    <div style={{ display: 'flex', gap: 18 }}>
      {[
        ['Tokens', `${fr(total, 1)} M`],
        ['Coût', `${fr(cost)} $`],
        ['Coût moyen / prompt', `${fr(avg)} $`],
      ].map(([label, value]) => (
        <div key={label} style={{ flex: 1, padding: '16px 20px', borderRadius: 12, background: C.elev, border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 13, color: C.muted }}>{label}</div>
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 30, fontWeight: 600 }}>{value}</div>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 18, fontSize: 13, color: C.muted }}>
      {MODELS.map((m) => (
        <span key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: m.color }} />
          {m.name}
        </span>
      ))}
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 28, borderBottom: `1px solid ${C.line2}`, paddingBottom: 2 }}>
      {TOKENS.map((t, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', gap: 2, height: `${(t / 7.2) * 100 * grow[i]}%` }}>
          {MODELS.map((m, k) => (
            <div
              key={m.name}
              style={{ height: `${m.share * 100}%`, background: m.color, borderRadius: k === MODELS.length - 1 ? '4px 4px 0 0' : 0 }}
            />
          ))}
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 28, marginTop: -14 }}>
      {DAYS.map((d) => (
        <span key={d} style={{ flex: 1, textAlign: 'center', fontSize: 13, color: C.dim }}>
          {d}
        </span>
      ))}
    </div>
  </div>
);
```

<!-- file: video/src/ui/Phone.tsx -->

```tsx
import type { FC } from 'react';
import { C, MONO, UI } from '../theme';

export interface PhoneMsg {
  from: 'me' | 'claude';
  text: string;
}

/** A phone on claude.ai, showing an agent's session. `draft` is being typed in its input. */
export const Phone: FC<{ messages: PhoneMsg[]; draft: string; x: number }> = ({ messages, draft, x }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: 170,
      width: 400,
      height: 830,
      borderRadius: 58,
      background: '#0d0c0b',
      padding: 14,
      boxShadow: '0 40px 120px rgba(0, 0, 0, 0.7), inset 0 0 0 2px #3a3632',
      fontFamily: UI,
    }}
  >
    <div style={{ width: '100%', height: '100%', borderRadius: 46, background: '#262320', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 50, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ width: 110, height: 30, borderRadius: 16, background: '#0d0c0b' }} />
      </div>
      <div style={{ padding: '6px 22px 14px', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 13, color: C.muted, fontFamily: MONO }}>claude.ai</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>demo-api · refacto-auth</div>
      </div>
      <div style={{ flex: 1, padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'flex-end' }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: m.from === 'me' ? '10px 14px' : '2px 2px',
              borderRadius: 14,
              background: m.from === 'me' ? '#3a3531' : 'transparent',
              fontSize: 16,
              lineHeight: 1.45,
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div style={{ margin: 14, padding: '12px 14px', borderRadius: 18, background: '#302c28', border: `1px solid ${C.line2}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 16, color: draft ? C.text : C.dim }}>{draft || 'Répondre…'}</span>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: '#D97757', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1b1512', fontWeight: 800 }}>
          ↑
        </span>
      </div>
    </div>
  </div>
);
```

<!-- file: video/src/ui/TermWindow.tsx -->

```tsx
import type { CSSProperties, FC } from 'react';
import { C, MONO } from '../theme';

/** A plain terminal running Claude Code, as they pile up without the app. */
export const TermWindow: FC<{ project: string; style?: CSSProperties }> = ({ project, style }) => (
  <div
    style={{
      width: 460,
      height: 270,
      borderRadius: 10,
      overflow: 'hidden',
      background: '#0c0c0c',
      border: '1px solid #3a3a3a',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
      fontFamily: MONO,
      fontSize: 13,
      color: '#cccccc',
      ...style,
    }}
  >
    <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: '#1f1f1f', fontSize: 12, color: '#aaaaaa' }}>
      <span style={{ color: C.spark }}>▲</span> claude — {project}
      <span style={{ flex: 1 }} />— ☐ ✕
    </div>
    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4, whiteSpace: 'pre' }}>
      <span style={{ color: C.spark }}>✻ Claude Code</span>
      <span>{'>'} corrige le test qui échoue</span>
      <span style={{ color: '#9bd8a9' }}>● Read(src/app.ts)</span>
      <span style={{ color: '#9bd8a9' }}>● Bash(npm test)</span>
      <span style={{ color: '#888888' }}> ⎿ 41 passed, 1 failed</span>
      <span>{'>'} ▌</span>
    </div>
  </div>
);
```

- [ ] **Step 5: La planche de contrôle et la racine Remotion**

<!-- file: video/src/Gallery.tsx -->

```tsx
import type { FC } from 'react';
import { AGENTS, STATUS, TABS } from './data';
import { AssistantMsg, Conversation, ConvHeader, Diffstat, QuestionCard, ToolCall, UserMsg } from './ui/Chat';
import { COMMITS, DiffPane, FilesPanel, GitGraph } from './ui/Git';
import { Phone } from './ui/Phone';
import { LogView, RunsSection } from './ui/Runs';
import { Shell } from './ui/Shell';
import { AgentsSidebar } from './ui/Sidebar';
import { AppWindow, Caption, Stage } from './ui/Stage';
import { WinToast } from './ui/Toast';

/** Every piece of the recreated UI on one frame, to check them at a glance. */
export const Gallery: FC = () => (
  <Stage>
    <Caption text="Planche de contrôle" delay={-100} />
    <AppWindow x={-160} scale={0.82}>
      <Shell tabs={TABS.map((t, i) => (i === 0 ? { ...t, waiting: 1 } : t))} status={STATUS} sidebar={<AgentsSidebar agents={AGENTS} selected="refacto-auth" ring="tests-e2e" />}>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <ConvHeader name="refacto-auth" status="running" sub="demo-api / main" />
            <Conversation>
              <UserMsg text="Ajoute la pagination à l'endpoint `/users`" tag="depuis claude.ai" />
              <AssistantMsg text="Je regarde d'abord comment les routes sont organisées." />
              <ToolCall tool="Edit" target="src/routes/users.ts" meta={<Diffstat add={24} del={3} />} />
              <QuestionCard question="Quelle taille de page par défaut ?" options={['20', '50', '100']} picked={1} />
            </Conversation>
          </div>
          <div style={{ width: 460, borderLeft: `1px solid rgba(255,236,214,0.08)` }}>
            <FilesPanel tab="files" files={[{ path: 'src/routes/users.ts', add: 24, del: 3 }]} selected={0} />
            <DiffPane rows={[{ kind: 'chg', l: 'const users = all();', r: 'const users = page(all(), q);' }, { kind: 'add', r: 'return { users, next };' }]} shown={2} start={12} />
            <GitGraph commits={COMMITS} from={0} shown={7} highlight={1} />
          </div>
        </div>
      </Shell>
    </AppWindow>
    <div style={{ position: 'absolute', left: 1330, top: 700, width: 300, background: '#211f1c' }}>
      <RunsSection runs={[{ name: 'Front', status: 'running' }, { name: 'Worker', status: 'crashed', code: 1 }]} />
    </div>
    <div style={{ position: 'absolute', left: 1330, top: 190, width: 540, height: 280, display: 'flex' }}>
      <LogView title="Front" status="en cours" statusColor="#7cc48d" lines={['$ npm run dev', '  VITE v6.4.3  ready in 412 ms']} />
    </div>
    <Phone x={1500} messages={[{ from: 'claude', text: 'Je lance les tests ?' }]} draft="Oui" />
    <WinToast title="tests-e2e a une question" body="« Je lance aussi Firefox ? »" enter={1} />
  </Stage>
);
```

<!-- file: video/src/Root.tsx -->

```tsx
import type { FC } from 'react';
import { Composition } from 'remotion';
import { Gallery } from './Gallery';
import { Presentation } from './Presentation';
import { FPS, TOTAL_FRAMES } from './timeline';

export const Root: FC = () => (
  <>
    <Composition id="Presentation" component={Presentation} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="Gallery" component={Gallery} durationInFrames={60} fps={FPS} width={1920} height={1080} />
  </>
);
```

<!-- file: video/src/index.ts -->

```ts
import { registerRoot } from 'remotion';
import { Root } from './Root';

registerRoot(Root);
```

Pour que `Root.tsx` compile avant les scènes, créer une `Presentation` provisoire (remplacée à la tâche 4) :

<!-- file: video/src/Presentation.tsx -->

```tsx
import type { FC } from 'react';
import { Stage } from './ui/Stage';

export const Presentation: FC = () => <Stage />;
```

- [ ] **Step 6: Vérifier les types et rendre la planche**

Run: `cd video && npx tsc --noEmit && npx remotion still src/index.ts Gallery out/stills/gallery.png --frame=30`
Expected: aucune erreur ; `out/stills/gallery.png` écrit (le premier rendu télécharge Chrome Headless Shell).

Relire l'image :
- polices Hanken Grotesk / JetBrains Mono (pas de police système) ;
- aucun texte qui déborde ;
- couleurs de l'app ;
- logo correct dans la barre d'onglets et dans la notification.

Corriger avant de continuer.

- [ ] **Step 7: Commit**

```bash
git add video/src
git commit -m "feat(video): the app's interface recreated as React components"
```

---

### Task 4: Montage, intro et chaos

**Files:**

- Create: `video/src/scenes/Intro.tsx`, `video/src/scenes/Chaos.tsx`, `video/scripts/stills.ts`
- Modify: `video/src/Presentation.tsx` (remplacée entièrement)

**Interfaces:**

- Consumes: `TIMELINE`, `captionOf` ; `pop`, `ramp` ; `Stage`, `Caption`, `AppWindow`, `Logo`, `Shell`, `TermWindow` ; `TABS`, `EMPTY_STATUS`.
- Produces: `Presentation`, qui monte les 10 plans et la musique. Pour que l'ensemble compile dès cette tâche, les plans des tâches 5 à 7 sont d'abord des stubs (`Todo`).

- [ ] **Step 1: Le montage**

<!-- file: video/src/Presentation.tsx -->

```tsx
import type { FC } from 'react';
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from 'remotion';
import { Chaos } from './scenes/Chaos';
import { Chat } from './scenes/Chat';
import { Git } from './scenes/Git';
import { Intro } from './scenes/Intro';
import { Launch } from './scenes/Launch';
import { Notify } from './scenes/Notify';
import { Outro } from './scenes/Outro';
import { Projects } from './scenes/Projects';
import { Remote } from './scenes/Remote';
import { Stats } from './scenes/Stats';
import { C } from './theme';
import { TIMELINE, type SceneId } from './timeline';

const SCENES: Record<SceneId, FC> = {
  intro: Intro,
  chaos: Chaos,
  projects: Projects,
  chat: Chat,
  notify: Notify,
  git: Git,
  launch: Launch,
  stats: Stats,
  remote: Remote,
  outro: Outro,
};

export const Presentation: FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {TIMELINE.map((s) => {
      const Scene = SCENES[s.id];
      return (
        <Sequence key={s.id} name={s.id} from={s.from} durationInFrames={s.durationInFrames}>
          <Scene />
        </Sequence>
      );
    })}
    <Html5Audio src={staticFile('music.wav')} />
  </AbsoluteFill>
);
```

Créer, pour chacun des plans pas encore écrits (`Projects`, `Chat`, `Notify`, `Git`, `Launch`, `Stats`, `Remote`, `Outro`), un stub dans `video/src/scenes/<Nom>.tsx` ; les tâches 5 à 7 les remplacent. Pour `Projects` :

```tsx
import type { FC } from 'react';
import { captionOf } from '../timeline';
import { Caption, Stage } from '../ui/Stage';

export const Projects: FC = () => (
  <Stage>
    <Caption text={captionOf('projects')} />
  </Stage>
);
```

Les sept autres sont identiques, avec leur nom et leur id (`Chat`/`'chat'`, `Notify`/`'notify'`, `Git`/`'git'`, `Launch`/`'launch'`, `Stats`/`'stats'`, `Remote`/`'remote'`, `Outro`/`'outro'`).

- [ ] **Step 2: Intro et chaos**

<!-- file: video/src/scenes/Intro.tsx -->

```tsx
import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop } from '../anim';
import { C } from '../theme';
import { captionOf } from '../timeline';
import { Logo } from '../ui/Logo';
import { Caption, Stage } from '../ui/Stage';

/** The logo builds up window by window, then the name. */
export const Intro: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const title = pop(frame, fps, 60, 16);
  const sub = pop(frame, fps, 72, 16);
  return (
    <Stage>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          paddingBottom: 150,
        }}
      >
        <Logo size={250} stack={[pop(frame, fps, 24), pop(frame, fps, 12), pop(frame, fps, 0)]} spark={pop(frame, fps, 36, 10)} spin={frame * 0.4} />
        <div style={{ fontSize: 150, fontWeight: 800, letterSpacing: -6, lineHeight: 1, opacity: Math.min(1, title), transform: `translateY(${(1 - title) * 40}px)` }}>
          CCM
        </div>
        <div style={{ fontSize: 46, fontWeight: 500, color: C.muted, opacity: Math.min(1, sub), transform: `translateY(${(1 - sub) * 30}px)` }}>
          Claude Code Manager
        </div>
      </div>
      <Caption text={captionOf('intro')} delay={100} top={860} />
    </Stage>
  );
};
```

<!-- file: video/src/scenes/Chaos.tsx -->

```tsx
import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp } from '../anim';
import { EMPTY_STATUS, TABS } from '../data';
import { captionOf } from '../timeline';
import { Shell } from '../ui/Shell';
import { AppWindow, Caption, Stage } from '../ui/Stage';
import { TermWindow } from '../ui/TermWindow';

const PROJECTS = ['demo-api', 'studio-web', 'mobile-app', 'infra', 'site-vitrine'];
/** Pseudo-random but fixed positions. */
const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const WINDOWS = Array.from({ length: 22 }, (_, i) => ({
  x: 40 + rnd(i, 1) * 1420,
  y: 170 + rnd(i, 2) * 620,
  rot: (rnd(i, 3) - 0.5) * 8,
  project: PROJECTS[i % PROJECTS.length],
  at: i * 5,
}));

/** Terminals pile up, then the app swallows them. */
export const Chaos: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const suck = ramp(frame, 128, 32);
  const app = pop(frame, fps, 148, 18);
  return (
    <Stage>
      {WINDOWS.map((w, i) => {
        const p = Math.min(1, pop(frame, fps, w.at, 12));
        return (
          <TermWindow
            key={i}
            project={w.project}
            style={{
              position: 'absolute',
              left: w.x + (730 - w.x) * suck,
              top: w.y + (400 - w.y) * suck,
              opacity: p * (1 - suck),
              transform: `rotate(${w.rot * (1 - suck)}deg) scale(${(0.7 + 0.3 * p) * (1 - 0.8 * suck)})`,
            }}
          />
        );
      })}
      <Caption text={captionOf('chaos')} delay={6} />
      <AppWindow enter={app}>
        <Shell tabs={TABS.map((t) => ({ ...t, enter: 0 }))} status={EMPTY_STATUS} sidebar={null} />
      </AppWindow>
    </Stage>
  );
};
```

- [ ] **Step 3: Le script des images fixes**

<!-- file: video/scripts/stills.ts -->

```ts
// One still per scene, at 35 % and 80 % of it: `npm run stills [-- <scene ids>]`.

import { execFileSync } from 'node:child_process';
import { TIMELINE } from '../src/timeline';

const only = process.argv.slice(2);
for (const s of TIMELINE) {
  if (only.length && !only.includes(s.id)) continue;
  for (const at of [0.35, 0.8]) {
    const frame = s.from + Math.round(s.durationInFrames * at);
    const out = `out/stills/${s.id}-${Math.round(at * 100)}.png`;
    execFileSync('npx', ['remotion', 'still', 'src/index.ts', 'Presentation', out, `--frame=${frame}`], { stdio: 'inherit', shell: true });
  }
}
```

- [ ] **Step 4: Vérifier**

Run: `cd video && npx tsc --noEmit && npm test && npm run stills -- intro chaos`
Expected: aucune erreur ; quatre images dans `out/stills/`.

Relire les images :
- intro : logo complet, « CCM », sous-titre et texte lisibles ;
- chaos : fenêtres éparpillées, texte en haut non masqué ;
- à 80 % du chaos : les fenêtres convergent, la fenêtre de l'app apparaît.

- [ ] **Step 5: Commit**

```bash
git add video/src video/scripts
git commit -m "feat(video): assembly, logo intro and the terminal chaos"
```

---

### Task 5: Projets, chat et notifications

**Files:**

- Modify (remplacer les stubs) : `video/src/scenes/Projects.tsx`, `video/src/scenes/Chat.tsx`, `video/src/scenes/Notify.tsx`

**Interfaces:**

- Consumes:
  - `AGENTS`, `TABS`, `STATUS` ;
  - `AgentsSidebar`, `Shell`, `ConvHeader`, `Conversation`, `UserMsg`, `AssistantMsg`, `ToolCall`, `Diffstat`, `QuestionCard` ;
  - `WinToast`, `Keys` ;
  - `pop`, `ramp`, `typed`.

- [ ] **Step 1: Écrire les trois plans**

<!-- file: video/src/scenes/Projects.tsx -->

```tsx
import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { captionOf } from '../timeline';
import { AssistantMsg, Conversation, ConvHeader, Diffstat, ToolCall, UserMsg } from '../ui/Chat';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';

/** Project tabs, then agents fill the sidebar; one of them ends up with a question. */
export const Projects: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const asks = frame >= 210;
  const tabs = TABS.map((t, i) => ({
    ...t,
    enter: pop(frame, fps, 4 + i * 10),
    delta: Math.round((t.delta ?? 0) * ramp(frame, 40, 50)),
    waiting: asks && i === 0 ? 1 : 0,
  }));
  const agents = AGENTS.map((a) => (asks && a.name === 'tests-e2e' ? { ...a, status: 'waiting' as const } : a));
  return (
    <Stage>
      <Caption text={captionOf('projects')} />
      <AppWindow>
        <Shell
          tabs={tabs}
          status={{ ...STATUS, active: asks ? 2 : 3, waiting: asks ? 1 : 0 }}
          sidebar={<AgentsSidebar agents={agents} selected="refacto-auth" enters={agents.map((_, i) => pop(frame, fps, 40 + i * 14))} ring={asks ? 'tests-e2e' : undefined} />}
        >
          <ConvHeader name="refacto-auth" status="running" sub="demo-api / main" />
          <Conversation>
            <UserMsg text="Refactore l'auth pour passer aux tokens JWT, sans casser les sessions existantes." enter={pop(frame, fps, 60)} />
            {frame > 80 ? <AssistantMsg text="D'accord. Je cartographie l'existant : middleware, routes et stockage des sessions." /> : null}
            <ToolCall tool="Read" target="src/auth/middleware.ts" enter={pop(frame, fps, 110)} />
            <ToolCall tool="Grep" target="session" meta={<span style={{ fontSize: 13, color: '#a8a095' }}>14 fichiers</span>} enter={pop(frame, fps, 135)} />
            <ToolCall tool="Edit" target="src/auth/jwt.ts" meta={<Diffstat add={58} del={0} />} running enter={pop(frame, fps, 160)} />
          </Conversation>
        </Shell>
      </AppWindow>
    </Stage>
  );
};
```

<!-- file: video/src/scenes/Chat.tsx -->

```tsx
import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp, typed } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { captionOf } from '../timeline';
import { AssistantMsg, Conversation, ConvHeader, Diffstat, QuestionCard, ToolCall, UserMsg } from '../ui/Chat';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';

const FIRST = "Je regarde d'abord comment les routes sont organisées.";
const LAST = 'Parfait : 50 éléments par page, et `?limit=` pour changer.';

/** A turn of the conversation: text, tools, a question answered in one click. */
export const Chat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const picked = frame >= 192 ? 1 : null;
  return (
    <Stage>
      <Caption text={captionOf('chat')} />
      <AppWindow>
        <Shell tabs={TABS} status={STATUS} sidebar={<AgentsSidebar agents={AGENTS} selected="pagination-users" />}>
          <ConvHeader name="pagination-users" status="running" sub="demo-api / main" />
          <Conversation>
            <UserMsg text="Ajoute la pagination à l'endpoint `/users`" enter={pop(frame, fps, 4)} />
            <AssistantMsg text={typed(FIRST, frame, fps, 20)} />
            <ToolCall tool="Read" target="src/routes/users.ts" enter={pop(frame, fps, 62)} />
            <ToolCall tool="Edit" target="src/routes/users.ts" meta={<Diffstat add={24} del={3} />} enter={pop(frame, fps, 82)} />
            <ToolCall
              tool="Bash"
              target="npm test"
              meta={frame >= 132 ? <span style={{ fontSize: 13, color: '#a8a095' }}>42 tests</span> : null}
              running={frame < 132}
              enter={pop(frame, fps, 102)}
            />
            <QuestionCard
              question="Quelle taille de page par défaut ?"
              options={['20', '50', '100']}
              picked={picked}
              enter={pop(frame, fps, 145)}
              cursor={frame >= 160 && frame < 215 ? { target: 1, t: ramp(frame, 160, 28), click: ramp(frame, 190, 14) } : undefined}
            />
            {picked !== null ? <AssistantMsg text={typed(LAST, frame, fps, 212)} /> : null}
          </Conversation>
        </Shell>
      </AppWindow>
    </Stage>
  );
};
```

<!-- file: video/src/scenes/Notify.tsx -->

```tsx
import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { captionOf } from '../timeline';
import { AssistantMsg, Conversation, ConvHeader, QuestionCard } from '../ui/Chat';
import { Keys } from '../ui/Keys';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';
import { WinToast } from '../ui/Toast';

/** An agent waits: badge, Windows notification, Ctrl+J jumps to it. */
export const Notify: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const asks = frame >= 16;
  const jumped = frame >= 138;
  const agents = AGENTS.map((a) => (asks && a.name === 'tests-e2e' ? { ...a, status: 'waiting' as const } : a));
  const keys = pop(frame, fps, 100, 16) - ramp(frame, 150, 14);
  return (
    <Stage>
      <Caption text={captionOf('notify')} />
      <AppWindow>
        <Shell
          tabs={TABS.map((t, i) => (i === 0 && asks ? { ...t, waiting: 1 } : t))}
          status={{ ...STATUS, active: 2, waiting: asks ? 1 : 0 }}
          sidebar={<AgentsSidebar agents={agents} selected={jumped ? 'tests-e2e' : 'refacto-auth'} ring={asks && !jumped ? 'tests-e2e' : undefined} />}
        >
          {jumped ? (
            <>
              <ConvHeader name="tests-e2e" status="waiting" sub="demo-api / main" />
              <Conversation>
                <AssistantMsg text="Les 18 scénarios passent sur Chrome." />
                <QuestionCard question="Je lance aussi les tests sur Firefox ?" options={['Oui', 'Non, Chrome suffit']} enter={pop(frame, fps, 142)} />
              </Conversation>
            </>
          ) : (
            <>
              <ConvHeader name="refacto-auth" status="running" sub="demo-api / main" />
              <Conversation>
                <AssistantMsg text="Je remplace le middleware de session par une vérification du JWT." />
              </Conversation>
            </>
          )}
        </Shell>
      </AppWindow>
      <Keys keys={['Ctrl', 'J']} enter={Math.max(0, keys)} press={ramp(frame, 124, 6) - ramp(frame, 132, 6)} />
      <WinToast
        title="tests-e2e a une question"
        body="« Je lance aussi les tests sur Firefox ? »"
        enter={pop(frame, fps, 36, 16) - ramp(frame, 150, 16)}
      />
    </Stage>
  );
};
```

- [ ] **Step 2: Vérifier**

Run: `cd video && npx tsc --noEmit && npm run stills -- projects chat notify`
Expected: aucune erreur ; six images.

Relire :
- projects : onglets et agents alignés, pastille « Question » visible à 80 % ;
- chat : messages et outils sans débordement, carte de question lisible, pointeur sur « 50 » ;
- notify : notification Windows en bas à droite, touches au centre (35 %), conversation de tests-e2e (80 %).

- [ ] **Step 3: Commit**

```bash
git add video/src/scenes
git commit -m "feat(video): projects, chat and notification scenes"
```

---

### Task 6: Git, lancement et stats

**Files:**

- Modify (remplacer les stubs) : `video/src/scenes/Git.tsx`, `video/src/scenes/Launch.tsx`, `video/src/scenes/Stats.tsx`

**Interfaces:**

- Consumes:
  - `FilesPanel`, `DiffPane`, `DiffRow`, `GitGraph`, `COMMITS` ;
  - `RunsSection`, `LogView`, `AppToast`, `StatsView` ;
  - `Shell` et sa prop `glowStatus` ;
  - `count`.

- [ ] **Step 1: Écrire les trois plans**

<!-- file: video/src/scenes/Git.tsx -->

```tsx
import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { C } from '../theme';
import { captionOf } from '../timeline';
import { AssistantMsg, Conversation, ConvHeader, Diffstat, ToolCall } from '../ui/Chat';
import { COMMITS, DiffPane, FilesPanel, GitGraph, type DiffRow } from '../ui/Git';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';

const FILES = [
  { path: 'src/routes/users.ts', add: 24, del: 3 },
  { path: 'src/db/paginate.ts', add: 41, del: 0 },
  { path: 'tests/users.test.ts', add: 37, del: 2 },
];
const ROWS: DiffRow[] = [
  { kind: 'ctx', l: "router.get('/users', async (req) => {", r: "router.get('/users', async (req) => {" },
  { kind: 'chg', l: '  const users = await db.users.all();', r: '  const { limit = 50, cursor } = req.query;' },
  { kind: 'add', r: '  const page = await paginate(db.users, {' },
  { kind: 'add', r: '    limit: Math.min(limit, 100),' },
  { kind: 'add', r: '    cursor,' },
  { kind: 'add', r: '  });' },
  { kind: 'chg', l: '  return users;', r: '  return { users: page.items, next: page.next };' },
  { kind: 'ctx', l: '});', r: '});' },
];

/** Split layout with the diff, then the history, and the merge. */
export const Git: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const history = frame >= 150;
  const merged = frame >= 236;
  return (
    <Stage>
      <Caption text={captionOf('git')} />
      <AppWindow>
        <Shell tabs={TABS} status={STATUS} sidebar={<AgentsSidebar agents={AGENTS.slice(0, 3)} selected="pagination-users" />}>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <ConvHeader name="pagination-users" status={merged ? 'done' : 'running'} sub="demo-api / ccm/pagination-users" />
              <Conversation>
                <AssistantMsg text="La pagination est en place, avec ses tests." />
                <ToolCall tool="Edit" target="src/db/paginate.ts" meta={<Diffstat add={41} del={0} />} />
                <ToolCall tool="Bash" target="npm test" meta={<span style={{ fontSize: 13, color: C.muted }}>48 tests</span>} />
                {merged ? <AssistantMsg text="Branche mergée dans `main` ✓" /> : null}
              </Conversation>
            </div>
            <div style={{ width: 620, flex: 'none', borderLeft: `1px solid ${C.line}`, background: C.panel, opacity: Math.min(1, pop(frame, fps, 0, 18)) }}>
              <FilesPanel tab={history ? 'history' : 'files'} files={FILES} selected={0} />
              {history ? (
                <GitGraph commits={COMMITS} from={merged ? 0 : 1} shown={Math.floor(ramp(frame, 156, 40) * 6) + (merged ? 1 : 0)} highlight={1} />
              ) : (
                <DiffPane rows={ROWS} shown={Math.floor(ramp(frame, 20, 60) * ROWS.length)} start={14} />
              )}
            </div>
          </div>
        </Shell>
      </AppWindow>
    </Stage>
  );
};
```

<!-- file: video/src/scenes/Launch.tsx -->

```tsx
import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { C } from '../theme';
import { captionOf } from '../timeline';
import { LogView, RunsSection, type Run } from '../ui/Runs';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';
import { AppToast } from '../ui/Toast';

const LOG = [
  '$ npm run dev',
  '',
  '> demo-api@2.3.0 dev',
  '> vite',
  '',
  '  VITE v6.4.3  ready in 412 ms',
  '',
  '  ➜  Local:   http://localhost:5173/',
  '  ➜  Network: use --host to expose',
  '',
  '  12:04:31 [vite] page reload src/routes/users.ts',
];

/** « Tout lancer »: three commands start, one crashes and says so. */
export const Launch: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const started = (i: number) => frame >= 46 + i * 6;
  const crashed = frame >= 150;
  const runs: Run[] = [
    { name: 'Front', status: started(0) ? 'running' : 'ready' },
    { name: 'API', status: started(1) ? 'running' : 'ready' },
    { name: 'Worker', status: crashed ? 'crashed' : started(2) ? 'running' : 'ready', code: 1 },
  ];
  const shownLines = frame < 50 ? 0 : Math.min(LOG.length, Math.floor((frame - 50) / 6) + 1);
  return (
    <Stage>
      <Caption text={captionOf('launch')} />
      <AppWindow>
        <Shell
          tabs={TABS}
          status={STATUS}
          sidebar={
            <>
              <AgentsSidebar agents={AGENTS.slice(0, 2)} />
              <RunsSection
                runs={runs}
                selected={0}
                pressed={ramp(frame, 36, 4) - ramp(frame, 42, 4)}
                cursor={frame < 70 ? { t: ramp(frame, 8, 26), click: ramp(frame, 38, 14) } : undefined}
                glow={ramp(frame, 0, 20)}
              />
            </>
          }
        >
          <LogView title="Front" status={started(0) ? 'en cours' : 'prêt'} statusColor={started(0) ? C.ok : C.dim} lines={LOG.slice(0, shownLines)} />
          <AppToast text="« Worker » s'est arrêté en erreur (code 1)" enter={pop(frame, fps, 152, 16)} />
        </Shell>
      </AppWindow>
    </Stage>
  );
};
```

<!-- file: video/src/scenes/Stats.tsx -->

```tsx
import type { FC } from 'react';
import { useCurrentFrame } from 'remotion';
import { count, ramp } from '../anim';
import { STATUS, TABS } from '../data';
import { captionOf } from '../timeline';
import { Shell } from '../ui/Shell';
import { AppWindow, Caption, Stage } from '../ui/Stage';
import { StatsView } from '../ui/Stats';

/** Live cost and quotas in the status bar, stats of the week. */
export const Stats: FC = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Caption text={captionOf('stats')} />
      <AppWindow>
        <Shell
          tabs={TABS}
          status={{ ...STATUS, cost: count(frame, 20, 180, 3.48, 5.12), session: count(frame, 20, 180, 22, 38), weekly: count(frame, 20, 180, 36, 41) }}
          glowStatus={ramp(frame, 110, 20)}
        >
          <StatsView
            grow={[0, 1, 2, 3, 4, 5, 6].map((i) => ramp(frame, 10 + i * 7, 30))}
            total={count(frame, 10, 90, 0, 28.1)}
            cost={count(frame, 10, 90, 0, 42.17)}
            avg={count(frame, 10, 90, 0, 0.31)}
          />
        </Shell>
      </AppWindow>
    </Stage>
  );
};
```

- [ ] **Step 2: Vérifier**

Run: `cd video && npx tsc --noEmit && npm run stills -- git launch stats`
Expected: aucune erreur ; six images.

Relire :
- git : diff côte à côte lisible (35 %), graphe avec la branche en orange (80 %) ;
- launch : statuts en cours, log (35 %), Worker planté et notification rouge (80 %) ;
- stats : barres empilées, compteurs, barre de statut en surbrillance (80 %).

- [ ] **Step 3: Commit**

```bash
git add video/src/scenes
git commit -m "feat(video): git, launch and stats scenes"
```

---

### Task 7: Téléphone et fin

**Files:**

- Modify (remplacer les stubs) : `video/src/scenes/Remote.tsx`, `video/src/scenes/Outro.tsx`

- [ ] **Step 1: Écrire les deux plans**

<!-- file: video/src/scenes/Remote.tsx -->

```tsx
import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp, typed } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { C } from '../theme';
import { captionOf } from '../timeline';
import { AssistantMsg, Conversation, ConvHeader, UserMsg } from '../ui/Chat';
import { Phone } from '../ui/Phone';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';

const ASK = "J'ai fini la refacto de l'auth. Je lance les tests ?";
const REPLY = 'Oui, et ajoute les tests Firefox';

/** The same session on a phone: a message sent from it shows up in the app. */
export const Remote: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = pop(frame, fps, 0, 18);
  const sent = frame >= 122;
  const arrived = frame >= 140;
  return (
    <Stage>
      <Caption text={captionOf('remote')} />
      <AppWindow x={-190 * Math.min(1, slide)} scale={1 - 0.1 * Math.min(1, slide)}>
        <Shell tabs={TABS} status={STATUS} sidebar={<AgentsSidebar agents={AGENTS.slice(0, 3)} selected="refacto-auth" />}>
          <ConvHeader name="refacto-auth" status={arrived ? 'running' : 'done'} sub="demo-api / main" />
          <Conversation>
            <AssistantMsg text={ASK} />
            <UserMsg text={REPLY} tag="depuis claude.ai" enter={pop(frame, fps, 140)} />
          </Conversation>
        </Shell>
      </AppWindow>
      {sent && !arrived ? (
        <div
          style={{
            position: 'absolute',
            left: 1480 - 280 * ramp(frame, 122, 18),
            top: 560,
            width: 16,
            height: 16,
            borderRadius: 8,
            background: C.spark,
            boxShadow: `0 0 24px ${C.spark}`,
          }}
        />
      ) : null}
      <Phone
        x={1920 - 480 * Math.min(1, pop(frame, fps, 10, 18))}
        messages={[{ from: 'claude', text: ASK }, ...(sent ? [{ from: 'me' as const, text: REPLY }] : [])]}
        draft={sent ? '' : typed(REPLY, frame, fps, 60, 28)}
      />
    </Stage>
  );
};
```

<!-- file: video/src/scenes/Outro.tsx -->

```tsx
import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp } from '../anim';
import { C, MONO } from '../theme';
import { captionOf } from '../timeline';
import { Logo } from '../ui/Logo';
import { Caption, Stage } from '../ui/Stage';

/** Logo, name, link, then fade to black. */
export const Outro: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = pop(frame, fps, 0, 12);
  const name = pop(frame, fps, 12, 16);
  const link = pop(frame, fps, 70, 18);
  return (
    <Stage>
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - ramp(frame, 196, 40) }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            paddingBottom: 190,
          }}
        >
          <Logo size={210} stack={[e, e, e]} spark={e} spin={frame * 0.5} />
          <div style={{ fontSize: 130, fontWeight: 800, letterSpacing: -5, lineHeight: 1, opacity: Math.min(1, name) }}>CCM</div>
          <div style={{ fontSize: 42, fontWeight: 500, color: C.muted, opacity: Math.min(1, name) }}>Claude Code Manager</div>
        </div>
        <Caption text={captionOf('outro')} delay={36} top={760} />
        <div
          style={{
            position: 'absolute',
            top: 860,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: MONO,
            fontSize: 30,
            color: C.spark,
            opacity: Math.min(1, link),
            transform: `translateY(${(1 - link) * 20}px)`,
          }}
        >
          github.com/guillaume-gagnaire/claude-code-manager
        </div>
      </div>
    </Stage>
  );
};
```

- [ ] **Step 2: Vérifier**

Run: `cd video && npx tsc --noEmit && npm run stills -- remote outro`
Expected: aucune erreur ; quatre images.

Relire :
- remote : téléphone à droite avec la saisie (35 %), message « depuis claude.ai » dans l'app (80 %) ;
- outro : logo, CCM, texte, lien, sans chevauchement.

- [ ] **Step 3: Commit**

```bash
git add video/src/scenes
git commit -m "feat(video): phone and closing scenes"
```

---

### Task 8: Rendu final, relecture et documentation

**Files:**

- Modify: `README.md` (section Développement)

- [ ] **Step 1: Rendre la vidéo**

Run: `cd video && npm test && npm run render`
Expected: tests verts ; `out/presentation.mp4` d'environ 82 s.

- [ ] **Step 2: Relire le MP4**

Run: `cd video && npx remotion ffmpeg -i out/presentation.mp4 -vf fps=1/6 out/check-%02d.png`
Expected: 14 images, une toutes les 6 s.

Les relire : chaque plan au bon moment, textes lisibles, aucune image noire ni figée.

Run: `cd video && npx remotion ffprobe -v error -show_entries format=duration:stream=codec_type -of compact out/presentation.mp4`
Expected: une piste `video`, une piste `audio`, durée ≈ 82 s.

- [ ] **Step 3: Documenter**

Ajouter dans `README.md`, à la fin de la section « Développement » (avant « ## Architecture ») :

````markdown
### Vidéo de présentation

Le dossier `video/` contient la vidéo de présentation (Remotion) et sa musique, générée par code :

```powershell
cd video
npm install
npm run studio   # aperçu
npm run render   # musique + out/presentation.mp4
```
````

- [ ] **Step 4: Commit et livraison**

```bash
git add README.md
git commit -m "docs: how to render the presentation video"
```

Envoyer `video/out/presentation.mp4` à l'utilisateur.
