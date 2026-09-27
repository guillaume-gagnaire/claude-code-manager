import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { menu } from '../lib/menu.svelte';
import { app } from '../lib/state.svelte';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
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

  it('shows one tab per project with its waiting badge and git counter', () => {
    fakeBackend();
    app.git = { p1: { isRepo: true, branch: 'main', modified: 2, added: 1, deleted: 0, total: 3, agents: {} } };
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
