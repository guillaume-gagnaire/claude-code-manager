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

  it('keeps an empty editor empty while git events come in', async () => {
    const be = backend();
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    // The first refresh (tree, status, open files) is over once the comparison shows.
    await screen.findByText('1 ligne modifiée vs HEAD');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer app.ts' }));
    expect(screen.getByText('Sélectionne un fichier dans l’arborescence.')).toBeInTheDocument();
    const listed = be.called('git_files').length;
    app.gitTick++;
    await expect.poll(() => be.called('git_files').length).toBe(listed + 1);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Sélectionne un fichier dans l’arborescence.')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('saves from the close prompt, then closes the tab', async () => {
    const be = backend();
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    const key = buffers.key('p1', 'project', 'src/app.ts');
    await expect.poll(() => buffers.all[key]?.kind).toBe('text');
    buffers.edit(key, 'mine\n');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer app.ts' }));
    await (app.modal as any).onConfirm(false);
    expect(be.called('fs_write')[0].args).toMatchObject({ path: 'src/app.ts', text: 'mine\n', expectedHash: 'h1' });
    expect(app.editor.p1.places.project.open).toEqual([]);
    expect(buffers.all[key]).toBeUndefined();
  });

  it('shows why a save from the close prompt was refused, on the tab it concerns', async () => {
    let onDisk = 'h1';
    backend({
      fs_read: (a) => text(a.path === 'README.md' ? '# demo\n' : 'const a = 2;\n', a.path === 'README.md' ? onDisk : 'h1'),
      fs_write: () => {
        onDisk = 'h9';
        return Promise.reject('changed');
      },
    });
    await app.openEditor({ source: 'project', path: 'README.md' });
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    const readme = buffers.key('p1', 'project', 'README.md');
    await userEvent.click(screen.getByRole('tab', { name: /README\.md/ }));
    await expect.poll(() => buffers.all[readme]?.kind).toBe('text');
    buffers.edit(readme, 'mine\n');
    // README.md goes to the background: its banner is not on screen.
    await userEvent.click(screen.getByRole('tab', { name: /app\.ts/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fermer README.md' }));
    await (app.modal as any).onConfirm(false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce fichier a changé sur le disque.');
    expect(screen.getByRole('tab', { name: /README\.md/ })).toHaveAttribute('aria-selected', 'true');
    expect(app.editor.p1.places.project.open).toContain('README.md');
  });

  it('saves over what changed on disk with "Garder ma version"', async () => {
    const be = backend({ fs_write: (a) => (a.expectedHash === null ? 'h3' : Promise.reject('changed')) });
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    const key = buffers.key('p1', 'project', 'src/app.ts');
    await expect.poll(() => buffers.all[key]?.kind).toBe('text');
    buffers.edit(key, 'mine\n');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce fichier a changé sur le disque.');
    await userEvent.click(screen.getByRole('button', { name: 'Garder ma version' }));
    await expect.poll(() => be.called('fs_write').length).toBe(2);
    expect(be.called('fs_write')[1].args).toMatchObject({ path: 'src/app.ts', text: 'mine\n', expectedHash: null });
    await expect.poll(() => screen.queryByRole('alert')).toBeNull();
    expect(await screen.findByText('Enregistré')).toBeInTheDocument();
  });

  it('closes the tab of a deleted file from its banner', async () => {
    let gone = false;
    backend({ fs_read: () => (gone ? Promise.reject('fichier introuvable') : text('const a = 2;\n')) });
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    const key = buffers.key('p1', 'project', 'src/app.ts');
    await expect.poll(() => buffers.all[key]?.kind).toBe('text');
    gone = true;
    await buffers.refresh(key);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce fichier a été supprimé.');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(app.editor.p1.places.project.open).toEqual([]);
    expect(buffers.all[key]).toBeUndefined();
  });

  it('creates a deleted file again with "Enregistrer", even without a change', async () => {
    let gone = false;
    const be = backend({
      fs_read: () => (gone ? Promise.reject('fichier introuvable') : text('const a = 2;\n')),
      // As the backend does: a write expecting the file it read is refused once that file is gone.
      fs_write: (a) => {
        if (gone && a.expectedHash) return Promise.reject('deleted');
        gone = false;
        return 'h5';
      },
    });
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    const key = buffers.key('p1', 'project', 'src/app.ts');
    await expect.poll(() => buffers.all[key]?.kind).toBe('text');
    gone = true;
    await buffers.refresh(key);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce fichier a été supprimé.');
    const save = screen.getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await expect.poll(() => be.called('fs_write').length).toBe(1);
    expect(be.called('fs_write')[0].args).toMatchObject({ path: 'src/app.ts', text: 'const a = 2;\n', expectedHash: null });
    await expect.poll(() => screen.queryByRole('alert')).toBeNull();
  });

  it('reads a file again that was missing, when its tab is shown again', async () => {
    let there = false;
    backend({ fs_read: (a) => (a.path === 'README.md' && !there ? Promise.reject('fichier introuvable') : text('# demo\n')) });
    await app.openEditor({ source: 'project', path: 'README.md' });
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    await screen.findByText('1 ligne modifiée vs HEAD');
    await userEvent.click(screen.getByRole('tab', { name: /README\.md/ }));
    expect(await screen.findByText('Ce fichier n’existe pas (ou plus).')).toBeInTheDocument();
    there = true;
    await userEvent.click(screen.getByRole('tab', { name: /app\.ts/ }));
    await userEvent.click(screen.getByRole('tab', { name: /README\.md/ }));
    await expect.poll(() => buffers.all[buffers.key('p1', 'project', 'README.md')]?.kind).toBe('text');
  });

  it('names the worktree folder of an agent source', async () => {
    resetApp({
      agents: [agent({ worktree: { path: 'C:\\code\\demo-api\\.claude\\worktrees\\wt-x', branch: 'escouade/wt-x', baseBranch: 'main' } })],
    });
    backend();
    await app.openEditor({ source: 'a1', path: 'README.md' });
    render(EditorView, { project: project() });
    expect(await screen.findByText('.claude/worktrees/wt-x')).toBeInTheDocument();
  });

  it('never says "branche" without a branch name', async () => {
    app.git.p1 = gitInfo({ branch: '' });
    backend();
    await app.openEditor({ source: 'project', path: 'README.md' });
    render(EditorView, { project: project() });
    expect(await screen.findByText('branche · projet')).toBeInTheDocument();
  });

  it('closes the tab of the source it was asked on, even if the source changed meanwhile', async () => {
    backend();
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    const key = buffers.key('p1', 'project', 'src/app.ts');
    await expect.poll(() => buffers.all[key]?.kind).toBe('text');
    buffers.edit(key, 'mine\n');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer app.ts' }));
    await app.openEditor({ projectId: 'p1', source: 'a1' });
    await (app.modal as any).alt.onClick();
    expect(app.editor.p1.places.project.open).toEqual([]);
    expect(buffers.all[key]).toBeUndefined();
  });

  it('tells that the tree could not be read once, not at every git event', async () => {
    const be = backend({ fs_tree: () => Promise.reject('boom') });
    await app.openEditor({ source: 'project', path: 'README.md' });
    render(EditorView, { project: project() });
    await expect.poll(() => app.toasts.map((t) => t.text)).toEqual(['boom']);
    const listed = be.called('git_files').length;
    app.gitTick++;
    await expect.poll(() => be.called('git_files').length).toBe(listed + 1);
    await new Promise((r) => setTimeout(r, 50));
    expect(app.toasts).toHaveLength(1);
  });

  it('brings the line asked for into view once, not each time its tab is shown again', async () => {
    backend({ fs_read: (a) => text(a.path === 'README.md' ? '# demo\n' : 'a\nb\nc\nd\n') });
    await app.openEditor({ source: 'project', path: 'README.md' });
    await app.openEditor({ source: 'project', path: 'src/app.ts', line: 3 });
    const { container } = render(EditorView, { project: project() });
    const shown = () => container.querySelector('.cm-content')?.textContent;
    expect(await screen.findByText('Ln 3, Col 1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /README\.md/ }));
    await expect.poll(shown).toBe('# demo');
    await userEvent.click(screen.getByRole('tab', { name: /app\.ts/ }));
    await expect.poll(shown).toBe('abcd');
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText('Ln 1, Col 1')).toBeInTheDocument();
    expect(app.editor.p1.reveal).toBeNull();
  });

  it('does not show the previous file’s comparison on the one just opened', async () => {
    backend({ fs_base: (a) => ({ reference: 'HEAD', text: a.path === 'README.md' ? '# demo\n' : 'const a = 1;\n' }) });
    await app.openEditor({ source: 'project', path: 'README.md' });
    await app.openEditor({ source: 'project', path: 'src/app.ts' });
    render(EditorView, { project: project() });
    await screen.findByText('1 ligne modifiée vs HEAD');
    await userEvent.click(screen.getByRole('tab', { name: /README\.md/ }));
    await screen.findByText('Identique à HEAD');
    // Both files are loaded now: back on app.ts, README.md’s comparison must not stay until app.ts’s is computed.
    await userEvent.click(screen.getByRole('tab', { name: /app\.ts/ }));
    expect(screen.queryByText('Identique à HEAD')).not.toBeInTheDocument();
    expect(await screen.findByText('1 ligne modifiée vs HEAD')).toBeInTheDocument();
  });
});
