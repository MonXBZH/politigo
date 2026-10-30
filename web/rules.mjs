// PolitiGo game rules and data, shared by the browser (web/app.js) and the server (server/server.mjs).
// One source of truth: the balance validated by simulation lives here and nowhere else.

// ===================================================================== DATA
export const people={
 left:[
  {name:"Olivier Faure",hair:"#44382f",style:"short",coat:"#364a6c",detail:"Lunettes, costume bleu et rose.",glasses:true},
  {name:"Raphaël Glucksmann",hair:"#614637",style:"curly",coat:"#48546c",detail:"Cheveux bruns, barbe et étoiles européennes.",beard:true},
  {name:"Marine Tondelier",hair:"#724630",style:"bob",coat:"#63a774",detail:"Veste verte, lunettes et petite feuille.",glasses:true},
  {name:"François Ruffin",hair:"#624438",style:"short",coat:"#c16f48",detail:"Veste de terrain et journal plié.",beard:true},
  {name:"Fabien Roussel",hair:"#777d82",style:"short",coat:"#445b7d",detail:"Cheveux gris, veste bleue, badge rouge."},
  {name:"Nathalie Arthaud",hair:"#6a4632",style:"bob",coat:"#b8323a",detail:"Carré châtain, veste rouge et manuel d'économie."},
  {name:"Sandrine Rousseau",hair:"#a67643",style:"bob",coat:"#478e72",detail:"Lunettes, veste verte et vélo miniature.",glasses:true},
  {name:"Philippe Poutou",hair:"#4a3a2e",style:"short",coat:"#6b7480",detail:"Barbe de trois jours, sweat gris et badge syndical.",beard:true},
  {name:"Mathilde Panot",hair:"#674331",style:"long",coat:"#a94964",detail:"Cheveux châtains, veste framboise et discours."},
  {name:"Jean-Luc Mélenchon",hair:"#9b9b92",style:"receding",coat:"#303b54",detail:"Forme finale : cravate rouge et geste de tribune.",tie:"#e15f66"}
 ],
 right:[
  {name:"Valérie Pécresse",hair:"#bd935c",style:"bob",coat:"#e8e0ca",detail:"Carré blond et veste claire."},
  {name:"Rachida Dati",hair:"#342a30",style:"bob",coat:"#bb4553",detail:"Carré brun, veste rouge et porte-documents."},
  {name:"Xavier Bertrand",hair:"#7a726a",style:"receding",coat:"#465574",detail:"Cheveux grisonnants, costume bleu.",tie:"#8badd2"},
  {name:"Édouard Philippe",hair:"#554137",style:"short",coat:"#3b485f",detail:"Lunettes ; barbe et cheveux évoluent du niveau 30 au 39.",glasses:true,beard:true},
  {name:"Laurent Wauquiez",hair:"#b5b4ab",style:"short",coat:"#b24949",detail:"Cheveux argentés, veste rouge et montagne."},
  {name:"Bruno Retailleau",hair:"#6b655e",style:"receding",coat:"#354660",detail:"Costume sombre et dossier du Sénat.",tie:"#6689b1"},
  {name:"Éric Ciotti",hair:"#a19a91",style:"receding",coat:"#41495e",detail:"Lunettes, cheveux très courts et dossier.",glasses:true},
  {name:"Marion Maréchal",hair:"#c5a16b",style:"long",coat:"#d9d4c7",detail:"Cheveux blonds, veste claire et discours."},
  {name:"Jordan Bardella",hair:"#292731",style:"quiff",coat:"#33456b",detail:"Mèche brune et costume bleu.",tie:"#708bbd"},
  {name:"Marine Le Pen",hair:"#d9bd76",style:"long",coat:"#3f577e",detail:"Forme finale : cheveux blonds, veste bleue et petit drapeau."}
 ]
};
for(const side of ["left","right"])people[side].forEach(p=>p.side=side);
export const personalItems={
 "Olivier Faure":[{name:"Rose de la permanence",prop:"rose"},{name:"Puzzle de coalition",prop:"puzzle"}],
 "Raphaël Glucksmann":[{name:"Carnet européen",prop:"europe"},{name:"Essai de poche",prop:"book"}],
 "Marine Tondelier":[{name:"Arrosoir des écologistes",prop:"watering"},{name:"Veste verte de secours",prop:"jacket"}],
 "François Ruffin":[{name:"Journal de terrain",prop:"paper"},{name:"Caméra documentaire",prop:"camera"}],
 "Fabien Roussel":[{name:"Badge de la fête",prop:"badge"},{name:"Marmite du banquet",prop:"pot"}],
 "Nathalie Arthaud":[{name:"Manuel d'économie annoté",prop:"book"},{name:"Drapeau rouge de Lutte ouvrière",prop:"flag"}],
 "Sandrine Rousseau":[{name:"Vélo miniature",prop:"bike"},{name:"Plant du jardin partagé",prop:"leaf"}],
 "Philippe Poutou":[{name:"Badge syndical de l'usine",prop:"badge"},{name:"Pancarte de manif",prop:"paper"}],
 "Mathilde Panot":[{name:"Carafe d'eau commune",prop:"water"},{name:"Micro de l'hémicycle",prop:"mic"}],
 "Jean-Luc Mélenchon":[{name:"Hologramme de poche",prop:"hologram"},{name:"Livret de la VIe République",prop:"scroll"}],
 "Valérie Pécresse":[{name:"Carte de transport miniature",prop:"ticket"},{name:"Maquette de train",prop:"train"}],
 "Rachida Dati":[{name:"Dossier de plaidoirie",prop:"case"},{name:"Palette culturelle",prop:"palette"}],
 "Xavier Bertrand":[{name:"Beffroi miniature",prop:"tower"},{name:"Dossier régional",prop:"case"}],
 "Édouard Philippe":[{name:"Phare du Havre",prop:"lighthouse"},{name:"Gants de boxe miniatures",prop:"gloves"}],
 "Laurent Wauquiez":[{name:"Sommet miniature",prop:"mountain"},{name:"Veste rouge de randonnée",prop:"jacket"}],
 "Bruno Retailleau":[{name:"Boussole vendéenne",prop:"compass"},{name:"Dossier du Sénat",prop:"paper"}],
 "Éric Ciotti":[{name:"Galet de la promenade",prop:"stone"},{name:"Dossier azuréen",prop:"case"}],
 "Marion Maréchal":[{name:"Carnet de conférence",prop:"book"},{name:"Petit drapeau",prop:"flag"}],
 "Jordan Bardella":[{name:"Fiches de plateau",prop:"paper"},{name:"Micro de meeting",prop:"mic"}],
 "Marine Le Pen":[{name:"Chat de compagnie miniature",prop:"cat"},{name:"Drapeau de meeting",prop:"flag"}]
};
export const philippePhases=[
 {hair:"#554137",beardColor:"#554137",beard:true,style:"short"},
 {hair:"#554137",beardColor:"#c3c4c6",beard:true,style:"short"},
 {hair:"#c3c4c6",beardColor:"#c3c4c6",beard:true,style:"short"},
 {hair:"#c3c4c6",beard:false,style:"short"},
 {beard:false,style:"bald"}
];
export const stresses={
 "Olivier Faure":[{trigger:"Recomptage au congrès",line:"On recompte ? On recompte. Et on recompte encore.",ref:"Congrès du PS de Marseille (2023) : résultats contestés et recomptés face à Nicolas Mayer-Rossignol."},{trigger:"Souvenir de 2022",line:"1,75 % ? Ce n'était pas moi, c'était Anne !",ref:"Score de la candidate socialiste à la présidentielle 2022."}],
 "Raphaël Glucksmann":[{trigger:"Sortie du périphérique",line:"Il existe une France après Saint-Germain-des-Prés ?",ref:"Étiquette « bobo parisien » que lui collent ses adversaires."},{trigger:"Carte du PS envoyée par erreur",line:"Je mène la liste du PS, mais je ne suis pas au PS. Suivez.",ref:"Tête de liste PS–Place publique aux européennes 2024 sans être membre du PS."}],
 "Marine Tondelier":[{trigger:"Veste verte au pressing",line:"Sans ma veste, plus personne ne me reconnaît !",ref:"La veste verte devenue signature télévisée en 2024."},{trigger:"Réunion d'union de la gauche",line:"Cinq partis, six candidats, zéro accord. Tout va bien.",ref:"La candidature commune de la gauche pour 2027, toujours introuvable."}],
 "François Ruffin":[{trigger:"Appel de Jean-Luc",line:"Ne pas décrocher. Surtout, ne pas décrocher.",ref:"Rupture avec LFI en 2024 et critiques publiques contre Jean-Luc Mélenchon."},{trigger:"Caméra en panne",line:"Pas de caméra ? Alors il ne s'est rien passé.",ref:"Le député-documentariste de « Merci patron ! »."}],
 "Fabien Roussel":[{trigger:"Courrier du parquet",line:"Assistant parlementaire, moi ? J'assistais. Beaucoup.",ref:"Enquête préliminaire du PNF ouverte en 2022, après des révélations de Mediapart, sur un ancien emploi de collaborateur parlementaire ; il conteste toute irrégularité."},{trigger:"Menu végétarien à la cantine",line:"Sans steak, ce n'est plus la gauche, c'est un régime.",ref:"Son « bon vin, bonne viande, bon fromage » de la campagne 2022."}],
 "Nathalie Arthaud":[{trigger:"Résultats du premier tour",line:"0,56 % ? Le capitalisme a encore truqué la calculette.",ref:"Score de 0,56 % à la présidentielle 2022, pour Lutte ouvrière."},{trigger:"Héritage d'Arlette",line:"Travailleuses, travailleurs… Arlette, tu me rends le micro ?",ref:"Elle succède à Arlette Laguiller, six fois candidate de Lutte ouvrière à la présidentielle."}],
 "Sandrine Rousseau":[{trigger:"Barbecue entre voisins",line:"Une côte de bœuf ?! Vite, un homme déconstruit !",ref:"Sa déclaration de 2022 associant le barbecue à la virilité."},{trigger:"Piste cyclable fermée",line:"Mon vélo est triste. Et quand mon vélo est triste…",ref:"Ses combats pro-vélo."}],
 "Philippe Poutou":[{trigger:"Débat télévisé",line:"Nous, convoqués par la police, on n'a pas d'immunité ouvrière !",ref:"Réplique réelle lancée à François Fillon et Marine Le Pen lors du débat présidentiel du 4 avril 2017."},{trigger:"Congrès du NPA",line:"On était un parti. On est deux. La révolution avance.",ref:"Scission du NPA en décembre 2022 ; 0,77 % à la présidentielle de la même année."}],
 "Mathilde Panot":[{trigger:"Micro coupé",line:"Rappel au règlement ! Sur le rappel au règlement !",ref:"Rappels au règlement à répétition dans l'hémicycle."},{trigger:"Coupure d'eau",line:"L'eau est un bien commun. Ma douche aussi !",ref:"Ses combats pour l'eau bien commun."}],
 "Jean-Luc Mélenchon":[{trigger:"Perquisition au siège",line:"La République, c'est moi ! Ma personne est sacrée !",ref:"Perquisition de 2018 au siège de LFI ; condamné en 2019 à trois mois avec sursis pour rébellion et provocation. Citation réelle."},{trigger:"Dossier des assistants européens",line:"Des assistants ? Non : des militants. Ah… c'est pareil ?",ref:"Enquête ouverte en 2018 sur les assistants parlementaires européens de LFI ; aucune condamnation connue à la rédaction."}],
 "Valérie Pécresse":[{trigger:"Appel aux dons",line:"Aidez-moi à rembourser, un ticket de métro à la fois.",ref:"4,78 % à la présidentielle 2022, sous le seuil de remboursement : appel aux dons pour une dette personnelle d'environ 5 M€."},{trigger:"Meeting au Zénith",line:"Je lis mon discours avec l'énergie d'un RER B en panne.",ref:"Le meeting du Zénith de février 2022, jugé raté."}],
 "Rachida Dati":[{trigger:"Convocation au tribunal",line:"Des honoraires, c'est du conseil. Pas de la corruption !",ref:"Mise en examen en 2019 pour corruption et trafic d'influence passifs (honoraires versés par une filiale de Renault-Nissan) ; renvoyée devant le tribunal correctionnel, elle conteste et reste présumée innocente."},{trigger:"Question d'un journaliste",line:"Vous êtes là pour m'informer ou pour m'attaquer ?",ref:"Échanges tendus avec des journalistes en interview."}],
 "Xavier Bertrand":[{trigger:"Annonce de primaire",line:"Je suis candidat. Ah non. Ah si. Enfin, peut-être.",ref:"Ses candidatures et renoncements répétés pour l'Élysée."},{trigger:"Carte d'adhérent LR",line:"Parti en 2017, revenu en 2021. Le GPS recalcule.",ref:"Départ des Républicains en 2017, retour en 2021."}],
 "Édouard Philippe":[{trigger:"Gants raccrochés",line:"Pas de boxe aujourd'hui ? Je vais cogner un sondage.",ref:"Sa pratique publique de la boxe."},{trigger:"Calendrier 2027",line:"Je suis candidat. Depuis 2024. Pour 2027. Patience.",ref:"Candidature à la présidentielle annoncée en septembre 2024."}],
 "Laurent Wauquiez":[{trigger:"Facture des dîners des sommets",line:"Le grand cru était régional : c'est de l'aménagement du territoire.",ref:"« Dîners des sommets » financés par la Région Auvergne-Rhône-Alpes, révélés par Mediapart en 2023 ; il en défend l'usage."},{trigger:"Micro qui enregistre",line:"Je dis enfin ce que je pense… Attendez, ça enregistre ?",ref:"Propos devant des étudiants de l'EM Lyon, enregistrés à son insu et diffusés en 2018."}],
 "Bruno Retailleau":[{trigger:"Composition du gouvernement",line:"Un tweet, et pouf : plus de gouvernement.",ref:"Octobre 2025 : son message après la composition du gouvernement Lecornu précède la démission du Premier ministre."},{trigger:"Retour au Sénat",line:"Au Sénat, au moins, personne ne tombe en quatorze heures.",ref:"Clin d'œil à son long parcours de sénateur."}],
 "Éric Ciotti":[{trigger:"Serrure du siège",line:"J'ai fermé le siège à clé. Et le parti avec.",ref:"Juin 2024 : alliance avec le RN annoncée sans son parti, siège de LR fermé."},{trigger:"Repas de famille LR",line:"Exclu, réintégré par le juge, puis parti. Qui dit mieux ?",ref:"Exclusion suspendue par la justice en 2024, puis création de l'UDR."}],
 "Marion Maréchal":[{trigger:"Message d'Éric",line:"Ce n'est pas toi, c'est… ah si, c'est toi.",ref:"Rupture avec Éric Zemmour et Reconquête en 2024."},{trigger:"Repas de famille",line:"Tata Marine est à table ? Je mange dans la cuisine.",ref:"Relations publiques fluctuantes avec sa tante."}],
 "Jordan Bardella":[{trigger:"Coupure de TikTok",line:"Pas de réseau ? Je n'ai plus de programme !",ref:"Sa communication très active sur TikTok."},{trigger:"Question sur le chiffrage",line:"Le chiffrage ? Il sera prêt… après l'élection.",ref:"Programme révisé en pleine campagne des législatives 2024 (retraites, TVA sur l'énergie)."}],
 "Marine Le Pen":[{trigger:"Dossier des assistants européens",line:"Mes assistants travaillaient. Pour le parti. Donc pour l'Europe, non ?",ref:"Affaire des assistants parlementaires européens du FN : condamnée en première instance en mars 2025 pour détournement de fonds publics, inéligibilité avec exécution provisoire ; appel."},{trigger:"Exécution provisoire",line:"Inéligible ? Parfait, je deviens éleveuse de chats à plein temps.",ref:"Son élevage de chats, longtemps mis en avant, et l'inéligibilité prononcée en 2025."}]
};
// La Buvette: same prices and effects in both camps, only the names change.
export const shop=[
 {key:"bread",kind:"food",price:0,left:"Quignon de la cantine",right:"Quignon du marché",fx:{sat:8,moral:-2},note:"Gratuit, un par heure"},
 {key:"soup",kind:"food",price:1,left:"Soupe de la cantine solidaire",right:"Soupe du marché communal",fx:{sat:15}},
 {key:"snack",kind:"food",price:2,left:"Biscuit de la coopérative",right:"Tarte de l'artisan",fx:{sat:15,moral:15}},
 {key:"coffee",kind:"food",price:2,left:"Café du local associatif",right:"Café de la permanence",fx:{energy:20},note:"Trois par jour"},
 {key:"meal",kind:"food",price:3,left:"Couscous de la fête de quartier",right:"Gratin du banquet communal",fx:{sat:50,moral:5}},
 {key:"banquet",kind:"food",price:8,left:"Banquet de la Fête de l'Huma",right:"Dîner des sommets",fx:{sat:100,moral:30}},
 {key:"soap",kind:"care",anim:"bath",price:2,left:"Savon de la coopérative",right:"Savon de l'artisan",fx:{hyg:40}},
 {key:"rest",kind:"care",anim:"sleep",price:3,left:"Hamac des congés payés",right:"Fauteuil du dimanche",fx:{energy:35}},
 {key:"garden",kind:"care",anim:"win",price:4,left:"Jardin partagé",right:"Promenade au jardin municipal",fx:{moral:30}}
];
export const pongLines={
 left:["Et les riches ?","Réac !","Et le climat ?","Cadeaux fiscaux !","Et vos affaires ?","Les patrons d'abord ?",
  "Rendez l'ISF !","Ultralibéral !","Et les profs ?","Et les retraites ?","Valet du CAC 40 !","Paradis fiscaux !","Droite rance !",
  "Ruisselle ? Où ça ?","Et l'hôpital ?","Privatiseur !","Encore un 49.3 ?","Et les superprofits ?","Climatosceptique !","Et les mal-logés ?"],
 right:["Et la dette ?","Utopiste !","Et l'insécurité ?","Assistanat !","Bobo !","Vous taxez tout !",
  "Wokiste !","Et les impôts ?","Allez bosser !","Comme au Venezuela !","Laxiste !","Khmer vert !","Et l'autorité ?",
  "Zadiste !","Et la valeur travail ?","Gréviste !","Bisounours !","Gauche caviar !","Planche à billets !","Et nos frontières ?"]
};
export const fxNames={sat:"satiété",moral:"moral",energy:"énergie",hyg:"hygiène"};
// The timed debate's questions, here because the server deals and replays duels: the left answer, the right
// answer, and a decoy that is wrong for everyone.
export const QUESTIONS=[
 ["Programme économique ?","Taxer les riches","Taxer les pauvres","Taxer les politiques"],
 ["Le chômage ?","Partager le temps de travail","Supprimer les allocs","Interdire les lundis"],
 ["La retraite ?","À 60 ans, en fanfare","À 70 ans, en forme","À 18 ans, puis on verra"],
 ["L'école ?","Plus de profs","Plus d'uniformes","Plus de récré"],
 ["Les frontières ?","Ouvertes à tous","Fermées à double tour","Une frontière avec la Lune"],
 ["La sécurité ?","Plus de prévention","Plus de police","Un vigile par habitant"],
 ["L'écologie ?","Vélo pour tous","Nucléaire pour tous","Trottinette pour les ministres"],
 ["Les services publics ?","Tout nationaliser","Tout privatiser","Tout vendre aux enchères"],
 ["La cantine ?","Menu végé","Entrecôte obligatoire","Menu tofu-merguez"],
 ["Le SMIC ?","Augmenter le SMIC","Baisser les charges","Payer en tickets resto"],
 ["La voiture ?","Transports gratuits","Autoroute à 150","Voitures à pédales"],
 ["L'impôt sur la fortune ?","Rétablir l'ISF","Supprimer l'ISF","Impôt sur la moustache"],
 ["Le temps de travail ?","Semaine de 32 h","Travailler plus","Semaine de 8 jours"],
 ["Les banques ?","Les nationaliser","Les rassurer","Sous le matelas"],
 ["L'Europe ?","Europe sociale","Europe des nations","Europe en karaoké"],
 ["Le logement ?","Encadrer les loyers","Défiscaliser les proprios","Tous en camping-car"],
 ["La culture ?","Subventionner les artistes","Défendre le patrimoine","Remplacer l'opéra par du karting"],
 ["Les grèves ?","Soutien total","Service minimum","Grève de la grève"],
 ["L'héritage ?","Taxer l'héritage","Protéger l'héritage","Hériter de ses voisins"],
 ["La santé ?","Hôpital public","Mutuelles privées","Tisane remboursée"],
 ["La justice ?","Réinsertion","Tolérance zéro","Pierre-feuille-ciseaux"],
 ["Le budget ?","Dépenser pour relancer","Couper dans les dépenses","Imprimer des billets à la cave"],
 // The rawer ones: café-du-commerce caricatures, as unfair to both sides.
 ["Les patrons ?","Tous des voleurs","Tous des héros","Tous en slip"],
 ["Les fonctionnaires ?","Des héros sous-payés","Une armée de planqués","Des robots en kit"],
 ["Les riches ?","Qu'ils crachent au bassinet !","Qu'on leur fiche la paix !","Qu'ils adoptent un député"],
 ["Les syndicats ?","Le sel de la terre","Une bande de feignants","Un club de pétanque"],
 ["Les flics ?","Désarmer la police","Ils ont toujours raison","Les remplacer par des mimes"],
 ["Le cannabis ?","Légaliser le joint","Prison au premier pétard","Remboursé par la Sécu"],
 ["Les assistés ?","Ça n'existe pas","Au boulot, les fainéants !","Assistés par ordinateur"],
 ["Les bobos ?","Notre électorat","Des rebelles en trottinette","Un pansement et ça passe"],
 ["Le service militaire ?","Jamais de la vie","Obligatoire, en rangers","En pyjama, le dimanche"],
 ["La fraude ?","La fraude fiscale d'abord","La fraude aux allocs d'abord","Frauder au loto"]
];
// What each answer of a question is, in QUESTIONS order.
export const ANSWER_KINDS=["left","right","decoy"];

