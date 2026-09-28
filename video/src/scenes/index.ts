import type { FC } from 'react';
import type { SceneId } from '../timeline';
import { Chaos } from './Chaos';
import { Chat } from './Chat';
import { Git } from './Git';
import { Intro } from './Intro';
import { Launch } from './Launch';
import { Notify } from './Notify';
import { Outro } from './Outro';
import { Projects } from './Projects';
import { Remote } from './Remote';
import { Stats } from './Stats';

export const SCENES: Record<SceneId, FC> = {
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
