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

describe('SettingsModal editor', () => {
  const EDITORS = [
    { id: 'vscode', label: 'VS Code', command: 'code' },
    { id: 'zed', label: 'Zed', command: '"C:\\Zed\\zed.exe"' },
  ];
  beforeEach(() => {
    resetApp();
    app.modal = { kind: 'settings' };
  });
  const picker = () => screen.getByRole('combobox', { name: /Éditeur par défaut/ });
  const save = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  };

  it('picks the default editor among the installed ones, detected again on opening', async () => {
    const backend = fakeBackend({ save_settings: () => [], detect_editors: () => EDITORS });
    render(SettingsModal);
    expect(await screen.findByRole('option', { name: 'Zed' })).toBeInTheDocument();
    expect(picker()).toHaveValue('vscode');
    expect(screen.queryByRole('textbox', { name: /Commande/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(picker(), 'zed');
    await save();
    expect(backend.called('save_settings')[0].args.settings.editorCommand).toBe('"C:\\Zed\\zed.exe"');
    expect(app.editors).toEqual(EDITORS);
  });

  it('keeps a command of its own, typed freely', async () => {
    app.editors = EDITORS;
    app.settings.editorCommand = 'subl -n';
    const backend = fakeBackend({ save_settings: () => [], detect_editors: () => EDITORS });
    render(SettingsModal);
    expect(picker()).toHaveValue('');
    const field = screen.getByRole('textbox', { name: /Commande/ });
    expect(field).toHaveValue('subl -n');
    // Typing the command of a detected editor does not hide the field being typed in.
    await userEvent.clear(field);
    await userEvent.type(field, 'code');
    expect(screen.getByRole('textbox', { name: /Commande/ })).toHaveValue('code');
    await save();
    expect(backend.called('save_settings')[0].args.settings.editorCommand).toBe('code');
  });

  it('says when none of the known editors is installed', async () => {
    fakeBackend({ detect_editors: () => [] });
    render(SettingsModal);
    expect(await screen.findByText(/Aucun éditeur détecté parmi VS Code, Cursor et Zed/)).toBeInTheDocument();
    expect(picker()).toHaveValue('');
  });
});
