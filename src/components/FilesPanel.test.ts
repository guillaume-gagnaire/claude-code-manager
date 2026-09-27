import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../lib/state.svelte';
import type { FileChange } from '../lib/types';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
import FilesPanel from './FilesPanel.svelte';

const change = (path: string, agentId: string | null = null): FileChange => ({ path, status: 'M', add: 3, del: 1, agentId });
const settle = () => new Promise((r) => setTimeout(r, 200));

describe('FilesPanel', () => {
  beforeEach(() => resetApp({ projects: [project()], agents: [agent(), agent({ id: 'a2', name: 'tests-e2e' })] }));

  it('lists the agent’s files, then the whole project with the owning agent', async () => {
    const backend = fakeBackend({
      git_files: (a: any) => (a.agentId ? [change('src/auth.ts', 'a1')] : [change('src/auth.ts', 'a1'), change('README.md', 'a2')]),
    });
    render(FilesPanel, { project: project(), agent: app.agents.a1 });
    expect(await screen.findByText('auth.ts')).toBeInTheDocument();
    expect(backend.called('git_files').at(-1)?.args).toEqual({ projectId: 'p1', agentId: 'a1' });
    await userEvent.click(screen.getByRole('button', { name: 'Tout le projet' }));
    expect(await screen.findByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('tests-e2e')).toBeInTheDocument();
  });

  it('does not refetch when the agent object is merely updated', async () => {
    const backend = fakeBackend({ git_files: () => [change('src/auth.ts', 'a1')] });
    const { rerender } = render(FilesPanel, { project: project(), agent: app.agents.a1 });
    await settle();
    const before = backend.called('git_files').length;
    await rerender({ project: project(), agent: { ...app.agents.a1, tokens: 42 } });
    await settle();
    expect(backend.called('git_files').length).toBe(before);
  });

  it('ignores a slow response superseded by a newer one', async () => {
    let calls = 0;
    fakeBackend({
      git_files: () => {
        calls++;
        return calls === 1 ? new Promise((r) => setTimeout(() => r([change('old.ts', 'a1')]), 400)) : [change('new.ts', 'a1')];
      },
    });
    render(FilesPanel, { project: project(), agent: app.agents.a1 });
    await new Promise((r) => setTimeout(r, 150));
    app.gitTick++;
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.getByText('new.ts')).toBeInTheDocument();
    expect(screen.queryByText('old.ts')).not.toBeInTheDocument();
  });
});
