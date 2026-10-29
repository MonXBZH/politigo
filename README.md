# PolitiGo — déploiement

Tamagotchi satirique multijoueur : un site statique (nginx) et une API de jeu (Node 24, SQLite), dans deux conteneurs.
Le serveur fait foi : il détient les parties, fait tourner l'horloge et vérifie chaque action.

```
Internet ─HTTPS─> reverse proxy (TLS, domaine) ─HTTP─> web:8080 (nginx) ─┬─ fichiers du jeu
                                                                          ├─ /api/*  ─> api:3000 (Node)
                                                                          └─ /events ─> api:3000 (flux temps réel)
                                                                                           └─ volume SQLite
```

## 1. Sur le serveur Docker

```bash
cp .env.example .env      # puis éditer .env
docker compose up -d --build
```

À régler dans `.env` :

| Variable | Valeur en production |
|---|---|
| `POLITIGO_INVITE` | un code d'au moins 16 caractères, à donner aux amis ; le changer ferme les inscriptions (le serveur refuse de démarrer avec un code court ou celui de l'exemple) |
| `MAX_PLAYERS` | `50` : nombre maximum de comptes |
| `POLITIGO_BIND` | l'IP interne du serveur Docker (le reverse proxy est sur une autre machine) |
| `POLITIGO_PORT` | `8080` |
| `COOKIE_SECURE` | `1` (cookies de session HTTPS uniquement) |
| `PROXY_HOPS` | `2` (le reverse proxy + le nginx de la pile) |
| `POLITIGO_SPEED` | `1` (temps réel ; plus grand uniquement sur un serveur de test) |

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
   `.github/workflows/images.yml` lance les tests puis publie `ghcr.io/<compte>/politigo-web` et `politigo-api`
   (tags `latest`, `sha-xxxxxxx`, et `1.2.0` pour un tag git `v1.2.0`), pour amd64 et arm64.
2. Si le dépôt est privé, les images le sont aussi : créer un jeton GitHub avec le droit `read:packages`, puis dans
   Portainer → Registries → Add registry → Custom : URL `ghcr.io`, identifiant GitHub, le jeton comme mot de passe.
3. Portainer → Stacks → Add stack → Web editor : coller `docker-compose.portainer.yml`, puis dans
   « Environment variables » :

   | Variable | Valeur |
   |---|---|
   | `POLITIGO_IMAGES` | `ghcr.io/<compte>/politigo` |
   | `POLITIGO_TAG` | `latest`, ou une version figée (`1.2.0`, `sha-xxxxxxx`) pour maîtriser les mises à jour |
   | `POLITIGO_INVITE`, `POLITIGO_BIND`, `POLITIGO_PORT`, `COOKIE_SECURE`, `PROXY_HOPS`, `MAX_PLAYERS` | comme dans le tableau ci-dessus |

4. **Mise à jour** : dans la stack, « Update the stack » en cochant « Re-pull image ». Le volume (les parties) est conservé.
   Portainer préfixe le volume du nom de la stack : `<stack>_politigo-data`, à sauvegarder.

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

## 3. Exploitation

- **Sauvegarde** : le volume `politigo_politigo-data` contient `politigo.db` (comptes, parties, fil). Exemple :
  `docker run --rm -v politigo_politigo-data:/d -v "$PWD":/b alpine tar czf /b/politigo-$(date +%F).tgz -C /d .`
- **Mise à jour** : `docker compose build --pull && docker compose up -d` (récupère aussi les correctifs de sécurité de nginx et Node). Les parties sont conservées ; pendant un arrêt, l'horloge est gelée (personne ne meurt parce que le serveur était éteint).
- **Logs** : `docker compose logs -f api`.
- **Fermer les inscriptions** : changer `POLITIGO_INVITE` puis `docker compose up -d`.

## 4. Sécurité en bref

- **Comptes** : mots de passe hachés (scrypt, sans bloquer le serveur), code d'invitation exigé (16 caractères minimum), nombre de comptes plafonné.
  Pseudos en alphabet latin uniquement, et unicité sans tenir compte des majuscules ni des accents : personne ne peut se faire passer pour un autre avec un « о » cyrillique.
- **Sessions** : cookie `__Host-` `HttpOnly` + `SameSite=Lax` + `Secure`, 10 appareils au plus par joueur, supprimées côté serveur à la déconnexion et à la suppression du compte.
- **Requêtes** : écritures refusées hors JSON et hors origine du site ; limitation des tentatives par adresse, par adresse et pseudo,
  et par pseudo, si bien qu'un inconnu ne peut pas bloquer le compte d'un ami ; 3 flux en direct par joueur ; une démission par heure.
- **Jeu** : le serveur fait foi ; score du mini-jeu vérifié (durée, cadence, pas de rejeu) ; états relus et bornés au démarrage.
- **Robustesse** : un joueur ou une connexion en erreur est ignoré sans arrêter le serveur.
- **Infrastructure** : CSP stricte sans `unsafe-inline`, aucune ressource externe, conteneurs non-root en lecture seule, sans capacités, avec
  mémoire, processus et logs plafonnés ; délais courts contre les connexions lentes. Seuls le pseudo et la partie sont stockés ;
  chaque joueur peut supprimer son compte depuis Dossier → Compte.

Avant d'ouvrir au groupe, vérifier les deux statuts judiciaires cités dans les dossiers (Marine Le Pen : appel ; Rachida Dati : procès).

## 5. Tests

```bash
bash tests/run-server.sh                       # règles (dont l'équilibrage J15) + API, dans l'image Node de production
docker compose restart api                     # remet à zéro les limites d'inscription avant l'e2e
powershell -File tests\e2e.ps1                 # parcours complet dans Chrome (crée deux joueurs de test)
```
