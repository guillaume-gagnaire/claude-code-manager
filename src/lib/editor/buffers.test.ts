import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBackend } from '../../test/ipc';
import { buffers } from './buffers.svelte';
import { trees } from './trees.svelte';

const text = (t: string, hash = 'h1', eol: 'lf' | 'crlf' = 'lf') => ({ kind: 'text', text: t, size: t.length, hash, eol, bom: false });

describe('buffers', () => {
  beforeEach(() => buffers.reset());

  it('opens a file once, then saves it with the hash it was read with', async () => {
    const backend = fakeBackend({
      fs_read: () => text('a\n', 'h1', 'crlf'),
      fs_base: () => ({ reference: 'main', text: 'a\n' }),
      fs_write: () => 'h2',
      set_unsaved: () => null,
    });
    const b = await buffers.open('p1', 'a2', 'src/x.ts');
    await buffers.open('p1', 'a2', 'src/x.ts');
    expect(backend.called('fs_read')).toHaveLength(1);
    expect(backend.called('fs_read')[0].args).toEqual({ projectId: 'p1', agentId: 'a2', path: 'src/x.ts' });
    await expect.poll(() => buffers.all[b.key].base).toEqual({ reference: 'main', text: 'a\n' });

    buffers.edit(b.key, 'b\n');
    expect(buffers.isDirty(buffers.all[b.key])).toBe(true);
    expect(backend.called('set_unsaved').at(-1)?.args).toEqual({ count: 1 });
    expect(await buffers.save(b.key)).toBe(true);
    expect(backend.called('fs_write')[0].args).toEqual({
      projectId: 'p1',
      agentId: 'a2',
      path: 'src/x.ts',
      text: 'b\n',
      eol: 'crlf',
      bom: false,
      expectedHash: 'h1',
    });
    expect(buffers.all[b.key]).toMatchObject({ saved: 'b\n', hash: 'h2', disk: 'ok' });
    expect(backend.called('set_unsaved').at(-1)?.args).toEqual({ count: 0 });
  });

  it('reads the project checkout without an agent', async () => {
    const backend = fakeBackend({ fs_read: () => text('x'), fs_base: () => null, set_unsaved: () => null });
    await buffers.open('p1', 'project', 'x.ts');
    expect(backend.called('fs_read')[0].args.agentId).toBeNull();
  });

  it('does not overwrite a file changed on disk until the user keeps their version', async () => {
    const backend = fakeBackend({
      fs_read: () => text('a\n'),
      fs_base: () => null,
      fs_write: (a: any) => {
        if (a.expectedHash) throw 'changed';
        return 'h3';
      },
      set_unsaved: () => null,
    });
    const k = (await buffers.open('p1', 'project', 'x.ts')).key;
    buffers.edit(k, 'mine\n');
    expect(await buffers.save(k)).toBe(false);
    expect(buffers.all[k]).toMatchObject({ disk: 'changed', text: 'mine\n', saved: 'a\n' });
    expect(await buffers.keepMine(k)).toBe(true);
    expect(backend.called('fs_write').at(-1)?.args.expectedHash).toBeNull();
    expect(buffers.all[k]).toMatchObject({ disk: 'ok', saved: 'mine\n', hash: 'h3' });
  });

  it('reloads a clean file changed on disk, flags a modified one', async () => {
    let disk = text('a\n', 'h1');
    fakeBackend({ fs_read: () => disk, fs_base: () => null, set_unsaved: () => null });
    const k = (await buffers.open('p1', 'project', 'x.ts')).key;
    disk = text('agent\n', 'h2');
    await buffers.refresh(k);
    expect(buffers.all[k]).toMatchObject({ text: 'agent\n', saved: 'agent\n', hash: 'h2', disk: 'ok', version: 1 });

    buffers.edit(k, 'mine\n');
    disk = text('agent2\n', 'h3');
    await buffers.refresh(k);
    expect(buffers.all[k]).toMatchObject({ text: 'mine\n', disk: 'changed', version: 1 });
    await buffers.reload(k);
    expect(buffers.all[k]).toMatchObject({ text: 'agent2\n', saved: 'agent2\n', disk: 'ok', version: 2 });
  });

  it('flags a file deleted on disk and keeps what was typed', async () => {
    let gone = false;
    fakeBackend({
      fs_read: () => {
        if (gone) throw 'x.ts introuvable';
        return text('a\n');
      },
      fs_base: () => null,
      set_unsaved: () => null,
    });
    const k = (await buffers.open('p1', 'project', 'x.ts')).key;
    buffers.edit(k, 'mine\n');
    gone = true;
    await buffers.refresh(k);
    expect(buffers.all[k]).toMatchObject({ disk: 'deleted', text: 'mine\n' });
  });

  it('opens binary, too large and missing files without text', async () => {
    fakeBackend({
      fs_read: (a: any) => {
        if (a.path === 'gone.ts') throw 'gone.ts introuvable';
        return { kind: a.path === 'a.png' ? 'binary' : 'tooLarge', text: null, size: 3_500_000, hash: '', eol: 'lf', bom: false };
      },
      set_unsaved: () => null,
    });
    expect((await buffers.open('p1', 'project', 'a.png')).kind).toBe('binary');
    expect((await buffers.open('p1', 'project', 'big.log')).kind).toBe('tooLarge');
    expect((await buffers.open('p1', 'project', 'gone.ts')).kind).toBe('missing');
  });

  it('forgets a closed file and counts it no more', async () => {
    const backend = fakeBackend({ fs_read: () => text('a'), fs_base: () => null, set_unsaved: () => null });
    const k = (await buffers.open('p1', 'project', 'x.ts')).key;
    buffers.edit(k, 'b');
    buffers.close(k);
    expect(buffers.all[k]).toBeUndefined();
    expect(backend.called('set_unsaved').at(-1)?.args).toEqual({ count: 0 });
  });
});

describe('trees', () => {
  beforeEach(() => trees.reset());

  it('keeps the tree of each source', async () => {
    const backend = fakeBackend({ fs_tree: (a: any) => ({ root: a.agentId ? 'C:/wt' : 'C:/p', files: ['a.ts'], truncated: false }) });
    await trees.load('p1', 'a2');
    await trees.load('p1', 'project');
    expect(backend.called('fs_tree').map((c) => c.args.agentId)).toEqual(['a2', null]);
    expect(trees.get('p1', 'a2')?.root).toBe('C:/wt');
    expect(trees.get('p1', 'project')?.root).toBe('C:/p');
  });
});
