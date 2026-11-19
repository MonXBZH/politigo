# La Nuit du collage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A permanent multiplayer mini-game: a queue of 8×6 poster walls the two camps fight over, one brush stroke per poster, posters wearing out in 48 h, a nightly winner paid in bulletins, server-run volunteers for the outnumbered camp, a weekly title.

**Architecture:** Pure, shared rules in `web/wall.mjs` (promoted from the validated mockup's `maquette/collage-rules.mjs`), used by the server and the browser. A storage module `server/wallstore.mjs` (own SQLite tables, like `server/marketstore.mjs` / `server/snowfront.mjs`). `server/server.mjs` adds `GET/POST /api/wall`, an SSE `wall` event, and a wall tick (wear, volunteer waves, midnight close in one transaction, weekly title). The client gets `web/wallui.mjs` (posters, labels, gauge maths) and a `wall` sheet in `web/app.js`. An admin read-only card.

**Tech Stack:** Node 24 (`node:sqlite`), vanilla ES modules, canvas pixel art, `node --test`; server tests in Docker via `bash tests/run-server.sh`.

**Spec:** `docs/superpowers/specs/2026-11-19-nuit-du-collage-design.md` (validated); mockup `maquette/collage.html` + `collage.js` + `collage-rules.mjs` + `collage-rules.check.mjs` (validated, local only, never committed).

## Global Constraints

- Walls of 8 × 6 = 48 cells, at most 5 (240 cells), one flat array: wall `w` = cells `w*48 … w*48+47`. Next wall opens when the last is full; the last wall vanishes when entirely empty; wall 1 always exists.
- Quota 5 posters per player per Paris day; access from level 3 (knob `POLITIGO_WALL_MIN_LEVEL`); suspended players never paste. Night or nap does **not** block pasting (it is the « Nuit » du collage) — plan call.
- Brush: 3 s max, auto-stop = bâclé; stop < 250 ms = bâclé; zones half-widths parfait 0.06, bon 0.2 around 0.5; solidity parfait 3 / bon 2 / bâclé 1; XP parfait 14 / bon 10 / bâclé 5, multiplied by the « Double XP » event when it covers the new game key `wall`.
- Paste effect: empty → pose; own camp → refresh (age 0, solidity `max(current, got)`, last colleur = paster); enemy → −1, at 0 the cell flips to the paster with the solidity got. Every attempt uses one poster of the quota. One open attempt per player; an attempt never stopped expires and pastes nothing.
- Wear: nette < 24 h ≤ pâlie < 44 h ≤ déchirée < 48 h = freed. Wear never changes solidity.
- Night (Paris midnight): count all walls. Only a camp with ≥ 1 active human colleur that day can win; both pasted → most cells wins, tie with ≥ 1 cell → both win; one pasted → it wins with ≥ 1 cell; none → nobody, no feed line. 1 bulletin to each active human colleur of a winning camp. Only the last missed night is closed after downtime; older ones skipped and audited.
- Volunteers: `min(A − B, B)` for the minority (0 when B = 0), waves at 10, 13, 16, 19, 22 h Paris, one « bon » poster per volunteer per wave, late volunteers only get the remaining waves, targets: own threatened (≥ 40 h, then solidity 1) → retake cells lost < 24 h → first empty cell (first wall with one) → weakest enemy; ties by seeded draw. No XP, marked « bénévole », count for the camp.
- Weekly title (Monday 0 h – Sunday midnight Paris): count poses on empty + captures only; tie → earliest to reach the score; feed line; badge on the player's sheet the following week.
- No free text, no push notifications, no real money, no FM. French UI copy; compact existing code style; no new dependency.
- No spoilers in player-facing text (help, changelog, README): never the Bâton, never ultra rares.
- Version 1.9.0 (not yet released): add to the existing 1.9.0 changelog entry; update `web/changelog.mjs` with every visible change.
- Branch `collage-1.9.0` from `dev` in a worktree; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never commit `maquette/` or `.env`; never touch containers `politigo-web-1`, `politigo-api-1`, `politigo-admin-1` or host ports 8080/8090/8091; throwaway stacks only for QA.

## Review Focus

1. Two players paste on the same cell within the same second (one flips it, the other hits the new owner): both apply in order on the live cell, nothing lost or doubled, both see the final state. → Task 3 test `two pastes on the same cell apply in order`.
2. A crafted stop (`ms` larger than the server-measured elapsed + 1 s, negative, NaN, a second stop on the same attempt, a stop on another player's attempt): refused or bâclé, never parfait, never a second paste. → Task 3 test `forged stops never paste twice nor parfait`.
3. The server restarts at 23:59 and comes back at 00:30, or after two days down: exactly one night closed, bulletins paid once, no double feed line. → Task 4 test `missed midnights close once`.
4. A camp's last human colleur deletes their account during the day: they no longer count as active, volunteers recompute at the next wave, their posters stay (« ancien élu »). → Task 4 test `deleted colleur`.
5. A phone at 320 px wide with the wall sheet open while SSE updates arrive mid-brush: the gauge keeps running, the selected cell stays selected, the wall redraws without stealing focus. → Task 5 test `wall updates during a brush keep selection and focus`.

---

### Task 1: Shared rules (`web/wall.mjs`) and the event key

**Files:**
- Create: `web/wall.mjs` (from `maquette/collage-rules.mjs`, same exports and names), `tests/wall.client.test.mjs` (from `maquette/collage-rules.check.mjs`, as `node:test` tests)
- Modify: `web/events.mjs` (`EVENT_GAMES` gains `["wall","Nuit du collage"]`, `NO_FX.xp.wall:1`), `tests/run-server.sh` (mount `web/wall.mjs` like `market`), `server/Dockerfile` (copy `web/wall.mjs`)

**Interfaces:**
- Produces (exact names from the mockup module): `WALL_W, WALL_H, WALL_CELLS, MAX_WALLS, DAILY_QUOTA, HOUR, WEAR_H, BRUSH_MS, BRUSH_MIN_MS, ZONE, SOLIDITY, XP, QUALITY_LABEL, VOLUNTEER_QUALITY, WAVE_HOURS, THREAT_AGE_H, RETAKE_H, CAMPS, otherCamp, CAMP_NAME, hash32, rand01, brushMotion, brushPos, brushQuality(seed,ms)->"parfait"|"bon"|"bacle", brushTimeOk(ms,serverElapsedMs,toleranceMs=1000), ageH, wearStage(cell,now)->"nette"|"palie"|"dechiree"|null, liveCell, hoursLeft, freeExpired, wallCount, wallOf, emptyWalls, settleWalls(cells,now)->cells, firstOpenWall, wallScore, pasteEffect(cell,{camp,quality,by,now})->{cell,outcome:"posee"|"rafraichie"|"abimee"|"prise"}, applyPaste, isUseful, countWall, scoreNight(counts,active)->{winners:string[]}, nightLine, volunteerCounts(active)->{left,right}, planWave, pickVolunteerTarget, runVolunteers, weeklyScores, weeklyChampion, cellName, cellLabel`
- Cell shape: `{camp, by:playerId|null, name:string|null, vol:boolean, sol:1|2|3, at:ms, takenFrom?:camp, takenAt?:ms, motif:number}`; empty = `null`.
- Plus `wallBlock(S,{minLevel, used})->string` (« La Nuit du collage s'ouvre au niveau 3. », « Plus d'affiche aujourd'hui : reviens demain. ») — new.

- [ ] **Step 1:** Copy the mockup's checks into `tests/wall.client.test.mjs` as named tests (one per rule group: brush, paste effects, wear, wall queue, night scoring incl. the « ≥ 1 active colleur » rule and ties, volunteers count/budget/targets, weekly) plus `wallBlock` tests (level 2 refused with the exact copy, quota 5 used refused, level 3 with 4 used allowed) and an `EVENT_GAMES` test (`wall` listed, `NO_FX.xp.wall===1`).
- [ ] **Step 2:** Run `node --test tests/wall.client.test.mjs` — FAIL (module missing).
- [ ] **Step 3:** Create `web/wall.mjs` from `maquette/collage-rules.mjs` (keep it pure: no DOM, no clock, no `Math.random`), add `wallBlock`; edit `web/events.mjs`, `tests/run-server.sh`, `server/Dockerfile`.
- [ ] **Step 4:** Run `node --test tests/*.client.test.mjs` — all PASS.
- [ ] **Step 5:** Commit « Nuit du collage : règles partagées (web/wall.mjs) ».

### Task 2: Storage (`server/wallstore.mjs`)

**Files:**
- Create: `server/wallstore.mjs`, `tests/wallstore.test.mjs`
- Modify: `tests/run-server.sh`, `server/Dockerfile` (mount/copy like `marketstore.mjs`)

**Interfaces:**
- Consumes: Task 1 cell shape and rules.
- Produces: `createWall(db) -> {cells(now)->Cell[] (settled), paste(g, cell) (writes one cell), setCells(cells) (bulk, used by volunteers and settle), noteColleur(day, playerId, camp, useful:boolean, now), active(day)->{left:number,right:number}, colleurs(day, camp)->playerId[], volunteerUsed(day, camp)->number, addVolunteerUsed(day, camp, n), nightClosed(day)->boolean, closeNight(day, {left,right,winners,paid}), lastClosedDay()->number|null, week(weekKey)->[{playerId,useful,reachedAt}], setTitle(weekKey, playerId), title(now)->{playerId,weekKey}|null, removePlayer(playerId) (posters kept, by→null, name «ancien élu»; day/week rows deleted), history(limit)->nights[]}`
- Tables (all `CREATE TABLE IF NOT EXISTS`): `wall_cells(g INTEGER PRIMARY KEY, camp TEXT, by INTEGER, name TEXT, vol INTEGER, sol INTEGER, at INTEGER, taken_from TEXT, taken_at INTEGER, motif INTEGER)`, `wall_days(day INTEGER, player_id INTEGER, camp TEXT, pasted INTEGER, useful INTEGER, reached_at INTEGER, PRIMARY KEY(day,player_id))`, `wall_vol(day INTEGER, camp TEXT, used INTEGER, PRIMARY KEY(day,camp))`, `wall_nights(day INTEGER PRIMARY KEY, left_n INTEGER, right_n INTEGER, winners TEXT, paid INTEGER, at INTEGER)`, `wall_titles(week INTEGER PRIMARY KEY, player_id INTEGER)`.

- [ ] **Step 1:** Tests in `tests/wallstore.test.mjs` (in-memory DB): round-trip of a cell; `cells(now)` frees a 48 h poster and drops an emptied last wall; `active` counts distinct humans per camp; `noteColleur` twice keeps one row and sums; `closeNight` then `nightClosed` true and `lastClosedDay`; `week` orders by useful desc then `reachedAt` asc; `removePlayer` keeps the poster with `by=null`, `name:"ancien élu"`.
- [ ] **Step 2:** `bash tests/run-server.sh tests/wallstore.test.mjs` — FAIL.
- [ ] **Step 3:** Implement `createWall(db)`.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5:** Commit « Nuit du collage : stockage ».

### Task 3: Server API and live updates

**Files:**
- Modify: `server/server.mjs` (wire `createWall`, `GET /api/wall`, `POST /api/wall`, SSE `wall`, `mePayload.wallLeft`, journal lines, account deletion → `W.removePlayer`)
- Test: `tests/wall.server.test.mjs`

**Interfaces:**
- `GET /api/wall` → `{cells, walls:number, now, counts:{left,right}, active:{left,right}, volunteers:{left,right}, left:number (my posters left), attempt:null|{id,seed,g,t0}, title:{name,camp}|null, closesAt}` (auth required, like `/api/market`).
- `POST /api/wall {op:"start", g}` → `{id, seed, t0}` (422 with `wallBlock` copy; 409 « Un coup de pinceau est déjà en cours. » if one open; `g` integer 0…`wallCount*48−1`).
- `POST /api/wall {op:"stop", id, ms}` → `{quality, outcome, cell, xp, left, opened?:wallIndex}`; quality forced to `bacle` when `!brushTimeOk(ms, serverElapsed)` or `ms>=BRUSH_MS`; unknown/foreign/used id → 409 « Ce coup de pinceau n'est plus valable. ».
- Attempts live in memory (`Map playerId → {id, seed, g, t0}`), expire 10 s after `t0` without pasting.
- XP via `R.addXp(S, Math.round(XP[q]*fxOf(p).xp.wall))` and `R.logEntry(S,"wall", "Nuit du collage : affiche posée en mur 2, C4 (parfait, +14 XP).")` (outcome words: posée / rafraîchie / abîmée / prise).
- SSE `wall` coalesced every 3 s with `{cells, counts, walls}` to open screens; `mePayload` gains `wallLeft`.
- Knob `POLITIGO_WALL_MIN_LEVEL` (default 3), warned like the duel knobs.

- [ ] **Step 1:** Tests: level 2 refused with the copy; a pose, a refresh, an attack −1, a capture (XP and journal line each); quota 5 then 422; `two pastes on the same cell apply in order`; `forged stops never paste twice nor parfait` (ms = elapsed + 5000, −1, NaN, second stop, foreign id); an expired attempt pastes nothing and still used the quota; filling wall 1 opens wall 2 (`opened:1`); SSE `wall` arrives on another client; suspended player 403/422.
- [ ] **Step 2:** `bash tests/run-server.sh tests/wall.server.test.mjs` — FAIL.
- [ ] **Step 3:** Implement in `server/server.mjs`, following the `/api/market` route's structure.
- [ ] **Step 4:** Same command — PASS; then the full server suite.
- [ ] **Step 5:** Commit « Nuit du collage : API et direct ».

### Task 4: The wall tick: wear, volunteers, midnight, weekly title

**Files:**
- Modify: `server/server.mjs` (`wallTick(now)` in the 30 s sweep; `closeWallNight(day, now)` modelled on `closeFront`)
- Test: `tests/wall.server.test.mjs` (same file, new tests)

**Interfaces:**
- `wallTick(now)`: settle (free expired, drop/open walls) and broadcast on change; run the due volunteer wave once per (day, wave) — keyed in `settings` as `wall_wave` = `day:waveIndex`; close the night once per day — key `wall_night_closed` = day; close the week once — key `wall_week_closed` = weekKey.
- `closeWallNight(day, now)`: one transaction: `scoreNight`, +1 bulletin (clamped 9999) and journal line « 🖌️ Nuit du collage : ton camp a tenu le mur. +1 bulletin. » to each active human colleur of a winning camp, `W.closeNight`, setting; rollback restores states; then feed line via `nightLine` (« 🖌️ La Gauche a tenu le mur cette nuit (58 cases contre 41). », tie line, « … : la Droite n'a pas collé. ») and an audit line.
- Weekly: feed line « 🖌️ Colleur de la semaine : Inès (14 collages utiles). », `W.setTitle`; the player's public card (board row) gains `wallTitle:true` during the following week.
- Knob `POLITIGO_WALL_CLOSE_AT` (epoch ms, test only): forces one night close at that instant, like `POLITIGO_NEWYEAR_AT`.

- [ ] **Step 1:** Tests: night with both camps (bulletin only to the winning camp's colleurs of the day), tie, one camp only (wins with fewer cells), none (no feed line); `missed midnights close once`; `deleted colleur`; a volunteer wave pastes `min(A−B,B)` « bon » posters marked `vol`, no XP to anyone; weekly title and `wallTitle` on the board row.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the file, then the full server suite — PASS.
- [ ] **Step 5:** Commit « Nuit du collage : usure, bénévoles, nuit et semaine ».

### Task 5: The player screen

**Files:**
- Create: `web/wallui.mjs` (poster motifs and wear drawing from `maquette/collage.js`, `drawWall(c, cells, w, now, opts)`, `cellInfo(cell, now, me)->string[]`, `navLabel(cells, w, now)->"Mur 2 / 3 · G 26 · D 14"`, `gaugeX(seed, ms)`), `tests/wallui.client.test.mjs`
- Modify: `web/app.js` (sheet `wall`: header counts + countdown + quota, wall canvas, ◀ ▶ navigation, info panel, « Coller » + brush gauge, result card, SSE `wall` handling; entry tile in the « Jeux » sheet; badge on a player's card when `wallTitle`), `web/style.css`, `web/sw.js` if it lists modules

**Interfaces:**
- Consumes: Task 1 rules, Task 3 routes/payloads, Task 4 `wallTitle`.
- Behaviour as the validated mockup: opens on `firstOpenWall`; keyboard (arrows move the selection, Page Up/Down change wall, Enter pastes, Space stops); `aria-live` results; reduced motion keeps the brush; fluid from 320 px with no horizontal scroll; GET `/api/wall` only while the sheet is open.

- [ ] **Step 1:** Tests: `navLabel`, `cellInfo` (« Collée par Mathis il y a 5 h », « Bénévole », « Case libre », « ancien élu »), `gaugeX` matches `brushPos`, every motif × wear stage draws inside its cell (mock context), `wall updates during a brush keep selection and focus` (pure state reducer `wallState(prev, event)` keeps `sel` and `brush`).
- [ ] **Step 2:** `node --test tests/wallui.client.test.mjs` — FAIL.
- [ ] **Step 3:** Implement `web/wallui.mjs`, then the sheet in `web/app.js` and its CSS.
- [ ] **Step 4:** Client suite PASS; visual check at 390×844 and 1200×900 against the mockup (controller, Chrome DevTools, throwaway stack).
- [ ] **Step 5:** Commit « Nuit du collage : l'écran du joueur ».

### Task 6: Admin card

**Files:**
- Modify: `admin/server.mjs` (cmd `wall-list` under `p:duels`, no args), `server/server.mjs` (`cmd==="wall-list"` → `{nights: W.history(30), walls, counts, active, volunteers, title}`), `admin/ui/admin.js` (card « Nuit du collage » in the duels panel: last 30 nights table, today's actives and volunteers, current title), tests `tests/adminui.test.mjs`, `tests/server.extra.test.mjs` (key lists)

- [ ] **Step 1:** Tests: `wall-list` allowed for `p:duels`, refused otherwise; card renders a night row « 19/11 · Gauche 58 · Droite 41 · la Gauche · 7 payés ».
- [ ] **Step 2–4:** FAIL → implement → PASS (admin tests + full server suite).
- [ ] **Step 5:** Commit « Nuit du collage : carte de la console ».

### Task 7: Help, changelog, docs

**Files:**
- Modify: `web/help.mjs` (entry `collage` « La Nuit du collage »: walls and arrows, brush and solidity, wear 48 h, quota 5 from level 3, night rule incl. « il faut avoir collé dans la journée », 1 bulletin, volunteers and why, weekly title; `SHEET_HELP.wall="collage"`), `web/changelog.mjs` (1.9.0 `added` line + `help` gains `"collage"`; `admin` line for the card), `README.md` (feature list), `docs/DEPLOIEMENT.md` (knobs `POLITIGO_WALL_MIN_LEVEL`, `POLITIGO_WALL_CLOSE_AT` test only), tests touching help/changelog keys

- [ ] **Step 1:** Tests: help entry exists and mentions « 48 h » and « niveau 3 »; changelog 1.9.0 `help` includes `collage`; no « Bâton » / ultra names in the new copy.
- [ ] **Step 2–4:** FAIL → write → PASS (client + server suites).
- [ ] **Step 5:** Commit « Nuit du collage : aide, changelog et docs ».
