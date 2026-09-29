import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { addProject, expect, send, test } from './fixture';

test('a new project opens an agent that streams Claude’s reply', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await expect(page.getByRole('button', { name: /demo-api/ }).first()).toBeVisible();
  await send(page, 'Bonjour');
  await expect(page.getByText('Bonjour, tu as dit : Bonjour')).toBeVisible();
  await expect(page.getByText('Tâche terminée')).toBeVisible();
  await expect(page.locator('footer')).toContainText('1 terminé');
  // Named from the first request (the fake CLI answers the naming call).
  await expect(page.locator('.card .name').first()).toHaveText('bonjour-fake');
  await expect(page.locator('footer')).toContainText('Session 5 h');
  await expect(page.locator('footer')).toContainText('12 %');
});

test('a question from Claude is signalled and answered in one click', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, 'question');
  const card = page.getByTestId('question-pending');
  await expect(card).toContainText('Quelle base de données ?');
  await expect(page.locator('footer')).toContainText('1 en attente');
  await expect(page.locator('.tab .pill')).toHaveText('1');
  await card.getByRole('button', { name: 'SQLite' }).click();
  await expect(page.getByText('Choix retenu : SQLite')).toBeVisible();
  await expect(page.locator('footer')).toContainText('0 en attente');
  await expect(page.getByText('→ SQLite')).toBeVisible();
});

test('a permission can be refused with an explanation typed in the composer', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, 'permission');
  await expect(page.getByTestId('permission-pending')).toContainText('rm -rf build');
  await send(page, 'utilise npm run clean');
  await expect(page.getByText('Compris : utilise npm run clean')).toBeVisible();
  await expect(page.getByText('✕ Refusé · Bash rm -rf build')).toBeVisible();
});

test('uncommitted changes show up in the tab counter, the files panel and the diff', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  fs.writeFileSync(path.join(app.repo, 'src', 'app.ts'), 'const a = 2;\nconst b = 3;\n');
  await expect(page.locator('.tab .delta')).toHaveText('Δ 1');
  await page.getByRole('button', { name: /Fichiers/ }).click();
  await page.getByRole('button', { name: 'Tout le projet' }).click();
  await expect(page.locator('.panel')).toContainText('app.ts');
  await page.getByRole('button', { name: /app\.ts/ }).click();
  const diff = page.getByRole('dialog', { name: 'src/app.ts' });
  await expect(diff).toContainText('const b = 3;');
  await page.keyboard.press('Escape');
  await expect(diff).toBeHidden();
});

test('a changed file is opened in the editor, reverted or deleted from its context menu', async ({ app }) => {
  const { page } = app;
  // An "editor" recording the path it is asked to open, set in the settings.
  const opened = path.join(app.data, 'opened.txt');
  const editor = path.join(app.data, 'record-editor.cjs');
  fs.writeFileSync(editor, `require('fs').writeFileSync(${JSON.stringify(opened)}, process.argv[2]);\n`);
  await page.getByTitle('Réglages (Ctrl+,)').click();
  const settings = page.getByRole('dialog', { name: 'Réglages' });
  await settings.getByRole('combobox', { name: /Éditeur par défaut/ }).selectOption({ label: 'Autre commande…' });
  await settings.getByRole('textbox', { name: /Commande pour ouvrir/ }).fill(`node "${editor}"`);
  await settings.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(settings).toBeHidden();

  await addProject(page, app.repo);
  fs.writeFileSync(path.join(app.repo, 'src', 'app.ts'), 'const a = 2;\n');
  fs.writeFileSync(path.join(app.repo, 'notes.md'), 'brouillon\n');
  await page.getByRole('button', { name: /Fichiers/ }).click();
  await page.getByRole('button', { name: 'Tout le projet' }).click();
  const panel = page.locator('.panel');
  const file = (name: RegExp) => panel.getByRole('button', { name });

  await file(/app\.ts/).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Éditer dans node/ }).click();
  await expect.poll(() => fs.existsSync(opened)).toBe(true);
  // git spells the repository's path its own way (long names): compare the files themselves.
  expect(fs.realpathSync.native(fs.readFileSync(opened, 'utf8'))).toBe(fs.realpathSync.native(path.join(app.repo, 'src', 'app.ts')));

  await file(/app\.ts/).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Abandonner les modifications…' }).click();
  await page
    .getByRole('dialog', { name: 'Abandonner les modifications de « app.ts » ?' })
    .getByRole('button', { name: 'Abandonner les modifications' })
    .click();
  await expect(file(/app\.ts/)).toBeHidden();
  expect(fs.readFileSync(path.join(app.repo, 'src', 'app.ts'), 'utf8')).toBe('const a = 1;\n');

  await file(/notes\.md/).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Supprimer le fichier…' }).click();
  await page.getByRole('dialog', { name: 'Supprimer « notes.md » ?' }).getByRole('button', { name: 'Supprimer' }).click();
  await expect(panel).toContainText('Aucune modification non commitée.');
  expect(fs.existsSync(path.join(app.repo, 'notes.md'))).toBe(false);
});

