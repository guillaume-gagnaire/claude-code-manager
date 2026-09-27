import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../lib/state.svelte';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
import Sidebar from './Sidebar.svelte';

describe('Sidebar', () => {
  beforeEach(() =>
    resetApp({
      projects: [project()],
      agents: [
        agent({ status: 'running' }),
        agent({ id: 'a2', name: 'tests-e2e', status: 'waiting', createdAt: 2 }),
        agent({ id: 'a3', name: 'vieux', archived: true }),
      ],
    }),
  );

  it('lists the project’s agents with their status', () => {
    fakeBackend();
    render(Sidebar, { project: project() });
    const cards = screen.getAllByRole('button', { name: /refacto-auth|tests-e2e/ });
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('En cours')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Question')).toBeInTheDocument();
    expect(screen.getByText(/Archivés \(1\)/)).toBeInTheDocument();
  });

  it('renames an agent once with Enter (the blur that follows does not rename again)', async () => {
    const backend = fakeBackend();
    render(Sidebar, { project: project() });
    await userEvent.dblClick(screen.getByText('refacto-auth'));
    const input = screen.getByDisplayValue('refacto-auth');
    await userEvent.clear(input);
    await userEvent.type(input, 'auth-jwt{Enter}');
    expect(backend.called('rename_agent')).toEqual([{ cmd: 'rename_agent', args: { id: 'a1', name: 'auth-jwt' } }]);
  });

  it('cancels a rename with Escape', async () => {
    const backend = fakeBackend();
    render(Sidebar, { project: project() });
    await userEvent.dblClick(screen.getByText('refacto-auth'));
    await userEvent.type(screen.getByDisplayValue('refacto-auth'), 'xx{Escape}');
    expect(backend.called('rename_agent')).toHaveLength(0);
    expect(screen.getByText('refacto-auth')).toBeInTheDocument();
  });

  it('creates an agent', async () => {
    const backend = fakeBackend({ create_agent: () => agent({ id: 'a4', name: 'agent-3', createdAt: 4 }) });
    render(Sidebar, { project: project() });
    await userEvent.click(screen.getByRole('button', { name: /Nouvel agent/ }));
    expect(backend.called('create_agent')[0].args).toEqual({ projectId: 'p1', model: null });
    expect(app.agent?.id).toBe('a4');
  });

  it('labels each color swatch', () => {
    fakeBackend();
    render(Sidebar, { project: project() });
    const swatches = screen.getAllByRole('button', { name: /^Couleur \d+/ });
    expect(new Set(swatches.map((s) => s.getAttribute('aria-label'))).size).toBe(swatches.length);
  });
});
