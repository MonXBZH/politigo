# Cumul des doublons de la Garde-robe — conception (1.10.0)

## Pourquoi

Retours joueurs (« gear fear ») : un doublon tiré devient des confettis, donc on n'ose pas céder une pièce à la Brocante,
et un légendaire tiré en double (2 % par ticket, ~45 % de doublon avec 5 légendaires sur 11) ne rapporte que 50 confettis,
qui n'achètent aucun légendaire. On veut : garder un 2e exemplaire pour l'échanger, et ne plus retirer un légendaire déjà eu.

## Objectifs

- Un doublon gagné se **cumule** : 2 exemplaires au plus par pièce. Le 3e devient des confettis (barème actuel).
- Par pièce, dans la Garde-robe : réglage « Doubles en confettis » (ne plus cumuler cette pièce).
- **Revendre** 1 exemplaire ou tous (contre confettis), quitte à ne plus avoir la pièce.
- Brocante : on peut **recevoir** une pièce qu'on a en 1 exemplaire (elle devient le 2e) ; refusé à 2.
- Un **légendaire** tiré (au hasard ou garanti) est d'abord un légendaire qu'on n'a pas, tant qu'il en reste.

## Non-objectifs

- Ultra rares et mythique : ni cumul, ni revente (hors Brocante, pièce unique ; un ultra en double reste 100 confettis).
- Cadeaux et vue garde-robe de la console admin (pas de « ×2 » côté admin), Bâton : inchangés (ils raisonnent toujours sur « possédé ou non »).
- Le bulletin de mamie et le marché de Levallois / bon plan de Cahuzac : conceptions séparées, plus tard.

## Anti-objectifs

- Casser une sauvegarde existante ou une annonce de la Brocante ouverte.
- Laisser revendre la dernière copie d'une pièce en vitrine (l'annonce deviendrait intenable).
- Un aller-retour rentable : revendre rapporte le barème des doublons (5/10/25/50), racheter coûte 100/200/300.

## Approches

