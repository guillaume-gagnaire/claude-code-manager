<script lang="ts">
  import { app } from '../lib/state.svelte';
</script>

<div class="welcome">
  <div class="card">
    <span class="mark">C</span>
    <h1>Escouade</h1>
    <p>Ajoute un projet pour y lancer des agents Claude Code, suivre leurs questions et ouvrir des terminaux.</p>
    {#if !app.claudeFound}
      <p class="warn">
        Claude Code est introuvable sur ce poste. Installe-le (<span class="mono">irm https://claude.ai/install.ps1 | iex</span>) ou indique
        son chemin dans les réglages.
      </p>
    {/if}
    <button
      class="btn primary big"
      onclick={() => {
        app.modal = { kind: 'newProject' };
      }}>+ Ajouter un projet</button
    >
  </div>
</div>

<style>
  .welcome {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    max-width: 460px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
  }
  .mark {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--accent);
    color: var(--accent-ink);
    font-family: var(--mono);
    font-size: 22px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  h1 {
    margin: 6px 0 0;
    font-size: 22px;
  }
  p {
    margin: 0;
    color: var(--muted);
    line-height: 1.55;
  }
  .warn {
    color: var(--wait);
    font-size: 12.5px;
  }
  .big {
    margin-top: 10px;
    height: 36px;
    padding: 0 18px;
    font-size: 13px;
  }
</style>
