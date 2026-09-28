import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../lib/state.svelte';
import type { LaunchState, RunCommand } from '../lib/types';
import { fakeBackend, project, resetApp } from '../test/ipc';
import RunsSection from './RunsSection.svelte';

vi.mock('../lib/terminals', () => ({
  launchLog: () => ({
    term: { cols: 80, rows: 24, buffer: { active: { cursorY: 0 } }, write: (_: unknown, done?: () => void) => done?.() },
    fit: { fit() {} },
  }),
  disposeLog() {},
}));

const FRONT: RunCommand = { id: 'c1', name: 'Front', command: 'npm run dev', shell: 'pwsh', cwd: 'web' };
const API: RunCommand = { id: 'c2', name: 'API', command: 'cargo run', shell: 'bash', cwd: '' };
const P = project({ runCommands: [FRONT, API] });

const state = (over: Partial<LaunchState>): LaunchState => ({
  status: 'running',
  ptyId: 't1',
  name: 'Front',
  stopping: false,
  code: null,
  startedAt: 1,
  ...over,
});

const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('RunsSection', () => {
  beforeEach(() => resetApp({ projects: [P] }));

  it('lists the launch commands with their live status', () => {
    fakeBackend();
    app.launches.c2 = state({ status: 'crashed', code: 2, ptyId: null, name: 'API' });
    render(RunsSection, { project: P });
    expect(within(row('Front')).getByText('prêt')).toBeInTheDocument();
    expect(within(row('API')).getByText('planté (code 2)')).toBeInTheDocument();
  });

  it('shows a command’s log when it is clicked', async () => {
    fakeBackend();
    render(RunsSection, { project: P });
    await userEvent.click(row('API'));
    expect(app.selectedLaunch.p1).toBe('c2');
    expect(row('API')).toHaveClass('sel');
  });

  it('starts a command, then offers to restart or stop it', async () => {
    const backend = fakeBackend({ run_start: () => ({ id: 't1', projectId: 'p1', name: 'Front', shell: 'pwsh' }) });
    render(RunsSection, { project: P });
    await userEvent.click(within(row('Front')).getByRole('button', { name: 'Lancer' }));
    expect(backend.called('run_start')[0].args).toMatchObject({ projectId: 'p1', commandId: 'c1' });
    expect(await within(row('Front')).findByText('en cours')).toBeInTheDocument();
    expect(within(row('Front')).getByRole('button', { name: 'Relancer' })).toBeInTheDocument();
    await userEvent.click(within(row('Front')).getByRole('button', { name: 'Stopper' }));
    expect(backend.called('term_kill')[0].args).toEqual({ id: 't1' });
    // Starting from the row does not open its log.
    expect(app.selectedLaunch.p1 ?? null).toBeNull();
  });

  it('starts them all, then stops them all', async () => {
    let n = 0;
    const backend = fakeBackend({ run_start: () => ({ id: `t${++n}`, projectId: 'p1', name: 'x', shell: 'pwsh' }) });
    render(RunsSection, { project: P });
    await userEvent.click(screen.getByRole('button', { name: 'Tout lancer' }));
    expect(backend.called('run_start').map((c) => c.args.commandId)).toEqual(['c1', 'c2']);
    await userEvent.click(await screen.findByRole('button', { name: 'Tout arrêter' }));
    expect(backend.called('term_kill').map((c) => c.args.id)).toEqual(['t1', 't2']);
  });

  it('opens the configuration, also when there is nothing to launch yet', async () => {
    fakeBackend();
    render(RunsSection, { project: project() });
    expect(screen.queryByRole('button', { name: 'Tout lancer' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Configurer' }));
    expect(app.modal).toEqual({ kind: 'runConfig', projectId: 'p1' });
  });

  it('edits the commands from the section header', async () => {
    fakeBackend();
    render(RunsSection, { project: P });
    await userEvent.click(screen.getByRole('button', { name: 'Commandes de lancement…' }));
    expect(app.modal).toEqual({ kind: 'runConfig', projectId: 'p1' });
  });
});
