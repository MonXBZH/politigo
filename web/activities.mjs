// Missions, voter mail, daily goals and the Flamme (the long-run "ferveur" meter). Same effects in both camps, only
// the names change. Gauges only (clamped 0-100) and bulletins for the Tombola / Loterie: never XP, never FM.
// rules.mjs bindings are only used inside functions (the modules import each other).
import {clamp,dayKey,curIdx,hodOf,clockOf,isAsleep,fxText,logEntry} from "./rules.mjs";

const MIN=60000,HOUR=60*MIN;
// ===================================================================== DATA
export const MISSIONS=[
 {id:"tract",left:"Tractage au marché",right:"Serrage de mains au marché",ms:30*MIN,fx:{moral:12,energy:-8}},
 {id:"ag",left:"AG à la Bourse du travail",right:"Petit-déjeuner avec la CCI",ms:HOUR,fx:{moral:10,sat:10,energy:-10}},
 {id:"piquet",left:"Piquet de grève solidaire",right:"Visite d'une PME qui exporte",ms:2*HOUR,fx:{moral:20,energy:-15,hyg:-10}},
 {id:"fete",left:"Concert à la Fête de l'Huma",right:"Gala de charité au polo",ms:3*HOUR,fx:{moral:25,sat:15,energy:-20,hyg:-15}},
 {id:"repos",left:"Retraite en gîte coopératif",right:"Thalasso à La Baule",ms:4*HOUR,fx:{energy:30,hyg:20,moral:5,sat:-10}},
 // Heads or tails at report time: a win, or a public flop.
 {id:"risque",left:"Manif sauvage",right:"Débat télé face à l'opposition",ms:2*HOUR,fx:{moral:25},risk:{p:0.5,fx:{moral:-15,hyg:-10}}},
 // Only from 20:00 to 23:59 (game clock), even with the light off: it is the night out.
 {id:"nuit",left:"Nuit debout place de la République",right:"Soirée au Fouquet's",ms:8*HOUR,fx:{moral:20,energy:-30},night:true}
];
export const MISSION_RULES={perDay:4,minEnergy:15,nightFrom:20};
export const missionOf=id=>MISSIONS.find(m=>m.id===id)||null;
export const missionName=(m,camp)=>(typeof m==="string"?missionOf(m):m)?.[camp]??"";

