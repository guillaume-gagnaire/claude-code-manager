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

test('edits by Claude are attributed to the agent', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, 'edit');
  await expect(page.getByText('Fichier modifié.')).toBeVisible();
  await expect(page.locator('.tool').filter({ hasText: 'Edit' })).toContainText('+2');
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
