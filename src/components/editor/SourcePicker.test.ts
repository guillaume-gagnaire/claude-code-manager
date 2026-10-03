import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { agent, gitInfo, project } from '../../test/ipc';
import SourcePicker from './SourcePicker.svelte';

describe('SourcePicker', () => {
  const wt = agent({
    id: 'a2',
    name: 'refacto',
    worktree: { path: 'C:\\code\\demo-api\\.claude\\worktrees\\refacto', branch: 'escouade/refacto', baseBranch: 'main' },
  });

  it('offers the project branch and each worktree, with their changes', async () => {
    const onpick = vi.fn();
    render(SourcePicker, {
      project: project(),
      source: 'project',
      agents: [wt],
      git: gitInfo({ modified: 2, added: 1, agents: { a2: 4 } }),
      onpick,
    });
    await userEvent.click(screen.getByRole('button', { name: /Source : main/ }));
    expect(screen.getByRole('menuitemradio', { name: /main/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /main/ })).toHaveTextContent('Δ 3');
    expect(screen.getByRole('menuitemradio', { name: /refacto/ })).toHaveTextContent('4 modif.');
    await userEvent.click(screen.getByRole('menuitemradio', { name: /refacto/ }));
    expect(onpick).toHaveBeenCalledWith('a2');
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
  });
});
