import { api } from './ipc';
import { app } from './state.svelte';
import type { Agent } from './types';

export const COMMIT_AGENT_PROMPT =
  'Commite les modifications que tu as faites dans ce dépôt, avec un message clair au format Conventional Commits. ' +
  "N'inclus que les fichiers que tu as modifiés ; s'il y a plusieurs sujets distincts, fais plusieurs commits.";

export const COMMIT_ALL_PROMPT =
  'Commite toutes les modifications en cours du dépôt, regroupées en commits cohérents, avec des messages clairs au format Conventional Commits.';

export async function commitViaAgent(agent: Agent, scope: 'agent' | 'project' = 'agent') {
  const ok = await app.run(api.sendMessage(agent.id, scope === 'agent' ? COMMIT_AGENT_PROMPT : COMMIT_ALL_PROMPT));
  if (ok !== undefined) app.toast(`Demande de commit envoyée à ${agent.name}`, 'ok');
}

export function mergeAgent(agent: Agent) {
  if (!agent.worktree) return;
  const wt = agent.worktree;
  app.modal = {
    kind: 'confirm',
    title: `Merger ${wt.branch} dans ${wt.baseBranch} ?`,
    body: `Les commits de l'agent « ${agent.name} » sont intégrés dans la branche courante du projet.`,
    confirm: 'Merger',
    option: { label: 'Squash (un seul commit)', value: false },
    onConfirm: async (squash) => {
      const out = await app.run(api.mergeAgent(agent.id, squash));
      if (out !== undefined) app.toast(out || 'Merge effectué', 'ok');
    },
  };
}

export function openFiles(scope: 'agent' | 'project' = 'agent') {
  app.filesScope = scope;
  app.filesOpen = true;
}