// ===================================================================== SEASONAL EVENTS
// Halloween: 31 October and 1 November in the game's time zone, then gone by itself. The server's POLITIGO_EVENT
// can force it ("halloween", to test) or switch it off early ("off"); "auto" follows the calendar. Everything is a
// costume (names, drawings, lines) with the same prices and effects, except the daily treat below.
export const EVENT_MODES=["auto","off","halloween"];
export function eventAt(ms,mode="auto"){
 if(mode==="halloween")return "halloween";
 if(mode!=="auto"||!Number.isFinite(ms))return "";
 const p=parts(ms),md=Number(p.month)*100+Number(p.day);
 return md===1031||md===1101?"halloween":"";
}
export const HALLOWEEN={
 // Same keys, prices and effects as the shop: only the names change, as unfair to both camps.
 shop:{
  bread:{left:"Quignon à l'ail de la cantine",right:"Quignon du manoir"},
  soup:{left:"Soupe populaire au potiron",right:"Velouté de potimarron à la truffe"},
  snack:{left:"Bonbons de la kermesse",right:"Pralines du chocolatier"},
  coffee:{left:"Potion de la sorcière bio",right:"Potion du chaudron du château"},
  meal:{left:"Couscous à la citrouille",right:"Gratin de potiron du banquet"},
  banquet:{left:"Banquet des morts-vivants de l'Huma",right:"Dîner des sommets hantés"},
  soap:{left:"Bain d'eau bénite de la coopérative",right:"Bain anti-malédiction de l'artisan"},
  rest:{left:"Hamac entre deux tombes",right:"Cercueil capitonné du dimanche"},
  garden:{left:"Balade au cimetière du Père-Lachaise",right:"Promenade au manoir hanté"}
 },
 // What each camp throws at the other in the Pong, on top of the usual lines.
 pong:{
  left:["Vampire du CAC 40 !","Suceur de niches fiscales !","Rends l'argent, Dracula !","Momie du Sénat !","Même mort, tu votes à droite !",
   "Des bonbons ou un 49.3 ?","Fantôme de l'ISF !","Loup-garou du patronat !","Ton programme fait peur !","Zombie du ruissellement !","Citrouille libérale !","Tu fais peur aux pauvres !"],
  right:["Zombie de l'assistanat !","Tu fais plus peur que la dette !","Sorcière fiscale !","Le spectre du communisme !","Momie de 68 !",
   "Des bonbons gratuits pour tous ?","Fantôme du plein-emploi !","Loup-garou des impôts !","Ton budget fait peur !","Même mort, tu fais grève !","Revenant de la planche à billets !","Citrouille woke !"]
 },
 // Solo debate only: a duel deals from QUESTIONS alone, so a duel played across the event's end replays the same.
 questions:[
  ["Halloween ?","Fête païenne et populaire","Vive la Toussaint française","Fête nationale du potiron"],
  ["Les bonbons ?","Gratuits pour tous les enfants","Pour ceux qui les méritent","Remboursés par la Sécu"],
  ["Les vampires ?","Taxer leur sang","Ils créent de l'emploi","Les inviter au Sénat"],
  ["Les zombies ?","Régulariser les morts-vivants","Expulser les morts-vivants","Les élire au Parlement"],
  ["La maison hantée ?","La réquisitionner","Respecter la propriété","La louer aux touristes"],
  ["Les sorcières ?","Des héroïnes féministes","Contrôle des balais","Balais électriques"],
  ["La citrouille ?","Potager collectif","Agriculture française d'abord","Carrosse de fonction"],
  ["Le couvre-feu ?","Liberté de hanter","Couvre-feu à minuit","Réservé aux chauves-souris"]
 ],
 sleep:{left:"Zzz… demain je plante le CAC 40…",right:"Zzz… je ne mords que les niches fiscales…"},
 ghost:{left:"Un spectre hante l'Europe…",right:"Bouh ! 3 000 milliards de dette !"},
 // "Des bonbons ou un amendement ?": once a day while the event lasts, awake, the same gift in both camps.
 treat:{moral:5,lines:{
  left:["Bonbons partagés avec toute la cantine : ça, c'est la redistribution.","Sachet de bonbons nationalisé, réparti équitablement.","Un camarade t'offre des bonbons sans patron ni colorant."],
  right:["Bonbons mérités, avec un chocolat suisse en prime.","Bonbons défiscalisés : pas un centime pour l'État.","Un donateur t'offre des pralines : du pur mécénat."]
 }}
};
// A shop item's name, in costume while an event lasts.
export const itemName=(it,camp,event="")=>event==="halloween"&&HALLOWEEN.shop[it.key]?HALLOWEEN.shop[it.key][camp]:it[camp];
// A line for one camp: half of them from the event's while it lasts.
export function pongLine(camp,event="",random=Math.random){
 const l=event==="halloween"&&random()<0.5?HALLOWEEN.pong[camp]:pongLines[camp];
 return l[Math.floor(random()*l.length)];
}

