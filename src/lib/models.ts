// Model / effort / permission-mode catalogs used by the composer and the settings.

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

export function modelLabel(model: string): string {
  const m = model.toLowerCase();
  const known = MODELS.find((x) => x.value === m);
  if (known) return known.label;
  return displayModel(model);
}

/** "claude-opus-5-5" → "Opus 5.5", "claude-haiku-4-5-20251001" → "Haiku 4.5". */
export function displayModel(id: string): string {
  const m = id.toLowerCase().match(/(fable|opus|sonnet|haiku)[-_]?(\d+)?(?:[-_.](\d{1,2}))?/);
  if (!m) return id;
  const name = m[1][0].toUpperCase() + m[1].slice(1);
  if (!m[2]) return name;
  return m[3] ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`;
}

export function supportsEffort(model: string): boolean {
  return !model.toLowerCase().includes('haiku');
}

export function supportsAuto(model: string): boolean {
  return !model.toLowerCase().includes('haiku');
}
