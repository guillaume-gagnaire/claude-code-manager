// Global application state (Svelte 5 runes) fed by the backend event channel.

import { api } from './ipc';
import { applyConvOps, dropConversation } from './conversations.svelte';
import { ancestors } from './editor/tree';
import { trees } from './editor/trees.svelte';
import { plural, relPath } from './format';
import { readPref, writePref } from './prefs';
import { applyTheme } from './theme';
import type {
  Agent,
  AgentStatus,
  GitInfo,
  LaunchState,
  ModelInfo,
  Project,
  Resources,
  Settings,
  ShellInfo,
  TermInfo,
  UiEvent,
  UiState,
  Usage,
} from './types';

export type Modal =
  | { kind: 'newProject' }
  | { kind: 'settings' }
  | { kind: 'diff'; projectId: string; agentId: string | null; paths: string[]; title: string; commit?: string }
  | {
      kind: 'confirm';
      title: string;
      body: string;
      confirm: string;
      danger?: boolean;
      option?: { label: string; value: boolean };
      onConfirm: (option: boolean) => void | Promise<void>;
    }
  | { kind: 'rename'; title: string; value: string; onSubmit: (v: string) => void | Promise<void> }
  | { kind: 'runConfig'; projectId: string };

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'ok';
}

/** Statuses that call for the user: a question, the end of a turn, an error. */
const ALERT: ReadonlySet<AgentStatus> = new Set(['waiting', 'done', 'error']);

export interface UpdateInfo {
  version: string;
  notes: string;
  install: () => Promise<void>;
}

/** What the editor shows for one source of a project. */
export interface EditorPlace {
  open: string[];
  active: string | null;
  /** Folders shown open in the tree. */
  expanded: Record<string, boolean>;
}

/** The editor of a project: shown or not, its source ('project' or an agent id) and, per source, its tabs. */
export interface EditorState {
  on: boolean;
  source: string;
  places: Record<string, EditorPlace>;
  /** A line to bring into view (`seq` changes for each request). */
  reveal: { path: string; line: number; seq: number } | null;
}

class AppState {
  ready = $state(false);
  projects = $state<Project[]>([]);
  agents = $state<Record<string, Agent>>({});
  ui = $state<UiState>({ activeProject: null, view: 'project', selectedAgent: {} });
  settings = $state<Settings>({} as Settings);
  usage = $state<Usage>({ fiveHour: null, sevenDay: null, todayCost: 0, updatedAt: 0 });
  resources = $state<Resources>({ instances: 0, memory: 0, cpu: 0, agents: [] });
  git = $state<Record<string, GitInfo>>({});
  shells = $state<ShellInfo[]>([]);
  terminals = $state<TermInfo[]>([]);
  exitedTerms = $state<Record<string, number | null>>({});
  /** Launch commands' latest runs, by command id. */
  launches = $state<Record<string, LaunchState>>({});
  selectedLaunch = $state<Record<string, string | null>>({});
  selectedTerm = $state<Record<string, string | null>>({});
  claudeFound = $state(true);
  /** Claude Code's models as it last reported them: the version each alias runs. */
  models = $state<ModelInfo[]>([]);
  version = $state('');
  filesOpen = $state(false);
  filesScope = $state<'agent' | 'project'>('agent');
  /** Tab of the side panel: uncommitted files or the repository history. */
  panelTab = $state<'files' | 'history'>('files');
  /** Side-by-side diffs (else unified), shared by the diff dialog and the split layout. */
  diffSplit = $state(readPref('diffSplit') === '1');
  showArchived = $state(false);
  modal = $state<Modal | null>(null);
  toasts = $state<Toast[]>([]);
  now = $state(Date.now());
  gitTick = $state(0);
  update = $state<UpdateInfo | null>(null);
  focusComposer = $state(0);
  /**
   * Agents that asked a question, finished or failed while not on screen, and that the user
   * has not looked at since: their project tab and their card blink.
   */
  attention = $state<Record<string, true>>({});
  editor = $state<Record<string, EditorState>>({});