// ===================================================================== RULES
// Everything below takes the companion state S as an argument. The server is the only one that MUTATES
// a state (advance, act); the browser imports the same module for the read-only checks it displays.
export const H=3600000;
export const ECO={income:2,cap:99,nightEnd:6,awake:{sat:13,moral:4,energy:8,hyg:6},night:{sat:4,moral:2,energy:-15,hyg:2}};
// Tuned by simulation: 6 visits + 6 activities a day reach level 100 on day 15 (mini-game bonuses aside: with good
// scores, around day 11-13); 3 bare visits survive and reach it on day ~39.
export const XP={base:5,visit:25,visitGap:2,visitsPerDay:8,activity:30,actsPerVisit:2,actsPerDay:8,deathHours:12,
 excellent:50,correct:25,a:17,b:1.15,streakStep:0.01,streakCap:0.25,stressMin:0.03,stressMax:0.15,napFactor:0.5};
// The hourly stress risk follows his moral: 3 % at full moral, 15 % at rock bottom. A sulking candidate spirals.
export const stressChance=S=>XP.stressMin+(XP.stressMax-XP.stressMin)*(100-S.moral)/100;
// "Quitte ou double": right after a debate, a free rematch. Heads, moral and energy come back; tails, a stress hits twice as hard.
export const STRESS_HIT=5;
export const DOUBLE={odds:0.5,moral:12,energy:12,window:H,stressFactor:2};
// The Pong is played in the browser, so its result is checked: no more than ~1.5 returns a second, within 90 s.
export const PONG_RULES={maxScore:30,minSeconds:2,timeoutSeconds:90,returnsPerSecond:1.5,bonusPerReturn:1,bonusCap:10};
// Mini-games played in the browser (results checked like the Pong's): one per camp for the "Manif", and the
// timed debate behind "Débattre". The bonus comes on top of the activity XP; a score is capped by duration, at a
// human pace (the browser waits on the result screen at least 4 s before sending, which only adds margin): a
// script can no longer claim the full bonus a few seconds after the start.
export const MINI={
 debate:{label:"Débat chrono",camp:null,ms:15000,maxScore:60,perSecond:2.5,bonusRate:1,bonusCap:20,great:18},
 cortege:{label:"Le Cortège",camp:"left",ms:30000,maxScore:400,perSecond:8,bonusRate:0.25,bonusCap:30,great:120},
 epervier:{label:"L'Épervier",camp:"right",ms:35000,maxScore:150,perSecond:2,bonusRate:2,bonusCap:30,great:15}
};
// The debate's clock: a 1.3 s countdown, then 15 s of play; a wrong answer costs a second, and a pick shows for
// 260 ms before the next one counts.
export const DEBATE={intro:1300,penalty:1000,flash:260};
// Duels (PvP, played one after the other within 24 h): both players get the same debate, dealt from a seed the
// server draws, and the server replays each player's picks. A duel score is computed, never taken on trust.
// A win pays at most paidWins times a day; a lost duel never costs a level nor pushes a gauge under "floor".
export const DUEL={game:"debate",win:{xp:40,moral:10,energy:5},loss:{xp:-15,moral:-10,energy:-5},tie:{moral:5},chicken:{moral:3},
 floor:25,perDay:3,paidWins:3,minLevel:5,minAgeMs:432e5,window:864e5,maxPicks:80,minGap:250};
