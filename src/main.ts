import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

// The app is a desktop window: keep the browser's own context menu out of the way,
// except in text fields where copy/paste matters.
window.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest('input, textarea, .md, .xterm')) e.preventDefault();
});

mount(App, { target: document.getElementById('app')! });
