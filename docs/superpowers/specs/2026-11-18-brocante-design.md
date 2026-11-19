# La Brocante : échanges entre joueurs (conception)

Date : 18/11/2026. Statut : en validation (relu par un « constructeur », questions intégrées).

## Pourquoi

Créer une dynamique entre les joueurs et leur donner une raison de revenir dans le jeu. Aujourd'hui, la garde-robe
(tenues, objets, bulletins) se remplit seul, face à la Tombola / la Loterie. La Brocante en fait un sujet entre joueurs,
y compris entre les deux camps : c'est le seul endroit du jeu où gauche et droite ont intérêt à se parler.

**Réussite** : des annonces vivantes, des échanges entre camps visibles dans le fil, des joueurs qui reviennent voir les
nouvelles annonces et répondre aux offres.

## Objectifs

- Un tableau public d'annonces (« La Brocante ») visible par tous les joueurs.
- Chaque joueur choisit lui-même ce qu'il met en vitrine, depuis sa garde-robe.
- Échange immédiat quand on a ce que l'annonce demande ; sinon contre-offre que l'auteur accepte ou refuse.
- Échanges libres entre camps : l'objet reçu se porte (c'est déjà possible techniquement : `wear` ne vérifie pas le camp).
- Notifications et fil public pour faire revenir les joueurs.

## Non-objectifs

- Pas d'enchères, pas de cote, pas de prix « du marché ».
- Pas de troc direct depuis la fiche d'un joueur dans cette version (prévu ensuite, sur le même mécanisme d'échange).
- Pas de messagerie autour des annonces (le chat existe à part).
- Pas d'argent réel, jamais.

## Anti-objectifs (échec même si « ça marche »)

- Un tuyau de multi-compte : des comptes secondaires qui alimentent un compte principal en bulletins ou en objets.
- Un échange à moitié fait (l'un reçoit, l'autre perd) ou un objet dupliqué.
- Le Bâton (mythique) ou un objet ultra rare qui change de mains.
- Une brocante encombrée d'annonces mortes.

## Règles

### Ce qui s'échange

- Tenues et objets de la garde-robe, raretés commun, rare, épique, légendaire. **Exclus** : ultra rare et mythique
  (le Bâton). Les objets saisonniers (Halloween, Noël, s'il y en a dans le catalogue) suivent la même règle de rareté.
- **Objets d'événement** (chantier suivant, conçu à part) : des objets qu'on ne gagne pas aux tirages, seulement offerts
  depuis la console lors d'événements. Ils **s'échangent** à la Brocante comme les autres. La règle d'exclusion de la
  Brocante doit donc reposer sur une liste explicite (ultra rare, mythique) et non sur « fait partie des tirages ».
- Bulletins : seulement **en complément** d'un objet ou **comme prix** d'un objet, jamais seuls dans les deux sens
  (pas de « 10 bulletins contre rien »). Au plus **20 bulletins** par côté d'un échange.
- Pas de confettis, pas d'XP, pas de jauges, pas de FM.

### Une annonce

- Elle propose **1 à 3 objets** que l'auteur possède, et dit ce qu'elle cherche, au choix :
  - des objets précis (1 à 3, choisis dans le catalogue échangeable) ;
  - « n'importe quel objet de rareté X » (tenue, objet, ou les deux) ;
  - un nombre de bulletins (1 à 20) ;
  - « faites-moi une offre ».
  On peut combiner « objets précis ou rareté » et « + N bulletins ».
- **3 annonces ouvertes au plus** par joueur. Un même objet ne peut être que dans une seule annonce ouverte.
- **Pas de durée limite** : une annonce reste en vitrine jusqu'à ce que son auteur la retire ou qu'un échange se fasse.
- L'objet en vitrine reste à son propriétaire, qui peut continuer à le porter ; s'il part dans un échange, il est
  retiré du personnage (emplacement vide).
- **Annonces masquées, jamais supprimées automatiquement** :
  - auteur absent depuis plus de 14 jours (`last_seen`) : masquée jusqu'à son retour ;
  - auteur suspendu : masquée ; supprimée si le compte est supprimé ;
  - un objet proposé n'est plus possédé (donné par l'admin à un autre… impossible, mais aussi après un échange par
    une autre annonce) : l'annonce est fermée, l'auteur est prévenu dans son journal.

### Répondre

- **« Troquer »** : si je possède ce qui est demandé (et les bulletins), l'échange se fait tout de suite, sans attendre
  l'auteur (il a déjà dit ce qu'il voulait). Pour « n'importe quel objet de rareté X », je choisis lequel je donne.
