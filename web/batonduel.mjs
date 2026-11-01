// Le Duel du Bâton, the game screen (web/duel.mjs is the engine): a full-screen overlay over the game, one column at
// phone width. Players get the arena, the tug meter, the two lanes and their pads; spectators the arena, the cheers
// and the rounds' feed. The browser decides nothing: the server referees with the same sim(), the page only draws
// what it already knows (its own presses at once, the other side's as the batches bring them, a ghost at its time, a
// replay whole). Nothing touches the DOM before the first open: the pure helpers load in node for the tests.
import {BD,chart,roundSeed,sim,verdict,timeline} from "./duel.mjs";

// ---------------------------------------------------------------- pure helpers (tests/batonduel.client.test.mjs)
const SAFE=150;          // a batch claims a little less than the local clock: never "up" ahead of the server's
const LIVE_LAG=600;      // live: the other side's presses arrive with the replies, the flame is drawn that late
const SLACK=700;         // spectators: the increments come every ~500 ms, drawn a bit later still so they never stall
export const CHEERS={fire:"🔥",swords:"⚔️",horns:"🤘",clap:"👏",saucisse:"",["mega-saucisse"]:""};   // "": drawn by web/emoji/<id>.svg
export const cheerSrc=e=>`/emoji/${e}.svg`;
export const JUDGE={p:"PARFAIT",g:"BIEN",m:"RATÉ",x:"À CÔTÉ",e:"TROP TÔT"};

// Notes or presses arriving in pieces ([[t,lane],...]): merged by time, without repeats (a reload sends all again).
export function mergeTimed(list,add){
 if(!Array.isArray(add)||!add.length)return list;
 const seen=new Set(list.map(x=>`${x[0]}:${x[1]}`)),out=list.slice();
 for(const x of add){
  if(!Array.isArray(x)||!Number.isFinite(x[0])||(x[1]!==0&&x[1]!==1))continue;
  const k=`${x[0]}:${x[1]}`;if(!seen.has(k)){seen.add(k);out.push([x[0],x[1]]);}
 }
 return out.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}

// The presses the server has not accepted yet. take(up): those up to `up` in time order (BD.maxPresses at most), held
// until ack(); nack() (a failed batch) puts them back in front, so a dropped request never loses a press.
export function outbox(){
 let q=[],fly=null;
 return {
  add(t,lane){q.push([Math.max(0,Math.round(t)),lane]);},
  take(up){q.sort((a,b)=>a[0]-b[0]);let k=0;while(k<q.length&&k<BD.maxPresses&&q[k][0]<=up)k++;fly=q.slice(0,k);q=q.slice(k);return fly;},
  ack(){fly=null;},
  nack(){if(fly){q=fly.concat(q);fly=null;}},
  get size(){return q.length+(fly?fly.length:0);}
 };
}

// The batch's "up": what the local clock has played, a little behind, never backwards, never past the round.
export const batchUp=(rt,prev)=>Math.max(prev,Math.min(BD.round+BD.good,Math.floor(rt-SAFE)));

// A spectator of a live round: the stream is BD.spectatorDelay behind the players, drawn at now − start − delay −
// slack, never past `up` (what has arrived). Negative: the countdown.
export function livePos(now,start,up,delay=BD.spectatorDelay,slack=SLACK){
 const p=now-start-delay-slack;return p<0?p:Math.min(p,Math.max(0,Number.isFinite(up)?up:0));
}

// Where a replay stands `pos` ms after its start, over timeline(verdict(...)): the phase ("wait" before it, "count",
// "play", "pause", "end"), the round (i: index in tl.rounds, n), rt (ms into the round, negative in the countdown),
// left (ms to the next phase), done (rounds already over).
export function replayPos(tl,pos){
 if(!(pos>=0))return {phase:"wait",i:-1,n:0,rt:0,left:Number.isFinite(pos)?-pos:0,done:0};
 for(let i=0;i<tl.rounds.length;i++){
  const r=tl.rounds[i];
  if(pos<r.start)return {phase:"count",i,n:r.n,rt:pos-r.start,left:r.start-pos,done:i};
  if(pos<r.end)return {phase:"play",i,n:r.n,rt:pos-r.start,left:r.end-pos,done:i};
  if(pos<r.end+BD.pause)return {phase:"pause",i,n:r.n,rt:r.end-r.start,left:r.end+BD.pause-pos,done:i+1};
 }
 const last=tl.rounds.length-1;
 return {phase:"end",i:last,n:last>=0?tl.rounds[last].n:0,rt:0,left:0,done:tl.rounds.length};
}
// The rounds won by each side among the first `done` of a verdict.
export const winsAt=(v,done)=>v.rounds.slice(0,done).reduce((w,r)=>{w[r.over.w]++;return w;},[0,0]);

// The word a side earned between two sim() results of its own presses (solo: index 0), or null.
export function judgeDiff(a,b){
 if(!a||!b)return null;
 const x=a.stats[0],y=b.stats[0];
 if(y.x>x.x)return "x";
 if(y.e>x.e)return "e";
 if(y.p>x.p)return "p";
 if(y.g>x.g)return "g";
 if(y.m>x.m)return "m";
 return null;
}

// The countdown's word, ms before the round starts.
export const countWord=ms=>ms>2600?"3":ms>1700?"2":ms>800?"1":"BRANDISSEZ !";

// GET /api/baton/watch, read leniently: {kind:"live"|"replay"|null, id, names:{c,b}, ...}. Names fall back on the
// duel's view; recordings are never trusted beyond their shape.
export function watchData(r,names={}){
 if(!r||typeof r!=="object")return {kind:null};
 const nm=k=>typeof r[k]==="string"?r[k].slice(0,40):typeof r.names?.[k]==="string"?r.names[k].slice(0,40):names[k]||(k==="c"?"Challenger":"Porteur");
 const rec=k=>Array.isArray(r[k])?r[k]:Array.isArray(r[`${k}p`])?r[`${k}p`]:Array.isArray(r.presses?.[k])?r.presses[k]:[];
 const base={id:r.id,names:{c:nm("c"),b:nm("b")}};
 if(Number.isFinite(r.seed)&&Array.isArray(r.rounds)){
  const rounds=r.rounds.slice(0,BD.rounds).map(x=>({c:mergeTimed([],x?.c),b:mergeTimed([],x?.b)}));
  return {...base,kind:"replay",seed:r.seed>>>0,rounds,replayAt:Number(r.replayAt)||0,endsAt:Number(r.endsAt)||0};
 }
 if(r.kind==="live"&&!Number.isFinite(r.start))return {...base,kind:"live",n:r.n|0,start:null,up:-1,delay:BD.spectatorDelay,notes:[],P:[[],[]],wins:Array.isArray(r.wins)?[r.wins[0]|0,r.wins[1]|0]:[0,0]};   // between rounds
 if(Number.isFinite(r.start)){
  return {...base,kind:"live",n:r.n|0,start:r.start,up:Number.isFinite(r.up)?r.up:Number.isFinite(r.now)?r.now-r.start-(r.delay??BD.spectatorDelay):0,
   delay:Number.isFinite(r.delay)?r.delay:BD.spectatorDelay,notes:mergeTimed([],r.notes),P:[mergeTimed([],rec("c")),mergeTimed([],rec("b"))],wins:Array.isArray(r.wins)?[r.wins[0]|0,r.wins[1]|0]:[0,0]};
 }
 return {...base,kind:null};
}

// What the screen shows for a duel (me.baton.duel) at server time `now`: "none", "play" (a player's cards and
// rounds), "live" (spectators of a live duel) or "replay" (the rediffusion: players included, once it has started).
const OVER=["done","forfeit","held"];
export function screenOf(d,now){
 if(!d||typeof d!=="object")return "none";
 const replaying=Number.isFinite(d.replayAt)&&d.replayAt>0&&now>=d.replayAt&&(d.status==="scheduled"||OVER.includes(d.status));
 if(replaying)return "replay";
 if(d.role==="spectator")return d.status==="live"?"live":"none";
 return "play";
}

