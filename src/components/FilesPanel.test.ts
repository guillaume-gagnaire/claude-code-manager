import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../lib/state.svelte';
import type { FileChange } from '../lib/types';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
import FilesPanel from './FilesPanel.svelte';

const change = (path: string, agentId: string | null = null): FileChange => ({ path, status: 'M', add: 3, del: 1, agentId });
const settle = () => new Promise((r) => setTimeout(r, 200));
const diffOf = (path: string, line: string) => `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1 +1 @@
-old
+${line}
`;

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

describe('FilesPanel docked in the split layout', () => {
  beforeEach(() =>
    resetApp({
      projects: [project()],
      agents: [agent(), agent({ id: 'a2', name: 'wt-agent', worktree: { path: 'C:/wt', branch: 'ccm/wt', baseBranch: 'main' } })],
    }),
  );

  it('shows the first file’s diff right away, and another file’s diff in place when picked', async () => {
    const backend = fakeBackend({
      git_files: () => [change('src/auth.ts', 'a1'), change('new.txt', 'a1')],
      git_diff: (a: any) => diffOf(a.paths[0], `contenu de ${a.paths[0]}`),
    });
    render(FilesPanel, { project: project(), agent: app.agents.a1, docked: true });
    expect(await screen.findByText('contenu de src/auth.ts')).toBeInTheDocument();
    expect(backend.called('git_diff').at(-1)?.args).toEqual({ projectId: 'p1', agentId: 'a1', paths: ['src/auth.ts'] });
    await userEvent.click(screen.getByRole('button', { name: /new\.txt/ }));
    expect(await screen.findByText('contenu de new.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new\.txt/ })).toHaveAttribute('aria-current', 'true');
    expect(app.modal).toBeNull();
    expect(screen.queryByTitle('Fermer')).not.toBeInTheDocument();
  });

  it('keeps the picked file across refreshes and falls back to the first one when it is gone', async () => {
    let files = [change('src/auth.ts', 'a1'), change('new.txt', 'a1')];
    let version = 1;
    fakeBackend({ git_files: () => files, git_diff: (a: any) => diffOf(a.paths[0], `${a.paths[0]} v${version}`) });
    render(FilesPanel, { project: project(), agent: app.agents.a1, docked: true });
    await userEvent.click(await screen.findByRole('button', { name: /new\.txt/ }));
    expect(await screen.findByText('new.txt v1')).toBeInTheDocument();
    version = 2;
    app.gitTick++;
    expect(await screen.findByText('new.txt v2')).toBeInTheDocument();
    files = [change('src/auth.ts', 'a1')];
    app.gitTick++;
    expect(await screen.findByText('src/auth.ts v2')).toBeInTheDocument();
  });

  it('reads a project-wide file from the worktree of the agent that owns it', async () => {
    const backend = fakeBackend({
      git_files: (a: any) => (a.agentId ? [] : [change('src/wt.ts', 'a2'), change('README.md', 'a1')]),
      git_diff: (a: any) => diffOf(a.paths[0], 'x'),
    });
    app.filesScope = 'project';
    render(FilesPanel, { project: project(), agent: app.agents.a1, docked: true });
    await screen.findAllByText('x');
    expect(backend.called('git_diff').at(-1)?.args).toEqual({ projectId: 'p1', agentId: 'a2', paths: ['src/wt.ts'] });
    await userEvent.click(screen.getByRole('button', { name: /README\.md/ }));
    await settle();
    expect(backend.called('git_diff').at(-1)?.args).toEqual({ projectId: 'p1', agentId: null, paths: ['README.md'] });
  });

  it('switches the diff to side by side', async () => {
    fakeBackend({ git_files: () => [change('src/auth.ts', 'a1')], git_diff: () => diffOf('src/auth.ts', 'new') });
    render(FilesPanel, { project: project(), agent: app.agents.a1, docked: true });
    await screen.findByText('new');
    await userEvent.click(screen.getByRole('button', { name: 'Côte à côte' }));
    expect(app.diffSplit).toBe(true);
    expect(screen.getByText('old').closest('.srow')).toHaveTextContent('new');
  });

  it('ignores a slow diff superseded by a newer one', async () => {
    let calls = 0;
    fakeBackend({
      git_files: () => [change('src/auth.ts', 'a1')],
      git_diff: () => {
        calls++;
        return calls === 1
          ? new Promise((r) => setTimeout(() => r(diffOf('src/auth.ts', 'ancien')), 500))
          : diffOf('src/auth.ts', 'récent');
      },
    });
    render(FilesPanel, { project: project(), agent: app.agents.a1, docked: true });
    await new Promise((r) => setTimeout(r, 200));
    app.gitTick++;
    await new Promise((r) => setTimeout(r, 700));
    expect(screen.getByText('récent')).toBeInTheDocument();
    expect(screen.queryByText('ancien')).not.toBeInTheDocument();
  });
});
