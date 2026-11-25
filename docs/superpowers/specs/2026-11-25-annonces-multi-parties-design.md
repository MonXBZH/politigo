# Annonces planifiées sur plusieurs parties — conception courte (1.10.1, console)

**Pourquoi :** l'organisateur recrée la même annonce planifiée dans chaque partie. Il veut la créer une fois et cocher les parties.

**Objectif :** dans le panneau Annonces de la console, au moment de « Planifier », choisir les parties où créer la planification.
**Non-objectifs :** pas de lien entre les copies (pause et suppression restent partie par partie) ; les annonces immédiates et les événements ne changent pas.
**Anti-objectif :** qu'un modérateur puisse planifier sur une partie qui ne lui est pas ouverte.

**Approches :** A, des copies indépendantes créées par la console (retenue par l'utilisateur) ; B, des copies liées par un identifiant partagé (pause et suppression relayées), écartée pour l'instant car plus lourde.

**Décidé :**
- Sous la cible, une liste de cases « Parties » (même motif que « Parties accessibles » des modérateurs), affichée seulement s'il y a plus d'une partie accessible. La partie courante est cochée par défaut ; une partie injoignable est décochée et désactivée.
- Si la cible est un joueur précis, la liste est masquée : seule la partie courante (le joueur n'existe que là).
- « Planifier » envoie le même `schedule-add` à chaque partie cochée, l'une après l'autre, via `srvCall(id,"schedule-add",b)`. Rien ne change côté parties ni côté serveur de la console (il refuse déjà une partie non ouverte au modérateur, 403).
- Retour : « Annonce planifiée sur N parties. » ; en cas d'échec partiel, un toast d'erreur nomme chaque partie en échec avec sa raison, les réussies restent créées.
- Version : outil admin seul → patch, dans l'entrée 1.10.1 encore non publiée (section `admin`).

**Laissé au constructeur :** le style des cases, le rafraîchissement du panneau après la création.
