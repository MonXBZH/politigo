# La Trêve des confiseurs : plan d'implémentation

> **Pour les agents :** sous-compétence REQUISE : superpowers:subagent-driven-development (recommandée) ou
> superpowers:executing-plans, tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**But :** le thème de fin d'année 1.8.0. Il comprend :
- les costumes de décembre ;
- le calendrier de l'Avent ;
- la Bataille de boules de neige, avec défis et Front de neige ;
- le toast de minuit du nouvel an.

**Architecture :** le thème est un nouveau mode de saison `"noel"` à côté d'Halloween (`rules.mjs`). La bataille est un
module pur, `web/snowball.mjs`, partagé par le navigateur, qui affiche la partie, et par le serveur, qui la rejoue à
partir des touches. Le Front de neige et les défis sont deux modules serveur, chacun avec ses tables SQLite. Ils se
testent directement, comme `admin/backups.mjs`.

**Pile technique :** Node 24 (`node:sqlite`, `node:test`), sans dépendance. Navigateur en modules ES et Canvas 2D.

**Spécification :** `docs/superpowers/specs/2026-11-14-treve-des-confiseurs-design.md`. La maquette, locale, est dans
`maquette/noel.html` + `maquette/noel.js` : on y reprend dessins et textes.

## Contraintes globales

- Le thème s'active **du 1er décembre 0 h au 1er janvier 23 h 59, heure du serveur** (`R.timeZone()`), et se force
  avec `POLITIGO_EVENT=noel` ou depuis la console.
- **Jamais d'argent réel, jamais de FM** gagnés par le calendrier, la bataille ou le Front.
- Les costumes gardent les mêmes clés, les mêmes prix, les mêmes effets.
- **Le score de la bataille est toujours recalculé par le serveur** (`play()`) : un `score` envoyé par le navigateur
  est ignoré.
- **Pas de spoiler** dans le README, le changelog ou l'aide : jamais le Bâton, jamais les ultra rares.
- Les textes sont en français. La satire porte sur des faits publics seulement, et elle est équilibrée entre les deux
  camps.
- Le changelog est mis à jour (version **1.8.0**, avec du contenu pour les joueurs), comme la documentation
  (`docs/DEPLOIEMENT.md`).
- Le travail se fait sur la branche `dev`. **On ne commite qu'à la demande de l'utilisateur.** Chaque tâche se
  termine fichiers prêts, tests verts, sans commit.
- Les tests se lancent ainsi :
  - client : `node --test tests/<fichier>.client.test.mjs` ;
  - serveur : `export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; bash tests/run-server.sh tests/<fichier>.test.mjs`.

  Les modules serveur s'importent dans les tests comme `adminlink.api.test.mjs` le fait : `await import(process.env.X||"/app/x.mjs")`.

## Points à surveiller en revue

1. **Une partie lancée à 23 h 59 le 31 et finie après minuit :** elle compte dans le Front, parce que c'est son
   heure de départ (`S.mini.t`) qui décide. Testé à la tâche 5.
2. **Des touches malformées** (pas un tableau, NaN, `t` négatif ou supérieur à 45 000, 401 touches ou plus, x ou y
   hors de [0, 466]) : un refus 422 propre, sans plantage, et la partie est consommée. Testé aux tâches 3 et 4.
3. **Un joueur supprimé ou suspendu avec des défis ouverts :** ses défis sont annulés et l'autre joueur ne reste pas
   bloqué. Testé à la tâche 6.
4. **Le thème coupé (console « off ») pendant une partie :** la partie en cours se termine et paie ses XP. Elle
   compte dans le Front si le thème était actif à son départ. Testé à la tâche 4.
5. **La case de l'Avent à 23 h 59 puis à 0 h 00 :** ce sont deux jours civils différents, au sens de `dayKey` du
   serveur. Testé à la tâche 2.

---

### Task 1: Le mode de saison « noel » et ses costumes

**Fichiers :**
- Modifier : `web/rules.mjs:183-240` (`EVENT_MODES`, `eventAt`, `HALLOWEEN`, `itemName`, `pongLine`) et `debateCount` (vers la ligne 712)
- Créer le test : `tests/noel.client.test.mjs`

