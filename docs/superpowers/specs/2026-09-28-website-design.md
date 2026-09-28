# Site de présentation — design

## But

Un site d'une page, en français, qui donne envie d'installer **CCM - Claude Code Manager** : ce que fait l'app, la vidéo, comment l'installer. Il est servi par GitHub Pages à `https://guillaume-gagnaire.github.io/claude-code-manager/`.

Ce qui a été choisi :

- licence MIT ajoutée au dépôt : le site et la vidéo peuvent dire « open source » ;
- site en français ;
- la vidéo est servie par le site lui-même ;
- les images de l'interface viennent des composants de la vidéo.

## Contenu

1. **En-tête** : logo, liens d'ancre (Vidéo, Fonctionnalités, Installer, FAQ), lien GitHub.
2. **Accroche** :
   - « CCM - Claude Code Manager », « Tous tes Claude Code, dans une seule fenêtre. », une phrase de présentation ;
   - boutons « Télécharger pour Windows » (dernière release GitHub) et « Voir sur GitHub » ;
   - version de l'app, Windows 10 et 11, gratuit et open source (MIT).
3. **Vidéo** : le MP4 de présentation avec son affiche, chargé au clic.
4. **Fonctionnalités** :
   - 7 rangées texte + image : projets et agents, chat, notifications, git, lancement, stats et quotas, remote control ;
   - puis 6 cartes : terminaux, worktree par agent, zone de notification, proxy, mises à jour, raccourcis.
5. **Installer en 3 étapes** : Claude Code installé et connecté, installeur de la dernière version, un dossier de projet.
6. **FAQ** : gratuité, données, Windows, mises à jour, lien avec Anthropic.
7. **Pied** : licence MIT, GitHub, « Projet indépendant, non affilié à Anthropic. Claude et Claude Code sont des marques d'Anthropic. »

## Apparence

- Couleurs et polices de l'app (Hanken Grotesk, JetBrains Mono, servies par le site, pas par Google), le logo de l'app.
- Utilisable sur téléphone : les rangées passent en colonne, sans défilement horizontal.

## Technique

- **Projet** : `website/`, Nuxt 4, génération statique (`nuxt generate`, preset `github_pages`) sous `/claude-code-manager/`.
- **Données** :
  - le contenu est dans un fichier de données typé ;
  - la version vient de `src-tauri/tauri.conf.json` à la génération.
- **Fichiers servis** (`website/public/`, commités) :
  - images en JPEG, rendues depuis `video/` par un script, sans les textes de la vidéo ;
  - l'affiche ;
  - le MP4 ;
  - le logo.
- **Déploiement** : un workflow `pages.yml`, à chaque push sur main qui touche `website/` ou la version de l'app : installation, génération, tests, puis déploiement GitHub Pages.
- **Réglages GitHub** (faits dans Chrome, avec l'accord de l'utilisateur) : source Pages = GitHub Actions, adresse du site dans « About ».

## Vérification

- **Tests sur le site généré** :
  - titre, description, image de partage ;
  - toutes les fonctionnalités, étapes et questions présentes ;
  - lien de téléchargement et lien GitHub, version affichée ;
  - chaque fichier local référencé existe bien sous `/claude-code-manager/` ;
  - la vidéo et son affiche ;
  - le `.nojekyll`.
- **Revue visuelle** : captures du site en bureau et en mobile.
- **Après déploiement** : la page publique répond et ses fichiers aussi.

## Hors champ

Version anglaise, nom de domaine personnalisé, blog, statistiques de visite.
