import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EditorTabs from './EditorTabs.svelte';

describe('EditorTabs', () => {
  const tabs = [
    { path: 'src/a.ts', name: 'a.ts', dirty: true, status: 'M' as const, active: true },
    { path: 'b.ts', name: 'b.ts', dirty: false, status: null, active: false },
  ];

  it('selects and closes tabs, the unsaved one marked', async () => {
    const onselect = vi.fn();
    const onclose = vi.fn();
    render(EditorTabs, { tabs, onselect, onclose });
    expect(screen.getByRole('tab', { name: /a\.ts/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Fermer a.ts' })).toHaveClass('dirty');
    await userEvent.click(screen.getByRole('tab', { name: /b\.ts/ }));
    expect(onselect).toHaveBeenCalledWith('b.ts');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer b.ts' }));
    expect(onclose).toHaveBeenCalledWith('b.ts');
    expect(onselect).toHaveBeenCalledTimes(1);
  });
});