// Letters from voters: each answer has a small effect on the candidate's gauges and a line for the journal.
// Funny, factual, as unfair to both camps.
const L=(id,from,text,answers)=>({id,from,text,answers:answers.map(([text,fx,reply])=>({text,fx,reply}))});
export const LETTERS={
 left:[
  L("l_velo","Clémence, Lyon","J'ai voté pour vous pour les pistes cyclables. Maintenant je pédale en vélo-cargo sur 40 cm, entre un bus et un SUV. Merci ?",
   [["Promettre une piste de trois mètres",{moral:6},"Elle attend la piste. Et le marquage au sol."],["Venir constater à vélo",{moral:10,energy:-6},"Constat fait : un SUV s'est garé sur la piste pendant la visite."]]),
  L("l_union","Bernard, Corrèze","Dans mon village il y a 312 habitants et 5 candidats de gauche. Je fais comment pour voter pour l'union ?",
   [["Annoncer une primaire",{moral:5},"Il y aura une primaire. Peut-être deux."],["Proposer un candidat unique : soi-même",{moral:8,hyg:-3},"Bernard a ri. Les quatre autres beaucoup moins."],["Ne pas répondre avant le congrès",{energy:5,moral:-4},"Le congrès est dans dix-huit mois."]]),
  L("l_greve","Nadia, Créteil","Je soutiens la grève à 100 %. Mais mon RER de 7 h 12 me soutenait aussi, et il a lâché.",
   [["Parler de convergence des luttes",{moral:6},"Elle converge à pied jusqu'à la gare suivante."],["Proposer un covoiturage militant",{moral:8,energy:-5},"Quatre syndicalistes dans une Twingo : solidarité totale."]]),
  L("l_isf","Jean-Pierre, Marseille","Mon voisin a un yacht. Moi j'ai un pédalo. Rétablissez l'ISF, au moins pour le yacht.",
   [["Promettre de rétablir l'ISF",{moral:8},"Supprimé en 2018, remplacé par l'IFI. Promesse notée."],["Taxer les yachts, pas les pédalos",{moral:6,sat:3},"La taxe sur les yachts existe depuis 2018 : elle rapporte très peu."]]),
  L("l_cantine","Lucas, 9 ans, Lille","À la cantine c'est menu végé le lundi. Mon papa dit que c'est la faute à la gauche. C'est vrai ?",
   [["Expliquer la loi Egalim",{moral:5},"Un menu végétarien par semaine : loi Egalim, 2018, votée sous Macron. Lucas est déçu."],["Promettre des frites bio",{moral:7,sat:4},"Lucas vote dans neuf ans. Il s'en souviendra."]]),
  L("l_retraite","Gérard, 63 ans, cheminot retraité","Vous aviez promis la retraite à 60 ans. J'en ai 63 et j'attends toujours l'apéro de la victoire.",
   [["Ressortir la banderole de 2023",{moral:8,energy:-4},"La réforme de 2023 a porté l'âge légal à 64 ans. La banderole a resservi."],["L'inviter à l'apéro quand même",{moral:6,sat:5},"Apéro sans victoire, mais avec cacahuètes."]]),
  L("l_smic","Inès, Montreuil","Le SMIC augmente de 2 %, mon loyer de 4 %. Je peux payer mon proprio en tracts ?",
   [["Promettre l'encadrement des loyers",{moral:7},"Il existe déjà à Paris, Lille, Lyon… et Montreuil. Le proprio a contesté."],["Lui offrir un café au local",{moral:5,energy:3},"Le café est gratuit. Le local est en sous-location."]]),
  L("l_reglement","Mme Lefèvre, professeure retraitée","J'ai regardé la séance de l'Assemblée hier. Douze rappels au règlement en une heure. C'est une matière au bac ?",
   [["Défendre l'obstruction parlementaire",{moral:4,energy:-3},"Elle a lu le règlement en entier : elle a des questions."],["Promettre une séance calme",{moral:6},"La séance suivante a duré quatre heures. Calmement."]]),
  L("l_rich","Théo, start-upper à Station F","Je suis de gauche, mais ma levée de fonds de 3 M€ me fait douter. C'est grave docteur ?",
   [["Lui parler de la taxe Zucman",{moral:6},"2 % au-delà de 100 M€ : il est rassuré, il en est loin."],["Lui proposer d'adhérer",{moral:8,hyg:2},"Il a adhéré par Apple Pay. Le trésorier est perplexe."]])
 ],
 right:[
  L("r_impots","Hervé, chef d'entreprise à Cholet","Je paie 45 % d'impôts sur le revenu et mon rond-point n'a toujours pas de sculpture.",
   [["Promettre une baisse d'impôts",{moral:7},"Tranche à 45 % depuis 2013. Le rond-point attend."],["Inaugurer une sculpture de rond-point",{moral:9,energy:-5},"Une pomme géante en inox. Hervé est ému."]]),
  L("r_dette","Monique, 78 ans, Versailles","3 300 milliards de dette ! Mon petit-fils me demande s'il pourra rembourser en cartes Pokémon.",
   [["Promettre la règle d'or",{moral:6},"Dette publique : environ 115 % du PIB en 2025. Les Pokémon ne sont pas acceptés."],["Lui offrir une calculatrice",{moral:5,sat:3},"Elle affiche 3,3e12. Monique trouve ça joli."]]),
  L("r_nain","Patrick, Var","On m'a volé mon nain de jardin. Je veux une caméra, un policier et un nain de remplacement.",
   [["Promettre plus de police municipale",{moral:7},"La police municipale du Var est passée. Pas le nain."],["Offrir un nain tricolore",{moral:9,sat:2},"Patrick l'a fixé au béton. Et à une alarme."],["Recommander une plainte en ligne",{energy:4,moral:-3},"La plainte en ligne existe. Le nain, plus."]]),
  L("r_tracteur","Jean-Marc, céréalier dans la Beauce","Pour tailler ma haie il me faut trois formulaires, deux autorisations et un tracteur de compétition.",
   [["Promettre un choc de simplification",{moral:6},"Le choc de simplification a été annoncé en 2013. Et 2018. Et 2024."],["Monter sur son tracteur pour la photo",{moral:9,hyg:-5},"Belle photo. Le formulaire reste à remplir."]]),
  L("r_heritage","Bertrand, Neuilly","Je veux léguer ma maison à mes enfants, pas à Bercy. Ils sont moins dépensiers.",
   [["Défendre l'abattement de 100 000 €",{moral:6},"Par parent et par enfant, tous les quinze ans. Bertrand prend des notes."],["Lui conseiller une assurance-vie",{moral:5,energy:3},"Il en a déjà quatre."]]),
  L("r_primaire","Sophie, militante depuis 1995","J'ai voté à quatre primaires et on n'a jamais eu de président. On essaie le tirage au sort ?",
   [["Promettre une primaire ouverte",{moral:5},"Ouverte, fermée, entrouverte : le débat est lancé."],["Proposer un sondage à la place",{moral:7,energy:-3},"Le sondage a désigné trois candidats. Tous déclarés."]]),
  L("r_tiktok","Chantal, Perpignan","Mon fils a adhéré au parti sur TikTok. Il croit que le Sénat est un influenceur.",
   [["Faire une vidéo sur le Sénat",{moral:8,energy:-4},"348 sénateurs, 12 vues. Dont Chantal."],["L'inviter au Palais du Luxembourg",{moral:6,sat:4},"Il a filmé les jardins. 2 millions de vues."]]),
  L("r_35h","Philippe, artisan boulanger","Je travaille 60 h par semaine, mon apprenti 35 h. C'est lui le patron ?",
   [["Promettre d'assouplir les 35 heures",{moral:7},"Loi Aubry, 2000 : toujours là, assouplie déjà vingt fois."],["Acheter dix croissants",{sat:8,moral:4},"Pur beurre. Le boulanger sourit, l'apprenti est en pause."]]),
  L("r_golf","Arnaud, Deauville","Mon club de golf veut taxer les voiturettes électriques. C'est le communisme qui commence ?",
   [["Le rassurer : c'est l'écologie",{moral:4,energy:2},"Il compte rouler au diesel jusqu'au trou 18."],["Venir jouer neuf trous avec lui",{moral:8,energy:-6},"Score : 54. Les électeurs du club ont apprécié l'effort."]])
 ]
};
export const MAIL={gapMin:30*MIN,gapMax:60*MIN,quietTo:7,bulletinEvery:3,first:30*MIN};
export const letterOf=id=>LETTERS.left.find(l=>l.id===id)||LETTERS.right.find(l=>l.id===id)||null;

