// PolitiGo browser client. The server owns the game: this page shows the state it sends, forwards the
// player's actions, and plays the animations announced by the journal entries the server writes.
import * as R from "./rules.mjs";
import {createMini,manifLabel} from "./minigames.mjs";
import {missedEntries,latestEntry} from "./changelog.mjs";
import {drawTest,verdict,randomCamp} from "./politest.mjs";
import {createChat} from "./chat.mjs";
const {people,personalItems,stresses,shop,fxNames,XP,xpCost,xpFloor,stage}=R;
const $=s=>document.querySelector(s);
const motionQuery=matchMedia("(prefers-reduced-motion: reduce)");
let reduced=motionQuery.matches;motionQuery.addEventListener?.("change",e=>{reduced=e.matches;});

// ===================================================================== STATE (a copy of the server's)
let S=null,me=null,SPEED=1,syncReal=0,syncV=0,busy=false,VERSION="dev",RELEASE=null,SEEN=null;
let anim=null,scene=null,pong=null,mini=null,miniClock=0,lvlFx=null;
let board=[],feed=[],journalShown=-1,journalRendered=-1,boardTab="score";
const curIdx=()=>R.curIdx(S),hodOf=R.hodOf,isNight=()=>R.isNight(S),isAsleep=()=>R.isAsleep(S);
const person=lvl=>R.person(S,lvl),look=()=>R.look(S),lookFor=(p,lvl)=>R.lookFor(S,p,lvl);
const itemBlock=it=>R.itemBlock(S,it),activityBlock=()=>R.activityBlock(S),rematchBlock=()=>R.rematchBlock(S);
// The game clock as it is now: the server's last word, moved on by the time elapsed since.
const vnow=()=>syncV+(Date.now()-syncReal)*SPEED;
const seenKey=()=>`politigo.seen.${me}`;
function readSeen(){try{return Number(localStorage.getItem(seenKey()))||0;}catch{return 0;}}
function writeSeen(n){try{localStorage.setItem(seenKey(),String(n));}catch{}}
const allPeople=[...people.left,...people.right];

// ===================================================================== SERVER
async function api(method,path,body){
 let r;
 // A request that hangs (a dead connection) gives up after 15 s instead of blocking every later action.
 try{r=await fetch(path,{method,credentials:"same-origin",signal:AbortSignal.timeout(15000),headers:body===undefined?{}:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});}
 catch(e){return {ok:false,status:0,error:e?.name==="TimeoutError"?"Le serveur ne répond pas : réessaie dans un instant.":"Serveur injoignable : vérifie ta connexion."};}
 let json={};try{const v=await r.json();if(v&&typeof v==="object")json=v;}catch{}
 if(r.status===401&&!["/api/login","/api/account"].includes(path)&&S)showAuth("Ta session a expiré : reconnecte-toi.");
 const fallback=r.ok?"":r.status>=502?"Serveur en cours de redémarrage : réessaie dans un instant.":"Erreur du serveur.";
 return {...json,status:r.status,ok:r.ok&&json.ok!==false,error:json.error||fallback};
}
let skew=0;                                          // server clock minus this device's clock
const serverNow=()=>Date.now()+skew;
// The seasonal event (rules.mjs eventAt), asked every frame: worked out once a second, Intl is not free.
let EVENT_MODE="auto",seasonAt=0,seasonVal="";
function season(){const n=Date.now();if(n-seasonAt>1000){seasonAt=n;seasonVal=R.eventAt(serverNow(),EVENT_MODE);}return seasonVal;}
const hw=()=>season()==="halloween";
function applyMe(m,{replay=false}={}){
 if(!m||!m.state)return;
 if(Number.isFinite(m.serverNow))skew=m.serverNow-Date.now();
 if(R.EVENT_MODES.includes(m.event)&&m.event!==EVENT_MODE){EVENT_MODE=m.event;seasonAt=0;}
 const first=!S||me!==m.name;
 // The action answer and the live stream race each other: an older copy of the state never replaces a newer one.
 if(!first&&m.state.lastReal<S.lastReal)return;
 chatFlags(m.chat);
 me=m.name;SPEED=m.speed||1;VERSION=m.version||"dev";R.setTimeZone(m.tz||"Europe/Paris");
 if("release" in m){RELEASE=m.release||null;SEEN=m.seenVersion||null;}
 S=m.state;syncReal=Date.now();syncV=S.vclock;
 if(first){journalShown=replay?Math.min(readSeen()||S.jn,S.jn):S.jn;journalRendered=-1;}
 playJournal(first&&replay);
 refresh();
}
// New journal entries become animations: a death wins over everything, then an evolution, then the rest.
function playJournal(onlyMajor){
 // Entries whose animation needs details ("d") are only animated when those details survived the save.
 const fresh=S.journal.filter(j=>j.n>journalShown&&(j.d||!["evolve","legend","level","stress"].includes(j.k))).sort((a,b)=>a.n-b.n);
 // Nothing pops up during a game but a death (the game is lost anyway): the rest waits for its end (see tickFrame).
 // Once it is over, the answer carrying its score plays them, its toasts queued behind the game's own result.
 if((pong||mini)&&!fresh.some(j=>j.k==="death"))return;
 journalShown=S.jn;writeSeen(S.jn);
 if(!fresh.length)return;
 let death=null,evoFirst=null,evoLast=null,level=null,stress=null,act=null;
 for(const j of fresh){
  if(j.k==="death"){death=j;evoFirst=evoLast=null;}
  else if(j.k==="evolve"||j.k==="legend"){evoFirst??=j;evoLast=j;}
  else if(j.k==="level")level=j;
  else if(j.k==="stress")stress=j;
  else act=j;
 }
 // A duel cut short by a death still sends what was played, like a game given up.
 if(death){anim=null;if(mini?.duel){mini.abort(miniClock);endMini();}pong=mini=null;startScene("death",death.d?.camp||S.camp,death.d?.name||"");toast(death.text,true);return;}
 if(evoFirst){
  const from=evoFirst.k==="legend"?evoFirst.d.name:evoFirst.d.from,to=evoLast.k==="legend"?evoLast.d.name:evoLast.d.to;
  const legend=evoLast.k==="legend"&&from===to;
  anim=null;toast(legend?`Niveau 100 : ${to} entre dans la légende !`:`Évolution ! Place à ${to}.`);
  startScene("evolve",S.camp,from,{from:lookFor(R.personByName(S,from),evoFirst.d.fromLvl),fromName:from,to:lookFor(R.personByName(S,to),S.lvl),toName:to,lvl:S.lvl,legend});
  return;
 }
 if(onlyMajor)return;
 if(level)lvlFx={t0:performance.now(),lvl:level.d.lvl};
 if(stress){
  const s=stresses[stress.d?.name]?.[stress.d?.i];
  const x=stress.d?.factor>1?stress.d.factor:1;
  if(s){playAnim("stress",6000,{stress:s,factor:x});toast(x>1?`Quitte ou double perdu ! Stress ×${x} : ${s.trigger.toLowerCase()}, moral −${R.STRESS_HIT*x}.`:`${stress.d.name} stresse : ${s.trigger.toLowerCase()} !`);return;}
 }
 if(act){
  const d=act.d||{};
  if(act.k==="buy"){const it=shop.find(i=>i.key===d.key);if(it){if(it.kind==="food")playAnim("eat",2500,{food:it.key});else playAnim(it.anim,3000);}toast(act.text);}
  else if(act.k==="act"&&(d.kind==="debate"||d.kind==="manif"))toast(act.text);   // the mini-game takes the screen
  else if(act.k==="act"&&d.kind==="rematch"){playAnim("win",2500,{line:d.line});toast(act.text);}
  else if(act.k==="nap"){if(!d.on)playAnim("win",1200);toast(d.on?"Lumière éteinte : il se réveillera seul une fois reposé.":act.text);}
  else if(act.k==="wake"){playAnim("win",1500);toast("Il se réveille tout seul, reposé !");}
  else if(act.k==="equip")playAnim("win",1500);
  else if(act.k==="sync")toast(act.text);              // back from a maintenance: said once, nothing to animate
  else if(act.k==="duel"){if(d.res==="win")playAnim("win",2500);toast(act.text);duelJournalT=Date.now();}
  else if(act.k==="treat"){playAnim("eat",2500,{food:"candy"});toast(act.text);}
  else if(level)toast(level.text);
 }else if(level)toast(level.text);
}
// Every game request goes through here (the player's actions, and the duels on /api/duel): one at a time.
async function send(action,path="/api/action"){
 if(busy){toast("Une action est déjà en cours…",true);return null;}busy=true;
 const who=me;let r;
 try{r=await api("POST",path,action);}finally{busy=false;}
 if(!S||me!==who)return null;          // signed out meanwhile: a late answer must not bring the game back
 if(r.me)applyMe(r.me);
 if(!r.ok&&r.error)toast(r.error,true);           // the player's own request: said even mid-game
 return r;
}

// ===================================================================== PLAYER ACTIONS
function playAnim(name,ms,extra={}){anim={name,until:performance.now()+ms,...extra};}
function buy(it){closeSheet();send({type:"buy",key:it.key});}
// The timed debate (both camps) and the Manif (one game per camp): the server charges the activity and opens
// the game, the browser plays it (minigames.mjs), the server checks the score.
let miniEnding=false,miniStartReal=0,pongEnding=false;
// "Playing": a game on screen, or its score on its way to the server. Toasts, news and scenes wait meanwhile.
const quiet=()=>!!(pong||mini)||miniEnding||pongEnding;
const drawCand=(p,state,size,cx,ground,t)=>bigSprite(p,state,size,cx,ground,t);
async function startMini(type){
 closeSheet();
 if(miniEnding){toast("Un instant : le résultat de la partie précédente part au serveur.",true);return;}
 const r=await send({type});if(!r?.ok||!S)return;
 closeSheet();                                      // a sheet opened while the request was on its way
 miniStartReal=Date.now();
 // The Manif plays from the server's seed and its end carries the game's id; the debate is refereed question by
 // question (debateAsk).
 const key=type==="debate"?"debate":r.game?.k,id=r.game?.id;
 if(!R.MINI[key]){toast("Partie introuvable : réessaie dans un instant.",true);return;}
 mini=createMini(key,{p:key==="epervier"?{...look(),prop:"tonfa"}:look(),camp:S.camp,ctx,scale:()=>scale,now:miniClock,season:season(),
  drawCand,seed:r.game?.seed,ask:key==="debate"?debateAsk("solo"):null});
 mini.gameId=id;
 cv.focus();
}
// The debate's referee (POST /api/debate): one request per question, answers by index. A request lost on the way
// (no answer at all) is sent again: it carries the question's idx, so the server never counts it twice. A request
// waits for any other one in flight instead of being dropped.
const debateAsk=ref=>async body=>{
 let r=null;
 for(let k=0;k<3&&S;k++){
  for(const end=Date.now()+5000;busy&&Date.now()<end;)await new Promise(ok=>setTimeout(ok,50));
  r=await send({op:"next",ref,...body},"/api/debate");
  if(!S||(r&&r.status!==0))break;
  await new Promise(ok=>setTimeout(ok,600));
 }
 return r;
};
// Duels: both players play the same debate (the server keeps its seed), one after the other, each refereed by the
// server like a solo debate. No activity is charged and no S.mini is opened: the same game, another scoreboard.
async function startDuel(body,vs,role){
 closeSheet();
 if(miniEnding){toast("Un instant : le résultat de la partie précédente part au serveur.",true);return;}
 const why=R.duelBlock(S,duelData?.minLevel??R.DUEL.minLevel);if(why){toast(why,true);return;}
 if(pong||mini||scene){toast("Termine d'abord la partie en cours.",true);return;}
 const r=await send(body,"/api/duel");
 duelsLoad();
 if(!r?.ok||!S)return;
 if(!Number.isSafeInteger(r.duel?.id)){toast("Duel introuvable : réessaie dans un instant.",true);return;}
 closeSheet();                                      // a sheet opened while the request was on its way
 if(pong||mini)return;
 mini=createMini("debate",{p:look(),camp:S.camp,ctx,scale:()=>scale,now:miniClock,season:season(),drawCand,ask:debateAsk(r.duel.id),duel:true});
 mini.duel={id:r.duel.id,vs,role};
 toast(role==="challenger"?`Défi lancé à ${vs} : mêmes questions pour vous deux, le meilleur score gagne.`:`Défi relevé : mêmes questions que ${vs}, à toi de faire mieux !`,true);
 cv.focus();
}
const challenge=name=>startDuel({op:"challenge",name},name,"challenger");
const acceptDuel=x=>startDuel({op:"accept",id:x.id},x.vs,"defender");
async function refuseDuel(x){const r=await send({op:"refuse",id:x.id},"/api/duel");if(r?.ok)toast(`Défi de ${x.vs} refusé : ça ne te coûte rien.`,true);duelsLoad();}
// The challenger only learns his score (the rival has a day to answer); the defender gets the verdict at once.
function duelDone(d,r){
 const [a,b]=[r.mine,r.theirs].map(v=>Number.isFinite(v)?v:0);
 if(d.role==="challenger"||!["win","loss","tie"].includes(r.res)){
  toast(`Score de ${Number.isFinite(r.score)?r.score:a} envoyé : ${d.vs} a ${Math.round(R.DUEL.window/R.H)} h pour répondre.`);return;
 }
 const q=toastQ.findIndex(t=>/^(Duel gagné|Duel perdu|Match nul) contre /.test(t));
 if(q>=0)toast(toastQ.splice(q,1)[0],true);
 else if(Date.now()-duelJournalT>2000)toast(r.res==="win"?`Duel gagné ${a} à ${b} contre ${d.vs} !`:r.res==="loss"?`Duel perdu ${a} à ${b} contre ${d.vs}.`:`Match nul contre ${d.vs}, ${a} partout.`,true);
 if(r.res==="win")playAnim("win",3000);
}
async function endMini(){
 const key=mini.key,score=mini.score(),duel=mini.duel,id=mini.gameId,result=mini.result,failed=mini.failed;mini=null;pongEnded=performance.now();
 // The debate was scored by its referee as it went: its verdict came with the last answer. A game given up (or cut
 // off) is closed by the server when its time is up, with what was played.
 if(key==="debate"){
  if(duel){
   if(result)duelDone(duel,result);
   else if(S&&!failed)toast(`Duel contre ${duel.vs} interrompu : ton score sera compté à la fin du temps.`);
   duelsLoad();return;
  }
  if(result){
   toast(`${result.score??score} argument${(result.score??score)>1?"s":""} · +${result.bonus} XP d'éloquence. Quitte ou double possible dans Jouer.`);
   if(result.bonus>=10)playAnim("win",3000);
  }else if(S&&!failed)toast("Débat interrompu : ton score sera compté à la fin du temps.");
  return;
 }
 miniEnding=true;
 let r;
 try{
  // A game given up at once still waits for the server's 3-second minimum, instead of being refused.
  const early=miniStartReal+R.MINI_RULES.minSeconds*1000+200-Date.now();if(early>0)await new Promise(ok=>setTimeout(ok,early));
  // As for the Pong: the score must not be lost behind another request.
  for(const end=Date.now()+20000;busy&&Date.now()<end;)await new Promise(ok=>setTimeout(ok,100));
  r=await send({type:"miniEnd",score,id});
 }finally{miniEnding=false;}
 if(r?.ok){
  toast(`${R.MINI[key].label} : +${r.bonus} XP`);
  if(r.bonus>=10)playAnim("win",3000);
 }
}
function rematch(){closeSheet();send({type:"rematch"});}
function toggleLight(){closeSheet();send({type:"light"});}
async function equip(i){await send({type:"equip",i});liveSheet();}
async function pet(){
 if(!S||pong||scene)return;
 if(isAsleep()){toast(isNight()?"Zzz… il dort. Reviens après 6 h.":"Zzz… il fait la sieste. Rallume la lumière dans Soins.");return;}
 playAnim("win",1200);
 const r=await send({type:"pet"});if(r?.ok&&r.petted)toast("Une petite tape sur l'épaule : moral +2");
}

