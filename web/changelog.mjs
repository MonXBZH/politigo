// What's new, shown once to every player after an update (and on demand from Dossier → Compte).
// One entry per release, newest first, written in French for the players (added, changed, fixed, and admin: what the organiser can now do). Add the entry on dev before tagging:
// the version must match the tag without its "v" (tag v1.3.0 → "1.3.0"). help (optional): ids of web/help.mjs sections,
// offered as « En savoir plus » under the entry.
import {cmpRelease} from "./rules.mjs";

export const CHANGELOG=[
 {version:"1.7.4",date:"2026-11-13",
  added:[],
  fixed:[],
  admin:[
   "Events : la fin d'un événement se choisit aussi par date et heure (« Jusqu'à une date précise… »), comme le début ; une durée qui n'est pas dans la liste n'est plus arrondie quand on le modifie.","Fiche joueur : une carte « Offrir » donne des niveaux, des bulletins et des tenues ou objets de la garde-robe, avec un droit de modérateur à cocher à part."
  ]
 },
 {version:"1.7.3",date:"2026-11-11",
  added:[
   "Le jeu a ses premiers sons : certains moments rares ont maintenant leur bande-son, et un bouton 🔊 la coupe (le choix est retenu sur l'appareil)."
  ],
  fixed:[],
  admin:[
   "Une seule console pour plusieurs parties, même sur d'autres machines : la nouvelle page Parties en ajoute une et donne trois lignes à coller dans sa stack, puis la partie se connecte toute seule.",
   "La liaison est chiffrée et chaque partie a son propre jeton, lié à sa machine, à renouveler ou retirer à tout moment ; une alerte prévient si une autre machine l'essaie.",
   "Les sauvegardes automatiques, À traiter et les droits des modérateurs couvrent aussi les parties rattachées.",
   "La console parle de « parties » partout où elle disait « serveurs »."
  ]
 },
 {version:"1.7.1",date:"2026-11-08",help:["activites","regle"],
  added:[
   "La règle du jeu, dans l'aide et à l'inscription : PolitiGo se joue à la main, sans script, sans robot ni second compte. Les robots ne votent pas."
  ],
  changed:[
   "Le courrier devient une boîte aux lettres : une lettre arrive environ toutes les 45 minutes de 7 h à 23 h, que tu aies répondu ou non, et jusqu'à 3 t'attendent. Le courrier rapporte 2 bulletins par jour au plus, les jauges toujours.",
   "L'inscription ne bloque plus après quelques fautes de frappe : le formulaire signale le champ à corriger, et seuls les codes d'invitation faux comptent dans la limite."
  ],
  fixed:[
   "Un pseudo très long n'élargit plus la page : le fil, les classements, les duels et le chat restent dans l'écran, même sur un petit téléphone.",
   "Le nom n'apparaît plus deux fois sur les lignes de duel du fil.",
   "Après un rechargement en plein duel, le temps affiché est le temps qui reste vraiment.",
   "Quand un compte est supprimé, ses adversaires sont prévenus de l'annulation des duels en cours, et leurs défis et victoires du jour restent comptés.",
   "La fin d'une suspension n'est plus présentée comme une maintenance du serveur.",
   "Le bandeau du Tirage du peuple parle de l'urne de ton camp, à gauche comme à droite."
  ],
  admin:[
   "Supprimer un joueur depuis sa fiche : un droit à part, que l'organisation peut déléguer aux modérateurs.",
   "Protéger un compte : aucun modérateur ne peut plus agir dessus.",
   "Une alerte et une liste pour les comptes qui semblent abandonnés : 3 morts d'affilée sans jouer et 5 jours sans connexion. Rien n'est supprimé tout seul.",
   "Les annonces se préparent dans l'événement : texte modifiable avec un modèle préfait et un aperçu, et rappels 15 minutes, 1 heure ou 1 jour avant, cumulables.",
   "Des sauvegardes automatiques quotidiennes, hebdomadaires et mensuelles, réglables dans le panneau Sauvegarde, avec téléchargement, suppression et alerte en cas d'échec.",
   "La fiche et la liste des joueurs montrent la dernière visite de chacun (« Vu »).",
   "Un modérateur ne peut plus agir sur le compte d'un autre modérateur, ni lancer un événement sans le droit de lancer, et ses actions sont limitées à 30 par minute.",
   "Le journal regroupe les actions répétées (×N) et garde à part les actions sensibles, qu'une rafale ne peut plus effacer ; la gestion des modérateurs y apparaît aussi.",
   "Chaque compte de la console a ses propres sessions : un modérateur ne peut plus déconnecter l'organisation en se connectant trop souvent.",
   "Les séries d'événements gardent leur heure, même après « Lancer maintenant » ou un changement d'heure.",
   "Le rapport d'activité de la console est plus juste, avec moins de fausses alertes pour les joueurs très actifs."
  ]
 },
 {version:"1.7.0",date:"2026-11-06",help:["events"],
  added:[
   "Les événements : pendant quelques heures, l'organisation peut doubler l'XP, lever la limite de missions, raccourcir les missions, faire pleuvoir les bulletins, offrir des tirages, solder la Buvette, multiplier le courrier, lancer une nuit des duels ou protéger tout le monde d'une mort politique. Un bandeau en haut de l'écran annonce ce qui est en cours et le temps restant.",
   "10 nouvelles questions au Débat chrono et 10 nouvelles lettres d'électeurs.",
   "20 nouvelles tenues et 20 nouveaux objets à gagner à la Tombola et à la Loterie, avec les premières tenues légendaires."
  ],
  changed:["L'échange de confettis suit la rareté : 100 pour une case commune, 200 pour une rare, 300 pour une épique."],
  fixed:["La liste des adversaires n'est plus coupée à droite sur les petits écrans."],
  admin:[
   "Un panneau Events : créer, programmer, répéter, lancer, arrêter, modifier ou dupliquer un événement, pour tout le monde ou un seul camp, avec notification et rappel 15 minutes avant.",
   "Les modérateurs peuvent gérer les événements : un nouveau profil Modo événements, et des droits à cocher."
  ]
 },
 {version:"1.6.2",date:"2026-11-06",help:["activites","jeux","duels","flamme"],
  added:[
   "Quatre nouvelles missions : une tribune dans L'Humanité ou Le Figaro, une permanence, un repas de quartier ou un banquet du Rotary, l'université d'été ou le campus de rentrée.",
   "Les missions rapportent maintenant de l'XP à chaque rapport : +10, +20 ou +30 selon leur durée. La récompense s'affiche sur chaque mission.",
   "L'Épervier a enfin son soin : ramasse les rapports d'incident au sol pour retrouver une vie, comme la merguez de manif au Cortège.",
   "22 nouvelles questions au Débat chrono et 10 nouvelles lettres d'électeurs."
  ],
  changed:[
   "6 missions par jour au lieu de 4.",
   "Les bulletins suivent la durée : 1 jusqu'à 1 h, 2 jusqu'à 3 h, 3 à partir de 4 h. Une même mission donne ses bulletins une fois par jour, et les missions en donnent 6 par jour au plus. L'XP, elle, tombe à chaque rapport.",
   "Débat chrono : chaque bonne réponse ajoute 1,5 s au chrono, et la partie s'arrête à 30 bonnes réponses. Ça vaut aussi pour les duels, où le joueur qui a fait le moins d'erreurs l'emporte à score égal.",
   "L'XP des mini-jeux suit leur difficulté : le Pong rapporte 25 XP et 10 de bonus au plus, la Manif 35 XP et 35 de bonus au plus, le Débat chrono 2,5 XP par bonne réponse, 50 au plus.",
   "La Flamme grandit plus vite : jusqu'à 15 points par jour."
  ],
  fixed:[],
  admin:[
   "La fiche d'un joueur détaille ses actions sur 14 jours, avec la part faite hors navigateur."
  ]
 },
 {version:"1.6.1",date:"2026-11-01",help:["demarrer","flamme","duels"],
  added:[
   "La Flamme s'affiche maintenant sur l'écran principal, sous les quatre jauges : tu vois ton assiduité grandir sans ouvrir la Garde-robe.",
   "Une aide en jeu (Dossier → Aide) : les jauges, l'XP, les mini-jeux, les duels, les missions, la Flamme, la Tombola… Chaque fiche a son « ? » en haut, qui ouvre directement la bonne rubrique.",
   "L'historique des versions (Dossier → Compte) : toutes les nouveautés depuis la première version, la plus récente dépliée, les autres à un toucher. Et un « En savoir plus » renvoie vers l'aide."
  ],
  fixed:[
   "Duels : la liste des adversaires grise de nouveau ceux que tu ne peux pas défier, avec la raison à côté du pseudo, et un toucher sur un adversaire disponible lance le défi directement. La fiche d'un joueur s'ouvre toujours depuis le classement."
  ],
  admin:[]
 },
 {version:"1.6.0",date:"2026-11-01",help:["activites","flamme","tombola"],
  added:[
   "Des missions pour ton élu, entre deux visites : une à la fois, 4 par jour, de 30 minutes à une nuit entière. Tractage au marché ou serrage de mains, gîte coopératif ou thalasso à La Baule, Nuit debout ou soirée au Fouquet's… Elles jouent seulement sur les jauges, jamais sur l'XP, et une notification te prévient quand le rapport t'attend.",
   "Le courrier des électeurs : une lettre toutes les 30 à 60 minutes, de 7 h à minuit. À toi de choisir la réponse, chacune a ses effets.",
   "Trois objectifs du jour, tirés chaque matin et récompensés en jauges.",
   "La Flamme : elle grandit avec ton assiduité, jour après jour, et baisse quand tu délaisses ton élu. On dit qu'elle attire quelque chose…",
   "La Tombola de la Fête à gauche, la Loterie du Gala à droite : un tirage gratuit par jour, puis des bulletins gagnés en jouant (missions, objectifs, courrier). Jamais d'argent réel.",
   "La Garde-robe (Dossier) : une dizaine de tenues par camp, des objets à brandir, cinq raretés, des tirages garantis, et des confettis pour tes doublons, à échanger contre la pièce de ton choix. Purement cosmétique.",
   "Au classement, chaque élu apparaît en petit, avec sa tenue et son objet. Touche-le pour ouvrir sa fiche : l'élu en grand, son niveau et ses duels gagnés et perdus."
  ],
  fixed:[],
  admin:[
   "La fiche d'un joueur montre sa Flamme, ses bulletins, ses confettis et sa Garde-robe, et les événements rares remontent dans « À traiter »."
  ]},
  {version:"1.5.3",date:"2026-10-31",
  added:[],
  fixed:[
   "Chat sur téléphone : la fenêtre reste bien en place quand le clavier s'ouvre, et faire défiler les messages ne fait plus bouger le jeu derrière."
  ],
  admin:[]
 },
 {version:"1.5.2",date:"2026-10-31",
  added:[],
  fixed:[
   "Chat sur téléphone : la fenêtre reste bien en place quand le clavier s'ouvre, et faire défiler les messages ne fait plus bouger le jeu derrière."
  ],
  admin:[
   "L'organisateur peut nommer des modérateurs parmi les joueurs, avec des droits choisis un par un : ce qu'ils voient et ce qu'ils peuvent faire. Un modérateur n'agit jamais sur son propre compte, et chacune de ses actions est signée de son nom.",
   "La console suit le chat en direct : l'état des salons, les messages signalés et le fil de tous les salons, des deux camps."
  ]},
 {version:"1.5.1",date:"2026-10-31",
  added:[
   "Plus de 1 500 emojis rangés par catégorie, tes derniers utilisés en tête, et des exclusivités PolitiGo : la saucisse, la méga saucisse, le drapeau français et le drapeau soviétique. Envoyés seuls, ils s'affichent en grand.",
   "Notifications de duel : quand tu lances un défi ou qu'un rival te défie, le jeu te propose de les activer en un geste. « Plus tard » le fait patienter une semaine, et l'interrupteur reste dans Dossier → Compte."
  ],
  fixed:[],
  admin:[
   "Les signalements et les comportements suspects remontent en direct à l'organisateur, qui est prévenu dès qu'un cas demande son attention."
  ]},
 {version:"1.5.0",date:"2026-10-31",
  added:[
   "Le chat de la République : touche Chat sur l'écran principal. Un salon pour tout le monde, et un salon réservé à ton camp pour comploter entre camarades… ou entre amis de la majorité.",
   "Le chat s'ouvre seulement si l'organisateur de ta partie l'active, salon par salon : les joueurs ne peuvent pas l'activer eux-mêmes. Pas de touche Chat ? C'est qu'il est fermé pour le moment.",
   "Emojis à volonté, et images ou GIF : colle celui de ton clavier, ou envoie un fichier de 2 Mo maximum.",
   "Un message déplacé ? Signale-le en un geste. Tu peux aussi effacer les tiens. Les messages disparaissent au bout de 7 jours.",
   "Pas de dérangement : une simple pastille compte les messages non lus, sans notification ni son, et rien ne s'affiche pendant un mini-jeu."
  ],
  changed:[
   "Débat chrono et duels : c'est désormais le serveur qui pose les questions une à une et chronomètre tes réponses. Rien ne change pour toi, mais une réponse donnée en moins de 0,6 s n'est plus comptée, et un débat rapporte 20 points au plus.",
   "Duels : un défié touche le bonus de victoire 3 fois par jour au plus. Au-delà, la victoire compte, mais ne rapporte plus rien.",
   "Un pseudo libéré par une suppression de compte ne peut être repris qu'au bout de 24 h."
  ],
  fixed:[
   "Plusieurs failles de sécurité corrigées, repérées lors d'un audit complet du jeu."
  ],
  admin:[
   "L'organisateur dispose désormais d'une console d'administration privée, réservée à lui seul et inaccessible depuis le jeu.",
   "Mesures anti-triche : les scores impossibles pour un humain sont refusés, et les comportements automatisés (scripts, comptes multiples) sont repérés.",
   "En cas d'abus, un joueur peut être exclu de la partie ou son compte gelé : connexion bloquée, élu figé et retiré du classement le temps de la sanction."
  ]},
 {version:"1.4.1",date:"2026-10-31",
  added:[
   "Qui est là ? Un point vert qui pulse à droite du pseudo des joueurs en train de jouer, un point orange pour les autres, au classement comme dans les Duels. Les rivaux en ligne passent en tête de liste : idéal pour défier quelqu'un qui répondra tout de suite.",
   "Un défi t'attend ? Le bouton Jouer s'agite de temps en temps pour te le rappeler."
  ],
  changed:[
   "Duels ouverts plus tôt : il suffit d'un compte de 12 h au lieu de 24 h.",
   "Concentration pendant les mini-jeux : plus aucune notification, nouveauté ni annonce ne s'affiche en pleine partie. Tout arrive à la fin, y compris les notifications du téléphone.",
   "Fini les erreurs de doigt : relever ou refuser un défi demande maintenant une confirmation. Un défi sans réponse reste 24 h dans Jouer → Duels."
  ],
  fixed:[]},
 {version:"1.4.0",date:"2026-10-30",
  added:[
   "Duels : défie un autre élu au Débat chrono, dans Jouer → Duels. Mêmes questions pour les deux, le meilleur score l'emporte. Tu joues d'abord, ton rival a 24 h pour relever le défi.",
   "Victoire : +40 XP, moral +10, énergie +5. Défaite : −15 XP, moral −10, énergie −5, sans jamais perdre de niveau ni descendre une jauge sous 25. Refuser ne coûte rien ; celui qui t'a défié gagne juste un peu de moral.",
   "Trois défis par jour, un seul duel à la fois contre le même rival, et pas deux contre lui en 24 h. Les duels s'ouvrent au niveau 5.",
   "Notifications : active-les dans Dossier → Compte pour être prévenu d'un défi ou d'un résultat, même jeu fermé. Sur iPhone, ajoute d'abord PolitiGo à l'écran d'accueil.",
   "🎃 Ce soir à minuit, quelque chose d'étrange va se passer dans la République… Reviens jeter un œil, si tu l'oses. 👻",
   "Indécis ? À l'inscription comme quand tu repars de zéro, laisse faire le hasard, ou passe ton test politique : cinq questions bien salées, et il te propose ton camp. Libre à toi de rejoindre l'autre bord."
  ],
  changed:[
   "Mini-jeux rééquilibrés : plus le jeu est difficile, plus il paie. Le bonus de score monte jusqu'à 10 XP au Pong, 20 au Débat chrono et 30 à la Manif (Le Cortège et L'Épervier), en plus des 30 XP de l'activité."
  ],
  fixed:[
   "Pong des arguments : une partie interrompue par l'écran qui se verrouille est terminée et comptée, au lieu d'être perdue.",
   "Déconnexion : si le serveur ne répond pas, tu restes connecté et le jeu te le dit, au lieu de faire semblant de te déconnecter.",
   "Les pseudos qui imitent un autre avec des lettres sosies (« Mɑrine », « Marıne ») sont refusés à l'inscription."
  ]},
 {version:"1.3.1",date:"2026-10-30",
  added:[
   "Pong des arguments : 28 nouvelles piques, de « Rendez l'ISF ! » à « Gauche caviar ! »."
  ],
  fixed:[
   "Pong des arguments : l'adversaire vise maintenant à droite et à gauche. Rester immobile au centre ne suffit plus pour renvoyer ses piques.",
   "Le compteur « Jour » suit maintenant le calendrier : il passe au jour suivant à minuit, en même temps que les visites, les activités et les cafés, au lieu d'attendre 24 heures après le début du mandat."
  ]},
 {version:"1.3.0",date:"2026-10-30",
  added:[
   "Débat chrono : « Débattre » devient un jeu de 15 secondes. Réponds dans la ligne de ton camp à 32 questions tirées au hasard ; une erreur coûte une seconde, et chaque bonne réponse rapporte 1 XP (20 au plus).",
   "Manif : deux mini-jeux exclusifs, un pour chaque bord politique. Réservé à la gauche, Le Cortège : tiens le défilé jusqu'à Nation en esquivant LBD et lacrymo, avec un parapluie pour parer. Réservé à la droite, L'Épervier : interpelle les manifestants avec ton CRS, esquive pavés et molotovs, et gare aux journalistes et aux collègues infiltrés.",
   "Les beaux scores des mini-jeux sont annoncés dans le fil de la République.",
   "Mot de passe oublié ou compte bloqué après trop d'essais : l'organisateur peut maintenant le réinitialiser ou le débloquer tout de suite, sans redémarrer le jeu.",
   "Cette fenêtre de nouveautés, à chaque mise à jour. Elle reste consultable dans Dossier → Compte."
  ],
  fixed:[
   "Un mot de passe réinitialisé ferme aussitôt toutes les sessions ouvertes avec l'ancien, sur tous les appareils."
  ]}
];

// The entries a player has not read yet, newest first. Never read anything (an account older than this window):
// only the current release, not the whole history. No release (a development server): nothing.
export function missedEntries(seen,release){
 if(!release)return [];
 return CHANGELOG.filter(e=>cmpRelease(e.version,release)<=0&&(seen?cmpRelease(e.version,seen)>0:e.version===release));
}
// The entry the "Nouveautés" button shows: this release's, or the newest one known.
// Every release up to this server's (an entry written ahead of its tag waits for it), newest first: the history.
export const releasesUpTo=release=>CHANGELOG.filter(e=>!release||cmpRelease(e.version,release)<=0);
export const latestEntry=release=>CHANGELOG.find(e=>release&&e.version===release)||CHANGELOG.find(e=>!release||cmpRelease(e.version,release)<=0)||CHANGELOG[0];
