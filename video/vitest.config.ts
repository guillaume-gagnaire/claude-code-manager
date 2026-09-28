import { defineConfig } from 'vitest/config';

// The video's own tests (without this file, Vitest would pick up the app's config).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'music/**/*.test.ts'],
    environment: 'node',
  },
});
