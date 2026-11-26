# Brocante : choix plus clair, annonces validées, ultra rares (1.11.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les ultra rares s'échangent ; une annonce peut dire ce qu'elle cherche tout en exigeant la validation de son auteur ; la sélection d'objets montre les doubles, se filtre et se trie.

**Architecture:** Les règles pures (web/market.mjs, web/marketui.mjs) portent tout : exclusion, « déjà au complet », drapeau `want.check`, filtre/tri de la sélection. Le serveur refuse `take` sur une annonce `check`. app.js affiche (case au dépôt, mention sur la carte, filtres du sélecteur).

**Tech Stack:** Node 24, JS vanilla (ES modules), node:test, tests serveur via Docker.

**Spec:** `docs/superpowers/specs/2026-11-26-brocante-confort-design.md`

## Global Constraints

- Branche `dev` (`git checkout dev` avant tout commit). Ne pas pousser. Trailer : `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Version **1.11.0** (contenu joueur), entrée changelog datée 2026-11-26, à ajuster à la sortie.
- `MARKET.excluded=["mythique"]`. Le mythique reste hors Brocante.
- Aucun nom d'ultra ni le Bâton dans les textes (aide, changelog, README, docs) ; un ultra n'est jamais proposé par son nom dans le catalogue « Des objets précis » (comme les légendaires).
- Message unique « déjà au complet » : client `Déjà au complet : ${noms}`, serveur `Tu l'as déjà au complet : ${noms}.` (remplace « Déjà en 2 exemplaires » / « Tu l'as déjà en 2 exemplaires », qui serait faux pour un ultra).
- Textes joueurs en français. Pas d'argent réel, pas de FM. Jamais toucher politigo-web-1/api-1/admin-1 ni les ports 8080/8090/8091.

## Review Focus

- Recevoir un ultra déjà possédé (troc, offre acceptée, offre envoyée) : refusé, rien ne bouge → tests Task 1 (`applyTrade`) et Task 2 (serveur).
- Annonce `check` : `take` forgé à la main refusé, l'offre passe et son acceptation conclut l'échange → test Task 2.
- Vieille annonce stockée sans `check` : se troque comme avant → test Task 1 (`listingView`).
- `check` envoyé sur `kind:"offer"` ou avec une valeur non booléenne : ignoré/normalisé → test Task 1 (`cleanWant`).
- Filtres qui vident la sélection (ex. « Doubles seulement » sans double) : message « Aucun objet avec ces filtres. », les objets déjà choisis restent choisis → Task 3 (navigateur) et `pickView` testé Task 1.

---

### Task 1: Règles pures (ultra, « au complet », `check`, filtre de la sélection)

**Files:**
- Modify: `web/market.mjs` (l.4 `excluded`, l.20-30 `cleanWant`, l.53-54 `dupes`)
- Modify: `web/marketui.mjs` (`listingView` l.35-41, `takeWhy` l.42-53, `offerCheck` l.86-87, `catalogue` l.100-108, `wantText`, nouvelle `pickView`)
- Test: `tests/market.client.test.mjs`, `tests/market.test.mjs`, `tests/marketui.client.test.mjs`

**Interfaces:**
- Produces:
  - `MARKET.excluded=["mythique"]`
  - `dupes(S,list)` → ids de `list` que S ne peut plus recevoir : dans `wardrobe.dup`, **ou** possédés et de rareté hors `STACK` (importer `STACK` de wardrobe.mjs).
  - `cleanWant(x)` : pour `items`/`rarity`/`bulletins`, ajoute `check:true` seulement si `x.check===true` (sinon la clé est absente) ; `offer` inchangé (pas de `check`).
  - `listingView(l,S,block)` : `offerOnly = w.kind==="offer" || w.check===true` ; nouveau champ `checked:boolean` (= `w.check===true`).
  - `wantText(w)` : suffixe `" · l'auteur valide"` quand `w.check===true`.
  - `takeWhy`/`offerCheck` utilisent `dupes` (de market.mjs) et le message `Déjà au complet : ${noms}`.
  - `catalogue(S,exclude)` : n'inclut jamais `legendaire` ni `ultra` ; `ultra` n'apparaît dans aucune autre liste nommée.
  - `export function pickView(rows,{kind="all",rarity="all",dupOnly=false},S)` → les `rows` (forme de `pickable`) filtrées (`kind` : "all"|"outfit"|"object" sur `ITEMS[id].kind` ; `rarity` : "all" ou une rareté ; `dupOnly` : `copies(S,id)===2`) et triées par rareté décroissante (mythique, ultra, legendaire, epique, rare, commun) puis par nom (`localeCompare` "fr"). Chaque ligne gagne `n:copies(S,id)`.

