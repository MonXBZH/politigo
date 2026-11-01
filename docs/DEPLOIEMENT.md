# PolitiGo — déploiement, exploitation et développement

Guide technique de PolitiGo (présentation du jeu : [README](../README.md)). Un site statique (nginx) et une API de jeu (Node 24, SQLite),
dans deux conteneurs, plus une interface d'administration facultative dans un troisième.
Le serveur fait foi : il détient les parties, fait tourner l'horloge et vérifie chaque action.

```
Internet ─HTTPS─> reverse proxy (TLS, domaine) ─HTTP─> web:8080 (nginx) ─┬─ fichiers du jeu
                                                                          ├─ /api/*  ─> api:3000 (Node)
                                                                          └─ /events ─> api:3000 (flux temps réel)
                                                                                           └─ volume SQLite
LAN ─HTTP─> admin:8090 (facultatif) ─socket Unix (volume partagé)─> api   (aucun port réseau d'administration sur l'API)
```

## 1. Sur le serveur Docker

```bash
cp .env.example .env      # puis éditer .env
docker compose up -d --build
```

À régler dans `.env` :

| Variable | Valeur en production |
|---|---|
| `POLITIGO_INVITE` | facultatif. **Vide** : le serveur génère un code au premier démarrage, le garde dans le volume (`/data/invite.txt`) et l'affiche dans ses logs à chaque démarrage (`docker compose logs api`, ou les logs du conteneur `api` dans Portainer). **Renseigné** : ce code, d'au moins 16 caractères (le serveur refuse de démarrer avec un code court ou celui de l'exemple). **`off`** : inscriptions fermées |
| `MAX_PLAYERS` | `50` : nombre maximum de comptes |
| `POLITIGO_BIND` | l'IP interne du serveur Docker (le reverse proxy est sur une autre machine) |
| `POLITIGO_PORT` | `8080` |
| `COOKIE_SECURE` | `1` (cookies de session HTTPS uniquement) |
| `PROXY_HOPS` | `2` (le reverse proxy + le nginx de la pile) |
| `POLITIGO_SPEED` | `1` (temps réel ; plus grand uniquement sur un serveur de test) |
| `POLITIGO_PUSH` | facultatif. Vide : notifications de duel activées ; **`off`** : désactivées (voir « Duels et notifications ») |
| `POLITIGO_PUSH_CONTACT` | facultatif. Adresse `mailto:` ou `https:` transmise aux services de notification ; vide : la page GitHub du projet |
| `POLITIGO_EVENT` | facultatif. Vide : événements saisonniers automatiques ; **`off`** : désactivés ; `halloween` : forcé (tests) — voir « Événements saisonniers (Halloween) ». L'interface d'administration peut le changer à chaud |
| `POLITIGO_SERVER_NAME` | facultatif. Nom de cette partie dans l'interface d'administration (utile quand elle en gère plusieurs) ; vide : « PolitiGo » |
| `POLITIGO_ADMIN_PASSWORD` | interface d'administration : mot de passe, 12 caractères minimum. **Vide** : un mot de passe est généré au premier démarrage et affiché **une seule fois** dans les logs du conteneur `admin` (seule son empreinte est gardée, dans le volume `politigo-admin-data`) |
| `POLITIGO_ADMIN_BIND` / `POLITIGO_ADMIN_PORT` | adresse et port de l'interface d'administration (`0.0.0.0` / `8090` par défaut, pour un usage sur le réseau local). Derrière Nginx Proxy Manager : `127.0.0.1` (ou filtrer le port 8090) |
| `POLITIGO_ADMIN_PROXY_HOPS` | `0` en accès direct ; `1` derrière un reverse proxy (Nginx Proxy Manager…), pour que les limites de connexion voient la vraie adresse |
| `POLITIGO_ADMIN_COOKIE_SECURE` | `1` si l'interface d'administration est servie en HTTPS (sinon déduit de `X-Forwarded-Proto`) |
| `POLITIGO_ADMIN_SERVERS` | facultatif. Plusieurs parties sur ce même hôte Docker : `"Prod=/run/politigo/admin.sock;Test=/run/politigo-test/admin.sock"` (voir « Interface d'administration ») ; vide : cette pile seulement |

**Pare-feu** : n'autoriser le port 8080 qu'à l'adresse du reverse proxy. Attention, les ports publiés par Docker
contournent UFW et firewalld : la règle se pose dans la chaîne `DOCKER-USER` (à rendre persistante, par exemple avec `iptables-persistent`) :

```bash
sudo iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 8080 ! -s IP_DU_REVERSE_PROXY -j DROP
```

Sans ce filtrage, quelqu'un sur le réseau pourrait joindre la pile sans passer par le reverse proxy, en HTTP clair,
et inventer son adresse IP pour contourner les limites de tentatives.

### Variante Portainer (images prêtes, aucun build sur le serveur)

Portainer déploie mieux une stack qui **tire** des images qu'une stack qui les construit. Les images sont donc
construites par GitHub et publiées sur son registre (ghcr.io) :

1. Pousser le projet sur GitHub (le `.gitignore` exclut `.env`). À chaque push sur `main`, le workflow
   `.github/workflows/images.yml` lance les tests puis publie `ghcr.io/<compte>/politigo-web`, `politigo-api` et `politigo-admin`
   (tags `latest`, `sha-xxxxxxx`, et `1.2.0` pour un tag git `v1.2.0`), pour amd64 et arm64.
2. Si le dépôt est privé, les images le sont aussi : créer un jeton GitHub avec le droit `read:packages`, puis dans
   Portainer → Registries → Add registry → Custom : URL `ghcr.io`, identifiant GitHub, le jeton comme mot de passe.
3. Portainer → Stacks → Add stack → Web editor : coller `docker-compose.portainer.yml`, puis dans
   « Environment variables » :

   | Variable | Valeur |
   |---|---|
   | `POLITIGO_IMAGES` | `ghcr.io/<compte>/politigo` |
   | `POLITIGO_TAG` | `latest`, ou une version figée (`1.2.0`, `sha-xxxxxxx`) pour maîtriser les mises à jour |
   | `POLITIGO_INVITE`, `POLITIGO_BIND`, `POLITIGO_PORT`, `COOKIE_SECURE`, `PROXY_HOPS`, `MAX_PLAYERS`, `POLITIGO_PUSH`, `POLITIGO_PUSH_CONTACT`, `POLITIGO_EVENT`, `POLITIGO_SERVER_NAME` | comme dans le tableau ci-dessus |
   | `POLITIGO_ADMIN_PASSWORD`, `POLITIGO_ADMIN_BIND`, `POLITIGO_ADMIN_PORT`, `POLITIGO_ADMIN_PROXY_HOPS`, `POLITIGO_ADMIN_COOKIE_SECURE`, `POLITIGO_ADMIN_SERVERS` | interface d'administration (service `admin`, activé par défaut ; supprimer son bloc et ses deux volumes pour s'en passer) |

4. **Mise à jour** : dans la stack, « Update the stack » en cochant « Re-pull image ». Le volume (les parties) est conservé.
   Portainer préfixe les volumes du nom de la stack : `<stack>_politigo-data` (à sauvegarder), `<stack>_politigo-admin-sock`
   (le socket d'administration, rien à sauvegarder) et `<stack>_politigo-admin-data` (l'empreinte du mot de passe d'administration).

Sans GitHub, on peut aussi construire sur le serveur (`docker compose build`, qui crée `politigo-web` et `politigo-api`),
puis déclarer dans Portainer `POLITIGO_IMAGES=politigo` et `POLITIGO_TAG=latest` : la stack utilise alors ces images locales.

## 2. Sur le reverse proxy

```nginx
# Dans le bloc http { } : limites par visiteur réel (c'est ici qu'on connaît sa vraie adresse).
limit_conn_zone $binary_remote_addr zone=pg_conn:10m;
limit_req_zone  $binary_remote_addr zone=pg_req:10m rate=20r/s;

server {
    listen 80;
    server_name politigo.example.fr;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    http2 on;
    server_name politigo.example.fr;
    server_tokens off;
    # ssl_certificate / ssl_certificate_key : comme pour les autres sites

    add_header Strict-Transport-Security "max-age=31536000" always;
    client_max_body_size 8k;
    limit_conn pg_conn 20;
    limit_req zone=pg_req burst=40 nodelay;

    location / {
        proxy_pass http://IP_DU_SERVEUR_DOCKER:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        # $remote_addr et non $proxy_add_x_forwarded_for : une adresse inventée par le visiteur est écrasée.
        proxy_set_header X-Forwarded-For $remote_addr;
    }
    # Envoi d'images dans le chat (2 Mo au plus) : la seule requête plus grosse que 8 Ko.
    location = /api/chat/media {
        client_max_body_size 2200k;
        proxy_pass http://IP_DU_SERVEUR_DOCKER:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
    # Classement et fil en direct : flux ouvert, jamais mis en tampon.
    location /events {
        limit_conn pg_conn 4;
        proxy_pass http://IP_DU_SERVEUR_DOCKER:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
}
```

Le reverse proxy ne doit pas réécrire les en-têtes de sécurité envoyés par la pile (CSP, X-Frame-Options…), seulement ajouter HSTS.
Si l'un de ses `location` utilise `add_header`, recopier la ligne HSTS dedans : nginx n'hérite alors plus de celle du `server`.

**Nginx Proxy Manager** : la même chose dans l'onglet *Advanced* de l'hôte. Sans la `location = /api/chat/media` (ou un
`client_max_body_size` d'au moins 2200k), l'envoi d'images dans le chat échoue avec une erreur 413 ; le texte, lui, passe.

## 3. Exploitation

- **Sauvegarde** : le volume `politigo_politigo-data` contient `politigo.db` (comptes, parties, duels, fil, chat), `vapid.json`
  (la clé des notifications : à sauvegarder avec la base, sinon les téléphones abonnés ne reçoivent plus rien) et `chat-media/`
  (les images du chat, effacées au bout de 7 jours). L'interface d'administration télécharge aussi une copie cohérente de la base
  (page Sauvegarde). Exemple en ligne de commande :
  `docker run --rm -v politigo_politigo-data:/d -v "$PWD":/b alpine tar czf /b/politigo-$(date +%F).tgz -C /d .`
  Les fichiers du volume sont privés (mode 0600, propriétaire `node`) : lis-les en root, comme dans cet exemple.
- **Mise à jour** : `docker compose build --pull && docker compose up -d` (récupère aussi les correctifs de sécurité de nginx et Node). Les parties sont conservées. Pendant un arrêt, même de plusieurs jours, rien ne se joue : au redémarrage, chaque partie
  revient sur l'heure réelle (jour et nuit restent justes), et ses jauges sont inchangées (personne ne meurt ni n'a faim parce que
  le serveur était éteint). Le journal du joueur l'indique (« Maintenance du serveur (3 h) : ce temps est sauté… »), et les logs aussi.
  Garde-fou : si l'horloge du serveur est en retard sur la dernière sauvegarde (heure pas encore synchronisée au démarrage)
  ou en avance de plus d'un an, l'API refuse de démarrer sans toucher aux parties, et Docker la relance jusqu'à ce que l'heure
  soit bonne. Si la date affichée dans le log est pourtant la bonne : `POLITIGO_TRUST_CLOCK=1`.
- **Logs** : `docker compose logs -f api`.
- **Fermer les inscriptions** : interface d'administration → Réglages (à chaud), ou `POLITIGO_INVITE=off` puis `docker compose up -d`.
  Les comptes existants continuent de jouer.
- **Retrouver le code d'invitation** : interface d'administration (tableau de bord, bouton Copier), ou `node admin.mjs invite`.
- **Nouveau code** (après une fuite) : interface d'administration → Réglages → Régénérer (il remplace alors celui de `.env`
  et de `/data/invite.txt`). Sans l'interface : `docker compose exec api rm /data/invite.txt && docker compose restart api`
  (code généré seulement : `POLITIGO_INVITE` vide), et lire le nouveau code dans les logs.
- **Mot de passe perdu, compte bloqué** : l'outil `admin.mjs` de l'image `api`, à lancer *dans* le conteneur
  (`docker compose exec api node admin.mjs …`, ou dans Portainer : conteneur `api` → Console → `/bin/sh` → Connect, puis `node admin.mjs …`) :

  | Commande | Effet |
  |---|---|
  | `node admin.mjs list` | liste les joueurs (pseudo, inscription, dernière activité) |
  | `node admin.mjs reset-password <pseudo>` | génère un mot de passe fort et l'affiche **une seule fois** |
  | `node admin.mjs reset-password <pseudo> --stdin` | le mot de passe est tapé (masqué, deux fois) ou envoyé sur l'entrée standard |
  | `node admin.mjs unlock <pseudo>` | efface les essais de connexion ratés sur ce pseudo (et des adresses qui l'ont essayé) |
  | `node admin.mjs announce "<texte>"` | annonce à tous : bandeau dans le jeu, notification aux abonnés, ligne « Annonce officielle » dans le fil de la République |
  | `node admin.mjs announce "<texte>" --to <pseudo>` | message à un seul joueur : bandeau et notification, rien dans le fil public |
  | `node admin.mjs announce "<texte>" --camp gauche` | message à un camp (`gauche` ou `droite`) : bandeau et notification, rien dans le fil public |
  | `node admin.mjs invite` | affiche le code d'invitation en vigueur (ou « Inscriptions fermées ») |
  | `node admin.mjs stats` | joueurs, connectés, actifs, version |

  Une annonce : texte brut de 240 caractères au plus, entre guillemets. Elle n'apparaît jamais en pleine partie (bandeau et
  notification arrivent à la fin du mini-jeu) ; un joueur ni connecté ni abonné aux notifications ne la voit pas, sauf l'annonce
  à tous, qui reste dans le fil. L'outil dit combien de joueurs l'ont reçue.
  Le pseudo se trouve comme au login, sans tenir compte des majuscules ni des accents (`"Mon Pseudo"` entre guillemets s'il a un espace).
  Une réinitialisation ferme toutes les sessions du joueur sur tous ses appareils et efface ses essais ratés : il se reconnecte
  aussitôt avec le nouveau mot de passe, et retrouve son compagnon intact. Aucun redémarrage.
  Le mot de passe n'est **jamais** accepté en argument (il resterait dans l'historique du shell et de Docker) : transmets celui
  qui est généré par un canal privé.

### Interface d'administration (conteneur `admin`, facultatif)

Une page web pour tout ce que fait `admin.mjs`, et plus : `http://IP_DU_SERVEUR_DOCKER:8090`, mot de passe
`POLITIGO_ADMIN_PASSWORD` (ou celui affiché une fois dans les logs du conteneur `admin`). Activée par défaut dans les deux
compose ; supprimer le bloc `admin` et ses volumes pour s'en passer, le jeu n'en dépend pas.

- **Tableau de bord** : joueurs, connectés, actifs sur 24 h et 7 jours, abonnés aux notifications, chat, version,
  taille de la base, et le code d'invitation (masqué, bouton Copier).
- **Joueurs** : fiche complète (camp, niveau, jauges, duels, activité), déconnexion de tous les appareils, nouveau mot de passe
  (affiché une fois), déblocage, renommage, suspension (connexion refusée, compagnon figé, caché du classement ; à la levée, le
  temps suspendu est sauté et non joué), privation de chat pour une durée.
- **Annonces** : tout de suite ou planifiées (une fois, chaque jour, certains jours de la semaine, avec date de fin), à tous, à
  un camp ou à un joueur ; aperçu, historique. Une annonce planifiée part même si le conteneur `admin` est arrêté (c'est
  l'API qui les envoie) ; une annonce manquée de plus de 30 min (serveur arrêté) est sautée, pas envoyée en retard.
- **Chat** : messages signalés (avec l'image), suppression, privation de chat de l'auteur. **Fil** : supprimer une ligne.
  **Duels** : annuler un duel bloqué.
- **Réglages** : code d'invitation (copier, régénérer), inscriptions ouvertes ou fermées, événement saisonnier (auto, désactivé,
  forcé), chat pour tous et chat de camp (fermés par défaut), à chaud. Ces réglages sont gardés dans la base et l'emportent ensuite sur `.env`.
- **Sauvegarde** : télécharge une copie cohérente de la base (`VACUUM INTO`), et à part `vapid.json`. Fichiers sensibles
  (empreintes des mots de passe, clé des notifications) : à garder hors d'Internet.
- **Détection de bots** : sur 14 jours, pour chaque joueur, ses résultats aux mini-jeux (part des parties au bonus maximum,
  régularité suspecte des scores, parties finies au plus tôt permis, signalements du serveur), puis ses actions heure par heure,
  la part faite sans le jeu ouvert, depuis autre chose qu'un navigateur et la nuit, résumés en un score et des raisons.
  **Duels suspects** : paires de comptes créés ensemble qui se défient, rafales de comptes différents à quelques secondes
  d'intervalle, même perdant face au même gagnant, et joueur qui bat l'un après l'autre plusieurs rivaux qui ne jouent
  presque pas (une ferme de comptes). Chaque tour de duel compte aussi dans la détection de bots. Un duel terminé peut être **annulé** : XP, niveau, moral et énergie des deux
  joueurs reviennent à leur valeur d'avant le duel. Aucune adresse IP n'est enregistrée.
- **À traiter** : sur tous les serveurs, vérifiés toutes les 20 s, les messages signalés du chat, les duels signalés par
  l'anti-triche, les joueurs au score de bot de 50/100 ou plus et les groupes de duels suspects. Le nombre s'affiche dans
  le menu et dans le titre de l'onglet, un son marque chaque nouvelle alerte, et une notification système s'affiche quand
  la console est en arrière-plan. Cette notification n'est possible qu'en HTTPS (Nginx Proxy Manager) ou sur `localhost` :
  les navigateurs la refusent en `http://IP-du-LAN`. « Vu » range une alerte pendant 30 jours, pour toutes les consoles.
- **Journal d'admin** : chaque action d'administration (web, ligne de commande, annonce planifiée), sans mot de passe,
  signée du nom du modérateur quand c'est lui qui agit.
- **Modérateurs** (organisateur seulement) : choisis parmi les joueurs d'un serveur, avec un profil prêt à l'emploi
  (« Modo chat », « Modo complet ») ou des cases à cocher : les panneaux qu'ils voient, les actions permises et les
  serveurs où ils agissent. Un mot de passe de 20 octets aléatoires en base64 (`openssl rand -base64 20`) est généré et
  affiché une seule fois. Le modérateur se connecte avec son pseudo de joueur et ce mot de passe. Les droits sont vérifiés
  par le conteneur admin à chaque commande, et le serveur de jeu refuse toute action sur son propre compte (il ne voit pas
  non plus les alertes et signalements qui le concernent). Changer ses droits, régénérer son mot de passe ou le retirer
  ferme ses sessions aussitôt. Restent à l'organisateur : Réglages, Sauvegarde, régénération du code d'invitation et
  gestion des modérateurs ; le code d'invitation n'est visible que si la case est cochée. Les modérateurs sont gardés
  dans le volume `/data-admin` (`moderators.json`, empreintes scrypt seulement).

**Plusieurs parties sur le même hôte Docker** : chaque pile a son propre socket d'administration. Monter le volume du socket
de l'autre pile dans le conteneur `admin` (volume externe `<autre-stack>_politigo-admin-sock`, exemple commenté dans le compose),
puis `POLITIGO_ADMIN_SERVERS="Prod=/run/politigo/admin.sock;Test=/run/politigo-test/admin.sock"`. L'interface ouvre alors sur une
vue d'ensemble (une carte par partie), le sélecteur en haut change de partie, et chaque confirmation nomme la partie visée.
Des parties sur d'autres machines ne sont pas prises en charge : le socket ne passe jamais par le réseau.

**Sécurité** : mot de passe haché (scrypt), session de 12 h en cookie `HttpOnly` `SameSite=Strict`, 5 essais ratés par
adresse et 30 au total par quart d'heure (sous attaque, cela peut aussi te bloquer 15 min), protection CSRF, CSP stricte.
L'interface ne parle qu'au socket, avec une liste fermée de commandes. Elle n'a pas de filtre d'adresses : à garder sur le
réseau local, ou derrière Nginx Proxy Manager en HTTPS (`POLITIGO_ADMIN_BIND=127.0.0.1` et `POLITIGO_ADMIN_PROXY_HOPS=1`).

### Chat

- **Fermé par défaut.** L'organisateur l'ouvre dans l'interface d'administration → Réglages, avec deux coches
  indépendantes : « Chat pour tous » et « Chat de camp ». Les joueurs ne peuvent pas l'activer eux-mêmes : salon fermé,
  onglet absent ; tout fermé, la touche Chat disparaît. Le changement s'applique tout de suite sur les écrans ouverts ;
  les messages existants sont gardés (et toujours effacés au bout de 7 jours) et réapparaissent à la réouverture.
  `POLITIGO_CHAT` (`on`, `global`, `camp` ; vide : fermé) ne sert que d'état initial d'une nouvelle partie, la coche
  de l'administration l'emporte ensuite.
- Un salon pour tous et un salon par camp (un joueur voit celui de son camp actuel). Texte de 500 caractères, emojis,
  images GIF, PNG, JPEG ou WebP de 2 Mo au plus (type vérifié sur le contenu, jamais sur le nom).
- Messages et images effacés au bout de **7 jours** ; un joueur peut effacer les siens et signaler ceux des autres.
- Limites : 8 messages par 20 s, 20 images par heure, 3 images en attente par joueur, 300 Mo d'images en tout.
- Pas de notification ni de son : une pastille compte les non-lus, et rien ne s'affiche pendant un mini-jeu.

### Activités, Flamme, Tombola et Garde-robe

- **Missions, courrier, objectifs du jour** : effets sur les jauges seulement (satiété, moral, énergie, hygiène, bornées
  à 0-100), **jamais d'XP ni de FM**. Missions : une à la fois, 4 par jour, énergie 15 au moins, la nuit seulement de 20 h
  à minuit (heure du jeu) ; une notification « Mission terminée » part au retour (différée pendant un mini-jeu). Courrier :
  une lettre toutes les 30 à 60 minutes, de 7 h à minuit. Objectifs : 3 par jour, tirés au premier passage de la journée ;
  une mort politique ne les retire pas, et ne redonne ni missions ni bulletins.
- **Flamme** : 10 points par jour au plus (jauges toutes ≥ 50 toute la journée +3, les 3 objectifs +3, au moins 4 visites
  étalées sur 8 h +2, 2 missions +1, 3 lettres +1) ; ×0,9 par journée sans visite, ×0,75 à une mort politique.
- **Tombola (gauche) / Loterie (droite)**, purement cosmétique, **jamais d'argent réel** : un tirage gratuit par jour,
  puis un bulletin par tirage ; bulletins gagnés uniquement en jouant (+1 par mission rapportée, au plus 4 par jour ; +1 par
  objectif, 3 par jour ; +1 toutes les 3 lettres). Chances : commun 60 %, rare 28 %, épique 9,5 %, légendaire 2 %, ultra
  rare 0,5 % ; tirages garantis : épique au 10ᵉ, légendaire au 50ᵉ, ultra rare au 80ᵉ. Doublons → confettis (5, 10, 25,
  50, 100 selon la rareté) ; 100 confettis = une case commune, rare ou épique au choix. La fiche d'un joueur dans
  l'administration montre sa Flamme, ses bulletins, ses confettis, ce qu'il possède et ce qu'il porte.

<details>
<summary><b>⚠️ Divulgâchage, réservé à l'organisateur :</b> l'objet mythique de la Tombola et son duel</summary>

- **Le Bâton de feu des Apprix** : un seul exemplaire par partie, pour les deux camps, rareté « Mythique ». Il n'apparaît
  nulle part (ni Garde-robe, ni nouveautés, ni README) tant que personne ne l'a gagné. Pour avoir une chance à chaque
  tirage : compte de 30 jours, Flamme ≥ 300, aucun soupçon de bot ni duel signalé sur 14 jours ; alors 1 % par tirage,
  +0,1 % par tranche de 10 de Flamme au-delà de 300, 3 % au plus (compter 6 à 8 semaines pour un joueur très assidu).
  Le gagnant voit la légende en 14 tableaux ; tous les autres reçoivent une notification, et la console une alerte « Mythique ».
- **Il retourne dans l'urne** à la mort politique de son porteur, quand sa Flamme passe sous 150 (avertissement unique
  sous 200), quand son compte est supprimé, ou par « Remettre le Bâton dans l'urne » (fiche du joueur, organisateur seul).
- **Le Duel du Bâton** (« le Bras de fer des Cendres », jeu de rythme, 2 manches gagnantes de 45 s) : tout joueur
  de niveau suffisant, au compte assez ancien et à la Flamme ≥ 200 peut défier le porteur. Un seul duel du Bâton à la fois,
  un défi par joueur et par semaine, 3 jours de répit au porteur après une défense réussie. **En direct** si le porteur est
  en ligne et accepte (invitation de 5 minutes) ; sinon **en différé** : le challengeur joue ses 3 manches tout de suite
  (20 minutes, sinon le défi est abandonné), le porteur a 48 h pour jouer les siennes contre son fantôme (sinon il perd le
  Bâton), puis le duel est **rediffusé** à tous au prochain 21 h (au moins 30 minutes plus tard) et le Bâton ne change de
  mains qu'à la fin de la rediffusion. Les spectateurs suivent un duel en direct avec 3 s de retard et l'encouragent par
  emojis, sans effet sur le jeu. Aucun XP, aucun FM, aucune jauge en jeu.
- **Anti-triche** : les frappes arrivent en temps réel par paquets, la partition n'est dévoilée que 3 s à l'avance, et le
  serveur arbitre lui-même. Une frappe « dans le futur » ou qui réécrit le passé, un jeu de métronome, une manche sans
  faute ou une rafale de frappes signalent le duel : à la fin il reste **en attente** (« À traiter », type « Duel du
  Bâton ») jusqu'à l'arbitrage, « Valider » (le résultat s'applique) ou « Annuler » (rien ne bouge), commande
  `baton-judge`, ouverte aussi aux modérateurs qui ont le droit d'annuler les duels.
- **Réglages de test** (jamais en production) : `POLITIGO_BATON_SPEED` (1 à 20) accélère les manches ;
  `POLITIGO_BATON_REPLAY_MS` lance la rediffusion ce délai après la partie du porteur au lieu de 21 h.

</details>

### Duels et notifications

- **Duels** (Débat chrono, en différé) : le joueur qui défie joue d'abord ; l'adversaire a 24 h pour relever le défi
  sur le même débat, ou le refuser. Comme en solo, c'est le serveur qui pose les questions une à une et chronomètre les
  réponses : le navigateur ne connaît jamais le tirage, une réponse en moins de 0,6 s n'est pas comptée, un débat rapporte
  20 points au plus, et un tour anormal (zéro erreur, rythme de machine, réflexes plus rapides qu'un humain) est signalé dans l'administration. Limites : niveau 5
  et compte d'au moins 12 h pour les deux joueurs, 3 défis envoyés par jour, un seul duel ouvert par paire, et pas de nouveau
  duel entre deux joueurs moins de 24 h après le précédent. Une victoire rapporte 3 fois par jour au plus, et 3 fois par jour
  au plus pour le défié ; au-delà elle ne rapporte rien. Une défaite ne fait jamais perdre de niveau ni descendre le moral ou
  l'énergie sous 25. Un tour non fini ou un défi sans réponse en 24 h est clos tout seul ; un redémarrage du serveur reprend
  un tour de duel là où il en était, sans permettre de le rejouer.
- **Notifications** (Web Push, standard des navigateurs, sans compte tiers) : un joueur défié reçoit « Défi reçu ! »
  sur les appareils où il les a acceptées (5 au plus). La clé du serveur est créée au premier démarrage dans
  `/data/vapid.json` (mode 0600) : la sauvegarder avec la base. Si le volume n'est pas inscriptible, le serveur démarre
  quand même avec une clé en mémoire (et le dit dans ses logs) : les abonnements cessent alors de marcher au redémarrage suivant.
  Le conteneur `api` doit pouvoir sortir en HTTPS vers les services de notification des navigateurs
  (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`) : ce sont les
  seules adresses acceptées pour un abonnement. `POLITIGO_PUSH=off` désactive tout ; `POLITIGO_PUSH_CONTACT` fixe le contact
  transmis à ces services.
- **Événements saisonniers (Halloween)** : automatiques, du 31 octobre 00:00 au 1er novembre 23:59 dans le fuseau du
  jeu (Europe/Paris), puis tout redevient normal sans intervention. Purement cosmétique (noms, dessins, répliques ; prix
  et effets inchangés, duels identiques), sauf une friandise quotidienne : +5 de moral une fois par jour de jeu, éveillé.
  `POLITIGO_EVENT=off` l'arrête avant la fin ; `POLITIGO_EVENT=halloween` le force n'importe quel jour (serveur de test
  uniquement). Vide ou absent : automatique ; une valeur inconnue est signalée dans les logs et traitée comme vide.
- **Réglages de test** (jamais en production) : `POLITIGO_DUEL_MIN_LEVEL` et `POLITIGO_DUEL_MIN_AGE_H` abaissent le niveau
  et l'ancienneté du compte exigés pour les duels (ils ne peuvent que les baisser), pour tester avec des comptes neufs.

## 4. Sécurité en bref

- **Comptes** : mots de passe hachés (scrypt, sans bloquer le serveur), code d'invitation exigé (16 caractères minimum), nombre de comptes plafonné.
  Pseudos en alphabet latin uniquement, et unicité sans tenir compte des majuscules ni des accents : personne ne peut se faire passer pour un autre avec un « о » cyrillique.
- **Sessions** : cookie `__Host-` `HttpOnly` + `SameSite=Lax` + `Secure`, 10 appareils au plus par joueur, supprimées côté serveur à la déconnexion et à la suppression du compte.
- **Requêtes** : écritures refusées hors JSON et hors origine du site ; limitation des tentatives par adresse, par adresse et pseudo,
  et par pseudo, si bien qu'un inconnu ne peut pas bloquer le compte d'un ami ; 3 inscriptions par heure et par adresse ;
  un pseudo supprimé ne peut être repris qu'après 24 h ; 5 essais de suppression de compte par quart d'heure ; 3 flux en direct
  par joueur et 12 par adresse ; une démission par heure. Les vérifications de mot de passe passent par une file d'attente
  bornée (4 à la fois, une par adresse) : une rafale de tentatives ralentit, mais ne bloque plus les vraies connexions.
  nginx limite en plus le débit des requêtes et le nombre de flux ouverts par adresse (limites larges, car le reverse proxy
  partage une même adresse pour tous les joueurs).
- **Administration** : aucune route web dans l'API. `admin.mjs` et le conteneur `admin` passent par un socket Unix
  (`/run/politigo/admin.sock` dans le volume partagé `politigo-admin-sock`, mode 0600, utilisateur `node`) : il faut déjà pouvoir
  lancer une commande dans un de ces conteneurs, ou ouvrir l'interface avec son mot de passe, pour s'en servir.
  Le serveur fait lui-même le travail (hachage, révocation des sessions, effacement des compteurs), avec une requête bornée en taille
  et en durée. `POLITIGO_ADMIN_SOCKET=off` le désactive.
- **Jeu** : le serveur fait foi. Le Débat chrono (solo et duels) est arbitré par le serveur, question par question. Les trois
  autres mini-jeux tirent leur hasard d'une graine imposée par le serveur, doivent renvoyer l'identifiant de la partie, et leur
  score est borné par la durée réellement jouée et par un plafond tiré de la physique du jeu ; chaque résultat est gardé 14 jours
  pour la détection de bots. Hasard du serveur tiré de `crypto` ; notifications envoyées aux seuls services des navigateurs (pas de requête vers une adresse choisie par un joueur) ; états relus et bornés au démarrage.
- **Robustesse** :
  - un joueur ou une connexion en erreur est ignoré sans arrêter le serveur ;
  - une écriture ratée (disque plein) annule l'action au lieu de désynchroniser mémoire et base ;
  - une partie illisible est mise de côté dans `/data/state-<id>-<date>.bad.json` avant d'être recommencée ;
  - à l'arrêt, toutes les horloges sont enregistrées ;
  - `/api/health` vérifie la base et l'horloge du jeu, et pas seulement que le processus répond ;
  - au-delà de 16 vérifications de mot de passe simultanées, le serveur répond « occupé » au lieu de saturer sa mémoire.
- **Client** : requêtes abandonnées après 15 s, bandeau « Connexion perdue » et reconnexion automatique, flux en direct relancé s'il se tait,
  messages visibles même sous un panneau ouvert, bouton Retour du téléphone qui ferme le panneau.
- **Infrastructure** : CSP stricte sans `unsafe-inline`, aucune ressource externe, conteneurs non-root en lecture seule, sans capacités, avec
  mémoire, processus et logs plafonnés ; délais courts contre les connexions lentes. Seuls le pseudo et la partie sont stockés ;
  chaque joueur peut supprimer son compte depuis Dossier → Compte.

Les procédures judiciaires évoquées dans les dossiers évoluent : vérifier régulièrement leur stade dans [SOURCES.md](SOURCES.md) (régénéré par `tools/make-sources.mjs`).

## 5. Cycle de développement

On ne pousse jamais directement sur `main` : tout passe par `dev`, et `main` ne reçoit que des fusions.

1. **Travail sur `dev`** : chaque push lance le workflow `ci` (toute la batterie de tests, aucune publication).
   Dependabot propose aussi ses mises à jour sur `dev`.
2. **Mise en production** : pull request `dev` → `main`, fusionnée quand le statut `tests` est vert, en
   « Create a merge commit » (pas de squash ni de rebase, sinon les historiques de `dev` et `main` divergent).
   La fusion sur `main` relance les tests, puis publie les images `latest` et `sha-xxxxxxx`.
3. **Version** : d'abord, sur `dev`, ajouter l'entrée de la version en tête de `web/changelog.mjs` (numéro sans le « v »,
   date, nouveautés et corrections en français : c'est ce que les joueurs liront). Puis, sur `main` à jour après la fusion,
   `git tag -a v1.3.0 -m "…" && git push origin v1.3.0` → images `1.3.0`, puis la release GitHub (le même texte peut y servir).
   À leur connexion suivante, les joueurs voient une fois « Quoi de neuf dans PolitiGo 1.3.0 » (toutes les versions manquées
   s'ils ont sauté des mises à jour), sur n'importe quel appareil, et le revoient à volonté dans Dossier → Compte.
   Un nouvel inscrit ne le voit pas, une version de développement non plus.
   La version est lue par `git describe` au build et affichée dans le jeu (Dossier → Compte) : « PolitiGo 1.2.1 »,
   ou « 1.2.1-3-gabc1234 » pour un commit de `main` postérieur au tag. Un build local affiche « version de développement »
   (`POLITIGO_VERSION=v1.2.1 docker compose build` pour la fixer).
4. **Portainer** lit le compose sur `main` : un changement du compose n'arrive en production qu'après la fusion.
   Mettre `POLITIGO_TAG` sur la nouvelle version, puis « Update the stack » en re-téléchargeant l'image.
5. **Après une fusion**, remettre `dev` à niveau : `git switch dev && git merge main && git push`.

Protection de `main` (Settings → Rules → Rulesets → New branch ruleset, cible « Include default branch », Active) :
interdire la suppression et le force push, exiger une pull request (0 approbation, on est seul), exiger le statut
`tests` (il n'apparaît dans la liste qu'après une première exécution du workflow `ci`), fusion autorisée : « Merge » seulement.

## 6. Tests

```bash
bash tests/run-server.sh                       # 410 tests : règles (dont l'équilibrage J15) + mini-jeux + activités + Tombola et Garde-robe + test politique + changelog + API + duels + notifications + chat + migrations + outils et interface d'admin, dans l'image Node de production
bash tests/run-server.sh tests/chat.test.mjs   # un seul fichier
docker compose restart api                     # remet à zéro les limites d'inscription avant l'e2e
powershell -ExecutionPolicy Bypass -File tests\e2e.ps1   # parcours complet dans Chrome (crée deux joueurs de test)
```

## 7. Captures et sources du README

```bash
# Captures d'écran (docs/images/*.png) : pile locale VIDE et lancée, en journée (heure de Paris), sans événement saisonnier et chat ouvert (POLITIGO_CHAT=on)
powershell -ExecutionPolicy Bypass -File tools\screenshots.ps1 -AdminUrl http://localhost:8090/ -AdminPassword <mot de passe admin>
# Sans toucher à sa pile locale : une pile jetable à part (PowerShell), puis docker compose -p politigo-shots down -v
#   $env:COMPOSE_PROJECT_NAME="politigo-shots"; $env:POLITIGO_PORT="8081"; $env:POLITIGO_ADMIN_PORT="8091"; $env:POLITIGO_EVENT="off"; $env:POLITIGO_CHAT="on"
#   docker compose up -d --build, puis le script avec -Url http://localhost:8081/ -AdminUrl http://localhost:8091/
# Page des sources (docs/SOURCES.md), à régénérer après toute modification d'un personnage ou d'une casserole
docker run --rm -v "$PWD:/w" -w /w node:24-alpine node tools/make-sources.mjs
```

Le script de captures crée cinq joueurs de démonstration, puis les supprime. Leur Garde-robe ne contient que la première
pièce de chaque rareté (rien d'autre ne doit apparaître dans le README) ; la capture d'un tirage, tiré au hasard, n'est
gardée que s'il donne une de ces pièces, sinon l'ancienne image reste. Il refuse de tourner sur une base qui contient
déjà des joueurs (`-Force` seulement sur une pile jetable) : ne jamais le lancer sur le serveur de production.
