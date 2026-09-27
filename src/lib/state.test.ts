import { describe, expect, it } from 'vitest';
import { agent, fakeBackend, project, SETTINGS } from '../test/ipc';
import { conversationOf } from './conversations.svelte';
import { app } from './state.svelte';
import type { InitialState, UiEvent } from './types';

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

  it('falls back to the first project when the saved one is gone', async () => {
    await start({ ui: { activeProject: 'deleted', view: 'project', selectedAgent: {} } });
    expect(app.project?.id).toBe('p1');
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
    emit({ type: 'conv', agentId: 'a1', ops: [{ op: 'append', item: { kind: 'user', id: 'u1', text: 'Salut', images: 0, ts: 1, queued: false } }] });
    expect(c.items.map((i) => i.id)).toEqual(['u1']);
  });

  it('only bumps the files refresh tick for the active project', async () => {
    const { emit } = await start();
    const before = app.gitTick;
    const git = { isRepo: true, branch: 'main', modified: 1, added: 0, deleted: 0, total: 1, agents: {} };
    emit({ type: 'git', projectId: 'p2', git });
    expect(app.gitTick).toBe(before);
    expect(app.git.p2.total).toBe(1);
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