- **« Faire une offre »** : je compose une contre-offre (1 à 3 objets, + 0 à 20 bulletins). L'auteur est notifié et
  accepte ou refuse. Une offre en attente **par joueur et par annonce** ; **5 offres en attente** au plus par joueur.
  Une offre ne bloque pas mes objets : ils sont revérifiés à l'acceptation.
- Une offre expire si l'annonce est retirée, échangée ou fermée, ou si l'offrant n'a plus ce qu'il offre au moment
  de l'acceptation (l'acceptation échoue proprement et l'offre est fermée).
- On ne répond pas à sa propre annonce.

### L'échange (serveur)

- Tout se fait dans **une transaction SQLite** : vérifier que chacun possède encore ce qu'il donne (objets non exclus,
  bulletins suffisants), retirer, ajouter, fermer l'annonce et les offres concernées, écrire l'historique. Les deux
  reçoivent leur part, ou rien ne bouge.
- Un objet reçu qu'on possède déjà : refusé à la vérification (on ne troque pas pour un doublon ; l'interface
  l'indique avant).
- Un objet cédé quitte la garde-robe : si on le retire plus tard à la Tombola / la Loterie, c'est un nouvel objet
  (pas un doublon converti en confettis). Rien à changer dans le tirage : il regarde `own`.
- Les autres annonces de chacun qui proposaient un objet parti sont fermées ; les offres en attente qui l'offraient
  aussi.
- Une ligne de journal pour chacun (« Brocante : ta Chasuble syndicale contre le Pantalon rouge d'Hugo. »).

### Accès et anti-multi-compte

- Pour échanger (déposer, troquer, offrir, accepter) : **niveau minimum des duels** (`DUEL_MIN_LEVEL`, 5, même réglage
  que les duels) et compte d'au moins **3 jours** (constante propre, `MARKET.minAgeMs`, réglable en test par
  `POLITIGO_MARKET_MIN_AGE_H` ; distincte des 12 h des duels). Tout le monde peut regarder la Brocante.
- **Les deux joueurs doivent être éligibles au moment de l'échange**, l'auteur compris même absent. Une annonce dont
  l'auteur n'est plus éligible (retombé sous le niveau 5 après une mort ou une démission) ou a atteint sa limite du jour
  est **masquée** (pas fermée) tant que c'est le cas ; « Troquer » est refusé avec la raison si l'état a changé entre
  l'affichage et le clic. Même règle pour une offre : l'offrant doit être éligible quand l'auteur l'accepte, sinon
  l'acceptation échoue proprement et l'offre reste en attente.
- **3 échanges conclus par jour** et par joueur (jour serveur), qu'on soit auteur ou preneur.
- **Pas de blocage par adresse IP** : les testeurs d'une même équipe partagent souvent l'IP du bureau. À la place, un
  signal « même réseau » pour l'admin (choix de l'utilisateur : empreinte de la dernière IP) :
  - le serveur garde **une seule valeur par joueur** : une empreinte HMAC-SHA256 de sa dernière IP vue, avec une clé
    secrète propre au serveur (générée et rangée dans le dossier de données comme les autres secrets), **écrasée** à
    chaque mise à jour (connexion, et au rythme de `last_seen`). Jamais l'IP en clair, pas d'historique ;
  - à chaque échange, `same_ip` = les deux empreintes sont égales (et non vides) ; stocké dans `market_trades` ;
  - la console affiche seulement « même réseau : oui / non » ; l'admin tranche (suspendre existe déjà) ;
  - une ligne dans l'aide (rubrique compte / confidentialité) dit que le jeu garde une empreinte non réversible de la
    dernière adresse de connexion, pour repérer les échanges entre comptes d'une même personne ;
  - l'empreinte est effacée avec le compte.
- Comptes suspendus : ni regarder ni échanger.
- Limites de requêtes comme les autres routes ; textes libres : aucun (les annonces sont faites de choix, pas de texte),
  donc rien à modérer côté contenu.

### Faire revenir

- **Notification** (push, si activées) : une offre reçue sur mon annonce ; mon annonce a trouvé preneur ; mon offre a
  été acceptée ou refusée.