// ===================================================================== SPRITES (64x64 logical grid)
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
// costume: "vampire" or "hunter", the Halloween night skins (render() passes it in the sleep state only).
function sprite(c,p,t,state,legend=false,food="soup",costume=""){
 c.clearRect(0,0,64,64);
 const vamp=costume==="vampire",hunt=costume==="hunter";
 if(vamp)p={...p,coat:"#1c1824",tie:"#b3122e"};else if(hunt)p={...p,coat:"#4a3426",tie:null,glasses:false};
 const phase=Math.floor(t/300)%4,sulk=state==="debate"&&phase>=2,stomp=state==="debate"&&!sulk;
 const run=state==="run",bob=state==="sleep"?0:state==="win"?[0,-3,-5,-2][phase]:run?[0,-2,0,-2][phase]:[0,-1,0,0][phase];
 c.fillStyle="#0004";c.beginPath();c.ellipse(32,59,15,3,0,0,Math.PI*2);c.fill();
 if(legend){for(let i=0;i<8;i++){const a=i*Math.PI/4+t/1300;rect(c,31+Math.cos(a)*25,29+Math.sin(a)*26,2,2,"#fbd47b");}}
 c.save();c.translate(state==="stress"?(phase%2?1:-1):0,bob);
 const skin=vamp?"#e4e0ec":"#e9b38e",shade=vamp?"#c6bccf":"#c78e76",ink="#202330",body=37;
 if(vamp){const k="#120e18",red="#b3122e";rect(c,16,30,32,27,k);rect(c,16,32,2,24,red);rect(c,46,32,2,24,red);rect(c,16,23,7,15,k);rect(c,41,23,7,15,k);rect(c,18,24,3,13,red);rect(c,43,24,3,13,red);}  // cape, high collar
 if(p.style==="long")rect(c,21,15,23,26,p.hair);
 rect(c,22,body,20,18,ink);rect(c,24,body,16,16,p.coat);
 rect(c,29,body,6,9,hunt?"#26262c":"#f1e9da");if(p.tie)rect(c,31,body+2,2,11,p.tie);
 rect(c,24,54-((stomp&&phase===0)||(run&&phase%2===0)?2:0),6,5,ink);rect(c,35,54-((stomp&&phase===1)||(run&&phase%2===1)?2:0),6,5,ink);
 if(hunt){const d="#2e2018";rect(c,22,50,9,6,"#3a281c");rect(c,33,50,9,6,"#3a281c");rect(c,22,50,1,6,d);rect(c,41,50,1,6,d);rect(c,27,body,2,11,d);rect(c,35,body,2,11,d);}   // long leather coat
 const lift=state==="debate"?(phase===0?9:5):state==="win"?5+phase%2*2:state==="eat"?3:0;
 if(sulk){rect(c,18,body+2,5,7,p.coat);rect(c,42,body+2,5,7,p.coat);rect(c,21,body+7,23,4,p.coat);rect(c,21,body+7,23,1,ink);rect(c,22,body+8,3,3,skin);rect(c,40,body+8,3,3,skin);}
 else{rect(c,18,body+2,5,12,p.coat);rect(c,19,body+13,4,4,skin);rect(c,42,body+2-lift,5,12,p.coat);rect(c,43,body+13-lift,4,4,skin);}
 rect(c,29,31,7,8,shade);
 const face=state==="debate"?"#ee9f86":skin;
 rect(c,22,13,21,20,ink);rect(c,23,14,19,18,face);rect(c,21,22,2,6,face);rect(c,42,22,2,6,face);
 rect(c,23,12,19,5,p.style==="bald"||vamp?face:p.hair);
 if(vamp){if(p.style!=="bald"){rect(c,23,12,19,4,p.hair);rect(c,22,13,3,8,p.hair);rect(c,40,13,3,8,p.hair);rect(c,30,16,5,1,p.hair);rect(c,31,17,3,1,p.hair);rect(c,32,18,1,1,p.hair);rect(c,26,13,9,1,"#ffffff2a");}}  // slicked back, widow's peak
 else{
 if(p.style==="receding"){rect(c,27,12,11,4,face);rect(c,22,15,3,7,p.hair);rect(c,40,15,3,7,p.hair);}
 if(p.style==="short")rect(c,22,15,3,5,p.hair);
 if(p.style==="quiff"){rect(c,25,9,15,5,p.hair);rect(c,22,13,4,8,p.hair);}
 if(p.style==="bob"||p.style==="long"){rect(c,21,16,4,18,p.hair);rect(c,40,16,4,18,p.hair);rect(c,25,13,9,5,p.hair);}
 if(p.style==="curly"){for(let i=0;i<5;i++)rect(c,21+i*4,11-(i%2)*2,5,6,p.hair);rect(c,21,16,3,7,p.hair);rect(c,41,16,3,7,p.hair);}
 }
 const blink=state==="sleep"||Math.floor(t/180)%19===0;
 if(state==="stress"){rect(c,26,21,4,4,"#fff");rect(c,35,21,4,4,"#fff");rect(c,27,22,2,2,ink);rect(c,36,22,2,2,ink);}
 else{rect(c,27,22,2,blink?1:3,ink);rect(c,36,22,2,blink?1:3,ink);}
 if(state==="debate"){rect(c,25,19,2,1,ink);rect(c,27,20,2,1,ink);rect(c,38,19,2,1,ink);rect(c,36,20,2,1,ink);rect(c,24,26,3,2,"#e2777a");rect(c,38,26,3,2,"#e2777a");}
 rect(c,32,25,2,3,shade);
 if(p.glasses){c.strokeStyle=ink;c.lineWidth=1;c.strokeRect(25.5,20.5,6,5);c.strokeRect(34.5,20.5,6,5);rect(c,32,22,2,1,ink);}
 if(state==="stress"){for(let i=0;i<4;i++)rect(c,29+i*2,29+(i+phase)%2,2,1,ink);}
 else if(stomp){rect(c,30,28,6,3,ink);rect(c,31,29,4,1,"#783f49");}
 else if(sulk){rect(c,31,29,4,1,ink);rect(c,30,30,1,1,ink);rect(c,35,30,1,1,ink);rect(c,31,30,4,1,"#c56a6a");}
 else rect(c,30,29,6,state==="eat"&&phase%2?3:1,state==="eat"?"#783f49":ink);
 if(p.beard){rect(c,25,30,15,3,p.beardColor||p.hair);rect(c,29,29,7,2,face);rect(c,30,31,5,1,ink);}
 if(vamp){rect(c,30,30,1,2,"#fff");rect(c,35,30,1,2,"#fff");}   // fangs
 if(hunt){const g="#0d0d12";for(const x of [25,34]){rect(c,x,22,6,2,g);rect(c,x+1,21,4,4,g);rect(c,x+1,21,2,1,"#6c7fa8");}rect(c,31,22,3,1,g);rect(c,23,22,2,1,g);rect(c,40,22,2,1,g);   // sunglasses at night
  for(const [x,y] of [[24,33],[27,35],[30,36],[34,36],[37,35],[40,33]]){rect(c,x,y,3,3,"#f3eedd");rect(c,x+1,y-1,1,1,"#c9bf9c");}}   // garlic necklace
 if(state==="eat")drawFood(c,food,(p.side||S?.camp)==="left",28,31,t);
 else if(!sulk&&state!=="sleep")drawProp(c,p.prop,46,43-lift);
 c.restore();
 if(state==="sleep"){c.fillStyle="#a8c9ff";c.font="bold 8px monospace";c.fillText("z",48,17-phase*2);c.fillText("Z",53,10-phase);}
 if(stomp){const red="#c23b4a";rect(c,44,2,18,10,"#ffd2a6");rect(c,46,12,3,3,"#ffd2a6");rect(c,46,4,1,6,red);rect(c,48,4,1,6,red);rect(c,45,5,5,1,red);rect(c,45,8,5,1,red);rect(c,52,4,4,6,ink);rect(c,53,5,2,4,"#ffd2a6");rect(c,54,6,1,2,ink);rect(c,59,4,1,4,red);rect(c,59,9,1,1,red);rect(c,17,10-phase*2,3,2,"#dfe6f0");rect(c,14,6-phase,2,2,"#dfe6f0");}
 if(sulk){rect(c,26,3,12,4,"#6d7385");rect(c,28,1,8,2,"#6d7385");rect(c,32,7,1,2,"#f4d57b");rect(c,31,9,1,2,"#f4d57b");}
 if(state==="stress"){rect(c,18,14+phase*2,2,3,"#8fd0ff");rect(c,45,17+(phase+2)%4*2,2,3,"#8fd0ff");rect(c,44,2,18,10,"#f6c9c9");rect(c,46,12,3,3,"#f6c9c9");for(let i=0;i<3;i++){rect(c,47+i*5,4,2,4,"#c23b4a");rect(c,47+i*5,9,2,1,"#c23b4a");}}
 if(state==="win"){for(let i=0;i<7;i++)rect(c,5+i*8,(t/40+i*9)%25,2,3,["#fbd47b","#ed819a","#8db4ff"][i%3]);}
}
function drawProp(c,type,x,y){
 const k="#202330",paper="#f2e8cd";
 switch(type){
 case"puzzle":rect(c,x-4,y-10,12,12,"#d69bc3");rect(c,x,y-10,2,12,"#70567b");rect(c,x-4,y-5,12,2,"#70567b");break;
 case"watering":rect(c,x-4,y-7,9,9,"#81b5a3");rect(c,x+5,y-8,5,3,"#81b5a3");rect(c,x-3,y-11,6,2,"#81b5a3");break;
 case"jacket":rect(c,x-3,y-11,10,14,"#d56b73");rect(c,x-6,y-9,3,8,"#d56b73");rect(c,x+7,y-9,3,8,"#d56b73");rect(c,x+1,y-11,2,14,paper);break;
 case"camera":rect(c,x-5,y-7,14,9,"#7f8e9d");rect(c,x-2,y-10,5,3,"#7f8e9d");rect(c,x,y-5,5,5,k);break;
 case"pot":rect(c,x-4,y-7,12,9,"#b5b9c9");rect(c,x-6,y-7,16,2,k);rect(c,x,y-10,4,2,paper);break;
 case"calculator":rect(c,x-3,y-12,11,15,"#859aa3");rect(c,x-1,y-10,7,4,"#c6e4c4");for(let i=0;i<6;i++)rect(c,x-1+(i%3)*3,y-4+Math.floor(i/3)*3,2,2,k);break;
 case"water":rect(c,x-2,y-12,5,3,paper);rect(c,x-4,y-9,10,12,"#9bcdda");rect(c,x-2,y-4,6,5,"#559dd3");break;
 case"hologram":rect(c,x-5,y+1,14,3,"#6b8ebd");rect(c,x,y-12,4,4,"#8ff3ef");rect(c,x-2,y-7,8,7,"#76bfe2");break;
 case"ticket":rect(c,x-5,y-9,15,9,"#957ee2");rect(c,x-3,y-7,6,2,paper);rect(c,x+5,y-9,1,9,paper);break;
 case"train":rect(c,x-5,y-10,14,12,"#849bd8");rect(c,x-3,y-8,10,4,"#dceafa");rect(c,x-3,y+2,3,2,k);rect(c,x+4,y+2,3,2,k);break;
 case"palette":rect(c,x-5,y-10,15,11,"#cbaa72");for(let i=0;i<4;i++)rect(c,x-3+i*3,y-8+(i%2)*4,2,2,["#dd7070","#7da8db","#e9d478","#7fba8c"][i]);break;
 case"tower":rect(c,x-3,y-12,10,15,"#beaa8c");rect(c,x-5,y-14,14,3,"#beaa8c");rect(c,x,y-9,4,4,k);break;
 case"lighthouse":rect(c,x-2,y-12,6,15,paper);rect(c,x-2,y-4,6,3,"#e87c7e");rect(c,x-4,y-14,10,3,"#f4d57b");rect(c,x-5,y+3,12,2,k);break;
 case"gloves":rect(c,x-5,y-9,6,9,"#e27876");rect(c,x+3,y-11,6,9,"#e27876");rect(c,x-4,y,4,3,paper);rect(c,x+4,y-2,4,3,paper);break;
 case"compass":rect(c,x-4,y-11,13,13,"#c6ae76");rect(c,x-2,y-9,9,9,paper);rect(c,x+2,y-8,1,7,"#d15e65");break;
 case"stone":rect(c,x-5,y-6,14,7,"#9faab5");rect(c,x-2,y-8,8,2,"#bac4cc");break;
 case"cat":rect(c,x-3,y-10,10,8,"#d7bb94");rect(c,x-3,y-13,3,3,"#d7bb94");rect(c,x+4,y-13,3,3,"#d7bb94");rect(c,x-1,y-7,1,2,k);rect(c,x+4,y-7,1,2,k);rect(c,x-2,y-2,9,6,"#d7bb94");rect(c,x+7,y,3,2,"#d7bb94");break;
 case"leaf":rect(c,x,y-9,1,12,"#6bac73");rect(c,x-4,y-8,4,4,"#83c678");rect(c,x+1,y-11,4,4,"#83c678");break;
 case"rose":rect(c,x,y-7,1,12,"#6bac73");rect(c,x-3,y-12,7,6,"#ef6c89");rect(c,x-1,y-13,3,8,"#bc3f68");break;
 case"paper":case"book":case"scroll":rect(c,x-2,y-10,11,14,type==="book"?"#bd8959":paper);for(let i=0;i<3;i++)rect(c,x,y-7+i*3,6,1,"#685a67");break;
 case"badge":rect(c,x-4,y-5,7,7,"#da5d6e");rect(c,x-2,y-3,3,3,"#f2d879");break;
 case"bike":c.strokeStyle="#99c5ba";c.lineWidth=1;for(const dx of [-5,6]){c.beginPath();c.arc(x+dx,y+4,4,0,Math.PI*2);c.stroke();}c.beginPath();c.moveTo(x-5,y+4);c.lineTo(x,y-3);c.lineTo(x+6,y+4);c.lineTo(x-5,y+4);c.stroke();break;
 case"mic":rect(c,x,y-6,2,12,k);rect(c,x-2,y-10,6,6,"#aeb4c3");break;
 case"tonfa":rect(c,x,y-12,3,17,k);rect(c,x-3,y-6,4,2,k);break;        // the Épervier only
 case"case":rect(c,x-1,y-8,6,3,k);rect(c,x-4,y-5,13,10,"#9c7354");rect(c,x+1,y-2,2,3,"#edcb78");break;
 case"flag":rect(c,x,y-15,1,22,paper);rect(c,x+1,y-15,4,8,"#6893dc");rect(c,x+5,y-15,4,8,paper);rect(c,x+9,y-15,4,8,"#e1777e");break;
 case"mountain":c.fillStyle="#c6d1de";c.beginPath();c.moveTo(x-5,y+3);c.lineTo(x+1,y-9);c.lineTo(x+9,y+3);c.fill();break;
 case"box":rect(c,x-6,y-9,14,11,"#b8895a");rect(c,x-6,y-9,14,2,"#9a6e44");rect(c,x,y-9,2,11,"#e2cf9a");rect(c,x-4,y-12,3,3,paper);break;
 case"europe":rect(c,x-4,y-11,15,13,"#4873bb");for(let i=0;i<6;i++){const a=i*Math.PI/3;rect(c,x+3+Math.cos(a)*4,y-5+Math.sin(a)*4,1,1,"#f8d476");}break;
 }
}
function drawFood(c,key,left,x,y,t){
 const steam="#dfe6f0",puff=Math.floor(t/300)%2,paper="#f2e8cd",brown="#6b4426";
 // Halloween costumes (same items, same effects): pumpkin soup, cauldron potion, candies or pralines.
 if(hw()||key==="candy")switch(key){
 case"soup":rect(c,x,y-4,10,5,"#e0731c");rect(c,x+3,y-4,1,5,"#b85814");rect(c,x+6,y-4,1,5,"#b85814");rect(c,x+1,y-5,8,2,"#ffb04a");rect(c,x+4,y-6,2,1,"#5f8a3a");rect(c,x+3,y-9+puff,1,3,steam);rect(c,x+7,y-8-puff,1,3,steam);return;
 case"coffee":rect(c,x+1,y-4,9,5,"#26262e");rect(c,x,y-5,11,1,"#3c3c48");rect(c,x+2,y-6,7,1,"#7ee06a");rect(c,x+2,y+1,1,1,"#26262e");rect(c,x+8,y+1,1,1,"#26262e");
  rect(c,x+3+puff*3,y-8-puff,2,2,"#9cf28a");rect(c,x+6-puff*2,y-10+puff,1,1,"#9cf28a");return;
 case"snack":
  if(left){for(const [dx,dy,col] of [[0,-2,"#e8476a"],[4,-5,"#f2a531"]]){rect(c,x+dx+2,y+dy,4,3,col);rect(c,x+dx,y+dy,2,1,paper);rect(c,x+dx,y+dy+2,2,1,paper);rect(c,x+dx+6,y+dy,2,1,paper);rect(c,x+dx+6,y+dy+2,2,1,paper);}}
  else{rect(c,x,y,10,1,"#d9b45a");for(const dx of [1,4,7])rect(c,x+dx,y-3,3,3,"#5a3420");rect(c,x+2,y-3,1,1,"#d9b45a");rect(c,x+8,y-3,1,1,"#e8c9a0");}return;
 case"candy":for(const [dx,dy,col] of [[0,-1,"#f2862a"],[5,-1,"#8e5ad8"],[2,-4,"#5fc25a"]]){rect(c,x+dx+1,y+dy,3,2,col);rect(c,x+dx,y+dy,1,2,paper);rect(c,x+dx+4,y+dy,1,2,paper);}return;
 }
 switch(key){
 case"bread":rect(c,x,y-3,10,4,"#d9a35f");rect(c,x+2,y-4,6,1,"#e9c07a");rect(c,x+3,y-3,1,1,"#a8703a");rect(c,x+6,y-2,1,1,"#a8703a");break;
 case"banquet":rect(c,x-3,y,16,2,paper);rect(c,x-1,y-4,8,4,"#b0703a");rect(c,x+5,y-6,2,3,paper);rect(c,x+9,y-7,3,4,left?"#b8324a":"#f0d97a");rect(c,x+10,y-3,1,3,paper);rect(c,x+9,y,3,1,paper);break;
 case"soup":rect(c,x,y-4,10,5,"#b5b9c9");rect(c,x+1,y-5,8,2,left?"#d98a4e":"#7fa860");rect(c,x+3,y-9+puff,1,3,steam);rect(c,x+6,y-8-puff,1,3,steam);break;
 case"meal":rect(c,x-1,y,12,2,paper);
  if(left){rect(c,x+1,y-3,8,3,"#e8c96a");rect(c,x+3,y-5,4,2,"#e8c96a");rect(c,x+2,y-3,2,2,"#d9603f");rect(c,x+6,y-2,2,2,"#7fae5a");}
  else{rect(c,x,y-4,10,4,"#a8653a");rect(c,x+1,y-5,8,2,"#e9b55a");rect(c,x+3,y-5,2,1,"#c98a3a");}break;
 case"snack":
  if(left){rect(c,x+1,y-5,8,6,"#c99a5b");rect(c,x+3,y-3,1,1,brown);rect(c,x+6,y-2,1,1,brown);rect(c,x+4,y-4,1,1,brown);}
  else{rect(c,x,y-1,10,2,"#d9a35f");rect(c,x+1,y-3,7,2,"#d9a35f");rect(c,x+1,y-4,5,1,"#c2414f");rect(c,x+2,y-5,3,1,"#c2414f");}break;
 case"coffee":rect(c,x+2,y-5,6,6,left?"#e98f6f":paper);rect(c,x+3,y-4,4,2,brown);rect(c,x+8,y-3,2,2,left?"#e98f6f":paper);rect(c,x,y+1,10,1,paper);rect(c,x+4,y-9+puff,1,3,steam);break;
 }
}