1. **Listes à part (retenue par l'utilisateur).** `own` reste l'ensemble des pièces possédées (1 copie au moins).
   `dup` liste les pièces possédées en 2 exemplaires (sous-ensemble de `own`), `noStack` les pièces réglées sur
   « Doubles en confettis ». Tout ce qui demande « je l'ai ? » reste juste ; seuls les endroits qui comptent changent.
2. Un id présent deux fois dans `own` : tous les `includes`/`length`/dédoublonnages changent de sens en silence.
3. Un compteur par pièce à la place de `own` : réécrit une quinzaine d'endroits et migre toutes les sauvegardes.

## Ce qui est décidé

### Données (web/wardrobe.mjs)

- `freshWardrobe()` gagne `dup:[]` et `noStack:[]`.
- `sanitizeWardrobe` : `dup` = ids uniques, présents dans `own`, de rareté cumulable ; `noStack` = ids uniques d'objets
  existants de rareté cumulable. Anciennes sauvegardes : les deux vides, rien d'autre ne bouge.
- `STACK=["commun","rare","epique","legendaire"]` : les raretés qui se cumulent et se revendent.

### Gains

`gain(S,id)` : pas possédée → `own` ; possédée, rareté cumulable, pas dans `noStack`, pas dans `dup` → `dup`
(2e exemplaire, 0 confetti) ; sinon → confettis comme aujourd'hui. Le résultat dit lequel (`stacked`), le journal et
le toast le disent (« 2e exemplaire »).

### Légendaire nouveau d'abord

Dans `draw()`, la préférence « pièces non possédées » s'applique dès que la rareté tirée est `legendaire`, plus seulement
au garanti. L'étiquette « (un nouveau) » de la jauge reste vraie.

### Revente (action `sell {id, all}`)

- Refus : pièce non possédée, rareté non cumulable.
- 1 exemplaire (ou tous si `all`) : retire de `dup` d'abord, puis de `own` ; si la pièce quitte `own`, elle est ôtée de la
  tenue portée. Rapporte `CONFETTI[rareté]` par exemplaire, plafond 1e6. Ligne de journal.
- Serveur : refus si la revente retire la pièce de `own` alors qu'elle est dans une annonce ouverte **ou une offre en
  attente** de ce joueur (« Engagée à la Brocante : retire l'annonce ou l'offre d'abord. »). *(Choix de conception.)*
  Une même copie peut toujours appuyer plusieurs engagements, comme aujourd'hui : l'échange perdant échoue à
  l'acceptation avec le message existant. Pas de décompte des engagements par copie.

### Réglage (action `stack {id, on}`)

`on:false` ajoute l'id à `noStack`, `on:true` l'en retire. Ne concerne que les gains futurs : un 2e exemplaire déjà là reste.

### Brocante (web/market.mjs, server/server.mjs)

- `dupes(S,list)` = les pièces que S a déjà **en 2 exemplaires** (seules celles-là sont refusées à la réception).
- `applyTrade` : céder retire de `dup` si la pièce y est (on la garde), sinon de `own` (et de la tenue) ; recevoir met
  dans `dup` si déjà possédée, sinon dans `own`. La réception ignore `noStack` (l'échange est un choix explicite).
- Fermetures après un échange (server/marketstore.mjs, `doTrade`) *(choix de conception)* : `closeUsing(donneur, pièces)`
  ne vise que les pièces que le donneur **n'a plus du tout** ; `closeWanting(receveur, pièces)` ne vise que les pièces
  que le receveur a désormais **en 2 exemplaires**. Sinon des annonces encore valables disparaîtraient.
- Les messages « Déjà dans ta garde-robe » du client (app.js, marketui.mjs) suivent la même règle.

### Garde-robe (web/app.js)

- Une carte possédée en 2 exemplaires porte un badge « ×2 ».
- Un bouton de mode « Revendre », à côté de « Échanger des confettis », sur le même modèle. En mode revente, toucher une
  carte cumulable possédée ouvre sous la barre un petit panneau pour cette pièce :

```
┌ Chèque en bois · Rare · ×2 ─────────────────┐
│ [Revendre 1 · +10 🎊]  [Tout revendre · +20 🎊] │
│ ☐ Doubles en confettis (ne plus cumuler)       │
│ Tout revendre : tu ne l'auras plus.            │
└─────────────────────────────────────────────┘
```

  Revendre se confirme en deux touches (comme l'échange). La ligne d'avertissement n'apparaît que si la revente retire
  la pièce (et précise « tu ne la porteras plus » si elle est portée).
- La signature de la fiche (`sheetSig`) inclut `dup` et `noStack` pour redessiner la fiche.
- Le texte d'aide en bas : « Un doublon rejoint ta garde-robe en 2e exemplaire (à échanger à la Brocante), le 3e devient
  des confettis… »

### Boutique de confettis : les légendaires aussi

Demande de l'utilisateur, pour donner une raison de farmer. `EXCHANGE` gagne `legendaire` dans `rarities`, au prix de
**500 confettis** *(choix de conception : au rythme d'environ 9 confettis par tirage d'une collection complète, ~55 tirages,
un peu plus que la garantie de 50)*. Seulement un légendaire qu'on n'a pas, comme pour les autres raretés. En mode
échange, la carte d'un légendaire abordable montre son nom, comme les autres.

### Textes

Aide en jeu (Garde-robe / Tombola / Brocante), changelog 1.10.0 (ajouté : cumul, revente, réglage ; corrigé : un légendaire
tiré est d'abord un nouveau), README, docs. Aucun nom d'ultra ni le Bâton.

## Laissé au constructeur

- La forme exacte des actions dans `rules.mjs act` et la route serveur qui vérifie la vitrine.
- Le style du badge et du panneau (classes existantes de la fiche).
- Les tests : règles pures (gain, sell, stack, sanitize, applyTrade, légendaire nouveau d'abord) en tests client ;
  vitrine refusée et échange d'un double en tests serveur.