// A great score is announced in the public feed at most once per game hour and player.
const greatAnnounced=S=>S.journal.some(j=>j.k==="mini"&&j.d?.great===true&&S.vclock-j.t<H);
export const MINI_RULES={minSeconds:3,graceSeconds:75};   // expiry = ms/1000 + graceSeconds after the start
export const manifGame=S=>S.camp==="left"?"cortege":"epervier";
const miniExpired=(S,realNow)=>S.mini&&realNow-S.mini.t>(MINI[S.mini.k].ms/1000+MINI_RULES.graceSeconds)*1000;
export const xpCost=L=>XP.a+XP.b*L;
export const xpFloor=L=>XP.a*(L-1)+XP.b*(L-1)*L/2;
export const stage=n=>Math.min(9,Math.floor(n/10));
export const clamp=v=>Math.max(0,Math.min(100,v));
export const FORMS=["Excellente","Correcte","Négligée","Abandonnée"];
export const CAMPS=Object.keys(people);

// Day and night follow one shared time zone (the server's), whatever the player's own device says.
let TZ="Europe/Paris",fmt=null;
// An unknown zone would make every clock reading throw: it is refused here, once, instead.
export function setTimeZone(tz){new Intl.DateTimeFormat("en-GB",{timeZone:tz});TZ=tz;fmt=null;}
export const timeZone=()=>TZ;
function parts(ms){
 fmt??=new Intl.DateTimeFormat("en-GB",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
 const o={};for(const p of fmt.formatToParts(ms))o[p.type]=p.value;return o;
}
export const clockOf=ms=>{const p=parts(ms);return {hour:Number(p.hour),minute:Number(p.minute)};};
export const hodOf=idx=>Number(parts(idx*H).hour);
export const dayKey=idx=>{const p=parts(idx*H);return Number(p.year)*10000+Number(p.month)*100+Number(p.day);};
// The day of the mandate counts calendar days in the game's time zone: day 1 is the day of birth, and the next one
// starts at midnight, like the daily limits (visits, activities, coffees), not 24 h after the birth hour.
const civilDay=ms=>{const p=parts(ms);return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))/864e5;};
export const mandateDay=(S,now=S.vclock)=>Math.max(1,civilDay(now)-civilDay(S.born)+1);
export const curIdx=S=>Math.floor(S.vclock/H);
export const isNight=S=>hodOf(curIdx(S))<ECO.nightEnd;
// Asleep = the night (forced) or a nap the player started by switching the light off.
export const isAsleep=S=>isNight(S)||S.sleeping;
export const person=(S,lvl=S.lvl)=>people[S.camp][stage(lvl)];
export const personByName=(S,name)=>people[S.camp].find(p=>p.name===name)||person(S);
// How a companion looks at a given level (Philippe's hair and beard change from 30 to 39).
export function lookFor(S,p,lvl){
 const base=p.name==="Édouard Philippe"?{...p,...philippePhases[Math.max(0,Math.min(4,Math.floor((lvl-30)/2)))]}:p;
 return {...base,prop:personalItems[p.name][S.equipped[p.name]||0].prop};
}
export const look=S=>lookFor(S,person(S),S.lvl);
export const fxText=fx=>Object.entries(fx).map(([k,v])=>`${fxNames[k]} ${v>0?"+":"−"}${Math.abs(v)}`).join(", ");
// The combined leaderboard score: progress, rewarded for regularity, punished for every political death.
export const score=S=>Math.max(0,Math.round(S.xp+2*S.bestStreak-150*S.deaths));