// Daily goals: three a day out of these, each progressing on one or two counters (need). A one-counter goal keeps
// its count in n; a combo keeps a bit per counter reached.
export const GOALS=[
 {id:"visits3",left:"Militant modèle",right:"Entrepreneur de soi-même",need:{visits:3},fx:{moral:15},desc:"3 visites dans la journée"},
 {id:"minis2",left:"Tribun du peuple",right:"Orateur du Cercle",need:{minis:2},fx:{energy:15},desc:"2 mini-jeux ou débats terminés"},
 {id:"mission2",left:"Sur tous les fronts",right:"Agenda de ministre",need:{missions:2},fx:{sat:15},desc:"2 missions rapportées"},
 {id:"letters3",left:"Écrivain public",right:"Plume de l'Élysée",need:{letters:3},fx:{moral:10,hyg:5},desc:"3 lettres d'électeurs répondues"},
 {id:"care2",left:"Cantine solidaire",right:"Bon vivant",need:{buys:2},fx:{hyg:10},desc:"2 achats à la Buvette ou aux Soins"},
 {id:"combo",left:"Couteau suisse du terrain",right:"Homme-orchestre de la campagne",need:{missions:1,letters:1},fx:{moral:8,energy:8},desc:"1 mission rapportée et 1 lettre répondue"},
 {id:"pets3",left:"Câlin solidaire",right:"Main tendue",need:{pets:3},fx:{moral:10},desc:"3 caresses, à des heures différentes"}
];
export const GOALS_PER_DAY=3;
export const goalOf=id=>GOALS.find(g=>g.id===id)||null;
const keys=g=>Object.keys(g.need),combo=g=>keys(g).length>1;
const goalNeed=g=>combo(g)?keys(g).length:g.need[keys(g)[0]];
const goalHave=(g,n)=>combo(g)?keys(g).filter((_,i)=>n>>i&1).length:Math.min(n,goalNeed(g));