**Interfaces :**
- Produit :
  - `EVENT_MODES=["auto","off","halloween","noel"]` ;
  - `eventAt(ms,mode)` renvoie `"noel"` quand `md>=1201||md===101` en mode auto, et toujours `"noel"` si `mode==="noel"` ;
  - l'objet `NOEL={shop,pong,questions,sleep,voeux,labels}`, où `labels={missions:{left,right},mail,goals,urn:{left,right}}` ;
  - `isNoel(event)=>event==="noel"` ;
  - `itemName`, `pongLine` et `debateCount` acceptent `"noel"`.
  Les textes du shop, de `sleep`, de `voeux` et des `labels` sont ceux du tableau de la maquette.
- Consomme : rien.

- [ ] **Étape 1 : écrire le test qui échoue.** Le test `the Trêve des confiseurs follows the server's calendar` :
  - `eventAt(Date.UTC(2026,10,30,22),"auto")===""` (le 30 novembre à 23 h, heure de Paris) ;
  - le 1er décembre à 0 h 00 de Paris donne `"noel"`, le 1er janvier à 23 h 59 aussi, le 2 janvier à 0 h 00 donne `""` ;
  - le 31 octobre donne toujours `"halloween"` ;
  - `eventAt(x,"noel")==="noel"` et `eventAt(x,"off")===""`.

  Le test `costumes: same keys, both camps, only the names change` :
  - `Object.keys(NOEL.shop)` égale les clés de `shop` ;
  - chaque entrée a `left` et `right` non vides ;
  - `itemName(shop[0],"left","noel")==="Pain d'épices de la coopé"` ;
  - `NOEL.pong.left.length>=10` ;
  - `debateCount("noel")===QUESTIONS.length+NOEL.questions.length`.

  Utiliser `setTimeZone("Europe/Paris")`.
