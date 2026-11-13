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
            admin:8091 <─TLS (liaison, facultative)─ api d'une autre partie (autre stack ou autre machine)
```

> **Mise à jour vers 1.7.3 (pile existante avec la console)** : le service `admin` ne démarre plus que si le profil
> `admin` est actif. **Avant** de mettre à jour, ajoutez `COMPOSE_PROFILES=admin` dans `.env` (Portainer : dans les
> « Environment variables » de la stack), sinon la console disparaît (le jeu, lui, continue). Sous Portainer, vérifiez
> d'abord sa version : il faut **Portainer 2.29 ou plus récent** (de 2.24 à 2.28, un service à profil n'est jamais déployé).
> Rien d'autre ne change pour la partie principale.

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
| `COMPOSE_PROFILES` | `admin` pour lancer l'interface d'administration (conteneur `admin`) ; absent ou vide : le jeu seul. Une seule valeur, sans virgule. À laisser vide sur une partie supplémentaire rattachée à une console ailleurs |
| `POLITIGO_ADMIN_PASSWORD` | interface d'administration : mot de passe, 12 caractères minimum. **Vide** : un mot de passe est généré au premier démarrage et affiché **une seule fois** dans les logs du conteneur `admin` (seule son empreinte est gardée, dans le volume `politigo-admin-data`) |
| `POLITIGO_ADMIN_BIND` / `POLITIGO_ADMIN_PORT` | adresse et port de l'interface d'administration (`0.0.0.0` / `8090` par défaut, pour un usage sur le réseau local). Derrière Nginx Proxy Manager : `127.0.0.1` (ou filtrer le port 8090). La même adresse publie le port de liaison |
| `POLITIGO_ADMIN_PROXY_HOPS` | `0` en accès direct ; `1` derrière un reverse proxy (Nginx Proxy Manager…), pour que les limites de connexion voient la vraie adresse |
| `POLITIGO_ADMIN_COOKIE_SECURE` | `1` si l'interface d'administration est servie en HTTPS (sinon déduit de `X-Forwarded-Proto`) |
| `POLITIGO_ADMIN_LINK` | facultatif, stack de la console. `on` : ouvre l'écoute de liaison, pour rattacher d'autres parties à cette console (voir « Plusieurs parties ») ; absent ou autre valeur : fermée |
| `POLITIGO_ADMIN_LINK_PORT` | facultatif, stack de la console. Port de liaison publié sur l'hôte (`8091` par défaut ; dans le conteneur, toujours 8091) |
| `POLITIGO_ADMIN_LINK_BIND` | facultatif, stack de la console. Adresse du port de liaison, si elle doit différer de `POLITIGO_ADMIN_BIND` : par exemple console sur `127.0.0.1` derrière Nginx Proxy Manager, liaison sur l'IP interne de l'hôte (filtrée au pare-feu). Vide = `POLITIGO_ADMIN_BIND` |
| `POLITIGO_ADMIN_URL` / `POLITIGO_ADMIN_TLS` / `POLITIGO_ADMIN_TOKEN` | facultatifs, stack d'une partie supplémentaire. Les trois lignes données par la page Parties de la console (adresse `hôte:port`, empreinte du certificat, jeton `pgk_…`) : les trois ou aucune |
| `POLITIGO_ADMIN_SERVERS` | facultatif, ancien mode. Plusieurs parties sur ce même hôte Docker par leurs sockets : `"Prod=/run/politigo/admin.sock;Test=/run/politigo-test/admin.sock"` (voir l'annexe de « Plusieurs parties ») ; vide : cette pile seulement |

**Pare-feu** : n'autoriser le port 8080 qu'à l'adresse du reverse proxy. Attention, les ports publiés par Docker
contournent UFW et firewalld : la règle se pose dans la chaîne `DOCKER-USER` (à rendre persistante, par exemple avec `iptables-persistent`) :

```bash
sudo iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 8080 ! -s IP_DU_REVERSE_PROXY -j DROP
```

Sans ce filtrage, quelqu'un sur le réseau pourrait joindre la pile sans passer par le reverse proxy, en HTTP clair,
et inventer son adresse IP pour contourner les limites de tentatives.

Le port **8090** de l'interface d'administration (HTTP clair, ouvert sur `0.0.0.0` par défaut) se filtre de la même façon :
ne le laisser qu'au réseau local, ou le publier sur `127.0.0.1` (`POLITIGO_ADMIN_BIND=127.0.0.1`) s'il passe par le reverse proxy.

```bash
sudo iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 8090 ! -s 192.168.1.0/24 -j DROP   # votre réseau local
```

Le port de liaison **8091** (`POLITIGO_ADMIN_LINK_PORT`) est publié avec la console, sur la même adresse. Tant que
`POLITIGO_ADMIN_LINK` n'est pas à `on`, rien n'y répond ; une fois l'écoute ouverte, ne le laissez qu'aux machines des
parties supplémentaires (voir « Plusieurs parties »).

**IPv6** : les ports de `docker-compose.yml` sont publiés sur une adresse IPv4 (`POLITIGO_BIND`, `POLITIGO_ADMIN_BIND`) et
n'écoutent donc pas en IPv6. Si vous mettez `::` ou retirez l'adresse, ou si l'hôte a une adresse IPv6 publique, vérifiez avec
`sudo ss -ltn` et posez les mêmes règles avec `ip6tables` (chaîne `DOCKER-USER`, adresses IPv6 du reverse proxy et du réseau local).

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
   | `COMPOSE_PROFILES` | `admin` pour avoir l'interface d'administration (une seule valeur, sans virgule) ; absent : le jeu seul |
   | `POLITIGO_ADMIN_PASSWORD`, `POLITIGO_ADMIN_BIND`, `POLITIGO_ADMIN_PORT`, `POLITIGO_ADMIN_PROXY_HOPS`, `POLITIGO_ADMIN_COOKIE_SECURE`, `POLITIGO_ADMIN_LINK`, `POLITIGO_ADMIN_LINK_PORT`, `POLITIGO_ADMIN_SERVERS` | interface d'administration (service `admin`, lancé seulement avec `COMPOSE_PROFILES=admin`) |
   | `POLITIGO_ADMIN_URL`, `POLITIGO_ADMIN_TLS`, `POLITIGO_ADMIN_TOKEN` | seulement sur la stack d'une partie supplémentaire (voir « Plusieurs parties ») |

   `COMPOSE_PROFILES` demande **Portainer 2.29 ou plus récent** (de 2.24 à 2.28, les services à profil ne sont pas
   déployés), sur un environnement Docker *standalone* : les stacks Swarm ne connaissent pas les profils et ne sont pas
   prises en charge. Une seule valeur, `admin`, sans virgule (plusieurs profils séparés par des virgules ne marchent pas
   dans Portainer). Retirer la variable n'arrête pas un conteneur `admin` déjà lancé : arrêtez-le ou supprimez-le à la main
   (Containers).
4. **Mise à jour** : dans la stack, « Update the stack » en cochant « Re-pull image ». Le volume (les parties) est conservé.
   Vers 1.7.3 depuis une version antérieure : ajoutez d'abord `COMPOSE_PROFILES=admin` (voir l'encadré en haut de page).
   Portainer préfixe les volumes du nom de la stack : `<stack>_politigo-data` (à sauvegarder), `<stack>_politigo-admin-sock`
   (le socket d'administration, rien à sauvegarder) et `<stack>_politigo-admin-data` (l'empreinte du mot de passe d'administration, les modérateurs, le certificat de liaison, les parties liées et les sauvegardes automatiques).

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
- **Mise à jour** : `docker compose build && docker compose up -d` (vers 1.7.3 : d'abord `COMPOSE_PROFILES=admin` dans `.env`,
  voir l'encadré en haut de page). Les images de base (nginx, Node) sont épinglées par empreinte
  (digest) dans les Dockerfile : `--pull` n'y change rien. Les correctifs de sécurité de nginx et de Node arrivent avec une nouvelle
  version de PolitiGo (Dependabot propose chaque semaine la nouvelle empreinte) : mettez à jour le dépôt (`git pull`), puis
  reconstruisez. Les parties sont conservées. Pendant un arrêt, même de plusieurs jours, rien ne se joue : au redémarrage, chaque partie
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
`POLITIGO_ADMIN_PASSWORD` (ou celui affiché une fois dans les logs du conteneur `admin`). Lancée avec le profil `admin`
(`COMPOSE_PROFILES=admin`, déjà dans `.env.example`) ; sans ce profil, pas de conteneur `admin`, et le jeu n'en dépend pas.
Une seule console peut gérer plusieurs parties, sur cette machine ou ailleurs (voir « Plusieurs parties »).

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
- **Sauvegardes automatiques** (panneau Sauvegarde, organisateur seul) : quotidienne, hebdomadaire le lundi et mensuelle le 1er,
  à 4 h par défaut (heure du conteneur), 7, 4 et 12 gardées, dans `/data-admin/backups/<partie>/` (volume `politigo-admin-data` ; pour une partie rattachée par la liaison, le
  dossier porte son identifiant, `/data-admin/backups/p-xxxxxxxx/`),
  avec une copie de `vapid.json`. Le bouton « Sauvegarder maintenant » en garde 5 de plus. Une sauvegarde manquée pendant un
  arrêt est prise au redémarrage. Un échec s'affiche dans le panneau et dans À traiter jusqu'à la prochaine réussite. `chat-media/`
  n'est pas inclus. Ces fichiers restent sur le même hôte que le jeu : gardez-en une copie ailleurs.
  **Restaurer** (exemple pour la pile `politigo` à une seule partie, dossier `jeu` ; avec `POLITIGO_ADMIN_SERVERS`, le dossier
  porte le nom de la partie, par exemple `prod` ; pour une partie liée, copiez d'abord le fichier sur sa machine, puis
  faites la même chose dans sa stack, avec `-v "$PWD":/a:ro` à la place du volume admin). Les fichiers appartiennent à l'utilisateur `node` de l'API, qui n'existe pas dans
  `alpine` : on donne son numéro, `1000:1000`. `vapid.json` doit être remis avec les mêmes droits que la base, sinon l'API démarre
  avec une clé temporaire (une seule ligne `EACCES` dans ses logs) et les téléphones abonnés ne reçoivent plus rien.

  ```bash
  docker compose stop api
  docker run --rm -v politigo_politigo-admin-data:/a:ro alpine ls -l /a/backups/jeu    # choisir le fichier
  docker run --rm -v politigo_politigo-admin-data:/a:ro -v politigo_politigo-data:/d alpine sh -ec '
    cp /a/backups/jeu/quotidienne-2026-11-08-0400.db /d/politigo.db
    rm -f /d/politigo.db-wal /d/politigo.db-shm
    cp /a/backups/jeu/vapid.json /d/vapid.json
    chown 1000:1000 /d/politigo.db /d/vapid.json && chmod 600 /d/politigo.db /d/vapid.json
    ls -ln /d'
  docker compose start api
  ```

  Pour un fichier téléchargé depuis la page, montez son dossier à la place du volume admin (`-v "$PWD":/a:ro`) et adaptez les
  noms. `ls -ln` doit montrer `1000 1000` et `-rw-------` pour les deux fichiers. Après la restauration :
  - **Code d'invitation** : la base restaurée remet le code d'invitation de ce jour-là. Si vous l'aviez régénéré depuis (après
    une fuite), régénérez-le de nouveau (Réglages) ou fermez les inscriptions.
  - **`chat-media/`** : laissez le dossier tel quel. Au démarrage, l'API efface les images qui ne correspondent à aucun message
    de la base restaurée ; une image d'un message restauré déjà effacée s'affiche comme indisponible.
  - **Modérateurs** : un compte de joueur créé après la sauvegarde a disparu, et son numéro peut être redonné à un nouvel
    inscrit. La console ne donne alors plus aucun droit au modérateur concerné sur cette partie (son compte n'existe plus ou
    porte un autre pseudo) et le signale sur la page Modérateurs : retirez-le, puis ajoutez-le de nouveau.
- **Comptes (fiche joueur, « Zone sensible »)** : *Supprimer le compte* est définitif. Il faut retaper le pseudo, le Bâton
  retourne dans l'urne, les duels du Bâton ouverts sont annulés et le pseudo reste bloqué 24 h. Le droit « Supprimer un joueur »
  n'est dans aucun modèle : cochez-le pour chaque modérateur concerné. Un modérateur ne peut supprimer ni son compte ni celui
  d'un autre modérateur, et l'organisateur non plus tant que ce compte est celui d'un modérateur : retirez d'abord le
  modérateur (page Modérateurs). *Protéger le compte* est réservé à l'organisateur : aucun modérateur ne peut plus agir sur ce compte
  (mot de passe, renommage, suspension, chat, duels, annonce ciblée, suppression), mais il peut toujours lire sa fiche.
  **Protégez votre propre compte de joueur.** Retirez la protection avant de supprimer.
- **Comptes abandonnés (Joueurs → Comptes abandonnés)** : un compte y apparaît après 3 morts d'affilée sans aucune action du
  joueur et 5 jours sans connexion. Une seule alerte dans À traiter ; vue à N comptes, elle ne revient que s'il y en a plus.
  *Ignorer* retire le compte de la liste jusqu'à son retour. Les comptes protégés et les joueurs en ligne n'y figurent pas.
  Rien n'est supprimé automatiquement. La date de dernière connexion n'existait pas avant la 1.7.1 : les comptes existants
  partent du premier démarrage de cette version, donc rien n'apparaît avant 5 jours.
- **Détection de bots** : sur 14 jours, pour chaque joueur, ses résultats aux mini-jeux (part des parties au bonus maximum,
  régularité suspecte des scores, parties finies au plus tôt permis, signalements du serveur), puis ses actions heure par heure,
  la part faite sans le jeu ouvert, depuis autre chose qu'un navigateur et la nuit, résumés en un score et des raisons, et
  le détail de ce qu'il a fait (missions, tirages, courrier…) avec la part hors navigateur.
  **Duels suspects** : paires de comptes créés ensemble qui se défient, rafales de comptes différents à quelques secondes
  d'intervalle, même perdant face au même gagnant, et joueur qui bat l'un après l'autre plusieurs rivaux qui ne jouent
  presque pas (une ferme de comptes). Chaque tour de duel compte aussi dans la détection de bots. Un duel terminé peut être **annulé** : XP, niveau, moral et énergie des deux
  joueurs reviennent à leur valeur d'avant le duel. Aucune adresse IP n'est enregistrée.
- **À traiter** : sur toutes les parties, vérifiées toutes les 20 s, les messages signalés du chat, les duels signalés par
  l'anti-triche, les joueurs au score de bot de 50/100 ou plus et les groupes de duels suspects. Le nombre s'affiche dans
  le menu et dans le titre de l'onglet, un son marque chaque nouvelle alerte, et une notification système s'affiche quand
  la console est en arrière-plan. Cette notification n'est possible qu'en HTTPS (Nginx Proxy Manager) ou sur `localhost` :
  les navigateurs la refusent en `http://IP-du-LAN`. « Vu » range une alerte pendant 30 jours, pour toutes les consoles.
  L'organisateur y voit aussi les alertes « Liaison » : le jeton d'une partie présenté par une autre machine.