// The Flamme: a finished calendar day scores at most 10. A day without a visit burns 10 %, a death 25 %.
export const FLAME={gauges:3,goals:3,visits:2,visitsMin:4,spanH:8,missions:1,missionsMin:2,letters:1,lettersMin:3,idle:0.9,death:0.75,gaugeMin:50};
export const flameOf=S=>Math.floor(S.flame?.pts||0);

// ===================================================================== STATE
const minGauge=S=>Math.min(S.sat,S.moral,S.energy,S.hyg);
const flameLog=S=>({hours:[],min:minGauge(S),missions:0,letters:0,goals:0});
// The new fields of a fresh state (rules.mjs freshState); goals are drawn at the first advance (they need random).
export function freshActivities(S,now){
 const d=dayKey(Math.floor(now/HOUR));
 return {missions:{cur:null,day:d,n:0},mail:{next:now+MAIL.first,letter:null,day:d,n:0},goals:{day:-1,list:[]},
  flame:{pts:0,day:d,log:flameLog(S)}};
}
// Re-derives the stored fields over o (a fresh state of the same camp): nothing malformed survives a load.
export function sanitizeActivities(s,o){
 const num=(v,min,max,def)=>Number.isFinite(v)?Math.min(max,Math.max(min,v)):def,int=(v,min,max,def)=>Math.round(num(v,min,max,def));
 const day=v=>int(v,-1,99991231,-1),V=o.vclock;
 const m=s.missions;
 if(m&&typeof m==="object"){
  o.missions.day=day(m.day);o.missions.n=int(m.n,0,MISSION_RULES.perDay,0);
  const c=m.cur,def=c&&missionOf(c.id);
  if(def&&Number.isFinite(c.start)&&c.start<=V&&c.start>=0)o.missions.cur={id:def.id,start:c.start,end:c.start+def.ms,notified:c.notified===true};
 }
 const ml=s.mail;
 if(ml&&typeof ml==="object"){
  o.mail.next=num(ml.next,0,V+MAIL.gapMax,o.mail.next);o.mail.day=day(ml.day);o.mail.n=int(ml.n,0,99,0);
  const l=ml.letter;if(l&&LETTERS[o.camp].some(x=>x.id===l.id)&&Number.isFinite(l.t))o.mail.letter={id:l.id,t:num(l.t,0,V,V)};
 }
 const g=s.goals;
 if(g&&typeof g==="object"&&Array.isArray(g.list)){
  const seen=new Set();
  o.goals.day=day(g.day);
  o.goals.list=g.list.filter(x=>x&&goalOf(x.id)&&!seen.has(x.id)&&seen.add(x.id)).slice(0,GOALS_PER_DAY).map(x=>{
   const G=goalOf(x.id),n=int(x.n,0,combo(G)?(1<<keys(G).length)-1:goalNeed(G),0);return {id:G.id,n,done:x.done===true&&goalHave(G,n)>=goalNeed(G)};});
  if(o.goals.list.length<GOALS_PER_DAY)o.goals={day:-1,list:[]};   // an incomplete day is drawn again
 }
 const f=s.flame;
 if(f&&typeof f==="object"){
  o.flame.pts=num(f.pts,0,1e6,0);o.flame.day=day(f.day);
  const lg=f.log;
  if(lg&&typeof lg==="object"){
   o.flame.log={hours:Array.isArray(lg.hours)?lg.hours.filter(h=>Number.isInteger(h)&&h>=0&&h<24).slice(0,24):[],min:num(lg.min,0,100,o.flame.log.min)};
   for(const k of ["missions","letters","goals"])o.flame.log[k]=int(lg[k],0,99,0);
  }
 }
}

