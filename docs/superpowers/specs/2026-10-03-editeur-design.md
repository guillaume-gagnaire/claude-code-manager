# Éditeur intégré — design

## But

Parcourir et éditer les fichiers d'un projet ou du worktree d'un agent sans quitter Escouade : arborescence, onglets, coloration syntaxique, enregistrement. L'éditeur intégré **remplace** l'ouverture de fichiers et du projet dans un éditeur externe (VS Code, Cursor, Zed), qui disparaît de l'app.

Référence visuelle : écran « Éditeur » de `design/Claude Code Manager.dc.html` (projet claude.ai/design 9047fbff…, relu le 2026-10-03).

Décisions validées le 2026-10-03 :

- moteur CodeMirror 6 ;
- un clic sur un fichier du panneau « Non commités » montre toujours son diff ; un bouton sur la ligne ouvre l'éditeur ;
- l'éditeur externe est retiré (réglage, détection, menus) ; « Ouvrir le dossier » (explorateur du système) reste.

## Source

L'éditeur montre une **source** :

- **branche du projet** : le checkout principal (dossier du projet) ;
- **worktree d'un agent** : `<projet>/.claude/worktrees/<agent>`, pour chaque agent non archivé qui a un worktree.

Un agent sans worktree travaille dans le dossier du projet : sa source est la branche du projet.

## Points d'entrée

| Où | Action |
|---|---|
| En-tête de l'agent | bouton « `</>` Éditeur » (entre le titre et les métriques) → source de l'agent |
| Pied de la barre latérale | bouton « Parcourir » à droite de la branche → branche du projet |
| Barre d'onglets | le bouton « Éditeur ▾ » devient « Éditeur », sans menu → branche du projet |
| Panneau « Non commités » | bouton `</>` sur la ligne (visible au survol et sur la ligne choisie) et clic droit « Ouvrir dans l'éditeur » → le fichier, dans la source qui le possède |
| Clic droit sur un agent | « Ouvrir dans l'éditeur » (remplace « Ouvrir le worktree dans l'éditeur ») |
| Conversation, lignes Edit / Write / MultiEdit | le chemin du fichier devient un lien → le fichier, à la première ligne modifiée ; un clic ailleurs sur la ligne la déplie comme aujourd'hui |
| Carte « Tâche terminée » | les fichiers listés deviennent des liens |

Le clic sur une ligne du panneau « Non commités » garde son comportement (diff). Les boutons « Voir le diff » et « Commit… » du pied restent.

## Vue

L'éditeur occupe la zone principale du projet (à la place de la conversation, d'un terminal ou d'une commande) ; le panneau des fichiers est masqué tant qu'il est ouvert.