- **Journal d'admin** : chaque action d'administration (web, ligne de commande, annonce planifiée), sans mot de passe,
  signée du nom du modérateur quand c'est lui qui agit.
- **Modérateurs** (organisateur seulement) : choisis parmi les joueurs d'une partie, avec un profil prêt à l'emploi
  (« Modo chat », « Modo complet ») ou des cases à cocher : les panneaux qu'ils voient, les actions permises et les
  parties où ils agissent. Un mot de passe de 20 octets aléatoires en base64 (`openssl rand -base64 20`) est généré et
  affiché une seule fois. Le modérateur se connecte avec son pseudo de joueur et ce mot de passe. Les droits sont vérifiés
  par le conteneur admin à chaque commande, et la partie refuse toute action sur son propre compte (il ne voit pas
  non plus les alertes et signalements qui le concernent). Changer ses droits, régénérer son mot de passe ou le retirer
  ferme ses sessions aussitôt. Restent à l'organisateur : Réglages, Sauvegarde, régénération du code d'invitation et
  gestion des modérateurs et des parties (page Parties) ; le code d'invitation n'est visible que si la case est cochée. Les modérateurs sont gardés
  dans le volume `/data-admin` (`moderators.json`, empreintes scrypt seulement). Leur création, leurs changements de droits,
  un nouveau mot de passe (jamais le mot de passe lui-même) et leur retrait s'inscrivent dans le Journal d'admin.
  Les droits d'un modérateur sur une partie tiennent à son compte de joueur là-bas : si ce compte n'existe plus, ou porte
  un autre pseudo que celui connu de la console (renommé ailleurs que dans la console, base restaurée), il n'a plus aucun
  droit sur cette partie, et la page Modérateurs le signale. Un renommage depuis la console suit : il se connecte alors avec
  son nouveau pseudo. Un modérateur fait au plus 30 actions par minute (au-delà : « Trop d'actions d'affilée ») et garde
  5 sessions ouvertes au plus (l'organisateur : 20), la plus ancienne fermée d'abord : ses connexions ne ferment jamais
  celles des autres.

**Sécurité** : mot de passe haché (scrypt), session de 12 h en cookie `HttpOnly` `SameSite=Strict`, 5 essais ratés par
adresse et 30 au total par quart d'heure (sous attaque, cela peut aussi te bloquer 15 min), protection CSRF, CSP stricte.
L'interface ne parle qu'au socket et aux parties liées, avec une liste fermée de commandes. Elle n'a pas de filtre d'adresses :
à garder sur le réseau local, ou derrière Nginx Proxy Manager en HTTPS (`POLITIGO_ADMIN_BIND=127.0.0.1` et `POLITIGO_ADMIN_PROXY_HOPS=1`).

### Plusieurs parties dans une seule console (liaison)

Une console gère sa partie principale (celle de sa stack, par le socket local, comme toujours) et jusqu'à 20 parties
supplémentaires : une autre stack sur la même machine (une partie de test, par exemple) ou une stack sur une autre machine.
C'est l'API de chaque partie supplémentaire qui se connecte au **port de liaison** de la console ; aucune API n'ouvre de port.
Tout se règle par variables d'environnement, avec le même compose pour toutes les stacks (le workflow GitOps de Portainer
ne change pas). Il faut PolitiGo **1.7.3 ou plus récent** des deux côtés : une partie plus ancienne ignore ces variables, et
une partie trop ancienne qui se présente est refusée (la page Parties affiche sa version).

