# La Trêve des confiseurs : thème de fin d'année (1.8.0)

Design validé à partir de la maquette locale `maquette/noel.html` + `noel.js` (non versionnée). La maquette fait foi pour
l'apparence. Ce document fixe les règles.

## Pourquoi

Il s'agit de donner au mois de décembre une ambiance de fête (Noël, neige, cadeaux, réveillons) qui plaise au plus
grand nombre, comme Halloween l'a fait fin octobre. Le jeu y gagne aussi une raison de revenir chaque jour et un
moment partagé par tous les joueurs, quel que soit leur camp : le toast de minuit au nouvel an.

## Objectifs

- Un thème **automatique du 1er décembre 0 h au 1er janvier 23 h 59** (heure du serveur), que la console peut forcer
  ou couper, sur le modèle d'Halloween.
- Des **costumes** : mêmes prix, mêmes effets, mêmes règles. Seuls les noms, les dessins et les répliques changent.
- Trois ajouts de jeu, actifs seulement pendant le thème :
  1. le **calendrier de l'Avent** (remplace, pour ce thème, le cadeau quotidien d'Halloween) ;
  2. la **Bataille de boules de neige**, un mini-jeu solo avec défis entre joueurs et un compteur collectif, le
     « Front de neige » ;
  3. le **toast de minuit** du nouvel an, avec sa notification, sa scène et un bandeau pour la revoir.

## Hors du périmètre

- Garder la bataille après le thème : elle revient chaque hiver avec lui.
- De nouveaux objets de garde-robe. Le bonnet et l'écharpe sont un costume, pas des objets possédés.
- Des fuseaux horaires propres à chaque joueur. Tout suit l'heure du serveur, comme le reste du jeu.

## À éviter absolument

- **De l'argent réel**, sous quelque forme que ce soit.
- **Des FM** gagnés par le calendrier ou par la bataille. Seulement des jauges, de l'XP de mini-jeu, des bulletins et du moral.
- **Un score de bataille que le serveur n'a pas recalculé lui-même.** Le Front de neige est collectif : un tricheur
  ne doit pas pouvoir le faire basculer.
- **Une scène ou une notification qui oppose les camps à minuit.** C'est un moment commun.
- **Un divulgâchage** dans le README, le changelog ou l'aide (le Bâton, les ultra rares).

## Les choix de construction (Approches)

1. **Confiance dans le score de la bataille.**
   - *Plafonds façon Manif* : simple, mais on peut gonfler son score jusqu'au plafond.
   - *Le serveur rejoue la partie* (**choisi**) : le navigateur n'envoie que ses touches, le serveur rejoue le même
     tirage avec le même module et en tire le score. Un score inventé est impossible.
2. **Le défi entre joueurs.**
   - *Défi léger, du moral en jeu* (**choisi**) : il ne touche ni l'XP ni le classement des duels.
   - *Réutiliser les duels* : écarté. Il mélangerait un jeu saisonnier au classement de toute l'année, pour beaucoup
     plus de travail.
3. **Le thème** suit Halloween (`eventAt`, `EVENT_MODES`, costumes dans `rules.mjs`). Aucune autre voie n'était
   sérieuse.

## Le thème

- `rules.mjs` : `EVENT_MODES` gagne `"noel"`. `eventAt(ms,"auto")` renvoie `"noel"` du 1er décembre au 1er janvier
  inclus (`md>=1201||md===101`). Halloween reste prioritaire sur ses deux jours, qui ne se chevauchent pas avec ceux-ci.
  - Dans la console, Réglages → événement saisonnier propose « Noël ».
  - La variable `POLITIGO_EVENT=noel` force le thème, comme pour Halloween.
- Un objet `NOEL` dans `rules.mjs`, sur le modèle de `HALLOWEEN` :
  - `shop` : les 9 noms de la maquette (tableau « Ce qui change de nom »), même clés ;
  - `pong` : environ 12 répliques par camp, mêlées pour moitié aux répliques habituelles ;
  - `questions` : environ 8 questions de Débat, en solo seulement, pour la même raison qu'à Halloween ;
  - `sleep` : la phrase de sommeil de chaque camp ;
  - `voeux` : le discours du 31 au soir, par camp.

  `itemName` et `pongLine` prennent `"noel"` en plus de `"halloween"`. `debateCount` suit.
