# Brocante : choix plus clair, annonces validées, ultra rares — conception courte (1.11.0)

**Pourquoi :** retours joueurs. Nicolas : on ne voit pas ses doubles dans la sélection, pas de filtres, la liste est pénible. Waxy : dire ce qu'on cherche sans que l'autre conclue l'échange directement. L'organisateur : ouvrir la Brocante aux ultra rares (épique et légendaire s'échangent déjà).

**Objectifs :**
1. Sélection d'objets (dépôt, offre) lisible : doubles visibles, filtres, tri.
2. Une annonce peut afficher ce qu'elle cherche tout en exigeant la validation de son auteur.
3. Les ultra rares s'échangent.

**Non-objectifs :** le mythique reste hors Brocante ; pas de filtre de rareté sur le tableau des annonces (les onglets actuels restent) ; pas de texte libre.
**Anti-objectifs :** qu'un échange fasse perdre une pièce (ultra reçu déjà possédé) ; qu'un ultra soit nommé dans le catalogue « Cherche » (surprise, comme les légendaires) ; qu'une annonce « je valide » se conclue sans l'auteur.

**Approches :** pour « je valide », A : une case sur l'annonce qui transforme « Troquer » en offres (retenue, l'offre peut contenir autre chose que ce qui est cherché, l'auteur refuse ce qui ne va pas) ; B : l'offre doit correspondre exactement à la demande (écartée : plus de règles, peu de gain).

**Décidé :**
- **Ultra :** `MARKET.excluded=["mythique"]`. Recevoir une pièce non cumulable (ultra) déjà possédée est refusé (même message que « déjà en 2 exemplaires », côté règles pures `applyTrade`/`dupes` et serveur) ; la carte et l'offre l'annoncent avant le tap. Le catalogue « Des objets précis » n'affiche jamais les ultra (ni les légendaires) ; on les demande par rareté (« une tenue Ultra rare »), qui apparaît dans la liste des raretés.
- **Je valide moi-même :** case au dépôt (modes « objets précis », « rareté », « bulletins » ; le mode « Une offre » l'est déjà). Champ `check:true` dans `want`, gardé par `cleanWant`. La carte affiche « Cherche … · l'auteur valide », pas de « Troquer », seulement « Faire une offre » ; le serveur refuse `take` sur une telle annonce (409). Les offres libres existantes servent telles quelles. « Pour moi » ne liste pas ces annonces.
- **Sélection d'objets (`mkPicker`, dépôt et offre) :** tri par rareté (de la plus rare) puis par nom ; badge ×2 ; filtres en boutons : « Tout / Tenues / Objets », une liste de rareté, « Doubles seulement » ; l'état des filtres vit le temps du flux.
- **Textes :** aide (section Brocante), changelog 1.11.0, règles en bas de la Brocante (« Certains objets très rares ne s'échangent pas » reste vrai). Aucun nom d'ultra ni le Bâton.
- **Version :** 1.11.0 (contenu joueur), entrée datée du jour, à ajuster à la sortie.

**Laissé au constructeur :** le style des filtres, le libellé exact de la case et du badge « l'auteur valide », la forme du message de refus.