export function freshState(camp,now){
 return {v:2,camp,vclock:now,lastReal:now,hourIdx:Math.floor(now/H),born:now,
  fm:10,sat:80,moral:80,energy:80,hyg:80,xp:0,lvl:1,best:1,streak:0,bestStreak:0,neg:0,zero:0,form:"Excellente",mult:1.25,
  lastVisit:-99,visitDay:-1,visitsToday:0,actsToday:0,actsVisit:0,actWindow:-99,breadIdx:-1,coffeeDay:-1,coffees:0,petIdx:-1,
  sleeping:false,equipped:{},deaths:0,jn:0,journal:[],pong:null,mini:null,rematchT:-1,diedAt:-1,treatDay:-1};
}
export function newGame(camp,now){
 const S=freshState(camp,now);
 log(S,"new",`Début de mandat dans la collection ${camp==="left"?"gauche":"droite"} avec ${person(S).name}. 10 FM en caisse.`,{name:person(S).name});
 return S;
}
// A stored state is re-derived field by field: nothing malformed or impossible survives a load.
export function sanitize(s,now){
 if(!s||typeof s!=="object"||s.v!==2||!Object.hasOwn(people,s.camp))return null;
 const num=(v,min,max,def)=>Number.isFinite(v)?Math.min(max,Math.max(min,v)):def,int=(v,min,max,def)=>Math.round(num(v,min,max,def));
 const o=freshState(s.camp,now);
 o.vclock=num(s.vclock,0,8.64e15,now);o.born=num(s.born,0,o.vclock,o.vclock);
 o.lastReal=num(s.lastReal,0,now,now);o.hourIdx=int(s.hourIdx,Math.floor(o.vclock/H)-24*366,Math.floor(o.vclock/H),Math.floor(o.vclock/H));   // at most a year of ticks to replay
 for(const k of ["sat","moral","energy","hyg"])o[k]=num(s[k],0,100,80);
 o.fm=int(s.fm,0,ECO.cap,10);o.lvl=int(s.lvl,1,100,1);o.best=int(s.best,o.lvl,100,o.lvl);
 o.xp=num(s.xp,xpFloor(o.lvl),1e7,xpFloor(o.lvl));
 if(o.lvl<100)o.xp=Math.min(o.xp,xpFloor(o.lvl+1)-1e-6);
 for(const k of ["streak","bestStreak","neg","zero","deaths","jn"])o[k]=int(s[k],0,1e9,0);
 o.bestStreak=Math.max(o.bestStreak,o.streak);
 for(const k of ["lastVisit","actWindow","breadIdx","petIdx"])o[k]=int(s[k],-99,1e9,-99);
 for(const k of ["visitDay","coffeeDay","treatDay"])o[k]=int(s[k],-1,1e9,-1);
 for(const k of ["visitsToday","actsToday","actsVisit","coffees"])o[k]=int(s[k],0,50,0);
 o.form=FORMS.includes(s.form)?s.form:"Correcte";o.mult=num(s.mult,-0.5,1.25,1);o.sleeping=s.sleeping===true;
 if(s.equipped&&typeof s.equipped==="object")for(const name of Object.keys(personalItems))if(s.equipped[name]===1)o.equipped[name]=1;
 if(Array.isArray(s.journal))o.journal=s.journal.filter(j=>j&&Number.isFinite(j.n)&&Number.isFinite(j.t)&&typeof j.k==="string"&&typeof j.text==="string")
  .slice(0,40).map(j=>{const e={n:j.n,t:j.t,k:j.k.slice(0,12),text:j.text.slice(0,300)};
   if(j.d&&typeof j.d==="object"&&JSON.stringify(j.d).length<400)e.d=j.d;return e;});
 o.jn=Math.max(o.jn,...o.journal.map(j=>j.n),0);
 if(s.pong&&Number.isFinite(s.pong.t))o.pong={t:s.pong.t};
 if(s.mini&&typeof s.mini.k==="string"&&Object.hasOwn(MINI,s.mini.k)&&Number.isFinite(s.mini.t))o.mini={k:s.mini.k,t:s.mini.t};
 o.rematchT=num(s.rematchT,-1,o.vclock,-1);
 // States saved before diedAt existed take it from their journal.
 o.diedAt=num(s.diedAt??o.journal.find(j=>j.k==="death")?.t,-1,o.vclock,-1);
 return o;
}
function log(S,k,text,d){
 S.jn++;const e={n:S.jn,t:S.vclock,k,text};if(d!==undefined)e.d=d;
 S.journal.unshift(e);if(S.journal.length>40)S.journal.length=40;
}

