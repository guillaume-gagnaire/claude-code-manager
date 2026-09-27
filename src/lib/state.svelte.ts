// Global application state (Svelte 5 runes) fed by the backend event channel.

import { api } from './ipc';
import { applyConvOps, dropConversation } from './conversations.svelte';
import { applyTheme } from './theme';
import type { Agent, GitInfo, Project, Settings, ShellInfo, TermInfo, UiEvent, UiState, Usage } from './types';

export type Modal =
  | { kind: 'newProject' }
  | { kind: 'settings' }
  | { kind: 'diff'; projectId: string; agentId: string | null; paths: string[]; title: string }
  | {
      kind: 'confirm';
      title: string;
      body: string;
      confirm: string;
      danger?: boolean;
      option?: { label: string; value: boolean };
      onConfirm: (option: boolean) => void | Promise<void>;
    }
  | { kind: 'rename'; title: string; value: string; onSubmit: (v: string) => void | Promise<void> };

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'ok';
}

export interface UpdateInfo {
  version: string;
  notes: string;
  install: () => Promise<void>;
}

class AppState {
  ready = $state(false);
  projects = $state<Project[]>([]);
  agents = $state<Record<string, Agent>>({});
  ui = $state<UiState>({ activeProject: null, view: 'project', selectedAgent: {} });
  settings = $state<Settings>({} as Settings);
  usage = $state<Usage>({ fiveHour: null, sevenDay: null, todayCost: 0, updatedAt: 0 });
  git = $state<Record<string, GitInfo>>({});
  shells = $state<ShellInfo[]>([]);
  terminals = $state<TermInfo[]>([]);
  exitedTerms = $state<Record<string, number | null>>({});
  selectedTerm = $state<Record<string, string | null>>({});
  claudeFound = $state(true);
  version = $state('');
  filesOpen = $state(false);
  filesScope = $state<'agent' | 'project'>('agent');
  showArchived = $state(false);
  modal = $state<Modal | null>(null);
  toasts = $state<Toast[]>([]);
  now = $state(Date.now());
  gitTick = $state(0);
  update = $state<UpdateInfo | null>(null);
  focusComposer = $state(0);

  project = $derived(this.projects.find((p) => p.id === this.ui.activeProject) ?? null);

  projectAgents = $derived.by(() => {
    const p = this.project;
    if (!p) return [] as Agent[];
    return Object.values(this.agents)
      .filter((a) => a.projectId === p.id && !a.archived)
      .sort((a, b) => a.createdAt - b.createdAt);
  });

  archivedAgents = $derived.by(() => {
    const p = this.project;
    if (!p) return [] as Agent[];
    return Object.values(this.agents)
      .filter((a) => a.projectId === p.id && a.archived)
      .sort((a, b) => b.lastActivity - a.lastActivity);
  });

  agent = $derived.by(() => {
    const p = this.project;
    if (!p) return null;
    const sel = this.ui.selectedAgent[p.id];
    const a = sel ? this.agents[sel] : undefined;
    if (a && a.projectId === p.id) return a;
    return this.projectAgents[0] ?? null;
  });

  term = $derived.by(() => {
    const p = this.project;
    if (!p) return null;
    const id = this.selectedTerm[p.id];
    return this.terminals.find((t) => t.id === id) ?? null;
  });

  waitingCount = $derived(Object.values(this.agents).filter((a) => !a.archived && a.status === 'waiting').length);

  private uiTimer: ReturnType<typeof setTimeout> | undefined;
  private toastId = 0;

  async init() {
    const s = await api.subscribe((e) => this.onEvent(e));
    this.projects = s.projects;
    this.agents = Object.fromEntries(s.agents.map((a) => [a.id, a]));
    this.ui = { ...s.ui, view: s.ui.view || 'project', selectedAgent: s.ui.selectedAgent ?? {} };
    if (!this.ui.activeProject || !this.projects.some((p) => p.id === this.ui.activeProject)) {
      this.ui.activeProject = this.projects[0]?.id ?? null;
    }
    this.settings = s.settings;
    this.usage = s.usage;
    this.git = s.git;
    this.shells = s.shells;
    this.claudeFound = s.claudeFound;
    this.version = s.version;
    this.ready = true;
    setInterval(() => (this.now = Date.now()), 1000);
  }

  private onEvent(e: UiEvent) {
    switch (e.type) {
      case 'agent':
        this.agents[e.agent.id] = e.agent;
        break;
      case 'agentRemoved':
        delete this.agents[e.id];
        dropConversation(e.id);
        break;
      case 'conv':
        applyConvOps(e.agentId, e.ops);
        break;
      case 'git':
        this.git[e.projectId] = e.git;
        if (e.projectId === this.ui.activeProject) this.gitTick++;
        break;
      case 'usage':
        this.usage = e.usage;
        break;
      case 'focus':
        this.selectProject(e.projectId);
        if (e.agentId) this.selectAgent(e.agentId);
        break;
      case 'terminalExit':
        this.exitedTerms[e.id] = e.code;
        break;
    }
  }

  persistUi() {
    clearTimeout(this.uiTimer);
    this.uiTimer = setTimeout(() => api.setUi($state.snapshot(this.ui)).catch(() => {}), 250);
  }

  applyTheme() {
    applyTheme(this.ui.view === 'project' && this.project ? this.project.color : null);
  }

  selectProject(id: string) {
    this.ui.activeProject = id;
    this.ui.view = 'project';
    this.persistUi();
  }

  openStats() {
    this.ui.view = 'stats';
    this.persistUi();
  }

  selectAgent(id: string) {
    const a = this.agents[id];
    if (!a) return;
    if (this.ui.activeProject !== a.projectId) this.ui.activeProject = a.projectId;
    this.ui.view = 'project';
    this.ui.selectedAgent[a.projectId] = id;
    this.selectedTerm[a.projectId] = null;
    this.persistUi();
    this.focusComposer++;
  }

  selectTerm(id: string | null) {
    const p = this.project;
    if (p) this.selectedTerm[p.id] = id;
  }

  async newAgent(projectId = this.ui.activeProject) {
    if (!projectId) return;
    try {
      const a = await api.createAgent(projectId);
      this.agents[a.id] = a;
      this.selectAgent(a.id);
    } catch (e) {
      this.toast(String(e), 'error');
    }
  }

  /** Next agent waiting for an answer, across all projects (Ctrl+J). */
  nextWaiting() {
    const list = Object.values(this.agents)
      .filter((a) => !a.archived && a.status === 'waiting')
      .sort((a, b) => a.lastActivity - b.lastActivity);
    if (!list.length) return;
    const cur = this.agent?.id;
    const idx = list.findIndex((a) => a.id === cur);
    this.selectAgent(list[(idx + 1) % list.length].id);
  }

  toast(text: string, kind: Toast['kind'] = 'info') {
    const id = ++this.toastId;
    this.toasts.push({ id, text, kind });
    setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 3500);
  }

  async run<T>(p: Promise<T>): Promise<T | undefined> {
    try {
      return await p;
    } catch (e) {
      this.toast(String(e), 'error');
      return undefined;
    }
  }
}

export const app = new AppState();