L'interface ouvre alors sur une vue d'ensemble (une carte par partie), le sélecteur en haut change de partie, chaque
confirmation nomme la partie visée, et À traiter, les modérateurs et les sauvegardes automatiques couvrent toutes les parties.

**Pas à pas avec Portainer**

1. **Ouvrir l'écoute** (stack de la console, une fois) : dans ses « Environment variables », `COMPOSE_PROFILES=admin` est déjà
   là ; ajouter `POLITIGO_ADMIN_LINK=on` (et `POLITIGO_ADMIN_LINK_PORT` si 8091 est pris), garder sa valeur de
   `POLITIGO_ADMIN_BIND`, puis « Update the stack ». Au démarrage, la console crée son certificat (dans `/data-admin/link/`),
   et la page **Parties** (propriétaire seul, en bas du menu) affiche l'adresse à joindre, l'empreinte du certificat et le
   bouton « Ajouter une partie ».
2. **Ajouter une partie** : lui donner un nom indicatif. La console affiche **une seule fois** trois lignes, chacune avec
   Copier, plus « Copier les trois lignes » :

   ```
   POLITIGO_ADMIN_URL=192.168.1.20:8091
   POLITIGO_ADMIN_TLS=AB:CD:…:EF
   POLITIGO_ADMIN_TOKEN=pgk_…
   ```

