// Trêve des confiseurs, the snowball fight on screen: the pure pieces behind the canvas (minigames.mjs) and the battle
// sheet (app.js). No DOM, no clock. The score on screen comes from the same play() the server replays the taps with,
// so the two agree; the end screen still shows the server's answer, never this one.
import {SNOW,ORIGIN,play,incomingAt,sleighPos,mult} from "./snowball.mjs";
import {people,MINI} from "./rules.mjs";

const SIDE=466,C=233;
// The foes' Santa hats, in their camp's colour; the passers-by wear none.
export const HATS=Object.freeze({left:"#d23a3a",right:"#2f5fb4"});
// The two neutral passers-by of the mockup (a child and his sledge, the delivery man), drawn like an élu.
export const PASSANTS=Object.freeze([
 Object.freeze({name:"un enfant et sa luge",coat:"#3f8f5a",hair:"#7a4a24",style:"short",tie:null}),
 Object.freeze({name:"le livreur",coat:"#f2a03a",hair:"#2b2b2b",style:"short",tie:null}),
]);

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=v=>typeof v==="number"&&Number.isFinite(v);
const frNum=v=>String(v).replace(".",",");
const plural=(n,w)=>`${n} ${w}${n>1?"s":""}`;

// ---------------------------------------------------------------- the taps
// Records the player's taps as the server wants them: {t,x,y} integers, t in [0, 45 000] ms (never going back in
// time), x and y in the 466 square, at most SNOW.maxTaps (a smaller cap may be given; the next taps are ignored).
export function tapRecorder(max=SNOW.maxTaps){
 const cap=clamp(Math.floor(Number(max))||0,0,SNOW.maxTaps),list=[];
 return {
  add(t,x,y){
   if(list.length>=cap||!num(t)||!num(x)||!num(y))return false;
   const last=list.length?list[list.length-1].t:0;
   list.push({t:Math.max(last,clamp(Math.round(t),0,SNOW.ms)),x:clamp(Math.round(x),0,SIDE),y:clamp(Math.round(y),0,SIDE)});
   return true;
  },
  taps:()=>list.map(p=>({...p})),
  size:()=>list.length,
 };
}

// ---------------------------------------------------------------- who pops up
// The schedule's raw integer, taken modulo a list (0 for an empty list or garbage).
export const foeIndex=(foe,n)=>!(n>0)||!num(foe)?0:((Math.trunc(foe)%n)+n)%n;
// What a pop shows to a player of `camp`: an élu of the other camp in his camp's hat, or a passer-by without one.
export function foeOf(pop,camp){
 if(pop.passant!=null)return {p:PASSANTS[foeIndex(pop.passant,PASSANTS.length)],camp:null,hat:null};
 const other=camp==="left"?"right":"left",list=people[other];
 return {p:list[foeIndex(pop.foe,list.length)],camp:other,hat:HATS[other]};
}

