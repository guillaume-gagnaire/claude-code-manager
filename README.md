# Claude Code Manager

Application Windows pour piloter plusieurs instances de [Claude Code](https://claude.com/claude-code) en local : un onglet par projet, autant d'agents que nécessaire, des terminaux intégrés, des notifications quand Claude attend une réponse, les quotas de ton abonnement et des statistiques de consommation.

Site : [guillaume-gagnaire.github.io/claude-code-manager](https://guillaume-gagnaire.github.io/claude-code-manager/)

## Fonctionnalités

- **Projets en onglets** : compteur de modifications git non commitées, pastille quand un agent attend une réponse, couleur par projet (qui teinte toute l'interface), réordonnables par glisser-déposer.
- **Agents** : une conversation Claude Code par agent, nommée automatiquement d'après la première demande. Modèle (Fable, Opus, Sonnet, Haiku), effort (jusqu'à `max`) et mode de permission (Auto, Demander, Plan, Édits auto, Bypass) modifiables en cours de conversation. Archivage, suppression, renommage.
- **Chat natif** : markdown avec coloration syntaxique, réflexion repliable, appels d'outils compacts et dépliables (diffs, sorties de commandes, sous-agents). Questions de Claude et demandes d'autorisation sous forme de cartes cliquables (ou réponse libre). Images (coller/glisser), autocomplétion `@fichier` et `/commande`, messages envoyés pendant que Claude travaille (il en tient compte dès sa prochaine étape, comme dans Claude Code), interruption par `Échap`.
- **Notifications** : carillon, notification Windows cliquable, clignotement de la barre des tâches et badge dans la zone de notification quand un agent pose une question ou termine.
- **Git** : panneau des fichiers non commités (par agent ou pour tout le projet), visionneuse de diff (unifié / côte à côte, un choix qui s'applique aussi aux diffs de la conversation), commit rédigé par l'agent lui-même, **git graph** de tout le dépôt avec la branche de l'agent mise en avant (onglet « Historique », clic sur un commit pour son diff). Disposition **moitié / moitié** au choix : la conversation à gauche, les fichiers modifiés et leur diff à droite, rafraîchis pendant que l'agent travaille. Option **un worktree par agent** avec merge (ou squash) dans la branche du projet et nettoyage.
- **Terminaux** : vrais terminaux (ConPTY + xterm.js) PowerShell 7, Git Bash et WSL, avec l'autocomplétion native du shell.
- **Lancement du projet** : par projet, une liste de commandes (nom, ligne de commande, shell, sous-dossier) à lancer une par une ou toutes ensemble. Chacune tourne dans son propre terminal, en lecture seule, et garde son log d'un lancement à l'autre. Statut en direct (en cours, arrêté, terminé, planté avec le code de sortie et une notification) ; lancer, relancer, stopper.
- **Barre de statut** : agents actifs, en attente et terminés, quota de session 5 h (avec délai avant réinitialisation), quota hebdomadaire, coût du jour. Tokens et coût montent en direct pendant que Claude travaille (estimation « ≈ » d'après les tarifs publics), puis prennent le chiffre exact de Claude Code à la fin du tour.
- **Statistiques** : tokens (entrée, cache, sortie) par jour, semaine ou mois, coût global, coût moyen par prompt, répartition par projet et par modèle.
- **Remote control** : clic droit sur un agent → « Activer le remote control ». Sa session devient accessible depuis claude.ai et l'app Claude sur mobile ; ce que tu y envoies s'affiche aussi dans l'app, et l'agent reste joignable tant que l'app tourne (même session après un redémarrage).
- **Fermer la fenêtre ne coupe pas les agents** : l'app reste dans la zone de notification. Au redémarrage, chaque agent reprend sa session Claude (`--resume`). Les processus inactifs sont arrêtés après un délai réglable et reprennent automatiquement à la prochaine action.
- **Proxy réseau** configurable (processus Claude, quotas, mises à jour, et optionnellement terminaux).
- **Mises à jour automatiques** via les releases GitHub.

## Prérequis

- Windows 10 ou 11 (WebView2, présent par défaut sur Windows 11).
- [Claude Code](https://docs.claude.com/claude-code) installé et connecté (`claude` dans le `PATH`, ou chemin indiqué dans les réglages).
- Git for Windows.
- Optionnel : PowerShell 7 (à défaut, les terminaux utilisent Windows PowerShell), WSL.

## Installation

Télécharge l'installeur `.exe` de la [dernière release](https://github.com/guillaume-gagnaire/claude-code-manager/releases/latest). Les versions suivantes s'installent depuis l'application (barre de statut → « Mise à jour disponible »).

## Données locales

Tout est stocké dans `~/.claude-code-manager/` :

| Fichier | Contenu |
|---|---|
| `settings.json` | réglages |
| `state.json` | projets, agents, état de l'interface |
| `conversations/<agent>.jsonl` | journal de chaque conversation |
| `stats.db` | statistiques (SQLite) |
| `app.log` | journal de l'application |

La variable d'environnement `CCM_DATA_DIR` permet d'utiliser un autre dossier (démonstrations, tests).

## Raccourcis

| Raccourci | Action |
|---|---|
| `Ctrl+1` … `Ctrl+9` | aller au projet n |
| `Ctrl+N` | nouvel agent |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | agent suivant / précédent |
| `Ctrl+J` | prochain agent en attente de réponse |
| `Ctrl+T` | nouveau terminal |
| `Ctrl+Shift+B` | panneau des fichiers non commités (disposition classique ; toujours affiché dans l'autre) |
| `Ctrl+Shift+L` | disposition classique / conversation et fichiers côte à côte |
| `Ctrl+,` | réglages |
| `Échap` (dans le champ de saisie) | interrompre Claude |
| `↑` (champ vide) | reprendre le dernier message |

## Développement

Prérequis : Node.js 20.18+ et rustup (MSVC). La version de Rust est épinglée dans `src-tauri/rust-toolchain.toml` (la même qu'en CI) et rustup l'installe automatiquement.

```powershell
npm ci
npm run tauri dev
```

Pour travailler sans toucher à tes vraies données :

```powershell
$env:CCM_DATA_DIR = "$env:TEMP\ccm-sandbox"; npm run tauri dev
```

### Tests

| Commande | Contenu |
|---|---|
| `npm run check` | typage (svelte-check) |
| `npm test` | Vitest + Testing Library : logique, stores et composants |
| `cd src-tauri; cargo test` | tests unitaires Rust et tests d'intégration du cœur contre un faux CLI `claude` (`tests/fixtures/fake-claude.mjs`), de vrais dépôts git temporaires et le runtime de test de Tauri |
| `npx tauri build --debug --no-bundle; npm run test:e2e` | tests de bout en bout : Playwright pilote l'application réelle via le protocole DevTools de WebView2 |

La CI (`.github/workflows/ci.yml`) exécute l'ensemble sur chaque push et pull request.

### Publier une version

1. Une seule fois, ajoute les secrets du dépôt GitHub :
   - `TAURI_SIGNING_PRIVATE_KEY` : le contenu de la clé privée de signature des mises à jour (générée avec `npx tauri signer generate`, la clé publique correspondante est dans `src-tauri/tauri.conf.json`) ;
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` : son mot de passe (vide s'il n'y en a pas).
2. Mets à jour la version partout, committe, tague et pousse :

   ```powershell
   npm run version:set -- 0.2.0
   git commit -am "chore: release 0.2.0"
   git tag v0.2.0
   git push origin main v0.2.0
   ```

Le workflow `release.yml` vérifie que le tag correspond à la version, crée la release, lance les tests, construit l'installeur, le signe et l'ajoute à la release avec le `latest.json` utilisé par la mise à jour automatique.

Tague toujours la tête de `main`, et attends que la release soit créée (première minute du workflow) avant de pousser d'autres commits : une fois `main` plus loin que le tag, le `GITHUB_TOKEN` des Actions n'a plus le droit de créer la release (« Resource not accessible by integration »).

### Vidéo de présentation

Le dossier `video/` contient la vidéo de présentation (Remotion) et sa musique, générée par code :

```powershell
cd video
npm install
npm run studio   # aperçu
npm run render   # musique + out/presentation.mp4
```

### Site

Le dossier `website/` contient le site de présentation (Nuxt, généré en statique), publié sur GitHub Pages à chaque push qui le touche. Il demande Node 22.19 ou plus récent :

```powershell
cd website
npm install
npm run dev        # aperçu
npm run generate   # site statique dans .output/public
npm test           # vérifie le site généré
```

Ses images et sa vidéo viennent de `video/` : `npm run render`, puis `npm run site-images`.

## Architecture

- `src-tauri/` : backend Rust (Tauri 2).
  - `claude.rs` : pilotage d'un processus `claude` en mode `stream-json`, avec son protocole de contrôle (voir [docs/PROTOCOL.md](docs/PROTOCOL.md)).
  - `agent.rs` : normalisation des messages en conversation, statuts, questions et permissions, usage par tour.
  - `core.rs` : orchestration.
  - Modules annexes : `git.rs`, `pty.rs`, `stats.rs`, `usage.rs`, `notify.rs`, `job.rs` (arbres de processus).
- `src/` : interface Svelte 5.
- `design/` : maquette de référence.
- `docs/SPEC.md` : spécification.

## Licence

MIT, voir [LICENSE](LICENSE).
