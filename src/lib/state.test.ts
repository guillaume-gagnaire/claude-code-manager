import { describe, expect, it } from 'vitest';
import { agent, fakeBackend, gitInfo, project, SETTINGS } from '../test/ipc';
import { conversationOf } from './conversations.svelte';
import { app } from './state.svelte';
import type { InitialState, LaunchState, UiEvent } from './types';

/** Starts the app against a fake backend and returns a function pushing backend events. */
async function start(over: Partial<InitialState> = {}) {
  let channel: { onmessage: (e: UiEvent) => void } | null = null;
  const initial: InitialState = {
    projects: [project(), project({ id: 'p2', name: 'studio-web' })],
    agents: [agent(), agent({ id: 'a2', name: 'tests-e2e', createdAt: 2 }), agent({ id: 'b1', projectId: 'p2', name: 'landing' })],
    ui: { activeProject: 'p1', view: 'project', selectedAgent: {} },
    settings: SETTINGS,
    usage: { fiveHour: null, sevenDay: null, todayCost: 0, updatedAt: 0 },
    git: {},
    shells: [],
    editors: [],
    terminals: [],
    claudeFound: true,
    version: '0.1.0',
    ...over,
  };
  const backend = fakeBackend({
    subscribe: (args: any) => {
      channel = args.channel;
      return initial;
    },
    get_conversation: () => [],
  });
  await app.init();
  return { backend, emit: (e: UiEvent) => channel!.onmessage(e) };
}