// ---------------------------------------------------------------- the live view
const FLOAT_MS=900;
const FLOAT={hit:"#ffffff",pass:"#ff9a8a",sleigh:"#f4c84a",miss:"#9aa7bd",parry:"#9fe3ff",empty:"#ff9a8a",taken:"#ff9a8a"};
// What the screen shows at `now` (ms since the fight's start), from play() on the taps recorded so far: play() is
// causal, so its events up to `now` are what happened. Cached on the taps (the recorder only appends): one replay
// per new tap, not per frame. Returns {score, combo, mult, ammo, balls (the player's, in the air), incoming (the foes'
// balls, {i,x,y,r,k}), hitAt (pop index -> time hit), sleighHit (sleigh indexes), splat (last ball taken), floats
// ({text,x,y,color,t}, the last 900 ms), left (whole seconds)}.
export function liveView(sched){
 const pops=sched.pops,sleighs=sched.sleighs||[];
 let key=null,events=[],sorted=[];
 const replay=taps=>{
  const l=taps[taps.length-1],k=l?`${taps.length}:${l.t}:${l.x}:${l.y}`:"0";
  if(k===key)return;
  key=k;
  try{events=play(sched,taps).events;}catch{events=[];}
  sorted=taps.map(o=>({t:o.t,x:o.x,y:o.y})).sort((a,b)=>a.t-b.t||a.x-b.x||a.y-b.y);   // the engine's order
 };
 const view=(taps,now)=>{
  replay(taps);
  const T=clamp(num(now)?now:0,0,SNOW.ms);
  let score=0,combo=0,splat=-Infinity;
  const hitAt=new Map(),sleighHit=new Set(),parried=new Map(),noThrow=new Map(),floats=[];
  const float=(e,text,x=e.x,y=e.y)=>{if(now-e.t<FLOAT_MS)floats.push({text,x,y,color:FLOAT[e.kind],t:e.t});};
  const launched=i=>!(hitAt.has(i)&&hitAt.get(i)<pops[i].throwAt);
  const spare=t=>noThrow.set(t,(noThrow.get(t)||0)+1);
  for(const e of events){
   if(e.t>T)continue;
   if(e.kind==="hit"){combo++;score+=e.pts;hitAt.set(e.i,e.t);const m=mult(combo);float(e,`+${e.pts}${m>1?` ×${frNum(m)}`:""}`);}
   else if(e.kind==="pass"){score=Math.max(0,score+e.pts);combo=0;hitAt.set(e.i,e.t);float(e,`Pas les passants ! −${-e.pts}`);}
   else if(e.kind==="sleigh"){
    score+=e.pts;float(e,`Le traîneau ! +${e.pts}`);
    const j=sleighs.findIndex((s,j)=>!sleighHit.has(j)&&sleighPos(s,e.t));if(j>=0)sleighHit.add(j);
   }
   else if(e.kind==="miss"){combo=0;float(e,"raté");}
   else if(e.kind==="parry"){
    score+=e.pts;spare(e.t);float(e,`Parée ! +${e.pts}`);
    // the ball broken: the one in the air at that point (the engine reports where it was)
    const i=pops.findIndex((p,i)=>{if(!p.throws||parried.has(i)||!launched(i))return false;const b=incomingAt(p,e.t);return !!b&&b.x===e.x&&b.y===e.y;});
    if(i>=0)parried.set(i,e.t);
   }
   else if(e.kind==="empty"){spare(e.t);float(e,"Plus de boules !",C,410);}
   else if(e.kind==="taken"){combo=0;splat=e.t;float(e,"Aïe !",C,300);}
  }
  // The foes' balls in the air
  const incoming=[];
  pops.forEach((p,i)=>{
   if(!p.throws||parried.has(i)||!launched(i))return;
   const b=incomingAt(p,T);if(b)incoming.push({i,x:b.x,y:b.y,r:b.r,k:(T-p.throwAt)/SNOW.incoming});
  });
  // The player's: every tap that was neither a parry nor an empty hand threw one (the engine's ammo, replayed)
  let ammo=SNOW.ammo,reloadFrom=-1;const balls=[];
  const refill=(t,a,r)=>{if(a<SNOW.ammo&&r>=0){const n=Math.floor((t-r)/SNOW.reload);if(n>0){a=Math.min(SNOW.ammo,a+n);r=a<SNOW.ammo?r+n*SNOW.reload:-1;}}return [a,r];};
  for(const o of sorted){
   if(o.t>T)break;
   const n=noThrow.get(o.t);if(n){noThrow.set(o.t,n-1);continue;}
   [ammo,reloadFrom]=refill(o.t,ammo,reloadFrom);
   if(ammo<1)continue;
   if(ammo===SNOW.ammo)reloadFrom=o.t;
   ammo--;
   const land=o.t+SNOW.fly+SNOW.flyPerPx*Math.sqrt((o.x-ORIGIN.x)**2+(o.y-ORIGIN.y)**2);
   if(land>T)balls.push({t0:o.t,x:o.x,y:o.y,land});
  }
  [ammo]=refill(T,ammo,reloadFrom);
  return {score,combo,mult:mult(combo),ammo,balls,incoming,hitAt,sleighHit,splat,floats,left:Math.ceil((SNOW.ms-T)/1000)};
 };
 return {view};
}

