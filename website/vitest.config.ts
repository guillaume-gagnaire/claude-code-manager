import { defineConfig } from 'vitest/config';

// The site's own tests (without this file, Vitest would pick up the app's config).
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
