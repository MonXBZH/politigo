# Cumul des doublons (1.10.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un doublon de la Garde-robe se cumule (2 exemplaires max), se revend, peut être réglé en confettis, s'échange à la Brocante ; un légendaire tiré est d'abord un nouveau ; la boutique vend les légendaires 500 confettis.

**Architecture:** `wardrobe.own` reste l'ensemble des pièces possédées ; deux listes nouvelles, `wardrobe.dup` (pièces en 2 exemplaires, ⊂ own) et `wardrobe.noStack` (pièces réglées « Doubles en confettis »). Les règles pures (web/wardrobe.mjs, web/market.mjs) portent tout ; le serveur ajoute la garde « engagée à la Brocante » et filtre les fermetures d'annonces ; app.js affiche.

**Tech Stack:** Node 24, JS vanilla (ES modules), node:test, tests serveur via Docker.

**Spec:** `docs/superpowers/specs/2026-11-23-cumul-doublons-design.md`

## Global Constraints

- Branche `dev` (`git checkout dev` avant tout commit). Jamais de push sur main. Trailer : `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Version **1.10.0** (contenu joueur = mineure) ; entrée changelog datée du jour, à ajuster à la sortie.
- `STACK=["commun","rare","epique","legendaire"]` : raretés qui se cumulent et se revendent. Ultra et mythique : ni cumul ni revente.
- 2 exemplaires au plus ; le 3e (ou tout doublon d'une pièce dans `noStack`) = `CONFETTI[rareté]` (5/10/25/50/100/100).
- Revente : `CONFETTI[rareté]` par exemplaire, plafond confettis 1e6.
- `EXCHANGE.cost.legendaire=500`, `EXCHANGE.rarities` inclut `legendaire`.
- Aucun nom d'ultra ni le Bâton dans les textes (aide, changelog, README, docs).
- Textes joueurs en français. Pas d'argent réel, pas de FM.

## Review Focus

- Une sauvegarde ancienne (sans `dup`/`noStack`) ou trafiquée (`dup` hors `own`, ultra dans `dup`) : chargée proprement → tests de sanitize (Task 1).
- Revendre la pièce **portée** jusqu'à la dernière : retirée de la tenue → test (Task 1).
- Échange d'une pièce dont le donneur a 2 copies : il garde la pièce **et la porte toujours** → test applyTrade (Task 2).
- Revendre la dernière copie d'une pièce en annonce ouverte **ou** offre en attente : refusé, rien ne bouge → test serveur (Task 3).
- Après un échange, l'annonce du donneur qui garde une copie reste ouverte ; celle du receveur qui demandait la pièce par son nom reste ouverte tant qu'il n'en a qu'une → test serveur (Task 3).

---

### Task 1: Règles de la Garde-robe (cumul, revente, réglage, légendaire nouveau, boutique)

**Files:**
- Modify: `web/wardrobe.mjs` (constantes l.161-165, `freshWardrobe`/`sanitizeWardrobe` l.172-184, `gain` l.210, `draw` l.230-236, `exchange` l.239-249)
- Modify: `web/rules.mjs:799-800` (dispatch `act`)
- Test: `tests/wardrobe.test.mjs`

**Interfaces:**
- Produces:
  - `export const STACK=["commun","rare","epique","legendaire"]`
  - `export const copies=(S,id)=>number` → 0, 1 ou 2
  - `freshWardrobe()` → `{...,dup:[],noStack:[]}`
  - `draw(...)` → résultat gagne `stacked:boolean` ; `dup` garde son sens « déjà possédée avant ce tirage » ; `confetti` = 0 si `stacked`.
  - `export function sell(S,id,all)` → `{ok:true,n,confetti,gone:boolean}` | `{ok:false,error}` (`gone` : la pièce a quitté `own`)
  - `export function setStack(S,id,on)` → `{ok:true}` | `{ok:false,error}`
  - actions `act` : `{type:"sell",id,all}` et `{type:"stack",id,on}`

- [ ] **Step 1: Écrire les tests qui échouent** (dans `tests/wardrobe.test.mjs`, helpers `game`/`play`/`seq` existants)

```js
test("1.10.0 : un doublon se cumule (2 au plus), le 3e et les réglés « confettis » donnent des confettis",()=>{
 const S=game();S.wardrobe.bulletins=5;const id=W.poolItems("left","commun")[0];S.wardrobe.own=[id];
 const a=play(S,{type:"draw",pay:"bulletin"},10,seq(0.99,0));
 assert.equal(a.item.id,id);assert.equal(a.dup,true);assert.equal(a.stacked,true);assert.equal(a.confetti,0);
 assert.deepEqual(S.wardrobe.dup,[id]);assert.equal(W.copies(S,id),2);
 const b=play(S,{type:"draw",pay:"bulletin"},10,seq(0.99,0));
 assert.equal(b.stacked,false);assert.equal(b.confetti,5);assert.equal(W.copies(S,id),2);
 const T=game();T.wardrobe.bulletins=5;T.wardrobe.own=[id];T.wardrobe.noStack=[id];
 const c=play(T,{type:"draw",pay:"bulletin"},10,seq(0.99,0));
 assert.equal(c.stacked,false);assert.equal(c.confetti,5);assert.deepEqual(T.wardrobe.dup,[]);
});
test("1.10.0 : un ultra en double reste 100 confettis, jamais cumulé",()=>{
 const S=game();S.wardrobe.bulletins=5;const u=W.poolItems("left","ultra")[0];S.wardrobe.own=[u];S.wardrobe.pity.ultra=79;
 const r=play(S,{type:"draw",pay:"bulletin"},10,never);
 assert.equal(r.item.id,u);assert.equal(r.stacked,false);assert.equal(r.confetti,100);assert.deepEqual(S.wardrobe.dup,[]);
});
test("1.10.0 : revendre un exemplaire, puis tout ; la pièce portée est ôtée quand la dernière part",()=>{
 const S=game();const id=W.poolItems("left","rare").find(i=>W.ITEMS[i].kind==="outfit");
 S.wardrobe.own=[id];S.wardrobe.dup=[id];S.wardrobe.worn.outfit=id;
 const one=play(S,{type:"sell",id,all:false});
 assert.deepEqual(one,{ok:true,n:1,confetti:10,gone:false});assert.equal(S.wardrobe.worn.outfit,id);assert.equal(W.copies(S,id),1);
 S.wardrobe.dup=[id];
 const all=play(S,{type:"sell",id,all:true});
 assert.deepEqual(all,{ok:true,n:2,confetti:20,gone:true});assert.equal(S.wardrobe.worn.outfit,null);assert.equal(W.copies(S,id),0);
 assert.equal(S.wardrobe.confetti,30);
 assert.equal(play(S,{type:"sell",id,all:false}).ok,false,"plus possédée");
 const U=game();const u=W.poolItems("left","ultra")[0];U.wardrobe.own=[u];
 assert.equal(play(U,{type:"sell",id:u,all:false}).ok,false,"un ultra ne se revend pas");
});
test("1.10.0 : le réglage « Doubles en confettis » s'active et se retire, sans toucher au 2e exemplaire",()=>{
 const S=game();const id=W.poolItems("left","epique")[0];S.wardrobe.own=[id];S.wardrobe.dup=[id];
 assert.ok(play(S,{type:"stack",id,on:false}).ok);assert.deepEqual(S.wardrobe.noStack,[id]);assert.deepEqual(S.wardrobe.dup,[id]);
 assert.ok(play(S,{type:"stack",id,on:true}).ok);assert.deepEqual(S.wardrobe.noStack,[]);
 assert.equal(play(S,{type:"stack",id:W.poolItems("left","ultra")[0],on:false}).ok,false);
});
test("1.10.0 : sanitize garde dup ⊂ own et cumulable, noStack cumulable ; une vieille sauvegarde a deux listes vides",()=>{
 const c=W.poolItems("left","commun")[0],r=W.poolItems("left","rare")[0],u=W.poolItems("left","ultra")[0];
 const o=W.sanitizeWardrobe({own:[c,u],dup:[c,c,r,u,"zz"],noStack:[r,u,r,"zz"]});
 assert.deepEqual(o.dup,[c]);assert.deepEqual(o.noStack,[r]);
 const old=W.sanitizeWardrobe({own:[c]});assert.deepEqual(old.dup,[]);assert.deepEqual(old.noStack,[]);
});
test("1.10.0 : la boutique vend un légendaire manquant 500 confettis",()=>{
 const S=game();const l=W.poolItems("left","legendaire")[0];S.wardrobe.confetti=499;
 assert.equal(play(S,{type:"exchange",id:l}).ok,false);
 S.wardrobe.confetti=500;assert.ok(play(S,{type:"exchange",id:l}).ok);assert.equal(S.wardrobe.confetti,0);assert.ok(S.wardrobe.own.includes(l));
});
```

  Et modifier le test existant (l.128-130) : un légendaire tiré au hasard prend maintenant un nouveau.

```js
 const N=game();N.wardrobe.bulletins=5;N.wardrobe.own=[legs[0]];
 const r=play(N,{type:"draw",pay:"bulletin"},10,seq(0.01,0));   // 1.10.0 : un légendaire de chance est aussi un nouveau
 assert.equal(r.item.id,legs[1]);assert.equal(r.dup,false);
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node --test tests/wardrobe.test.mjs`
Expected: FAIL sur les nouveaux tests (`W.copies` non défini, `stacked` absent, `sell`/`stack` inconnus).

- [ ] **Step 3: Implémenter dans `web/wardrobe.mjs` et `web/rules.mjs`**

  - `EXCHANGE={cost:{commun:100,rare:200,epique:300,legendaire:500},rarities:["commun","rare","epique","legendaire"]}`.
  - `freshWardrobe` : `dup:[]`, `noStack:[]`. `sanitizeWardrobe` : `dup` = ids uniques, dans `o.own`, rareté dans `STACK` ; `noStack` = ids uniques existants de rareté dans `STACK`.
  - `gain(S,id)` → `{dup,stacked,confetti}` : pas possédée → `own.push` ; possédée, cumulable, pas `noStack`, pas `dup` → `dup.push` ; sinon confettis.
  - `draw` : `fresh` s'applique dès que `r==="legendaire"` (pas seulement `forced`). Journal : `", 2e exemplaire dans la garde-robe"` quand `stacked`. `out.stacked=g.stacked`.
  - `sell(S,id,all)` : erreurs « Pas dans ta garde-robe. » / « Cette pièce ne se revend pas. » ; retire de `dup` puis de `own` ; ôte de `worn` si elle quitte `own` ; journal `Revente : ${n} × ${nom}, +${confetti} confettis.`.
  - `setStack(S,id,on)` : erreur « Ce réglage ne concerne pas cette pièce. » si rareté hors `STACK` ou id inconnu ; `on===false` ajoute (sans doublon), sinon retire. `on` doit être un booléen.
  - `rules.mjs` act : `case "sell":return WR.sell(S,a.id,a.all===true);` et `case "stack":return WR.setStack(S,a.id,a.on);`.

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `node --test tests/wardrobe.test.mjs tests/*.client.test.mjs`
Expected: PASS, aucun test existant cassé.

- [ ] **Step 5: Commit**

```bash
git checkout dev
git add web/wardrobe.mjs web/rules.mjs tests/wardrobe.test.mjs
git commit -m "Garde-robe : cumul des doublons, revente, réglage par pièce, légendaire nouveau d'abord, légendaires en boutique"
```

---

### Task 2: Règles de la Brocante (recevoir un 2e exemplaire, céder un double)

**Files:**
- Modify: `web/market.mjs:53` (`dupes`), `web/market.mjs:58-68` (`applyTrade`)
- Modify: `web/marketui.mjs:44,86` (avertissements « déjà possédé »), `web/app.js:2630` (même règle)
- Test: `tests/market.test.mjs`, `tests/marketui.client.test.mjs`

**Interfaces:**
- Consumes: `W.copies(S,id)` (Task 1), `S.wardrobe.dup`.
- Produces: `dupes(S,list)` = les ids de `list` que S a **en 2 exemplaires**.

- [ ] **Step 1: Écrire les tests qui échouent** (dans `tests/market.test.mjs`, avec ses helpers d'états)

```js
test("1.10.0 : on reçoit une pièce qu'on a en 1 exemplaire (2e copie), refusé à 2",()=>{
 // A donne x ; B a déjà x une fois
 // applyTrade → B.wardrobe.dup contient x, B.wardrobe.own contient x une seule fois
 // si B a x en dup : throws /déjà possédé/
});
test("1.10.0 : céder une pièce qu'on a en double la garde (et la tenue portée) ; céder la dernière l'ôte",()=>{
 // A a x en own+dup et la porte → après l'échange : own contient x, dup ne la contient plus, worn.outfit===x
 // A a y en own seulement et la porte → own ne la contient plus, worn.outfit===null
});
test("1.10.0 : dupes ne signale que les pièces à 2 exemplaires",()=>{
 // own=[a,b], dup=[b] → dupes(S,[a,b,c]) deep-equals [b]
});
```

  Le test marketui : une annonce donnant une pièce que le joueur a en 1 exemplaire n'affiche plus « Déjà dans ta garde-robe » ; à 2 exemplaires, si.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node --test tests/market.test.mjs tests/marketui.client.test.mjs`
Expected: FAIL (réception d'une pièce possédée refusée).

- [ ] **Step 3: Implémenter**

  - `dupes=(S,list)=>list.filter(i=>(S.wardrobe.dup??[]).includes(i))`.
  - `applyTrade` `move` : pour chaque pièce cédée, si dans `dup` → retirer de `dup` seulement ; sinon retirer de `own` et de `worn`. Pour chaque pièce reçue, si dans `own` → `dup.push`, sinon `own.push`. `noStack` ignoré.
  - marketui l.44/86 et app.js l.2630 : utiliser `MK.dupes`/`dup` au lieu de `own.includes`.

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `node --test tests/market.test.mjs tests/marketui.client.test.mjs tests/*.client.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/market.mjs web/marketui.mjs web/app.js tests/market.test.mjs tests/marketui.client.test.mjs
git commit -m "Brocante : recevoir un 2e exemplaire, céder un double sans perdre la pièce"
```

---

### Task 3: Serveur (garde « engagée », fermetures filtrées)

**Files:**
- Modify: `server/marketstore.mjs` (ajouter `pendingBy`)
- Modify: `server/server.mjs` ~l.2161 (route `/api/action`, avant `R.act` pour `type:"sell"`), ~l.1768 (`doTrade` : fermetures)
- Test: `tests/market.server.test.mjs`

**Interfaces:**
- Consumes: `W.copies` (Task 1), `MK.applyTrade` (Task 2).
- Produces: `M.pendingBy(playerId)` → offres en attente du joueur (`q.pendO`), même forme que `offersOn`.

- [ ] **Step 1: Écrire les tests qui échouent** (dans `tests/market.server.test.mjs`, helpers existants de joueurs/annonces)

  - `sell` de la dernière copie d'une pièce en annonce ouverte → 409/422, message contenant « Brocante », état inchangé (copies et confettis).
  - Idem avec la pièce dans une offre en attente.
  - Avec 2 copies dont une en annonce : `sell` d'un exemplaire → ok.
  - Échange où l'auteur cède x qu'il a en 2 copies, avec une 2e annonce ouverte donnant x : cette annonce reste `open`.
  - Échange où le receveur reçoit x (1re copie) et a une annonce demandant x par son nom : elle reste `open` ; s'il le reçoit en 2e copie : elle est fermée.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `bash tests/run-server.sh tests/market.server.test.mjs`
Expected: FAIL sur les nouveaux cas.

- [ ] **Step 3: Implémenter**

  - `pendingBy:playerId=>q.pendO.all(playerId).map(O)` dans marketstore.
  - Route action, `b.type==="sell"` : si la revente ferait quitter `own` (`b.all===true` ou `W.copies(p.state,b.id)===1`) et que l'id figure dans `M.openOf(p.id)` (give.items) ou `M.pendingBy(p.id)` (give.items) → `HttpError(409,"Engagée à la Brocante : retire l'annonce ou l'offre d'abord.")`.
  - `doTrade` : calculer les fermetures **après** `applyTrade` sur les états mis à jour (ou par anticipation sur les copies) : `closeUsing(donneur, pièces cédées qu'il n'a plus)`, `closeWanting(receveur, pièces reçues qu'il a maintenant en 2)`. Garder la transaction et les messages actuels.

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `bash tests/run-server.sh tests/market.server.test.mjs`
Expected: PASS. Puis toute la suite : `bash tests/run-server.sh` → PASS (relancer seuls les tests connus pour être instables sous charge s'ils échouent).

- [ ] **Step 5: Commit**

```bash
git add server/marketstore.mjs server/server.mjs tests/market.server.test.mjs
git commit -m "Serveur : pas de revente d'une pièce engagée à la Brocante, annonces fermées seulement quand la pièce part vraiment"
```

---

### Task 4: Interface de la Garde-robe et textes

**Files:**
- Modify: `web/app.js` (sheetSig l.1436 ; `exchangePrices` l.1767 ; `wardCard` l.1776-1806 ; `renderWardrobe` l.1808-1830 ; résultat du tirage l.1893-1904 ; textes l.1828, l.1938) et `web/style.css` (badge, panneau)
- Modify: `web/help.mjs` (Garde-robe, Tombola, Brocante), `web/changelog.mjs` (entrée 1.10.0), `README.md`, `docs/` concernés
- Test: `tests/*.client.test.mjs` existants (help/changelog), vérification en navigateur

**Interfaces:**
- Consumes: `W.copies`, `W.STACK`, actions `sell`/`stack`, résultat `stacked` (Task 1).

- [ ] **Step 1: Implémenter l'interface**

  - `sheetSig` : ajouter `S.wardrobe?.dup?.join()` et `S.wardrobe?.noStack?.join()`.
  - Carte : badge « ×2 » (classe `ward-x2`) quand `W.copies(S,id)===2` ; aria-label « , 2 exemplaires ».
  - Barre : bouton de mode « Revendre » / « Annuler la revente » (variable `wardSell`, exclusive avec `wardSwap`), désactivé si aucune pièce cumulable possédée.
  - En mode revente, toucher une carte cumulable possédée sélectionne la pièce (`wardPick`) et affiche sous la barre le panneau : titre `${nom} · ${rareté} · ×${copies}` ; boutons `Revendre 1 · +${c} 🎊` et (si 2) `Tout revendre · +${2c} 🎊`, chacun confirmé en deux touches (motif « Touche encore » existant) ; case à cocher « Doubles en confettis (ne plus cumuler) » → action `stack` ; ligne « Tu ne l'auras plus. » (+ « Tu ne la porteras plus. » si portée) quand la revente la fait partir. Les cartes non cumulables sont `aria-disabled` en mode revente. Toast après revente : `+${confetti} confettis : ${nom} revendu${n>1?" (2 exemplaires)":""}.`
  - `exchangePrices` : ajouter `500 pour une légendaire`.
  - Tirage : toast et encadré pour `stacked` → `${nom} : 2e exemplaire dans ta garde-robe (à échanger à la Brocante).`
  - Textes bas de Garde-robe et Tombola : « Un doublon rejoint ta garde-robe en 2e exemplaire (à échanger à la Brocante ou à revendre) ; au-delà, il devient des confettis : 5 pour un commun, jusqu'à 100 pour un ultra rare. »

- [ ] **Step 2: Textes**

  - help.mjs, section `tombola` : Garde-robe (cumul, ×2, Revendre, réglage, légendaires en boutique 500), Tombola (un légendaire tiré est d'abord un nouveau), Brocante (recevoir un 2e exemplaire, céder un double).
  - changelog.mjs : entrée `1.10.0` (date du jour), `help:["tombola","brocante"]` (la Garde-robe vit dans la section `tombola`), `added` : cumul + revente + réglage, légendaires en boutique ; `fixed` : un légendaire tiré au hasard est d'abord un nouveau ; `admin` : aucun.
  - README/docs : section Garde-robe à jour (sans nom d'ultra ni Bâton).

- [ ] **Step 3: Vérifier**

Run: `node --test tests/*.client.test.mjs tests/*.test.mjs`
Expected: PASS.
Puis navigateur (stack jetable 8280/8290/8291, jamais les conteneurs politigo-*-1) : un double affiche ×2 ; Revendre 1 puis Tout revendre ; réglage coché → le doublon suivant donne des confettis ; largeur 360 px sans débordement.

- [ ] **Step 4: Commit**

```bash
git add web/app.js web/style.css web/help.mjs web/changelog.mjs README.md docs
git commit -m "Garde-robe : badge ×2, mode Revendre et réglage par pièce ; aide, changelog 1.10.0 et docs"
```