- Ce qui change de nom à l'écran pendant le thème (la logique ne bouge pas) :
  - Missions → « Tournée des marchés de Noël » (avec une variante par camp) ;
  - Courrier → « Lettres au Père Noël » (seulement les titres, le contenu des lettres reste le même) ;
  - Objectifs du jour → « Bonnes résolutions » ;
  - la Tombola devient « du réveillon » et la Loterie « du gala de Noël ».
- Le décor (`app.js`), dessiné comme celui d'Halloween :
  - neige à la fenêtre, sapin qui clignote, cadeaux, guirlande tricolore ;
  - un bonnet de Père Noël et une écharpe (rouge à gauche, tricolore à droite) dessinés par-dessus l'élu, qui ne
    remplacent pas sa tenue de garde-robe ;
  - le **24 entre 18 h et 6 h**, le traîneau passe à la fenêtre ;
  - le **31 de 20 h à 23 h 59**, les vœux : drapeaux français et européen, un pupitre, l'élu en état « win », le
    discours en toast une fois par soirée ;
  - la nuit, l'élu dort comme d'habitude, avec la phrase de sommeil du thème ;
  - une bordure de fête et un petit sapin dans le bandeau, à la place de la citrouille ;
  - un toast de bienvenue une fois par an et par appareil, comme Halloween : « La Trêve des confiseurs commence !… ».

## Le calendrier de l'Avent

- Une case par jour civil, du 1er au 24 décembre. On ne peut ouvrir que la case du jour, éveillé ou non, une fois. Une
  case oubliée reste fermée : pas de rattrapage.
- Une nouvelle action `advent`, dans les règles. L'état `S.advent = {y: année, opened: [jours]}` est remis à zéro
  quand l'année change. L'action est refusée hors du thème, en dehors du 1er au 24, ou si la case est déjà ouverte.
- Les gains sont fixes par jour (tableau dans `rules.mjs`) :
  - jauge +8 (moral, énergie, satiété ou hygiène) ou 1 à 2 bulletins, en alternance ;
  - le 24 : 3 bulletins et toutes les jauges +5.

  Les bulletins passent par la fonction existante (plafond 9999). Jamais de FM.
- Une ligne dans le journal du joueur, qui n'apparaît pas dans le fil public.
- À l'écran, la Buvette affiche en tête, pendant le thème, une rangée « 🎁 Calendrier de l'Avent ». Elle ouvre une
  feuille avec la grille de 24 cases dans un ordre mélangé fixe : case du jour qui brille, cases ouvertes ✓, cases
  oubliées grisées, la 24e en or. Après le 24, la feuille dit « Rendez-vous à la Saint-Sylvestre ».
- Le cadeau d'Halloween (`treat`) n'est pas proposé pendant ce thème.

## La Bataille de boules de neige

### Le jeu (module partagé `web/snowball.mjs`, sans DOM)

- Une partie dure 45 s. Le terrain est l'écran rond 466×466, avec 5 cachettes à l'avant de leur abri (3 au fond, 2
  devant) et des abris bas (talus, muret, banc). La tête et les épaules dépassent.
- `schedule(seed, camp)` : tout le tirage vient de la graine.
  - les apparitions : instant, cachette, durée de 1 350 ms à 750 ms au fil de la partie ;
  - qui apparaît : un élu de l'autre camp, ou un passant avec une chance de 12 % ;
  - qui lance : de 30 % à 55 % des élus, à 45 % de leur temps visible ;
  - le point visé par chaque boule adverse ;
  - deux passages du traîneau, à 14 s et à 33 s.

  Dans la maquette, le point visé vient de `Math.random` : il doit venir de la graine.
