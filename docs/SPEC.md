# Claude Code Manager — Spécification v1

Application desktop pour piloter plusieurs instances de Claude Code en local, organisées par projet.
Référence visuelle : `design/Claude Code Manager.dc.html` (source de vérité pour le look & feel).

## Stack

| Couche | Choix |
|---|---|
| Shell applicatif | Tauri 2 (Windows uniquement en v1) |
| Backend | Rust (tokio) : process `claude`, PTY (portable-pty), git (gix/CLI), watchers (notify), SQLite (rusqlite) |
| Frontend | Svelte 5 + TypeScript + Vite |
| Terminaux | xterm.js (addon WebGL) |
| Markdown | rendu incrémental en streaming + coloration syntaxique (shiki) |
| Stockage | `~/.claude-code-manager/` (config JSON + SQLite) |

## Pilotage de Claude Code

- Chat natif uniquement (pas de TUI embarqué).
- Chaque agent = un process `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages` dans le dossier du projet (ou du worktree de l'agent).
- Les demandes de permission et `AskUserQuestion` remontent via le protocole de contrôle (permission prompts « host ») et s'affichent comme cartes « Claude attend ta réponse ».
- Modèle, effort et mode de permission changeables en cours de conversation.
- **1 agent = 1 conversation.** Reprise après redémarrage via `--resume <session_id>`.

## Fenêtre

- Fenêtre sans cadre : la barre d'onglets du design sert de barre de titre (zone de drag), boutons Windows ─ ☐ ✕ à droite (à la place des pastilles macOS).
- Thème sombre du design, teinté par la couleur du projet actif (`color-mix` sur les tokens).
- Polices Hanken Grotesk + JetBrains Mono embarquées (hors-ligne).
- Fermer la fenêtre → réduction dans le tray, les agents continuent. « Quitter » (menu tray) → arrêt propre ; au relancement, chaque agent reprend sa session.

## Barre d'onglets

- Un onglet par projet : pastille couleur, nom, point vert si un agent tourne, compteur `Δ n` (fichiers non commités, worktrees des agents inclus), pastille pulsante = nombre d'agents en attente.
- `+` ouvre la modale « Nouveau projet ». Onglet « Stats » à droite.
- Défauts : onglets réordonnables par glisser ; clic droit → renommer, couleur, fermer le projet (retire de l'app, ne touche pas au disque).

## Modale « Nouveau projet »

Dossier (+ Parcourir…), détection git (sinon `git init`), nom, aperçu d'onglet, 14 couleurs, bascule « Créer un premier agent » (+ modèle), bascule « Un worktree git par agent ».

## Barre latérale projet

- **Agents** : compteur, « + Nouvel agent ». Carte : statut (Prêt / En cours / Question / Terminé), nom, modèle · durée active, tokens · coût · nb fichiers.
- Nom créé en `agent-N`, puis renommé automatiquement en slug par Haiku après le premier message. Renommable (double-clic).
- Clic droit : Renommer, Archiver (historique du projet, réouvrable), Supprimer (arrête le process, supprime le worktree après confirmation si non mergé).
- **Remote control** (clic droit, par agent, désactivé par défaut) : la session de l'agent devient accessible depuis claude.ai et l'app Claude mobile, sous le nom « projet · agent » (requête de contrôle `remote_control`). Son process reste lancé (démarré avec l'app, jamais arrêté pour inactivité) et retrouve la même session distante après un redémarrage (`reattach_session_id`, `keep_session_on_exit`), donc le lien reste valable. Les messages envoyés depuis claude.ai s'affichent dans l'app (« depuis claude.ai ») grâce à `--replay-user-messages` ; l'écho des messages envoyés depuis l'app est écarté par son uuid. Icône sur la carte (connecté / en attente) ; clic droit : Ouvrir sur claude.ai, Copier le lien. Archiver ou supprimer l'agent met fin à sa session distante.
- **Terminaux** : menu `+` → PowerShell 7, Git Bash, WSL (Ubuntu). Vrai terminal (ConPTY via portable-pty + xterm.js WebGL) : autocomplétion native du shell (Tab / PSReadLine / bash-completion), historique, Ctrl+R, couleurs ANSI, programmes plein écran (vim, less, htop), redimensionnement, copier/coller, liens cliquables, recherche. Les terminaux ne survivent pas à un redémarrage.
- **Pied** : chemin, branche, `~ modifiés / + ajoutés / − supprimés`, sélecteur de couleur.

## Conversation

- En-tête : nom, statut, projet / branche ; modèle, tokens, coût, « Fichiers ▸ » (ouvre le panneau), durée ; sélecteur de disposition. Quand la colonne est étroite, tokens et durée (puis coût et fichiers) s'effacent : la carte de l'agent les affiche aussi.
- **Disposition** (globale, mémorisée dans `state.json`, `Ctrl+Maj+L`) : classique (panneau des fichiers à ouvrir) ou **moitié / moitié** : conversation à gauche, à droite le panneau « Non commités » toujours visible avec, sous la liste, le diff du fichier sélectionné (premier fichier par défaut, rafraîchi pendant que l'agent édite).
- Messages : utilisateur (bulle à droite), assistant (markdown), lignes d'outils compactes **dépliables** (diff pour Edit/Write, unifié ou côte à côte selon le style choisi dans les vues de diff ; sortie pour Bash…), réflexion repliée dépliable.
- Carte question (AskUserQuestion / permission) : options en boutons, réponse libre possible dans le composer ; carte répondue grisée « → réponse ».
- Carte « Tâche terminée » : durée, tokens, coût, fichiers ; « Revoir les fichiers », « Commit… ».
- Indicateur « Claude travaille… » + bouton Stop (interrompre).
- Composer : menus déroulants ouverts vers le haut — Modèle (Fable · Opus · Sonnet · Haiku, alias CLI), Effort (Bas · Moyen · Élevé · Très élevé · Max), Mode (Auto · Demander · Plan · Édits auto · Bypass ; **Auto par défaut**) — puis Envoyer (↵), toujours sur une seule ligne : dans une colonne étroite, les libellés des menus s'effacent et Stop se réduit à ■. Bordure jaune si une question attend.
- Composer v1 : images (coller / glisser), autocomplétion `@fichier`, slash commands (intégrées + `.claude/commands` + skills), messages envoyés pendant que Claude travaille : transmis tout de suite, le CLI les intègre à l'étape suivante du tour (mention « transmis pendant le tour » jusqu'à la fin du tour).

## Git & fichiers

- Panneau « Non commités » : portée « Cet agent » / « Tout le projet », attribution par worktree (ou par outils Edit/Write de l'agent hors mode worktree).
- Onglet « Historique » du même panneau : git graph des 300 derniers commits de tout le dépôt (branches locales et distantes, tags, branches `ccm/…` des agents étiquetées de leur nom). La branche de l'agent (son worktree, sinon la branche courante) est mise en avant, le reste atténué. Clic sur un commit → son diff (contre le premier parent pour un merge) dans la vue diff. Rafraîchi à chaque commit, merge ou branche.
- « Voir le diff » : vue diff plein écran (unifiée / côte à côte ; choix partagé avec le volet de la disposition moitié / moitié et les diffs de la conversation, et mémorisé).
- « Commit… » : envoie à l'agent une demande de commit de ses changements (il rédige le message).
- Mode worktree : `<projet>/.claude/worktrees/<agent>`, branche dédiée. Bouton « Merger dans <branche> » (merge ou squash) ; suppression de l'agent → nettoyage worktree + branche.
- Compteurs git rafraîchis par watcher de fichiers (debounce), pas par polling.

## Notifications

- Déclencheurs : question de Claude (AskUserQuestion / permission) et fin de tour.
- Dans l'app : pastilles pulsantes (onglet, carte agent, barre de statut) + carillon du design (2 notes synthétisées), coupable via « ♪ On/Off ».
- App en arrière-plan / tray : toast Windows (clic → ouvre l'agent) + clignotement barre des tâches + badge tray.

## Barre de statut

Actifs · en attente · terminés │ Session 5 h (barre, %, reset dans) · Hebdo (barre, %) │ Coût du jour │ ♪ · ⚙ (réglages).

- Quotas : endpoint utilisé par `/usage` (token OAuth de Claude Code, lecture seule), sauf si une source officielle équivalente existe dans le stream.
- Coûts : équivalent API (compte Max). Le coût exact de chaque tour vient de Claude Code à la fin du tour ; pendant le tour, tokens et coût (préfixé « ≈ ») montent en direct, estimés à partir des tarifs publics (`pricing.rs`), puis remplacés par le chiffre exact. Les statistiques n'enregistrent que les coûts exacts.

## Stats

- Périmètre : uniquement les agents lancés par l'app (stockage SQLite).
- Plages : Jour (14 j) / Semaine (12 sem.) / Mois (12 mois).
- KPIs : Tokens (+ évolution vs période précédente), Coût global (depuis le premier agent), Coût moyen / prompt, Prompts.
- Histogramme empilé 3 séries : entrée, cache, sortie. Répartition par projet et par modèle.

## Réglages (⚙ barre de statut → modale)

Chemin de `claude`, modèle / effort / mode par défaut, son, notifications Windows, shells, éditeur externe, arrêt des process inactifs, raccourcis.

- **Proxy réseau** : URL HTTP(S) (avec identifiants éventuels) + exclusions `NO_PROXY`. Injecté dans les process `claude` (`HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY`), les appels de quotas et le vérificateur de mises à jour ; option pour l'exporter aussi dans les terminaux intégrés.
- Les coûts enregistrés viennent directement de Claude Code (`costUSD` par modèle). La grille de `pricing.rs` ne sert qu'à l'estimation en cours de tour ; un modèle absent de la grille n'a simplement pas d'estimation.

## Raccourcis (défauts)

`Ctrl+1..9` projets · `Ctrl+N` nouvel agent · `Ctrl+J` prochain agent en attente · `Ctrl+Maj+L` disposition · `Échap` interrompre · `Ctrl+,` réglages.

## Livraison

- UI en français.
- Installeur Windows (NSIS) + auto-update via GitHub Releases (`guillaume-gagnaire/claude-code-manager`).
- CI/CD GitHub Actions :
  - `ci.yml` (push / PR) : lint + typecheck + tests frontend, `cargo fmt --check`, `clippy`, `cargo test`, build de vérification.
  - `release.yml` (tag `v*`) : `tauri-action` → build Windows, signature des artefacts de mise à jour (secret `TAURI_SIGNING_PRIVATE_KEY`), publication de la release GitHub avec l'installeur et `latest.json` consommé par l'updater.
- Commits atomiques sur `main`, sans push.
