import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../lib/state.svelte';
import { fakeBackend, resetApp } from '../../test/ipc';
import SettingsModal from './SettingsModal.svelte';

describe('SettingsModal', () => {
  beforeEach(() => {
    resetApp();
    app.modal = { kind: 'settings' };
  });

  it('saves the proxy and the switches', async () => {
    const backend = fakeBackend({ save_settings: () => [{ id: 'pwsh', label: 'PowerShell', path: 'pwsh.exe' }] });
    render(SettingsModal);
    await userEvent.type(screen.getByPlaceholderText('aucun'), 'http://proxy:3128');
    const sound = screen.getByRole('switch', { name: 'Son' });
    expect(sound).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(sound);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = backend.called('save_settings')[0].args.settings;
    expect(saved).toMatchObject({ proxyUrl: 'http://proxy:3128', sound: false });
    expect(app.modal).toBeNull();
    expect(app.shells.map((s) => s.id)).toEqual(['pwsh']);
  });

  it('turns an emptied number field into 0 instead of sending null', async () => {
    const backend = fakeBackend({ save_settings: () => [] });
    render(SettingsModal);
    await userEvent.clear(screen.getByRole('spinbutton'));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(backend.called('save_settings')[0].args.settings.idleStopMinutes).toBe(0);
  });
});