// ===================================================================== READ-ONLY CHECKS
const today=S=>dayKey(curIdx(S));
export const missionsToday=S=>S.missions.day===today(S)?S.missions.n:0;
export const missionReady=S=>!!S.missions.cur&&S.vclock>=S.missions.cur.end;
export const missionLeft=S=>S.missions.cur?Math.max(0,S.missions.cur.end-S.vclock):0;
// Why this mission cannot start now ("" when it can).
export function missionBlock(S,id){
 const m=missionOf(id);if(!m)return "Mission inconnue.";
 if(S.missions.cur)return missionReady(S)?"Lis d'abord le rapport de la mission précédente.":"Une mission à la fois : la précédente n'est pas finie.";
 if(missionsToday(S)>=MISSION_RULES.perDay)return "Quatre missions par jour maximum.";
 if(m.night){const h=clockOf(S.vclock).hour;return h>=MISSION_RULES.nightFrom?"":"Celle-ci se lance le soir, de 20 h à minuit.";}
 if(isAsleep(S))return S.sleeping?"Il fait la sieste : rallume la lumière d'abord.":"Chut, il dort.";
 if(S.energy<MISSION_RULES.minEnergy)return "Trop fatigué pour partir en mission : un café ou une sieste d'abord.";
 return "";
}
export const mailWaiting=S=>!!S.mail.letter;
export const lettersToday=S=>S.mail.day===today(S)?S.mail.n:0;
// Today's goals as the browser shows them.
export const goalView=S=>S.goals.list.map(x=>{const G=goalOf(x.id);return {id:x.id,name:G[S.camp],desc:G.desc,fx:G.fx,have:goalHave(G,x.n),need:goalNeed(G),done:x.done};});