// ---------------------------------------------------------------- the screen
// o: {api(method,path,body), sprite(ctx64,look,t,state), lookOf(name), reduced(), serverNow(), inert(on), toast(text),
// view() (me.baton), setView(v), refreshMe(), when(t) (a date in words), onLegend()}.
export function createBatonDuel(o){
 let root=null,E=null,screen="none",opener=null,G=null,Wt=null,cardKey="",quitArmed=0,watchSeq=0,won=false;
 const cheerMine=new Map();let cheerT=[],side=0;
 const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
 const box=(cls,...kids)=>{const d=el("div",cls);d.append(...kids.filter(Boolean));return d;};
 const btn=(text,cls,fn)=>{const b=el("button",`btn${cls?` ${cls}`:""}`,text);b.type="button";b.addEventListener("click",fn);return b;};
 const view=()=>o.view()||null,duel=()=>view()?.duel||null;
 const names=()=>{const d=duel();return [d?.c||Wt?.names?.c||"Challenger",d?.b||Wt?.names?.b||"Porteur"];};
 let soundOn=false;try{soundOn=localStorage.getItem("politigo.duelSound")==="1";}catch{}

 function build(){
  root=el("div","bd");root.hidden=true;root.setAttribute("role","dialog");root.setAttribute("aria-modal","true");root.setAttribute("aria-label","Le Duel du Bâton");root.tabIndex=-1;
  const col=el("div","bd-col");
  const top=el("div","bd-top"),wb=el("div","bd-who c-be"),wc=el("div","bd-who r c-ch"),timer=el("div","bd-timer","0:45"),tsub=el("small","","MANCHE 1");timer.append(tsub);
  const nb=el("b"),sb=el("small"),db=el("span","bd-dots"),nc=el("b"),scn=el("small"),dc=el("span","bd-dots");wb.append(nb,sb,db);wc.append(nc,scn,dc);
  const tools=el("div","bd-tools"),snd=el("button","icon-btn bd-snd"),close=el("button","icon-btn bd-close","×");snd.type=close.type="button";close.setAttribute("aria-label","Fermer le duel");
  tools.append(snd,close);top.append(wb,timer,wc);
  const live=el("span","bd-live");live.hidden=true;
  const stage=el("div","bd-stage"),arena=el("canvas","bd-arena"),floaters=el("div","bd-floaters");arena.width=384;arena.height=240;arena.setAttribute("aria-hidden","true");floaters.setAttribute("aria-hidden","true");stage.append(arena,floaters,live);
  const tug=el("div","bd-tug"),ball=el("b");tug.append(ball);tug.setAttribute("aria-hidden","true");
  const tl=el("div","bd-tug-l"),tl0=el("span"),tl1=el("span");tl.append(tl0,tl1);
  // the player's part
  const play=el("div","bd-play"),wrap=el("div","bd-lanes-wrap"),lanes=el("canvas","bd-lanes"),judge=el("div","bd-judge"),combo=el("div","bd-combo");
  lanes.setAttribute("aria-hidden","true");judge.setAttribute("aria-live","off");wrap.append(lanes,judge,combo);
  const pads=el("div","bd-pads"),padB=[0,1].map(l=>{const b=el("button");b.type="button";b.append(el("b","",l?"Frappe":"Riff"),el("small","",l?"D ou →":"S ou ←"));b.setAttribute("aria-label",l?"Couloir de droite (D)":"Couloir de gauche (S)");pads.append(b);return b;});
  play.append(wrap,pads);
  // the spectators' part
  const watch=el("div","bd-watch"),pick=el("div","bd-pick"),emos=el("div","bd-emos"),feed=el("ul","bd-feed");
  const pickB=[1,0].map(s=>{const b=el("button",`btn ${s?"c-be":"c-ch"}`);b.type="button";b.dataset.side=String(s);b.addEventListener("click",()=>{side=s;syncPick();});pick.append(b);return b;});
  for(const [id,ch] of Object.entries(CHEERS)){
   const b=el("button");b.type="button";b.dataset.e=id;b.setAttribute("aria-label",{fire:"Feu",swords:"Épées",horns:"Cornes du diable",clap:"Bravo",saucisse:"Saucisse","mega-saucisse":"Méga saucisse"}[id]);
   if(ch)b.textContent=ch;else{const i=el("img");i.src=cheerSrc(id);i.alt="";b.append(i);}
   b.addEventListener("click",()=>cheer(id));emos.append(b);
  }
  watch.append(pick,emos,el("p","bd-note","Les encouragements s'affichent chez tout le monde, mais ne changent rien au duel."),feed);
  const ov=el("div","bd-ov");ov.hidden=true;
  col.append(tools,top,stage,tug,tl,play,watch,ov);root.append(col);document.body.append(root);
  E={col,nb,sb,db,nc,scn,dc,timer,tsub,snd,close,live,stage,arena,ac:arena.getContext("2d"),floaters,ball,tl0,tl1,play,wrap,lanes,judge,combo,padB,watch,pickB,feed,ov,cardCv:null,cardDraw:null,
   lo:Object.assign(document.createElement("canvas"),{width:L,height:AH}),sp:Object.assign(document.createElement("canvas"),{width:64,height:64}),flash:[0,0],sparks:[],feedKeys:new Set()};
  syncSound();syncPick();
  snd.addEventListener("click",()=>{soundOn=!soundOn;try{localStorage.setItem("politigo.duelSound",soundOn?"1":"0");}catch{}syncSound();if(!soundOn)stopSound();});
  close.addEventListener("click",askClose);
  // Touch first: the two pads and the lanes themselves (each half of the falling-notes area), several fingers at once.
  padB.forEach((b,l)=>b.addEventListener("pointerdown",e=>{e.preventDefault();press(l,e.timeStamp);}));
  wrap.addEventListener("pointerdown",e=>{e.preventDefault();const r=wrap.getBoundingClientRect();press(Math.min(1,Math.max(0,Math.floor((e.clientX-r.left)/r.width*2))),e.timeStamp);});
  for(const x of [wrap,...padB])x.addEventListener("contextmenu",e=>e.preventDefault());
  // Keys stay inside the duel: the page's shortcuts never see them.
  root.addEventListener("keydown",e=>{
   e.stopPropagation();
   if(e.ctrlKey||e.metaKey||e.altKey)return;
   const k=e.key.toLowerCase(),lane=k==="s"||k==="arrowleft"?0:k==="d"||k==="arrowright"?1:-1;
   if(lane>=0&&screen==="play"&&G&&(G.phase==="play"||G.phase==="count")){e.preventDefault();if(!e.repeat)press(lane,e.timeStamp);return;}
   if(e.key==="Escape"){e.preventDefault();askClose();return;}
   if(e.key==="Tab"){const f=[...root.querySelectorAll("button")].filter(b=>b.getClientRects().length&&!b.disabled);if(!f.length)return;
    const a=f.indexOf(document.activeElement);if(e.shiftKey&&a<=0){e.preventDefault();f[f.length-1].focus();}else if(!e.shiftKey&&a===f.length-1){e.preventDefault();f[0].focus();}}
  });
 }
 function syncSound(){E.snd.textContent=soundOn?"🔊":"🔇";E.snd.setAttribute("aria-label",soundOn?"Couper le son du duel":"Mettre le son du duel");E.snd.setAttribute("aria-pressed",String(soundOn));}
 function syncPick(){const [c,b]=names();E.pickB[0].textContent=`Je soutiens ${b}`;E.pickB[1].textContent=`Je soutiens ${c}`;for(const x of E.pickB)x.setAttribute("aria-pressed",String(+x.dataset.side===side));}

 // ---------------------------------------------------------------- open / close
 const isOpen=()=>!!root&&!root.hidden;
 function open(from=null){
  const d=duel();if(!d)return false;
  if(!root)build();
  if(!isOpen()){opener=from||document.activeElement;root.hidden=false;o.inert(true);won=false;root.classList.remove("on");requestAnimationFrame(()=>root?.classList.add("on"));}
  update(true);root.focus();return true;
 }
 function shut(){
  if(!isOpen())return;
  clearTimeout(quitArmed);quitArmed=0;stopSound();root.hidden=true;o.inert(false);
  if(G&&(G.phase==="play"||G.phase==="count"))G.phase="left";   // the batches stop: the server counts the rest as no presses
  Wt=null;cardKey="";(opener&&opener.isConnected?opener:null)?.focus();
 }
 // Leaving in the middle of a round takes two taps: the round goes on without you.
 function askClose(){
  if(!(G&&screen==="play"&&(G.phase==="play"||G.phase==="count"))){shut();return;}
  if(quitArmed){shut();return;}
  quitArmed=setTimeout(()=>{quitArmed=0;E.close.textContent="×";E.close.classList.remove("armed");},4000);
  E.close.textContent="Quitter ?";E.close.classList.add("armed");o.toast("Touche encore pour quitter : la manche continue sans toi.",true);
 }

 // The view changed (me.baton, an SSE): the right screen, the right card. force: rebuild the card even if unchanged.
 function update(force=false){
  if(!isOpen())return;
  const d=duel(),now=o.serverNow(),s=screenOf(d,now);
  if(!d&&!(G&&G.phase==="end")&&!(Wt&&Wt.final)){setCard("none",()=>[tag("DUEL DU BÂTON"),el("h3","","Aucun duel en cours"),el("p","","Le prochain défi s'affichera ici."),btn("Fermer","",shut)]);return;}
  if(s!==screen){screen=s;cardKey="";if(s==="live"||s==="replay")loadWatch();}
  root.dataset.mode=screen==="play"?"play":"watch";
  if(force)cardKey="";
  syncPick();
  if(screen==="play")playerCard();
  else if(screen==="none")setCard("none2",()=>[tag("DUEL DU BÂTON"),el("h3","",`${d.c} contre ${d.b}`),el("p","",d.replayAt?`Rediffusion ${o.when(d.replayAt)} dans l'arène.`:"Le duel se joue en différé : rediffusion dès que les deux auront joué."),btn("Fermer","",shut)]);
 }

 // ---------------------------------------------------------------- the cards over the screen
 const tag=t=>el("span","tag",t);
 function setCard(key,make){
  if(key===cardKey)return;cardKey=key;E.cardCv=null;E.cardDraw=null;
  if(!make){E.ov.hidden=true;E.ov.replaceChildren();return;}
  E.ov.replaceChildren(...make().filter(Boolean));E.ov.hidden=false;
  const f=E.ov.querySelector(".btn.go")||E.ov.querySelector(".btn");if(f&&isOpen())f.focus({preventScroll:true});
 }
 const left=ms=>{const m=Math.max(1,Math.ceil(ms/60000));return m>=60?`${Math.floor(m/60)} h ${String(m%60).padStart(2,"0")}`:`${m} min`;};
 // A card's portrait: the winner (or the bearer), staff in hand, redrawn by the frame.
 function portrait(name,glory){const cv=el("canvas","bd-portrait");cv.width=cv.height=64;cv.setAttribute("aria-hidden","true");E.cardCv=cv;E.cardDraw=t=>o.sprite(cv.getContext("2d"),{...o.lookOf(name),object:"baton"},t,glory?"win":"idle");return cv;}
 function playerCard(){
  const d=duel(),v=view();if(!d)return;
  if(G&&G.id===d.id&&["count","play","break"].includes(G.phase))return;    // a round's own cards
  if(G&&G.id===d.id&&G.phase==="end")return;                                  // its result stays until closed
  const me=d.role==="challenger"?0:1,[c,b]=names(),other=me?c:b,now=o.serverNow(),exp=Number(d.expires)||0;
  const key=`${d.id}|${d.status}|${d.role}|${G?.waiting?1:0}|${G?.phase||""}|${won}`;
  if(key===cardKey&&d.status!=="invited")return;
  const res=d.result,how=res?.how==="flame"?"la flamme a touché":"au temps";
  switch(d.status){
   case "invited":
    if(me===0)return setCard(key,()=>[tag("DÉFI ENVOYÉ"),el("h3","",`${b} est en ligne`),el("p","",`On lui propose le duel en direct, tout de suite. Si ${b} préfère plus tard, ou ne répond pas dans les 5 minutes, tu joueras ta partie en différé.`),exp?el("p","bd-small",`Réponse attendue avant ${o.when(exp)}.`):null,btn("Fermer","",shut)]);
    return setCard(key,()=>[tag("⚔️ DÉFI"),el("h3","",`${c} te défie pour le Bâton de feu !`),el("p","","Vous êtes tous les deux en ligne : vous pouvez vous affronter en direct maintenant. Sinon, tu auras 48 h pour jouer ta partie quand tu veux, contre son fantôme."),
     box("bd-slots",btn("⚡ En direct maintenant","go",()=>answer(true)),btn("⏳ Plus tard (48 h)","",()=>answer(false)))]);
   case "live":
    return setCard(key,()=>[tag("⚡ EN DIRECT"),el("h3","",`Duel en direct contre ${other}`),el("p","","La même partition pour vous deux, au même moment. Deux manches gagnantes de 45 s : chaque note jouée en rythme pousse la flamme vers l'autre."),
     rulesList(),G?.waiting?el("p","bd-small",`En attente de ${other}… La manche démarre dès que vous êtes prêts tous les deux, ou dans une minute.`):btn("🔥 Je suis prêt","go",ready)]);
   case "c_play":
    if(me===0)return setCard(key,()=>[tag("DUEL EN DIFFÉRÉ"),el("h3","","Joue ta partie maintenant"),el("p","",`Tu joues tes trois manches maintenant ; ${b} aura ensuite 48 h pour jouer les siennes contre ton fantôme, à l'heure de son choix. Le résultat sera révélé à tous lors de la rediffusion.`),
     rulesList(),exp?el("p","bd-small",`À jouer avant ${o.when(exp)}, sinon le défi est abandonné.`):null,G?.waiting?el("p","bd-small","La partition arrive…"):btn("▶ Jouer mes 3 manches","go",ready)]);
    return setCard(key,()=>[tag("⚔️ DÉFI"),el("h3","",`${c} joue sa partie`),el("p","",`${c} te défie pour le Bâton de feu et joue ses trois manches en ce moment. Tu pourras jouer les tiennes quand tu veux, dans les 48 h.`),btn("Fermer","",shut)]);
   case "b_wait": case "b_play":
    if(me===1)return setCard(key,()=>[tag("⚔️ À TOI DE JOUER"),el("h3","",`${c} a joué sa partie`),
     el("p","",`Tu as ${exp?left(exp-now):"48 h"} pour lui répondre, à l'heure que tu veux, même à 3 h du matin. Tu joues contre son fantôme : sa flamme tire de l'autre côté du Bâton, note pour note. Sans réponse à temps, le Bâton part à ${c}.`),
     d.status==="b_play"?el("p","bd-small","Une fois lancée, ta partie dure 20 minutes au plus : le temps non joué compte comme des notes manquées."):null,
     G?.waiting?el("p","bd-small","La partition arrive…"):btn(d.status==="b_play"?"▶ Reprendre ma partie":"▶ Jouer contre son fantôme","go",ready)]);
    return setCard(key,()=>[tag("PARTIE ENREGISTRÉE"),el("h3","",`À ${b} de jouer`),el("p","",`${b} a jusqu'à ${exp?o.when(exp):"48 h"} pour jouer contre ton fantôme. Tu découvriras le résultat à la rediffusion, comme tout le monde.`),btn("Fermer","",shut)]);
   case "scheduled":
    if(me===1&&res)return setCard(key,()=>[tag("PARTIE ENREGISTRÉE"),el("h3","",res.winner==="b"?"Tu as tenu bon… chut !":`${c} a été plus fort… chut !`),el("p","",`${c} et les autres joueurs découvriront le résultat à la rediffusion, ${o.when(d.replayAt)}. Le Bâton ne change de mains qu'à ce moment-là.`),btn("Fermer","",shut)]);
    return setCard(key,()=>[tag("📺 REDIFFUSION"),el("h3","",me?"Ta partie est jouée":`${b} a joué !`),el("p","",`Le duel sera rediffusé ${d.replayAt?o.when(d.replayAt):"ce soir à 21 h"} dans l'arène. Le résultat sera révélé à ce moment-là.`),btn("Fermer","",shut)]);
   case "held":
    return setCard(key,()=>[tag("⚖️ VÉRIFICATION"),el("h3","","Le duel est entre les mains de l'arbitre"),el("p","","Un contrôle anti-triche a relevé quelque chose : rien ne bouge tant qu'un arbitre n'a pas tranché."),btn("Fermer","",shut)]);
   case "void": case "annulled":
    return setCard(key,()=>[tag("DUEL ANNULÉ"),el("h3","","Ce duel ne compte pas"),el("p","",d.status==="void"?"Le défi a été abandonné ou le Bâton est retourné dans l'urne.":"L'arbitre a annulé le duel : rien ne bouge."),btn("Fermer","",shut)]);
   default:
    if(res)return setCard(key,()=>resultCard(res.winner==="c"?0:1,me,`${res.winner==="c"?c:b} l'emporte (${how} ${res.winner==="c"?b:c}).`));
    return setCard(key,()=>[tag("DUEL DU BÂTON"),el("h3","",`${c} contre ${b}`),btn("Fermer","",shut)]);
  }
 }
 function rulesList(){
  const ul=el("ul","bd-rules");
  for(const t of ["Deux couloirs, une note à la fois : touche le couloir (ou le pavé) quand la note atteint la ligne.","Parfait pousse plus fort que Bien, et le combo ajoute jusqu'à +50 %.","Pas de matraquage : une frappe trop tôt brûle la note, une frappe à côté casse le combo.","La flamme qui touche un candidat lui fait perdre la manche ; au bout de 45 s, le côté où elle se trouve perd."])ul.append(el("li","",t));
  return ul;
 }
 // The end of a duel for a player. w: 0 challenger, 1 bearer; me: the same.
 function resultCard(w,me,line){
  const [c,b]=names(),mine=w===me;
  const title=me===0?(mine?"Tu as arraché le Bâton !":`${b} garde le Bâton`):(mine?"Défense réussie !":"Le Bâton te quitte…");
  const text=me===0?(mine?(won?"Le Bâton de feu est à toi. Sa légende t'attend.":"Si l'arbitre ne relève rien, le Bâton de feu est à toi : sa légende va se jouer."):"Tu pourras retenter ta chance dans 7 jours. Aucun XP, aucun FM perdus.")
   :(mine?"Le Bâton reste à toi. Trois jours de répit avant le prochain défi.":`${c} l'a emporté. Le Bâton n'est jamais perdu pour toujours : la flamme peut te revenir.`);
  return [tag(G?`DUEL DU BÂTON · ${G.wins[1]} – ${G.wins[0]}`:"DUEL DU BÂTON"),portrait(w?b:c,true),el("h3","",title),el("p","",text),line?el("p","bd-small",line):null,
   box("bd-slots",won&&me===0&&mine?btn("🔥 Découvrir la légende","go",()=>{shut();o.onLegend();}):null,btn("Fermer","",shut))];
 }
 // The SSE `mythic` with `from` reached the new bearer while the duel is on screen: the legend waits behind a button.
 function markWon(){won=true;const d=duel();if(isOpen()&&(d?.role==="challenger"||G?.me===0))setCard(`won${d?.id??G?.id}`,()=>resultCard(0,0,""));else update(true);}

 // ---------------------------------------------------------------- the player's rounds
 const post=async body=>{const t=performance.now(),r=await o.api("POST","/api/baton",body);r.rtt=performance.now()-t;if(r.ok&&r.baton&&typeof r.baton==="object")o.setView(r.baton);return r;};
 function session(){
  const d=duel();if(!d||d.role==="spectator")return null;
  if(!G||G.id!==d.id)G={id:d.id,me:d.role==="challenger"?0:1,phase:"idle",n:-1,wins:Array.isArray(d.wins)?[d.wins[0]|0,d.wins[1]|0]:[0,0],best:0,perfect:0,hit:0,total:0};
  G.kind=d.status==="live"?"live":d.status==="c_play"?"solo":"ghost";
  return G;
 }
 async function answer(live){
  const d=duel();if(!d)return;
  const r=await post({op:"answer",id:d.id,live});
  if(!r.ok){o.toast(r.error||"Réponse impossible pour l'instant.",true);return;}
  if(!live){o.toast("Tu joueras ta partie plus tard : 48 h dès que le challenger aura joué la sienne.",true);shut();}
  else update(true);
 }
 async function ready(){
  const g=session();if(!g||g.waiting)return;
  g.waiting=true;update(true);
  const r=await post({op:"ready",id:g.id});
  g.waiting=false;
  // A failed ready between rounds: back to the status card and its button, never stuck on « la suivante démarre… ».
  if(!r.ok){if(g.phase==="break")g.phase="idle";o.toast(r.error||"Impossible de lancer la manche.",true);update(true);return;}
  if(r.round)onRound(r.round,r.rtt);else update(true);   // live: the round starts when both are ready (SSE `round`)
 }
 // A round begins at server time `start` (ready's reply, or SSE baton {kind:"round"}): the local clock is set from it.
 function onRound(v,rtt=0){
  const g=session();if(!g||!v||!Number.isFinite(v.start)||!Number.isFinite(v.now))return;
  if((g.phase==="count"||g.phase==="play")&&v.n===g.n)return;
  const srv=v.now+rtt/2;
  Object.assign(g,{n:v.n|0,start:v.start,t0:performance.now()+(v.start-srv),phase:"count",notes:[],P:[[],[]],out:outbox(),up:0,from0:true,inflight:false,lastSend:0,mine:null,f:0,combo:0,heard:new Set()});
  if(isOpen())root.focus();                          // the countdown card replaces the current one on the next frame
 }
 function press(lane,ts){
  if(!E)return;E.flash[lane]=performance.now();E.padB[lane].classList.add("hit");setTimeout(()=>E.padB[lane]?.classList.remove("hit"),90);
  const g=G;if(!g||screen!=="play"||g.phase!=="play")return;
  const now=performance.now(),at=Number.isFinite(ts)&&ts<=now&&now-ts<1000?ts:now;
  const t=Math.round(Math.max(g.up,at-g.t0));                     // never before what the server already holds
  if(t<0||t>BD.round+BD.good)return;
  g.out.add(t,lane);const P=g.P[g.me];P.push([t,lane]);if(P.length>1&&P[P.length-2][0]>t)P.sort((a,b)=>a[0]-b[0]);
 }
 async function batch(){
  const g=G;g.inflight=true;g.lastSend=performance.now();
  const n=g.n,up=batchUp(performance.now()-g.t0,g.up),presses=g.out.take(up);
  const body={op:"play",id:g.id,n,up,presses};if(g.from0)body.from=0;
  const r=await post(body);
  if(G!==g||g.n!==n)return;
  g.inflight=false;
  if(!r.ok){
   g.out.nack();
   // Refused (a round already over, a clock out of step): no more batches for it, the server's word comes by SSE.
   // Never a dead end: « Reprendre » asks the server where the duel stands (a round still running is joined).
   if(r.status===422){g.phase="break";stopSound();o.toast(r.error||"Manche refusée.",true);o.refreshMe();setCard(`err${n}`,()=>[tag(`MANCHE ${n+1}`),el("h3","","Manche interrompue"),el("p","",r.error||"Le serveur a refusé la manche."),
    btn("▶ Reprendre","go",()=>{g.phase="idle";cardKey="";ready();}),btn("Fermer","",()=>{g.phase="idle";cardKey="";shut();})]);}
   return;
  }
  g.out.ack();g.up=up;g.from0=false;
  if(Array.isArray(r.notes)&&r.notes.length){g.notes=mergeTimed(g.notes,r.notes);scheduleNotes(g);}
  if(Array.isArray(r.opp)&&r.opp.length)g.P[1-g.me]=mergeTimed(g.P[1-g.me],r.opp);
  // This clock ahead of the server's (a bad first guess): slowed down, so "up" never claims the future.
  if(Number.isFinite(r.rt)){const local=performance.now()-g.t0-r.rtt/2;if(local>r.rt+120)g.t0+=local-r.rt;}
  if(r.over)roundOver({n,...r.over});
 }
 // A round is over (the batch's reply or SSE baton {kind:"over"}): its card, then the next round or the end.
 function roundOver(ov){
  const g=G;if(!g||(ov.n!=null&&ov.n!==g.n)||!["play","count","left"].includes(g.phase))return;
  const leftIt=g.phase==="left";g.phase="break";stopSound();
  if(g.mine){const s=g.mine.stats[0];g.best=Math.max(g.best,s.best);g.perfect+=s.p;g.hit+=s.p+s.g;g.total+=g.notes.length;}
  const solo=g.kind==="solo";
  if(!solo){if(Array.isArray(ov.wins))g.wins=[ov.wins[0]|0,ov.wins[1]|0];else if(ov.w===0||ov.w===1)g.wins[ov.w]++;}
  const more=typeof ov.next==="boolean"?ov.next:solo?g.n<BD.rounds-1:Math.max(...g.wins)<BD.wins;
  const [c,b]=names(),N=[c,b];
  if(leftIt){if(!more)finish();return;}
  if(solo){const s=g.mine?.stats[0];setCard(`over${g.n}`,()=>[tag(`MANCHE ${g.n+1} / ${BD.rounds}`),el("h3","","Manche enregistrée"),el("p","",`${(s?.p||0)+(s?.g||0)} notes sur ${g.notes.length}, dont ${s?.p||0} parfaites.`),el("p","bd-small",more?"La suivante démarre…":"")]);}
  else{const w=ov.w===0||ov.w===1?ov.w:null;setCard(`over${g.n}`,()=>[tag(`MANCHE ${g.n+1}`),el("h3","",w==null?"Manche terminée":`${w===g.me?"Tu remportes":`${N[w]} remporte`} la manche`),el("p","",`${g.wins[1]} – ${g.wins[0]} · ${more?"la suivante démarre…":"fin du duel"}`)]);}
  setTimeout(()=>{if(G!==g||g.phase!=="break")return;if(more)ready();else finish();},BD.pause);
 }
 function finish(){
  const g=G;g.phase="end";o.refreshMe();
  const [c,b]=names();
  if(g.kind==="solo")return setCard(`end${g.id}`,()=>[tag("PARTIE ENREGISTRÉE"),el("h3","",`À ${b} de jouer`),el("p","",`Meilleure série : ${g.best} notes, ${g.perfect} parfaites sur tes trois manches. ${b} a 48 h pour jouer contre ton fantôme. Tu découvriras le résultat à la rediffusion, comme tout le monde.`),btn("Fermer","",shut)]);
  const w=g.wins[0]>=BD.wins?0:1;
  if(g.kind==="ghost"){const kept=w===1;return setCard(`end${g.id}`,()=>[tag(`PARTIE ENREGISTRÉE · ${g.wins[1]} – ${g.wins[0]}`),el("h3","",kept?"Tu as tenu bon… chut !":`${c} a été plus fort… chut !`),el("p","",`${c} et les autres joueurs découvriront le résultat à la rediffusion, ${duel()?.replayAt?o.when(duel().replayAt):"ce soir à 21 h"}. Le Bâton ne change de mains qu'à ce moment-là.`),btn("Fermer","",shut)]);}
  setCard(`end${g.id}`,()=>resultCard(w,g.me,""));
 }
 // SSE baton {kind:"round"|"over"} for this player.
 function onEvent(v){
  if(!v||typeof v!=="object")return;
  if(v.kind==="round"&&isOpen())onRound(v);
  else if(v.kind==="over"&&G)roundOver({n:v.n,w:v.w,wins:v.wins});
 }

 // ---------------------------------------------------------------- spectators
 async function loadWatch(){
  const seq=++watchSeq,r=await o.api("GET","/api/baton/watch");
  if(seq!==watchSeq||!isOpen())return;
  const d=duel(),w=r.ok?watchData(r.watch!==undefined?r.watch:r,{c:d?.c,b:d?.b}):{kind:null};   // the reply: {watch:{...}|null}
  if(!w.kind){Wt=null;setCard("nowatch",()=>[tag("📺 ARÈNE"),el("h3","",d?.replayAt&&o.serverNow()<d.replayAt?"La rediffusion n'a pas commencé":"Rien à regarder pour l'instant"),el("p","",d?.replayAt?`Rediffusion ${o.when(d.replayAt)}.`:r.ok?"Le duel reprend dans un instant.":r.error||""),btn("Fermer","",shut)]);return;}
  const keep=Wt&&Wt.id===w.id?Wt:null;
  Wt={...w,feed:keep?.feed||[],combos:[0,0],seen:keep?.seen||new Set(),final:false,asked:keep?.asked||0};
  if(w.kind==="replay"){Wt.v=verdict(w.seed,w.rounds);Wt.tl=timeline(Wt.v);Wt.charts=Wt.v.rounds.map(r=>chart(roundSeed(w.seed,r.n)).notes);}
  E.live.hidden=false;E.live.textContent=w.kind==="live"?"EN DIRECT":"REDIFFUSION";E.live.classList.toggle("replay",w.kind==="replay");
  cardKey="";syncPick();
 }
 // SSE batonLive: the next piece of the live round (already BD.spectatorDelay late); a new round reloads the whole.
 function onLive(v){
  if(!v||typeof v!=="object"||!isOpen()||screen!=="live")return;
  if(!Wt||Wt.kind!=="live"||v.id!==Wt.id||(v.n|0)!==Wt.n){loadWatch();return;}
  Wt.notes=mergeTimed(Wt.notes,v.notes);Wt.P=[mergeTimed(Wt.P[0],v.c),mergeTimed(Wt.P[1],v.b)];if(Number.isFinite(v.up))Wt.up=Math.max(Wt.up,v.up);
 }
 function wfeed(key,text){if(!Wt||Wt.seen.has(key))return;Wt.seen.add(key);const li=el("li","hot",text);E.feed.prepend(li);while(E.feed.children.length>6)E.feed.lastChild.remove();}
 async function cheer(e){
  const now=performance.now();cheerT=cheerT.filter(t=>now-t<1000);if(cheerT.length>=3)return;cheerT.push(now);
  floater(e,side);const k=`${e}|${side}`;cheerMine.set(k,(cheerMine.get(k)||0)+1);setTimeout(()=>{const n=cheerMine.get(k)||0;if(n>0)cheerMine.set(k,n-1);},3000);
  const r=await o.api("POST","/api/baton",{op:"cheer",e,side});if(!r.ok&&r.status!==429)o.toast(r.error||"Encouragement perdu.",true);
 }
 // SSE batonCheer: everyone's cheers float up the arena on that side (one's own already did, at once).
 function onCheer(v){
  if(!isOpen()||!v||!Object.hasOwn(CHEERS,v.e)||(v.side!==0&&v.side!==1))return;
  const k=`${v.e}|${v.side}`,n=cheerMine.get(k)||0;if(n>0){cheerMine.set(k,n-1);return;}
  floater(v.e,v.side);
 }
 function floater(e,who){
  if(!E||E.floaters.childElementCount>40)return;
  const s=el("span");if(CHEERS[e])s.textContent=CHEERS[e];else{const i=el("img");i.src=cheerSrc(e);i.alt="";s.append(i);}
  s.style.left=`${(who===0?55:5)+Math.random()*38}%`;s.style.animationDuration=`${2.2+Math.random()}s`;   // CSSOM
  E.floaters.append(s);setTimeout(()=>s.remove(),3400);
 }

 // ---------------------------------------------------------------- one frame (called by app.js's own loop)
 function frame(now){
  if(!isOpen())return;
  const t=o.reduced()?0:now,d=duel();
  let f=0,round=-1,rt=null,wins=[0,0],combos=[0,0],winner=null,count=null;
  if(screen==="play"&&G&&G.id===d?.id){
   const g=G;wins=g.wins;round=g.n;
   if(g.phase==="count"||g.phase==="play"){
    rt=now-g.t0;
    if(g.phase==="count"){if(rt>=0){g.phase="play";soundRound(g);}else count=-rt;}
    if(g.phase==="play"){
     if(!g.inflight&&now-g.lastSend>=250)batch();
     const mine=sim(g.notes,[g.P[g.me]],{solo:true,upTo:rt}),j=judgeDiff(g.mine,mine);g.mine=mine;g.combo=mine.stats[0].combo;
     if(j){judge(j);if(j==="p"||j==="g")spark(g.me,j);}
     if(g.kind!=="solo")f=sim(g.notes,g.P,{upTo:Math.max(0,g.kind==="live"?rt-LIVE_LAG:rt)}).f;
     g.f=f;
    }
   }else f=g.f||0;
   if(g.phase==="end"||g.phase==="break")winner=g.phase==="end"&&g.kind!=="solo"?(g.wins[0]>=BD.wins?0:1):null;
   combos[g.me]=g.phase==="play"?g.combo:0;
   if(count!=null)setCard(`count${g.n}|${countWord(count)}`,()=>[tag(g.kind==="solo"?`MANCHE ${g.n+1} / ${BD.rounds}`:`MANCHE ${g.n+1} · ${g.wins[1]} – ${g.wins[0]}`),el("div",count>800?"bd-big":"bd-go",countWord(count)),
    el("p","",{live:"La même partition pour vous deux.",solo:"Personne ne te voit jouer : ta partie sera rediffusée.",ghost:`Le fantôme de ${names()[0]} tire de l'autre côté.`}[g.kind])]);
   else if(g.phase==="play"&&cardKey)setCard("",null);   // no card over a round in play (joined late, after a reload: no countdown was shown)
  }else if((screen==="live"||screen==="replay")&&Wt){
   const w=watchFrame(now);f=w.f;round=w.round;rt=w.rt;wins=w.wins;combos=w.combos;winner=w.winner;
  }
  drawArena(t,now,f,winner,rt);
  const ac=E.ac;ac.imageSmoothingEnabled=false;ac.clearRect(0,0,384,240);ac.drawImage(E.lo,0,0,384,240);
  if(screen==="play")drawLanes(now,rt);
  if(E.cardDraw&&E.cardCv?.isConnected){try{E.cardDraw(t);}catch{}}
  // the top bar
  const [c,b]=names(),me=screen==="play"&&G?G.me:-1;
  E.nb.textContent=b+(me===1?" · toi":"");E.sb.textContent="🔥 porte le Bâton";E.nc.textContent=c+(me===0?" · toi":"");E.scn.textContent="⚔️ défie";
  dots(E.db,wins[1]);dots(E.dc,wins[0]);
  const lft=rt!=null&&rt>=0?Math.max(0,BD.round-rt):BD.round,secs=Math.ceil(lft/1000),txt=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,"0")}`;
  if(E.timer.firstChild.nodeValue!==txt)E.timer.firstChild.nodeValue=txt;
  const sub=round>=0?`MANCHE ${round+1}`:"DUEL";if(E.tsub.textContent!==sub)E.tsub.textContent=sub;
  E.timer.classList.toggle("rush",rt!=null&&rt>=0&&lft<10000&&lft>0);
  E.ball.style.left=`${50+f*50}%`;   // CSSOM
  if(screen==="play"){
   E.tl0.textContent=me===1?"← vers toi":`← vers ${b}`;E.tl1.textContent=me===0?"vers toi →":`vers ${c} →`;
   const cb=G?.phase==="play"?G.combo:0,ct=cb>=5?`${cb} combo · ×${(1+Math.min(cb,BD.comboMax)/BD.comboDiv).toFixed(2)}`:"";if(E.combo.textContent!==ct)E.combo.textContent=ct;
  }else{E.tl0.textContent=`${b} · combo ${combos[1]}`;E.tl1.textContent=`${c} · combo ${combos[0]}`;}
 }
 // The spectators' moment: the live round where the stream stands, or the replay where the clock says.
 function watchFrame(now){
  const w=Wt,[c,b]=names(),N=[c,b],srv=o.serverNow();
  if(w.kind==="live"){
   if(w.start==null){setCard(`lwait${w.n}`,()=>[tag(`MANCHE ${w.n+1} · ${w.wins[1]} – ${w.wins[0]}`),el("h3","",`${c} contre ${b}`),el("p","","Les deux joueurs se préparent : la manche va commencer.")]);if(now-(w.asked||0)>2000){w.asked=now;loadWatch();}return {f:0,round:w.n,rt:null,wins:w.wins,combos:[0,0],winner:null};}
   const pos=livePos(srv,w.start,w.up,w.delay),wins=w.wins.slice();
   if(pos<0){setCard(`lcount${w.n}|${countWord(-pos)}`,()=>[tag(`MANCHE ${w.n+1} · ${wins[1]} – ${wins[0]}`),el("div",-pos>800?"bd-big":"bd-go",countWord(-pos)),el("p","","En direct, avec quelques secondes de retard.")]);return {f:0,round:w.n,rt:pos,wins,combos:[0,0],winner:null};}
   const r=sim(w.notes,w.P,{upTo:pos});combos(r);
   if(r.over&&r.over.how==="flame"||r.over&&pos>=BD.round){
    wins[r.over.w]++;const end=Math.max(...wins)>=BD.wins;
    wfeed(`l${w.id}|${w.n}`,`Manche ${w.n+1} pour ${N[r.over.w]} (${r.over.how==="flame"?`la flamme a touché ${N[1-r.over.w]}`:"au temps"}).`);
    if(end){w.final=true;finalCard(wins);}else setCard(`lover${w.n}`,()=>[tag(`MANCHE ${w.n+1}`),el("h3","",`${N[r.over.w]} remporte la manche`),el("p","",`${wins[1]} – ${wins[0]} · la suivante démarre…`)]);
    return {f:r.f,round:w.n,rt:r.over.t,wins,combos:[0,0],winner:end?r.over.w:null};
   }
   if(cardKey)setCard("",null);
   return {f:r.f,round:w.n,rt:pos,wins,combos:[r.stats[0].combo,r.stats[1].combo],winner:null};
  }
  const p=replayPos(w.tl,srv-w.replayAt),wins=winsAt(w.v,p.done);
  for(let k=0;k<p.done;k++){const n=w.v.rounds[k].n,ov=w.v.rounds[k].over;wfeed(`r${w.id}|${n}`,`Manche ${n+1} pour ${N[ov.w]} (${ov.how==="flame"?`la flamme a touché ${N[1-ov.w]}`:"au temps"}).`);}   // joining mid-way: the rounds already seen
  if(p.phase==="wait"){setCard("rwait",()=>[tag("📺 REDIFFUSION"),el("h3","",`${c} contre ${b}`),el("p","",`La rediffusion commence ${o.when(w.replayAt)}.`)]);return {f:0,round:-1,rt:null,wins,combos:[0,0],winner:null};}
  if(p.phase==="end"){w.final=true;finalCard(wins);return {f:w.v.rounds.at(-1)?.f||0,round:p.n,rt:null,wins,combos:[0,0],winner:w.v.winner};}
  const notes=w.charts[p.i],rec=w.rounds[p.n]||{c:[],b:[]};
  if(p.phase==="count"){setCard(`rcount${p.n}|${countWord(p.left)}`,()=>[tag(`MANCHE ${p.n+1} · ${wins[1]} – ${wins[0]}`),el("div",p.left>800?"bd-big":"bd-go",countWord(p.left)),el("p","","Rediffusion du duel.")]);return {f:0,round:p.n,rt:p.rt,wins,combos:[0,0],winner:null};}
  const r=sim(notes,[rec.c,rec.b],{upTo:p.rt});
  if(p.phase==="pause"){
   const ov=w.v.rounds[p.i].over;
   setCard(`rover${p.n}`,()=>[tag(`MANCHE ${p.n+1}`),el("h3","",`${N[ov.w]} remporte la manche`),el("p","",`${wins[1]} – ${wins[0]} · ${p.done<w.tl.rounds.length?"la suivante démarre…":"fin du duel"}`)]);
   return {f:w.v.rounds[p.i].f,round:p.n,rt:p.rt,wins,combos:[0,0],winner:ov.w};
  }
  if(cardKey)setCard("",null);combos(r);
  return {f:r.f,round:p.n,rt:p.rt,wins,combos:[r.stats[0].combo,r.stats[1].combo],winner:null};
  function combos(res){for(const i of [0,1]){const cb=res.stats[i].combo;if(cb>0&&cb%20===0&&cb!==w.combos[i])wfeed(`k${w.id}|${round()}|${i}|${cb}`,`${N[i]} enchaîne ${cb} notes sans faute !`);w.combos[i]=cb;}}
  function round(){return w.kind==="live"?w.n:p.n;}
 }
 function finalCard(wins){
  const [c,b]=names(),changed=wins[0]>=BD.wins;
  wfeed(`f${Wt.id}`,changed?`⚔️ Le Bâton de feu a changé de mains : ${c} l'a arraché à ${b} !`:`🛡️ ${b} a défendu le Bâton de feu face à ${c}.`);
  if(won&&cardKey.startsWith("won"))return;              // the new bearer's own card stays
  setCard("final",()=>[tag("FIN DU DUEL"),portrait(changed?c:b,true),el("h3","",changed?"Le Bâton de feu a changé de mains !":`Le Bâton de feu reste à ${b}`),
   el("p","",changed?`${c} l'a arraché à ${b}, 2 manches à ${wins[1]}.`:`${b} a tenu bon, 2 manches à ${wins[0]}.`),btn("Fermer","",shut)]);
 }

 // ---------------------------------------------------------------- feedback
 function judge(j){const e=E.judge;e.textContent=JUDGE[j];e.className=`bd-judge ${j}`;void e.offsetWidth;e.classList.add("on");}
 function spark(pi,g){if(o.reduced())return;const n=g==="p"?7:3,x=64+(G?.f||0)*22;for(let k=0;k<n;k++)E.sparks.push({x,y:56,vx:(pi===0?-1:1)*(0.4+Math.random()*1.2),vy:-0.5-Math.random()*1.3,born:performance.now()});}
 function dots(node,n){const s=String(n);if(node.dataset.n===s)return;node.dataset.n=s;node.replaceChildren(...Array.from({length:BD.wins},(_,k)=>el("i",k<n?"on":"")));}

 // ---------------------------------------------------------------- the arena: a 128x80 picture scaled up crisp
 function drawArena(t,now,f,winner,rt){
  const lc=E.lo.getContext("2d"),P=(x,y,w,h,col)=>{lc.fillStyle=col;lc.fillRect(Math.round(x),Math.round(y),w,h);};
  const glow=(x,y,r,a,col="255,120,40")=>{const g=lc.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${col},${a.toFixed(2)})`);g.addColorStop(1,`rgba(${col},0)`);lc.fillStyle=g;lc.fillRect(x-r,y-r,r*2,r*2);};
  for(let y=0;y<GROUND;y++){const k=y/GROUND;P(0,y,L,1,`rgb(${24+k*120|0},${6+k*22|0},${16+k*8|0})`);}
  lc.fillStyle="#1a0a12";lc.beginPath();lc.moveTo(0,52);for(const [x,y] of [[14,40],[28,48],[40,36],[52,50],[76,50],[88,34],[102,46],[116,38],[128,48]])lc.lineTo(x,y);lc.lineTo(L,GROUND);lc.lineTo(0,GROUND);lc.fill();
  for(let k=0;k<4;k++)banner(P,((t/55+k*44)%176)-30,18+(k%2)*5,t,k);
  lc.fillStyle="#2a0e10";lc.beginPath();lc.moveTo(30,GROUND);lc.lineTo(56,16);lc.lineTo(72,16);lc.lineTo(98,GROUND);lc.fill();   // the volcano, right behind the staff
  const rush=rt!=null&&rt>BD.round-10000&&rt<BD.round,g=0.6+0.4*Math.sin(t/(rush?60:120));
  P(56,13,16,4,`rgb(255,${120+60*g|0},40)`);glow(64,14,rush?30:22,(rush?0.5:0.35)*g);
  for(let i=0;i<(rush?40:24);i++){const life=((t/(rush?700:1000))+rnd(i))%1,a=(rnd(i+3)-0.5)*2.4;P(64+a*life*26,14-Math.sin(life*Math.PI)*20*rnd(i+5),2,2,["#ff6a1a","#ffb347","#ffd23f"][i%3]);}
  for(let i=0;i<6;i++){P(57-i*2.6+Math.sin(t/300+i),19+i*7,2+i*0.5,2,"#ff4a1a");P(70+i*2.6-Math.sin(t/280+i),19+i*7,2+i*0.5,2,"#ff4a1a");}
  P(0,GROUND,L,AH-GROUND,"#140a0e");for(let x=0;x<L;x+=3)P(x,GROUND+((x*7)%4),2,1,`rgba(255,90,30,${(0.25+0.2*Math.sin(t/200+x)).toFixed(2)})`);
  for(let i=0;i<30;i++){const per=5200+rnd(i)*3000,ph=((t+rnd(i+7)*per)%per)/per;P(rnd(i+11)*L+Math.sin(t/400+i)*3,ph*(AH+4),1,1,i%4?"#8a8590":"#c9c3cc");}   // ash
  // the two candidates lean into the push: the bearer on the left, the challenger on the right, facing each other
  const lean=Math.round(f*2),[c,b]=names();
  for(const i of [0,1]){
   const s=E.sp.getContext("2d");o.sprite(s,{...o.lookOf(i?b:c),object:null,prop:null},t+i*500,winner===i?"win":"idle");
   const size=50,y=GROUND-size+5,x=i===1?4+lean:L-4-size+lean;
   if(i===1)lc.drawImage(E.sp,x,y,size,size);else{lc.save();lc.translate(x+size,y);lc.scale(-1,1);lc.drawImage(E.sp,0,0,size,size);lc.restore();}
   const heat=i===1?Math.max(0,-f):Math.max(0,f);if(heat>0.55)glow(i===1?x+30:x+20,y+30,22,(heat-0.55)*0.9,"255,60,20");   // the flame close to a candidate scorches them
  }
  // the staff, held at both ends, and the flame running along it
  const sy=58;P(36,sy,56,2,"#4a2a16");P(36,sy,56,1,"#6b3d20");for(const x of [44,58,70,84])P(x,sy-1,2,4,"#1d1d22");P(63,sy-1,2,4,"#d42a2a");
  const fx=64+f*24,fr=Math.floor(now/80)%4;
  glow(fx,sy-2,18,0.55);
  for(const [a,bb,w,h] of [[-3,-6,6,7],[-1,-10-fr%2,3,5],[-4,-8+(fr>1?1:0),2,4],[2,-9-(fr===2?1:0),2,4]])P(fx+a,sy+bb,w,h,"#ff6a1a");
  P(fx-2,sy-5,4,4,"#ffb347");P(fx-1,sy-7-fr%2,2,3,"#ffd23f");P(fx-1,sy-3,2,2,"#fff3b0");
  if(!o.reduced())for(let i=0;i<4;i++){const life=((now/600)+i*0.25)%1;P(fx+Math.sin(now/140+i*2)*3,sy-9-life*12,1,1,i%2?"#ffd23f":"#ff6a1a");}
  E.sparks=E.sparks.filter(s=>now-s.born<600);
  for(const s of E.sparks){const a=(now-s.born)/16;P(s.x+s.vx*a,s.y+s.vy*a+0.04*a*a,1,1,a<15?"#ffd23f":"#ff6a1a");}
 }
 // ---------------------------------------------------------------- the player's two lanes
 function drawLanes(now,rt){
  const cv=E.lanes,r=cv.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);
  if(!r.width||!r.height)return;
  if(cv.width!==Math.round(r.width*d)||cv.height!==Math.round(r.height*d)){cv.width=Math.round(r.width*d);cv.height=Math.round(r.height*d);}
  const c=cv.getContext("2d"),W=cv.width,H=cv.height,lw=W/2,hy=H-34*d;
  c.clearRect(0,0,W,H);
  for(let l=0;l<2;l++){
   const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,"#ffffff00");g.addColorStop(1,LANE_COL[l]+"22");c.fillStyle=g;c.fillRect(l*lw+3*d,0,lw-6*d,H);
   const fl=Math.max(0,1-(now-E.flash[l])/180);if(fl>0){c.fillStyle=`rgba(255,180,80,${(0.35*fl).toFixed(2)})`;c.fillRect(l*lw+3*d,0,lw-6*d,H);}
  }
  c.fillStyle="#ffd0b0";c.fillRect(6*d,hy-1*d,W-12*d,2*d);c.shadowColor="#ff6a1a";c.shadowBlur=12*d;c.fillRect(6*d,hy-1*d,W-12*d,2*d);c.shadowBlur=0;
  for(let l=0;l<2;l++){c.strokeStyle=LANE_COL[l];c.lineWidth=2*d;c.beginPath();c.arc(l*lw+lw/2,hy,16*d,0,Math.PI*2);c.stroke();}
  const g=G;if(!g||g.phase!=="play"||rt==null)return;
  const res=g.mine?.res[0]||[];
  g.notes.forEach(([nt,lane],k)=>{
   const dt=nt-rt;if(dt>BD.lead||dt<-260)return;
   const x0=res[k];if(x0==="p"||x0==="g")return;
   const y=hy-dt/BD.lead*hy,x=lane*lw+lw/2,miss=x0==="m";
   c.globalAlpha=miss?0.35:1;
   c.fillStyle=miss?"#6c6478":LANE_COL[lane];c.beginPath();c.arc(x,y,14*d,0,Math.PI*2);c.fill();
   c.fillStyle=miss?"#8a8590":"#fff3b0";c.beginPath();c.arc(x,y+2*d,6*d,0,Math.PI*2);c.fill();
   if(!miss){c.fillStyle=LANE_COL[lane];c.beginPath();c.moveTo(x-9*d,y-8*d);c.lineTo(x,y-24*d);c.lineTo(x+9*d,y-8*d);c.fill();}   // a little flame tongue
   c.globalAlpha=1;
  });
 }

 // ---------------------------------------------------------------- the riff: a kick on every beat, a power chord per note
 // Only with the duel's own sound switch on (the game has no other sound). The kicks follow the tempo, the same in every
 // chart; the chords are scheduled as the notes are revealed.
 let ac=null,master=null,shaper=null,roundT0=0;
 function soundRound(g){
  if(!soundOn)return;
  try{
   ac=ac||new AudioContext();if(ac.state==="suspended")ac.resume();
   stopSound();master=ac.createGain();master.gain.value=0.5;master.connect(ac.destination);
   shaper=ac.createWaveShaper();const curve=new Float32Array(1024);for(let i=0;i<1024;i++)curve[i]=Math.tanh((i/512-1)*6);shaper.curve=curve;shaper.connect(master);
   roundT0=ac.currentTime-(performance.now()-g.t0)/1000;
   for(const b of BEATS){const at=roundT0+b/1000;if(at<ac.currentTime)continue;const o2=ac.createOscillator(),gn=ac.createGain();o2.frequency.setValueAtTime(140,at);o2.frequency.exponentialRampToValueAtTime(40,at+0.12);gn.gain.setValueAtTime(0.9,at);gn.gain.exponentialRampToValueAtTime(0.001,at+0.14);o2.connect(gn).connect(master);o2.start(at);o2.stop(at+0.15);}
   scheduleNotes(g);
  }catch{master=null;}
 }
 function scheduleNotes(g){
  if(!master||!ac)return;
  for(const [nt,lane] of g.notes){
   const k=`${nt}:${lane}`;if(g.heard.has(k))continue;g.heard.add(k);
   const at=roundT0+nt/1000;if(at<ac.currentTime)continue;
   const gn=ac.createGain();gn.gain.setValueAtTime(0.12,at);gn.gain.exponentialRampToValueAtTime(0.001,at+0.13);gn.connect(shaper);
   for(const m of [1,1.5]){const o2=ac.createOscillator();o2.type="sawtooth";o2.frequency.value=[82.41,110][lane]*m;o2.connect(gn);o2.start(at);o2.stop(at+0.14);}
  }
 }
 function stopSound(){if(master&&ac){try{master.gain.setValueAtTime(0,ac.currentTime);master.disconnect();}catch{}master=null;}}

 return {open,close:shut,isOpen,update,frame,onEvent,onLive,onCheer,markWon,
  // a round under way: the game keeps its toasts and banners for later
  playing:()=>isOpen()&&screen==="play"&&!!G&&(G.phase==="count"||G.phase==="play")};
}
const L=128,AH=80,GROUND=66,LANE_COL=["#ff6a1a","#ffd23f"],BEATS=chart(0).beats;   // the kicks: the tempo never depends on the seed
const rnd=i=>((Math.sin(i*127.1)*43758.5453)%1+1)%1;
function banner(P,x,y,t,k){
 P(x,y,1,22,"#3a2416");
 for(let col=0;col<12;col++){const dy=Math.round(Math.sin(t/180+col*0.6+k)*1.5);P(x+1+col,y+1+dy,1,8,k%2?"#b8232a":"#141016");}
 const dy=Math.round(Math.sin(t/180+3.6+k)*1.5);P(x+6,y+3+dy,2,4,"#ff6a1a");P(x+5,y+5+dy,4,2,"#ff6a1a");
}
