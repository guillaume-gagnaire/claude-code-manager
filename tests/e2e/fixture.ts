// Launches the real app on a throwaway data folder, with the fake `claude` CLI, and connects
// Playwright to its WebView2 through the DevTools protocol.

import { test as base, chromium, expect, type Browser, type Page } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXE = process.env.CCM_E2E_EXE ?? path.join(ROOT, 'src-tauri', 'target', 'debug', 'claude-code-manager.exe');
const FAKE = path.join(ROOT, 'tests', 'fixtures', 'fake-claude.cmd');

export interface App {
  page: Page;
  /** A git repository with one commit, ready to be added as a project. */
  repo: string;
  data: string;
  /** Launches of the fake CLI: argv, cwd and the proxy it received. */
  launches: () => { argv: string[]; cwd: string; proxy: string | null }[];
}

function git(cwd: string, ...args: string[]) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function makeRepo(root: string): string {
  const repo = path.join(root, 'demo-api');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'e2e@test');
  git(repo, 'config', 'user.name', 'e2e');
  git(repo, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(repo, 'src', 'app.ts'), 'const a = 1;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'init');
  return repo;
}

async function connect(port: number): Promise<{ browser: Browser; page: Page }> {
  for (let i = 0; i < 120; i++) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      const page = browser.contexts()[0]?.pages()[0];
      if (page) return { browser, page };
      await browser.close();
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the app did not expose its WebView2 DevTools endpoint');
}

export const test = base.extend<{ app: App }>({
  app: async ({}, use, testInfo) => {
    if (!fs.existsSync(EXE)) throw new Error(`build the app first: npx tauri build --debug --no-bundle (missing ${EXE})`);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-e2e-'));
    const data = path.join(root, 'data');
    fs.mkdirSync(data);
    fs.writeFileSync(
      path.join(data, 'settings.json'),
      JSON.stringify({ claudePath: FAKE, sound: false, osNotifications: false, idleStopMinutes: 0 }),
    );
    const repo = makeRepo(root);
    const log = path.join(root, 'fake-claude.jsonl');
    const port = 9400 + (testInfo.workerIndex * 50 + Math.floor(Math.random() * 50));
    const child: ChildProcess = spawn(EXE, [], {
      env: {
        ...process.env,
        CCM_DATA_DIR: data,
        FAKE_CLAUDE_LOG: log,
        WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview'),
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
      },
      stdio: 'ignore',
    });
    const { browser, page } = await connect(port);
    await expect(page.getByRole('button', { name: /Ajouter un projet/ }).first()).toBeVisible();
    const launches = () =>
      fs.existsSync(log)
        ? fs
            .readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l))
        : [];
    await use({ page, repo, data, launches });
    await browser.close().catch(() => {});
    if (child.pid) {
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // already gone
      }
    }
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  },
});

/** Adds `repo` as a project through the "Nouveau projet" dialog, with a first agent. */
export async function addProject(page: Page, repo: string, opts: { worktrees?: boolean; name?: string; firstAgent?: boolean } = {}) {
  await page.getByRole('button', { name: 'Ajouter un projet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau projet' });
  await dialog.getByPlaceholder('C:\\chemin\\vers\\le\\projet').fill(repo);
  await expect(dialog.getByText(/Dépôt git détecté · branche main · propre/)).toBeVisible();
  if (opts.name) await dialog.locator('input').nth(1).fill(opts.name);
  if (opts.firstAgent === false) await dialog.getByRole('switch', { name: 'Créer un premier agent' }).click();
  if (opts.worktrees) await dialog.getByRole('switch', { name: 'Un worktree git par agent' }).click();
  await dialog.getByRole('button', { name: 'Créer le projet' }).click();
  await expect(dialog).toBeHidden();
}

export async function send(page: Page, text: string) {
  const box = page.getByRole('textbox').last();
  await box.fill(text);
  await box.press('Enter');
}

export { expect };
