// The website's images and video, from the video's scenes: `npm run site-images` (after `npm run render`).

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { SceneId } from '../src/timeline';

const SITE = '../website/public';
const SHOTS: { name: string; scene: SceneId; frame: number }[] = [
  { name: 'agents', scene: 'projects', frame: 290 },
  { name: 'chat', scene: 'chat', frame: 290 },
  { name: 'notifications', scene: 'notify', frame: 90 },
  { name: 'git', scene: 'git', frame: 290 },
  { name: 'launch', scene: 'launch', frame: 220 },
  { name: 'stats', scene: 'stats', frame: 230 },
  { name: 'remote', scene: 'remote', frame: 220 },
];

const still = (args: string[]) =>
  execFileSync('npx', ['remotion', 'still', 'src/index.ts', ...args, '--image-format=jpeg', '--jpeg-quality=85'], {
    stdio: 'inherit',
    shell: true,
  });

mkdirSync(`${SITE}/images`, { recursive: true });
mkdirSync('out', { recursive: true });
for (const s of SHOTS) {
  // Props through a file: JSON on a Windows command line loses its quotes.
  writeFileSync(`out/props-${s.name}.json`, JSON.stringify({ scene: s.scene }));
  still(['Shot', `${SITE}/images/${s.name}.jpg`, `--frame=${s.frame}`, `--props=out/props-${s.name}.json`]);
}
still(['Presentation', `${SITE}/images/poster.jpg`, '--frame=170']);
copyFileSync('out/presentation.mp4', `${SITE}/ccm.mp4`);
copyFileSync('../public/logo.svg', `${SITE}/logo.svg`);
