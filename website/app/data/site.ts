// Everything the site says.

export const REPO = 'https://github.com/guillaume-gagnaire/escouade';
export const DOWNLOAD = `${REPO}/releases/latest`;
/** Public address of the site, for links shared on social networks. */
export const SITE = 'https://guillaume-gagnaire.github.io/escouade/';

export interface Feature {
  id: string;
  title: string;
  text: string;
  points: string[];
  /** In public/. */
  image: string;
  alt: string;
}

export const FEATURES: Feature[] = [
  {
    id: 'agents',
    title: 'Projets en onglets, agents en parallèle',
    text: 'Chaque projet a son onglet et sa couleur. Dans chacun, autant d’agents Claude Code que tu veux, chacun avec sa conversation, son modèle et son effort.',
    points: [
      'Statut en direct : en cours, question, terminé',
      'Tokens, coût et fichiers touchés par agent',
      'Un worktree git par agent, si tu veux',
    ],
    image: 'images/agents.jpg',
    alt: 'La fenêtre d’Escouade : les projets en onglets, la liste des agents et la conversation de l’un d’eux',
  },
  {
    id: 'chat',
    title: 'Un vrai chat, pas un terminal',
    text: 'Markdown, coloration syntaxique, appels d’outils compacts et dépliables, images, @fichiers et /commandes. Écris pendant que Claude travaille : il en tient compte à l’étape suivante.',
    points: [
      'Les questions de Claude en cartes cliquables',
      'Autorisations en un clic, ou refus expliqué',
      'Modèle, effort et mode modifiables à tout moment',
    ],
    image: 'images/chat.jpg',
    alt: 'Une conversation : réponse de Claude, appels d’outils et question à choix multiple',
  },
  {
    id: 'notifications',
    title: 'Tu sais quand on t’attend',
    text: 'Quand un agent pose une question ou termine, Escouade le signale : pastille sur l’onglet, carillon, notification Windows cliquable, barre des tâches qui clignote.',
    points: ['Ctrl+J saute au prochain agent qui attend', 'Badge dans la zone de notification', 'Rien à surveiller : tu es prévenu'],
    image: 'images/notifications.jpg',
    alt: 'Un agent en attente de réponse et la notification Windows correspondante',
  },
  {
    id: 'git',
    title: 'Git sous les yeux',
    text: 'Fichiers non commités par agent ou pour tout le projet, diff unifié ou côte à côte, git graph du dépôt avec la branche de l’agent en avant. La disposition moitié / moitié montre la conversation et les fichiers ensemble.',
    points: [
      'Commit rédigé par l’agent lui-même',
      'Merge ou squash d’un worktree, puis nettoyage',
      'Clic sur un commit pour voir son diff',
    ],
    image: 'images/git.jpg',
    alt: 'Le git graph du dépôt, avec la branche d’un agent mergée dans main',
  },
  {
    id: 'lancement',
    title: 'Lance ton projet d’un clic',
    text: 'Configure les commandes qui lancent ton projet (front, API, worker…), chacune avec son shell et son dossier. Chaque commande tourne dans son terminal, avec son statut en direct.',
    points: [
      'Tout lancer, tout arrêter, relancer',
      'Un plantage se voit tout de suite, avec son code',
      'Arrêter coupe aussi ce que la commande a lancé',
    ],
    image: 'images/launch.jpg',
    alt: 'Trois commandes de lancement, dont une plantée, et le journal du serveur de développement',
  },
  {
    id: 'stats',
    title: 'Tokens, coût, quotas : en direct',
    text: 'La barre de statut suit ton quota de session de 5 h, ton quota hebdomadaire et le coût du jour, qui monte pendant que Claude travaille. Les statistiques détaillent tokens et coût par jour, par projet et par modèle.',
    points: ['Estimation en direct, chiffre exact en fin de tour', 'Coût moyen par demande', 'Réparti entre Fable, Opus, Sonnet et Haiku'],
    image: 'images/stats.jpg',
    alt: 'La page des statistiques : tokens par jour et par modèle, coût et quotas',
  },
  {
    id: 'remote',
    title: 'Et depuis ton téléphone',
    text: 'Active le remote control sur un agent : sa session s’ouvre sur claude.ai et dans l’app Claude sur mobile. Ce que tu y envoies s’affiche aussi dans Escouade.',
    points: [
      'Au cas par cas, d’un clic droit sur l’agent',
      'Même session après un redémarrage',
      'L’agent reste joignable tant que Escouade tourne',
    ],
    image: 'images/remote.jpg',
    alt: 'Un téléphone sur claude.ai et Escouade qui affichent la même conversation',
  },
];

export interface Card {
  title: string;
  text: string;
}

export const CARDS: Card[] = [
  { title: 'De vrais terminaux', text: 'PowerShell, Git Bash et WSL intégrés, avec l’autocomplétion de ton shell.' },
  { title: 'Un worktree par agent', text: 'Chaque agent sur sa branche, sans marcher sur les autres ; merge ou squash quand c’est prêt.' },
  {
    title: 'Toujours là',
    text: 'Fermer la fenêtre ne coupe pas les agents : Escouade reste dans la zone de notification et reprend chaque session au redémarrage.',
  },
  { title: 'Derrière un proxy', text: 'Proxy HTTP(S) pour Claude, les quotas, les mises à jour et, si tu veux, les terminaux.' },
  { title: 'Mises à jour automatiques', text: 'Les nouvelles versions, signées, s’installent depuis l’app.' },
  { title: 'Au clavier', text: 'Ctrl+1…9 pour les projets, Ctrl+N pour un agent, Ctrl+J pour celui qui attend, Échap pour interrompre.' },
];

export interface Step {
  title: string;
  text: string;
  link?: { label: string; href: string };
}

export const STEPS: Step[] = [
  {
    title: 'Installe Claude Code',
    text: 'Escouade pilote le Claude Code installé sur ta machine : installe-le et connecte-toi une fois, avec ton abonnement Claude ou une clé API.',
    link: { label: 'Documentation de Claude Code', href: 'https://code.claude.com/docs/fr/overview' },
  },
  {
    title: 'Installe Escouade',
    text: 'Télécharge l’installeur de la dernière version et lance-le. Il te faut Windows 10 ou 11 et Git for Windows.',
    link: { label: 'Dernière version', href: DOWNLOAD },
  },
  {
    title: 'Ouvre un projet',
    text: 'Choisis un dossier, crée un agent et écris ta première demande. Les suivants arrivent avec Ctrl+N.',
  },
];

export interface Question {
  q: string;
  a: string;
}

export const FAQ: Question[] = [
  {
    q: 'C’est gratuit ?',
    a: 'Oui, et open source, sous licence MIT. Escouade utilise ton propre Claude Code : ton abonnement Claude ou ta clé API, sans intermédiaire.',
  },
  {
    q: 'Où vont mes données ?',
    a: 'Nulle part : projets, conversations et statistiques restent sur ta machine, dans ~/.escouade/. Le réseau ne sert qu’à Claude Code lui-même, à la lecture de tes quotas et aux mises à jour de l’app.',
  },
  { q: 'Ça marche sur Mac ou Linux ?', a: 'Pas pour l’instant : Escouade est fait pour Windows 10 et 11.' },
  { q: 'Comment se font les mises à jour ?', a: 'L’app te propose chaque nouvelle version ; un clic, et elle s’installe.' },
  {
    q: 'C’est un produit Anthropic ?',
    a: 'Non. Escouade est un projet indépendant, non affilié à Anthropic. Claude et Claude Code sont des marques d’Anthropic.',
  },
];
