# La Nuit du collage : un mur commun à se disputer entre camps (conception)

Date : 19/11/2026. Version : 1.9.0 (sort avec la Brocante et la vague satirique). Statut : en validation (relu par un
« constructeur », questions intégrées ; maquette `maquette/collage.html` à valider).

## Pourquoi

Un mini-jeu **permanent** qui appuie sur le multijoueur et donne une raison de revenir **chaque jour**. Les mini-jeux
actuels (Cortège, Épervier, bataille de neige) se jouent seul ; les duels et défis demandent un adversaire précis. Le
mur est un terrain commun, visible de tous, où les deux camps s'affrontent en asynchrone : on colle ses affiches, on
recouvre celles d'en face, on revient défendre son coin. Ça marche même avec trois joueurs connectés, et les
bénévoles gardent le combat équilibré quand un camp est moins nombreux.

**Réussite** : chaque jour, des joueurs des deux camps collent ; le décompte de minuit se joue à peu de cases ; le mur
change d'aspect d'un jour à l'autre ; le camp minoritaire garde ses chances.

## Objectifs

- Des murs communs de 48 cases, visibles en direct par tous ; un nouveau mur s'ouvre quand le dernier est plein.
- Coller = choisir une case, puis un coup de pinceau de 3 s dont la qualité fait la solidité de l'affiche.
- Les affiches vieillissent et libèrent leur case au bout de 48 h, sauf si leur camp les recolle.
- Chaque nuit à minuit, le camp qui couvre le plus de cases gagne la nuit.
- Des militants bénévoles (gérés par le serveur) compensent l'écart de colleurs actifs entre camps.
- Récompenses : XP selon la qualité du collage, 1 bulletin par nuit gagnée, un titre de colleur de la semaine.

## Non-objectifs

- Pas de texte libre sur les affiches (le chat est fermé par défaut ; rien à modérer).
- Pas de quartiers ni de carte : une file de murs identiques, rien de plus.
- Pas de remise à blanc du mur : il vit en continu, l'usure fait le ménage.
- Pas de notification push dans cette version (le journal et le fil suffisent).
- Pas d'argent réel, jamais ; pas de FM.

## Anti-objectifs (échec même si « ça marche »)

- Un camp qui fige le mur pour toujours parce qu'il a pris de l'avance.
- Un camp plus nombreux qui écrase l'autre chaque nuit : le minoritaire se décourage et part.
- Des bénévoles qui jouent à la place d'un camp absent (un camp où personne ne colle doit perdre la nuit).
- Un coup de pinceau truqué depuis le navigateur (collages parfaits envoyés à la main).
- Un mur qui rapporte plus que le reste du jeu (XP ou bulletins hors de proportion).
- Un mur illisible sur téléphone.

## Approches

1. **Retenue — mur côté serveur, pinceau jugé par le serveur, tâches de fond dans la boucle du serveur.** Un module de
   stockage à part (comme `server/snowfront.mjs`, `server/marketstore.mjs`) garde les cases en base ; les règles pures
   vivent dans un module partagé `web/wall.mjs` (comme `web/market.mjs`) ; la diffusion passe par le flux SSE existant ;
   l'usure, les bénévoles et le décompte de minuit tournent dans un `setInterval` comme la clôture du Front de neige.
2. Pinceau jugé dans le navigateur : écarté, n'importe qui enverrait des collages parfaits.
3. Mur gardé dans la sauvegarde de chaque joueur : impossible, le mur est commun.
4. Bénévoles dans un programme séparé : une pièce de plus à déployer et surveiller, sans gain.

## Règles (décidées avec l'utilisateur)

### Le mur