3. **Coller les trois lignes** dans la stack de la partie : Portainer → Stacks → la stack → Environment variables →
   Advanced mode, à la suite des autres. Sur cette stack, **pas** de `COMPOSE_PROFILES` (elle n'a pas besoin de sa propre
   console) ; son nom dans la console est son `POLITIGO_SERVER_NAME`.
4. **Update the stack**. La partie se connecte toute seule en quelques secondes et sa carte passe « en ligne ». Elle se
   reconnecte d'elle-même après un redémarrage ou une coupure, de part et d'autre.

Sans Portainer, c'est la même chose dans les `.env` : `POLITIGO_ADMIN_LINK=on` côté console, les trois lignes côté partie,
puis `docker compose up -d` dans chaque dossier.

**Adresse à donner** : `POLITIGO_ADMIN_URL` est l'adresse où la machine de la partie joint le port de liaison de la console.
Si `POLITIGO_ADMIN_BIND` est une IP précise, la console l'affiche telle quelle. S'il vaut `0.0.0.0` (le défaut), elle ne
peut pas deviner son adresse et affiche « <IP de cette machine>:8091 » : remplacez par l'IP de l'hôte de la console vue
depuis la partie (`hostname -I` sur cet hôte pour le réseau local), ou son nom DNS. Même pour une stack voisine sur le même
hôte, utilisez l'IP de l'hôte, jamais `127.0.0.1` (dans un conteneur, c'est le conteneur lui-même). Par Internet, ouvrez ou
redirigez ce port vers l'hôte de la console. Si `POLITIGO_ADMIN_BIND=127.0.0.1` (console derrière Nginx Proxy Manager), le
port de liaison n'est joignable par aucune partie : mettez plutôt l'IP interne de l'hôte et filtrez le port 8090 au pare-feu
pour ne le laisser qu'au reverse proxy.

**Pare-feu** : le port de liaison (8091 par défaut) ne doit être ouvert qu'aux machines des parties, dans la chaîne
`DOCKER-USER` comme les autres ports (les ports publiés par Docker contournent UFW et firewalld) :

```bash
sudo iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 8091 ! -s IP_DE_LA_PARTIE -j DROP   # une règle par source autorisée, ou un réseau
```

En IPv6, mêmes règles avec `ip6tables` si l'hôte a une adresse IPv6 joignable (voir « IPv6 » plus haut). Si les parties
ont des adresses changeantes, un VPN entre les machines (WireGuard…) vaut mieux qu'un port ouvert à tout Internet.

**Renouveler ou retirer** (page Parties) :
- *Renouveler le jeton* : l'ancien cesse de marcher tout de suite et la partie est déconnectée. Seule la ligne
  `POLITIGO_ADMIN_TOKEN` change : la remplacer dans la stack de la partie, puis « Update the stack ». À faire si le jeton a
  fuité, ou si la partie a été réinstallée avec un volume neuf (elle se présente alors comme une autre machine).
- *Retirer la partie* : la console l'oublie et son jeton cesse de marcher ; les modérateurs perdent l'accès à cette partie,
  ses sauvegardes déjà faites restent. La partie elle-même continue de tourner : retirez aussi les trois variables de sa stack.

**En cas de souci**, regardez les logs du conteneur `api` de la partie (lignes `[admin-link]`) et la carte de la partie :
- « empreinte du certificat différente » dans les logs de la partie : recopiez `POLITIGO_ADMIN_TLS` depuis le bloc
  « Écoute des parties » de la page Parties (la console, elle, ne voit rien arriver) ;
- connexion refusée ou délai dépassé : adresse, port publié, pare-feu ;
- jeton refusé : il a été renouvelé ou la partie retirée ; une ou deux variables seulement sur trois : erreur claire dans les
  logs, pas de liaison. Dans tous les cas le jeu de la partie continue de tourner normalement.

**Sécurité de la liaison** :
- **Chiffrée** (TLS 1.3) avec un certificat auto-signé de la console, épinglé : chaque partie vérifie l'empreinte
  `POLITIGO_ADMIN_TLS` **avant** d'envoyer le moindre octet, si bien qu'un intermédiaire ne peut ni lire ni se faire passer
  pour la console. La clé reste dans le volume de la console (`/data-admin/link/`).
- **Un jeton par partie**, lié à la première machine qui s'en sert (identifiant gardé dans `/data/admin-link-id` de la
  partie). Une autre machine qui l'essaie ensuite est refusée, et la console lève une alerte « Liaison » dans À traiter avec
  un badge sur la carte. Pas de bouton pour l'autoriser : si c'est une copie de la stack, donnez-lui son propre jeton
  (« Ajouter une partie ») ; si le jeton a fuité, renouvelez-le.
