import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { buffers } from '../../lib/editor/buffers.svelte';
import { trees } from '../../lib/editor/trees.svelte';
import { app } from '../../lib/state.svelte';
import { agent, fakeBackend, gitInfo, project, resetApp } from '../../test/ipc';
import EditorView from './EditorView.svelte';

const text = (t: string, hash = 'h1') => ({ kind: 'text', text: t, size: t.length, hash, eol: 'lf', bom: false });

function backend(over: Record<string, (a: any) => unknown> = {}) {
  return fakeBackend({
    fs_tree: () => ({ root: 'C:/code/demo-api', files: ['README.md', 'src/app.ts'], truncated: false }),
    git_files: () => [{ path: 'src/app.ts', status: 'M', add: 1, del: 0, agentId: null, inWorktree: false }],
    fs_read: (a) => text(a.path === 'README.md' ? '# demo\n' : 'const a = 2;\n'),
    fs_base: () => ({ reference: 'HEAD', text: 'const a = 1;\n' }),
    fs_write: () => 'h2',
    set_unsaved: () => null,
    ...over,
  });
}

describe('EditorView', () => {
  beforeEach(() => {
    resetApp({ agents: [agent()] });
    app.git.p1 = gitInfo({ modified: 1 });
  });

  it('opens on the first changed file, with its tree, tab and comparison', async () => {
    backend();
    await app.openEditor({ source: 'project' });
    render(EditorView, { project: project() });
    expect(await screen.findByRole('tab', { name: /app\.ts/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('treeitem', { name: /src/ })).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('1 ligne modifiée vs HEAD')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Enregistré')).toBeInTheDocument();
  });

  it('saves what was typed', async () => {
    const be = backend();
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    await screen.findByRole('tab', { name: /app\.ts/ });
    const key = buffers.key('p1', 'project', 'src/app.ts');
    await expect.poll(() => buffers.all[key]?.kind).toBe('text');
    buffers.edit(key, 'const a = 3;\n');
    expect(await screen.findByText(/● Non enregistré/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(be.called('fs_write')[0].args).toMatchObject({ path: 'src/app.ts', text: 'const a = 3;\n', expectedHash: 'h1' });
    expect(await screen.findByText('Enregistré')).toBeInTheDocument();
  });

  it('warns when the file changed on disk, and reloads it', async () => {
    backend({ fs_write: () => Promise.reject('changed') });
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    const key = buffers.key('p1', 'project', 'src/app.ts');
    await expect.poll(() => buffers.all[key]?.kind).toBe('text');
    buffers.edit(key, 'mine\n');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce fichier a changé sur le disque.');
    await userEvent.click(screen.getByRole('button', { name: 'Recharger' }));
    expect(buffers.all[key].text).toBe('const a = 2;\n');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks before closing an unsaved tab', async () => {
    backend();
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    const key = buffers.key('p1', 'project', 'src/app.ts');
    await expect.poll(() => buffers.all[key]?.kind).toBe('text');
    buffers.edit(key, 'mine\n');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer app.ts' }));
    expect(app.modal).toMatchObject({ kind: 'confirm', title: 'Enregistrer « app.ts » ?', confirm: 'Enregistrer' });
    await (app.modal as any).alt.onClick();
    expect(app.editor.p1.places.project.open).toEqual([]);
    expect(buffers.all[key]).toBeUndefined();
  });

  it('goes back to the conversation', async () => {
    backend();
    await app.openEditor({ source: 'project' });
    render(EditorView, { project: project() });
    await userEvent.click(screen.getByRole('button', { name: '← Conversation' }));
    expect(app.editorOn).toBe(false);
  });

  it('reads a tab again when it is shown again', async () => {
    const be = backend();
    await app.openEditor({ source: 'project', path: 'README.md' });
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    await screen.findByRole('tab', { name: /app\.ts/ });
    // The first refresh (tree, status, open files) is over once the comparison shows.
    await screen.findByText('1 ligne modifiée vs HEAD');
    const reads = () => be.called('fs_read').filter((c) => c.args.path === 'README.md').length;
    await userEvent.click(screen.getByRole('tab', { name: /README\.md/ }));
    await expect.poll(reads).toBe(1);
    await userEvent.click(screen.getByRole('tab', { name: /app\.ts/ }));
    await userEvent.click(screen.getByRole('tab', { name: /README\.md/ }));
    await expect.poll(reads).toBe(2);
  });

  it('says what a file without text is', async () => {
    backend({ fs_read: () => ({ kind: 'binary', text: null, size: 10, hash: '', eol: 'lf', bom: false }) });
    await app.openEditor({ source: 'project', path: 'logo.png' });
    render(EditorView, { project: project() });
    expect(await screen.findByText('Fichier binaire : pas d’aperçu.')).toBeInTheDocument();
  });

  it('does not open a file once the view was left', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    backend({
      fs_tree: async () => {
        await gate;
        return { root: 'C:/code/demo-api', files: ['README.md', 'src/app.ts'], truncated: false };
      },
    });
    await app.openEditor({ source: 'project' });
    const { unmount } = render(EditorView, { project: project() });
    // The view is gone (back to the conversation, or another project) before the tree arrives.
    unmount();
    app.closeEditor('p1');
    release();
    await expect.poll(() => trees.get('p1', 'project')).toBeDefined();
    await new Promise((r) => setTimeout(r, 30));
    expect(app.editorOn).toBe(false);
    expect(app.editor.p1.places.project.open).toEqual([]);
  });
});