- `play(schedule, taps)` : les touches sont `[{t, x, y}]`, avec t en ms depuis le début et x, y en coordonnées
  466. La fonction rejoue tout, de façon déterministe, et rend `{score, hits, thrown, parries, passHits, taken, best}`.
  - Une touche sur une boule qui arrive (rayon + 16 px) la pare : +1, sans dépenser de munition.
  - Sinon, c'est un lancer, s'il reste une boule. On en a 5, et une se recharge toutes les 500 ms.
  - Un lancer atterrit après 280 ms + 0,25 ms par pixel parcouru. Il touche ce qui se trouve au point d'arrivée à cet
    instant : le traîneau (+15), un élu visible au moins à 55 % (3 points au fond, 2 devant, multipliés par la
    série : ×1,5 dès 5 touches d'affilée, ×2 dès 10, ×3 dès 15), un passant (−5, et la série retombe à zéro), ou rien
    (la série retombe à zéro).
  - Une boule adverse non parée au bout de 1 000 ms remet la série à zéro et couvre l'écran de neige pendant 1,1 s,
    sans effet sur le score.
- Le navigateur affiche ce même module en direct, et le serveur le rejoue. Les deux doivent donner le même score.

### Ce que vérifie le serveur

- `snowStart` passe par `activityBlock` et `spendActivity`, comme `manifStart`. Le jeu n'est proposé que pendant le
  thème. La partie (`k: "snowball"`, graine, identifiant) va dans `S.mini`.
- `miniEnd` pour `snowball` attend `{id, taps}`, jamais un score :
  - au plus 400 touches, triées par temps, dans [0, 45 000] ms ;
  - durée réelle d'au moins 3 s, et l'expiration habituelle (45 s plus la marge de `MINI_RULES`) ;
  - le score est recalculé par `play()`. Un score envoyé par le navigateur est ignoré.
- Des signaux pour la détection de bots, comme pour la Manif :
  - des touches trop rapides (moins de 80 ms d'écart en moyenne) ;
  - une précision anormale (plus de 95 % sur plus de 40 lancers) ;
  - un temps de réaction moyen sous 180 ms.

  Le score reste compté, mais `recordMini` reçoit ces signaux.
- Les gains, réglés comme la Manif dans `MINI.snowball` :
  - 35 XP au départ ;
  - un bonus de `min(35, floor(score × 0,4))` à la fin ;
  - **seulement si le score atteint au moins 10.** Une partie sous 10 points ne rapporte que les 35 XP du départ.
  - Le plafond quotidien d'activités reste celui de toutes les activités. Le « 3 parties payées par jour » de la
    maquette est remplacé par ce plafond commun.
- Le multiplicateur d'XP des événements de la console (`fx.xp`) s'applique, si l'organisateur ajoute « Bataille de
  neige » à `EVENT_GAMES`.

### Le Front de neige

- Une table `snowfront(year, camp, points)`. Chaque partie validée ajoute son score recalculé au camp du joueur. Un
  défi compte comme une partie, pour chacun des deux joueurs.
- `/api/me` (et le flux SSE) expose `snowFront: {left, right}` pendant le thème. Le serveur le diffuse au plus une
  fois toutes les 10 s.
- La fin : **le Front s'arrête le 1er janvier à 0 h**, au moment du toast de minuit. Une tâche ferme alors l'année :
  - Le camp qui a le plus de points l'emporte. Seuls les joueurs de ce camp qui ont fait au moins une partie
    pendant le thème reçoivent 3 bulletins. En cas d'égalité, les deux camps les reçoivent, aux mêmes conditions.
  - Une ligne dans le fil public : « ❄️ Le Front de neige est tombé : la Gauche l'emporte (X contre Y). »
  - Une ligne dans le journal admin.
  - La tâche ne s'exécute qu'une fois par année (un réglage `snowfront_closed=<année>`).
- Le résultat s'affiche dans la scène et le bandeau de minuit (`newYear.front`), comme dans la maquette.
- La bataille reste jouable le 1er janvier pour l'XP et les défis. Ces parties-là ne comptent plus dans le Front, et
  le compteur affiche alors le résultat final.

### Les défis

- Une table `snow_challenges(id, seed, challenger, defender, c_score, d_score, status, created, expires)`.
- Lancer un défi : à la fin d'une partie validée, « Défier un joueur » ouvre la liste des joueurs actifs, des deux
  camps. Le défi reprend la graine et le score de cette partie.
  - Au plus 3 défis lancés par jour et 1 défi ouvert par adversaire.
  - On ne se défie pas soi-même. Un joueur suspendu ne peut pas être défié.
  - Le défié reçoit une notification push.
- Relever un défi : l'écran de la bataille montre une liste « Défis reçus ». Jouer un défi, c'est `snowStart` avec
  `challenge: id`, et la graine vient du défi. Une partie de défi compte dans les activités comme n'importe quelle
  partie.
- La fin d'un défi : le meilleur score prend +10 de moral, et une égalité donne +5 à chacun. Les deux joueurs sont
  notifiés.
  - Un défi qu'on n'a pas joué expire au bout de 24 h, sans effet.
  - Tous les défis ouverts s'annulent à la fin du thème.
- La console admin, page Duels, affiche une ligne « Défis de neige » en lecture seule, avec les signaux.
  L'annulation n'est pas prévue : il n'y a pas d'XP en jeu.

## Le toast de minuit (nouvel an)

- À 0 h le 1er janvier, le serveur envoie une notification à tous les joueurs abonnés (`notify`, avec le tag
  `newyear`) : « 🥂 Bonne année ! Toute la République trinque, gauche et droite réunies. Viens lever ton verre ! »
  Elle n'est envoyée qu'une fois par an, grâce à un réglage `newyear_sent=<année>`.
- **De 0 h à 0 h 05**, la scène de la maquette remplace la chambre, en boucle de 8 s :
  - le décor : Paris de nuit, la tour Eiffel qui scintille, une table, des élus des deux camps mélangés et celui du
    joueur au premier rang ;
  - 3, 2, 1, puis « Minuit ! » et le feu d'artifice, « Tchin ! » quand les coupes se rapprochent, et enfin
    « Bonne année 2027 ! » sous les confettis ;
  - une ligne de prénoms : jusqu'à 4 joueurs connectés à ce moment, au hasard et quel que soit leur camp, puis
    « … et N autres trinquent avec toi », où N compte les joueurs vus dans les 24 h.

  - le résultat du Front de neige, sous les vœux : « ❄️ Le Front de neige est tombé : … ».

  Le serveur fournit ces prénoms dans `/api/me` (`newYear: {names, others, front}`) entre 0 h et 0 h 05. Un joueur qui
  arrive à 0 h 03 voit les 2 minutes qui restent. Un bouton « ✕ » ferme la scène.
- **Du 1er janvier 0 h 05 au 2 janvier 0 h** : un bandeau doré en haut de l'écran principal,
  « 🥂 Minuit : toute la République a trinqué. », avec un bouton « Revoir » qui joue deux boucles, puis la chambre
  revient. Le bandeau disparaît le 2 janvier à 0 h, avec le thème.

## Les textes

- Le changelog 1.8.0 en `added`, sans spoiler : le thème, le calendrier, la bataille, les défis, le Front de neige
  et le toast de minuit.
- L'aide (`help.mjs`) : une entrée « La Trêve des confiseurs », qui n'est visible que pendant le thème, ou une phrase
  ajoutée à l'entrée des événements.
- La console admin :
  - « Noël » dans le choix de l'événement saisonnier ;
  - « Bataille de neige » dans les mini-jeux des événements Double XP ;
  - les défis de neige sur la page Duels.

## Les tests attendus

- `snowball.mjs` :
  - même graine, mêmes touches, même score ;
  - le score de chaque cas de touche : élu, passant, traîneau, parade, raté, plus de munitions, multiplicateur ;
  - l'ordre des touches n'a pas d'effet une fois triées ;
  - une liste de 400 touches est rejouée en moins de 50 ms.
- Les règles :
  - `eventAt` (bornes du 1er décembre, du 1er janvier et du 2 janvier, Halloween intact) ;
  - le calendrier (le jour, déjà ouvert, hors période, l'année suivante) ;
  - les costumes `NOEL`.
- Le serveur :
  - `snowStart` refusé hors du thème ;
  - un score envoyé est ignoré et recalculé ;
  - des touches invalides sont refusées ;
  - le Front de neige s'additionne, se ferme une seule fois à minuit, ne paie que ceux qui ont joué, et ne compte plus
    les parties du 1er janvier ;
  - les défis (plafond, expiration, gains de moral, annulation en fin de thème) ;
  - la notification de minuit n'est envoyée qu'une fois ;
  - `newYear` n'apparaît que dans sa fenêtre.
- Le navigateur : une vérification visuelle de chaque moment avec `POLITIGO_EVENT=noel` et une horloge simulée.

## Ce qui est laissé au développeur

- Le dessin exact des sprites, en suivant la maquette.
- Le texte définitif des répliques, des questions, des vœux et des lettres. Tout est satirique, sur des faits publics
  seulement, et équilibré entre les deux camps.
- Le découpage en commits, et le placement de la bataille dans le menu Jouer, avec une étiquette « Saison ».
