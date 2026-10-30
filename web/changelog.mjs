// What's new, shown once to every player after an update (and on demand from Dossier → Compte).
// One entry per release, newest first, written in French for the players. Add the entry on dev before tagging:
// the version must match the tag without its "v" (tag v1.3.0 → "1.3.0").
import {cmpRelease} from "./rules.mjs";

export const CHANGELOG=[
 {version:"1.3.1",date:"2026-10-30",
  added:[],
  fixed:[
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
