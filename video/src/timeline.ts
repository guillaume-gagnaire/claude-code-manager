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