test('the status bar shows what there is to pull from the remote, fetched and pulled from its menu', async ({ app }) => {
  const { page } = app;
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=e2e@test', '-c', 'user.name=e2e', ...args], { cwd, stdio: 'pipe' });
  const root = path.dirname(app.repo);
  const remote = path.join(root, 'remote.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', remote);
  git(app.repo, 'remote', 'add', 'origin', remote);
  git(app.repo, 'push', '-q', '-u', 'origin', 'main');
  await addProject(page, app.repo);
  const sync = page.locator('footer .sync');
  await expect(sync).toContainText('⎇ main');
  await expect(sync).toContainText('↓0');

  // Someone else pushes a commit.
  const other = path.join(root, 'other');
  git(root, 'clone', '-q', remote, other);
  fs.writeFileSync(path.join(other, 'README.md'), 'depuis ailleurs\n');
  git(other, 'add', '-A');
  git(other, 'commit', '-qm', 'readme');
  git(other, 'push', '-q');

  await sync.click();
  await page.getByRole('menuitem', { name: /Fetch/ }).click();
  await expect(sync).toContainText('↓1');
  await sync.click();
  await page.getByRole('menuitem', { name: /Pull/ }).click();
  await expect(sync).toContainText('↓0');
  expect(fs.readFileSync(path.join(app.repo, 'README.md'), 'utf8')).toBe('depuis ailleurs\n');
});

test('a PDF attached to a message reaches Claude as a document', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  const pdf = Buffer.from('%PDF-1.4 rapport');
  await page.locator('input[type=file]').setInputFiles({ name: 'rapport.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByText('rapport.pdf')).toBeVisible();
  await send(page, 'Résume ce rapport');
  await expect(page.getByText('Bonjour, tu as dit : Résume ce rapport')).toBeVisible();
  // What the CLI read on its stdin.
  const stdin = path.join(path.dirname(app.data), 'fake-claude.stdin.jsonl');
  const sent = fs
    .readFileSync(stdin, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .find((m) => Array.isArray(m.message?.content));
  expect(sent.message.content).toEqual([
    { type: 'document', title: 'rapport.pdf', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
    { type: 'text', text: 'Résume ce rapport' },
  ]);
});

test('edits by Claude are attributed to the agent', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, 'edit');
  await expect(page.getByText('Fichier modifié.')).toBeVisible();
  await expect(page.locator('.tool').filter({ hasText: 'Edit' })).toContainText('+2');
});

test('the split layout shows the files the agent edits, with their diff, next to the conversation', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await page.getByRole('button', { name: 'Conversation et fichiers côte à côte' }).click();
  const pane = page.locator('.panel.docked');
  await expect(pane).toContainText('Aucun fichier modifié par cet agent.');
  await send(page, 'edit');
  await expect(page.getByText('Fichier modifié.')).toBeVisible();
  fs.writeFileSync(path.join(app.repo, 'src', 'app.ts'), 'const a = 2;\nconst b = 3;\n');
  await expect(pane.getByRole('region', { name: 'Diff de src/app.ts' })).toContainText('const b = 3;');
  const conv = (await page.locator('main.conv').boundingBox())!;
  const side = (await pane.boundingBox())!;
  expect(Math.abs(conv.width - side.width)).toBeLessThan(2);
  await page.keyboard.press('Control+Shift+L');
  await expect(pane).toBeHidden();
});

