import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StatsView } from '../lib/types';
import { fakeBackend, project, resetApp } from '../test/ipc';
import Stats from './Stats.svelte';

const view = (range: string): StatsView => ({
  range,
  buckets: [
    { label: '26/09', start: 1, input: 1000, cache: 50_000, output: 2000, cost: 1.5, prompts: 3 },
    { label: '27/09', start: 2, input: 500, cache: 20_000, output: 1000, cost: 0.5, prompts: 1 },
  ],
  tokens: 74_500,
  tokensPrev: 50_000,
  cost: 2,
  costAll: 12.4,
  firstTs: Date.UTC(2026, 5, 1),
  prompts: 4,
  byProject: [
    { key: 'p1', tokens: 60_000, cost: 1.6 },
    { key: 'gone', tokens: 14_500, cost: 0.4 },
  ],
  byModel: [{ key: 'claude-opus-5-5', tokens: 74_500, cost: 2 }],
});

describe('Stats', () => {
  beforeEach(() => {
    localStorage.clear();
    resetApp({ projects: [project()] });
  });

  it('shows the KPIs of the period', async () => {
    fakeBackend({ stats: (a: any) => view(a.range) });
    render(Stats);
    await screen.findAllByText('74,5 k');
    const tokens = within(screen.getByText('Tokens').parentElement!);
    expect(tokens.getByText('74,5 k')).toBeInTheDocument();
    expect(tokens.getByText('14 derniers jours · +49 %')).toBeInTheDocument();
    const kpi = (label: string) => within(screen.getByText(label).parentElement!);
    expect(kpi('Coût global').getByText(/^2,00/)).toBeInTheDocument();
    expect(kpi('Coût global').getByText(/12,40 .* depuis le 1 juin 2026/)).toBeInTheDocument();
    expect(kpi('Coût moyen / prompt').getByText(/^0,50/)).toBeInTheDocument();
    expect(kpi('Prompts').getByText('4')).toBeInTheDocument();
  });

  it('switches range and remembers it', async () => {
    const backend = fakeBackend({ stats: (a: any) => view(a.range) });
    render(Stats);
    await screen.findAllByText('74,5 k');
    await userEvent.click(screen.getByRole('button', { name: 'Mois' }));
    await waitFor(() => expect(backend.called('stats').at(-1)?.args.range).toBe('month'));
    expect(localStorage.getItem('ccm.statsRange')).toBe('month');
  });

  it('offers a table view of the buckets', async () => {
    fakeBackend({ stats: (a: any) => view(a.range) });
    render(Stats);
    await screen.findAllByText('74,5 k');
    await userEvent.click(screen.getByRole('button', { name: 'Tableau' }));
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('26/09');
    expect(rows[1].textContent).toContain('50,0 k');
  });

  it('names projects and models, including closed projects', async () => {
    fakeBackend({ stats: (a: any) => view(a.range) });
    render(Stats);
    expect(await screen.findByText('demo-api')).toBeInTheDocument();
    expect(screen.getByText('Projet fermé')).toBeInTheDocument();
    expect(screen.getByText('Opus 5.5')).toBeInTheDocument();
  });
});

describe('Stats errors', () => {
  it('says when the statistics cannot be read', async () => {
    resetApp({ projects: [project()] });
    fakeBackend({
      stats: () => {
        throw new Error('base verrouillée');
      },
    });
    render(Stats);
    expect(await screen.findByText(/base verrouillée/)).toBeInTheDocument();
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });
});
