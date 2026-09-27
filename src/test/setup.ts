import '@testing-library/jest-dom/vitest';
import { clearMocks } from '@tauri-apps/api/mocks';
import { cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';

// jsdom lacks these browser APIs used by the UI.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver ??= RO;
if (typeof Element !== 'undefined') Element.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  if (typeof window === 'undefined') return;
  // Unmount first: components unregister their Tauri listeners while the mocks still exist.
  cleanup();
  clearMocks();
});
