<script lang="ts">
  import { fCountdown, fPct } from '../lib/format';
  import { api } from '../lib/ipc';
  import { ESTIMATE_HINT, fSpentUsd } from '../lib/spend';
  import { app } from '../lib/state.svelte';

  const agents = $derived(Object.values(app.agents).filter((a) => !a.archived));
  const running = $derived(agents.filter((a) => a.status === 'running').length);
  const waiting = $derived(agents.filter((a) => a.status === 'waiting').length);
  const done = $derived(agents.filter((a) => a.status === 'done').length);
  const five = $derived(app.usage.fiveHour);
  const week = $derived(app.usage.sevenDay);

  function toggleSound() {
    app.settings.sound = !app.settings.sound;
    app.run(api.saveSettings($state.snapshot(app.settings)));
  }

  let installing = $state(false);
</script>

<footer class="bar mono">
  <span class="it"><span class="dot" style="width:7px;height:7px;background:var(--ok)"></span>{running} actif{running > 1 ? 's' : ''}</span>
  <button
    class="it link"
    style:color={waiting ? 'var(--wait)' : 'var(--muted)'}
    onclick={() => app.nextWaiting()}
    title="Aller au prochain agent en attente (Ctrl+J)"
  >
    {#if waiting}<span class="pulse" style="width:7px;height:7px"></span>{:else}<span
        class="dot"
        style="width:7px;height:7px;background:var(--dim)"
      ></span>{/if}
    {waiting} en attente
  </button>
  <span class="it"><span style="color:var(--ok)">✓</span>{done} terminé{done > 1 ? 's' : ''}</span>
  <span class="vsep"></span>
  <span
    class="it"
    title={five?.resetsAt ? `Réinitialisation : ${new Date(five.resetsAt).toLocaleString('fr-FR')}` : 'Quota de session indisponible'}
  >
    Session 5 h
    <span class="meter"
      ><span style:width="{Math.min(100, five?.pct ?? 0)}%" style:background={(five?.pct ?? 0) > 80 ? 'var(--wait)' : 'var(--accent)'}
      ></span></span
    >
    <span class="v">{five ? fPct(five.pct) : '—'}</span>
    {#if five?.resetsAt}<span class="d">reset {fCountdown(five.resetsAt, app.now)}</span>{/if}
  </span>
  <span
    class="it"
    title={week?.resetsAt ? `Réinitialisation : ${new Date(week.resetsAt).toLocaleString('fr-FR')}` : 'Quota hebdomadaire indisponible'}
  >
    Hebdo
    <span class="meter"
      ><span style:width="{Math.min(100, week?.pct ?? 0)}%" style:background={(week?.pct ?? 0) > 80 ? 'var(--wait)' : 'var(--accent)'}
      ></span></span
    >
    <span class="v">{week ? fPct(week.pct) : '—'}</span>
  </span>
  <span class="vsep"></span>
  <span class="it" title={app.liveCost > 0 ? ESTIMATE_HINT : undefined}
    >Aujourd'hui <span class="v strong">{fSpentUsd({ cost: app.usage.todayCost + app.liveCost, estimated: app.liveCost > 0 })}</span></span
  >
  <div style="flex:1"></div>
  {#if app.update}
    <button
      class="upd"
      disabled={installing}
      onclick={async () => {
        installing = true;
        await app.run(app.update!.install());
        installing = false;
      }}>{installing ? 'Installation…' : `Mise à jour ${app.update.version} disponible → installer`}</button
    >
  {/if}
  <button class="small" onclick={toggleSound} title="Son des notifications">♪ {app.settings.sound ? 'On' : 'Off'}</button>
  <button
    class="small"
    onclick={() => {
      app.modal = { kind: 'settings' };
    }}
    title="Réglages (Ctrl+,)">⚙</button
  >
</footer>

<style>
  .bar {
    height: 30px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 8px 0 16px;
    background: var(--panel);
    border-top: 1px solid var(--line);
    font-size: 11px;
    color: var(--muted);
    user-select: none;
    white-space: nowrap;
    overflow: hidden;
  }
  .it {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .link {
    border: none;
    background: transparent;
    font: inherit;
    cursor: pointer;
    padding: 0;
  }
  .vsep {
    width: 1px;
    height: 14px;
    background: var(--line2);
  }
  .meter {
    width: 48px;
    height: 5px;
    border-radius: 3px;
    background: var(--elev2);
    overflow: hidden;
    margin-left: 2px;
  }
  .meter span {
    display: block;
    height: 100%;
    transition: width 0.4s;
  }
  .v {
    color: var(--text);
  }
  .strong {
    font-weight: 600;
  }
  .d {
    color: var(--dim);
  }
  .small {
    height: 22px;
    padding: 0 8px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  .small:hover {
    background: var(--elev2);
    color: var(--text);
  }
  .upd {
    height: 22px;
    padding: 0 10px;
    border: none;
    border-radius: var(--r-sm);
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
</style>