describe('AppState', () => {
  it('selects the first agent of the active project by default', async () => {
    await start();
    expect(app.project?.id).toBe('p1');
    expect(app.projectAgents.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(app.agent?.id).toBe('a1');
  });

  it('knows the editors installed on this machine', async () => {
    await start({ editors: [{ id: 'zed', label: 'Zed', command: 'zed' }] });
    expect(app.editors.map((e) => e.id)).toEqual(['zed']);
  });

  it('falls back to the first project when the saved one is gone', async () => {
    await start({ ui: { activeProject: 'deleted', view: 'project', selectedAgent: {} } });
    expect(app.project?.id).toBe('p1');
  });

  it('keeps what the running Claude processes use', async () => {
    const { emit } = await start();
    const resources = { instances: 1, memory: 300, cpu: 4.5, agents: [{ id: 'a1', memory: 300, cpu: 4.5 }] };
    emit({ type: 'resources', resources });
    expect(app.resources).toEqual(resources);
  });

  it('applies agent upserts and removals from the backend', async () => {
    const { emit } = await start();
    emit({ type: 'agent', agent: agent({ id: 'a2', name: 'tests-e2e', createdAt: 2, status: 'waiting' }) });
    expect(app.agents.a2.status).toBe('waiting');
    emit({ type: 'agentRemoved', id: 'a2', projectId: 'p1' });
    expect(app.projectAgents.map((a) => a.id)).toEqual(['a1']);
    expect(app.agents.a2).toBeUndefined();
  });

  it('routes conversation ops to the loaded conversation', async () => {
    const { emit } = await start();
    const c = conversationOf('a1');
    await new Promise((r) => setTimeout(r));
    emit({
      type: 'conv',
      agentId: 'a1',
      ops: [{ op: 'append', item: { kind: 'user', id: 'u1', text: 'Salut', images: 0, ts: 1, queued: false } }],
    });
    expect(c.items.map((i) => i.id)).toEqual(['u1']);
  });

  it('only bumps the files refresh tick for the active project', async () => {
    const { emit } = await start();
    const before = app.gitTick;
    const git = gitInfo({ modified: 1, total: 1, upstream: 'origin/main', behind: 2, hasRemote: true });
    emit({ type: 'git', projectId: 'p2', git });
    expect(app.gitTick).toBe(before);
    expect(app.git.p2.total).toBe(1);
    expect(app.git.p2.behind).toBe(2);
    emit({ type: 'git', projectId: 'p1', git });
    expect(app.gitTick).toBe(before + 1);
  });

  it('focuses the agent a notification was clicked for', async () => {
    const { emit, backend } = await start();
    app.openStats();
    emit({ type: 'focus', projectId: 'p2', agentId: 'b1' });
    expect(app.ui.view).toBe('project');
    expect(app.project?.id).toBe('p2');
    expect(app.agent?.id).toBe('b1');
    await new Promise((r) => setTimeout(r, 300));
    expect(backend.called('set_ui').at(-1)?.args.ui).toMatchObject({ activeProject: 'p2', selectedAgent: { p2: 'b1' } });
  });

  it('restores the saved screen layout, classic by default', async () => {
    await start();
    expect(app.split).toBe(false);
    await start({ ui: { activeProject: 'p1', view: 'project', selectedAgent: {}, layout: 'split' } });
    expect(app.split).toBe(true);
  });

  it('toggles the screen layout and saves it', async () => {
    const { backend } = await start();
    app.toggleLayout();
    expect(app.split).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(backend.called('set_ui').at(-1)?.args.ui).toMatchObject({ layout: 'split' });
    app.toggleLayout();
    expect(app.split).toBe(false);
  });

  it('cycles through waiting agents across projects', async () => {
    const { emit } = await start();
    emit({ type: 'agent', agent: agent({ id: 'a2', name: 'tests-e2e', createdAt: 2, status: 'waiting', lastActivity: 5 }) });
    emit({ type: 'agent', agent: agent({ id: 'b1', projectId: 'p2', name: 'landing', status: 'waiting', lastActivity: 9 }) });
    app.nextWaiting();
    expect(app.agent?.id).toBe('a2');
    app.nextWaiting();
    expect(app.agent?.id).toBe('b1');
    expect(app.project?.id).toBe('p2');
    app.nextWaiting();
    expect(app.agent?.id).toBe('a2');
  });

  it('turns backend errors into error toasts', async () => {
    await start();
    const out = await app.run(Promise.reject('Le dossier C:\\x n’existe plus'));
    expect(out).toBeUndefined();
    expect(app.toasts.at(-1)).toMatchObject({ kind: 'error', text: 'Le dossier C:\\x n’existe plus' });
  });
});

describe('AppState start-up', () => {
  it('keeps backend events received while the initial snapshot was loading', async () => {
    let channel: { onmessage: (e: UiEvent) => void } | null = null;
    let release!: (s: InitialState) => void;
    fakeBackend({
      subscribe: (args: any) => {
        channel = args.channel;
        return new Promise<InitialState>((r) => (release = r));
      },
    });
    const init = app.init();
    await new Promise((r) => setTimeout(r));
    // The agent started working before the (older) snapshot reached the UI.
    channel!.onmessage({ type: 'agent', agent: agent({ status: 'running', tokens: 500 }) });
    release({
      projects: [project()],
      agents: [agent({ status: 'done', tokens: 100 })],
      ui: { activeProject: 'p1', view: 'project', selectedAgent: {} },
      settings: SETTINGS,
      usage: { fiveHour: null, sevenDay: null, todayCost: 0, updatedAt: 0 },
      git: {},
      shells: [],
      editors: [],
      terminals: [],
      claudeFound: true,
      version: '0.1.0',
    });
    await init;
    expect(app.agents.a1).toMatchObject({ status: 'running', tokens: 500 });
  });
});

describe('AppState launch commands', () => {
  const running = (over: Partial<LaunchState> = {}): LaunchState => ({
    status: 'running',
    ptyId: 't9',
    name: 'Front',
    stopping: false,
    code: null,
    startedAt: 1,
    ...over,
  });

  it('marks a command that exits with an error as crashed, and says so', async () => {
    const { emit } = await start();
    app.launches.c1 = running();
    emit({ type: 'terminalExit', id: 't9', code: 2 });
    expect(app.launches.c1).toMatchObject({ status: 'crashed', code: 2, ptyId: null });
    expect(app.toasts.at(-1)).toMatchObject({ kind: 'error', text: expect.stringContaining('Front') });
  });

  it('does not call a stopped or finished command a crash', async () => {
    const { emit } = await start();
    app.launches.c1 = running({ stopping: true });
    app.launches.c2 = running({ ptyId: 't10', name: 'Build' });
    const toasts = app.toasts.length;
    emit({ type: 'terminalExit', id: 't9', code: 1 });
    emit({ type: 'terminalExit', id: 't10', code: 0 });
    expect(app.launches.c1.status).toBe('stopped');
    expect(app.launches.c2).toMatchObject({ status: 'done', code: 0 });
    expect(app.toasts.length).toBe(toasts);
  });

  it('shows one thing at a time in the main area: an agent, a terminal or a launch command', async () => {
    await start();
    app.selectLaunch('c1');
    expect(app.selectedLaunch.p1).toBe('c1');
    app.selectTerm('t1');
    expect(app.selectedLaunch.p1).toBeNull();
    app.selectLaunch('c1');
    expect(app.selectedTerm.p1).toBeNull();
    app.selectAgent('a1');
    expect(app.selectedLaunch.p1).toBeNull();
  });
});
