// Auto-update through GitHub Releases (tauri-plugin-updater).

import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { app } from './state.svelte';

export async function checkForUpdate(manual = false): Promise<boolean> {
  try {
    const proxy = app.settings.proxyUrl?.trim() || undefined;
    const update = await check({ proxy, timeout: 20000 });
    if (!update) return false;
    app.update = {
      version: update.version,
      notes: update.body ?? '',
      install: async () => {
        await update.downloadAndInstall();
        await relaunch();
      },
    };
    return true;
  } catch (e) {
    if (manual) app.toast(`Vérification des mises à jour impossible : ${e}`, 'error');
    return false;
  }
}
