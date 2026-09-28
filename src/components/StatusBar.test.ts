import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../lib/state.svelte';
import { agent, fakeBackend, resetApp } from '../test/ipc';
import StatusBar from './StatusBar.svelte';

describe('StatusBar', () => {
  beforeEach(() => {
    resetApp({
      agents: [
        agent({ id: 'a1', status: 'running' }),
        agent({ id: 'a2', status: 'waiting' }),
        agent({ id: 'a3', status: 'waiting', archived: true }),
        agent({ id: 'a4', status: 'done' }),
      ],
    });
    app.now = Date.UTC(2026, 8, 27, 20, 0, 0);
  });

  it('counts active, waiting and finished agents (archived excluded)', () => {
    fakeBackend();
    render(StatusBar);
    expect(screen.getByText('1 actif')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1 en attente/ })).toBeInTheDocument();
    expect(screen.getByText('1 terminé')).toBeInTheDocument();
  });

  it('shows quotas with the time left before the session reset, and the day cost', () => {
    fakeBackend();
    app.usage = {
      fiveHour: { pct: 62, resetsAt: app.now + (1 * 3600 + 48 * 60) * 1000 },
      sevenDay: { pct: 38.4, resetsAt: null },
      todayCost: 4.12,
      updatedAt: 1,
    };
    render(StatusBar);
    expect(screen.getByText('62 %')).toBeInTheDocument();
    expect(screen.getByText('reset 1h48')).toBeInTheDocument();
    expect(screen.getByText('38 %')).toBeInTheDocument();
    expect(screen.getByText(/4,12/)).toBeInTheDocument();
  });

  it('shows dashes when quotas are unknown', () => {
    fakeBackend();
    render(StatusBar);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('toggles the sound and saves the setting', async () => {
    const backend = fakeBackend({ save_settings: () => [] });
    render(StatusBar);
    await userEvent.click(screen.getByRole('button', { name: '♪ On' }));
    expect(screen.getByRole('button', { name: '♪ Off' })).toBeInTheDocument();
    expect(backend.called('save_settings')[0].args.settings.sound).toBe(false);
  });

  it('jumps to the waiting agent', async () => {
    fakeBackend();
    render(StatusBar);
    await userEvent.click(screen.getByRole('button', { name: /1 en attente/ }));
    expect(app.agent?.id).toBe('a2');
  });
});

describe('StatusBar day cost', () => {
  it('includes what running turns cost so far, marked as an estimate', () => {
    resetApp({ agents: [agent({ id: 'a1', status: 'running', liveCost: 0.5 }), agent({ id: 'a2', liveCost: 0.25 })] });
    app.usage = { fiveHour: null, sevenDay: null, todayCost: 1, updatedAt: 1 };
    fakeBackend();
    render(StatusBar);
    expect(screen.getByText('≈ 1,75 $')).toBeInTheDocument();
  });
});
