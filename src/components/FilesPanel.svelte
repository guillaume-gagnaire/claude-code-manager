<script lang="ts">
  import { commitViaAgent, mergeAgent } from '../lib/agent-actions';
  import { basename, dirname } from '../lib/format';
  import { api } from '../lib/ipc';
  import { app } from '../lib/state.svelte';
  import type { Agent, FileChange, Project } from '../lib/types';

  let { project, agent }: { project: Project; agent: Agent | null } = $props();

  let files = $state<FileChange[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const scope = $derived(app.filesScope);
  // The agent object changes on every backend update: refetch on id / scope / git changes only.
  const agentId = $derived(agent?.id ?? null);
  const projectId = $derived(project.id);
  const SC: Record<string, string> = { A: 'var(--add)', M: 'var(--wait)', D: 'var(--del)' };

  $effect(() => {
    void app.gitTick;
    const pid = projectId;
    const aid = scope === 'agent' ? agentId : null;
    const agentScope = scope === 'agent';
    clearTimeout(timer);
    timer = setTimeout(() => load(pid, aid, agentScope), 120);
  });

  async function load(pid: string, aid: string | null, agentScope: boolean) {
    const mine = ++seq;
    if (agentScope && !aid) {
      files = [];
      return;
    }
    loading = true;
    try {
      const result = await api.gitFiles(pid, aid);
      if (mine !== seq) return; // superseded by a newer request
      files = result;
      error = null;
    } catch (e) {
      if (mine !== seq) return;
      error = String(e);
      files = [];
    }
    loading = false;
  }

  const hint = $derived(
    scope === 'agent'
      ? agent?.worktree
        ? `worktree ${agent.worktree.path.replace(/\\/g, '/').split('/.claude/')[1] ? '.claude/' + agent.worktree.path.replace(/\\/g, '/').split('/.claude/')[1] : agent.worktree.path} · isolé des autres agents`
        : 'Fichiers modifiés par cet agent (d’après ses éditions)'
      : 'Tous les agents du projet · attribution par worktree',
  );

  function agentName(id: string | null) {
    return id ? (app.agents[id]?.name ?? '?') : '';
  }

  function openDiff(paths: string[], agentId: string | null, title: string) {
    app.modal = { kind: 'diff', projectId: project.id, agentId, paths, title };
  }
</script>

<aside class="panel">
  <div class="head">
    <span class="section-label">Non commités</span>
    <span class="count">{files.length}</span>
    <div style="flex:1"></div>
    <button class="icon-btn" title="Fermer" onclick={() => (app.filesOpen = false)}>×</button>
  </div>
  <div class="scope">
    <div class="segmented" style="width:100%">
      <button style="flex:1;font-family:var(--ui);font-size:12px" class:on={scope === 'agent'} onclick={() => (app.filesScope = 'agent')}
        >Cet agent</button
      >
      <button
        style="flex:1;font-family:var(--ui);font-size:12px"
        class:on={scope === 'project'}
        onclick={() => (app.filesScope = 'project')}>Tout le projet</button
      >
    </div>
  </div>
  <div class="hint mono">{hint}</div>
  <div class="list">
    {#if error}
      <div class="empty">{error}</div>
    {:else if !files.length && !loading}
      <div class="empty">{scope === 'agent' ? 'Aucun fichier modifié par cet agent.' : 'Aucune modification non commitée.'}</div>
    {/if}
    {#each files as f (f.agentId + ':' + f.path)}
      <button
        class="file"
        onclick={() =>
          openDiff(
            [f.path],
            scope === 'agent' ? (agent?.id ?? null) : f.agentId && app.agents[f.agentId]?.worktree ? f.agentId : null,
            f.path,
          )}
      >
        <span class="st" style:color={SC[f.status]}>{f.status}</span>
        <span class="names">
          <span class="fname mono">{basename(f.path)}</span>
          <span class="dir mono">{dirname(f.path)}</span>
        </span>
        {#if scope === 'project' && f.agentId}<span class="tag mono">{agentName(f.agentId)}</span>{/if}
        <span class="add mono">+{f.add}</span>
        <span class="del mono">−{f.del}</span>
      </button>
    {/each}
  </div>
  <div class="foot">
    <button
      class="btn"
      style="flex:1"
      disabled={!files.length}
      onclick={() =>
        openDiff(
          scope === 'agent' && agent && !agent.worktree ? files.map((f) => f.path) : [],
          scope === 'agent' ? (agent?.id ?? null) : null,
          scope === 'agent' ? `Modifications de ${agent?.name}` : `Modifications de ${project.name}`,
        )}>Voir le diff</button
    >
    <button class="btn primary" style="flex:1" disabled={!agent || !files.length} onclick={() => agent && commitViaAgent(agent, scope)}>
      {scope === 'agent' ? 'Commit…' : 'Commit tout…'}
    </button>
  </div>
  {#if scope === 'agent' && agent?.worktree}
    <div class="foot merge">
      <button class="btn" style="flex:1" onclick={() => agent && mergeAgent(agent)}
        >Merger {agent.worktree.branch} → {agent.worktree.baseBranch}…</button
      >
    </div>
  {/if}
</aside>

<style>
  .panel {
    width: 330px;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-left: 1px solid var(--line);
    min-height: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 14px 12px 18px;
  }
  .count {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--dim);
  }
  .scope {
    padding: 0 14px 12px 18px;
  }
  .hint {
    padding: 0 18px 10px;
    font-size: 11px;
    color: var(--dim);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .list {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    padding: 0 8px 12px;
  }
  .empty {
    padding: 30px 10px;
    text-align: center;
    font-size: 12.5px;
    color: var(--muted);
  }
  .file {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .file:hover {
    background: var(--elev);
  }
  .st {
    width: 16px;
    flex: none;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
  }
  .names {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .fname {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dir {
    font-size: 10.5px;
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--elev2);
    color: var(--muted);
    white-space: nowrap;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .add {
    font-size: 11px;
    color: var(--add);
  }
  .del {
    font-size: 11px;
    color: var(--del);
  }
  .foot {
    display: flex;
    gap: 8px;
    padding: 12px 14px 14px;
    border-top: 1px solid var(--line);
  }
  .foot.merge {
    border-top: none;
    padding-top: 0;
  }
</style>