- **Jamais en clair** côté console : elle ne garde que l'empreinte SHA-256 du jeton, ne l'écrit pas dans les logs ni dans le
  journal ; il n'existe en clair que dans les variables de la stack de la partie, à protéger comme un mot de passe.
- La partie n'exécute que la liste fermée de commandes du socket, avec les mêmes droits par modérateur. Limites côté console :
  20 parties, 10 connexions non authentifiées à la fois (3 par adresse), 10 échecs par adresse et par quart d'heure.
- Les ajouts, renouvellements et retraits s'inscrivent dans le journal d'admin de la partie principale (sans le jeton).

**Sauvegardes des parties liées** : les sauvegardes automatiques et « Sauvegarder maintenant » marchent pour chaque partie
liée, comme pour la partie principale. La partie fait sa copie cohérente et l'envoie par la liaison ; la console la vérifie
et la range dans son propre volume, `/data-admin/backups/<id>/` (l'identifiant `p-xxxxxxxx` de la partie, affiché sur sa
carte). Un échec (partie injoignable, liaison coupée) s'affiche sur la carte, dans le panneau Sauvegarde et dans À traiter.

**Annexe : ancien mode, plusieurs sockets sur le même hôte.** Toujours pris en charge, mais la liaison le remplace avantageusement.
Monter le volume du socket de l'autre pile dans le conteneur `admin` (volume externe `<autre-stack>_politigo-admin-sock`, exemple
commenté dans le compose), puis `POLITIGO_ADMIN_SERVERS="Prod=/run/politigo/admin.sock;Test=/run/politigo-test/admin.sock"`.
Ce mode ne marche que sur une seule machine : le socket ne passe jamais par le réseau.

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