- **Fil public** : chaque échange **entre camps** est annoncé (« 🔄 Camille a troqué sa Chasuble syndicale contre le
  Pantalon rouge d'Hugo »). Les échanges dans un même camp ne sont pas annoncés (moins de bruit).
- **Compteur** sur la ligne « Brocante » : nombre de nouvelles annonces depuis ma dernière visite de la Brocante.

## Écrans

Une feuille « La Brocante » (même composant que les autres feuilles), ouverte depuis le menu Jouer / Garde-robe :

```
┌───────── 🧺 La Brocante ─────────┐
│ [Toutes] [Tenues] [Objets] [Pour moi]
│ ─────────────────────────────────
│ Camille (gauche) · Rare
│   Propose : Chasuble syndicale
│   Cherche : une tenue Rare, ou 4 🗳️
│   [Troquer]  [Faire une offre]
│ ─────────────────────────────────
│ Hugo (droite)
│   Propose : Loden du dimanche
│   Cherche : faites-moi une offre
│   [Faire une offre]
│ ─────────────────────────────────
│ [+ Déposer une annonce]  Mes annonces (1) · Offres (2)
└──────────────────────────────────┘
```

- « Pour moi » : les annonces que je peux troquer tout de suite (calculé depuis ma garde-robe, pas de liste de
  souhaits).
- « Mes annonces » : mes annonces ouvertes, les offres reçues (Accepter / Refuser), Retirer.
- « Offres » : mes offres en attente (Retirer).
- Dépôt : choisir 1 à 3 objets de ma garde-robe (les exclus sont grisés avec la raison), puis ce que je cherche.
- La Garde-robe marque d'un badge les objets en vitrine.

Une maquette (`maquette/`, locale) sera faite avant le code, comme d'habitude.

## Console d'administration

- Page Brocante (ou carte sur une page existante) : annonces ouvertes, historique des échanges (date, les deux joueurs,
  ce qui a changé de mains, signal « même_ip »), en lecture seule.
- Retirer une annonce (droit de modérateur existant le plus proche, à choisir par le constructeur).

## Données (proposition)

- `market_listings(id, player_id, offer_json, want_json, created, status)` — status : open | traded | withdrawn | closed.
- `market_offers(id, listing_id, player_id, offer_json, created, status)` — status : pending | accepted | refused | closed.
- `market_trades(id, listing_id, offer_id, a_id, b_id, a_gave_json, b_gave_json, same_ip, created)`.
- `market_daily(day, player_id, n)` pour la limite quotidienne.
Migrations additives, comme `snow_challenges`. Les objets restent dans `players.state.wardrobe.own` (source de vérité),
les tables ne font que décrire les annonces.

## Approches envisagées

- **A. Troc direct entre deux joueurs** : simple, mais il faut savoir qui possède quoi ; peu d'échanges entre inconnus.
  Écarté pour cette version (viendra ensuite sur le même mécanisme).
- **B. Brocante publique** : retenue par l'utilisateur. Crée la raison de revenir et fait se croiser les camps.
- **C. B + offres directes depuis la fiche** : la cible à terme, en deux temps.

Échanges entre camps : **libres et portables** (choix de l'utilisateur), plutôt que réservés à son camp ou réduits à des
trophées non portables.

## Décisions de l'utilisateur

- Tableau public ; chacun choisit ce qu'il met en vitrine.
- Un objet échangé quitte la garde-robe : le retirer plus tard n'est pas un doublon.
- Échanges entre camps permis, objets portables.
- Pas de durée limite d'affichage.
- Signal « même réseau » par empreinte non réversible de la dernière IP (pas d'IP en clair, pas d'historique).
- Objets d'événement offerts par la console : échangeables (chantier suivant).

## Décisions de Claude (à corriger si besoin)

- Exclusion des ultra rares et du Bâton ; bulletins seulement en complément ou en prix, 20 au plus par côté.
- 1 à 3 objets par annonce, 3 annonces ouvertes, 5 offres en attente, 3 échanges par jour.
- Niveau 5 (réglage des duels) et compte de 3 jours (réglage propre) pour échanger ; annonces masquées tant que
  l'auteur n'est plus éligible ou a atteint sa limite du jour.
- Onglet « Pour moi » calculé depuis la garde-robe ; pas de liste de souhaits.
- Pas de blocage par IP (équipes au même bureau) : signal pour l'admin.
- Annonces d'absents (> 14 jours) masquées, pas supprimées.
- Fil public seulement pour les échanges entre camps.
- Pas de texte libre dans les annonces (rien à modérer).

## Laissé au constructeur

- L'emplacement exact de l'entrée « Brocante » dans les menus, les libellés fins, l'ordre de tri (récentes d'abord).
- Le droit de modérateur pour retirer une annonce.
- La forme exacte des JSON et des routes (`/api/action` type `market*` ou routes dédiées comme les défis de neige).
- La version : contenu joueur, donc mineure (1.9.0 si la 1.8.0 est sortie avant).
