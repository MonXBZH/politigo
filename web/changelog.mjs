// What's new, shown once to every player after an update (and on demand from Dossier → Compte).
// One entry per release, newest first, written in French for the players (added, changed, fixed, and admin: what the organiser can now do). Add the entry on dev before tagging:
// the version must match the tag without its "v" (tag v1.3.0 → "1.3.0").
import {cmpRelease} from "./rules.mjs";

export const CHANGELOG=[
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
export const latestEntry=release=>CHANGELOG.find(e=>release&&e.version===release)||CHANGELOG.find(e=>!release||cmpRelease(e.version,release)<=0)||CHANGELOG[0];
