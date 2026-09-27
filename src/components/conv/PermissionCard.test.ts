import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PermissionItem } from '../../lib/types';
import { fakeBackend, resetApp } from '../../test/ipc';
import PermissionCard from './PermissionCard.svelte';

const item = (over: Partial<PermissionItem> = {}): PermissionItem => ({
  kind: 'permission',
  id: 'req-2',
  toolUseId: 't2',
  toolName: 'Bash',
  input: { command: 'rm -rf build' },
  reason: 'Commande destructive',
  canAlways: true,
  defaultNo: false,
  decision: null,
  ts: 1,
  ...over,
});

describe('PermissionCard', () => {
  beforeEach(() => resetApp());

  it('shows the command and the reason, and allows it', async () => {
    const backend = fakeBackend();
    render(PermissionCard, { item: item(), agentId: 'a1', pending: true, cwd: 'C:\\code' });
    expect(screen.getByText('rm -rf build')).toBeInTheDocument();
    expect(screen.getByText('Commande destructive')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Autoriser' }));
    expect(backend.called('answer_permission')[0].args).toEqual({ id: 'a1', requestId: 'req-2', decision: 'allow', message: null });
  });

  it('offers "always" only when Claude suggests a rule', async () => {
    const backend = fakeBackend();
    const { unmount } = render(PermissionCard, { item: item(), agentId: 'a1', pending: true, cwd: 'C:\\code' });
    await userEvent.click(screen.getByRole('button', { name: 'Toujours autoriser' }));
    expect(backend.called('answer_permission')[0].args.decision).toBe('always');
    unmount();
    render(PermissionCard, { item: item({ canAlways: false }), agentId: 'a1', pending: true, cwd: 'C:\\code' });
    expect(screen.queryByRole('button', { name: 'Toujours autoriser' })).not.toBeInTheDocument();
  });

  it('renders a proposed plan and keeps planning on refusal', async () => {
    const backend = fakeBackend();
    render(PermissionCard, {
      item: item({ toolName: 'ExitPlanMode', input: { plan: '## Plan\n\n1. Écrire les tests' } }),
      agentId: 'a1',
      pending: true,
      cwd: 'C:\\code',
    });
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuer à planifier' }));
    const args = backend.called('answer_permission')[0].args;
    expect(args.decision).toBe('deny');
    expect(args.message).toMatch(/planifier/);
  });

  it('summarizes the decision once answered', () => {
    render(PermissionCard, {
      item: item({ decision: 'deny', message: 'utilise npm run clean' }),
      agentId: 'a1',
      pending: false,
      cwd: 'C:\\code',
    });
    expect(screen.getByText(/Refusé/)).toBeInTheDocument();
    expect(screen.getByText(/utilise npm run clean/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
