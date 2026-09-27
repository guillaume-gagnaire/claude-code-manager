<script lang="ts">
  import { api } from '../../lib/ipc';
  import { EFFORTS, MODELS, MODES } from '../../lib/models';
  import { app } from '../../lib/state.svelte';
  import { checkForUpdate } from '../../lib/updater';
  import type { Settings } from '../../lib/types';
  import Modal from './Modal.svelte';

  let s = $state<Settings>({ ...$state.snapshot(app.settings) });
  let busy = $state(false);
  let checking = $state(false);

  async function save() {
    busy = true;
    // An emptied number field is null: the backend expects a number.
    s.idleStopMinutes = Math.max(0, Math.floor(Number(s.idleStopMinutes) || 0));
    const shells = await app.run(api.saveSettings($state.snapshot(s)));
    busy = false;
    if (!shells) return;
    app.settings = { ...s };
    app.shells = shells;
    app.modal = null;
    app.toast('Réglages enregistrés', 'ok');
  }

  async function check() {
    checking = true;
    const found = await checkForUpdate(true);
    checking = false;
    if (!found) app.toast('Aucune mise à jour disponible.', 'info');
  }
</script>

<Modal title="Réglages" width={620} onclose={() => (app.modal = null)}>
  <section>
    <h3>Claude Code</h3>
    <label class="f">
      <span>Chemin de l'exécutable <em>(vide = détection automatique)</em></span>
      <input
        class="field mono"
        bind:value={s.claudePath}
        placeholder={app.claudeFound ? 'claude (trouvé dans le PATH)' : 'introuvable — indique le chemin de claude.exe'}
      />
    </label>
    <div class="f">
      <span>Modèle par défaut</span>
      <div class="segmented">
        {#each MODELS as m (m.value)}<button class:on={s.defaultModel === m.value} onclick={() => (s.defaultModel = m.value)}
            >{m.label}</button
          >{/each}
      </div>
    </div>
    <div class="f">
      <span>Effort par défaut</span>
      <div class="segmented">
        {#each EFFORTS as e (e.value)}<button class:on={s.defaultEffort === e.value} onclick={() => (s.defaultEffort = e.value)}
            >{e.label}</button
          >{/each}
      </div>
    </div>
    <div class="f">
      <span>Mode de permission par défaut</span>
      <div class="segmented">
        {#each MODES as m (m.value)}<button class:on={s.defaultMode === m.value} title={m.title} onclick={() => (s.defaultMode = m.value)}
            >{m.label}</button
          >{/each}
      </div>
    </div>
    <label class="f">
      <span>Arrêter les processus Claude inactifs après (minutes, 0 = jamais)</span>
      <input class="field mono" type="number" min="0" style="width:120px" bind:value={s.idleStopMinutes} />
    </label>
  </section>

  <section>
    <h3>Notifications</h3>
    <div class="toggle">
      <span>Son (question de Claude, fin de tour)</span>
      <button class="btn ghost small" onclick={() => api.playChime()}>Tester</button>
      <button class="switch" role="switch" aria-checked={s.sound} class:on={s.sound} aria-label="Son" onclick={() => (s.sound = !s.sound)}
      ></button>
    </div>
    <div class="toggle">
      <span>Notifications Windows quand l'app n'est pas au premier plan</span>
      <button
        class="switch"
        role="switch"
        aria-checked={s.osNotifications}
        class:on={s.osNotifications}
        aria-label="Notifications Windows"
        onclick={() => (s.osNotifications = !s.osNotifications)}
      ></button>
    </div>
  </section>

  <section>
    <h3>Réseau</h3>
    <label class="f">
      <span>Proxy HTTP(S) <em>(ex. http://utilisateur:motdepasse@proxy:3128)</em></span>
      <input class="field mono" bind:value={s.proxyUrl} placeholder="aucun" />
    </label>
    <label class="f">
      <span>Exclusions (NO_PROXY, séparées par des virgules)</span>
      <input class="field mono" bind:value={s.noProxy} />
    </label>
    <div class="toggle">
      <span>Appliquer aussi le proxy aux terminaux intégrés</span>
      <button
        class="switch"
        role="switch"
        aria-checked={s.proxyTerminals}
        class:on={s.proxyTerminals}
        aria-label="Proxy dans les terminaux"
        onclick={() => (s.proxyTerminals = !s.proxyTerminals)}
      ></button>
    </div>
    <p class="note">
      Le proxy est transmis aux processus Claude Code, à la lecture des quotas et aux mises à jour. Il s'applique aux agents au prochain
      (re)démarrage de leur processus.
    </p>
  </section>

  <section>
    <h3>Terminaux</h3>
    <label class="f"><span>PowerShell 7 <em>(vide = auto)</em></span><input class="field mono" bind:value={s.pwshPath} /></label>
    <label class="f"><span>Git Bash <em>(vide = auto)</em></span><input class="field mono" bind:value={s.bashPath} /></label>
    <label class="f"
      ><span>Distribution WSL <em>(vide = distribution par défaut)</em></span><input
        class="field mono"
        bind:value={s.wslDistro}
        placeholder="Ubuntu"
      /></label
    >
    <div class="detected">
      Détectés : {app.shells.map((x) => x.label).join(', ') || 'aucun'}
    </div>
  </section>

  <section>
    <h3>Éditeur</h3>
    <label class="f"
      ><span>Commande pour ouvrir un fichier ou un dossier</span><input
        class="field mono"
        bind:value={s.editorCommand}
        placeholder="code"
      /></label
    >
  </section>

  <section>
    <h3>À propos</h3>
    <div class="toggle">
      <span>Claude Code Manager {app.version}</span>
      <button class="btn small" disabled={checking} onclick={check}>{checking ? 'Recherche…' : 'Rechercher une mise à jour'}</button>
    </div>
    <p class="note">Données locales : <span class="mono">~/.claude-code-manager/</span></p>
  </section>

  {#snippet footer()}
    <button class="btn ghost" onclick={() => (app.modal = null)}>Annuler</button>
    <button class="btn primary" disabled={busy} onclick={save}>Enregistrer</button>
  {/snippet}
</Modal>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12.5px;
  }
  .f > span {
    color: var(--text);
  }
  em {
    color: var(--dim);
    font-style: normal;
  }
  .field {
    font-size: 12.5px;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12.5px;
  }
  .toggle > span {
    flex: 1;
  }
  .small {
    height: 26px;
    font-size: 11.5px;
    padding: 0 10px;
  }
  .note,
  .detected {
    margin: 0;
    font-size: 11.5px;
    color: var(--dim);
    line-height: 1.5;
  }
</style>