// ---------------------------------------------------------------- the end screen
// The server's answer to miniEnd, as text: {title, score, stats, xp}. ok: the server took the game (result, bonus);
// otherwise error is its reason. xp: what the start paid.
export function endSummary({ok,result,bonus,error,xp}={}){
 const r=result&&typeof result==="object"&&num(result.score)?result:null,n=v=>num(v)?v:0,X=num(xp)?xp:MINI.snowball.xp;
 if(!ok)return {title:"Fin de la bataille",score:"—",stats:"",xp:`+${X} XP · ${typeof error==="string"&&error?error:"Le serveur n'a pas compté la partie."}`};
 const b=n(bonus);
 if(!r)return {title:"Fin de la bataille !",score:"—",stats:"",xp:`+${X} XP, bonus +${b}`};
 const acc=n(r.thrown)>0?Math.round(n(r.hits)/r.thrown*100):0,ph=n(r.passHits);
 const stats=`${plural(n(r.hits),"touche")} · ${acc} % de précision · ${plural(n(r.parries),"parade")} · meilleure série ${n(r.best)}`
  +(ph?` · ${ph} passant${ph>1?"s":""} touché${ph>1?"s":""}`:"");
 const xpLine=b>0||r.score>=MINI.snowball.minScore?`+${X} XP, bonus +${b}`:`+${X} XP, pas de bonus (il faut ${MINI.snowball.minScore} points)`;
 return {title:r.score>=MINI.snowball.great?"Bataille remportée !":"Fin de la bataille !",score:String(r.score),stats,xp:xpLine};
}

// ---------------------------------------------------------------- the Front de neige
// me.snowFront ({left,right,closed}) as a bar: shares (in %), the totals in French, a line for the player. null when
// there is no counter (the theme is off) or it is malformed. score: this game's (server's) points, when it counted.
export function frontBar(front,camp,{score}={}){
 if(!front||typeof front!=="object"||!num(front.left)||!num(front.right)||front.left<0||front.right<0)return null;
 const tot=front.left+front.right,lp=tot?Math.round(front.left/tot*1000)/10:50,name=camp==="left"?"la Gauche":"la Droite";
 const note=front.closed?"Le Front de neige est tombé : résultat final."
  :num(score)&&score>0?(score===1?`ton point compte pour ${name}`:`tes ${score} points comptent pour ${name}`)
  :`Chaque partie compte pour ton camp : ${name}.`;
 return {lp,rp:Math.round((100-lp)*10)/10,leftText:`Gauche ${front.left.toLocaleString("fr-FR")}`,rightText:`Droite ${front.right.toLocaleString("fr-FR")}`,note,closed:!!front.closed};
}

// ---------------------------------------------------------------- the challenges
const leftText=ms=>{const r=Math.max(0,ms);return r>=3600e3?`${Math.ceil(r/3600e3)} h`:`${Math.max(1,Math.ceil(r/60e3))} min`;};
// A received challenge: « Camille : 58 points, encore 24 h ».
export const challengeText=(c,now)=>`${c.from} : ${c.score} point${c.score>1?"s":""}, encore ${leftText(c.expires-now)}`;
// A sent one, from the challenger's side.
export function sentText(s,now){
 const who=`Défi à ${s.to}`,r=s.result&&typeof s.result==="object"?s.result:{},a=num(r.mine)?r.mine:0,b=num(r.theirs)?r.theirs:0;
 if(s.status==="open")return `${who} : en attente, encore ${leftText(s.expires-now)}`;
 if(s.status==="done")return r.outcome==="win"?`${who} : gagné, ${a} à ${b}`:r.outcome==="loss"?`${who} : perdu, ${a} à ${b}`:`${who} : égalité, ${a} partout`;
 if(s.status==="expired")return `${who} : pas relevé à temps`;
 if(s.status==="cancelled")return `${who} : annulé`;
 return "";
}
// GET /api/snow/challenges, kept to its well-formed rows.
export function challengeLists(v){
 const arr=a=>Array.isArray(a)?a.filter(x=>x&&typeof x==="object"&&Number.isSafeInteger(x.id)&&x.id>0):[];
 return {
  received:arr(v?.received).filter(x=>typeof x.from==="string"&&num(x.score)&&num(x.expires)),
  sent:arr(v?.sent).filter(x=>typeof x.to==="string"&&typeof x.status==="string"),
 };
}
// Whom to dare: the players of both camps (GET /api/duels' list, which holds them all), never oneself, online first.
export function dareList(opps,me,limit=40){
 if(!Array.isArray(opps))return [];
 return opps.filter(o=>o&&typeof o.name==="string"&&o.name!==me).map((o,k)=>({o,k}))
  .sort((a,b)=>(b.o.online?1:0)-(a.o.online?1:0)||a.k-b.k).map(x=>x.o).slice(0,limit);
}