- [ ] **Step 1: Écrire les tests qui échouent**
  - market.client.test : `MARKET.excluded` deep-equals `["mythique"]` ; `tradable` vrai pour un ultra, faux pour mythique/inconnu ; `cleanWant({kind:"rarity",rarity:"ultra",slot:"any",bulletins:0})` non nul ; `cleanWant({kind:"items",items:[c],bulletins:0,check:true}).check===true` ; `check:"oui"` → pas de clé `check` ; `cleanWant({kind:"offer",check:true})` deep-equals `{kind:"offer"}`. Remplacer les assertions existantes qui supposent l'ultra exclu (l.9, l.12, l.40, l.133).
  - market.test : `dupes(S,[u])` deep-equals `[u]` quand S possède l'ultra `u` (sans `dup`) ; `applyTrade` où B reçoit un ultra qu'il possède → throws, états inchangés ; un ultra cédé quitte `own` et `worn`.
  - marketui.client.test : annonce `want:{kind:"items",items:[x],bulletins:0,check:true}` → `offerOnly===true`, `takeOk===false`, `checked===true`, `forMe` ne la liste pas, `wantText` finit par « · l'auteur valide » ; même annonce sans `check` → `takeOk` comme avant. Messages l.71 et l.150 → `Déjà au complet : Club de golf`. `catalogue` : aucun ultra (par id) ni légendaire. `pickView` : tri (un ultra avant un commun, noms alphabétiques à rareté égale), `kind:"outfit"` ne garde que des tenues, `dupOnly` ne garde que les pièces de `dup`, `n` vaut 2 pour une pièce de `dup`.
- [ ] **Step 2: Lancer, vérifier l'échec** — `node --test tests/market.client.test.mjs tests/market.test.mjs tests/marketui.client.test.mjs` → FAIL sur les nouveaux cas.
- [ ] **Step 3: Implémenter** selon Interfaces. `app.js:2652` utilise déjà `dupes` : y remplacer seulement le texte par `Déjà au complet : …`.
- [ ] **Step 4: Lancer, vérifier le succès** — même commande + `node --test tests/*.client.test.mjs tests/wardrobe.test.mjs tests/rules*.test.mjs` → PASS.
- [ ] **Step 5: Commit**

```bash
git checkout dev
git add web/market.mjs web/marketui.mjs web/app.js tests/market.client.test.mjs tests/market.test.mjs tests/marketui.client.test.mjs
git commit -m "Brocante : ultra rares échangeables, annonces « l'auteur valide », sélection filtrable (règles)"
```

---

### Task 2: Serveur (`take` refusé sur une annonce `check`, messages)

**Files:**
- Modify: `server/server.mjs` ~l.1811 et l.1820 (messages), l.1841 (`take`)
- Test: `tests/market.server.test.mjs`

**Interfaces:**
- Consumes: `MK.cleanWant` (garde `check`), `MK.dupes` (ultra compris) — Task 1.

- [ ] **Step 1: Écrire les tests qui échouent** (helpers existants du fichier)
  - Annonce déposée avec `want:{kind:"items",items:[x],bulletins:0,check:true}` : le board la renvoie avec `want.check===true` ; `take` d'un joueur qui a `x` → 422 `Cette annonce attend des offres : fais une offre.`, rien ne bouge ; `offer` du même joueur → ok ; `accept` de l'auteur → échange conclu.
  - Ultra : `list` donnant un ultra (« camarade ») → ok (remplace l.168 qui attendait le refus) ; un joueur possédant déjà cet ultra : `take` et `offer` → 422 contenant « au complet », sans nom d'ultra dans l'erreur adressée à l'autre partie (« Échange impossible : objet déjà possédé. » reste).
  - Mythique : `list` le donnant → toujours 422 « Certains objets très rares ne s'échangent pas. ».
