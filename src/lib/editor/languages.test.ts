import { describe, expect, it } from 'vitest';
import { languageLabel, loadLanguage } from './languages';

describe('languages', () => {
  it('names the language of a file from its extension or its name', () => {
    expect(languageLabel('src/app.ts')).toBe('TypeScript');
    expect(languageLabel('a/B.TSX')).toBe('TypeScript JSX');
    expect(languageLabel('Cargo.toml')).toBe('TOML');
    expect(languageLabel('Dockerfile')).toBe('Dockerfile');
    expect(languageLabel('prisma/schema.prisma')).toBe('Prisma');
    expect(languageLabel('notes')).toBe('Texte');
  });

  it('loads the syntax of a known language, none for plain text', async () => {
    expect(await loadLanguage('a.ts')).not.toBeNull();
    expect(await loadLanguage('a.toml')).not.toBeNull();
    expect(await loadLanguage('schema.prisma')).toBeNull();
    expect(await loadLanguage('notes')).toBeNull();
  });
});
