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