// ===================================================================== SCREEN
const cv=$("#screen"),ctx=cv.getContext("2d"),scratch=document.createElement("canvas");scratch.width=scratch.height=64;
// Everything is drawn in a 466x466 logical space (the real panel); the backing store follows the
// device pixel ratio so text stays sharp on phones instead of being upscaled from 466 px.
let scale=1;
function fitCanvas(){
 const css=cv.getBoundingClientRect().width||466,k=Math.max(1,Math.min(3,Math.ceil(css*(window.devicePixelRatio||1)/466*2)/2));
 if(k!==scale||cv.width!==Math.round(466*k)){scale=k;cv.width=cv.height=Math.round(466*k);}
}
addEventListener("resize",fitCanvas);
const GAUGES=[{k:"sat",l:"SAT",c:"#f1bc72",a:200},{k:"moral",l:"MOR",c:"#ef91ae",a:290},{k:"energy",l:"ÉNE",c:"#85cbbb",a:20},{k:"hyg",l:"HYG",c:"#93b4ec",a:110}];
function bigSprite(p,state,size,cx,ground,t,legend=false,food,costume=""){
 sprite(scratch.getContext("2d"),p,t,state,legend,food,costume);
 ctx.imageSmoothingEnabled=false;ctx.drawImage(scratch,cx-size/2,ground-size,size,size);
}
// Fits a centred label inside the round panel: shrink first, then split into two balanced lines.
function fitLabel(text,y){
 const room=yy=>2*Math.sqrt(233*233-(yy-233)**2)-40;
 for(let size=15;size>=11;size--){ctx.font=`600 ${size}px Inter, system-ui, sans-serif`;if(ctx.measureText(text).width<=room(y)){ctx.fillText(text,233,y);return;}}
 const words=text.split(" ");let best=null;
 for(let i=1;i<words.length;i++){const l1=words.slice(0,i).join(" "),l2=words.slice(i).join(" "),w=Math.max(ctx.measureText(l1).width,ctx.measureText(l2).width);if(!best||w<best.w)best={l1,l2,w};}
 if(!best){ctx.fillText(text,233,y);return;}
 ctx.fillText(best.l1,233,y-7);ctx.fillText(best.l2,233,y+8);
}
function room(night){
 const left=S.camp==="left",h=hodOf(curIdx()),spooky=hw();
 const sky=spooky?(night?"#120a26":h<8?"#3d2350":h>=19?(left?"#3a1838":"#24184a"):(left?"#5a2a52":"#3a2c66"))
  :night?"#0e1433":h<8?"#5b4a7a":h>=19?(left?"#5d2f4e":"#2f3f6e"):(left?"#7a3d5c":"#3d5f96");
 ctx.fillStyle=sky;ctx.fillRect(0,0,466,466);
 if(spooky){ctx.fillStyle=hwPaint().dusk;ctx.fillRect(0,140,466,178);}      // an orange glow on the horizon
 if(night){ctx.fillStyle="#ffffffaa";for(let i=0;i<26;i++)ctx.fillRect((i*97)%440+13,(i*53)%200+40,2,2);}
 ctx.lineWidth=12;ctx.strokeStyle=spooky?"#ffb05a1c":left?"#ffb2c21c":"#b4ceff1c";            // the hemicycle
 for(const r of [130,165,200]){ctx.beginPath();ctx.arc(233,318,r,Math.PI,2*Math.PI);ctx.stroke();}
 ctx.fillStyle=spooky?(night?"#120c1a":"#1c1424"):night?"#141a2a":"#1f2536";ctx.fillRect(0,318,466,148);
 ctx.fillStyle="#ffffff10";ctx.fillRect(0,318,466,3);
}
// ---------- Halloween (31 October and 1 November, rules.mjs eventAt): decor only, nothing changes in the game ----------
// The gradients are made once (the context never changes) and faded with globalAlpha.
let hwCache=null;
function hwPaint(){
 if(hwCache)return hwCache;
 const glow=(x,y,r)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,"rgba(255,168,64,.5)");g.addColorStop(1,"rgba(255,168,64,0)");return g;};
 const dusk=ctx.createLinearGradient(0,140,0,318);dusk.addColorStop(0,"rgba(255,120,40,0)");dusk.addColorStop(1,"rgba(255,120,40,.26)");
 return hwCache={dusk,pumpkins:PUMPKINS.map(([x,y,r])=>glow(x,y,r*3)),candle:glow(330,296,70)};
}
const PUMPKINS=[[80,331,15],[388,331,13],[300,337,9]];
// A jack-o'-lantern; lit (0-1) brightens its face, a negative one draws none (the Pong's tiny pumpkin).
function pumpkin(x,y,r,lit){
 ctx.fillStyle="#e8761e";ctx.beginPath();ctx.ellipse(x,y,r,r*0.8,0,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle="#b85814";ctx.lineWidth=Math.max(1,r/7);ctx.beginPath();ctx.ellipse(x,y,r*0.45,r*0.8,0,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle="#4f7a2e";ctx.fillRect(x-r*0.12,y-r*1.05,r*0.25,r*0.35);
 if(lit<0)return;
 ctx.fillStyle=`rgb(255,${200+Math.round(40*lit)},90)`;ctx.beginPath();
 for(const s of [-1,1]){ctx.moveTo(x+s*r*0.5,y-r*0.1);ctx.lineTo(x+s*r*0.2,y-r*0.1);ctx.lineTo(x+s*r*0.35,y-r*0.4);}
 ctx.moveTo(x-r*0.55,y+r*0.15);for(let i=0;i<=4;i++)ctx.lineTo(x-r*0.55+i*r*0.275,y+r*(i%2?0.45:0.25));ctx.lineTo(x+r*0.4,y+r*0.55);ctx.lineTo(x-r*0.4,y+r*0.55);ctx.fill();
}
// A sheet ghost: a round head, a scalloped hem.
function ghost(x,y,r,fill){
 ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,Math.PI,0);ctx.lineTo(x+r,y+r*1.2);
 for(let i=1;i<=4;i++)ctx.lineTo(x+r-i*r/2,y+r*(i%2?0.85:1.2));ctx.closePath();ctx.fill();
 const e=Math.max(2,r*0.22);ctx.fillStyle="#2a2230";ctx.fillRect(x-r*0.45,y-r*0.2,e,e*1.4);ctx.fillRect(x+r*0.25,y-r*0.2,e,e*1.4);
}
function bat(x,y,up){
 ctx.fillStyle="#120a18";ctx.beginPath();ctx.ellipse(x,y,3,4,0,0,Math.PI*2);ctx.fill();
 ctx.beginPath();for(const s of [-1,1]){ctx.moveTo(x,y-1);ctx.lineTo(x+s*7,y+(up?-6:-1));ctx.lineTo(x+s*13,y+(up?-3:3));ctx.lineTo(x+s*9,y+(up?0:2));ctx.lineTo(x+s*6,y+(up?-1:4));ctx.lineTo(x,y+2);}ctx.fill();
}
// A cobweb hanging in a corner of the round panel, its strands pointing at the centre.
function cobweb(a){
 const ax=233+Math.cos(a)*206,ay=233+Math.sin(a)*206,d=a+Math.PI;
 ctx.strokeStyle="#ffffff2e";ctx.lineWidth=1;ctx.beginPath();
 for(let i=-2;i<=2;i++){ctx.moveTo(ax,ay);ctx.lineTo(ax+Math.cos(d+i*0.3)*46,ay+Math.sin(d+i*0.3)*46);}
 for(const r of [14,26,38])for(let i=-2;i<=2;i++){const x=ax+Math.cos(d+i*0.3)*r,y=ay+Math.sin(d+i*0.3)*r;if(i===-2)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
 ctx.stroke();
}
let ghostSaid="",ghostLines=[],ghostW=0;
// The room's Halloween decor: moon, bats, cobwebs, jack-o'-lanterns and the camp's spectre, who speaks up every 15 s.
function hwRoom(t,now){
 const G=hwPaint(),left=S.camp==="left";
 ctx.fillStyle="#ffb34722";ctx.beginPath();ctx.arc(352,160,42,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#ffb347";ctx.beginPath();ctx.arc(352,160,30,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#e8973a";for(const [x,y,r] of [[342,150,6],[362,170,4],[358,146,3]]){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
 for(let i=0;i<3;i++){
  const x=reduced?[150,318,392][i]:(t/28+i*207)%620-80,y=reduced?[168,138,206][i]:150+i*24+Math.sin(t/420+i*2)*8;
  bat(x,y,!reduced&&Math.floor(t/130+i)%2===0);
 }
 cobweb(232*Math.PI/180);cobweb(308*Math.PI/180);
 const flick=reduced?0.8:0.75+0.25*Math.sin(t/90+1)*Math.sin(t/37);
 PUMPKINS.forEach(([x,y,r],i)=>{ctx.globalAlpha=flick;ctx.fillStyle=G.pumpkins[i];ctx.fillRect(x-r*3,y-r*3,r*6,r*6);ctx.globalAlpha=1;pumpkin(x,y,r,flick);});
 // "Le spectre du communisme" (a red flag) or "le spectre de la dette" (a ball and chain).
 const gx=92,gy=232+(reduced?0:Math.sin(t/700)*5);
 ghost(gx,gy,15,"#f2f0fae6");
 if(left){ctx.strokeStyle="#8a6a44";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(gx+13,gy+6);ctx.lineTo(gx+19,gy-24);ctx.stroke();ctx.fillStyle="#d42a2a";ctx.fillRect(gx+19,gy-24,13,8);ctx.fillStyle="#f6d25a";ctx.fillRect(gx+22,gy-22,2,2);}
 else{
  ctx.fillStyle="#8a8f9e";for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(gx+8+i*4,gy+18+i*3.5,1.6,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle="#2a2a33";ctx.beginPath();ctx.arc(gx+28,gy+36,15,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#fff6ea";ctx.font="700 7px ui-monospace, monospace";ctx.textAlign="center";ctx.fillText("3 000",gx+28,gy+35);ctx.fillText("Md€",gx+28,gy+43);
 }
 if(now%15000<3000){
  const said=R.HALLOWEEN.ghost[S.camp];ctx.font="700 10px Inter, system-ui, sans-serif";
  if(said!==ghostSaid){ghostSaid=said;ghostLines=[];let cur="";for(const w of said.split(" ")){const x=cur?cur+" "+w:w;if(ctx.measureText(x).width>118&&cur){ghostLines.push(cur);cur=w;}else cur=x;}ghostLines.push(cur);ghostW=Math.max(...ghostLines.map(l=>ctx.measureText(l).width))+14;}
  const w=ghostW,hh=ghostLines.length*12+8,bx=52,by=gy-28-hh-8;
  ctx.fillStyle="#fff6ea";ctx.beginPath();ctx.roundRect(bx,by,w,hh,8);ctx.moveTo(gx-6,by+hh-1);ctx.lineTo(gx,by+hh+7);ctx.lineTo(gx+5,by+hh-1);ctx.fill();
  ctx.fillStyle="#2a2230";ctx.textAlign="left";ghostLines.forEach((l,i)=>ctx.fillText(l,bx+7,by+15+i*12));ctx.textAlign="center";
 }
}
// Behind the sleeper: the vampire's open coffin, the hunter's kit (garlic, "Le Capital" as a stake, placard).
function hwProps(costume){
 if(costume==="vampire"){
  const shape=pts=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();};
  shape([[192,128],[274,128],[300,184],[282,318],[184,318],[166,184]]);ctx.fillStyle="#5b2416";ctx.fill();ctx.strokeStyle="#3a140c";ctx.lineWidth=4;ctx.stroke();
  shape([[199,137],[267,137],[290,185],[274,312],[192,312],[176,185]]);ctx.fillStyle="#8c1c2c";ctx.fill();
  ctx.fillStyle="#6e1422";for(let y=170;y<300;y+=26)for(let x=196;x<276;x+=20)ctx.fillRect(x,y,3,3);
  ctx.fillStyle="#d9b45a";ctx.fillRect(205,140,56,13);ctx.strokeStyle="#8a6a22";ctx.lineWidth=1;ctx.strokeRect(205.5,140.5,55,12);
  ctx.fillStyle="#3a2a10";ctx.font="700 9px Inter, system-ui, sans-serif";ctx.textAlign="center";ctx.fillText("Patrimoine",233,150);
 }else if(costume==="hunter"){
  for(const [x,y] of [[118,311],[133,309],[147,312],[125,301],[140,300],[132,291]]){
   ctx.fillStyle="#f3eedd";ctx.beginPath();ctx.ellipse(x,y,7,6,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle="#d5ccb0";ctx.fillRect(x-1,y-9,2,4);ctx.fillRect(x-3,y-3,1,6);ctx.fillRect(x+2,y-3,1,6);
  }
  ctx.save();ctx.translate(166,318);ctx.rotate(-0.18);
  ctx.fillStyle="#c9a26a";ctx.beginPath();ctx.moveTo(-6,-104);ctx.lineTo(6,-104);ctx.lineTo(0,-122);ctx.fill();
  ctx.fillStyle="#b3202c";ctx.fillRect(-6,-104,12,96);ctx.fillStyle="#8e1520";for(let y=-96;y<-8;y+=22)ctx.fillRect(-6,y,12,2);
  ctx.translate(0,-56);ctx.rotate(-Math.PI/2);ctx.fillStyle="#f2d27a";ctx.font="700 8px ui-monospace, monospace";ctx.textAlign="center";ctx.fillText("LE CAPITAL",0,3);
  ctx.restore();
  ctx.fillStyle="#8a6a44";ctx.fillRect(350,250,4,68);
  ctx.fillStyle="#f2e8cd";ctx.fillRect(308,226,88,36);ctx.strokeStyle="#c23b4a";ctx.lineWidth=2;ctx.strokeRect(309,227,86,34);
  ctx.fillStyle="#c23b4a";ctx.font="700 10px Inter, system-ui, sans-serif";ctx.textAlign="center";ctx.fillText("TAXEZ LES",352,241);ctx.fillText("VAMPIRES",352,255);
 }
}
// A nap with the light off: one candle, its warm glow flickering.
function hwCandle(t){
 const f=reduced?0.85:0.75+0.25*Math.sin(t/80)*Math.sin(t/31+2);
 ctx.globalAlpha=f;ctx.fillStyle=hwPaint().candle;ctx.fillRect(260,226,140,140);ctx.globalAlpha=1;
 ctx.fillStyle="#efe6cf";ctx.fillRect(326,302,8,16);ctx.fillStyle="#202330";ctx.fillRect(329,299,2,3);
 ctx.fillStyle="#ffcf5a";ctx.beginPath();ctx.ellipse(330,293,3,5+f*2,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#fff3c0";ctx.beginPath();ctx.ellipse(330,295,1.5,2.5,0,0,Math.PI*2);ctx.fill();
}
function gauges(now){
 ctx.lineCap="round";
 for(const g of GAUGES){
  const a0=g.a*Math.PI/180,a1=(g.a+50)*Math.PI/180,v=S[g.k];
  ctx.lineWidth=10;ctx.strokeStyle="#ffffff22";ctx.beginPath();ctx.arc(233,233,214,a0,a1);ctx.stroke();
  if(v>0){
   const low=v<25;ctx.globalAlpha=low&&!reduced?0.55+0.45*Math.abs(Math.sin(now/300)):1;
   ctx.strokeStyle=low?"#ff6b7a":g.c;ctx.beginPath();ctx.arc(233,233,214,a0,a0+(a1-a0)*v/100);ctx.stroke();ctx.globalAlpha=1;
  }
  const m=(g.a+25)*Math.PI/180;ctx.fillStyle="#ffffffc0";ctx.font="700 12px ui-monospace, monospace";ctx.textAlign="center";
  ctx.fillText(g.l,233+Math.cos(m)*192,233+Math.sin(m)*192+4);
 }
 ctx.lineCap="butt";
}
// The speech bubble stays inside the inner edge of the rim gauges (radius 209): its corners are checked, not guessed.
function bubble(text,tag){
 const x=123,w=220,y=326,h=tag?80:68;
 ctx.fillStyle="#fff6ea";ctx.beginPath();ctx.roundRect(x,y,w,h,16);ctx.moveTo(222,y+1);ctx.lineTo(233,y-12);ctx.lineTo(244,y+1);ctx.fill();
 ctx.textAlign="center";
 let top=y+22;
 if(tag){ctx.font="700 11px ui-monospace, monospace";ctx.fillStyle="#a4405c";ctx.fillText(tag,233,top,w-20);top+=17;}
 ctx.font="700 13px Inter, system-ui, sans-serif";ctx.fillStyle="#2a2230";
 const lines=[];let cur="";
 for(const word of text.split(" ")){const t=cur?cur+" "+word:word;if(ctx.measureText(t).width>w-24&&cur){lines.push(cur);cur=word;}else cur=t;}
 lines.push(cur);
 const shown=lines.slice(0,3),room=y+h-top-6,step=16,first=top+Math.max(0,(room-shown.length*step)/2)+4;
 shown.forEach((l,i)=>ctx.fillText(l,233,first+i*step,w-16));
}
function render(now){
 ctx.setTransform(scale,0,0,scale,0,0);
 if(scene&&drawScene(now))return;
 if(pong){drawPong(now);return;}
 if(mini){mini.draw(miniClock);return;}
 const night=isAsleep(),t=reduced?0:now,spooky=hw();
 if(anim&&now>anim.until)anim=null;
 const state=anim?(anim.name==="bath"?"idle":anim.name):night?"sleep":"idle";
 const costume=spooky&&state==="sleep"?(S.camp==="left"?"hunter":"vampire"):"";
 room(isNight());
 if(spooky){hwRoom(t,now);hwProps(costume);}
 if(S.sleeping&&!isNight()){ctx.fillStyle="rgba(6,8,22,.62)";ctx.fillRect(0,0,466,466);if(spooky)hwCandle(t);}   // light off during a nap
 gauges(now);
 const p=look();
 ctx.textAlign="center";ctx.fillStyle="#fff6ea";ctx.font="600 25px Fredoka, system-ui, sans-serif";ctx.fillText(p.name,233,92);
 ctx.font="600 13px ui-monospace, monospace";ctx.fillStyle="#ffffffc0";ctx.fillText(`NIVEAU ${S.lvl}${S.lvl===100?" · LÉGENDE":""}`,233,112);
 const part=S.lvl>=100?1:Math.min(1,(S.xp-xpFloor(S.lvl))/xpCost(S.lvl));
 ctx.fillStyle="#ffffff26";ctx.fillRect(173,119,120,4);ctx.fillStyle="#ffd59a";ctx.fillRect(173,119,Math.round(120*part),4);
 bigSprite(p,state,192,233,318,t,S.lvl===100,anim&&anim.food,costume);
 if(lvlFx){                                        // the small level-up burst
  const e=(now-lvlFx.t0)/1000;
  if(e>1.6)lvlFx=null;
  else{
   ctx.globalAlpha=Math.max(0,1-e/1.6);
   for(let i=0;i<14;i++){const a=i*Math.PI/7+e*2,r=46+e*95;ctx.fillStyle=["#ffd59a","#fff6ea","#ff9db0"][i%3];ctx.fillRect(233+Math.cos(a)*r-3,226+Math.sin(a)*r*0.8-3,6,6);}
   ctx.fillStyle="#ffd59a";ctx.font="700 26px Fredoka, system-ui, sans-serif";ctx.textAlign="center";ctx.fillText(`NIVEAU ${lvlFx.lvl} !`,233,158-e*14);
   ctx.globalAlpha=1;
  }
 }
 if(anim&&anim.name==="bath"&&spooky){for(let i=0;i<9;i++){const k=((now/900)+i*0.37)%1;ghost(160+(i*37)%150,300-k*170,5+(i%3)*3,"#f4f0ffcc");}}   // little ghosts instead of bubbles
 else if(anim&&anim.name==="bath"){ctx.strokeStyle="#cfe9ff";ctx.lineWidth=2;for(let i=0;i<9;i++){const k=((now/900)+i*0.37)%1;ctx.beginPath();ctx.arc(160+(i*37)%150,300-k*170,5+(i%3)*3,0,Math.PI*2);ctx.stroke();}}
 if(anim&&anim.stress)bubble(`« ${anim.stress.line} »`,(anim.factor>1?`STRESS ×${anim.factor} · `:"")+anim.stress.trigger.toUpperCase());
 else if(anim&&anim.line)bubble(anim.line);
 else{
  ctx.fillStyle=S.zero?"#ff9aa5":"#ffd59a";
  fitLabel(night?(spooky?R.HALLOWEEN.sleep[S.camp]:S.sleeping&&!isNight()?"Zzz… sieste en cours":"Zzz… il dort"):S.zero?`Jauge à zéro depuis ${S.zero} h : danger !`:S.form==="Excellente"?(S.streak>=6?`En pleine forme · série de ${S.streak} h`:"En pleine forme"):`Forme ${S.form.toLowerCase()}`,356);
 }
}

// ===================================================================== DEATH & REBIRTH SCENES
const SCENE_DUR={death:4.5,left:7.5,right:7.5,evolve:6.8};
function startScene(kind,side,name,extra={}){scene={...extra,kind,side,name,t0:performance.now()};}
function sceneBackdrop(left){
 ctx.fillStyle="#141b2a";ctx.fillRect(0,0,466,466);
 ctx.fillStyle=left?"#583345":"#2d4265";ctx.beginPath();ctx.arc(233,231,190,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#222b3b";ctx.fillRect(0,318,466,148);
}
function caption(title,sub){
 ctx.textAlign="center";ctx.fillStyle="#fff6ea";ctx.font="700 22px Fredoka, system-ui, sans-serif";ctx.fillText(title,233,96);
 ctx.fillStyle="#ffd59a";fitLabel(sub,392);
}
function newcomer(side,k,now){const p=people[side][0];bigSprite({...p,prop:personalItems[p.name][0].prop},"win",Math.min(1,k/0.6)*192,233,318,now);}
function drawDeath(e,now){
 sceneBackdrop(scene.side==="left");
 const p=allPeople.find(x=>x.name===scene.name)||people[scene.side][0];      // a resignation may switch camp
 bigSprite({...p,prop:"box"},"idle",192,233+Math.max(0,e-1)*130,318,now);
 caption("MORT POLITIQUE",`${scene.name} range son bureau. Le carton attend dans le couloir.`);
}
function drawPrimary(e,now){
 sceneBackdrop(true);
 const colors=["#ef7c91","#63a774","#e15f66","#a13c68","#f3be75"],bx=183+(e>2&&e<4.5?Math.sin(e*40)*4:0),by=210;
 if(e<5){
  ctx.fillStyle="#cfe3f5aa";ctx.fillRect(bx,by,100,86);ctx.strokeStyle="#f8efdf";ctx.lineWidth=3;ctx.strokeRect(bx,by,100,86);
  ctx.fillStyle="#202330";ctx.fillRect(bx+30,by-4,40,6);
  ctx.fillStyle="#f8efdf";ctx.font="700 14px Inter, sans-serif";ctx.textAlign="center";ctx.fillText("URNE",bx+50,by+52);
 }
 for(let i=0;i<5;i++){
  const t=(e-i*0.35)/0.8;if(t<0||t>1)continue;
  const x0=i%2?426:40,cx=x0+(233-x0)*t,cy=285-Math.sin(t*Math.PI)*170;
  ctx.fillStyle=colors[i];ctx.fillRect(cx-8,cy-8,16,16);ctx.fillStyle="#e9b38e";ctx.fillRect(cx-6,cy-20,12,12);
 }
 if(e>2&&e<4.5){
  ctx.fillStyle="#f2e7d6";
  for(let i=0;i<6;i++){const a=i*Math.PI/3+e*3;ctx.beginPath();ctx.arc(233+Math.cos(a)*55,195+Math.sin(a)*22,28,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle="#c23b4a";ctx.font="700 26px ui-monospace, monospace";ctx.textAlign="center";ctx.fillText(["#@!","%*?!","&!#@"][Math.floor(e*6)%3],233,203);
 }
 if(e>=4.5&&e<5.6){const k=(e-4.5)/1.1;for(let i=0;i<40;i++){const a=i*2.4,r=k*170;ctx.fillStyle=colors[i%5];ctx.fillRect(233+Math.cos(a)*r,253+Math.sin(a)*r*0.8+k*k*60,6,4);}}
 if(e>=5)newcomer("left",e-5,now);
 if(e<2)caption("PRIMAIRE UNITAIRE","Cinq candidats, une seule urne.");
 else if(e<4.5)caption("DÉBAT FRATERNEL","La gauche se rassemble… façon mêlée.");
 else caption("ACCORD HISTORIQUE !","Valable jusqu'à jeudi. Nouveau départ au niveau 1.");
}
function drawRename(e,now){
 sceneBackdrop(false);
 const names=["RPR","UMP","LR","FN","RN"],spin=["LRN","UMR","RLP","PRU","NRL","MRU"];
 const label=e<4?names[Math.min(4,Math.floor(e/0.8))]:e<5.2?spin[Math.floor(e*12)%spin.length]:"LES RENOMMÉS";
 if(e<6){
  ctx.fillStyle="#3a4660";ctx.fillRect(113,155,240,163);
  ctx.fillStyle="#f2e8cd";ctx.fillRect(133,175,200,56);ctx.strokeStyle="#c9a85a";ctx.lineWidth=4;ctx.strokeRect(133,175,200,56);
  ctx.fillStyle="#2d4265";ctx.font=`700 ${label.length>6?20:32}px Inter, sans-serif`;ctx.textAlign="center";ctx.fillText(label,233,215);
  ctx.fillStyle="#26304a";ctx.fillRect(208,258,50,60);
  if(e<4){const rx=133+(e%0.8)/0.8*200;ctx.fillStyle="#7fa8f8";ctx.fillRect(rx-4,165,10,76);ctx.fillStyle="#8b6a45";ctx.fillRect(rx,241,3,30);}
 }
 if(e>=6)newcomer("right",e-6,now);
 if(e<4)caption("LE PARTI CHANGE DE NOM","Un coup de rouleau, et tout est pardonné.");
 else if(e<5.2)caption("RECHERCHE D'UN NOM NEUF…","Consultation des militants en cours.");
 else caption("NOUVEAU NOM, MÊMES TÊTES !","Ex-RPR, ex-UMP, ex-LR, ex-FN. Nouveau départ au niveau 1.");
}
// Evolution: "Passation de pouvoir". The outgoing companion fidgets, both silhouettes alternate in a
// growing light, a single flash, and the newcomer arrives under tricolour confetti.
// The alternation never exceeds 3 swaps a second (WCAG 2.3.1), and becomes a cross-fade with reduced motion.
const sil=document.createElement("canvas");sil.width=sil.height=64;
function silhouette(p){
 sprite(scratch.getContext("2d"),p,0,"idle");
 const g=sil.getContext("2d");g.clearRect(0,0,64,64);g.globalCompositeOperation="source-over";g.drawImage(scratch,0,0);
 g.globalCompositeOperation="source-in";g.fillStyle="#fff6ea";g.fillRect(0,0,64,64);g.globalCompositeOperation="source-over";
 return sil;
}
function drawEvolve(e,now){
 sceneBackdrop(scene.side==="left");
 const glow=Math.min(1,e/3.6);
 ctx.save();ctx.translate(233,222);ctx.rotate(reduced?0:e*0.5);
 ctx.fillStyle=`rgba(255,240,205,${0.05+0.13*glow})`;
 for(let i=0;i<12;i++){ctx.rotate(Math.PI/6);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-20,-240);ctx.lineTo(20,-240);ctx.fill();}
 ctx.restore();
 const halo=ctx.createRadialGradient(233,222,10,233,222,160);
 halo.addColorStop(0,`rgba(255,246,220,${0.2+0.5*glow})`);halo.addColorStop(1,"rgba(255,246,220,0)");
 ctx.fillStyle=halo;ctx.fillRect(0,0,466,466);
 ctx.imageSmoothingEnabled=false;
 if(e<0.9)bigSprite(scene.from,"stress",192,233,318,now);
 else if(e<3.6){
  const k=(e-0.9)/2.7,size=192*(1+(reduced?0:0.04*Math.sin(e*18)));
  if(reduced){ctx.globalAlpha=1-k;ctx.drawImage(silhouette(scene.from),233-size/2,318-size,size,size);ctx.globalAlpha=k;ctx.drawImage(silhouette(scene.to),233-size/2,318-size,size,size);ctx.globalAlpha=1;}
  else{const period=0.6-0.26*k,showNew=Math.floor((e-0.9)/period)%2===1;ctx.drawImage(silhouette(showNew?scene.to:scene.from),233-size/2,318-size,size,size);}
 }else{
  bigSprite(scene.to,"win",192,233,318,now,scene.lvl===100);
  const k=e-3.6;
  for(let i=0;i<40;i++){const x=(i*53)%420+23,y=(k*170+i*41)%330+40;ctx.fillStyle=["#3b6fd8","#f4f1ea","#e1475a"][i%3];ctx.fillRect(x+Math.sin(k*3+i)*6,y,6,9);}
 }
 if(e<3.6)caption(scene.legend?"COURONNEMENT":"PASSATION DE POUVOIR",scene.legend?`${scene.toName} sent que l'Histoire l'appelle…`:`${scene.fromName} sent que son heure est venue…`);
 else caption(scene.legend?"LÉGENDE DE LA COLLECTION !":"NOUVELLE FORME !",scene.legend?`${scene.toName} entre dans l'Histoire… ou dans les manuels.`:`${scene.toName} prend le relais au niveau ${scene.lvl}.`);
 if(!reduced&&e>=3.6&&e<4.3){ctx.fillStyle=`rgba(255,255,255,${1-(e-3.6)/0.7})`;ctx.beginPath();ctx.arc(233,233,233,0,Math.PI*2);ctx.fill();}
}
function drawScene(now){
 if((now-scene.t0)/1000>SCENE_DUR[scene.kind]){
  if(scene.kind!=="death"){scene=null;return false;}
  startScene(scene.side,scene.side,scene.name);        // a death always ends on its camp's rebirth
 }
 // A frame timestamp can predate performance.now() at the scene start: never draw a negative time.
 const e=Math.max(0,(now-scene.t0)/1000);
 if(scene.kind==="death")drawDeath(e,now);else if(scene.kind==="evolve")drawEvolve(e,now);
 else if(scene.kind==="left")drawPrimary(e,now);else drawRename(e,now);
 return true;
}

// ===================================================================== MINI-GAME: PONG OF ARGUMENTS
const PONG={ms:20000,misses:3,speed:190,accel:1.06,maxSpeed:480,bubbleW:50,top:150,hitY:292,lost:390,wallL:80,wallR:386,dodge:0.75,dodgeGap:70,step:40};
// Every random draw of a Pong (aims and lines) comes from the server's seed (pong.rand).
function pongText(mine){return R.pongLine(mine?S.camp:S.camp==="left"?"right":"left",season(),pong.rand);}
// The opponent aims each pique at a random spot, three times out of four away from the candidate: standing still
// in the middle no longer returns anything (tuned by simulation: a still candidate makes ~2 returns, not ~6).
function pongShoot(){
 const lo=PONG.wallL+PONG.bubbleW,hi=PONG.wallR-PONG.bubbleW,pick=()=>lo+pong.rand()*(hi-lo);
 let x=pick();if(pong.rand()<PONG.dodge)for(let k=0;k<20&&Math.abs(x-pong.px)<PONG.dodgeGap;k++)x=pick();
 pong.vx=(x-pong.bx)*pong.vy/(PONG.hitY+12-pong.by);
}
function pongServe(){Object.assign(pong,{bx:233,by:PONG.top+10,vy:PONG.speed,text:pongText(false),mine:false});pongShoot();}
// The server charges the activity at the start and checks the score at the end (rate and duration).
async function startPong(){
 closeSheet();
 if(miniEnding){toast("Un instant : le résultat de la partie précédente part au serveur.",true);return;}
 const r=await send({type:"pongStart"});if(!r?.ok||!S)return;
 pong={t0:performance.now(),last:performance.now(),score:0,missed:0,px:233,hitT:0,flashT:0,endT:0,id:r.game?.id,
  rand:Number.isFinite(r.game?.seed)?R.seeded(r.game.seed):Math.random};pongServe();
 toast("Renvoie les piques : glisse le doigt ou la souris sur l'écran.",true);
}
async function endPong(){
 const score=pong.score,id=pong.id;pong=null;pongEnded=performance.now();pongEnding=true;
 let r;
 try{
  // The score must not be lost behind another request (which itself gives up after 15 s).
  for(const end=Date.now()+20000;busy&&Date.now()<end;)await new Promise(ok=>setTimeout(ok,100));
  r=await send({type:"pongEnd",score,id});
 }finally{pongEnding=false;}
 if(r?.ok){toast(`${score} renvoi${score>1?"s":""} · +${r.bonus} XP d'éloquence`);if(r.bonus>=10)playAnim("win",3000);}
}
function stepPong(now){
 const dt=Math.min(0.05,(now-pong.last)/1000);pong.last=now;
 if(pong.endT){if(now-pong.endT>2500)endPong();return;}
 if(now-pong.t0>PONG.ms||pong.missed>=PONG.misses){pong.endT=now;return;}
 pong.bx+=pong.vx*dt;pong.by+=pong.vy*dt;
 if(pong.bx-PONG.bubbleW<PONG.wallL){pong.bx=PONG.wallL+PONG.bubbleW;pong.vx=Math.abs(pong.vx);}
 if(pong.bx+PONG.bubbleW>PONG.wallR){pong.bx=PONG.wallR-PONG.bubbleW;pong.vx=-Math.abs(pong.vx);}
 if(pong.vy<0&&pong.by<=PONG.top){pong.by=PONG.top;pong.vy=Math.abs(pong.vy);pong.text=pongText(false);pong.mine=false;pongShoot();}
 if(pong.vy>0&&pong.by>=PONG.hitY&&pong.by<=PONG.hitY+24&&Math.abs(pong.bx-pong.px)<62){
  pong.vy=-Math.min(PONG.maxSpeed,Math.abs(pong.vy)*PONG.accel);pong.vx=pong.vx*0.6+(pong.bx-pong.px)*4;
  pong.text=pongText(true);pong.mine=true;pong.score++;pong.hitT=now;
 }
 if(pong.by>PONG.lost){pong.missed++;pong.flashT=now;pongServe();}
}
function drawPong(now){
 const left=S.camp==="left",spooky=hw();
 sceneBackdrop(left);
 ctx.textAlign="center";ctx.fillStyle="#fff6ea";ctx.font="700 18px Fredoka, system-ui, sans-serif";ctx.fillText(spooky?"PONG DES REVENANTS":"PONG DES ARGUMENTS",233,72);
 ctx.fillStyle=left?"#7fa8f8":"#ef7c91";ctx.fillRect(198,104,70,26);ctx.fillStyle="#202330";ctx.fillRect(228,96,10,8);
 ctx.fillStyle="#202330";ctx.font="700 10px ui-monospace, monospace";ctx.fillText("ADVERSAIRE",233,121);
 bigSprite(look(),now-pong.hitT<400?"debate":"idle",96,pong.px,358,now);
 if(!pong.endT){
  // While Halloween lasts: an orange border and a tiny pumpkin before the words.
  ctx.font="700 13px Inter, system-ui, sans-serif";const pad=spooky?16:0,w=Math.max(70,ctx.measureText(pong.text).width+18+pad);
  ctx.fillStyle=pong.mine?"#fff3cf":"#f8efdf";ctx.beginPath();ctx.roundRect(pong.bx-w/2,pong.by-14,w,28,12);ctx.fill();
  ctx.strokeStyle=spooky?"#ff9f43":pong.mine?"#ffd59a":(left?"#7fa8f8":"#ef7c91");ctx.lineWidth=3;ctx.stroke();
  if(spooky)pumpkin(pong.bx-w/2+13,pong.by+1,6,-1);
  ctx.fillStyle="#2a2230";ctx.fillText(pong.text,pong.bx+pad/2,pong.by+5);
 }
 if(pong.flashT&&now-pong.flashT<1200){ctx.fillStyle="#ff9aa5";ctx.font="700 16px Inter, sans-serif";ctx.fillText("Petite phrase reprise par la presse !",233,222);}
 ctx.fillStyle="#ffd59a";
 if(pong.endT){
  ctx.fillStyle="#fff6ea";ctx.font="700 26px Fredoka, sans-serif";ctx.fillText("FIN DU DÉBAT",233,222);
  ctx.fillStyle="#ffd59a";fitLabel(`${pong.score} renvoi${pong.score>1?"s":""} : +${Math.min(R.PONG_RULES.bonusCap,pong.score*R.PONG_RULES.bonusPerReturn)} XP d'éloquence`,400);
 }else fitLabel(`Renvois ${pong.score} · ratés ${pong.missed}/${PONG.misses} · ${Math.max(0,Math.ceil((PONG.ms-(now-pong.t0))/1000))} s`,400);
}
function pongAim(e){if(!pong)return;const r=cv.getBoundingClientRect();pong.px=Math.max(PONG.wallL+30,Math.min(PONG.wallR-30,(e.clientX-r.left)/r.width*466));}
cv.addEventListener("pointermove",pongAim);
// The mini-games follow the finger (or the mouse); a second finger opens the umbrella in the Cortège.
function miniPoint(e){const r=cv.getBoundingClientRect();return[(e.clientX-r.left)/r.width*466,(e.clientY-r.top)/r.height*466];}
cv.addEventListener("pointermove",e=>{if(mini&&!scene&&e.isPrimary&&(e.pointerType==="mouse"||e.buttons))mini.pointer(...miniPoint(e),miniClock,false);});
cv.addEventListener("pointerdown",e=>{
 if(!mini||scene)return;
 miniHeld=true;
 if(!e.isPrimary&&mini.key==="cortege")mini.second(miniClock);else mini.pointer(...miniPoint(e),miniClock,true);
});
document.addEventListener("keyup",e=>mini?.keyup(e.key));
// Keys released elsewhere must not stay pressed; a hidden page (locked phone) ends the game rather than losing it
// to the server's expiry, which keeps counting real time.
addEventListener("blur",()=>mini?.release());
document.addEventListener("visibilitychange",()=>{
 if(document.hidden&&mini){mini.release();mini.abort(miniClock);endMini();}
 if(document.hidden&&pong)endPong();
});
// A finger held on the screen through the end of a game lifts as a click: not a pat on the shoulder.
let miniHeld=false;
// A tap skips a scene (a death goes on to its rebirth), steers the Pong, or pets the companion.
function skipScene(){
 if(!scene||performance.now()-scene.t0<600)return;
 if(scene.kind==="death")startScene(scene.side,scene.side,scene.name);else scene=null;
}
// A pet is a click, not a pointerdown: a swipe that scrolls the page past the screen is not a pat on the shoulder.
cv.addEventListener("pointerdown",e=>{if(pong&&!scene)pongAim(e);});
// A finger still on the screen when the Pong ends lifts as a click: that is not a pat on the shoulder.
let pongEnded=0;
cv.addEventListener("click",()=>{const held=miniHeld;miniHeld=false;if(scene)skipScene();else if(!pong&&!mini&&!held&&performance.now()-pongEnded>500)pet();});
cv.addEventListener("keydown",e=>{if(!pong&&!mini&&(e.key==="Enter"||e.key===" ")){e.preventDefault();if(scene)skipScene();else pet();}});
document.addEventListener("keydown",e=>{
 if(!$("#sheet").hidden){
  if(e.key==="Escape"){closeSheet();return;}
  if(e.key==="Tab"){                                   // keep keyboard focus inside the open sheet
   // Only what is on screen: a hidden file input or a closed menu cannot take the focus.
   const f=[...$(".sheet-card").querySelectorAll("button:not(:disabled),select,input:not(:disabled),textarea:not(:disabled),[tabindex='0']")].filter(el=>el.getClientRects().length);
   if(!f.length)return;
   const card=$(".sheet-card"),a=document.activeElement,i=f.indexOf(a),inside=i>=0||(a!==card&&card.contains(a));
   if(e.shiftKey&&(i===0||!inside)){e.preventDefault();f[f.length-1].focus();}
   else if(!e.shiftKey&&(i===f.length-1||!inside)){e.preventDefault();f[0].focus();}
  }
  return;
 }
 if(mini){
  if(e.ctrlKey||e.metaKey||e.altKey)return;            // browser shortcuts stay the browser's
  if(!scene&&mini.keydown(e.key,miniClock))e.preventDefault();
  return;
 }
 if(!pong)return;
 if(e.key==="ArrowLeft"||e.key==="ArrowRight"){pong.px=Math.max(PONG.wallL+30,Math.min(PONG.wallR-30,pong.px+(e.key==="ArrowLeft"?-PONG.step:PONG.step)));e.preventDefault();}
 if(e.key==="Escape"&&!pong.endT)pong.endT=performance.now();
});

// ===================================================================== HTML INTERFACE
let toastTimer=0;
let toastAt=0;
// During a game a toast waits in a short queue (newest kept, no repeats); now: the player's own doing, said at once.
const toastQ=[];
function toast(text,now=false){
 if(!now&&quiet()){const i=toastQ.indexOf(text);if(i>=0)toastQ.splice(i,1);toastQ.push(text);if(toastQ.length>4)toastQ.shift();return;}
 toastAt=Date.now();const el=$("#toast");el.textContent=text;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3800);}
// The organiser's announcements (admin.mjs announce): one banner at a time, kept until closed, never during a game or a scene.
const announceQ=[];
function showAnnounce(){
 if(!announceQ.length||quiet()||scene||!$("#announce").hidden)return;
 $("#announce").hidden=false;$("#announce-text").textContent=announceQ.shift();   // shown first: screen readers hear the text land
}
$("#announce-close").addEventListener("click",()=>{$("#announce").hidden=true;showAnnounce();});
const pad2=n=>String(n).padStart(2,"0");
function clockLabel(){const v=vnow(),c=R.clockOf(v);return `Jour ${R.mandateDay(S,v)} · ${pad2(c.hour)}:${pad2(c.minute)}`;}
const when=t=>new Date(t).toLocaleString("fr-FR",{timeZone:R.timeZone(),weekday:"short",hour:"2-digit",minute:"2-digit"});
const gaugeEls={};
for(const g of GAUGES){
 const el=document.createElement("div"),head=document.createElement("span"),b=document.createElement("b"),em=document.createElement("em"),bar=document.createElement("div"),fill=document.createElement("i");
 el.className="gauge";bar.className="bar";b.textContent=fxNames[g.k][0].toUpperCase()+fxNames[g.k].slice(1);
 fill.style.background=g.c;                         // CSSOM, not a style attribute: allowed by the strict CSP
 head.append(b,em);bar.append(fill);el.append(head,bar);$("#gauges").append(el);gaugeEls[g.k]={el,em,fill};
}
function pill(t,c=""){const s=document.createElement("span");s.className=`pill ${c}`;s.textContent=t;return s;}
function refresh(){
 if(!S)return;
 document.body.dataset.camp=S.camp;chat.syncCamp();
 const sz=season();if(document.body.dataset.season!==sz)document.body.dataset.season=sz;
 const p=person();
 $("#chip-fm").textContent=`${S.fm} FM`;$("#chip-clock").textContent=clockLabel();
 $("#pname").textContent=p.name;$("#plvl").textContent=`Niveau ${S.lvl}/100`;$("#pdetail").textContent=p.detail;
 const into=S.xp-xpFloor(S.lvl);
 $("#xpbar").style.width=`${S.lvl>=100?100:Math.min(100,100*into/xpCost(S.lvl))}%`;
 const nextForm=S.lvl<90?` · forme suivante au niveau ${(stage(S.lvl)+1)*10}`:"";
 $("#xptext").textContent=S.lvl<100?`${Math.floor(into)} / ${Math.round(xpCost(S.lvl))} XP${nextForm}`:"Légende de la collection";
 for(const g of GAUGES){const ge=gaugeEls[g.k],v=Math.round(S[g.k]);ge.el.classList.toggle("low",v<25);ge.em.textContent=v;ge.fill.style.width=`${v}%`;}
 const pills=[pill(`Forme ${S.form.toLowerCase()} ×${String(S.mult).replace(".",",")}`,S.form==="Excellente"?"good":S.form==="Correcte"?"":"warn")];
 if(S.streak)pills.push(pill(`Série ${S.streak} h (+${Math.round(100*Math.min(XP.streakCap,XP.streakStep*S.streak))} %)`,"good"));
 pills.push(pill(`Visites ${R.visitsToday(S)}/${XP.visitsPerDay}`),pill(`Activités ${R.actsToday(S)}/${XP.actsPerDay}`));
 if(S.sleeping&&!isNight())pills.push(pill("Sieste en cours · XP ×0,5"));
 if(S.zero)pills.push(pill(`Mort politique dans ${XP.deathHours-S.zero} h`,"warn"));
 if(S.deaths)pills.push(pill(`${S.deaths} mort${S.deaths>1?"s":""} politique${S.deaths>1?"s":""}`));
 pills.push(pill(`Score ${R.score(S)} pts`,"good"));
 $("#meta").replaceChildren(...pills);
 if(journalRendered!==S.jn){
  journalRendered=S.jn;
  $("#journal").replaceChildren(...S.journal.filter(j=>j.k!=="level").map(j=>{const li=document.createElement("li"),tm=document.createElement("time");
   tm.textContent=when(j.t);li.append(tm,j.text);return li;}));
 }
 // A red dot on "Jouer" while the quitte-ou-double is on offer, a count while challenges wait: a toast alone is
 // easily missed.
 const rm=!rematchBlock(),dn=incoming().length,playBtn=$(".pad-btn[data-sheet=play]"),sig=`${rm}|${dn}`;
 if(playBtn.dataset.sig!==sig){
  playBtn.dataset.sig=sig;playBtn.classList.toggle("alert",rm||dn>0);playBtn.classList.toggle("clash",dn>0);   // a challenge waits: the icon wiggles
  if(dn)playBtn.dataset.count=String(Math.min(dn,9));else delete playBtn.dataset.count;
  const why=[dn&&`${dn} défi${dn>1?"s":""} en attente`,rm&&"quitte ou double disponible"].filter(Boolean).join(", ");
  if(why)playBtn.setAttribute("aria-label",`Jouer (${why})`);else playBtn.removeAttribute("aria-label");
 }
 const label=`${p.name}, niveau ${S.lvl}. Satiété ${Math.round(S.sat)}, moral ${Math.round(S.moral)}, énergie ${Math.round(S.energy)}, hygiène ${Math.round(S.hyg)}. Entrée pour lui taper sur l'épaule.`;
 if(cv.getAttribute("aria-label")!==label)cv.setAttribute("aria-label",label);
}

// ---------- leaderboard and feed ----------
const TABS={
 score:{label:"Score",sort:(a,b)=>b.score-a.score,show:r=>`${r.score} pts`},
 lvl:{label:"Niveau",sort:(a,b)=>b.lvl-a.lvl||b.score-a.score,show:r=>`niv. ${r.lvl}`},
 streak:{label:"Série record",sort:(a,b)=>b.bestStreak-a.bestStreak||b.score-a.score,show:r=>`${r.bestStreak} h`},
 deaths:{label:"Survie",sort:(a,b)=>a.deaths-b.deaths||b.score-a.score,show:r=>`${r.deaths} mort${r.deaths>1?"s":""}`}
};
const ordinal=n=>n===1?"1er":`${n}e`;
// Presence after a name: green and glowing online, orange offline, nothing from a server that does not say.
function presenceDot(on){
 if(typeof on!=="boolean")return null;
 const d=document.createElement("span");d.className=`presence ${on?"on":"off"}`;
 d.setAttribute("role","img");d.setAttribute("aria-label",on?"en ligne":"hors ligne");return d;
}
// A name followed by its dot: a long name is cut with "…", the dot always stays in sight.
function nameWithDot(el,text,on){
 const nm=document.createElement("span"),dot=presenceDot(on);nm.className="nm";nm.textContent=text;
 el.classList.add("nameline");el.replaceChildren(nm);if(dot)el.append(dot);
 if(text.length>12)el.title=text;                   // the whole name on hover
 return el;
}
function renderBoard(){
 const tabs=$("#board-tabs");
 if(!tabs.childElementCount)for(const [k,t] of Object.entries(TABS)){
  const b=document.createElement("button");b.type="button";b.dataset.tab=k;b.textContent=t.label;
  b.addEventListener("click",()=>{boardTab=k;renderBoard();});tabs.append(b);
 }
 for(const b of tabs.children)b.setAttribute("aria-pressed",String(b.dataset.tab===boardTab));
 const rows=[...board].sort(TABS[boardTab].sort);
 $("#board").replaceChildren(...rows.map((r,i)=>{
  const li=document.createElement("li");li.className=`row ${r.camp}${r.name===me?" me":""}`;
  const rank=document.createElement("span");rank.className="rank";rank.textContent=ordinal(i+1);
  const who=document.createElement("span");who.className="who";
  const n=nameWithDot(document.createElement("b"),r.name+(r.name===me?" (toi)":""),r.online);
  const c=document.createElement("small");c.textContent=`${r.candidate} · niv. ${r.lvl}${r.asleep?" · zzz":""}${r.form==="Négligée"||r.form==="Abandonnée"?" · en danger":""}`;
  who.append(n,c);
  const v=document.createElement("span");v.className="val";v.textContent=TABS[boardTab].show(r);
  li.append(rank,who,v);return li;
 }));
 const mine=[...board].sort(TABS.score.sort).findIndex(r=>r.name===me);
 $("#chip-rank").textContent=mine>=0?`Classement ${ordinal(mine+1)}/${board.length}`:"Classement";
 $("#board-empty").hidden=board.length>1;
}
function renderFeed(){
 $("#feed").replaceChildren(...feed.slice(0,40).map(f=>{
  const li=document.createElement("li"),tm=document.createElement("time"),b=document.createElement("b");
  tm.textContent=when(f.t);b.textContent=f.player;li.className=f.kind;li.append(tm,b," · ",f.text);return li;
 }));
}

// ---------- live connection ----------
let es=null;
let lastLive=0;
function setNet(up){$("#net").hidden=up;}
function connectLive(){
 es?.close();es=new EventSource("/events");lastLive=Date.now();
 // Every message, pings included, proves the stream alive; a malformed one is skipped, not fatal.
 const on=(ev,fn)=>es.addEventListener(ev,e=>{lastLive=Date.now();setNet(true);let v;try{v=JSON.parse(e.data);}catch{return;}fn(v);});
 on("me",m=>applyMe(m));
 on("board",v=>{if(Array.isArray(v)){board=v;renderBoard();}});
 on("feedInit",v=>{if(Array.isArray(v)){feed=v;renderFeed();}});
 on("feed",v=>{if(!Array.isArray(v))return;for(const f of v)feed.unshift(f);feed.length=Math.min(feed.length,60);renderFeed();});
 on("duel",v=>{if(v&&typeof v==="object")duelEvent(v);});
 on("announce",v=>{if(typeof v?.text!=="string"||!v.text.trim())return;announceQ.push(v.text.slice(0,240));if(announceQ.length>3)announceQ.shift();showAnnounce();});
 // The chat: the badge on "Chat" only, never a toast, a sound or a notification (chat.mjs).
 on("chat",v=>chat.onChat(v));
 on("chatDel",v=>chat.onDel(v));
 on("chatUnread",v=>chat.onUnread(v));
 on("ping",()=>{});
 // Pushed out by a newer tab or device of the same player: this one stays quiet until it is looked at again.
 on("bye",()=>{es?.close();es=null;});
 // Each (re)connection reloads the duels too: the badge on "Jouer" must not miss a challenge sent meanwhile.
 es.onopen=()=>{lastLive=Date.now();setNet(true);duelsLoad();chat.resync();};
 // A closed stream is either an expired session (the check below shows the login) or a server restart.
 es.onerror=()=>{if(!es)return;setNet(false);if(es.readyState===EventSource.CLOSED){es=null;retryLive();}};
}
// A stream gone silent (half-open connection after a network change) is restarted: the server pings every 25 s.
setInterval(()=>{if(S&&es&&Date.now()-lastLive>70000){es.close();es=null;setNet(false);retryLive(1000);}},10000);
// Retries with a growing pause (5 s up to 1 min) until the server answers again; a 401 shows the login instead.
function retryLive(delay=5000){
 setTimeout(async()=>{
  if(!S||es||document.hidden)return;         // a hidden page reconnects when it is shown again
  const r=await api("GET","/api/me");
  if(!S||es||document.hidden)return;
  if(r.ok){applyMe(r);connectLive();}else if(r.status!==401)retryLive(Math.min(delay*2,60000));
 },delay);
}
// A page hidden for 2 minutes lets go of the live stream: its player shows offline to the others.
let hideTimer=0;
document.addEventListener("visibilitychange",async()=>{
 clearTimeout(hideTimer);
 if(document.hidden){hideTimer=setTimeout(()=>{if(document.hidden&&es){es.close();es=null;}},120000);return;}
 if(!S)return;
 const r=await api("GET","/api/me");if(!S)return;     // logged out meanwhile
 if(r.ok)applyMe(r);
 if(!es)connectLive();
});
$("#chip-rank").addEventListener("click",()=>$("#board-card").scrollIntoView({behavior:reduced?"auto":"smooth",block:"start"}));

// ---------- bottom sheets ----------
let sheetKind=null,sheetOpener=null;
// An unavailable row is aria-disabled rather than disabled: it stays focusable, so its reason can be read.
function itemButton(title,sub,side,disabled,onClick,on=false){
 const b=document.createElement("button");b.type="button";b.className=`item${on?" on":""}`;if(disabled)b.setAttribute("aria-disabled","true");
 const main=document.createElement("span"),bt=document.createElement("b"),sm=document.createElement("small");
 bt.textContent=title;sm.textContent=sub;main.append(bt,sm);
 const pr=document.createElement("span");pr.className="price";pr.textContent=side;
 b.append(main,pr);b.addEventListener("click",()=>{if(!disabled)onClick();});return b;
}
function blockTitle(t){const h=document.createElement("h3");h.className="block-title";h.textContent=t;return h;}
function list(...els){const d=document.createElement("div");d.className="items";d.append(...els);return d;}
function shopList(kind){
 return list(...shop.filter(it=>it.kind===kind).map(it=>{
  const err=itemBlock(it);
  return itemButton(R.itemName(it,S.camp,season()),err||fxText(it.fx)+(it.note?` · ${it.note}`:""),it.price?`${it.price} FM`:"gratuit",!!err,()=>buy(it));
 }));
}
const fxText=R.fxText;
// Two taps instead of confirm(): native dialogs are blocked by some in-app browsers.
function armedButton(label,armedLabel,cls,onConfirm){
 const b=document.createElement("button");b.type="button";b.className=`btn ${cls}`;b.textContent=label;let armed=0;
 b.setAttribute("aria-live","polite");        // the new label ("tap again") is read out
 b.addEventListener("click",()=>{
  if(!armed){armed=setTimeout(()=>{armed=0;b.classList.remove("armed");b.textContent=label;},8000);b.classList.add("armed");b.textContent=armedLabel;return;}
  clearTimeout(armed);armed=0;b.classList.remove("armed");b.textContent=label;onConfirm();   // disarmed first: the sheet may redraw again
 });
 return b;
}
// What a sheet's content depends on: when this changes while it is open, the sheet is redrawn in place.
const sheetSig=()=>[S.fm,curIdx(),R.actsToday(S),R.actsThisVisit(S),S.energy<20,S.coffees,S.breadIdx,S.lvl,S.best,S.equipped[person().name]||0,isAsleep(),S.camp,!rematchBlock(),season(),S.treatDay].join("|");
let shownSig="";
function setBackgroundInert(on){for(const el of document.querySelectorAll(".topbar,.app,footer"))el.inert=on;}
// An open sheet takes a history entry, so the phone's Back button closes it instead of leaving the game.
// history.back() is asynchronous: the popstate it causes is ours, and must not close a sheet reopened meanwhile.
let sheetInHistory=false,pendingBack=false;
addEventListener("popstate",()=>{
 if(pendingBack){pendingBack=false;return;}
 if(sheetInHistory){sheetInHistory=false;closeSheet(true);}
});
function openSheet(kind,opener){
 renderSheet(kind,opener);
 if(!sheetInHistory&&!pendingBack){try{history.pushState({sheet:true},"");sheetInHistory=true;}catch{}}
 $("#sheet").hidden=false;setBackgroundInert(true);
 $(".sheet-card").scrollTop=0;$(".sheet-card").focus();
}
// Redraws the open sheet without losing the scroll position or the focused row.
// force: what changed is not in the state (the duels list, the push subscription).
function liveSheet(force=false){
 if(!S||!sheetKind||$("#sheet").hidden||(!force&&sheetSig()===shownSig))return;
 if(sheetKind==="test")return;                       // a test under way owes nothing to the state: never redrawn under the finger
 if(sheetKind==="chat")return;                       // built once and updated in place (chat.mjs): the composer keeps focus and text
 // Never under the player's fingers: an armed "tap again" button or a half-typed password survives updates.
 if($("#sheet-body .armed, #sheet-body form"))return;
 const card=$(".sheet-card"),top=card.scrollTop,f=[...card.querySelectorAll("button,select,input")],i=f.indexOf(document.activeElement);
 renderSheet(sheetKind);card.scrollTop=top;
 if(i>=0){const g=[...card.querySelectorAll("button,select,input")];(g[i]&&!g[i].disabled?g[i]:card).focus();}
}
function renderSheet(kind,opener){
 sheetKind=kind;if(opener)sheetOpener=opener;shownSig=sheetSig();
 const body=$("#sheet-body"),p=person();body.replaceChildren();
 const set=(t,s)=>{$("#sheet-title").textContent=t;$("#sheet-sub").textContent=s;};
 if(sheetKind!=="chat")chat.hide();
 $("#sheet").classList.toggle("chat",kind==="chat");
 if(kind==="chat")chat.mount(body,set);
 if(kind==="food"){
  set("La Buvette",`${S.fm} FM (frais de mandat) en caisse · 2 FM gagnés par heure de vie`);
  // Halloween's daily gift, the only thing the event changes in the game (rules.mjs treatBlock).
  if(hw()){const e=R.treatBlock(S,season());body.append(list(itemButton("Des bonbons ou un amendement ?",e||`Cadeau d'Halloween : moral +${R.HALLOWEEN.treat.moral}, une fois par jour.`,"gratuit",!!e,()=>{closeSheet();send({type:"treat"});})));}
  body.append(shopList("food"));
 }
 if(kind==="care"){
  set("Soins",`Hygiène, repos et moral · ${S.fm} FM en caisse`);
  const light=isNight()
   ?itemButton("Lumière éteinte","C'est la nuit : il dort jusqu'à 6 h et récupère de l'énergie.","nuit",true,()=>{})
   :S.sleeping
    ?itemButton("Rallumer la lumière",S.energy<60?"Le réveiller maintenant (encore fatigué : il grognera, moral −3).":"Fin de la sieste : il est assez reposé.","gratuit",false,toggleLight)
    :itemButton("Éteindre la lumière (sieste)","Énergie +15/h et besoins ralentis. XP réduite de moitié ; il se réveille seul une fois reposé.","gratuit",false,toggleLight);
  body.append(list(light),shopList("care"));
 }
 if(kind==="play"){
  const err=activityBlock(),dn=incoming().length;
  set("Jouer",`Activités : ${R.actsToday(S)}/${XP.actsPerDay} aujourd'hui · ${XP.actsPerVisit} par visite`);
  // The rematch only shows while it is on offer: right after a debate, for one hour of game time.
  const rm=rematchBlock()?[]:[itemButton("Quitte ou double !",`Revanche immédiate, 1 chance sur 2 : moral +${R.DOUBLE.moral} et énergie +${R.DOUBLE.energy}… ou un stress ×${R.DOUBLE.stressFactor} (moral −${R.STRESS_HIT*R.DOUBLE.stressFactor}).`,"50/50",false,rematch)];
  body.append(list(...rm,
   itemButton("Pong des arguments",err||`Renvoie les piques de l'adversaire pendant 20 s (doigt, souris ou flèches). +${R.PONG_RULES.bonusPerReturn} XP par renvoi (${R.PONG_RULES.bonusCap} au plus).`,`+${XP.activity} XP`,!!err,startPong),
   itemButton("Débattre",err||`Débat chrono : ${R.MINI.debate.ms/1000} s pour enchaîner les réponses de ta ligne (doigt, souris ou 1-2-3). Énergie −8, moral +10, +${R.MINI.debate.bonusRate} XP par bonne réponse (${R.MINI.debate.bonusCap} max).`,`+${XP.activity} XP`,!!err,()=>startMini("debate")),
   itemButton(`Manif : ${manifLabel(S.camp)}`,err||(S.camp==="left"
    ?"Tiens le cortège jusqu'à Nation en 30 s : esquive LBD et lacrymo, ramasse les tracts. Doigt, souris ou flèches ; parapluie avec un deuxième doigt ou Espace."
    :"Joue l'épervier 35 s avec un CRS : interpelle les manifestants, esquive pavés et molotovs. Gare aux journalistes et aux collègues infiltrés."),`+${XP.activity} XP`,!!err,()=>startMini("manifStart")),
   // Always open: even when he cannot duel now, the sheet shows the challenges, the results and why.
   itemButton("Duels",`Défie un rival au Débat chrono : mêmes questions, meilleur score. ${R.DUEL.perDay} défis par jour.`,dn?`${dn} défi${dn>1?"s":""}`:"PvP",false,openDuels)
  ));
 }
 if(kind==="duels")renderDuels(body,set);
 if(kind==="test"){
  set("Test politique","Cinq questions pour les indécis. Sans effet sur la partie : le dernier mot reste le tien.");
  const box=document.createElement("div");box.className="quiz";box.id="sheet-quiz";body.append(box);
  mountQuiz(box,sheetQuiz,(camp,sugg)=>armRestart(camp,sugg?`Verdict du test : la ${campWord(camp)}.`:`Va pour la ${campWord(camp)}, malgré le test.`),
   ()=>{renderSheet("more");$("#sheet-body .restart-test").focus();});
 }
 if(kind==="news"){
  const one=newsList.length===1;
  set(one?`Quoi de neuf dans PolitiGo ${newsList[0].version}`:"Quoi de neuf dans PolitiGo",one?`Mise à jour du ${newsDate(newsList[0].date)}`:`${newsList.length} mises à jour depuis ta dernière visite`);
  for(const e of newsList){
   if(!one)body.append(blockTitle(`Version ${e.version} · ${newsDate(e.date)}`));
   for(const [title,items] of [["Nouveautés",e.added],["Changements",e.changed],["Corrections",e.fixed],["Administration",e.admin]]){
    if(!items?.length)continue;
    const h=document.createElement("p");h.className="news-head";h.textContent=title;
    const ul=document.createElement("ul");ul.className="news";
    for(const t of items){const li=document.createElement("li");li.textContent=t;ul.append(li);}
    body.append(h,ul);
   }
  }
  const row=document.createElement("div");row.className="btn-row";
  const ok=Object.assign(document.createElement("button"),{type:"button",className:"btn",textContent:"C'est noté"});ok.addEventListener("click",()=>closeSheet());
  row.append(ok);body.append(row);
 }
 if(kind==="more"){
  set(p.name,`Niveau ${S.lvl}/100 · ${p.detail}`);
  body.append(blockTitle("Objets personnels"),list(...personalItems[p.name].map((it,i)=>{
   const on=(S.equipped[p.name]||0)===i;return itemButton(it.name,on?"Dans sa main":"Toucher pour équiper",on?"équipé":"",false,()=>equip(i),on);
  })));
  body.append(blockTitle("Ses casseroles (sources de stress)"));
  const risk=document.createElement("p");risk.className="fine";
  risk.textContent=`Risque de stress : ${Math.round(R.stressChance(S)*100)} % par heure d'éveil. Plus il a le moral, moins il craque.`;body.append(risk);
  for(const s of stresses[p.name]){
   const d=document.createElement("div");d.className="dossier";
   const b=document.createElement("b"),q=document.createElement("q"),sm=document.createElement("small");
   b.textContent=s.trigger;q.textContent=s.line;sm.textContent=`Clin d'œil à : ${s.ref}`;d.append(b,q,sm);body.append(d);
  }
  body.append(blockTitle("Collection"));
  const forms=document.createElement("div");forms.className="forms";
  people[S.camp].forEach((f,i)=>{
   const start=i===0?1:i*10,got=S.best>=start,tile=document.createElement("div");tile.className=`form-tile${got?"":" locked"}`;
   const c=document.createElement("canvas");c.width=c.height=64;
   if(got)sprite(c.getContext("2d"),{...f,prop:personalItems[f.name][0].prop},0,"idle");
   else{const g=c.getContext("2d");g.fillStyle="#ffffff30";g.beginPath();g.arc(32,24,11,0,Math.PI*2);g.fill();g.fillRect(21,37,22,20);}
   tile.append(c,got?f.name:`Niveau ${start}`);forms.append(tile);
  });
  body.append(forms);
  body.append(blockTitle("Recommencer"));
  const warn=document.createElement("p");warn.className="fine";
  warn.textContent="Démissionner relance une partie au niveau 1. C'est compté comme une mort politique au classement (−150 points).";
  const row=document.createElement("div");row.className="btn-row";
  for(const camp of R.CAMPS){const b=armedButton(`Repartir à ${campWord(camp)}`,"Confirmer : démissionner (−150 pts)","danger",()=>{closeSheet();send({type:"restart",camp});});b.dataset.restart=camp;row.append(b);}
  // For the undecided: the dice or the test only pick the camp (see armRestart).
  const undecided=document.createElement("div");undecided.className="btn-row";
  undecided.append(diceButton(()=>{const c=randomCamp();armRestart(c,`Le hasard a choisi la ${campWord(c)}.`);}),smallButton("Passer mon test politique","restart-test",openQuiz));
  const note=fine("");note.id="restart-note";note.setAttribute("aria-live","polite");
  body.append(warn,row,undecided,note);
  body.append(blockTitle("Compte"));
  const who=document.createElement("p");who.className="fine";
  who.textContent=`Connecté en tant que ${me}.${SPEED>1?` Serveur de test : le temps y passe ${SPEED} fois plus vite.`:""}`;
  const acc=document.createElement("div");acc.className="btn-row";
  const out=document.createElement("button");out.type="button";out.className="btn";out.textContent="Se déconnecter";out.addEventListener("click",logout);
  const del=document.createElement("button");del.type="button";del.className="btn danger";del.textContent="Supprimer mon compte…";
  del.addEventListener("click",()=>{
   del.replaceWith(Object.assign(document.createElement("form"),{className:"inline-form",noValidate:true}));
   const f=acc.querySelector("form"),pw=Object.assign(document.createElement("input"),{type:"password",autocomplete:"current-password",placeholder:"Mot de passe",required:true});
   pw.setAttribute("aria-label","Mot de passe, pour confirmer la suppression");
   const go=Object.assign(document.createElement("button"),{type:"submit",className:"btn danger",textContent:"Supprimer définitivement"});
   const warnDel=Object.assign(document.createElement("p"),{className:"fine",textContent:"Irréversible : ton compte et ta partie seront effacés."});
   const err=Object.assign(document.createElement("p"),{className:"form-error inline",id:"delete-error"});err.setAttribute("role","alert");
   pw.setAttribute("aria-describedby","delete-error");
   f.append(warnDel,pw,go,err);pw.focus();
   f.addEventListener("submit",async e=>{
    e.preventDefault();go.disabled=true;err.textContent="";
    const r=await api("DELETE","/api/account",{password:pw.value});go.disabled=false;
    if(r.ok){closeSheet();if(pushable())pushSub().then(sub=>sub?.unsubscribe()).catch(()=>{});endSession("Compte supprimé. Merci d'avoir joué !");}else{err.textContent=r.error;pw.focus();}
   });
  });
  acc.append(out,del);
  body.append(who,acc,pushRow());
  // The version the server was built from (git describe), without the tag's leading "v".
  const ver=document.createElement("p");ver.className="fine";
  ver.textContent=VERSION==="dev"?"PolitiGo, version de développement":`PolitiGo ${VERSION.replace(/^v(?=\d)/,"")}`;
  const news=Object.assign(document.createElement("button"),{type:"button",className:"btn",textContent:"Nouveautés de la version"});
  news.addEventListener("click",()=>showNews([latestEntry(RELEASE)],false));
  const nrow=document.createElement("div");nrow.className="btn-row";nrow.append(news);
  body.append(ver,nrow);
  const about=document.createElement("p");about.className="fine";
  about.textContent="PolitiGo est une satire. Personnages caricaturés et répliques inventées ; les faits rappelés sont publics, avec le stade de chaque procédure, et la présomption d'innocence s'applique. Aucun achat réel : la seule monnaie est le frais de mandat, gagné en restant en vie. Seuls ton pseudo et ta partie sont enregistrés.";
  body.append(about);
 }
}
// ---------- what's new ----------
// After an update, each player sees what changed once (on any device: the server keeps the last release read);
// closing the sheet, however it is closed, marks it read. The Dossier button shows it again on demand.
let newsList=[],newsAuto=false,newsPending=false;
const newsDate=d=>{const t=Date.parse(d+"T12:00:00Z");return Number.isFinite(t)?new Date(t).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):d;};
function showNews(list,auto){
 if(!list.length||!list[0])return;
 newsList=list;newsAuto=auto;
 if(auto)sheetOpener=null;                         // nothing was tapped: focus goes back to the screen
 openSheet("news",auto?null:$("[data-sheet=more]"));
}
// A scene replayed at sign-in (a death while away) plays first: the news waits for its end (see tickFrame).
function maybeShowNews(){
 if(!S||!RELEASE||newsAuto||sheetKind)return;
 if(scene||quiet()){newsPending=true;return;}
 const list=missedEntries(SEEN,RELEASE);
 if(list.length)showNews(list,true);
}
async function markNewsSeen(){
 const r=await api("POST","/api/changelog/seen",{});
 if(r.ok&&"seenVersion" in r)SEEN=r.seenVersion||null;
}
function closeSheet(fromBack=false){
 if($("#sheet").hidden)return;
 if(sheetKind==="news"&&newsAuto){newsAuto=false;SEEN=RELEASE;markNewsSeen();}
 if(!fromBack&&sheetInHistory){sheetInHistory=false;pendingBack=true;history.back();}
 $("#sheet").hidden=true;sheetKind=null;setBackgroundInert(false);chat.hide();$("#sheet").classList.remove("chat");
 if(authEl.hidden)(sheetOpener||cv).focus();
}
document.querySelectorAll("[data-sheet]").forEach(b=>b.addEventListener("click",()=>{
 if(!S)return;
 if(pong||mini){toast("Termine d'abord la partie (Échap pour abandonner).",true);return;}
 skipScene();openSheet(b.dataset.sheet,b);
}));
$("#sheet-close").addEventListener("click",()=>closeSheet());
// ---------- chat ----------
// The unread count sits on the "Chat" button like the challenges on "Jouer": a badge, nothing that pops up.
const chat=createChat({api,sheet:$("#sheet"),getCamp:()=>S?.camp||"left",getTz:()=>R.timeZone(),reduced:()=>reduced,onBadge(n){
 const b=$(".pad-btn[data-sheet=chat]");b.classList.toggle("alert",n>0);
 if(n>0){b.dataset.count=n>9?"9+":String(n);b.setAttribute("aria-label",`Chat (${n} message${n>1?"s":""} non lu${n>1?"s":""})`);}else{delete b.dataset.count;b.removeAttribute("aria-label");}
},
 // A 403 from a room closed meanwhile: the state is asked again, and its chat flags hide what was closed.
 async onClosed(){const r=await api("GET","/api/me");if(r.ok&&S)applyMe(r);}});
// The organisation opens the chat rooms (me.chat, off by default): no room open, no "Chat" button at all.
function chatFlags(flags){
 const any=flags?.global===true||flags?.camp===true,b=$(".pad-btn[data-sheet=chat]");
 chat.setOpen(any?flags:null);
 if(b.hidden!==!any){b.hidden=!any;$(".pad").classList.toggle("five",any);}
 if(!any&&sheetKind==="chat")closeSheet();
}

// ---------- duels ----------
// GET /api/duels: the challenges (each from this player's side: role, status, vs, mine, theirs, res), the opponents
// he may challenge, today's count and the server's push key. Loaded when the sheet opens, at each live duel event
// and at each (re)connection of the live stream: never polled.
let duelData=null,duelErr="",duelSeq=0,duelJournalT=0;
const duelList=()=>Array.isArray(duelData?.duels)?duelData.duels.filter(x=>x&&typeof x==="object"&&typeof x.vs==="string"):[];
const duelExp=x=>Number.isFinite(x.expires)?x.expires:(Number(x.created)||0)+R.DUEL.window;
const isPending=x=>x.status==="pending"&&duelExp(x)>serverNow();
const incoming=()=>duelList().filter(x=>x.role==="defender"&&isPending(x));
async function duelsLoad(){
 if(!S)return null;
 const seq=++duelSeq,who=me,r=await api("GET","/api/duels");
 if(seq!==duelSeq||!S||me!==who)return duelData;             // a newer load, or another player, won the race
 if(r.ok){duelData=r;duelErr="";pushSync(r.pushKey);}else duelErr=r.error;
 refresh();
 if(sheetKind==="duels"||(r.ok&&(sheetKind==="play"||sheetKind==="more")))liveSheet(true);
 return duelData;
}
function openDuels(){openSheet("duels");duelsLoad();}
const remain=x=>{const m=Math.max(1,Math.round((duelExp(x)-serverNow())/60000));return m>=60?`${Math.floor(m/60)} h`:`${m} min`;};
// One line per finished duel, from this player's side.
function duelResult(x){
 const vs=x.vs,a=x.mine??"?",b=x.theirs??"?";
 if(x.res==="win")return `Gagné ${a} à ${b} contre ${vs}`;
 if(x.res==="loss")return `Perdu ${a} à ${b} contre ${vs}`;
 if(x.res==="tie")return `Match nul contre ${vs}, ${a} partout`;
 if(x.res==="chicken")return `${vs} a esquivé ton défi`;
 if(x.status==="refused")return x.role==="challenger"?`${vs} a esquivé ton défi`:`Refusé : le défi de ${vs}`;
 if(x.status==="expired")return x.role==="challenger"?`Expiré : ${vs} n'a pas répondu`:`Expiré : le défi de ${vs}`;
 if(x.status==="void")return `Annulé : le duel contre ${vs}`;
 return "";
}
const fine=t=>Object.assign(document.createElement("p"),{className:"fine",textContent:t});
function duelCard(title,sub,...buttons){
 const d=document.createElement("div");d.className="duel";
 const b=document.createElement("b"),sm=document.createElement("small");b.textContent=title;sm.textContent=sub;d.append(b,sm);
 if(buttons.length){const row=document.createElement("div");row.className="btn-row";row.append(...buttons);d.append(row);}
 return d;
}
function smallButton(label,cls,onClick,disabled=false){
 const b=Object.assign(document.createElement("button"),{type:"button",className:`btn ${cls}`,textContent:label,disabled});
 b.addEventListener("click",onClick);return b;
}
function renderDuels(body,set){
 const d=duelData,why=R.duelBlock(S,d?.minLevel??R.DUEL.minLevel),D=R.DUEL;
 set(hw()?"Duels de minuit":"Duels",d?`Débat chrono en face à face · défis aujourd'hui : ${d.sent??0}/${d.perDay??D.perDay}`:"Débat chrono en face à face");
 if(!d){
  body.append(fine(duelErr||"Chargement des duels…"));
  if(duelErr){const row=document.createElement("div");row.className="btn-row";row.append(smallButton("Réessayer","",()=>duelsLoad()));body.append(row);}
  return;
 }
 if(why)body.append(Object.assign(fine(`Pas de duel pour l'instant : ${why}`),{className:"fine warn"}));
 const all=duelList(),inc=incoming(),out=all.filter(x=>x.role==="challenger"&&isPending(x));
 if(inc.length){
  body.append(blockTitle("Défis reçus"));
  for(const x of inc)body.append(duelCard(`${x.vs} te défie`,`Débat chrono · reste ${remain(x)} pour répondre`,
   // Two taps each: a stray tap must neither throw him into a game nor turn a rival down.
   why?smallButton("Relever le défi","go",()=>{},true):armedButton("Relever le défi","Prêt ? Touche encore pour jouer","go",()=>acceptDuel(x)),
   armedButton("Refuser","Confirmer le refus","",()=>refuseDuel(x))));
  body.append(fine(`Refuser ne coûte rien : ${inc.length>1?"tes rivaux gagnent":"ton rival gagne"} juste un peu de moral (+${D.chicken.moral}).`));
 }
 if(out.length){
  body.append(blockTitle("Tes défis en cours"));
  for(const x of out)body.append(duelCard(`En attente de ${x.vs}`,`${x.mine!=null?`Ton score : ${x.mine} · `:""}reste ${remain(x)} pour répondre`));
 }
 body.append(blockTitle("Adversaires"));
 const opps=Array.isArray(d.opponents)?d.opponents.filter(o=>o&&typeof o.name==="string"):[];
 if(!opps.length)body.append(fine(`Personne à défier pour l'instant : les duels s'ouvrent au niveau ${D.minLevel}.`));
 else body.append(list(...opps.map(o=>{
  const sub=`${o.candidate||"?"} · niv. ${o.lvl??"?"}${o.ok===false&&o.why?` · ${o.why}`:""}`;
  const b=itemButton(o.name,sub,"Défier",o.ok===false||!!why,()=>challenge(o.name));
  nameWithDot(b.querySelector("b"),o.name,o.online);
  b.classList.add("opp",o.camp==="right"?"right":"left");return b;
 })));
 const done=all.filter(x=>x.status!=="pending").map(x=>({x,text:duelResult(x)})).filter(e=>e.text);
 if(done.length){
  body.append(blockTitle("Derniers résultats"));
  const ul=document.createElement("ul");ul.className="journal duel-log";
  for(const {x,text} of done.slice(0,10)){
   const li=document.createElement("li");li.className=["win","loss","tie","chicken"].includes(x.res)?x.res:"";
   if(Number.isFinite(x.created)){const tm=document.createElement("time");tm.textContent=when(x.created);li.append(tm);}
   li.append(text);ul.append(li);
  }
  body.append(ul);
 }
 body.append(blockTitle("Règles"),fine(`Victoire : +${D.win.xp} XP, moral +${D.win.moral}, énergie +${D.win.energy} (XP payée pour ${D.paidWins} victoires par jour). `+
  `Défaite : −${-D.loss.xp} XP, moral −${-D.loss.moral}, énergie −${-D.loss.energy}, mais jamais de niveau perdu ni de jauge sous ${D.floor}. `+
  `Match nul : moral +${D.tie.moral}. Refuser ne coûte rien. Dès le niveau ${D.minLevel}, ${D.perDay} défis par jour, ${Math.round(D.window/R.H)} h pour répondre.`));
}
// Live duel events. A result's journal entry (scores, XP) says more than the short notice: it is not overwritten.
function duelEvent(v){
 const vs=typeof v.vs==="string"?v.vs:"Un rival",m=R.DUEL.chicken.moral;
 const texts={challenged:`${vs} te défie au Débat chrono ! Va dans Jouer → Duels.`,resolved:`Résultat du duel contre ${vs} disponible.`,
  refused:v.role==="defender"?"":`${vs} a esquivé ton défi : moral +${m}.`,expired:v.role==="defender"?`Le défi de ${vs} a expiré.`:`Ton défi à ${vs} a expiré : moral +${m}.`,
  void:`Le duel contre ${vs} est annulé.`};
 const text=Object.hasOwn(texts,v.kind)?texts[v.kind]:"";
 if(text&&(v.kind==="challenged"||Date.now()-duelJournalT>5000))toast(text);
 if(v.kind==="challenged")notifyHidden(text,v.id);
 duelsLoad();
}

// ---------- duel notifications (Web Push) ----------
// Whether this device is notified is only what its push subscription says: the page stores nothing about it.
const pushable=()=>"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
const appleMobile=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const PUSH_DENIED="Notifications bloquées pour PolitiGo : autorise-les dans les réglages du site de ton navigateur (le cadenas à côté de l'adresse), puis reviens ici.";
let pushOn=null,pushBusy=false,pushSynced=false;
async function pushSub(){try{const reg=await navigator.serviceWorker.getRegistration("/");return reg?await reg.pushManager.getSubscription():null;}catch{return null;}}
const b64u=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"=")),c=>c.charCodeAt(0));
async function pushEnable(perm,key){
 if(await perm!=="granted")return Notification.permission==="denied"?PUSH_DENIED:"Notifications non autorisées : rien n'a changé.";
 await navigator.serviceWorker.register("/sw.js",{scope:"/"});
 const reg=await navigator.serviceWorker.ready,opts={userVisibleOnly:true,applicationServerKey:b64u(key)};
 let sub;
 // A subscription made for another server key cannot be reused: it is dropped and made again.
 try{sub=await reg.pushManager.subscribe(opts);}catch{await (await reg.pushManager.getSubscription())?.unsubscribe();sub=await reg.pushManager.subscribe(opts);}
 const j=sub.toJSON(),r=await api("POST","/api/push/subscribe",{endpoint:j.endpoint,keys:{p256dh:j.keys?.p256dh,auth:j.keys?.auth}});
 if(!r.ok){await sub.unsubscribe().catch(()=>{});return r.error;}
 return "";
}
// Once per sign-in: a subscription left by an expired session (another player, same device) moves to this player,
// and one made for an older server key (it would never receive anything) is dropped, so the toggle tells the truth.
async function pushSync(key){
 if(pushSynced||!pushable())return;pushSynced=true;
 const sub=await pushSub();if(!sub)return;
 const k=sub.options?.applicationServerKey,same=!key||!k||b64u(key).join()===new Uint8Array(k).join();
 if(!same){await sub.unsubscribe().catch(()=>{});pushOn=false;liveSheet(true);return;}
 const j=sub.toJSON(),r=await api("POST","/api/push/subscribe",{endpoint:j.endpoint,keys:{p256dh:j.keys?.p256dh,auth:j.keys?.auth}});
 if(!r.ok)pushSynced=false;
}
// The server first, then the device: once this returns, nothing is sent to this endpoint any more.
async function pushDisable(){
 const sub=await pushSub();if(!sub)return "";
 await api("POST","/api/push/unsubscribe",{endpoint:sub.endpoint});
 return await sub.unsubscribe().then(()=>"",()=>"Impossible de couper les notifications sur cet appareil : réessaie, ou retire l'autorisation dans les réglages du site.");
}
async function togglePush(){
 if(pushBusy)return;
 const on=pushOn,key=duelData?.pushKey;
 // Asked first, inside the tap itself: Safari only shows the permission prompt for a direct user gesture.
 const perm=on?null:new Promise(ok=>{const p=Notification.requestPermission(ok);p?.then?.(ok);});
 pushBusy=true;liveSheet(true);
 let err="";
 try{err=on?await pushDisable():await pushEnable(perm,key);}catch{err="Impossible de régler les notifications sur cet appareil : réessaie plus tard.";}
 pushOn=!!(await pushSub());pushBusy=false;
 toast(err||(pushOn?"Notifications de duel activées sur cet appareil.":"Notifications de duel désactivées sur cet appareil."));
 liveSheet(true);
}
function pushRow(){
 const box=document.createElement("div");
 if(!pushable()){
  box.append(fine(appleMobile()?"Notifications de duel : sur iPhone et iPad, ajoute d'abord PolitiGo à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvre-le depuis son icône."
   :"Notifications de duel : ton navigateur ne les gère pas."));
  return box;
 }
 const key=duelData?.pushKey,denied=Notification.permission==="denied";
 const b=smallButton(`Notifications de duel : ${pushOn===null?"…":pushOn?"activées":"désactivées"}`,"",togglePush,pushBusy||pushOn===null||(!pushOn&&(!key||denied)));
 b.setAttribute("aria-pressed",String(!!pushOn));
 const row=document.createElement("div");row.className="btn-row";row.append(b);
 box.append(row,fine(pushOn?"Cet appareil te prévient quand un rival te défie ou qu'un duel se termine."
  :!duelData?"Chargement…":key===null||key===undefined?"Le serveur n'envoie pas de notifications pour l'instant."
  :denied?PUSH_DENIED:"Sois prévenu d'un défi même PolitiGo fermé (sur cet appareil seulement)."));
 // The state is read again at each drawing: the browser's settings may have changed it meanwhile.
 if(!pushBusy)pushSub().then(sub=>{if(!!sub!==pushOn&&!pushBusy){pushOn=!!sub;liveSheet(true);}});
 if(!duelData)duelsLoad();
 return box;
}
// A challenge while the page is open but hidden, on a device that asked for notifications: shown locally, under
// the tag the push uses ("duel-<id>"), so that the two replace each other instead of stacking.
function notifyHidden(body,id){
 if(!document.hidden||quiet()||!pushable()||Notification.permission!=="granted")return;
 navigator.serviceWorker.getRegistration("/").then(async reg=>{
  if(reg&&await reg.pushManager.getSubscription())await reg.showNotification("PolitiGo",{body,tag:`duel-${String(id).slice(0,40)}`,data:{url:"/"}});
 }).catch(()=>{});
}
$("#sheet").addEventListener("click",e=>{if(e.target.id==="sheet")closeSheet();});

// ---------- political test and dice ----------
// For the undecided, at sign-up and at a resignation: "Au hasard" (politest.mjs randomCamp) or "Passer mon test
// politique" (drawTest, one question at a time, then verdict). Both only pick a camp, shown and still changeable:
// the usual flow (the sign-up form, the resignation's confirming tap) goes on from there.
const campWord=c=>c==="left"?"gauche":"droite",otherCamp=c=>c==="left"?"right":"left";
// "D'Olivier Faure à Jean-Luc Mélenchon", as on the sign-up cards.
const campRange=c=>{const l=people[c],n=l[0].name,from=/^[aeiouyéèêî]/i.test(n)?`D'${n}`:`De ${n}`;return `${from} à ${l[l.length-1].name}`;};
const newQuiz=()=>({items:drawTest(),kinds:[],v:null});
function diceButton(onClick){const b=smallButton("Au hasard","",onClick),d=document.createElement("span");d.setAttribute("aria-hidden","true");d.textContent="🎲 ";b.prepend(d);return b;}
// Draws the test's current step into box. Returns its heading, which takes the focus after each answer so that
// the next question (or the verdict) is read out.
function renderQuiz(box,q,on){
 const h=Object.assign(document.createElement("h3"),{className:"quiz-q",tabIndex:-1}),step=fine(""),foot=document.createElement("div");
 step.id=`${box.id}-step`;step.classList.add("quiz-step");h.setAttribute("aria-describedby",step.id);foot.className="btn-row";
 const quit=smallButton("Quitter le test","",on.quit);
 if(!q.v){
  const i=q.kinds.length,n=q.items.length,it=q.items[i],bar=document.createElement("div"),fill=document.createElement("i");
  step.textContent=`Question ${i+1}/${n}`;h.textContent=it.q;
  bar.className="bar";bar.setAttribute("aria-hidden","true");fill.style.width=`${100*i/n}%`;bar.append(fill);   // CSSOM: allowed by the CSP
  // A double tap must not answer the next question too: only the question on screen takes an answer.
  const opts=list(...it.answers.map(a=>{
   const b=Object.assign(document.createElement("button"),{type:"button",className:"item quiz-a",textContent:a.text});
   b.addEventListener("click",()=>{if(q.v||q.items[q.kinds.length]!==it)return;q.kinds.push(a.kind);if(q.kinds.length===n)q.v=verdict(q.kinds);on.next();});
   return b;
  }));
  foot.append(quit);box.replaceChildren(step,bar,h,opts,foot);
 }else{
  const {camp,left,right,none,tie,line}=q.v,other=otherCamp(camp);
  step.textContent="Verdict";h.textContent=line;
  const counts=fine(`${left} réponse${left>1?"s":""} à gauche, ${right} à droite, ${none} à côté de la plaque.`);
  const card=document.createElement("div");card.className=`quiz-camp ${camp}`;
  const c=document.createElement("canvas");c.width=c.height=64;c.setAttribute("aria-hidden","true");
  const f=people[camp][0];sprite(c.getContext("2d"),{...f,prop:personalItems[f.name][0].prop},0,"win");
  const txt=document.createElement("span"),k=document.createElement("small"),b=document.createElement("b"),sm=document.createElement("small");
  k.textContent=tie?"Pile ou face a tranché pour la":"Le test te verrait bien dans la";b.textContent=`Collection ${campWord(camp)}`;sm.textContent=campRange(camp);
  txt.append(k,b,sm);card.append(c,txt);
  foot.append(smallButton(`Rejoindre la ${campWord(camp)}`,`go ${camp}`,()=>on.choose(camp,true)),smallButton(`Non merci, je préfère la ${campWord(other)}`,"",()=>on.choose(other,false)),quit);
  box.replaceChildren(step,h,counts,card,foot);
 }
 return h;
}
function mountQuiz(box,q,choose,quit){const next=()=>renderQuiz(box,q,{choose,quit,next}).focus();return renderQuiz(box,q,{choose,quit,next});}
// At a resignation, from the Dossier sheet.
let sheetQuiz=null;
function openQuiz(){sheetQuiz=newQuiz();renderSheet("test");$(".sheet-card").scrollTop=0;$("#sheet-quiz .quiz-q").focus();}
// The camp picked by the dice or the test: as if its button had been tapped once, so the resignation still waits for
// the confirming tap (and the server's one-an-hour limit). The sheet is drawn afresh first: a button already armed
// by an earlier tap must never take this one as its confirmation.
function armRestart(camp,text){
 renderSheet("more");
 const b=$(`#sheet-body [data-restart=${camp}]`),note=$("#restart-note");
 note.textContent=`${text} Touche encore « Confirmer » pour démissionner, ou choisis l'autre camp.`;
 b.setAttribute("aria-describedby","restart-note");b.click();
 b.scrollIntoView({block:"center",behavior:reduced?"auto":"smooth"});b.focus({preventScroll:true});
}

// ---------- sign-in / sign-up ----------
const authEl=$("#auth");
let regCamp="left";
function showAuth(message=""){
 closeSheet();chat.reset();chatFlags(null);es?.close();es=null;S=null;anim=pong=mini=scene=null;newsPending=false;toastQ.length=0;announceQ.length=0;$("#announce").hidden=true;duelData=null;duelErr="";duelSeq++;pushOn=null;pushSynced=false;setNet(true);$("#tips").hidden=true;
 authEl.hidden=false;setBackgroundInert(true);
 $("#auth-error").textContent=message;regQuizShow(false);$("#camp-note").textContent="";document.body.dataset.camp=regCamp;
 document.querySelectorAll(".camp").forEach(b=>{
  const f=people[b.dataset.camp][0];
  sprite(b.querySelector("canvas").getContext("2d"),{...f,prop:personalItems[f.name][0].prop},0,"win");
 });
 const first=authEl.querySelector("form:not([hidden]) input");first?.focus();
}
function hideAuth(){authEl.hidden=true;setBackgroundInert(false);$("#auth-error").textContent="";}
function switchTab(which){
 for(const t of ["login","register"]){
  $(`#tab-${t}`).setAttribute("aria-pressed",String(t===which));$(`#form-${t}`).hidden=t!==which;
 }
 $("#auth-error").textContent="";authEl.querySelector(`#form-${which} input`).focus();
}
$("#tab-login").addEventListener("click",()=>switchTab("login"));
$("#tab-register").addEventListener("click",()=>switchTab("register"));
// The camp chosen at sign-up (a card, the dice or the test); the note says how, until a card is tapped again.
function pickCamp(camp,note=""){
 regCamp=camp;document.body.dataset.camp=camp;$("#camp-note").textContent=note;
 document.querySelectorAll(".camp").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.camp===camp)));
}
document.querySelectorAll(".camp").forEach(b=>b.addEventListener("click",()=>pickCamp(b.dataset.camp)));
$("#camp-dice").addEventListener("click",()=>{const c=randomCamp();pickCamp(c,`Le hasard a choisi la ${campWord(c)} : tu peux encore changer d'avis avant de commencer.`);});
// The sign-up test takes the place of the camp cards, inside the form: what was typed stays, and the form cannot be
// sent half-way through the test (its button is disabled, which also stops Enter in a field).
const regQuizEl=$("#reg-quiz");
function regQuizShow(on){
 const form=$("#form-register");form.classList.toggle("quizzing",on);regQuizEl.hidden=!on;form.querySelector(".cta").disabled=on;
 if(!on)regQuizEl.replaceChildren();
}
$("#camp-test").addEventListener("click",()=>{
 regQuizShow(true);$("#camp-note").textContent="";
 mountQuiz(regQuizEl,newQuiz(),(camp,sugg)=>{
  regQuizShow(false);
  pickCamp(camp,`${sugg?`Verdict du test : la ${campWord(camp)}.`:`Va pour la ${campWord(camp)}, malgré le test.`} Tu peux encore changer d'avis avant de commencer.`);
  $(`.camp[data-camp=${camp}]`).focus();
 },()=>{regQuizShow(false);$("#camp-test").focus();}).focus();
});
regQuizEl.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();regQuizShow(false);$("#camp-test").focus();}});
async function submitAuth(e,path,extra){
 e.preventDefault();
 const form=e.currentTarget,data=Object.fromEntries(new FormData(form)),btn=form.querySelector("button[type=submit]");
 const label=btn.textContent;
 btn.disabled=true;btn.textContent=path==="/api/login"?"Connexion…":"Création du compte…";$("#auth-error").textContent="";
 const r=await api("POST",path,{...data,...extra});
 btn.disabled=false;btn.textContent=label;
 if(!r.ok){$("#auth-error").textContent=r.error;form.querySelector("input")?.focus();return;}
 form.reset();hideAuth();
 applyMe(r,{replay:path==="/api/login"});connectLive();showTips();
 cv.focus();                          // the focused button just disappeared with the sign-in screen
 if(path==="/api/register"){startScene(S.camp,S.camp,"");toast("Bienvenue ! Touche l'écran pour passer l'animation.");}
 else{toast(`Bon retour, ${me} !`);maybeShowNews();}
}
// The first steps card shows until it is dismissed once on this device.
function showTips(){let seen=false;try{seen=!!localStorage.getItem("politigo.tips");}catch{}$("#tips").hidden=seen;}
$("#tips-close").addEventListener("click",()=>{try{localStorage.setItem("politigo.tips","1");}catch{}$("#tips").hidden=true;});
$("#form-login").addEventListener("submit",e=>submitAuth(e,"/api/login",{}));
$("#form-register").addEventListener("submit",e=>submitAuth(e,"/api/register",{camp:regCamp}));
function endSession(message){me=null;board=[];feed=[];renderFeed();showAuth(message);}
// The device's push subscription goes first, while the session still allows it: another account signing in here
// must never receive the previous player's duel notifications.
async function logout(){
 closeSheet();if(pushable())await pushDisable().catch(()=>{});
 const r=await api("POST","/api/logout",{});
 if(!r.ok&&r.status!==401){toast("Déconnexion impossible pour l'instant : vérifie ta connexion et réessaie.");return;}
 endSession("À bientôt !");
}

