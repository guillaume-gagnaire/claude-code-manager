// Model / effort / permission-mode catalogs used by the composer and the settings.

import type { ModelInfo } from './types';

/** The aliases offered: Claude Code runs the latest model of the family it knows. */
export const MODELS = [
  { value: 'fable', label: 'Fable' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

export const EFFORTS = [
  { value: 'low', label: 'Bas', title: 'Réponses rapides, peu de réflexion' },
  { value: 'medium', label: 'Moyen', title: 'Équilibré' },
  { value: 'high', label: 'Élevé', title: 'Réflexion approfondie' },
  { value: 'xhigh', label: 'Très élevé', title: 'Réflexion très approfondie' },
  { value: 'max', label: 'Max', title: 'Réflexion maximale, plus de tokens' },
];

export const MODES = [
  { value: 'auto', label: 'Auto', title: 'Un classifieur approuve les actions sûres et demande pour le reste' },
  { value: 'default', label: 'Demander', title: 'Claude demande ton accord avant chaque action sensible' },
  { value: 'plan', label: 'Plan', title: 'Claude analyse et propose un plan sans rien modifier' },
  { value: 'acceptEdits', label: 'Édits auto', title: 'Les modifications de fichiers sont acceptées sans demander' },
  { value: 'bypassPermissions', label: 'Bypass', title: 'Aucune demande de permission (à réserver aux environnements sûrs)' },
];

/**
 * "sonnet" → "Sonnet 5.5" once Claude Code has told which model the alias runs (`catalog`),
 * "claude-sonnet-5" → "Sonnet 5".
 */
export function modelLabel(model: string, catalog: ModelInfo[] = []): string {
  const m = model.toLowerCase();
  const known = MODELS.find((x) => x.value === m);
  if (!known) return displayModel(model);
  const id = resolveAlias(m, catalog);
  return id ? displayModel(id) : known.label;
}

/** The aliases offered, each labelled with the version Claude Code runs for it. */
export function modelOptions(catalog: ModelInfo[]): { value: string; label: string }[] {
  return MODELS.map((m) => ({ value: m.value, label: modelLabel(m.value, catalog) }));
}

/**
 * The full id Claude Code runs for an alias: the one it reports for it, else the newest of the
 * family it lists (it lists some, like Fable, only by their full ids).
 */
function resolveAlias(alias: string, catalog: ModelInfo[]): string | undefined {
  const own = catalog.find((x) => x.value.toLowerCase() === alias && x.resolvedModel);
  if (own) return own.resolvedModel;
  let best: { id: string; major: number; minor: number } | undefined;
  for (const x of catalog) {
    const p = parseModel(x.resolvedModel);
    if (p?.family !== alias || p.major === undefined) continue;
    const minor = p.minor ?? 0;
    if (!best || p.major > best.major || (p.major === best.major && minor > best.minor)) {
      best = { id: x.resolvedModel, major: p.major, minor };
    }
  }
  return best?.id;
}

/** A trailing date (`-20250514`) is no part of the version. */
function parseModel(id: string): { family: string; major?: number; minor?: number } | null {
  const m = id.toLowerCase().match(/(fable|opus|sonnet|haiku)[-_]?(?:(\d{1,2})(?!\d))?(?:[-_.](\d{1,2})(?!\d))?/);
  if (!m) return null;
  return { family: m[1], major: m[2] ? Number(m[2]) : undefined, minor: m[3] ? Number(m[3]) : undefined };
}

/** "claude-opus-5-5" → "Opus 5.5", "claude-haiku-4-5-20251001" → "Haiku 4.5". */
export function displayModel(id: string): string {
  const p = parseModel(id);
  if (!p) return id;
  const name = p.family[0].toUpperCase() + p.family.slice(1);
  if (p.major === undefined) return name;
  return p.minor !== undefined ? `${name} ${p.major}.${p.minor}` : `${name} ${p.major}`;
}

export function supportsEffort(model: string): boolean {
  return !model.toLowerCase().includes('haiku');
}

export function supportsAuto(model: string): boolean {
  return !model.toLowerCase().includes('haiku');
}
