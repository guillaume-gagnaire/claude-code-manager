import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { CARDS, FAQ, FEATURES, STEPS } from '../app/data/site';

const OUT = new URL('../.output/public/', import.meta.url);
const BASE = '/claude-code-manager/';
const VERSION = (JSON.parse(readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8')) as { version: string })
  .version;

/** Text as Vue writes it in HTML. */
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let html = '';
beforeAll(() => {
  const index = new URL('index.html', OUT);
  if (!existsSync(index)) throw new Error('Génère d’abord le site : npm run generate');
  html = readFileSync(index, 'utf8');
});

describe('generated site', () => {
  it('is named and described for search engines and social networks', () => {
    expect(html).toContain('<title>CCM - Claude Code Manager</title>');
    expect(html).toMatch(/<html[^>]*lang="fr"/);
    expect(html).toMatch(/<meta[^>]*name="description"[^>]*content="[^"]{40,}"/);
    expect(html).toMatch(
      /<meta[^>]*og:image[^>]*content="https:\/\/guillaume-gagnaire\.github\.io\/claude-code-manager\/images\/poster\.jpg"/,
    );
  });

  it('presents every feature, the install steps and the questions', () => {
    const texts = [...FEATURES.map((f) => f.title), ...CARDS.map((c) => c.title), ...STEPS.map((s) => s.title), ...FAQ.map((f) => f.q)];
    for (const t of texts) expect(html, t).toContain(escape(t));
    expect(html).toContain('CCM - Claude Code Manager');
    expect(html).toContain('non affilié à Anthropic');
  });

  it('downloads the latest release, links to the code and shows the version', () => {
    expect(html).toContain('href="https://github.com/guillaume-gagnaire/claude-code-manager/releases/latest"');
    expect(html).toContain('href="https://github.com/guillaume-gagnaire/claude-code-manager"');
    expect(html).toContain(`Version ${VERSION}`);
  });

  it('sends the first install step to Claude Code’s own documentation', () => {
    expect(html).toContain('href="https://code.claude.com/docs/fr/overview"');
  });

  it('serves every local file under the GitHub Pages path', () => {
    const local = [...html.matchAll(/(?:src|href|poster)="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(local.length).toBeGreaterThan(10);
    for (const ref of local) {
      expect(ref.startsWith(BASE), ref).toBe(true);
      const file = decodeURI(ref.slice(BASE.length).split(/[?#]/)[0]) || 'index.html';
      expect(existsSync(new URL(file, OUT)), ref).toBe(true);
    }
    for (const f of FEATURES) expect(html).toContain(`src="${BASE}${f.image}"`);
  });

  it('plays the presentation video on demand, with its poster', () => {
    expect(html).toContain(`src="${BASE}ccm.mp4"`);
    expect(html).toContain(`poster="${BASE}images/poster.jpg"`);
    expect(html).toMatch(/<video[^>]*preload="none"/);
  });

  it('tells GitHub Pages not to run Jekyll on it', () => {
    expect(existsSync(new URL('.nojekyll', OUT))).toBe(true);
  });
});