test('the history shows the repository’s commits and opens a commit’s diff', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await page.getByRole('button', { name: 'Conversation et fichiers côte à côte' }).click();
  await page.getByRole('tab', { name: 'Historique' }).click();
  const pane = page.locator('.panel.docked');
  await expect(pane).toContainText('init');
  fs.writeFileSync(path.join(app.repo, 'src', 'app.ts'), 'const a = 2;\n');
  execFileSync('git', ['-c', 'user.email=e2e@test', '-c', 'user.name=e2e', 'commit', '-qam', 'passe a à 2'], { cwd: app.repo });
  await expect(pane).toContainText('passe a à 2');
  await pane.getByText('passe a à 2').click();
  const diff = page.getByRole('dialog', { name: /passe a à 2/ });
  await expect(diff).toContainText('const a = 2;');
});

test('an agent in remote control shows what is sent to it from claude.ai', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  const card = page.locator('.card').first();
  await card.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Activer le remote control/ }).click();
  await expect(card.getByTitle(/Remote control : connecté/)).toBeVisible();
  // The fake CLI then plays a message sent from the phone, and Claude answers it.
  await expect(page.locator('.bubble', { hasText: 'Message depuis le téléphone' })).toContainText('depuis claude.ai');
  await expect(page.getByText('Bonjour, tu as dit : Message depuis le téléphone')).toBeVisible();
  await card.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Ouvrir sur claude.ai' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Désactiver le remote control' }).click();
  await expect(card.getByTitle(/Remote control/)).toBeHidden();
});

test('scrolling up slowly from the bottom of a conversation is never pulled back down', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  const scroll = page.locator('.scroll');
  // [scrollTop, scrollHeight, clientHeight] after each reply, for the failure message (CI).
  const followed: number[][] = [];
  for (let i = 1; i <= 10; i++) {
    await send(page, `message ${i} ` + 'du texte pour remplir la conversation '.repeat(12));
    await expect(page.getByText(`tu as dit : message ${i} `)).toBeVisible();
    followed.push(await scroll.evaluate((el) => [el.scrollTop, el.scrollHeight, el.clientHeight]));
  }
  const box = (await scroll.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const bottom = await scroll.evaluate((el) => el.scrollHeight - el.clientHeight);
  // The conversation followed every reply down to the bottom.
  const rendering = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const state = () => ({ visibility: document.visibilityState, focus: document.hasFocus(), size: [innerWidth, innerHeight] });
        const t = setTimeout(() => resolve({ animationFrame: false, ...state() }), 1000);
        requestAnimationFrame(() => (clearTimeout(t), resolve({ animationFrame: true, ...state() })));
      }),
  );
  const jump = await page.getByRole('button', { name: /Nouveaux messages/ }).isVisible();
  expect(await scroll.evaluate((el) => el.scrollTop), JSON.stringify({ rendering, jump, followed })).toBeGreaterThanOrEqual(bottom - 2);
  const tops: number[] = [];
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, -12);
    await page.waitForTimeout(60);
    tops.push(await scroll.evaluate((el) => el.scrollTop));
  }
  for (let i = 1; i < tops.length; i++) expect(tops[i], JSON.stringify(tops)).toBeLessThanOrEqual(tops[i - 1]);
  expect(tops.at(-1)!, JSON.stringify({ bottom, tops })).toBeLessThan(bottom - 60);
});

test('a deleted agent leaves the list for good', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, 'Bonjour');
  await expect(page.getByText('Bonjour, tu as dit : Bonjour')).toBeVisible();
  await page.getByRole('button', { name: '+ Nouvel agent' }).click();
  await expect(page.locator('.card')).toHaveCount(2);
  await page.locator('.card').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Supprimer…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('.card')).toHaveCount(1);
  // Its process exits (and its naming may end) after the removal: it must not come back.
  await page.waitForTimeout(1500);
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card .name')).toHaveText('agent-2');
});

test('a terminal runs commands in the project folder', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await page.getByTitle('Nouveau terminal').click();
  await page.getByRole('menuitem', { name: /PowerShell/ }).click();
  await expect(page.locator('.xterm')).toBeVisible();
  await page.waitForTimeout(2500); // PowerShell start-up
  await page.locator('.xterm').click();
  await page.keyboard.type('Set-Content e2e-terminal.txt ok');
  await page.keyboard.press('Enter');
  await expect.poll(() => fs.existsSync(path.join(app.repo, 'e2e-terminal.txt')), { timeout: 20_000 }).toBe(true);
});

