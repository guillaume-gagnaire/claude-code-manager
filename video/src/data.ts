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