// ---------- Halloween surprise ----------
// The first sight of the haunted Republic, once a year on this device: a toast only, after the news and the scenes.
let hwHello=false;
function halloweenHello(){
 hwHello=true;
 const key=`politigo.halloween.${new Date(serverNow()).getFullYear()}`;
 try{if(localStorage.getItem(key))return;localStorage.setItem(key,"1");}catch{}
 toast("🎃 Joyeux Halloween ! La République est hantée jusqu'au 1er novembre : bonbons à la Buvette, costumes la nuit…");
}

// ===================================================================== LOOP
let lastHud=0,lastDraw=0,lastFrame=0;
let drawFailed=false,playing=false;
function frame(now){
 requestAnimationFrame(frame);           // first, so that a drawing error can never stop the loop for good
 try{tickFrame(now);}catch(err){if(!drawFailed){drawFailed=true;console.error(err);}scene=null;anim=null;}
}
function tickFrame(now){
 const fdt=lastFrame?now-lastFrame:0;lastFrame=now;
 if(playing!==!!(pong||mini)){playing=!!(pong||mini);document.body.classList.toggle("playing",playing);}
 if(S&&authEl.hidden){
  S.vclock=vnow();       // the displayed clock moves on; hour ticks themselves always come from the server
  // A scene mid-game (only a death now: the others wait for the end) freezes the Pong clock instead of eating it.
  if(pong){if(scene){pong.t0+=fdt;pong.last=now;if(pong.endT)pong.endT+=fdt;}else stepPong(now);}
  // The mini-games run on their own clock, which a scene stops and a hidden tab pauses (one frame is 100 ms at most).
  if(mini&&!scene){const d=Math.min(100,fdt);miniClock+=d;mini.step(miniClock,Math.min(0.05,d/1000));if(mini.over(miniClock))endMini();}
  // Full frame rate only while something moves fast; the idle screen is fine at ~8 fps and saves battery.
  if(pong||mini||scene||anim||lvlFx||now-lastDraw>=120){lastDraw=now;render(now);}
  if(now-lastHud>500){lastHud=now;refresh();liveSheet();}
  // After a game, in order: what the journal kept back (once the game's own result has been read), the news,
  // then the queued toasts one at a time.
  if(!scene&&!quiet()&&!busy){
   if(journalShown<S.jn){if(Date.now()-toastAt>3800)playJournal(false);}
   else if(newsPending){newsPending=false;maybeShowNews();}
   else if(toastQ.length&&Date.now()-toastAt>=4000)toast(toastQ.shift());
   if(announceQ.length)showAnnounce();
  }
  if(hw()&&!hwHello&&!scene&&!quiet()&&!toastQ.length&&sheetKind!=="news"&&Date.now()-toastAt>4000)halloweenHello();
 }
}

fitCanvas();
// Start: resume the session, or show the sign-in. A server that is down or restarting is retried on its own,
// so a player with a valid session is not left believing they were signed out.
async function boot(delay=5000){
 const r=await api("GET","/api/me");
 if(S)return;                                   // signed in through the form meanwhile
 if(r.ok&&r.state){hideAuth();applyMe(r,{replay:true});connectLive();showTips();maybeShowNews();return;}
 if(r.status===401){if(authEl.hidden)showAuth();else $("#auth-error").textContent="";return;}
 const msg=`${r.error} Nouvel essai automatique…`;
 if(authEl.hidden)showAuth(msg);else $("#auth-error").textContent=msg;
 setTimeout(()=>boot(Math.min(delay*2,60000)),delay);
}
boot();
requestAnimationFrame(frame);
