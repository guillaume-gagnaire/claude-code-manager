// Test utilities: a fake Tauri backend recording every command.

import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { app } from '../lib/state.svelte';
import type { Agent, Project, Settings } from '../lib/types';

export interface Call {
  cmd: string;
  args: Record<string, any>;
}

export function fakeBackend(handlers: Record<string, (args: any) => unknown> = {}) {
  const calls: Call[] = [];
  mockWindows('main');
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args: (args ?? {}) as Record<string, any> });
      const h = handlers[cmd];
      return h ? h(args) : null;
    },
    { shouldMockEvents: true },
  );
  return {
    calls,
    called: (cmd: string) => calls.filter((c) => c.cmd === cmd),
  };
}

export const SETTINGS: Settings = {
  claudePath: '',
  defaultModel: 'sonnet',
  defaultEffort: 'medium',
  defaultMode: 'auto',
  sound: true,
  osNotifications: true,
  editorCommand: 'code',
  idleStopMinutes: 30,
  pwshPath: '',
  bashPath: '',
  wslDistro: '',
  proxyUrl: '',
  noProxy: 'localhost',
  proxyTerminals: false,
};

export function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'demo-api',
    path: 'C:\\code\\demo-api',
    color: 'oklch(0.72 0.12 48)',
    worktreePerAgent: false,
    createdAt: 1,
    runCommands: [],
    ...over,
  };
}

export function agent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    projectId: 'p1',
    name: 'refacto-auth',
    named: true,
    model: 'opus',
    effort: 'high',
    mode: 'auto',
    sessionId: null,
    cwd: 'C:\\code\\demo-api',
    worktree: null,
    createdAt: 1,
    archived: false,
    status: 'done',
    tokens: 0,
    cost: 0,
    activeMs: 0,
    touchedFiles: [],
    lastActivity: 1,
    prompts: 0,
    activeSince: null,
    alive: true,
    pending: [],
    contextTokens: 0,
    liveTokens: 0,
    liveCost: 0,
    remoteControl: false,
    remoteSession: null,
    remoteUrl: null,
    remoteState: null,
    ...over,
  };
}

/** Puts the app singleton back into a known state. */
export function resetApp(over: { projects?: Project[]; agents?: Agent[] } = {}) {
  const projects = over.projects ?? [project()];
  app.projects = projects;
  app.agents = Object.fromEntries((over.agents ?? []).map((a) => [a.id, a]));
  app.ui = { activeProject: projects[0]?.id ?? null, view: 'project', selectedAgent: {} };
  app.settings = { ...SETTINGS };
  app.usage = { fiveHour: null, sevenDay: null, todayCost: 0, updatedAt: 0 };
  app.git = {};
  app.shells = [];
  app.terminals = [];
  app.exitedTerms = {};
  app.launches = {};
  app.selectedLaunch = {};
  app.selectedTerm = {};
  app.filesOpen = false;
  app.filesScope = 'agent';
  app.panelTab = 'files';
  app.diffSplit = false;
  app.modal = null;
  app.toasts = [];
  app.update = null;
  app.ready = true;
}
