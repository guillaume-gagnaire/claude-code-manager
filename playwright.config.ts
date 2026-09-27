import { defineConfig } from '@playwright/test';

// End-to-end tests drive the real Tauri app (debug build with the embedded frontend:
// `npx tauri build --debug --no-bundle`) through WebView2's DevTools protocol.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { trace: 'retain-on-failure' },
});