- *Révisé après la maquette (décidé avec l'utilisateur)* : une grande grille de 16 × 12 était illisible sur téléphone.
  Le mur est une **file de murs de 8 × 6 = 48 cases** (environ 40 px par case sur un téléphone).
- **Un mur plein** (plus aucune case libre) ouvre automatiquement le **mur suivant**. Sur un mur plein, on peut
  toujours attaquer ou rafraîchir.
- Un mur qui se vide reste tant qu'un mur après lui est occupé ; le **dernier** mur ouvert disparaît s'il redevient
  entièrement vide (jamais de mur fantôme en bout de file). Le premier mur existe toujours.
- **Au plus 5 murs** (240 cases).
- Navigation : des **flèches en bas** (◀ ▶) passent d'un mur à l'autre, avec « Mur 2 / 3 » et le score du mur affiché.
  À l'ouverture de l'écran, le jeu montre le premier mur qui a encore une case libre (sinon le premier).
- Une case (repérée par son mur et sa position) est **vide** ou porte **une affiche** : camp, solidité 1 à 3, moment du dernier collage, dernier colleur
  (ou « bénévole »).
- Le mur est le même pour tous et se met à jour en direct.

### Coller une affiche

- **Quota : 5 affiches par jour et par joueur**, remis à zéro à minuit (heure de Paris, comme le reste du jeu).
- **Accès : dès le niveau 3.** Un joueur suspendu ou politiquement mort ne colle pas (comme pour les autres activités).
- Le joueur choisit une case, touche « Coller », puis arrête un **pinceau** qui va et vient sur une jauge pendant 3 s :
  - **parfait** (zone étroite au centre) → solidité **3** ;
  - **bon** (zone autour) → solidité **2** ;
  - **bâclé** (hors zone, ou pas d'arrêt avant 3 s) → solidité **1**.
- Effet selon la case visée, appliqué au moment de l'arrêt du pinceau (la case a pu changer pendant les 3 s) :
  - **vide** → l'affiche du joueur s'y pose, avec la solidité obtenue ;
  - **affiche de son camp** → elle est **rafraîchie** (son âge repart de zéro) et prend la solidité
    `max(actuelle, obtenue)` ; le joueur devient son dernier colleur ;
  - **affiche du camp adverse** → elle **perd 1 point** de solidité ; si elle tombe à 0, la case change de camp et
    reçoit l'affiche du joueur avec la solidité obtenue. Une affiche à 3 résiste donc à deux recollages, une affiche
    bâclée part au premier.
- Chaque essai consomme une affiche du quota, quel que soit le résultat.
- *Décision de conception* : **un seul essai ouvert** à la fois par joueur. Le navigateur arrête lui-même le pinceau à
  3 s (collage bâclé). Un essai jamais renvoyé (page fermée en plein geste) expire : l'affiche est **perdue sans être
  collée** ; le serveur ne pose rien sur le mur à sa place.

### L'usure

- Âge compté depuis le dernier collage ou rafraîchissement :
  - **0 – 24 h** : affiche nette ;
  - **24 – 44 h** : pâlie ;
  - **44 – 48 h** : déchirée ;
  - **48 h** : **hors d'usage**, la case redevient vide.
- L'usure ne change pas la solidité, seulement l'aspect, jusqu'à la libération.

### La nuit et la semaine

- **À minuit** (Paris), le serveur compte les cases de chaque camp sur **tous les murs** (bénévoles compris). **Seul un camp qui a eu au moins
  un colleur actif humain ce jour-là peut gagner** (décidé avec l'utilisateur) :
  - les deux camps ont collé : le plus de cases gagne ; égalité avec au moins une case → les deux gagnent (comme le
    Front de neige) ;
  - un seul camp a collé : il gagne s'il a au moins une case, même avec moins de cases que l'autre ;
  - aucun camp n'a collé : personne ne gagne, pas de ligne dans le fil.
- **Les colleurs actifs du jour** du camp vainqueur (joueurs humains qui ont collé au moins une affiche ce jour-là)
  reçoivent **1 bulletin** (journal : ligne « Nuit du collage »). Les autres ne reçoivent rien.
- Une ligne dans le fil : « 🖌️ La Gauche a tenu le mur cette nuit (58 cases contre 41). »
- **Colleur de la semaine** : du lundi 0 h au dimanche minuit, le joueur qui a réussi le plus de collages utiles gagne
  le titre ; ligne dans le fil. Le titre s'affiche sur sa fiche pendant la semaine suivante.
  - *Décision de conception* : comptent seulement les **poses sur case vide** et les **cases prises à l'adversaire** ;
    ni les rafraîchissements ni les attaques qui ne font que retirer un point (sinon tout le monde finit à égalité).
  - *Décision de conception* : égalité → le titre va à celui qui a **atteint ce score en premier**.

### Le jour et la nuit (décidé avec l'utilisateur, 19/11)

- L'activité s'appelle **« Collage »** le jour et **« La Nuit du collage »** la nuit.
- La nuit va de **20 h à 8 h** (heure de Paris). Elle est ouverte 24 h/24 : ni la nuit de l'élu ni sa sieste ne bloquent.
- **La nuit, l'XP d'une affiche est multipliée par 1,5** (+50 %). *Décision de conception* : ce bonus se multiplie
  avec un événement « Double XP » (×2 × 1,5 = ×3), arrondi à l'entier.

### Récompenses en XP

- XP par affiche selon la qualité (valeurs de départ, réglables) : **parfait 14, bon 10, bâclé 5**. Au plus
  5 × 14 = 70 XP par jour, soit une très bonne partie de Cortège.
- Les événements « XP doublée » s'appliquent comme aux autres mini-jeux.
- Les bénévoles ne rapportent d'XP à personne.

### Les militants bénévoles

- Compensent l'écart de **colleurs actifs du jour** (humains ayant collé au moins une fois aujourd'hui), pas de
  comptes inscrits.
- Si un camp a A colleurs actifs et l'autre B < A, le camp minoritaire reçoit `min(A − B, B)` bénévoles : jamais plus
  que ses propres joueurs réels. Un camp sans aucun colleur actif n'a **aucun** bénévole.
- Chaque bénévole a le même quota qu'un joueur (5 affiches par jour), collées **par vagues** au fil de la journée (pas
  tout à 23 h 59), toujours de qualité « bon » (solidité 2).
- *Décision de conception* : un bénévole qui apparaît en cours de journée n'a que la **part des vagues restantes**
  (budget du jour des bénévoles suivi d'une vague à l'autre) : un renfort apparu à 22 h colle 1 affiche, pas 5.
- L'écart est recalculé à chaque vague avec les colleurs actifs du moment : créer un compte ou changer de camp à 23 h ne
  fait pas basculer les renforts d'un coup.
- Ciblage par règles simples, dans l'ordre :
  1. rafraîchir les affiches de son camp les plus menacées (solidité 1, ou proches des 48 h) ;
  2. reprendre les cases perdues récemment (passées à l'adversaire dans les dernières 24 h) ;
  3. coller sur une case vide ;
  4. attaquer l'affiche adverse la plus fragile.
  Ils visent tous les murs ouverts ; une pose sur case vide va au premier mur qui en a une.
  Les égalités se départagent par un tirage déterministe (graine du jour), pour des tests reproductibles.
- Leurs affiches portent une marque « bénévole » visible ; elles comptent pour le camp au décompte.

## Écran (à valider en maquette)

```
 La Nuit du collage          Gauche 58 · Droite 41 · 4 h 12 avant minuit
 ┌─────────────────────────────────────┐
 │  ▓▓  ░░  ▒▒  ▓▓  ▓▓  ░░  (b)        │  ▓ affiche fraîche
 │  ...   (8 × 6, grosses cases)       │  ▒ pâlie   ░ déchirée   (b) bénévole
 └─────────────────────────────────────┘
        ◀   Mur 2 / 3 · G 20 · D 17   ▶
 Il te reste 3 affiches aujourd'hui            [Coller]
```

- Toucher une case : qui l'a collée (ou « bénévole »), depuis quand, sa solidité.
- Le pinceau : une jauge horizontale, la zone « parfait » au centre, un bouton (et la barre d'espace) pour arrêter.
- Les affiches : quelques motifs pixel par camp, aux couleurs du camp ; aucune lettre lisible. Le design exact sort de
  la maquette.

## Contraintes techniques (existant à réutiliser)

- **Règles pures partagées** : `web/wall.mjs` (taille, quotas, effets d'un collage, usure, qualité du pinceau, choix des
  bénévoles, décompte). Testées sans serveur (`node --test`).
- **Stockage** : un module `server/wallstore.mjs` (tables SQLite) sur le modèle de `server/snowfront.mjs` /
  `server/marketstore.mjs`.
- **Pinceau jugé par le serveur** : « Coller » ouvre un essai côté serveur (graine du mouvement + instant de départ) ;
  le navigateur anime la jauge et renvoie seulement le temps écoulé à l'arrêt ; le serveur recalcule la position et la
  qualité, refuse un temps impossible (plus court qu'un minimum, ou plus long que le temps réellement écoulé côté
  serveur plus une tolérance), et compte un essai sans réponse comme bâclé. Même esprit que le rejeu des batailles de
  neige.
- **Diffusion** : événement SSE regroupé (comme le tableau de la Brocante) ; l'état complet du mur n'est chargé que quand
  l'écran est ouvert.
- **Tâches de fond** : usure, vagues des bénévoles, décompte de minuit et versement des bulletins dans **une**
  transaction (tout ou rien, rejoué au tick suivant en cas d'erreur), avec une marque « nuit close » en réglages — comme
  `closeFront`.
- *Décision de conception* : **nuits manquées** (serveur arrêté pendant minuit) : seule la dernière nuit manquée est
  comptée, à partir du mur au moment de la reprise ; les plus anciennes sont sautées et notées dans le journal de la
  console. La marque « nuit close » porte la clé du jour.
- **Admin** : une carte en lecture dans la console (état du mur, historique des nuits, bénévoles du jour).
- Aide en jeu, changelog 1.9.0, README et `docs/DEPLOIEMENT.md` mis à jour.

## Laissé au constructeur

- Le schéma exact des tables et des routes (`/api/wall` ou opérations dans `/api/action`).
- La vitesse et la forme du mouvement du pinceau, la largeur des zones, la tolérance de temps.
- L'horaire des vagues de bénévoles.
- Ce que deviennent les affiches d'un compte supprimé (elles restent, colleur affiché « ancien élu », est une
  proposition).
- L'emplacement de l'entrée dans l'interface (proposition : l'écran « Jeux », à côté des autres mini-jeux).
- Les réglages par variable d'environnement (quota, XP, niveau), sur le modèle de `POLITIGO_MARKET_MIN_AGE_H`.