- [ ] **Étape 2 :** lancer `node --test tests/noel.client.test.mjs`. Résultat attendu : ÉCHEC (`NOEL` n'est pas exporté).
- [ ] **Étape 3 :** implémenter dans `web/rules.mjs`. Le Débat en solo tire ses questions de `NOEL.questions`, de la même
  façon qu'il tire celles d'Halloween (`debateNew`, `count`).
- [ ] **Étape 4 :** relancer le test. Résultat attendu : SUCCÈS. Lancer aussi `node --test tests/*.client.test.mjs` : tout passe.

### Task 2: Le calendrier de l'Avent (règles)

**Fichiers :**
- Modifier : `web/rules.mjs` (`freshState`, `sanitize`, le `switch` de `actOn`, à côté de `case "treat"` vers la ligne 650)
- Test : `tests/noel.client.test.mjs`

**Interfaces :**
- Consomme : `isNoel` (tâche 1), et `dayKey`, `curIdx`, `clamp`, `logEntry`.
- Produit :
  - `ADVENT` : un tableau de 24 entrées `{k:"moral"|"energy"|"sat"|"hyg"|"bulletins",n}`, plus la 24e `{k:"all",n:5,bulletins:3}` ;
  - `adventBlock(S,event)` renvoie `""` ou la raison du refus ;
  - l'action `{type:"advent"}` renvoie `{ok,day,gift}` ;
  - l'état `S.advent={y:number,opened:number[]}`.

  Gains : alternance jauge +8 et 1 à 2 bulletins, avec cet ordre exact
  `[moral8, energy8, bulletins1, sat8, hyg8, bulletins2]` répété, puis le 24 : 3 bulletins et toutes les jauges +5.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `advent: today's box once, gauges or bulletins, never FM` : un état au 7 décembre à 10 h en mode `noel`. `act({type:"advent"})` donne `ok`. Le FM ne change pas. La jauge ou les bulletins de `ADVENT[6]` montent de la bonne valeur. Une seconde ouverture le même jour échoue, avec un message contenant « déjà ».
  - `advent: a missed day stays shut, the 24th pays the big box, nothing after` : `S.advent.opened` ne contient que les jours où l'on a ouvert. Le 24, on gagne +3 bulletins et toutes les jauges +5, plafonnées à 100. Le 25, l'action échoue (« Le calendrier est fini »). En `event=""`, elle échoue aussi (« pas de calendrier »).
  - `advent: 23:59 and 00:00 are two days; a new year starts empty` (point de revue 5) : ouvrir à 23 h 59, puis avancer l'horloge virtuelle à 0 h 00 : la nouvelle case s'ouvre. Un état de l'année précédente, `S.advent={y:2025,opened:[1..24]}`, s'ouvre le 1er décembre 2026.
  - `sanitize keeps a valid advent and drops a forged one` : des jours hors de [1, 24] sont retirés, ainsi qu'une année non entière.
- [ ] **Étape 2 :** lancer le test. Résultat attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter. Le jour civil est `dayKey(curIdx(S))%100`, et l'année `Math.floor(dayKey/10000)`. Les bulletins passent par l'aide existante (plafond 9999). Ajouter une ligne de journal `log(S,"advent",…)`, qui ne va pas dans le fil public.
- [ ] **Étape 4 :** relancer le test. Résultat attendu : SUCCÈS.

### Task 3: Le moteur de la bataille, `web/snowball.mjs`

**Fichiers :**
- Créer : `web/snowball.mjs` (pur, sans DOM)
- Créer le test : `tests/snowball.client.test.mjs`

**Interfaces :**
- Produit :
  - `SNOW={ms:45000,ammo:5,reload:500,fly:280,flyPerPx:0.25,incoming:1000,splat:1100,maxTaps:400,parryPad:16,far:3,near:2,sleigh:15,passant:-5,passChance:0.12}` ;
  - `SPOTS`, comme dans la maquette (`{x,base,k,far,cover}`), et `COVER=26` ;
  - `schedule(seed:number, camp:"left"|"right")`, qui renvoie `{pops:[{t,spot,stay,passant:0|1|null,foe:number,throws:boolean,throwAt,aim:{x,y}}], sleighs:[{t:14000,dir:1},{t:33000,dir:-1}]}`. Les champs `foe` et `passant` sont des index : le dessin choisit le sprite. Tout vient de `rng(seed)`, y compris `aim`.
  - `validTaps(taps)`, qui renvoie `true` seulement pour un tableau d'au plus 400 éléments `{t,x,y}`, aux nombres finis, avec `0<=t<=45000` et `0<=x,y<=466` ;
  - `play(sched, taps)`, qui renvoie `{score,hits,thrown,parries,passHits,taken,best,events}`. Les `events` sont
    `[{t,kind:"hit"|"pass"|"sleigh"|"miss"|"parry"|"taken"|"empty",pts,x,y}]` : le navigateur les dessine.
  - `mult(combo)`, qui renvoie 3 dès 15 touches d'affilée, 2 dès 10, 1,5 dès 5, sinon 1.
  - Les règles du jeu sont dans la spécification (section « Le jeu »). Les touches sont triées par `t` avant d'être rejouées.
  - `visible(pop,t)` : 0 à 1 (une montée de 140 ms, la durée `stay`, une descente de 140 ms).
- Consomme : rien. La fonction `rng` de `maquette/duel.js`, la mulberry32, est recopiée ici.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `the same seed gives the same fight; another seed another one` : `deepEqual(schedule(42,"left"),schedule(42,"left"))`, `notDeepEqual` avec la graine 43, et chaque `pop.t` est dans [900, 44 100].
  - `a tap on a visible foe scores by depth and the streak multiplies` : à partir d'un `sched` construit à la main (un seul élu au fond, visible de 1 000 à 3 000 ms), une touche à `t=1200` en son centre, plus le temps de vol, donne `score===3`. Cinq élus touchés d'affilée donnent `3+3+3+3+Math.round(3*1.5)`.
  - `passers-by cost 5 and break the streak; the sleigh pays 15; a miss breaks the streak` : sur des `sched` construits à la main, le score ne descend jamais sous 0.
  - `an incoming ball tapped is parried without ammo; untapped it lands and resets the streak` : `parries===1`, et les munitions sont intactes après la parade. Une balle non parée donne `taken===1` et `best` reste inchangé.
  - `five balls then a 500 ms reload` : 7 touches à `t=1000..1006` sur le vide donnent `thrown===5` et deux événements `"empty"`.
  - `validTaps refuses what a browser never sends` (point de revue 2) : `[]` donne true. Donnent false : `null`, `{}`, 401 touches, `{t:NaN}`, `{t:-1}`, `{t:45001}`, `{x:500}`, `{y:-3}`, une chaîne.
  - `the order of the taps does not matter, and 400 taps replay in under 50 ms` : un tableau mélangé donne le même résultat, et `performance.now()` mesure le temps.
- [ ] **Étape 2 :** `node --test tests/snowball.client.test.mjs`. Résultat attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter. Une touche sur une balle adverse se teste avant un lancer. La position d'une balle
  adverse au temps t se calcule par interpolation linéaire entre le point de lancer (la tête de l'élu, à 70 % de sa
  hauteur) et `aim`, avec un rayon de `4+26*k`. Un lancer atterrit à `t+fly+flyPerPx*distance`, depuis `(C+42,420)`.
  Les atterrissages et les arrivées sont traités dans l'ordre du temps (une file triée).
- [ ] **Étape 4 :** relancer le test. Résultat attendu : SUCCÈS.

### Task 4: La bataille dans les règles (départ et fin rejouée)

**Fichiers :**
- Modifier : `web/rules.mjs` (`MINI`, `act`, `case "manifStart"`, `case "miniEnd"`, vers les lignes 260 et 575-600)
- Test : `tests/snowball.client.test.mjs`

**Interfaces :**
- Consomme :
  - `schedule`, `play`, `validTaps` (tâche 3) ;
  - `isNoel` (tâche 1) ;
  - les fonctions existantes `activityBlock`, `spendActivity`, `registerVisit`, `newSeed`, `gameId`, `addXp`, `ACT.progress`.
- Produit :
  - `MINI.snowball={label:"Bataille de boules de neige",camp:null,xp:35,ms:45000,intro:0,minScore:10,bonusRate:0.4,bonusCap:35,great:80}` ;
  - l'action `{type:"snowStart",challenge?:{id,seed}}`, qui renvoie `{ok,game:{k:"snowball",id,seed}}` et enregistre `S.mini={k:"snowball",t,seed,id,noel:true|false,ch?:id}` ;
  - `miniEnd` pour `snowball` attend `{id,taps}` et renvoie `{ok,bonus,result}`. `result` est la sortie de `play` sans les `events`. L'objet caché `audit` contient `{game,score,flags,noel,ch,start,seed}` (`start` = `S.mini.t`).
  - les signaux : `"taps_rapides"` (écart moyen sous 80 ms et plus de 20 touches), `"precision"` (plus de 95 % sur plus de 40 lancers), `"reflexe"` (réaction moyenne sous 180 ms entre l'apparition et la touche qui atteint l'élu).

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `snowStart only during the Trêve, as an activity` : hors du thème, l'action échoue (« seulement pendant la Trêve »). Pendant le thème, elle réussit, `S.mini.k==="snowball"` et l'XP monte de 35.
  - `miniEnd replays the taps; a score sent is ignored` : `act({type:"miniEnd",id,taps:[],score:999})` donne `result.score===0` et `bonus===0`. Avec des touches calculées pour toucher 4 élus de `schedule(seed)`, le score est égal à `play(...)`, et l'audit contient `start` et `seed`.
  - `the bonus needs 10 points` : un score de 8 donne `bonus===0`. Un score de 40 donne `bonus===16`. Un score de 200 donne `bonus===35`.
  - `bad taps are refused and the game is consumed` (point de revue 2) : `taps:"x"` donne `ok:false`, puis `S.mini===null`.
  - `a game started during the Trêve still ends after it was switched off` (point de revue 4) : `snowStart` avec l'événement `noel`, puis `miniEnd` avec `event:""` donne `ok`, et `audit.noel===true`.
- [ ] **Étape 2 :** lancer le test. Résultat attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter. La durée minimale et l'expiration viennent de `judge()`, en lui passant `sc:result.score` après le rejeu : on garde son contrôle de durée et d'identifiant, et ses plafonds deviennent inutiles. Le texte du journal est « Bataille de boules de neige : N points, bonus +B XP. ».
- [ ] **Étape 4 :** relancer le test, puis `node --test tests/*.client.test.mjs`. Résultat attendu : SUCCÈS.

### Task 5: Le Front de neige et le toast de minuit (serveur)

**Fichiers :**
- Créer : `server/snowfront.mjs`
- Modifier : `server/server.mjs` (tables vers la ligne 135, `/api/action` vers la ligne 1460, `mePayload` ligne 607, une tâche `setInterval` à côté de la ligne 610)
- Créer le test : `tests/snowfront.test.mjs`

**Interfaces :**
- Consomme : `audit` de la tâche 4 (`{game:"snowball",score,noel,ch}`), `notify`, `feedLine`, la fonction serveur `audit`, `getSetting`/`setSetting`, `R.dayKey`.
- Produit, dans `server/snowfront.mjs` :
  - `createSnowFront(db)`, qui renvoie :
    - `add(year,camp,playerId,points)` : `INSERT … ON CONFLICT` dans `snowfront(year,camp,points)`, et note le joueur dans `snowfront_players(year,player_id)` ;
    - `totals(year)`, qui renvoie `{left,right}` ;
    - `close(year)`, qui renvoie `{winner:"left"|"right"|"tie",left,right,paid:number[]}` (les identifiants des joueurs du ou des camps vainqueurs présents dans `snowfront_players`). Les camps des joueurs sont lus par une fonction `campOf(id)` passée en option.
  - `frontYear(ms)` : l'année du réveillon en cours. On compte de décembre jusqu'au 1er janvier, si bien que `frontYear(1er janv. 2027)===2026`.
  - `newYearWindow(ms)` : `{on:boolean,banner:boolean}`. `on` vaut true le 1er janvier de 0 h 00 à 0 h 05 ; `banner` vaut true de 0 h 05 au 2 janvier 0 h.
- Côté serveur :
  - une partie `snowball` validée appelle `front.add(frontYear(audit.start),camp,id,score)`, seulement si `audit.noel` est vrai **et** si son départ est antérieur au 1er janvier 0 h (point de revue 1) ;
  - à partir du 1er janvier 0 h, une seule fois par année (réglages `newyear_sent=<an>` et `snowfront_closed=<an>`), le serveur :
    - envoie à tous `notify(id,{title:"PolitiGo",body:"🥂 Bonne année ! Toute la République trinque, gauche et droite réunies. Viens lever ton verre !",tag:"newyear",url:"/"})` ;
    - ferme le Front ;
    - donne +3 bulletins aux identifiants de `paid` (par `update`) ;
    - publie une ligne dans le fil, « ❄️ Le Front de neige est tombé : la Gauche l'emporte (X contre Y). », ou « égalité » ;
    - inscrit une ligne dans le journal admin, « noel-front ».
  - `mePayload` gagne :
    - `snowFront:{left,right,closed}` pendant le thème ;
    - `newYear:{names:string[≤4],others:number,front:{winner,left,right}|null,until:number}` quand `newYearWindow(now).on` ;
    - `newYearBanner:true` quand `banner` est vrai.

    Les `names` sont choisis au hasard parmi `onlineIds()`, sans le joueur lui-même, et `others` compte les joueurs vus dans les 24 h.
  - pour les tests : la variable `POLITIGO_NEWYEAR_AT=<ms>` remplace le 1er janvier 0 h. Le serveur la refuse au démarrage, avec un message d'erreur, si `POLITIGO_VERSION` n'est pas « dev ».

- [ ] **Étape 1 : écrire les tests qui échouent** (module seul, base temporaire `node:sqlite`).
  - `points add up per camp and year` : `add(2026,"left",1,10)` deux fois, et `add(2026,"right",2,7)`, donnent `totals(2026)` égal à `{left:20,right:7}`. `totals(2027)` donne `{left:0,right:0}`.
  - `closing pays only those of the winning camp who played, once` : les joueurs 1 et 3 de gauche ont joué, le 2 de droite aussi, le 4 de gauche n'a pas joué. On attend `close(2026).paid` égal à `[1,3]`, puis un second `close` qui donne `paid` égal à `[]`. En cas d'égalité, `paid` contient les deux camps.
  - `frontYear and the midnight window` : `frontYear` du 31 décembre 2026 à 23 h 59 donne 2026, comme celle du 1er janvier 2027 à 0 h 03. `newYearWindow` du 1er janvier à 0 h 04 donne `{on:true}`, à 0 h 06 `{on:false,banner:true}`, et le 2 janvier à 0 h 00 `{banner:false}`.
  - Intégration (le serveur démarre avec `POLITIGO_EVENT=noel`) : `snowStart` puis `miniEnd` avec des touches gagnantes fait monter `me.snowFront` du score recalculé. Un `score:999` envoyé ne change rien.
- [ ] **Étape 2 :** `bash tests/run-server.sh tests/snowfront.test.mjs`. Résultat attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter. La tâche de minuit vérifie l'heure toutes les 10 s, avec `.unref()`.
- [ ] **Étape 4 :** relancer le test. Résultat attendu : SUCCÈS.

### Task 6: Les défis de neige (serveur)

**Fichiers :**
- Créer : `server/snowchallenges.mjs`
- Modifier : `server/server.mjs` (routes `/api/snow/challenge` en POST et `/api/snow/challenges` en GET, `snowStart` avec `challenge`, `removePlayer`, `suspend`, `chores`, la commande admin `snow-challenges`)
- Créer le test : `tests/snowchallenges.test.mjs`

**Interfaces :**
- Consomme : l'audit de la tâche 4 (`ch`, `score`, `seed` via `S.mini`), `notify`, la fonction serveur `update`.
- Produit, dans `server/snowchallenges.mjs` :
  - `createChallenges(db,{perDay=3,ttl=864e5})`, qui renvoie :
    - `open({challenger,defender,seed,score,now})`, qui renvoie `{id}`, ou lève `Error` avec l'un de ces messages en français : « Pas toi-même. », « Déjà un défi ouvert avec ce joueur. », « 3 défis par jour. » ;
    - `get(id)` ;
    - `forDefender(id,now)` et `forChallenger(id,now)` ;
    - `finish(id,defenderScore,now)`, qui renvoie `{winner:id|null,tie:boolean}` ;
    - `expire(now)`, qui renvoie la liste des identifiants expirés ;
    - `cancelOf(playerId)` et `cancelAll()`.
  - Les statuts sont `"open"`, `"done"`, `"expired"`, `"cancelled"`.
- Côté serveur :
  - POST `{to:name, gameId}` : seulement dans les 10 minutes qui suivent la partie validée `gameId` du lanceur, dont le serveur garde la graine et le score dans une `Map` en mémoire. Le défié est notifié : « ❄️ {nom} te défie aux boules de neige ({score} points). Tu as 24 h. ».
  - `snowStart` avec `challenge:id` : seulement pour le défié, un défi ouvert et non expiré. La graine vient du défi.
  - À la fin d'une partie de défi, `finish` donne +10 de moral au gagnant, ou +5 à chacun en cas d'égalité, et notifie les deux joueurs.
  - La tâche `chores` appelle `expire`. La fin du thème (le 2 janvier à 0 h, ou le thème coupé) appelle `cancelAll`. La suppression ou la suspension d'un joueur appelle `cancelOf`.
  - La commande admin `snow-challenges` renvoie la liste en lecture seule, avec les signaux de l'audit.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `open: never oneself, one open per pair, three a day` : chaque refus a son message.
  - `finish: the best score wins, a tie is a tie` ;
  - `expire after 24 h; cancelAll and cancelOf` (point de revue 3) : après `cancelOf(2)`, aucun défi ouvert ne touche le joueur 2.
  - Intégration : A joue, puis défie B. B voit le défi dans GET. B joue sur la même graine : le gagnant prend +10 de moral. Un défi lancé hors des 10 minutes est refusé (422). Si B est supprimé, le défi d'A est annulé.
- [ ] **Étape 2 :** lancer le test. Résultat attendu : ÉCHEC.
- [ ] **Étape 3 :** implémenter.
- [ ] **Étape 4 :** relancer le test, plus `tests/adminops.test.mjs`. Résultat attendu : SUCCÈS.

### Task 7: Le costume de l'écran principal (client)

**Fichiers :**
- Modifier : `web/app.js` (`hw`/`season` ligne 54, le décor vers les lignes 404-470, le libellé ligne 569, la bordure ligne 732, la Buvette ligne 1112, les titres des Missions, du Courrier et des Objectifs lignes 1323-1348, le message de bienvenue ligne 2036) et `web/style.css`
- Test : vérification visuelle

**Interfaces :**
- Consomme : `NOEL`, `isNoel`, `ADVENT`, `adventBlock` (tâches 1 et 2).
- Produit : `const noel=()=>R.isNoel(season())`, `drawNoelRoom(ctx,t,S)`, `noelCostume(c,t,camp,state)` (le bonnet et l'écharpe), et la feuille `advent`.

- [ ] **Étape 1 :** porter le dessin de la maquette (`garland`, `tree`, `sleigh`, `flag`, `hatAndScarf`) dans `app.js`, avec les moments de la spécification (le traîneau le 24 de 18 h à 6 h, les vœux le 31 de 20 h à minuit), au même endroit que le décor d'Halloween.
- [ ] **Étape 2 :** les renommages pendant le thème :
  - les titres « Tournée des marchés de Noël », « Lettres au Père Noël », « Bonnes résolutions » ;
  - les noms de la Tombola et de la Loterie (`NOEL.labels.urn`) ;
  - la phrase de sommeil.
- [ ] **Étape 3 :** dans la Buvette, la rangée « 🎁 Calendrier de l'Avent », qui ouvre une feuille : grille de 24 cases dans l'ordre `[13,2,21,7,18,10,5,24,15,1,11,20,8,17,3,22,12,6,19,4,23,9,16,14]`, avec les états du jour, ouvert, oublié et à venir. Elle envoie `{type:"advent"}` et affiche la réponse. Le cadeau d'Halloween est masqué pendant le thème.
- [ ] **Étape 4 :** le message de bienvenue une fois par an, avec la clé `politigo.noel.<année>`.
- [ ] **Étape 5 : vérification.** Lancer une stack jetable (ports 8180, 8190 et 8191, voir la mémoire du projet) avec `POLITIGO_EVENT=noel`. Avec chrome-devtools, contrôler :
  - la chambre de jour ;
  - la nuit, avec sa phrase ;
  - le calendrier : ouvrir la case du jour, puis une seconde fois (refus) ;
  - les noms de la Buvette ;
  - l'absence d'erreur dans la console.

  Le 24 au soir et le 31 se vérifient avec une horloge simulée dans le navigateur (`serverNow` décalé).

### Task 8: La bataille à l'écran (client)

**Fichiers :**
- Modifier : `web/minigames.mjs` (`createMini("snowball",…)`) et `web/app.js` (menu Jouer vers la ligne 1135, `startMini`, la fin de partie, la liste des défis)
- Test : vérification visuelle, et `node --test tests/*.client.test.mjs`

**Interfaces :**
- Consomme :
  - `schedule`, `play`, `SNOW`, `SPOTS`, `COVER`, `visible` (tâche 3) ;
  - l'action `snowStart` et `miniEnd` avec `{id,taps}` (tâche 4) ;
  - `me.snowFront` (tâche 5) ;
  - les routes de défi (tâche 6).
- Produit : `createMini("snowball",{p,camp,ctx,scale,now,seed})`, qui enregistre les touches (`{t,x,y}` en coordonnées 466) et les rend par `taps()`. Le score affiché vient de `play(schedule(seed,camp),taps)`, le même calcul que le serveur.

- [ ] **Étape 1 :** l'entrée « ❄️ Bataille de boules de neige » dans le menu Jouer, avec l'étiquette « Saison ». Elle n'apparaît que pendant le thème.
- [ ] **Étape 2 :** le rendu repris de la maquette : abris, décor, élus de l'autre camp avec bonnet, passants, traîneau, boules, munitions, moufle, neige sur l'écran. Les événements de `play()` servent aux textes flottants.
- [ ] **Étape 3 :** l'écran de fin :
  - le score renvoyé par le serveur ;
  - les touches, la précision, les parades, la meilleure série ;
  - les XP et le bonus ;
  - la barre du Front de neige (`me.snowFront`) ;
  - les boutons « Rejouer » et « Défier un joueur », qui ouvre la liste des joueurs actifs, des deux camps.
- [ ] **Étape 4 :** la liste « Défis reçus », dans la feuille de la bataille : le score à battre et le temps restant. « Relever » lance `snowStart` avec `challenge`.
- [ ] **Étape 5 : vérification** sur la stack jetable avec deux comptes :
  - le score affiché égale celui du serveur ;
  - un défi va de A à B, puis B gagne et prend son moral ;
  - aucune erreur dans la console.

### Task 9: Le toast de minuit (client)

**Fichiers :**
- Modifier : `web/app.js` (la scène, le bandeau de l'écran principal)
- Test : vérification visuelle

**Interfaces :**
- Consomme : `me.newYear` et `me.newYearBanner` (tâche 5), `noelCostume` (tâche 7).
- Produit : `drawCheers(ctx,T,{names,others,front,camp,look})`, la scène de la maquette (`cheers`), avec la ligne du Front de neige sous les vœux.

- [ ] **Étape 1 :** tant que `me.newYear` est présent, la scène remplace la chambre, en boucle de 8 s jusqu'à `until`. Un bouton « ✕ » la ferme pour la session.
- [ ] **Étape 2 :** le bandeau doré « 🥂 Minuit : toute la République a trinqué. » avec le bouton « Revoir », qui joue deux boucles, soit 16 s.
- [ ] **Étape 3 : vérification** sur la stack jetable, avec `POLITIGO_NEWYEAR_AT` fixé à une minute plus tard (tâche 5). Contrôler la notification, la scène pendant 5 minutes, le bouton ✕, puis le bandeau et « Revoir ».

### Task 10: La console admin, les textes et la documentation

**Fichiers :**
- Modifier :
  - `admin/ui/admin.js:41` (`EVENT`, avec `noel:"Noël"`) et la ligne 859 (le choix du mode et son libellé automatique : « Halloween les 31 oct. et 1er nov., Noël du 1er déc. au 1er janv. ») ;
  - la page Duels : une carte « Défis de neige » en lecture seule ;
  - `admin/server.mjs` : `CMDS["snow-challenges"]=[]` et `NEEDS["snow-challenges"]=["p:duels"]` ;
  - `web/events.mjs:5` : ajouter `["snowball","Bataille de neige"]` à `EVENT_GAMES`. `fx.xp.snowball` s'applique dans `snowStart`.
  - `web/help.mjs` : l'entrée « La Trêve des confiseurs » ;
  - `web/changelog.mjs` : une entrée 1.8.0 en `added`, sans spoiler ;
  - `docs/DEPLOIEMENT.md` : `POLITIGO_EVENT=noel`, et la variable de test de la tâche 9.
- Tests : `tests/adminui.test.mjs`, `tests/changelog.test.mjs`, `tests/news.test.mjs`

- [ ] **Étape 1 :** écrire le test `the console offers Noël and lists snow challenges for a moderator with the Duels panel`, puis lancer `bash tests/run-server.sh tests/adminui.test.mjs`. Résultat attendu : ÉCHEC.
- [ ] **Étape 2 :** implémenter les fichiers ci-dessus.
- [ ] **Étape 3 :** lancer `bash tests/run-server.sh` en entier, plus `node --test tests/*.client.test.mjs`. Résultat attendu : tout passe.
- [ ] **Étape 4 :** vérifier qu'aucun texte ajouté ne mentionne le Bâton ni les ultra rares :
  `grep -n "Bâton\|ultra" web/changelog.mjs web/help.mjs` ne montre pas de ligne 1.8.0.
