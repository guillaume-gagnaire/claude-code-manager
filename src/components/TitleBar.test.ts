import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { menu } from '../lib/menu.svelte';
import { app } from '../lib/state.svelte';
import { agent, fakeBackend, gitInfo, project, resetApp } from '../test/ipc';
import ConfirmModal from './modals/ConfirmModal.svelte';
import TitleBar from './TitleBar.svelte';

async function closeProjectFromMenu(name: string) {
  await fireEvent.contextMenu(screen.getByRole('button', { name: new RegExp(name) }));
  menu.open!.items.find((i) => i.label.startsWith('Fermer le projet'))!.onClick!();
  if (app.modal?.kind !== 'confirm') throw new Error('no confirmation');
  render(ConfirmModal, app.modal);
  await userEvent.click(screen.getByRole('button', { name: 'Fermer le projet' }));
}

describe('TitleBar', () => {
  beforeEach(() =>
    resetApp({
      projects: [project(), project({ id: 'p2', name: 'studio-web' })],
      agents: [agent({ status: 'waiting' }), agent({ id: 'b1', projectId: 'p2', status: 'running' })],
    }),
  );

  it('shows the app’s logo', () => {
    fakeBackend();
    render(TitleBar);
    expect(screen.getByRole('img', { name: 'Escouade' })).toHaveAttribute('src', '/logo.svg');
  });

  it('shows one tab per project with its waiting badge and git counter', () => {
    fakeBackend();
    app.git = { p1: gitInfo({ modified: 2, added: 1, total: 3 }) };
    render(TitleBar);
    const tab = screen.getByRole('button', { name: /demo-api/ });
    expect(tab).toHaveTextContent('Δ 3');
    expect(tab.querySelector('.pill')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /studio-web/ }).querySelector('.pill')).toBeNull();
  });

  it('switches project and opens the stats', async () => {
    fakeBackend();
    render(TitleBar);
    await userEvent.click(screen.getByRole('button', { name: /studio-web/ }));
    expect(app.project?.id).toBe('p2');
    await userEvent.click(screen.getByRole('button', { name: /Stats/ }));
    expect(app.ui.view).toBe('stats');
  });

  it('closes a project once the backend removed it', async () => {
    const backend = fakeBackend();
    render(TitleBar);
    await closeProjectFromMenu('studio-web');
    expect(backend.called('remove_project')[0].args).toEqual({ id: 'p2' });
    expect(app.projects.map((p) => p.id)).toEqual(['p1']);
  });

  it('stops the launch commands of a closed project without calling it a crash', async () => {
    const run = { id: 'c9', name: 'Front', command: 'npm run dev', shell: 'pwsh', cwd: '' };
    resetApp({ projects: [project(), project({ id: 'p2', name: 'studio-web', runCommands: [run] })] });
    app.launches.c9 = { status: 'running', ptyId: 't9', name: 'Front', stopping: false, code: null, startedAt: 1 };
    let stoppingDuringRemoval = false;
    const backend = fakeBackend({ remove_project: () => void (stoppingDuringRemoval = app.launches.c9.stopping) });
    render(TitleBar);
    await closeProjectFromMenu('studio-web');
    // The backend kills them while removing the project: their exits are expected.
    expect(stoppingDuringRemoval).toBe(true);
    expect(backend.called('term_kill')[0].args).toEqual({ id: 't9' });
    expect(app.launches.c9).toBeUndefined();
  });

  it('leaves the launch commands alone when the project could not be closed', async () => {
    const run = { id: 'c9', name: 'Front', command: 'npm run dev', shell: 'pwsh', cwd: '' };
    resetApp({ projects: [project(), project({ id: 'p2', name: 'studio-web', runCommands: [run] })] });
    app.launches.c9 = { status: 'running', ptyId: 't9', name: 'Front', stopping: false, code: null, startedAt: 1 };
    const backend = fakeBackend({
      remove_project: () => {
        throw new Error('projet verrouillé');
      },
    });
    render(TitleBar);
    await closeProjectFromMenu('studio-web');
    expect(backend.called('term_kill')).toHaveLength(0);
    expect(app.launches.c9).toMatchObject({ status: 'running', stopping: false });
  });

  it('opens the launch commands of a project from its tab menu', async () => {
    fakeBackend();
    render(TitleBar);
    await fireEvent.contextMenu(screen.getByRole('button', { name: /studio-web/ }));
    menu.open!.items.find((i) => i.label === 'Commandes de lancement…')!.onClick!();
    expect(app.modal).toEqual({ kind: 'runConfig', projectId: 'p2' });
  });

  it('keeps the project when the backend could not remove it', async () => {
    fakeBackend({
      remove_project: () => {
        throw new Error('projet verrouillé');
      },
    });
    render(TitleBar);
    await closeProjectFromMenu('studio-web');
    expect(app.projects.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(app.toasts.at(-1)?.text).toMatch(/projet verrouillé/);
  });
});

describe('TitleBar editor button', () => {
  beforeEach(() => {
    resetApp({ projects: [project(), project({ id: 'p2', name: 'studio-web', path: 'C:\\code\\studio-web' })] });
    app.ui.activeProject = 'p2';
    app.editors = [
      { id: 'vscode', label: 'VS Code', command: 'code' },
      { id: 'zed', label: 'Zed', command: 'zed' },
    ];
    menu.close();
  });
  const button = () => screen.queryByRole('button', { name: 'Ouvrir le projet dans un éditeur' });

  it('opens the active project’s folder in an installed editor', async () => {
    const backend = fakeBackend();
    render(TitleBar);
    await userEvent.click(button()!);
    expect(menu.open!.items.map((i) => i.label)).toEqual(['Ouvrir dans VS Code', 'Ouvrir dans Zed', '', 'Ouvrir dans l’explorateur']);
    menu.open!.items[1].onClick!();
    expect(backend.called('open_in_editor')[0].args).toEqual({ path: 'C:\\code\\studio-web', editor: 'zed' });
  });

  it('is only there for a project', () => {
    fakeBackend();
    app.ui.view = 'stats';
    render(TitleBar);
    expect(button()).toBeNull();
  });
});
