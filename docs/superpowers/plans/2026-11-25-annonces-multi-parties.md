# Annonces planifiées sur plusieurs parties Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dans la console d'admin, « Planifier » crée la même annonce planifiée sur toutes les parties cochées.

**Architecture:** Changement côté interface de la console seulement (admin/ui/admin.js) : des cases « Parties » sous la cible, puis un `schedule-add` par partie cochée via le `srvCall` existant. Les parties et le serveur de la console ne changent pas ; un test serveur verrouille le routage par partie et le refus 403 d'un modérateur hors de ses parties.

**Tech Stack:** JS vanilla (DOM via le helper `h`), node:test, tests console via Docker.

**Spec:** `docs/superpowers/specs/2026-11-25-annonces-multi-parties-design.md`

## Global Constraints

- Branche `dev` ; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; ne pas pousser.
- Version : entrée **1.10.1** existante de `web/changelog.mjs`, section `admin` (outil admin seul = patch).
- Textes en français. Jamais toucher politigo-web-1/api-1/admin-1 ni les ports 8080/8090/8091 ; ne jamais lire `.env`.

## Review Focus

- Cible « un joueur précis » : jamais envoyée à une autre partie que la courante.
- Modérateur limité à une partie : la liste ne propose que ses parties ; une requête forgée vers une autre partie est refusée (403).
- Échec partiel (une partie injoignable) : les autres planifications restent créées et le message nomme la partie en échec.

---

### Task 1: Cases « Parties » et envoi multi-parties

**Files:**
- Modify: `admin/ui/admin.js` (~l.575-610, panneau Annonces : formulaire « Planifier »)
- Modify: `web/changelog.mjs` (entrée 1.10.1, `admin`), `docs/DEPLOIEMENT.md` (section console / annonces, si elle décrit les planifications)
- Test: `tests/adminui.test.mjs` (deux parties réelles, déjà démarrées par le fichier)

**Interfaces:**
- Consumes: `servers` (liste des parties accessibles, `{id,name,up}`), `cur`, `srvCall(id,cmd,args)` (admin.js l.246), le motif des cases « Parties accessibles » (admin.js ~l.1052), `t2.get()` (cible : `{kind:"all"|"camp"|"player",...}`).

- [ ] **Step 1: Test serveur qui verrouille le comportement attendu** (dans `tests/adminui.test.mjs`, avec ses helpers)

  - `schedule-add` envoyé par la console à la partie 1 puis à la partie 2 (`/api/s/<id>/call`) : `schedule-list` de chaque partie contient une planification au même texte ; une planification créée sur la seule partie 1 n'apparaît pas dans la partie 2.
  - Un modérateur dont les parties ne contiennent que la partie 1 (créer via l'API mods existante, droits annonces) reçoit 403 pour `schedule-add` sur la partie 2, et rien n'y est créé.

- [ ] **Step 2: Lancer, vérifier** — `bash tests/run-server.sh tests/adminui.test.mjs` ; la partie routage peut déjà passer (verrou de non-régression), le cas modérateur doit passer aussi : noter le résultat dans le rapport.

- [ ] **Step 3: Interface dans `admin/ui/admin.js`**

  - Sous la cible, un bloc « Parties » de cases à cocher (une par partie de `servers`), affiché seulement si `servers.length>1` ; la partie `cur` cochée par défaut ; une partie `!up` décochée et `disabled`.
  - Masqué (et ignoré) quand la cible est un joueur précis : seule `cur`.
  - « Planifier » : valider le formulaire comme aujourd'hui, refuser si aucune partie cochée (« Coche au moins une partie. »), puis `for` séquentiel `await srvCall(id,"schedule-add",b)` en collectant les échecs ; ensuite rafraîchir le panneau.
  - Retour : tout réussi → toast « Annonce planifiée. » (1 partie) ou « Annonce planifiée sur N parties. » ; échecs → toast d'erreur `Échec sur ${nom} : ${message}` (une partie par segment, séparés par « ; »), précédé du nombre de réussites s'il y en a.

- [ ] **Step 4: Textes** — changelog 1.10.1 `admin` : « Une annonce planifiée se crée en une fois sur plusieurs parties : coche-les sous la cible. » ; DEPLOIEMENT.md si la section des annonces planifiées existe.

- [ ] **Step 5: Vérifier** — `node --check admin/ui/admin.js`, `node --test tests/*.client.test.mjs` (cohérence changelog), `bash tests/run-server.sh tests/adminui.test.mjs`.

- [ ] **Step 6: Commit**

```bash
git checkout dev
git add admin/ui/admin.js web/changelog.mjs docs/DEPLOIEMENT.md tests/adminui.test.mjs docs/superpowers
git commit -m "Console : une annonce planifiée se crée sur plusieurs parties en une fois"
```
