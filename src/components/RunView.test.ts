import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../lib/state.svelte';
import type { RunCommand } from '../lib/types';
import { fakeBackend, project, resetApp } from '../test/ipc';
import RunView from './RunView.svelte';

const mounted = vi.hoisted(() => [] as (string | null)[]);
vi.mock('../lib/terminals', () => ({
  launchLog: () => ({
    term: {
      cols: 80,
      rows: 24,
      buffer: { active: { cursorY: 0 } },
      write: (_: unknown, done?: () => void) => done?.(),
      clear() {},
      focus() {},
    },
    fit: { fit() {} },
    search: {},
  }),
  disposeLog() {},
  getXTerm: () => undefined,
  logKey: (id: string) => `run:${id}`,
  mountTerminal: (key: string, el: HTMLElement | null) => mounted.push(el ? key : null),
}));

const FRONT: RunCommand = { id: 'c1', name: 'Front', command: 'npm run dev', shell: 'pwsh', cwd: 'web' };
const P = project({ runCommands: [FRONT] });

describe('RunView', () => {
  beforeEach(() => {
    resetApp({ projects: [P] });
    app.shells = [{ id: 'pwsh', label: 'PowerShell 7', path: 'pwsh.exe' }];
    mounted.length = 0;
  });

  it('shows the command, where it runs, and its log', () => {
    fakeBackend();
    render(RunView, { cmd: FRONT, project: P });
    expect(screen.getByText('Front')).toBeInTheDocument();
    expect(screen.getByText('npm run dev')).toBeInTheDocument();
    expect(screen.getByText('PowerShell 7')).toBeInTheDocument();
    expect(screen.getByText(/demo-api[\\/]web/)).toBeInTheDocument();
    expect(mounted).toEqual(['run:c1']);
    expect(screen.getByText('Pas encore lancée.')).toBeInTheDocument();
  });

  it('starts, then stops the command', async () => {
    const backend = fakeBackend({ run_start: () => ({ id: 't1', projectId: 'p1', name: 'Front', shell: 'pwsh' }) });
    render(RunView, { cmd: FRONT, project: P });
    await userEvent.click(screen.getAllByRole('button', { name: /Lancer/ })[0]);
    expect(backend.called('run_start')[0].args).toMatchObject({ commandId: 'c1' });
    expect(await screen.findByText('en cours')).toBeInTheDocument();
    expect(screen.queryByText('Pas encore lancée.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Stopper/ }));
    expect(backend.called('term_kill')[0].args).toEqual({ id: 't1' });
  });

  it('says how the last run ended', () => {
    fakeBackend();
    app.launches.c1 = { status: 'crashed', ptyId: null, name: 'Front', stopping: false, code: 1, startedAt: 1 };
    render(RunView, { cmd: FRONT, project: P });
    expect(screen.getByText('planté (code 1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Relancer/ })).toBeInTheDocument();
  });
});