  project = $derived(this.projects.find((p) => p.id === this.ui.activeProject) ?? null);
  /** The editor of the project on screen is open. */
  editorOn = $derived(!!(this.project && this.editor[this.project.id]?.on));
  split = $derived(this.ui.layout === 'split');
  /** Estimated cost of the turns running now (their exact cost joins `usage.todayCost` at their end). */
  liveCost = $derived(Object.values(this.agents).reduce((sum, a) => sum + (a.liveCost ?? 0), 0));

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

  /** The launch command whose log fills the main area, if any. */
  runCommand = $derived.by(() => {
    const p = this.project;
    if (!p) return null;
    const id = this.selectedLaunch[p.id];
    return p.runCommands.find((c) => c.id === id) ?? null;
  });

  private uiTimer: ReturnType<typeof setTimeout> | undefined;
  /** Events received while the initial snapshot is in flight (newer than the snapshot). */
  private early: UiEvent[] | null = null;
  private toastId = 0;

  async init() {
    this.early = [];
    const s = await api.subscribe((e) => (this.early ? this.early.push(e) : this.onEvent(e)));
    this.projects = s.projects;
    this.agents = Object.fromEntries(s.agents.map((a) => [a.id, a]));
    this.attention = {};
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
    this.models = s.models;
    const early = this.early;
    this.early = null;
    for (const e of early) this.onEvent(e);
    this.ready = true;
    setInterval(() => (this.now = Date.now()), 1000);
  }

  private onEvent(e: UiEvent) {
    switch (e.type) {
      case 'agent': {
        const prev = this.agents[e.agent.id];
        this.agents[e.agent.id] = e.agent;
        this.noteAttention(prev, e.agent);
        break;
      }
      case 'agentRemoved':
        delete this.agents[e.id];
        delete this.attention[e.id];
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
      case 'resources':
        this.resources = e.resources;
        break;
      case 'models':
        this.models = e.models;
        break;
      case 'focus':
        this.selectProject(e.projectId);
        if (e.agentId) this.selectAgent(e.agentId);
        break;
      case 'terminalExit':
        this.exitedTerms[e.id] = e.code;
        this.onLaunchExit(e.id, e.code);
        break;
      case 'quitRequested':
        this.modal = {
          kind: 'confirm',
          title: 'Quitter Escouade ?',
          body: `${plural(e.unsaved, 'fichier n’est pas enregistré', 'fichiers ne sont pas enregistrés')} dans l’éditeur : leurs modifications seront perdues.`,
          confirm: 'Quitter quand même',
          danger: true,
          onConfirm: () => api.quit(),
        };
        break;
    }
  }

  /** True when the user can see `id`'s conversation: selected, shown, window in front. */
  private onScreen(id: string): boolean {
    const shown = this.ui.view === 'project' && this.agent?.id === id && !this.term && !this.runCommand && !this.editorOn;
    return shown && (typeof document === 'undefined' || document.hasFocus());
  }

  /** An agent that comes to ask, finish or fail out of sight needs a look. */
  private noteAttention(prev: Agent | undefined, next: Agent) {
    if (!ALERT.has(next.status) || next.archived) {
      delete this.attention[next.id];
    } else if (prev && prev.status !== next.status && !this.onScreen(next.id)) {
      this.attention[next.id] = true;
    }
  }

  /** The agent on screen has been seen (called whenever what is on screen may have changed). */
  markSeen() {
    const id = this.agent?.id;
    if (id && this.attention[id] && this.onScreen(id)) delete this.attention[id];
  }

