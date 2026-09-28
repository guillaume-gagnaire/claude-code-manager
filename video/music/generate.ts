import { mkdirSync, writeFileSync } from 'node:fs';
import { render } from './song';
import { SR } from './synth';
import { encodeWav } from './wav';

const m = render();
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/music.wav', import.meta.url), encodeWav(m.l, m.r, SR));
console.log(`public/music.wav: ${(m.l.length / SR).toFixed(1)} s`);
