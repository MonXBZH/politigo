// Timed events the organiser and the moderators run from the console: what each type does, its allowed settings, and
// the effects of those running at a given time. Pure and shared: the server applies the effects, the browser shows
// them. No event ever touches the Flamme, the odds of the urn or real money.
export const EVENT_MAX_MS=7*864e5,EVENT_MIN_MS=5*6e4,EVENT_NAME_MAX=50,EVENT_MSG_MAX=160;
export const EVENT_GAMES=[["pong","Pong des arguments"],["debate","Débat chrono"],["manif","Manif"]];
export const EVENT_WHO=["all","left","right"],EVENT_REPEAT=["","day","week"];
// Reminders on offer: minutes before the start, and how the console names them.
export const EVENT_REMINDS=[[15,"15 minutes"],[60,"1 heure"],[1440,"1 jour"]];
// At most one reminder per event in this time, however often its start is moved. Those on offer are further apart.
export const EVENT_REMIND_GAP=5*6e4;
// The reminders to send at now: those past and not sent, before the start. last: when this event last sent one.
export const dueReminds=(e,now,last=-Infinity)=>now>=e.starts||now-last<EVENT_REMIND_GAP?[]:e.reminds.filter(m=>!e.sent.includes(m)&&now>=e.starts-m*6e4);
// What an announcement may say about its event, filled in when it goes out (a series stays right, run after run).
export const EVENT_TOKENS=["nom","fin","debut","delai","resume"];
export const EVENT_REMIND_TEXT="⏰ {nom} dans {delai} : {resume}, à partir de {debut}.";
const x=v=>`×${String(v).replace(".",",")}`;
// msg: the banner. ann: the prepared announcement of the start.
// params: {k, label, opts:[[value,label],...], def}, or {k, label, games:true} for a list of mini-games.
export const EVENT_TYPES={
 xp:{label:"Double XP",ann:"🎉 {nom} : {resume}, jusqu'à {fin}. Profites-en !",msg:"L'XP des mini-jeux est multipliée : profites-en !",desc:"Multiplie l'XP des mini-jeux choisis. Une partie lancée pendant l'événement garde son bonus.",
  params:[{k:"mult",label:"Multiplicateur",opts:[[1.5,"×1,5"],[2,"×2"],[3,"×3"]],def:2},{k:"games",label:"Mini-jeux",games:true}],
  sum:p=>`XP ${x(p.mult)} sur ${p.games.length===EVENT_GAMES.length?"tous les mini-jeux":p.games.map(g=>EVENT_GAMES.find(y=>y[0]===g)[1]).join(", ")}`},
 missions:{label:"Missions libres",ann:"🎉 {nom} : {resume} jusqu'à {fin}. Au boulot !",msg:"Plus de limite de missions par jour pendant l'événement.",desc:"Lève ou relève la limite de missions par jour.",
  params:[{k:"extra",label:"Limite",opts:[["all","Illimité"],[3,"+3 missions"],[6,"+6 missions"]],def:"all"}],
  sum:p=>p.extra==="all"?"Missions illimitées":`+${p.extra} missions par jour`},
 express:{label:"Mission express",ann:"🎉 {nom} : {resume} jusqu'à {fin}. Le terrain n'attend pas !",msg:"Les missions durent moins longtemps.",desc:"Raccourcit les missions lancées pendant l'événement.",
  params:[{k:"div",label:"Durée",opts:[[2,"÷2"],[3,"÷3"]],def:2}],sum:p=>`Durée des missions ÷${p.div}`},
 bulletins:{label:"Pluie de bulletins",ann:"🎉 {nom} : {resume} jusqu'à {fin}. À tes missions !",msg:"Les missions rapportent plus de bulletins.",desc:"Multiplie les bulletins des missions lancées pendant l'événement, et leur plafond du jour.",
  params:[{k:"mult",label:"Multiplicateur",opts:[[2,"×2"],[3,"×3"]],def:2}],sum:p=>`Bulletins de missions ${x(p.mult)}`},
 tirage:{label:"Tirage du peuple",ann:"🎉 {nom} : {resume} à l'urne de ton camp, jusqu'à {fin}.",msg:"Des tirages gratuits t'attendent à l'urne de ton camp.",desc:"Offre des tirages gratuits en plus, une fois par événement. Ils ne comptent jamais pour ce qui se cache au fond de l'urne.",
  params:[{k:"n",label:"Tirages offerts",opts:[[1,"1"],[2,"2"],[3,"3"]],def:1}],sum:p=>`${p.n} tirage${p.n>1?"s":""} gratuit${p.n>1?"s":""} en plus`},
 soldes:{label:"Soldes à la Buvette",ann:"🎉 {nom} : {resume} jusqu'à {fin}. Passe à la caisse !",msg:"La Buvette et les Soins sont moins chers.",desc:"Baisse les prix en FM de la Buvette et des Soins.",
  params:[{k:"off",label:"Réduction",opts:[[25,"−25 %"],[50,"−50 %"]],def:50}],sum:p=>`Buvette et Soins −${p.off} %`},
 courrier:{label:"Sac postal",ann:"🎉 {nom} : {resume} jusqu'à {fin}. Réponds à tes électeurs !",msg:"Les électeurs écrivent bien plus souvent.",desc:"Une lettre en plus toutes les quelques minutes, de 7 h à minuit, et jusqu'à 6 bulletins du courrier dans la journée au lieu de 2.",
  params:[{k:"gap",label:"Écart entre les lettres",opts:[[10,"10 minutes"],[15,"15 minutes"]],def:10}],sum:p=>`Une lettre toutes les ${p.gap} minutes`},
 duels:{label:"Nuit des duels",ann:"🎉 {nom} : {resume} jusqu'à {fin}. Choisis ton adversaire !",msg:"Plus de défis, et de plus gros gains.",desc:"Ajoute des défis par jour et multiplie les gains d'une victoire.",
  params:[{k:"extra",label:"Défis en plus",opts:[[2,"+2"],[5,"+5"]],def:2},{k:"mult",label:"Gains",opts:[[1.5,"×1,5"],[2,"×2"]],def:2}],sum:p=>`+${p.extra} défis, gains ${x(p.mult)}`},
 immunite:{label:"Immunité parlementaire",ann:"🎉 {nom} : {resume} jusqu'à {fin}. Ton élu est à l'abri.",msg:"Ton élu est protégé : pas de mort politique pendant l'événement.",desc:"Les jauges baissent moins vite et aucune mort politique ne tombe.",
  params:[{k:"slow",label:"Baisse des jauges",opts:[[2,"Moitié moins vite"],[3,"Trois fois moins vite"]],def:2}],sum:p=>`Jauges ÷${p.slow}, pas de mort politique`}
};
// The settings as sent, checked: only the values on offer, or null.
export function cleanParams(type,p){
 const t=Object.hasOwn(EVENT_TYPES,type)?EVENT_TYPES[type]:null;if(!t||!p||typeof p!=="object")return null;
 const out={};
 for(const f of t.params){
  if(f.games){
   if(!Array.isArray(p[f.k]))return null;
   const l=EVENT_GAMES.map(g=>g[0]).filter(g=>p[f.k].includes(g));if(!l.length)return null;
   out[f.k]=l;
  }else{
   if(!f.opts.some(o=>o[0]===p[f.k]))return null;
   out[f.k]=p[f.k];
  }
 }
 return out;
}
export const eventSummary=e=>EVENT_TYPES[e.type]?.sum(e.params)??e.type;
// What the console needs to build its form (the summaries are functions and stay here).
export const eventCatalogue=()=>Object.fromEntries(Object.entries(EVENT_TYPES).map(([k,{label,msg,ann,desc,params}])=>[k,{label,msg,ann,rem:EVENT_REMIND_TEXT,desc,params}]));

