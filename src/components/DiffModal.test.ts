import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../lib/state.svelte';
import { fakeBackend, project, resetApp } from '../test/ipc';
import DiffModal from './DiffModal.svelte';

export const DIFF = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,2 +10,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+hello
`;

const props = { projectId: 'p1', agentId: 'a1', paths: [], title: 'Modifications de refacto-auth' };

describe('DiffModal', () => {
  beforeEach(() => {
    resetApp({ projects: [project()] });
    localStorage.removeItem('escouade.diffSplit');
    app.diffSplit = false;
  });

  it('shows the first file, and another one when picked in the list', async () => {
    const backend = fakeBackend({ git_diff: () => DIFF });
    render(DiffModal, props);
    expect(await screen.findByText('const b = 3;')).toBeInTheDocument();
    expect(backend.called('git_diff')[0].args).toEqual({ projectId: 'p1', agentId: 'a1', paths: [] });
    await userEvent.click(screen.getByRole('button', { name: /new\.txt/ }));
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.queryByText('const b = 3;')).not.toBeInTheDocument();
  });

  it('shows old and new lines side by side and remembers the choice', async () => {
    fakeBackend({ git_diff: () => DIFF });
    render(DiffModal, props);
    await screen.findByText('const b = 3;');
    await userEvent.click(screen.getByRole('button', { name: 'Côte à côte' }));
    const row = screen.getByText('const b = 2;').closest('.srow')!;
    expect(row).toHaveTextContent('const b = 3;');
    expect(localStorage.getItem('escouade.diffSplit')).toBe('1');
    expect(app.diffSplit).toBe(true);
  });

  it('closes with Escape', async () => {
    fakeBackend({ git_diff: () => DIFF });
    app.modal = { kind: 'diff', ...props };
    render(DiffModal, props);
    await userEvent.keyboard('{Escape}');
    expect(app.modal).toBeNull();
  });
});

describe('DiffModal for a commit', () => {
  beforeEach(() => resetApp({ projects: [project()] }));

  it('shows what the commit changed', async () => {
    const backend = fakeBackend({ git_show: () => DIFF });
    render(DiffModal, { projectId: 'p1', agentId: null, paths: [], title: 'a1b2c3d ajoute les tests', commit: 'a1b2c3d4' });
    expect(await screen.findByText('const b = 3;')).toBeInTheDocument();
    expect(backend.called('git_show')[0].args).toEqual({ projectId: 'p1', hash: 'a1b2c3d4' });
    expect(backend.called('git_diff')).toHaveLength(0);
  });
});
