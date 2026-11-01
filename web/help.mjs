// The in-game guide (Dossier → Aide, and the « ? » of each sheet): one section per theme, written for the players, its
// numbers read from the rules themselves so that the guide never drifts from the game. Nothing about what only the
// most assiduous discover (no spoiler): the Flamme is described, not what it attracts.
import {XP,DUEL,DEBATE,MINI,PONG_RULES} from "./rules.mjs";
import {MISSION_RULES,MISSIONS,MAIL,GOALS_PER_DAY,FLAME} from "./activities.mjs";
import {ODDS,PITY,CONFETTI,EXCHANGE,RARITY_LABEL} from "./wardrobe.mjs";

const pct=v=>`${String(v).replace(".",",")} %`;
const mins=ms=>ms>=36e5?`${ms/36e5} h`:`${Math.round(ms/6e4)} min`;
const longest=Math.max(...MISSIONS.map(m=>m.ms)),shortest=Math.min(...MISSIONS.map(m=>m.ms));
const rarities=["commun","rare","epique","legendaire","ultra"];

// {id, title, parts: [string (a paragraph) | string[] (a list)]}
export const HELP=[
 {id:"demarrer",title:"Bien démarrer",parts:[
  "Ton élu est un petit compagnon à garder en forme. Il vit à l'heure réelle de Paris, même quand le jeu est fermé : passe le voir plusieurs fois par jour.",
  ["Manger et Soins : dépense tes frais de mandat (FM) pour remonter ses jauges.",
   "Jouer : les mini-jeux, les duels, les missions, le courrier et les objectifs du jour.",
   "Dossier : la Garde-robe, la Tombola de ton camp, tes objets, ton compte et cette aide.",
   "Touche l'écran de jeu pour lui taper sur l'épaule : ça lui remonte un peu le moral."],
  "Chaque fiche du jeu a son « ? » en haut : il ouvre directement la bonne rubrique de cette aide."]},
 {id:"jauges",title:"Les jauges et la mort politique",parts:[
  "Quatre jauges, de 0 à 100 : satiété, moral, énergie, hygiène. Elles baissent heure après heure, plus vite quand il est éveillé.",
  [`Une jauge à zéro pendant ${XP.deathHours} heures, et c'est la mort politique : la partie repart au niveau 1.`,
   "Sous 25, une jauge clignote : c'est le moment de passer à la Buvette ou aux Soins.",
   "La nuit, de 0 h à 6 h, il dort et récupère de l'énergie. Le reste du temps, la sieste fait de même, en plus lent.",
   "Les casseroles (des stress tirés au hasard, plus souvent quand le moral est bas) font perdre un peu de moral."],
  "Tu peux aussi repartir de toi-même dans l'autre camp, ou dans le tien, depuis le Dossier : c'est une démission."]},
 {id:"xp",title:"XP, niveaux et frais de mandat",parts:[
  [`Une visite rapporte de l'XP, une fois toutes les ${XP.visitGap} heures, ${XP.visitsPerDay} fois par jour au plus.`,
   `Les activités (mini-jeux) : ${XP.actsPerVisit} par visite, ${XP.actsPerDay} par jour, ${XP.activity} XP chacune plus un bonus selon ton score.`,
   "La forme compte : bien soigné, il gagne de l'XP plus vite et enchaîne les séries ; négligé, il régresse.",
   "Une nouvelle figure tous les 10 niveaux, jusqu'à la légende du niveau 100."],
  "Les frais de mandat (FM) tombent à chaque heure où il reste en vie. Ils servent à la Buvette et aux Soins. Aucun achat réel, jamais."]},
 {id:"jeux",title:"Les mini-jeux",parts:[
  [`Débat chrono : ${MINI.debate.ms/1000} secondes pour enchaîner les réponses de ta ligne. Une erreur coûte une seconde, une réponse donnée en moins de ${String(DEBATE.minReact/1000).replace(".",",")} s ne compte pas, ${DEBATE.maxPoints} points au plus.`,
   `Manif, un jeu par camp : Le Cortège à gauche (${MINI.cortege.ms/1000} s), L'Épervier à droite (${MINI.epervier.ms/1000} s).`,
   `Pong des arguments : renvoie les piques de l'adversaire pendant ${PONG_RULES.ms/1000} secondes.`,
   "Juste après un débat, le quitte ou double : pile, du moral et de l'énergie en plus ; face, un stress."],
  "Au doigt, à la souris ou au clavier."]},
 {id:"duels",title:"Les duels",parts:[
  "Défie un autre élu au Débat chrono (Jouer → Duels) : mêmes questions pour les deux, le meilleur score gagne.",
  [`Tu joues d'abord ; ton rival a ${DUEL.window/36e5} heures pour relever le défi ou le refuser, sans rien perdre.`,
   `Victoire : +${DUEL.win.xp} XP, moral +${DUEL.win.moral}, énergie +${DUEL.win.energy}. Défaite : ${DUEL.loss.xp} XP, moral ${DUEL.loss.moral}, énergie ${DUEL.loss.energy}, sans jamais perdre de niveau ni descendre une jauge sous ${DUEL.floor}.`,
   `Dès le niveau ${DUEL.minLevel}, ${DUEL.perDay} défis par jour, un seul duel ouvert avec le même rival, et pas de nouveau duel entre vous moins de 24 h après le précédent.`,
   "Dans la liste des adversaires, ceux que tu ne peux pas défier sont grisés, avec la raison à côté de leur pseudo."]]},
 {id:"activites",title:"Missions, courrier et objectifs du jour",parts:[
  "De quoi s'occuper entre deux visites. Ces activités jouent seulement sur les jauges, jamais sur l'XP ni les FM, et rapportent des bulletins pour la Tombola.",
  [`Missions : une à la fois, ${MISSION_RULES.perDay} par jour, de ${mins(shortest)} à ${mins(longest)}, avec au moins ${MISSION_RULES.minEnergy} d'énergie. Celle de nuit part seulement à partir de ${MISSION_RULES.nightFrom} h. Une notification te prévient quand le rapport t'attend ; la mission risquée se joue à pile ou face au moment du rapport.`,
   `Courrier des électeurs : une lettre toutes les ${MAIL.gapMin/6e4} à ${MAIL.gapMax/6e4} minutes, de ${MAIL.quietTo} h à minuit. Choisis ta réponse : chacune a ses effets.`,
   `Objectifs du jour : ${GOALS_PER_DAY} défis tirés chaque matin, récompensés en jauges.`],
  `Bulletins : un par mission rapportée, un par objectif atteint, un toutes les ${MAIL.bulletinEvery} lettres répondues.`]},
 {id:"flamme",title:"La Flamme",parts:[
  "Elle grandit avec ton assiduité, jour après jour, et s'affiche sous les quatre jauges. Chaque journée terminée lui ajoute jusqu'à 10 points :",
  [`toutes les jauges tenues à ${FLAME.gaugeMin} ou plus toute la journée : +${FLAME.gauges} ;`,
   `les ${GOALS_PER_DAY} objectifs du jour remplis : +${FLAME.goals} ;`,
   `au moins ${FLAME.visitsMin} visites étalées sur ${FLAME.spanH} heures : +${FLAME.visits} ;`,
   `${FLAME.missionsMin} missions : +${FLAME.missions} ; ${FLAME.lettersMin} lettres : +${FLAME.letters}.`],
  `Une journée sans aucune visite lui fait perdre ${Math.round((1-FLAME.idle)*100)} %, une mort politique ${Math.round((1-FLAME.death)*100)} %. On dit qu'elle attire quelque chose…`]},
 {id:"tombola",title:"La Tombola, la Loterie et la Garde-robe",parts:[
  "À gauche La Tombola de la Fête, à droite La Loterie du Gala (Dossier). De quoi habiller ton élu et lui mettre quelque chose dans la main. Purement cosmétique, et jamais d'argent réel.",
  ["Un tirage gratuit par jour, puis un bulletin par tirage.",
   `Chances : ${rarities.map(r=>`${RARITY_LABEL[r].toLowerCase()} ${pct(ODDS[r])}`).join(", ")}.`,
   `Tirages garantis : ${RARITY_LABEL.epique.toLowerCase()} (ou mieux) au ${PITY.epique}ᵉ tirage sans en voir, ${RARITY_LABEL.legendaire.toLowerCase()} au ${PITY.legendaire}ᵉ, ${RARITY_LABEL.ultra.toLowerCase()} au ${PITY.ultra}ᵉ.`,
   `Un doublon devient des confettis (${rarities.map(r=>CONFETTI[r]).join(", ")} selon la rareté) ; ${EXCHANGE.cost} confettis s'échangent contre une pièce commune, rare ou épique de ton choix.`],
  "La Garde-robe range tes tenues et tes objets : touche-en un pour le porter, touche-le de nouveau pour l'enlever. Une tenue s'enfile par-dessus tous les personnages de la collection."]},
 {id:"social",title:"Classement, fil, chat et notifications",parts:[
  ["Le classement en direct : score, niveau, série record, survie. Touche un élu pour ouvrir sa fiche et le défier.",
   "Le fil de la République raconte les évolutions, les morts politiques, les beaux scores et les duels de chacun.",
   "Le chat, quand l'organisateur l'ouvre : un salon pour tous et un pour ton camp. Signale un message déplacé d'un geste ; tout s'efface au bout de 7 jours.",
   "Les notifications (Dossier → Compte) te préviennent d'un défi, d'un résultat ou d'un rapport de mission, même le jeu fermé. Sur iPhone, ajoute d'abord PolitiGo à l'écran d'accueil."]]}
];
export const helpOf=id=>HELP.find(h=>h.id===id)||null;
// The section a sheet's « ? » opens.
export const SHEET_HELP={food:"jauges",care:"jauges",play:"jeux",duels:"duels",more:"demarrer",wardrobe:"tombola",urn:"tombola",player:"social",chat:"social"};