  /** Agents of `projectId` that need a look. */
  attentionIn(projectId: string): Agent[] {
    return Object.keys(this.attention)
      .map((id) => this.agents[id])
      .filter((a) => a && a.projectId === projectId && !a.archived);
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

  toggleLayout() {
    this.ui.layout = this.split ? '' : 'split';
    this.persistUi();
  }

  setDiffSplit(on: boolean) {
    this.diffSplit = on;
    writePref('diffSplit', on ? '1' : '0');
  }

  selectAgent(id: string) {
    const a = this.agents[id];
    if (!a) return;
    if (this.ui.activeProject !== a.projectId) this.ui.activeProject = a.projectId;
    this.ui.view = 'project';
    this.ui.selectedAgent[a.projectId] = id;
    this.selectedTerm[a.projectId] = null;
    this.selectedLaunch[a.projectId] = null;
    const ed = this.editor[a.projectId];
    if (ed?.on) {
      ed.source = a.worktree ? a.id : 'project';
      ed.places[ed.source] ??= { open: [], active: null, expanded: {} };
    }
    this.persistUi();
    this.focusComposer++;
  }

  selectTerm(id: string | null) {
    const p = this.project;
    if (!p) return;
    this.selectedTerm[p.id] = id;
    if (id) {
      this.selectedLaunch[p.id] = null;
      this.closeEditor(p.id);
    }
  }

  selectLaunch(commandId: string | null) {
    const p = this.project;
    if (!p) return;
    this.selectedLaunch[p.id] = commandId;
    if (commandId) {
      this.selectedTerm[p.id] = null;
      this.closeEditor(p.id);
    }
  }

  /** Opens the editor of a project on `source`; with a file (`path` from the source's root, or an absolute `abs`), shows it. */
  async openEditor(req: { projectId?: string; source: string; path?: string; abs?: string; line?: number }) {
    const projectId = req.projectId ?? this.ui.activeProject;
    if (!projectId) return;
    this.ui.activeProject = projectId;
    this.ui.view = 'project';
    this.selectedTerm[projectId] = null;
    this.selectedLaunch[projectId] = null;
    const st = (this.editor[projectId] ??= { on: true, source: req.source, places: {}, reveal: null });
    st.on = true;
    st.source = req.source;
    const place = (st.places[req.source] ??= { open: [], active: null, expanded: {} });
    let path = req.path;
    if (!path && req.abs) {
      const t = trees.get(projectId, req.source) ?? (await trees.load(projectId, req.source).catch(() => undefined));
      if (t) path = relPath(t.root, req.abs);
    }
    if (path) {
      if (!place.open.includes(path)) place.open.push(path);
      place.active = path;
      for (const d of ancestors(path)) place.expanded[d] = true;
      if (req.line) st.reveal = { path, line: req.line, seq: (st.reveal?.seq ?? 0) + 1 };
    }
    this.persistUi();
  }

  closeEditor(projectId = this.ui.activeProject) {
    const st = projectId ? this.editor[projectId] : undefined;
    if (st) st.on = false;
  }

  closeEditorTab(projectId: string, source: string, path: string) {
    const place = this.editor[projectId]?.places[source];
    if (!place) return;
    place.open = place.open.filter((p) => p !== path);
    if (place.active === path) place.active = place.open.at(-1) ?? null;
  }

  toggleEditorDir(projectId: string, source: string, dir: string) {
    const place = this.editor[projectId]?.places[source];
    if (place) place.expanded[dir] = !place.expanded[dir];
  }

  /** A launch command's process is up; it may have ended, or been stopped, in the meantime. */
  launchStarted(commandId: string, ptyId: string) {
    const l = this.launches[commandId];
    if (!l || l.stopping) api.termKill(ptyId).catch(() => {});
    if (!l) {
      delete this.exitedTerms[ptyId];
      return;
    }
    l.ptyId = ptyId;
    if (ptyId in this.exitedTerms) this.onLaunchExit(ptyId, this.exitedTerms[ptyId]);
  }

  /** A launch command's process ended: stopped on purpose, finished, or crashed. */
  private onLaunchExit(ptyId: string, code: number | null) {
    const l = Object.values(this.launches).find((x) => x.ptyId === ptyId);
    if (!l) return;
    delete this.exitedTerms[ptyId];
    const status = l.stopping ? 'stopped' : code === 0 ? 'done' : 'crashed';
    Object.assign(l, { status, code, ptyId: null, stopping: false });
    if (status === 'crashed') this.toast(`« ${l.name} » s'est arrêté en erreur (code ${code ?? '?'})`, 'error');
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

  /** Next agent waiting for an answer or needing a look, across all projects (Ctrl+J). */
  nextWaiting() {
    const list = Object.values(this.agents)
      .filter((a) => !a.archived && (a.status === 'waiting' || this.attention[a.id]))
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