- [ ] **Step 2: Lancer, vérifier l'échec** — `bash tests/run-server.sh tests/market.server.test.mjs` → FAIL sur les nouveaux cas.
- [ ] **Step 3: Implémenter** — `take` : `if(l.want?.kind==="offer"||l.want?.check===true)` lève le 422 existant ; messages l.1811 et l.1820 → `Tu l'as déjà au complet : ${itemNames(d)}.`.
- [ ] **Step 4: Lancer, vérifier le succès** — `bash tests/run-server.sh tests/market.server.test.mjs tests/gacha.server.test.mjs` → PASS, puis `bash tests/run-server.sh` → PASS (relancer seuls les tests instables connus s'ils échouent sous charge).
- [ ] **Step 5: Commit**

```bash
git add server/server.mjs tests/market.server.test.mjs
git commit -m "Serveur : une annonce « l'auteur valide » ne se troque pas directement ; ultra déjà possédé refusé"
```

---

### Task 3: Interface et textes

**Files:**
- Modify: `web/app.js` (`mkWant` l.2436, `mkCard` l.2446-2460, `mkPicker` l.2517-2527 et ses appels l.2572, l.2595, `mkDeposit` l.2588-2631), `web/style.css` (filtres, badge ×2 de la sélection)
- Modify: `web/help.mjs` (section Brocante l.~81), `web/changelog.mjs` (entrée 1.11.0), `README.md` l.~196, `docs/DEPLOIEMENT.md` si la Brocante y décrit les exclusions
- Test: `tests/*.client.test.mjs` (cohérence aide/changelog), vérification en navigateur

**Interfaces:**
- Consumes: `pickView`, `listingView(...).checked`, `wantText`, `cleanWant` avec `check` (Task 1).

- [ ] **Step 1: Interface**
  - Dépôt étape 2 : pour les modes `items`, `rarity`, `bulletins`, une case « Je valide moi-même les échanges » (`f.check`, défaut décoché) et sa ligne d'explication « Les joueurs voient ce que tu cherches et t'envoient une offre ; rien ne part sans ton accord. » ; `want` envoyé avec `check:true` si cochée.
  - Carte (`mkWant`/`mkCard`) : si `v.checked`, une pastille « l'auteur valide » après ce qui est cherché ; pas de « Troquer » (déjà via `offerOnly`).
  - `mkPicker` : barre de filtres au-dessus de la grille, état dans le flux (`f.filt={kind,rarity,dupOnly}`) : boutons « Tout / Tenues / Objets » (`aria-pressed`), une `select` de rareté (« Toutes » + raretés présentes dans les lignes), case « Doubles seulement » ; grille = `pickView(rows,f.filt,S)` ; badge « ×2 » (classe `ward-x2` existante) sur les lignes `n===2` ; si vide : `Aucun objet avec ces filtres.` Les objets choisis restent choisis même masqués ; le compteur « Tu proposes · N / 3 » reste juste. Le sélecteur de candidats de « Troquer » (l.2543) garde la grille simple.
- [ ] **Step 2: Textes**
  - help.mjs Brocante : ajouter « Une annonce peut dire ce que tu cherches et attendre ton accord : on t'envoie alors une offre, tu acceptes ou refuses. » ; garder « Certains objets très rares ne s'échangent pas. » ; ajouter « Un objet ultra rare s'échange, mais on ne peut pas recevoir un ultra qu'on a déjà. ».
  - changelog 1.11.0 (`help:["brocante"]`) : `added` — annonces où l'auteur valide (retour joueur) ; filtres, tri et doubles visibles dans le choix des objets ; les ultra rares s'échangent à la Brocante. `changed`/`fixed` vides, `admin` vide.
  - README l.~196 : mentionner les ultra rares échangeables et l'option « l'auteur valide », sans nom d'ultra.
- [ ] **Step 3: Vérifier** — `node --check web/app.js` ; `node --test tests/*.client.test.mjs` → PASS. Navigateur (stack jetable 8280/8290/8291, jamais politigo-*-1) : dépôt avec la case → la carte vue par un autre joueur n'a que « Faire une offre » ; filtres Tenues + Doubles seulement ; largeur 360 px sans débordement.
- [ ] **Step 4: Commit**

```bash
git add web/app.js web/style.css web/help.mjs web/changelog.mjs README.md docs
git commit -m "Brocante : case « je valide », filtres et ×2 dans la sélection ; aide, changelog 1.11.0"
```