- **En-tête** : « ← Conversation » (ferme l'éditeur), séparateur, **sélecteur de source** (icône, nom, `branche` / `worktree`, ▾). Son menu « Parcourir » liste la branche du projet (« Branche du projet · chemin », « Δ n » ou « propre ») puis chaque agent à worktree (pastille de statut, `.claude/worktrees/<nom> · modèle`, « n modif. » ou « propre »), ✓ sur la source courante. À droite : état (« ● Non enregistré · Ctrl+S » en couleur d'attente, « Enregistré ») et bouton « Enregistrer » (accent si modifié).
- **Arborescence** (240 px) : titre « Fichiers » + « N · n modif. », chemin de la source ; dossiers puis fichiers, triés, indentés de 14 px, chevron ▾ / ▸. Fichiers modifiés colorés avec leur lettre (`M` attente, `A` ajout), point `•` sur les dossiers qui en contiennent. Au départ : premier niveau visible, dossiers repliés, ancêtres du fichier ouvert dépliés.
- **Onglets** : nom du fichier (coloré s'il est modifié dans git), point blanc si non enregistré à la place du ×, liseré accent sur l'onglet actif. Fermer un onglet non enregistré demande « Enregistrer / Ne pas enregistrer / Annuler ».
- **Fil d'Ariane** : `src  /  middleware  /  auth.ts` ; à droite « N lignes modifiées vs main », « Nouveau fichier · absent de main » ou « Identique à main » (référence : voir *Lignes modifiées*).
- **Code** : CodeMirror 6, JetBrains Mono 12,5 px, interligne 20 px, fond `--term`, numéros de ligne (ligne courante en `--text`), ligne courante teintée d'accent, curseur accent, marque verte de 3 px dans la gouttière sur les lignes ajoutées ou modifiées, petite marque rouge entre deux lignes là où des lignes ont été supprimées.
- **Barre d'état** (26 px) : `Ln 12, Col 4` · langage · `UTF-8` · `LF` / `CRLF` · `Espaces : 2` / `Tabulations` · à droite la source (`worktree · <agent>` / `branche · <branche>`).
- Sans fichier : « Sélectionne un fichier dans l'arborescence. »
- Fichier binaire : « Fichier binaire : pas d'aperçu. » ; fichier de plus de 2 Mo : « Fichier trop volumineux pour l'éditeur (N Mo). ».

Fichier ouvert à l'entrée : celui demandé, sinon le dernier actif de cette source, sinon le premier fichier modifié, sinon `README.md`, sinon aucun.

## Comportement

- **Changer de source** garde les onglets de chaque source : revenir sur une source retrouve ses onglets et ses modifications non enregistrées.
- **Choisir un agent** dans la barre latérale pendant que l'éditeur est ouvert bascule l'éditeur sur la source de cet agent. Choisir un terminal ou une commande de lancement ferme l'éditeur. Changer de projet garde l'éditeur de chaque projet tel quel.
- **Enregistrer** : Ctrl+S (dans l'éditeur ou l'arborescence) ou le bouton. L'écriture garde les fins de ligne (LF / CRLF, majoritaires dans le fichier lu) et le BOM éventuel du fichier.
- **Édition** : historique (Ctrl+Z / Ctrl+Y), recherche et remplacement (Ctrl+F, textes en français), indentation détectée (tabulations ou N espaces, 2 par défaut), Tab indente, appariement des parenthèses, multi-curseurs.
- **Changement sur le disque** (l'agent édite, un pull…) : à chaque événement git du projet et à l'activation d'un onglet, les fichiers ouverts sont relus. Un onglet sans modification se recharge (position du curseur gardée au mieux) ; un onglet modifié affiche un bandeau « Ce fichier a changé sur le disque. — Recharger · Garder ma version ». Enregistrer alors qu'il a changé sur le disque affiche le même bandeau ; « Garder ma version » enregistre en écrasant. Un fichier supprimé du disque : « Ce fichier a été supprimé. — Fermer · Le recréer en enregistrant ».
- **Mémoire** : les onglets et modifications non enregistrées vivent tant que l'app tourne (fermer la fenêtre la réduit dans la zone de notification). Ils ne survivent pas à un redémarrage.
- **Quitter** (menu de la zone de notification) avec des fichiers non enregistrés : la fenêtre réapparaît avec « N fichiers ne sont pas enregistrés. — Quitter quand même · Annuler ».

## Lignes modifiées

Référence de comparaison :

- worktree d'un agent : `git merge-base HEAD <branche de base de l'agent>` (tout le travail de l'agent, commité ou non), libellé avec le nom de la branche de base ; sans branche de base connue, `HEAD` ;
- branche du projet : `HEAD` (modifications non commitées).

La version de référence est lue par `git show <ref>:<chemin>` ; absente → « Nouveau fichier ». Le diff ligne à ligne entre la référence et le contenu de l'éditeur (modifications non enregistrées comprises) est recalculé 300 ms après la dernière frappe ; il donne les marques de gouttière et le compte de l'en-tête (lignes ajoutées + modifiées).

## Backend (Rust)

Nouveau module `fsedit.rs`, commandes Tauri :

- `fs_tree(project_id, agent_id?) -> { root, files: string[], truncated }` : fichiers de la source, chemins relatifs à `/`. Dépôt git : `git ls-files --cached --others --exclude-standard` (fichiers ignorés et worktrees des agents exclus) ; sinon parcours du dossier (`walk_files`). Au plus 50 000 fichiers (`truncated`).
- `fs_read(project_id, agent_id?, path) -> { kind: "text" | "binary" | "tooLarge", text?, size, hash, eol: "lf" | "crlf", bom }` : texte UTF-8 (BOM retiré, fins de ligne normalisées en `\n`) ; binaire = octet nul dans les 8 premiers Ko ou UTF-8 invalide ; au-delà de 2 Mo, `tooLarge` sans contenu ; `hash` = empreinte du contenu brut.
- `fs_write(project_id, agent_id?, path, text, eol, bom, expected_hash?) -> { hash }` : remet les fins de ligne et le BOM, écrit de façon atomique (`write_atomic`). Si le fichier existe et que son empreinte diffère de `expected_hash` → erreur `changed` (le frontend affiche le bandeau). Sans `expected_hash` : écriture forcée (crée le fichier s'il n'existe pas, dossiers parents compris).
- `fs_base(project_id, agent_id?, path) -> { reference, text? }` : version de référence (voir *Lignes modifiées*), `text` absent si le fichier n'y existe pas ou n'est pas du texte.
- `set_unsaved(count)` : nombre de fichiers non enregistrés, consulté par « Quitter ».

La racine de la source est donnée par `files_root(project_id, agent_id)` (worktree de l'agent ou racine du dépôt).

**Confinement des chemins** : nouvelle fonction `paths::contained(root, rel) -> Result<PathBuf>` qui refuse les chemins absolus, les préfixes de lecteur, les composants `..`, et tout chemin dont le parent canonique (liens symboliques résolus) sort de la racine canonique. Toutes les commandes ci-dessus passent par elle.

**Quitter** : le menu « Quitter » de la zone de notification, si `set_unsaved` a signalé des fichiers, affiche la fenêtre et émet `UiEvent::QuitRequested` au lieu de quitter ; le frontend confirme puis appelle `quit_app`.

## Frontend

- Dépendances : `@codemirror/state`, `view`, `commands`, `language`, `search`, `autocomplete` (fermeture des parenthèses), `@lezer/highlight`, paquets de langages chargés à la demande par extension : `lang-javascript` (js, jsx, ts, tsx, mjs, cjs), `lang-json`, `lang-markdown`, `lang-rust`, `lang-python`, `lang-css` (css, scss), `lang-html` (html, svelte, vue), `lang-yaml`, `lang-sql`, `lang-xml`, `lang-java`, `lang-cpp`, `lang-php`, `lang-go`, `legacy-modes` (toml, shell, powershell, dockerfile, ruby, swift, kotlin, c#) ; autres extensions en texte brut.
- Thème : couleurs du design (`--term` fond, `--accent` curseur, mots-clés ; chaînes `oklch(0.8 0.1 145)`, nombres `oklch(0.82 0.11 75)`, commentaires `--dim` italique, types `oklch(0.82 0.08 215)`, fonctions `oklch(0.87 0.08 95)`, propriétés `oklch(0.84 0.06 270)`, ponctuation `--muted`), suivant la teinte du projet.
- Unités :
  - `lib/editor/buffers.svelte.ts` : tampons par `source|chemin` (texte courant, texte et empreinte enregistrés, EOL, BOM, référence, état disque), onglets par source, nombre de non enregistrés (→ `set_unsaved`) ;
  - `lib/editor/tree.ts` : liste plate → lignes d'arborescence (pur) ;
  - `lib/editor/changes.ts` : diff référence / contenu → marques et compte (pur, réutilise `lib/diff.ts` si adapté) ;
  - `lib/editor/indent.ts`, `lib/editor/languages.ts`, `lib/editor/theme.ts` ;
  - composants `editor/EditorView.svelte`, `FileTree.svelte`, `EditorTabs.svelte`, `CodeEditor.svelte` (enveloppe CodeMirror), `SourcePicker.svelte`.
- État : `app.editor[projectId] = { on, source, perSource: { [source]: { open, active, collapsed } } }`. Dans `App.svelte`, l'éditeur passe avant commande, terminal et conversation. `onScreen()` / `markSeen` : la conversation d'un agent n'est pas à l'écran quand l'éditeur est ouvert.
- `ToolRow` : le chemin devient un bouton-lien (le reste de la ligne déplie). `TurnCard` : fichiers cliquables.

## Retrait de l'éditeur externe

- Rust : `editor.rs` supprimé (rien d'autre n'utilise sa résolution d'un programme dans le PATH ; le tableau la reprendra dans un petit module `which.rs` pour trouver `gh`) ; commandes `detect_editors`, `open_in_editor`, `open_file` ; `InitialState.editors` ; `Settings.editor_command` (un ancien `settings.json` qui le contient se charge toujours, le champ est ignoré).
- Frontend : `lib/editors.ts`, type `EditorInfo`, `Settings.editorCommand`, section « Éditeur » des réglages, menu « Éditeur ▾ », entrées « Éditer dans… » et « Ouvrir le worktree dans l'éditeur ».
- Docs : `docs/SPEC.md` (réglages, panneau, nouvelle section « Éditeur »), README.

## Hors périmètre

Créer, renommer ou supprimer des fichiers depuis l'arborescence ; aperçu d'images ; autocomplétion de code, diagnostics, formatage ; plusieurs éditeurs côte à côte ; fichiers hors de la source (chemins absolus).

## Tests

- Rust (`fsedit.rs`, `paths.rs`) : arbre (fichiers ignorés et worktrees exclus, hors dépôt, troncature) ; lecture texte / binaire / trop gros / BOM / CRLF ; écriture qui garde CRLF et BOM, atomique, refus `changed`, écriture forcée, création des dossiers parents ; référence d'un worktree (merge-base) et du projet (HEAD), fichier absent ; confinement (`..`, absolu, lecteur, lien symbolique sortant) ; « Quitter » avec non enregistrés.
- Vitest : `tree.ts`, `changes.ts`, `indent.ts` ; `EditorView` (ouverture par chaque point d'entrée, onglets, point non enregistré, fermeture avec confirmation, Ctrl+S → `fs_write` avec l'empreinte, bandeau sur `changed`, rechargement silencieux d'un onglet propre, bascule de source et d'agent) ; panneau « Non commités » (bouton `</>`, clic = diff) ; `ToolRow` (lien du chemin) ; réglages sans section « Éditeur ».
- e2e (app réelle) : « Parcourir » → ouvrir `src/app.ts` → taper → Ctrl+S → contenu sur le disque ; ouvrir un fichier depuis le panneau « Non commités » d'un agent à worktree.