// ---------- read-only checks (safe to call from the browser) ----------
const sameDay=S=>S.visitDay===dayKey(curIdx(S));
export const visitsToday=S=>sameDay(S)?S.visitsToday:0;
export const actsToday=S=>sameDay(S)?S.actsToday:0;
// The per-visit allowance renews every 2 h even when the visit itself no longer pays (8 visits already counted).
export const actsThisVisit=S=>curIdx(S)-S.actWindow>=XP.visitGap?0:S.actsVisit;
export function activityBlock(S){
 if(isNight(S))return "Chut, il dort.";
 if(S.sleeping)return "Il fait la sieste : rallume la lumière d'abord.";
 if(S.energy<20)return "Trop fatigué : il lui faut un café ou une sieste.";
 if(actsThisVisit(S)>=XP.actsPerVisit)return "Deux activités par visite : reviens dans deux heures.";
 if(actsToday(S)>=XP.actsPerDay)return "Huit activités par jour maximum.";
 return "";
}
export function rematchBlock(S){
 if(isNight(S))return "Chut, il dort.";
 if(S.sleeping)return "Il fait la sieste : rallume la lumière d'abord.";
 if(S.rematchT<0||S.vclock-S.rematchT>=DOUBLE.window)return "Le quitte ou double se joue juste après un débat.";
 return "";
}
// Why the Halloween treat cannot be taken now ("" when it can).
export function treatBlock(S,event=""){
 if(event!=="halloween")return "Plus de bonbons : Halloween est fini.";
 if(isAsleep(S))return "Chut, il dort : les bonbons attendront.";
 if(S.treatDay===dayKey(curIdx(S)))return "Déjà servi aujourd'hui : reviens demain.";
 return "";
}
export function itemBlock(S,it){
 // Nobody is fed, washed or walked in their sleep: this covers the free bread too.
 if(isNight(S))return "Il dort jusqu'à 6 h";
 if(S.sleeping)return "Il fait la sieste : rallume la lumière";
 if(S.fm<it.price)return `Il manque ${it.price-S.fm} FM`;
 if(it.key==="bread"&&S.breadIdx===curIdx(S))return "Déjà servi cette heure";
 if(it.key==="coffee"&&S.coffeeDay===dayKey(curIdx(S))&&S.coffees>=3)return "Trois cafés par jour";
 return "";
}

