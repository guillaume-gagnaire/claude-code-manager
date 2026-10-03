import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { treeRows } from '../../lib/editor/tree';
import FileTree from './FileTree.svelte';

describe('FileTree', () => {
  const rows = treeRows(['src/app.ts', 'README.md'], { src: true }, { 'src/app.ts': 'M' });

  it('opens folders and files', async () => {
    const ontoggle = vi.fn();
    const onopen = vi.fn();
    render(FileTree, { rows, active: 'README.md', ontoggle, onopen });
    await userEvent.click(screen.getByRole('treeitem', { name: /src/, expanded: true }));
    expect(ontoggle).toHaveBeenCalledWith('src');
    await userEvent.click(screen.getByRole('treeitem', { name: /app\.ts/ }));
    expect(onopen).toHaveBeenCalledWith('src/app.ts');
    expect(screen.getByRole('treeitem', { name: /README\.md/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the git status of a file and a dot on its folder', () => {
    render(FileTree, { rows, active: null, ontoggle: () => {}, onopen: () => {} });
    expect(screen.getByRole('treeitem', { name: /app\.ts/ })).toHaveTextContent('M');
    expect(screen.getByRole('treeitem', { name: /src/ })).toHaveTextContent('•');
  });
});