### Événements (panneau Events)

Le panneau **Events** de l'administration crée et gère des événements à durée limitée, sur chaque partie : **Double XP**
(×1,5, ×2 ou ×3, tous les mini-jeux ou certains), **Missions libres** (+3, +6 ou sans limite), **Mission express** (durée ÷2 ou
÷3), **Pluie de bulletins** (×2 ou ×3, plafond du jour compris), **Tirage du peuple** (1 à 3 tirages offerts, une fois par
événement), **Soldes à la Buvette** (−25 % ou −50 %, Soins compris), **Sac postal** (une lettre de plus toutes les 10 ou 15 minutes, et jusqu'à 6 bulletins du courrier dans la journée),
**Nuit des duels** (défis en plus, gains ×1,5 ou ×2) et **Immunité parlementaire** (jauges ÷2 ou ÷3, pas de mort politique).

- **Programmation** : de 5 minutes à 7 jours (une durée de la liste, ou « Jusqu'à une date précise… » pour choisir la date et
  l'heure de fin ; lancé tout de suite, il s'arrête alors à cette date), pour tous ou un seul camp, une fois, chaque jour ou chaque semaine (à la même
  heure, changement d'heure compris). Un événement se lance tout de suite ou à sa date, se modifie ou se supprime tant qu'il
  n'a pas commencé, s'arrête à tout moment et se duplique. Arrêter une occurrence ne supprime pas les suivantes : la prochaine
  se supprime dans « À venir ». 100 événements à venir au plus.
- **Annonces** : bandeau permanent chez les joueurs, avec son propre message. Le bloc Annonces règle l'annonce du début et les
  rappels (15 minutes, 1 heure, 1 jour, cumulables), envoyés aux écrans ouverts, en notification et au fil si l'événement vise
  tout le monde. Le texte part d'un modèle par type ; `{nom}`, `{fin}`, `{debut}`, `{delai}` et `{resume}` sont remplacés à
  l'envoi, à l'heure du serveur. Si plusieurs rappels sont déjà dépassés à la programmation, un seul part, avec la durée réelle
  restante. Corriger un événement ne renvoie aucun rappel déjà parti ; déplacer son début les remet à zéro, à un rappel toutes
  les 5 minutes au plus. Sur une série quotidienne, le rappel 1 jour ne part que pour la première édition. Un événement qui
  s'est déroulé serveur arrêté reste silencieux.
- **Règles** : le serveur applique les effets. Deux événements du même type ne s'additionnent pas, le plus fort s'applique ;
  deux types différents se cumulent. Une partie ou une mission lancée pendant l'événement garde son bonus. Aucun événement ne
  modifie les points de Flamme, les chances de l'urne ni rien en argent réel, et les tirages offerts ne donnent jamais le Bâton.
  L'Immunité parlementaire aide toutefois à garder les jauges à 50, un critère de la Flamme.
- **Droits** : le profil **Modo événements** ouvre les panneaux Events et Annonces, avec les droits de créer et modifier, lancer
  et arrêter, supprimer et d'envoyer des annonces. Chaque droit se coche aussi séparément pour un autre modérateur. Tout est
  écrit dans le journal d'admin, au nom de son auteur.

### Activités, Flamme, Tombola et Garde-robe

- **Missions, courrier, objectifs du jour** : effets sur les jauges (satiété, moral, énergie, hygiène, bornées à 0-100),
  **jamais de FM** ; seules les missions donnent de l'XP. Missions : une à la fois, 6 par jour, énergie 15 au moins, la nuit
  seulement de 20 h à minuit (heure du jeu). Récompense selon la durée, réussite ou non : jusqu'à 1 h, +10 XP et 1 bulletin ;
  moins de 4 h, +20 XP et 2 bulletins ; à partir de 4 h, +30 XP et 3 bulletins. L'XP tombe à chaque rapport ; les bulletins
  d'une même mission une fois par jour, 6 par jour au plus pour toutes les missions. Une notification « Mission terminée » part au retour (différée pendant un mini-jeu). Courrier :
  une lettre environ toutes les 45 minutes, de 7 h à 23 h, qu'on ait répondu ou non, 3 au plus dans la boîte ; 2 bulletins par jour au plus. Objectifs : 3 par jour, tirés au premier passage de la journée ;
  une mort politique ne les retire pas, et ne redonne ni missions ni bulletins.
- **Flamme** : 15 points par jour au plus (jauges toutes ≥ 50 toute la journée +4, les 3 objectifs +4, au moins 4 visites
  étalées sur 8 h +3, 2 missions +2, 3 lettres +2) ; ×0,9 par journée sans visite, ×0,75 à une mort politique.
- **Tombola (gauche) / Loterie (droite)**, purement cosmétique, **jamais d'argent réel** : un tirage gratuit par jour,
  puis un bulletin par tirage ; bulletins gagnés uniquement en jouant (de 1 à 3 par mission, au plus 6 par jour ; +1 par
  objectif, 3 par jour ; +1 toutes les 3 lettres, 2 par jour au plus). Chances : commun 60 %, rare 28 %, épique 9,5 %, légendaire 2 %, ultra
  rare 0,5 % ; tirages garantis : épique au 10ᵉ, légendaire au 50ᵉ, ultra rare au 80ᵉ. Doublons → confettis (5, 10, 25,
  50, 100 selon la rareté) ; une case au choix contre 100 confettis (commune), 200 (rare) ou 300 (épique). La fiche d'un joueur dans
  l'administration montre sa Flamme, ses bulletins, ses confettis, ce qu'il possède et ce qu'il porte.

<details>
<summary><b>⚠️ Divulgâchage, réservé à l'organisateur :</b> l'objet mythique de la Tombola et son duel</summary>

- **Le Bâton de feu des Apprix** : un seul exemplaire par partie, pour les deux camps, rareté « Mythique ». Il n'apparaît
  nulle part (ni Garde-robe, ni nouveautés, ni README) tant que personne ne l'a gagné. Pour avoir une chance à chaque
  tirage : compte de 21 jours, Flamme ≥ 300, aucun soupçon de bot (score sous 50, au plus 20 % d'actions hors navigateur) ni duel signalé sur 14 jours ; alors 1 % par tirage,
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
  réponses : le navigateur ne connaît jamais le tirage, une réponse en moins de 0,6 s n'est pas comptée, un débat s'arrête
  à 30 bonnes réponses, à score égal le moins d'erreurs l'emporte, et un tour anormal (zéro erreur, rythme de machine, réflexes plus rapides qu'un humain) est signalé dans l'administration. Limites : niveau 5
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
  et par pseudo, si bien qu'un inconnu ne peut pas bloquer le compte d'un ami ; 4 inscriptions réussies et 5 codes d'invitation faux par heure et par adresse (les fautes de saisie ne comptent pas) ;
  un pseudo supprimé ne peut être repris qu'après 24 h ; 5 essais de suppression de compte par quart d'heure ; 3 flux en direct
  par joueur et 12 par adresse ; une démission par heure. Les vérifications de mot de passe passent par une file d'attente
  bornée (4 à la fois, une par adresse) : une rafale de tentatives ralentit, mais ne bloque plus les vraies connexions.
  nginx limite en plus le débit des requêtes et le nombre de flux ouverts par adresse (limites larges, car le reverse proxy
  partage une même adresse pour tous les joueurs).
- **Administration** : aucune route web dans l'API. `admin.mjs` et le conteneur `admin` passent par un socket Unix
  (`/run/politigo/admin.sock` dans le volume partagé `politigo-admin-sock`, mode 0600, utilisateur `node`) : il faut déjà pouvoir
  lancer une commande dans un de ces conteneurs, ou ouvrir l'interface avec son mot de passe, pour s'en servir.
  Le serveur fait lui-même le travail (hachage, révocation des sessions, effacement des compteurs), avec une requête bornée en taille
  et en durée. `POLITIGO_ADMIN_SOCKET=off` le désactive. Une partie supplémentaire liée à une console (« Plusieurs parties »)
  n'ouvre pas de port non plus : c'est son API qui se connecte à la console, en TLS avec empreinte épinglée et jeton, et elle
  n'exécute que les mêmes commandes que le socket.
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
bash tests/run-server.sh                       # 633 tests : règles (dont l'équilibrage J15) + mini-jeux + activités + Tombola et Garde-robe + test politique + changelog + API + duels + notifications + chat + migrations + outils et interface d'admin, dans l'image Node de production
bash tests/run-server.sh tests/chat.test.mjs   # un seul fichier
docker compose restart api                     # remet à zéro les limites d'inscription avant l'e2e
powershell -ExecutionPolicy Bypass -File tests\e2e.ps1   # parcours complet dans Chrome (crée deux joueurs de test)
```

## 7. Captures et sources du README

```bash
# Captures d'écran (docs/images/*.png) : pile locale VIDE et lancée, en journée (heure de Paris), sans événement saisonnier et chat ouvert (POLITIGO_CHAT=on)
powershell -ExecutionPolicy Bypass -File tools\screenshots.ps1 -AdminUrl http://localhost:8090/ -AdminPassword <mot de passe admin>
# Sans toucher à sa pile locale : une pile jetable à part (PowerShell), puis docker compose -p politigo-shots down -v
#   $env:COMPOSE_PROJECT_NAME="politigo-shots"; $env:POLITIGO_PORT="8081"; $env:COMPOSE_PROFILES="admin"; $env:POLITIGO_ADMIN_PORT="8092"; $env:POLITIGO_ADMIN_LINK_PORT="8093"; $env:POLITIGO_EVENT="off"; $env:POLITIGO_CHAT="on"
#   docker compose up -d --build, puis le script avec -Url http://localhost:8081/ -AdminUrl http://localhost:8092/
# Page des sources (docs/SOURCES.md), à régénérer après toute modification d'un personnage ou d'une casserole
docker run --rm -v "$PWD:/w" -w /w node:24-alpine node tools/make-sources.mjs
```

Le script de captures crée cinq joueurs de démonstration, puis les supprime. Leur Garde-robe ne contient que la première
pièce de chaque rareté (rien d'autre ne doit apparaître dans le README) ; la capture d'un tirage, tiré au hasard, n'est
gardée que s'il donne une de ces pièces, sinon l'ancienne image reste. Il refuse de tourner sur une base qui contient
déjà des joueurs (`-Force` seulement sur une pile jetable) : ne jamais le lancer sur le serveur de production.