// ---------- mutations (server side) ----------
function ensureDay(S){if(!sameDay(S)){S.visitDay=dayKey(curIdx(S));S.visitsToday=0;S.actsToday=0;}}
function ensureWindow(S){if(curIdx(S)-S.actWindow>=XP.visitGap){S.actWindow=curIdx(S);S.actsVisit=0;}}
function addXp(S,v){
 const before=S.lvl;
 S.xp=Math.max(xpFloor(S.lvl),S.xp+v);              // XP can fall, but never below the current level
 while(S.lvl<100&&S.xp>=xpFloor(S.lvl+1))S.lvl++;
 if(S.lvl===before)return;
 S.best=Math.max(S.best,S.lvl);
 const s0=stage(before),s1=stage(S.lvl),from=people[S.camp][s0],to=people[S.camp][s1];
 if(s1!==s0)log(S,"evolve",`Passation de pouvoir : ${from.name} laisse la place à ${to.name} au niveau ${S.lvl}.`,{from:from.name,fromLvl:before,to:to.name,lvl:S.lvl});
 else if(S.lvl<100)log(S,"level",`Niveau ${S.lvl} !`,{lvl:S.lvl});
 if(S.lvl===100)log(S,"legend",`Niveau 100 : ${to.name} devient la légende de la collection !`,{name:to.name,fromLvl:before});
}
// A visit pays once per 2 h, 8 times a day, never asleep: reopening the page does not farm XP.
function registerVisit(S){
 ensureDay(S);
 if(isAsleep(S)||curIdx(S)-S.lastVisit<XP.visitGap||S.visitsToday>=XP.visitsPerDay)return false;
 S.visitsToday++;S.lastVisit=curIdx(S);S.actsVisit=0;S.actWindow=curIdx(S);addXp(S,XP.visit);return true;
}
function spendActivity(S){ensureDay(S);ensureWindow(S);S.energy=clamp(S.energy-8);S.moral=clamp(S.moral+10);S.actsVisit++;S.actsToday++;addXp(S,XP.activity);}
function applyItem(S,it){
 S.fm-=it.price;
 for(const [k,v] of Object.entries(it.fx))S[k]=clamp(S[k]+v);
 if(it.key==="bread")S.breadIdx=curIdx(S);
 if(it.key==="coffee"){const d=dayKey(curIdx(S));if(S.coffeeDay!==d){S.coffeeDay=d;S.coffees=0;}S.coffees++;}
}
// One hour of life: needs drain, 2 FM come in, XP follows the WORST gauge.
function tickHour(S,idx,random){
 const nightHour=hodOf(idx)<ECO.nightEnd,night=nightHour||S.sleeping,d=night?ECO.night:ECO.awake;
 let dm=d.moral;if(!night){if(S.sat<25)dm+=6;if(S.hyg<25)dm+=6;}
 S.sat=clamp(S.sat-d.sat);S.moral=clamp(S.moral-dm);S.energy=clamp(S.energy-d.energy);S.hyg=clamp(S.hyg-d.hyg);
 S.fm=Math.min(ECO.cap,S.fm+ECO.income);
 const m=Math.min(S.sat,S.moral,S.energy,S.hyg);
 if(m>=XP.excellent){S.form="Excellente";S.mult=1.25;S.streak++;S.neg=0;S.bestStreak=Math.max(S.bestStreak,S.streak);}
 else if(m>=XP.correct){S.form="Correcte";S.mult=1;S.streak=0;S.neg=0;}
 else if(m>0){S.form="Négligée";S.streak=0;S.neg++;S.mult=Math.max(0,0.5-0.05*(S.neg-1));}
 else{S.form="Abandonnée";S.streak=0;S.neg++;S.mult=-0.5;}
 S.zero=m===0?S.zero+1:0;
 // A daytime nap rests the body, not the career: passive XP is halved, so sleeping all day never pays.
 addXp(S,XP.base*S.mult*(1+Math.min(XP.streakCap,XP.streakStep*S.streak))*(S.sleeping&&!nightHour?XP.napFactor:1));
 if(S.sleeping&&S.energy>=100){S.sleeping=false;log(S,"wake",`${person(S).name} se réveille de sa sieste, en pleine forme.`);}
 if(!night&&S.zero===0&&random()<stressChance(S))stressHit(S,random);
}
function stressHit(S,random,factor=1){
 const p=person(S),i=Math.floor(random()*stresses[p.name].length),s=stresses[p.name][i],hit=STRESS_HIT*factor;
 S.moral=clamp(S.moral-hit);
 log(S,"stress",`${factor>1?`Quitte ou double perdu ! Stress ×${factor}`:"Stress"} de ${p.name} : ${s.trigger}. « ${s.line} » (moral −${hit})`,{name:p.name,i,factor});
}
// A death (or a resignation) restarts at level 1 in place: the object identity is kept for the server cache.
function die(S,reason,camp=S.camp){
 const name=person(S).name,keep={journal:S.journal,jn:S.jn,deaths:S.deaths+1,best:S.best,bestStreak:S.bestStreak,equipped:S.equipped,treatDay:S.treatDay};
 const fresh=Object.assign(freshState(camp,S.vclock),keep,{lastReal:S.lastReal,diedAt:S.vclock});
 for(const k of Object.keys(S))delete S[k];
 Object.assign(S,fresh);
 log(S,"death",reason==="resign"
  ?`Démission de ${name}. Nouveau départ au niveau 1 avec ${person(S).name}.`
  :`Mort politique de ${name} : ${XP.deathHours} h avec une jauge à zéro. Nouveau départ au niveau 1.`,{name,reason,camp});
}
// Brings a state up to real time (speed > 1 only on a test server). Returns true when an hour ticked.
export function advance(S,realNow,speed=1,random=Math.random){
 if(!Number.isFinite(realNow))return false;                    // a bad clock reading must never poison the state
 // A clock stepping back (NTP, VM resume) pauses the game instead of replaying the same minutes twice.
 if(realNow>S.lastReal){S.vclock+=(realNow-S.lastReal)*speed;S.lastReal=realNow;}
 const h0=S.hourIdx;
 while(Math.floor(S.vclock/H)>S.hourIdx){
  tickHour(S,S.hourIdx,random);S.hourIdx++;
  if(S.zero>=XP.deathHours){die(S,"neglect");break;}
 }
 if(S.pong&&realNow-S.pong.t>PONG_RULES.timeoutSeconds*1000)S.pong=null;
 if(miniExpired(S,realNow))S.mini=null;
 return S.hourIdx!==h0;
}
// After the server was down: the game goes back on the real hour, and the downtime is skipped, not played.
// No gauge drains, no FM or XP comes in, nobody dies because the server was off. Returns the skipped ms.
// A test server running faster than real time is already ahead, and stays as it is.
export function resync(S,realNow){
 if(!Number.isFinite(realNow))return 0;
 const target=Math.max(S.vclock,realNow),skipped=target-S.vclock;
 S.vclock=target;S.hourIdx=Math.max(S.hourIdx,Math.floor(target/H));S.lastReal=realNow;
 if(S.pong&&realNow-S.pong.t>PONG_RULES.timeoutSeconds*1000)S.pong=null;
 if(miniExpired(S,realNow))S.mini=null;
 if(skipped>=15*60000)log(S,"sync",`Maintenance du serveur (${duration(skipped)}) : ce temps est sauté, l'horloge est recalée sur l'heure réelle. Jauges inchangées.`,{skipped});
 return skipped;
}
function duration(ms){
 const m=Math.round(ms/60000),d=Math.floor(m/1440),h=Math.floor(m%1440/60),min=m%60;
 return [d&&`${d} j`,h&&`${h} h`,min&&`${min} min`].filter(Boolean).join(" ");
}
const fail=error=>({ok:false,error}),done=(info={})=>({ok:true,...info});
// Every player action goes through here, on the server, after bringing the state up to date. event: the seasonal
// event running now on the server's clock (eventAt), "" outside one.
export function act(S,a,{now,speed=1,random=Math.random,event=""}){
 advance(S,now,speed,random);
 const type=a&&typeof a.type==="string"?a.type:"";
 switch(type){
 case "buy":{
  const it=shop.find(i=>i.key===a.key);if(!it)return fail("Article inconnu.");
  const e=itemBlock(S,it);if(e)return fail(e+".");
  applyItem(S,it);const visit=registerVisit(S);
  log(S,"buy",`${itemName(it,S.camp,event)} : ${it.price?"−"+it.price+" FM":"gratuit"}, ${fxText(it.fx)}${visit?`, visite +${XP.visit} XP`:""}.`,{key:it.key,visit});
  return done({visit});
 }
 case "debate":case "pongStart":{
  const e=activityBlock(S);if(e)return fail(e);
  const visit=registerVisit(S);spendActivity(S);
  if(type==="debate"){
   const line=pongLine(S.camp,event,random);
   S.rematchT=S.vclock;S.mini={k:"debate",t:now};S.pong=null;
   log(S,"act",`Débat chrono : +${XP.activity} XP, énergie −8, moral +10${visit?`, visite +${XP.visit} XP`:""}.`,{kind:"debate",line,visit});
  }else{
   S.pong={t:now};S.mini=null;S.rematchT=-1;
   log(S,"act",`Pong des arguments : +${XP.activity} XP${visit?`, visite +${XP.visit} XP`:""}.`,{kind:"pong",visit});
  }
  return done({visit});
 }
 case "manifStart":{
  const e=activityBlock(S);if(e)return fail(e);
  const visit=registerVisit(S);spendActivity(S);
  const k=manifGame(S);S.mini={k,t:now};S.pong=null;S.rematchT=-1;
  log(S,"act",`${MINI[k].label} : +${XP.activity} XP${visit?`, visite +${XP.visit} XP`:""}.`,{kind:"manif",game:k,visit});
  return done({visit,game:k});
 }
 case "miniEnd":{
  if(!S.mini)return fail("Aucune partie en cours.");
  const k=S.mini.k,cfg=MINI[k],secs=(now-S.mini.t)/1000,sc=a.score;S.mini=null;   // consumed even when refused: no replay
  if(!Number.isInteger(sc)||sc<0||sc>cfg.maxScore||secs<MINI_RULES.minSeconds||sc>Math.ceil(secs*cfg.perSecond)+1)return fail("Score refusé.");
  const bonus=Math.min(cfg.bonusCap,Math.floor(sc*cfg.bonusRate));addXp(S,bonus);
  const text=k==="debate"?`Débat chrono : ${sc} argument${sc>1?"s":""} dans la ligne, bonus d'éloquence +${bonus} XP.`
   :k==="cortege"?`Le Cortège : score ${sc}, bonus de terrain +${bonus} XP.`
   :`L'Épervier : ${sc} point${sc>1?"s":""}, bonus d'ordre public +${bonus} XP.`;
  log(S,"mini",text,{game:k,score:sc,bonus,great:sc>=cfg.great&&!greatAnnounced(S)});
  return done({bonus,game:k});
 }
 case "rematch":{
  const e=rematchBlock(S);if(e)return fail(e);
  S.rematchT=-1;
  if(random()<DOUBLE.odds){
   S.moral=clamp(S.moral+DOUBLE.moral);S.energy=clamp(S.energy+DOUBLE.energy);
   const line=pongLine(S.camp,event,random);
   log(S,"act",`Quitte ou double gagné ! Moral +${DOUBLE.moral}, énergie +${DOUBLE.energy}.`,{kind:"rematch",line});
   return done({win:true});
  }
  stressHit(S,random,DOUBLE.stressFactor);
  return done({win:false});
 }
 case "pongEnd":{
  if(!S.pong)return fail("Aucun débat en cours.");
  const secs=(now-S.pong.t)/1000,sc=a.score;S.pong=null;
  if(!Number.isInteger(sc)||sc<0||sc>PONG_RULES.maxScore||secs<PONG_RULES.minSeconds||sc>Math.ceil(secs*PONG_RULES.returnsPerSecond)+1)return fail("Score refusé.");
  const bonus=Math.min(PONG_RULES.bonusCap,sc*PONG_RULES.bonusPerReturn);addXp(S,bonus);
  log(S,"pong",`Fin du débat : ${sc} renvoi${sc>1?"s":""}, bonus d'éloquence +${bonus} XP.`,{score:sc,bonus});
  return done({bonus});
 }
 case "light":{
  if(isNight(S))return fail("C'est la nuit : il dort jusqu'à 6 h.");
  if(!S.sleeping){S.sleeping=true;log(S,"nap",`Lumière éteinte : ${person(S).name} fait la sieste.`,{on:true});return done({on:true});}
  S.sleeping=false;
  const grumpy=S.energy<60;if(grumpy)S.moral=clamp(S.moral-3);
  log(S,"nap",grumpy?"Réveillé trop tôt, il grogne : moral −3.":"Lumière rallumée : fin de la sieste.",{on:false,grumpy});
  return done({on:false,grumpy});
 }
 case "equip":{
  const p=person(S);if(a.i!==0&&a.i!==1)return fail("Objet inconnu.");
  if(a.i===1)S.equipped[p.name]=1;else delete S.equipped[p.name];
  log(S,"equip",`${personalItems[p.name][a.i].name} équipé.`);return done();
 }
 case "pet":{
  if(isNight(S))return fail("Zzz… il dort. Revenez après 6 h.");
  if(S.sleeping)return fail("Zzz… il fait la sieste. Rallume la lumière dans Soins.");
  const petted=S.petIdx!==curIdx(S);if(petted){S.petIdx=curIdx(S);S.moral=clamp(S.moral+2);}
  return done({petted});
 }
 case "restart":{
  // Resigning counts as a political death on the leaderboard, so rerolling a bad start never pays.
  if(!CAMPS.includes(a.camp))return fail("Camp inconnu.");
  // One resignation an hour: the live feed cannot be flooded with deaths. The date is kept in the state, not
  // looked up in the journal, which forty quick actions would scroll past.
  if(S.diedAt>=0&&S.vclock-S.diedAt<H)return fail("Une démission par heure, pas plus : laisse-lui le temps de faire campagne.");
  die(S,"resign",a.camp);return done();
 }
 case "treat":{
  // The day is kept across a resignation (die keeps treatDay): one treat a day, whatever happens.
  const e=treatBlock(S,event);if(e)return fail(e);
  S.treatDay=dayKey(curIdx(S));S.moral=clamp(S.moral+HALLOWEEN.treat.moral);
  const l=HALLOWEEN.treat.lines[S.camp],line=l[Math.floor(random()*l.length)];
  log(S,"treat",`Des bonbons ou un amendement ? ${line} Moral +${HALLOWEEN.treat.moral}.`,{line});
  return done();
 }
 default:return fail("Action inconnue.");
 }
}