// ===================================================================== MUTATIONS (server side)
const applyFx=(S,fx)=>{for(const [k,v] of Object.entries(fx))S[k]=clamp(S[k]+v);};
const bulletin=(S,n=1)=>{S.wardrobe.bulletins=Math.min(9999,S.wardrobe.bulletins+n);};
// The lowest gauge seen today: after every hour tick and every action.
export function trackMin(S){if(S.flame?.log)S.flame.log.min=Math.min(S.flame.log.min,minGauge(S));}
// A counter moved (visits, minis, missions, letters, buys, pets): today's goals follow, and pay once reached.
export function progress(S,kind,k=1){
 if(S.goals.day!==today(S))return;
 for(const x of S.goals.list){
  const G=goalOf(x.id);if(x.done||!G||!(kind in G.need))continue;
  if(combo(G))x.n|=1<<keys(G).indexOf(kind);else x.n=Math.min(goalNeed(G),x.n+k);
  if(goalHave(G,x.n)<goalNeed(G))continue;
  x.done=true;applyFx(S,G.fx);bulletin(S);S.flame.log.goals++;
  logEntry(S,"goal",`Objectif du jour atteint, « ${G[S.camp]} » : ${fxText(G.fx)}, +1 bulletin.`,{id:G.id});
 }
}
// A paid visit (rules.mjs registerVisit): its hour for the Flamme, and the goals.
export function onVisit(S){const h=hodOf(curIdx(S));if(S.flame.log.hours.length<24)S.flame.log.hours.push(h);progress(S,"visits");}
// The finished day's Flamme points (at most 10).
export function dayScore(lg,goalsDone){
 if(!lg.hours.length)return 0;
 let p=0;
 if(lg.min>=FLAME.gaugeMin)p+=FLAME.gauges;
 if(goalsDone>=GOALS_PER_DAY)p+=FLAME.goals;
 if(lg.hours.length>=FLAME.visitsMin&&Math.max(...lg.hours)-Math.min(...lg.hours)>=FLAME.spanH)p+=FLAME.visits;
 if(lg.missions>=FLAME.missionsMin)p+=FLAME.missions;
 if(lg.letters>=FLAME.lettersMin)p+=FLAME.letters;
 return p;
}
const round2=v=>Math.round(v*100)/100;
// The calendar day d starts: the day that ends scores its Flamme, the counters restart, and 3 goals are drawn.
// Called by rules.mjs at every hour tick (with the hour that starts) and at every advance (for a fresh state).
export function rollDay(S,d,random){
 const f=S.flame;
 if(f.day!==d){
  if(f.day>=0){
   const lg=f.log,before=f.pts;
   if(!lg.hours.length)f.pts=round2(f.pts*FLAME.idle);
   else{const p=dayScore(lg,lg.goals);f.pts=round2(f.pts+p);if(p)logEntry(S,"flame",`La Flamme grandit : +${p} pour la journée d'hier.`,{p,pts:f.pts});}
   if(!lg.hours.length&&before>=1)logEntry(S,"flame","Pas une visite hier : la Flamme vacille.",{p:0,pts:f.pts});
  }
  f.day=d;f.log=flameLog(S);
 }
 if(S.missions.day!==d){S.missions.day=d;S.missions.n=0;}
 if(S.mail.day!==d){S.mail.day=d;S.mail.n=0;}
 if(S.goals.day!==d){
  const pool=GOALS.map(g=>g.id);for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  S.goals={day:d,list:pool.slice(0,GOALS_PER_DAY).map(id=>({id,n:0,done:false}))};
 }
}
// A letter comes in when the last one was answered long enough ago, never between midnight and 7:00.
export function mailCheck(S,random){
 if(S.mail.letter||S.vclock<S.mail.next||clockOf(S.vclock).hour<MAIL.quietTo)return false;
 const l=LETTERS[S.camp],x=l[Math.min(l.length-1,Math.floor(random()*l.length))];
 S.mail.letter={id:x.id,t:S.vclock};return true;
}
const fail=error=>({ok:false,error});
export function missionStart(S,id){
 const e=missionBlock(S,id);if(e)return fail(e);
 const m=missionOf(id);
 S.missions.cur={id,start:S.vclock,end:S.vclock+m.ms,notified:false};S.missions.day=today(S);S.missions.n++;
 logEntry(S,"mission",`En mission : ${m[S.camp]} (${m.ms<HOUR?m.ms/MIN+" min":m.ms/HOUR+" h"}).`,{id,start:true});
 return {ok:true,end:S.missions.cur.end};
}
export function missionReport(S,random){
 const c=S.missions.cur;if(!c)return fail("Aucune mission en cours.");
 if(S.vclock<c.end)return fail("La mission n'est pas finie : son rapport arrive bientôt.");
 const m=missionOf(c.id),ok=!m.risk||random()<m.risk.p,fx=ok?m.fx:m.risk.fx;
 applyFx(S,fx);bulletin(S);S.flame.log.missions++;S.missions.cur=null;
 logEntry(S,"mission",`Rapport de mission, ${m[S.camp]}${m.risk?ok?" : coup réussi !":" : ça a mal tourné.":""} ${fxText(fx)}, +1 bulletin.`,{id:m.id,ok});
 progress(S,"missions");
 return {ok:true,report:{id:m.id,fx,ok}};
}
export function mailAnswer(S,id,choice,random){
 const l=S.mail.letter;if(!l||l.id!==id)return fail("Pas de lettre en attente.");
 const x=letterOf(id),ans=Number.isInteger(choice)?x.answers[choice]:null;if(!ans)return fail("Réponse inconnue.");
 applyFx(S,ans.fx);S.mail.letter=null;S.mail.next=S.vclock+MAIL.gapMin+Math.floor(random()*(MAIL.gapMax-MAIL.gapMin));
 if(S.mail.day!==today(S)){S.mail.day=today(S);S.mail.n=0;}
 S.mail.n++;S.flame.log.letters++;
 const b=S.mail.n%MAIL.bulletinEvery===0;if(b)bulletin(S);
 logEntry(S,"mail",`Courrier de ${x.from} : « ${ans.text} ». ${ans.reply} (${fxText(ans.fx)}${b?", +1 bulletin":""})`,{id,choice});
 progress(S,"letters");
 return {ok:true,fx:ans.fx,bulletin:b};
}