test('launch commands run in their own terminals, with their status live', async ({ app }) => {
  const { page } = app;
  const marker = path.join(app.repo, 'web', 'serveur.txt');
  fs.mkdirSync(path.dirname(marker));
  await addProject(page, app.repo);

  await page.getByRole('button', { name: 'Configurer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '+ Ajouter une commande' }).click();
  const serveurCfg = dialog.getByRole('group').nth(0);
  await serveurCfg.getByLabel('Nom').fill('Serveur');
  await serveurCfg.getByLabel('Commande').fill('Set-Content serveur.txt ok; Start-Sleep 600');
  await serveurCfg.getByLabel(/Sous-dossier/).fill('web');
  await dialog.getByRole('button', { name: '+ Ajouter une commande' }).click();
  const buildCfg = dialog.getByRole('group').nth(1);
  await buildCfg.getByLabel('Nom').fill('Build');
  await buildCfg.getByLabel('Commande').fill('exit 2');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();

  const serveur = page.locator('.run', { hasText: 'Serveur' });
  const build = page.locator('.run', { hasText: 'Build' });
  await expect(serveur).toContainText('prêt');
  await page.getByRole('button', { name: 'Tout lancer', exact: true }).click();
  await expect(serveur).toContainText('en cours');
  await expect(build).toContainText('planté (code 2)', { timeout: 30_000 });
  await expect(page.getByText("« Build » s'est arrêté en erreur (code 2)")).toBeVisible();
  // Run in its subfolder.
  await expect.poll(() => fs.existsSync(marker), { timeout: 30_000 }).toBe(true);

  // Its log replaces the conversation; stopping it is not a crash.
  await serveur.click();
  const view = page.locator('main.rv');
  await expect(view.locator('.xterm')).toBeVisible();
  await expect(view).toContainText('en cours');
  await view.getByRole('button', { name: 'Stopper' }).click();
  await expect(serveur).toContainText('arrêté', { timeout: 15_000 });
  await expect(page.getByText("« Serveur » s'est arrêté en erreur")).toHaveCount(0);

  fs.rmSync(marker);
  await view.getByRole('button', { name: 'Relancer' }).click();
  await expect(serveur).toContainText('en cours');
  await expect.poll(() => fs.existsSync(marker), { timeout: 30_000 }).toBe(true);
  await page.getByRole('button', { name: 'Tout arrêter', exact: true }).click();
  await expect(serveur).toContainText('arrêté', { timeout: 15_000 });

  // Back to the agent.
  await page.locator('.card').first().click();
  await expect(view).toHaveCount(0);
});

test('stats record the turns of the app’s agents', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, 'Bonjour');
  await expect(page.getByText('Tâche terminée')).toBeVisible();
  await page.getByRole('button', { name: 'Stats' }).click();
  await expect(page.getByText('Statistiques')).toBeVisible();
  const prompts = page.locator('.kpi').filter({ hasText: 'Prompts' });
  await expect(prompts).toContainText('1');
  await expect(page.getByText('demo-api').last()).toBeVisible();
});

test('the proxy configured in the settings reaches Claude', async ({ app }) => {
  const { page } = app;
  await page.getByTitle('Réglages (Ctrl+,)').click();
  const dialog = page.getByRole('dialog', { name: 'Réglages' });
  await dialog.getByPlaceholder('aucun').fill('http://proxy.local:3128');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await addProject(page, app.repo);
  await send(page, 'Bonjour');
  await expect(page.getByText('Bonjour, tu as dit : Bonjour')).toBeVisible();
  expect(app.launches().at(-1)?.proxy).toBe('http://proxy.local:3128');
});

test('Ctrl+N creates another agent and Ctrl+J jumps to the one waiting', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, 'question');
  await expect(page.getByTestId('question-pending')).toBeVisible();
  await page.keyboard.press('Control+n');
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.getByText('Agent prêt')).toBeVisible();
  await page.keyboard.press('Control+j');
  await expect(page.getByTestId('question-pending')).toBeVisible();
});

test('project tabs can be reordered (drag and drop logic)', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await addProject(page, app.repo, { name: 'second', firstAgent: false });
  const tabs = page.locator('.tabs .tab .name');
  await expect(tabs).toHaveText(['demo-api', 'second']);
  await page
    .locator('.tabs .tab')
    .nth(1)
    .dragTo(page.locator('.tabs .tab').nth(0), { targetPosition: { x: 5, y: 10 } });
  await expect(tabs).toHaveText(['second', 'demo-api']);
});
