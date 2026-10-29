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
 left:["Et les riches ?","Réac !","Et le climat ?","Cadeaux fiscaux !","Et vos affaires ?","Les patrons d'abord ?"],
 right:["Et la dette ?","Utopiste !","Et l'insécurité ?","Assistanat !","Bobo !","Vous taxez tout !"]
};
export const fxNames={sat:"satiété",moral:"moral",energy:"énergie",hyg:"hygiène"};

// ===================================================================== RULES
// Everything below takes the companion state S as an argument. The server is the only one that MUTATES
// a state (advance, act); the browser imports the same module for the read-only checks it displays.
export const H=3600000;
export const ECO={income:2,cap:99,nightEnd:6,awake:{sat:13,moral:4,energy:8,hyg:6},night:{sat:4,moral:2,energy:-15,hyg:2}};
// Tuned by simulation: 6 visits + 6 activities a day reach level 100 on day 15; 3 bare visits survive and reach it on day ~39.
export const XP={base:5,visit:25,visitGap:2,visitsPerDay:8,activity:30,actsPerVisit:2,actsPerDay:8,deathHours:12,
 excellent:50,correct:25,a:17,b:1.15,streakStep:0.01,streakCap:0.25,stressMin:0.03,stressMax:0.15,napFactor:0.5};
// The hourly stress risk follows his moral: 3 % at full moral, 15 % at rock bottom. A sulking candidate spirals.
export const stressChance=S=>XP.stressMin+(XP.stressMax-XP.stressMin)*(100-S.moral)/100;
// "Quitte ou double": right after a debate, a free rematch. Heads, moral and energy come back; tails, a stress hits twice as hard.
export const STRESS_HIT=5;
export const DOUBLE={odds:0.5,moral:12,energy:12,window:H,stressFactor:2};
// The Pong is played in the browser, so its result is checked: no more than ~1.5 returns a second, within 90 s.
export const PONG_RULES={maxScore:30,minSeconds:2,timeoutSeconds:90,returnsPerSecond:1.5,bonusPerReturn:2,bonusCap:20};
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
  sleeping:false,equipped:{},deaths:0,jn:0,journal:[],pong:null,rematchT:-1};
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
 for(const k of ["visitDay","coffeeDay"])o[k]=int(s[k],-1,1e9,-1);
 for(const k of ["visitsToday","actsToday","actsVisit","coffees"])o[k]=int(s[k],0,50,0);
 o.form=FORMS.includes(s.form)?s.form:"Correcte";o.mult=num(s.mult,-0.5,1.25,1);o.sleeping=s.sleeping===true;
 if(s.equipped&&typeof s.equipped==="object")for(const name of Object.keys(personalItems))if(s.equipped[name]===1)o.equipped[name]=1;
 if(Array.isArray(s.journal))o.journal=s.journal.filter(j=>j&&Number.isFinite(j.n)&&Number.isFinite(j.t)&&typeof j.k==="string"&&typeof j.text==="string")
  .slice(0,40).map(j=>{const e={n:j.n,t:j.t,k:j.k.slice(0,12),text:j.text.slice(0,300)};
   if(j.d&&typeof j.d==="object"&&JSON.stringify(j.d).length<400)e.d=j.d;return e;});
 o.jn=Math.max(o.jn,...o.journal.map(j=>j.n),0);
 if(s.pong&&Number.isFinite(s.pong.t))o.pong={t:s.pong.t};
 o.rematchT=num(s.rematchT,-1,o.vclock,-1);
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
 const name=person(S).name,keep={journal:S.journal,jn:S.jn,deaths:S.deaths+1,best:S.best,bestStreak:S.bestStreak,equipped:S.equipped};
 const fresh=Object.assign(freshState(camp,S.vclock),keep,{lastReal:S.lastReal});
 for(const k of Object.keys(S))delete S[k];
 Object.assign(S,fresh);
 log(S,"death",reason==="resign"
  ?`Démission de ${name}. Nouveau départ au niveau 1 avec ${person(S).name}.`
  :`Mort politique de ${name} : ${XP.deathHours} h avec une jauge à zéro. Nouveau départ au niveau 1.`,{name,reason,camp});
}
// Brings a state up to real time (speed > 1 only on a test server). Returns true when an hour ticked.
export function advance(S,realNow,speed=1,random=Math.random){
 if(!Number.isFinite(realNow))return false;                    // a bad clock reading must never poison the state
 const dt=Math.max(0,realNow-S.lastReal);S.lastReal=realNow;S.vclock+=dt*speed;
 const h0=S.hourIdx;
 while(Math.floor(S.vclock/H)>S.hourIdx){
  tickHour(S,S.hourIdx,random);S.hourIdx++;
  if(S.zero>=XP.deathHours){die(S,"neglect");break;}
 }
 if(S.pong&&realNow-S.pong.t>PONG_RULES.timeoutSeconds*1000)S.pong=null;
 return S.hourIdx!==h0;
}
const fail=error=>({ok:false,error}),done=(info={})=>({ok:true,...info});
// Every player action goes through here, on the server, after bringing the state up to date.
export function act(S,a,{now,speed=1,random=Math.random}){
 advance(S,now,speed,random);
 const type=a&&typeof a.type==="string"?a.type:"";
 switch(type){
 case "buy":{
  const it=shop.find(i=>i.key===a.key);if(!it)return fail("Article inconnu.");
  const e=itemBlock(S,it);if(e)return fail(e+".");
  applyItem(S,it);const visit=registerVisit(S);
  log(S,"buy",`${it[S.camp]} : ${it.price?"−"+it.price+" FM":"gratuit"}, ${fxText(it.fx)}${visit?`, visite +${XP.visit} XP`:""}.`,{key:it.key,visit});
  return done({visit});
 }
 case "debate":case "pongStart":{
  const e=activityBlock(S);if(e)return fail(e);
  const visit=registerVisit(S);spendActivity(S);
  if(type==="debate"){
   const l=pongLines[S.camp],line=l[Math.floor(random()*l.length)];
   S.rematchT=S.vclock;
   log(S,"act",`Débat : +${XP.activity} XP, énergie −8, moral +10${visit?`, visite +${XP.visit} XP`:""}.`,{kind:"debate",line,visit});
  }else{
   S.pong={t:now};S.rematchT=-1;
   log(S,"act",`Pong des arguments : +${XP.activity} XP${visit?`, visite +${XP.visit} XP`:""}.`,{kind:"pong",visit});
  }
  return done({visit});
 }
 case "rematch":{
  const e=rematchBlock(S);if(e)return fail(e);
  S.rematchT=-1;
  if(random()<DOUBLE.odds){
   S.moral=clamp(S.moral+DOUBLE.moral);S.energy=clamp(S.energy+DOUBLE.energy);
   const l=pongLines[S.camp],line=l[Math.floor(random()*l.length)];
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
  // One resignation an hour: the live feed cannot be flooded with deaths.
  const lastDeath=S.journal.find(j=>j.k==="death");
  if(lastDeath&&S.vclock-lastDeath.t<H)return fail("Une démission par heure, pas plus : laisse-lui le temps de faire campagne.");
  die(S,"resign",a.camp);return done();
 }
 default:return fail("Action inconnue.");
 }
}
