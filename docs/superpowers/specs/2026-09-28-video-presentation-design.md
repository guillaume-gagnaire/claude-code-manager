# Vidéo de présentation — design

## But

Une vidéo YouTube qui montre en 1 min 20 tout ce que fait Claude Code Manager, pour donner envie de l'installer. Pas de voix off : textes animés, interface recréée en animation, musique dynamique.

Ce qui a été choisi :

- textes en français ;
- interface **recréée** dans Remotion (pas de captures de l'app) ;
- musique **composée par code** (libre de droits, générée par un script).

## Format

- 1920×1080, 30 i/s, H.264 (`video/out/presentation.mp4`, non commité).
- 82 s = 41 mesures à 120 BPM : une mesure = 2 s = 60 images. Chaque plan commence sur une mesure.

## Script

| Mesures | Temps | Plan                                                                                                                                                  | Texte à l'écran                                                         |
| ------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0–3     | 0:00  | Le logo se construit (les fenêtres s'empilent, l'étincelle s'allume), puis le titre                                                                   | « Claude Code Manager » · « Tous tes Claude Code, dans une seule fenêtre. » |
| 3–6     | 0:06  | Des fenêtres de terminal `claude` s'empilent jusqu'à couvrir l'écran, puis sont aspirées dans la fenêtre de l'app                                      | « 5 projets. 12 agents. 30 terminaux ? »                                |
| 6–11    | 0:12  | **Drop.** Les onglets de projets apparaissent (couleurs, compteurs), la barre latérale se remplit d'agents aux statuts vivants                        | « Un onglet par projet. Autant d'agents que tu veux. »                  |
| 11–16   | 0:22  | Chat : une réponse markdown s'écrit, des appels d'outils se replient, une carte de question reçoit sa réponse en un clic                              | « Un vrai chat. Des questions en un clic. »                             |
| 16–20   | 0:32  | Une pastille « Question » pulse, une notification Windows glisse, `Ctrl+J` saute à l'agent                                                            | « Il attend ta réponse ? Tu le sais tout de suite. »                    |
| 20–25   | 0:40  | **Second drop.** Disposition moitié / moitié, diff côte à côte, git graph avec la branche de l'agent en avant, merge                                  | « Chaque modif, chaque branche, sous tes yeux. »                        |
| 25–29   | 0:50  | Section Lancement : « Tout lancer », les statuts passent en cours, une commande plante (code 1) et le dit ; le log défile                               | « Lance ton projet d'un clic. Vois quand ça plante. »                   |
| 29–33   | 0:58  | Coût qui monte en direct (≈), barres de quota qui se remplissent, graphique des stats                                                                 | « Tokens, coût, quotas : en direct. »                                   |
| 33–37   | 1:06  | Un téléphone affiche la même conversation sur claude.ai, un message envoyé depuis le téléphone apparaît dans l'app                                   | « Et depuis ton téléphone. »                                            |
| 37–41   | 1:14  | Retour du logo, lien GitHub, fondu                                                                                                                    | « Gratuit, open source, pour Windows. » · `github.com/guillaume-gagnaire/claude-code-manager` |

Les données affichées sont fictives (projets `demo-api`, `studio-web`, `mobile-app`… ; agents `refacto-auth`, `tests-e2e`…).

## Musique

Électro à 120 BPM, la mineur, une mesure par accord (la m – fa – do – sol), générée en WAV 44,1 kHz stéréo par un script déterministe :

- **Instruments** : kick (sinus à pitch descendant), clap (bruit filtré), charleston en doubles croches, basse (dent de scie filtrée), arpèges, nappes.
- **Structure calée sur le script** :
  - intro, mesures 0–6 : nappes et arpège filtré, montée sur la mesure 5 ;
  - drop à la mesure 6 : tout le groupe ;
  - allègement aux mesures 16–20 : sans kick ;
  - second drop à la mesure 20 ;
  - fin, mesures 37–41 : coup final sur le logo, puis les nappes en fondu.
- **Mixage** : normalisé sous 0 dBFS (pas de saturation), fondu de sortie.

## Technique

Un dossier `video/` indépendant, avec son `package.json` (Remotion 4, React, TypeScript, Vitest). Il n'entre ni dans le build de l'app ni dans la CI ; il est exclu du Prettier de l'app, et il a son propre formatage.

- `src/theme.ts` : couleurs et polices de l'app (Hanken Grotesk, JetBrains Mono via `@fontsource`).
- `src/timeline.ts` : les plans en mesures, convertis en images ; pur et testé.
- `src/ui/` : les morceaux d'interface recréés, avec les couleurs de l'app. Ils reçoivent leur état en props et ne portent aucune logique de temps :
  - le cadre de l'app : onglets, barre latérale, barre de statut ;
  - les cartes d'agent, un message avec texte qui s'écrit, l'appel d'outil, la carte de question ;
  - le diff, le git graph, la section Lancement ;
  - les quotas, le graphique, la notification, le téléphone, le texte animé.
- `src/scenes/` : un composant par plan du script ; il anime les morceaux d'`ui/` avec `useCurrentFrame`, `spring` et `interpolate`.
- `src/Presentation.tsx` : les plans en `<Sequence>` d'après la timeline, plus la piste audio.
- `music/generate.ts` : la synthèse, qui écrit `public/music.wav` (non commité) ; lancée par `npm run music` avant le rendu.
- Scripts :
  - `npm run studio` : aperçu ;
  - `npm run render` : musique puis rendu MP4 ;
  - `npm test`.

## Vérification

- **Tests** :
  - timeline : 41 mesures, 2 460 images, plans jointifs et alignés sur les mesures ;
  - WAV : en-tête valide, durée égale à celle de la vidéo, crête sous 0 dBFS, kick présent sur les temps après le drop et absent pendant l'allègement.
- **Revue visuelle** :
  - une image fixe par plan (`remotion still`), relue avant le rendu complet ;
  - des images extraites du MP4 final.
- **Livraison** : le MP4 t'est envoyé.

## Hors champ

Voix off, version anglaise, rendu en CI, captures de l'app réelle.

## Licence

Remotion est gratuit pour un particulier ou une entreprise de 3 personnes au plus ; au-delà, une licence entreprise est nécessaire.