// ---- Announcements. A text the organiser did not change is not stored: e.ann / e.rtext stay null and the type's speaks.
export const eventText=(e,kind)=>kind==="ann"?e.ann??EVENT_TYPES[e.type].ann:e.rtext??EVENT_REMIND_TEXT;
// The first thing that is not a whole, known token, or null: « {nom } » must not reach the players.
export function badTokens(text){
 const m=text.match(/\{[^{}]*\}/g)?.find(t=>!EVENT_TOKENS.includes(t.slice(1,-1)));if(m)return m;
 return text.replace(/\{[^{}]*\}/g,"").match(/[{}]/)?.[0]??null;
}
// One pass: a name holding « {fin} » stays as written.
export const fillEvent=(text,vars)=>text.replace(/\{(\w+)\}/g,(m,k)=>Object.hasOwn(vars,k)?vars[k]:m);
const hm=(h,m)=>m?`${h} h ${String(m).padStart(2,"0")}`:`${h} h`;
const WEEKDAYS=["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const dayNo=w=>Date.UTC(w.year,w.month-1,w.day)/864e5;
// A wall time {year,month,day,hour,minute} in words, from the day of ref: « 22 h », « demain à 9 h 30 », « lundi 9 à 20 h ».
export function eventWhen(w,ref){
 const gap=dayNo(w)-dayNo(ref),t=hm(w.hour,w.minute);
 return gap===0?t:gap===1?`demain à ${t}`:`${WEEKDAYS[new Date(dayNo(w)*864e5).getUTCDay()]} ${w.day} à ${t}`;
}
// What is really left, by the minute above: a reminder sent late, or the only one of several, never lies.
export function eventDelay(ms){
 const m=Math.max(1,Math.ceil(ms/6e4)),h=Math.floor(m/60),d=m/1440;
 if(m<60)return m===1?"1 minute":`${m} minutes`;
 if(Number.isInteger(d))return d===1?"1 jour":`${d} jours`;
 if(m%60)return `${h} h ${String(m%60).padStart(2,"0")}`;
 return h===1?"1 heure":`${h} heures`;
}
// The widest values a text can take, to measure it before it is accepted (the times change from run to run).
export const eventLongest=e=>({nom:e.name,fin:"mercredi 30 à 22 h 30",debut:"mercredi 30 à 22 h 30",delai:"59 minutes",resume:eventSummary(e)});
// The reminders asked, longest first, or null.
export function cleanReminds(l){
 if(!Array.isArray(l)||l.some(v=>!EVENT_REMINDS.some(r=>r[0]===v)))return null;
 return [...new Set(l)].sort((a,b)=>b-a);
}

// What the rules read. missions: extra missions a day (Infinity: no limit). div: missions shortened by. bulletins:
// mission bulletins and their daily cap multiplied by. free: {n,ids}, draws offered by those events (overlapping ones share them). off: % off the prices.
// mailGap: minutes between letters (0: the usual). duels: extra challenges. duelMult: a win's gains. slow: gauges drain
// divided by. immune: no political death.
export const NO_FX=Object.freeze({xp:Object.freeze({pong:1,debate:1,manif:1}),missions:0,div:1,bulletins:1,free:null,off:0,mailGap:0,duels:0,duelMult:1,slow:1,immune:false});
const reaches=(e,camp)=>!camp||e.who==="all"||e.who===camp;
// The events running at t, for a camp (none: everybody's). Rows: {id,type,params,starts,ends,who,...}.
export const activeEvents=(list,camp,t)=>list.filter(e=>e.starts<=t&&t<e.ends&&reaches(e,camp));
// Two events of a kind never add up: the strongest applies. Different kinds run together.
export function effectsOf(list,camp,t){
 const on=activeEvents(list,camp,t);if(!on.length)return NO_FX;
 const f={...NO_FX,xp:{...NO_FX.xp}};
 for(const {id,type,params:p} of on){
  if(type==="xp")for(const g of p.games)f.xp[g]=Math.max(f.xp[g],p.mult);
  else if(type==="missions")f.missions=Math.max(f.missions,p.extra==="all"?Infinity:p.extra);
  else if(type==="express")f.div=Math.max(f.div,p.div);
  else if(type==="bulletins")f.bulletins=Math.max(f.bulletins,p.mult);
  else if(type==="tirage")f.free={n:Math.max(f.free?.n??0,p.n),ids:[...(f.free?.ids??[]),id]};
  else if(type==="soldes")f.off=Math.max(f.off,p.off);
  else if(type==="courrier")f.mailGap=f.mailGap?Math.min(f.mailGap,p.gap):p.gap;
  else if(type==="duels"){f.duels=Math.max(f.duels,p.extra);f.duelMult=Math.max(f.duelMult,p.mult);}
  else if(type==="immunite"){f.slow=Math.max(f.slow,p.slow);f.immune=true;}
 }
 return f;
}