// ===================================================================== DUELS
// A small seeded generator (mulberry32): the same seed deals the same debate in the browser and on the server.
export function seeded(seed){
 let a=seed>>>0;
 return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
}
// The rounds of a debate: question i, and the order its answers show in (indexes into ANSWER_KINDS). Dealt like a
// deck: every question once before any comes back, and never the same one twice running across a reshuffle.
// count: how many questions the deck holds (more than QUESTIONS only for a solo debate in costume).
export function debateRounds(random,n=DUEL.maxPicks+1,count=QUESTIONS.length){
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const out=[];let deck=[],last=-1;
 while(out.length<n){
  if(!deck.length)deck=shuffle(Array.from({length:count},(_,i)=>i).filter(i=>i!==last));
  last=deck.pop();out.push({i:last,order:shuffle([0,1,2])});
 }
 return out;
}
// Replays a duel debate: picks = [[answer shown 0-2, ms since play started], ...], as the browser recorded them.
// Picks after the final whistle are not counted. Returns null when the picks cannot come from the game (bad shape,
// faster than the screen allows, too many).
export function replayDebate(seed,camp,picks){
 if(!Array.isArray(picks)||picks.length>DUEL.maxPicks)return null;
 const rounds=debateRounds(seeded(seed),picks.length);
 let lost=0,prev=-Infinity,points=0,errors=0,last=0;
 for(let k=0;k<picks.length;k++){
  const p=picks[k];
  if(!Array.isArray(p)||p.length!==2)return null;
  const [n,t]=p;
  if(!Number.isInteger(n)||n<0||n>2||!Number.isInteger(t)||t<0||t-prev<DUEL.minGap)return null;
  prev=t;
  if(MINI.debate.ms-lost-t<=0)continue;
  last=t;
  if(ANSWER_KINDS[rounds[k].order[n]]===camp)points++;else{errors++;lost+=DEBATE.penalty;}
 }
 return {points,errors,last};
}
// Why this candidate cannot play a duel right now ("" when he can).
export function duelBlock(S,minLevel=DUEL.minLevel){
 if(isNight(S))return "Chut, il dort.";
 if(S.sleeping)return "Il fait la sieste : rallume la lumière d'abord.";
 if(S.lvl<minLevel)return `Les duels s'ouvrent au niveau ${minLevel}.`;
 return "";
}
// A duel's outcome on one candidate: "win" (its XP only when paid), "loss", "tie", or "chicken" (the challenged
// player refused or let it expire). The text says what really changed, after the level and gauge floors.
export function duelApply(S,res,{vs="?",mine=0,theirs=0,paid=true}={}){
 const before={xp:S.xp,moral:S.moral,energy:S.energy};
 const lower=(k,v)=>{if(S[k]>DUEL.floor)S[k]=Math.max(DUEL.floor,S[k]+v);};
 if(res==="win"){addXp(S,paid?DUEL.win.xp:0);S.moral=clamp(S.moral+DUEL.win.moral);S.energy=clamp(S.energy+DUEL.win.energy);}
 else if(res==="loss"){addXp(S,DUEL.loss.xp);lower("moral",DUEL.loss.moral);lower("energy",DUEL.loss.energy);}
 else if(res==="tie")S.moral=clamp(S.moral+DUEL.tie.moral);
 else if(res==="chicken")S.moral=clamp(S.moral+DUEL.chicken.moral);
 else return false;
 const dxp=Math.round(S.xp-before.xp),fx={moral:Math.round(S.moral-before.moral),energy:Math.round(S.energy-before.energy)};
 const parts=[dxp&&`${dxp>0?"+":"−"}${Math.abs(dxp)} XP`,fxText(Object.fromEntries(Object.entries(fx).filter(([,v])=>v)))].filter(Boolean).join(", ")||"rien ne bouge";
 const text=res==="win"?`Duel gagné contre ${vs} au Débat chrono, ${mine} à ${theirs} : ${parts}.`
  :res==="loss"?`Duel perdu contre ${vs} au Débat chrono, ${mine} à ${theirs} : ${parts}.`
  :res==="tie"?`Match nul contre ${vs} au Débat chrono, ${mine} partout : ${parts}.`
  :`${vs} a esquivé ton défi : ${parts}.`;
 log(S,"duel",text,{res,vs,mine,theirs});
 return true;
}

// "v1.3.0", "1.3.0" and "v1.3.0-3-gabc1234" (a commit after the tag) are the same release; "dev" is none.
export const releaseOf=v=>{const m=/^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:[-+][0-9A-Za-z.+-]*)?$/.exec(String(v??""));return m?`${+m[1]}.${+m[2]}.${+m[3]}`:null;};
// Release order, numerically ("1.10.0" after "1.9.2").
export const cmpRelease=(a,b)=>{const x=a.split(".").map(Number),y=b.split(".").map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;};
