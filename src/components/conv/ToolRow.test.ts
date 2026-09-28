import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { app } from '../../lib/state.svelte';
import type { ToolItem } from '../../lib/types';
import ToolRow from './ToolRow.svelte';

const CWD = 'C:\\code\\app';
const tool = (over: Partial<ToolItem>): ToolItem => ({ kind: 'tool', id: 't', name: 'Bash', input: {}, status: 'ok', ts: 0, ...over });

describe('ToolRow', () => {
  it('shows an edit with its line counts and expands to the diff', async () => {
    render(ToolRow, {
      item: tool({
        name: 'Edit',
        input: { file_path: 'C:\\code\\app\\src\\auth.ts' },
        result: { isError: false, add: 2, del: 1, patch: [{ oldStart: 4, newStart: 4, lines: ['-old line', '+new line', '+another'] }] },
      }),
      cwd: CWD,
    });
    expect(screen.getByText('src/auth.ts')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('−1')).toBeInTheDocument();
    expect(screen.queryByText('new line')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('new line')).toBeInTheDocument();
    expect(screen.getByText('old line')).toBeInTheDocument();
  });

  it('shows an edit side by side when that diff style is chosen', async () => {
    app.diffSplit = true;
    try {
      render(ToolRow, {
        item: tool({
          name: 'Edit',
          input: { file_path: 'C:\\code\\app\\src\\auth.ts' },
          result: { isError: false, add: 1, del: 1, patch: [{ oldStart: 4, newStart: 4, lines: ['-old line', '+new line'] }] },
        }),
        cwd: CWD,
      });
      await userEvent.click(screen.getByRole('button', { expanded: false }));
      expect(screen.getByText('old line').closest('.srow')).toHaveTextContent('new line');
    } finally {
      app.diffSplit = false;
    }
  });

  it('shows the command output of a Bash call when expanded', async () => {
    render(ToolRow, { item: tool({ input: { command: 'npm test' }, result: { isError: false, text: 'building\n12 passed' } }), cwd: CWD });
    expect(screen.getByText('12 passed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('$ npm test')).toBeInTheDocument();
  });

  it('shows a spinner while running and cannot be expanded yet', async () => {
    render(ToolRow, { item: tool({ status: 'running', input: { command: 'npm ci' } }), cwd: CWD });
    expect(screen.getByLabelText('en cours')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /npm ci/ }));
    expect(screen.getByRole('button', { name: /npm ci/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('$ npm ci')).not.toBeInTheDocument();
  });

  it('lists subagent tools under the Agent call', async () => {
    const child = tool({
      id: 'c1',
      name: 'Read',
      input: { file_path: 'C:\\code\\app\\README.md' },
      parent: 't',
      result: { isError: false, text: 'a\nb' },
    });
    render(ToolRow, {
      item: tool({ name: 'Task', input: { description: 'Explorer', prompt: 'Trouve les routes' } }),
      cwd: CWD,
      childrenOf: (id: string) => (id === 't' ? [child] : []),
    });
    expect(screen.getByText('1 outil')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Explorer/ }));
    expect(screen.getByText('Trouve les routes')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('shows the tools of a subagent started by a subagent', async () => {
    const inner = tool({ id: 'inner', name: 'Task', input: { description: 'Sous-tâche' }, parent: 'outer' });
    const leaf = tool({ id: 'leaf', name: 'Grep', input: { pattern: 'TODO' }, parent: 'inner', result: { isError: false, text: 'a.ts' } });
    const all: Record<string, ToolItem[]> = { outer: [inner], inner: [leaf] };
    render(ToolRow, {
      item: tool({ id: 'outer', name: 'Task', input: { description: 'Principale' } }),
      cwd: CWD,
      childrenOf: (id: string) => all[id] ?? [],
    });
    await userEvent.click(screen.getByRole('button', { name: /Principale/ }));
    await userEvent.click(screen.getByRole('button', { name: /Sous-tâche/ }));
    expect(screen.getByText('TODO')).toBeInTheDocument();
  });

  it('flags failed tools', () => {
    const { container } = render(ToolRow, {
      item: tool({ status: 'error', input: { command: 'npm run x' }, result: { isError: true, text: 'npm ERR! missing script' } }),
      cwd: CWD,
    });
    expect(container.querySelector('.tool.err')).not.toBeNull();
    expect(screen.getByText('npm ERR! missing script')).toBeInTheDocument();
  });
});
