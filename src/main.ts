import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { guardFileDrops } from './lib/attachments';

// The app is a desktop window: keep the browser's own context menu out of the way,
// except in text fields where copy/paste matters.
window.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest('input, textarea, .md, .xterm')) e.preventDefault();
});

// Files are dropped on the composer only: anywhere else the WebView would open them.
guardFileDrops(window);

mount(App, { target: document.getElementById('app')! });
