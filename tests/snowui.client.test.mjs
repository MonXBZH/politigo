// Trêve des confiseurs, the snowball fight on screen (web/snowui.mjs): the pure pieces behind the canvas and the
// battle sheet. The tap recorder, the foe each pop shows, the live view drawn from play() (the same score as the
// server's), and the texts of the end screen, the Front de neige and the challenges. node --test, no DOM.
import {test} from "node:test";
import assert from "node:assert/strict";
import {SNOW,SPOTS,COVER,ORIGIN,schedule,play,incomingAt} from "../web/snowball.mjs";
import {people} from "../web/rules.mjs";
import * as U from "../web/snowui.mjs";

const centre=i=>{const s=SPOTS[i];return {x:s.x,y:Math.round(s.base-(64+COVER)/2*s.k)};};
const landAt=(t,x,y)=>t+SNOW.fly+SNOW.flyPerPx*Math.sqrt((x-ORIGIN.x)**2+(y-ORIGIN.y)**2);
const pop=o=>({t:1000,spot:0,stay:2000,passant:null,foe:0,throws:false,throwAt:1900,aim:{x:233,y:350},...o});

// ---------------------------------------------------------------- the tap recorder
test("tapRecorder: integers in the 466 square and in [0, 45 000] ms, in time order",()=>{
 const r=U.tapRecorder();
 assert.equal(r.add(12.4,100.6,200.2),true);
 assert.equal(r.add(-5,-20,500),true);            // clamped: t 0 would go back in time, so it keeps the last t
 assert.equal(r.add(50000,233,233),true);         // clamped to the end of the fight
 assert.deepEqual(r.taps(),[{t:12,x:101,y:200},{t:12,x:0,y:466},{t:45000,x:233,y:233}]);
 for(const p of r.taps())for(const k of ["t","x","y"])assert.ok(Number.isInteger(p[k]),k);
});

test("tapRecorder: what is not a number is ignored, and the list it gives is a copy",()=>{
 const r=U.tapRecorder();
 for(const [t,x,y] of [[NaN,1,1],[1,Infinity,1],[1,1,undefined],["3",1,1],[null,1,1]])assert.equal(r.add(t,x,y),false);
 assert.equal(r.size(),0);
 r.add(5,5,5);const a=r.taps();a.push({t:9,x:9,y:9});a[0].x=400;
 assert.deepEqual(r.taps(),[{t:5,x:5,y:5}]);
});

test("tapRecorder: at most SNOW.maxTaps taps; the next ones are ignored; the server accepts what it gives",()=>{
 const r=U.tapRecorder();
 for(let i=0;i<SNOW.maxTaps+50;i++)r.add(i*100.3,(i*37)%470,(i*53)%480);
 assert.equal(r.size(),SNOW.maxTaps);
 assert.equal(r.add(44000,10,10),false);
 const taps=r.taps();
 assert.equal(taps.length,400);
 // validTaps (the server's check) would take it as it is
 assert.doesNotThrow(()=>play(schedule(1,"left"),taps));
 for(let i=1;i<taps.length;i++)assert.ok(taps[i].t>=taps[i-1].t);
});

test("tapRecorder: a smaller cap can be given (tests), never a bigger one",()=>{
 assert.equal((()=>{const r=U.tapRecorder(2);r.add(1,1,1);r.add(2,2,2);r.add(3,3,3);return r.size();})(),2);
 const big=U.tapRecorder(10_000);for(let i=0;i<500;i++)big.add(i,1,1);
 assert.equal(big.size(),SNOW.maxTaps);
});

// ---------------------------------------------------------------- foes and passers-by
test("foeIndex: the raw integer modulo the list, never out of range",()=>{
 assert.equal(U.foeIndex(0,5),0);
 assert.equal(U.foeIndex(7,5),2);
 assert.equal(U.foeIndex(65535,7),65535%7);
 assert.equal(U.foeIndex(-3,5),2);
 assert.equal(U.foeIndex(3,0),0);
 assert.equal(U.foeIndex(NaN,4),0);
});

test("foeOf: an élu of the OTHER camp with his camp's hat; a passer-by from the two neutral sprites, without a hat",()=>{
 const p=pop({foe:12345});
 const a=U.foeOf(p,"left");
 assert.equal(a.camp,"right");
 assert.equal(a.p,people.right[12345%people.right.length]);
 assert.equal(a.hat,U.HATS.right);
 const b=U.foeOf(p,"right");
 assert.equal(b.camp,"left");assert.equal(b.p,people.left[12345%people.left.length]);assert.equal(b.hat,U.HATS.left);
 assert.notEqual(U.HATS.left,U.HATS.right);
 assert.equal(U.PASSANTS.length,2);
 for(const i of [0,1]){const x=U.foeOf(pop({passant:i}),"left");assert.equal(x.p,U.PASSANTS[i]);assert.equal(x.camp,null);assert.equal(x.hat,null);}
 for(const s of U.PASSANTS)for(const k of ["coat","hair","style","name"])assert.ok(k in s,k);
});

// ---------------------------------------------------------------- the live view
const one={pops:[pop({})],sleighs:[]};
test("liveView: a hit counts when the ball lands, not when it is thrown",()=>{
 const c=centre(0),t=1200,taps=[{t,...c}],land=landAt(t,c.x,c.y);
 const L=U.liveView(one);
 assert.equal(L.view(taps,t+1).score,0);
 assert.equal(L.view(taps,t+1).balls.length,1);
 const v=L.view(taps,Math.ceil(land));
 assert.equal(v.score,3);assert.equal(v.combo,1);assert.equal(v.balls.length,0);
 assert.ok(v.hitAt.has(0));
 assert.ok(v.floats.some(f=>f.text==="+3"));
});

test("liveView: at the end, the score is play()'s, the server's, on a real seeded fight",()=>{
 for(const seed of [1,7,99,2024,123456]){
  const sched=schedule(seed,"left"),taps=[];
  // a player tapping where things show up, plus some misses
  for(const p of sched.pops){const c=centre(p.spot);taps.push({t:Math.round(p.t+200),x:c.x,y:c.y});if(p.t%3<1)taps.push({t:Math.round(p.t+260),x:30,y:430});}
  taps.sort((a,b)=>a.t-b.t);
  const R=play(sched,taps),L=U.liveView(sched);
  const v=L.view(taps,SNOW.ms);
  assert.equal(v.score,R.score,`seed ${seed}`);
  assert.equal(L.view(taps,SNOW.ms+5000).score,R.score);
  // and the score never jumps backwards except for a passer-by
  let last=0;for(let t=0;t<=SNOW.ms;t+=250){const s=L.view(taps,t).score;assert.ok(s>=0);last=s;}
  assert.equal(last,R.score);
 }
});

test("liveView: a passer-by hit costs 5 points but never below zero, and the series falls to zero",()=>{
 const sched={pops:[pop({passant:0})],sleighs:[]},c=centre(0),taps=[{t:1200,...c}];
 const v=U.liveView(sched).view(taps,4000);
 assert.equal(v.score,0);assert.equal(v.combo,0);
 assert.ok(v.floats.length===0||v.floats.every(f=>f.text));
 assert.ok(U.liveView(sched).view(taps,Math.ceil(landAt(1200,c.x,c.y))).floats.some(f=>/passants/.test(f.text)));
});

test("liveView: five balls in hand, one back every 500 ms; a sixth tap at once is « Plus de boules ! »",()=>{
 const taps=[0,10,20,30,40,50].map(t=>({t:t+100,x:30,y:430}));
 const L=U.liveView({pops:[],sleighs:[]});
 assert.equal(L.view([],0).ammo,5);
 const v=L.view(taps,160);
 assert.equal(v.ammo,0);
 assert.ok(v.floats.some(f=>f.text==="Plus de boules !"));
 assert.equal(L.view(taps,100+499).ammo,0);
 assert.equal(L.view(taps,100+500).ammo,1);
 assert.equal(L.view(taps,100+2500).ammo,5);
});

test("liveView: an incoming ball flies for a second; parried, it is gone and gives +1; taken, it splats the screen",()=>{
 const p=pop({throws:true,throwAt:1900});
 const sched={pops:[p],sleighs:[]},L=U.liveView(sched);
 assert.equal(L.view([],1899).incoming.length,0);
 assert.equal(L.view([],2000).incoming.length,1);
 // not parried: taken at throwAt + 1000
 const v=L.view([],2899);assert.equal(v.incoming.length,1);assert.equal(v.splat,-Infinity);
 const w=L.view([],2900+10);assert.equal(w.splat,2900);assert.equal(w.incoming.length,0);
 assert.ok(w.floats.some(f=>f.text==="Aïe !"));
 // parried at 2400
 const b=incomingAt(p,2400),taps=[{t:2400,x:Math.round(b.x),y:Math.round(b.y)}];
 const x=L.view(taps,2401);
 assert.equal(x.incoming.length,0);assert.equal(x.score,1);assert.equal(x.ammo,5);
 assert.ok(x.floats.some(f=>f.text==="Parée ! +1"));
 assert.equal(x.splat,-Infinity);
});

test("liveView: a foe hit before he throws never throws",()=>{
 const p=pop({throws:true,throwAt:2600,stay:4000}),c=centre(0);
 const v=U.liveView({pops:[p],sleighs:[]}).view([{t:1200,...c}],2700);
 assert.equal(v.incoming.length,0);
});

test("liveView: the series multiplier shows in the floating text (×1,5 from the 5th hit)",()=>{
 const pops=[0,1,2,3,4].map(k=>pop({t:1000+k*2000,spot:k%3,stay:1500}));
 const taps=pops.map(p=>({t:p.t+200,...centre(p.spot)}));
 const L=U.liveView({pops,sleighs:[]}),R=play({pops,sleighs:[]},taps);
 const v=L.view(taps,SNOW.ms);
 assert.equal(v.score,R.score);assert.equal(v.combo,5);assert.equal(v.mult,1.5);
 const t5=Math.ceil(landAt(taps[4].t,taps[4].x,taps[4].y));
 assert.ok(L.view(taps,t5).floats.some(f=>f.text==="+5 ×1,5"));
});

test("liveView: the sleigh hit is remembered (its glow) and gives +15",()=>{
 const sched={pops:[],sleighs:[{t:14000,dir:1}]};
 // the sleigh at k=0.5: x=-80+310=230, y=92+sin(4)*10
 const t=14000+2250-Math.round(SNOW.fly+SNOW.flyPerPx*Math.hypot(230-ORIGIN.x,92-ORIGIN.y)),taps=[{t,x:230,y:92}];
 const v=U.liveView(sched).view(taps,17000);
 assert.equal(v.score,play(sched,taps).score);
 assert.equal(v.score,15);assert.deepEqual([...v.sleighHit],[0]);
});

test("liveView: the time left counts down from 45 s and stops at 0",()=>{
 const L=U.liveView({pops:[],sleighs:[]});
 assert.equal(L.view([],0).left,45);
 assert.equal(L.view([],44001).left,1);
 assert.equal(L.view([],60000).left,0);
});

// ---------------------------------------------------------------- the end screen
const res={score:42,hits:14,thrown:20,parries:3,passHits:1,taken:2,best:6};
test("endSummary: the server's score, the stats, the XP and the bonus",()=>{
 const s=U.endSummary({ok:true,result:res,bonus:16,xp:35});
 assert.equal(s.score,"42");
 assert.equal(s.stats,"14 touches · 70 % de précision · 3 parades · meilleure série 6 · 1 passant touché");
 assert.equal(s.xp,"+35 XP, bonus +16");
 assert.equal(s.title,"Fin de la bataille !");
 assert.equal(U.endSummary({ok:true,result:{...res,score:85},bonus:34,xp:35}).title,"Bataille remportée !");
});

test("endSummary: singular, nothing thrown, under 10 points",()=>{
 const s=U.endSummary({ok:true,result:{score:4,hits:1,thrown:0,parries:1,passHits:0,taken:0,best:1},bonus:0,xp:35});
 assert.equal(s.stats,"1 touche · 0 % de précision · 1 parade · meilleure série 1");
 assert.equal(s.xp,"+35 XP, pas de bonus (il faut 10 points)");
});

test("endSummary: a refused game shows the server's reason, never a local score",()=>{
 const s=U.endSummary({ok:false,error:"Score refusé.",xp:35,result:res});
 assert.equal(s.score,"—");
 assert.equal(s.stats,"");
 assert.equal(s.xp,"+35 XP · Score refusé.");
 assert.equal(U.endSummary({ok:false,xp:35}).xp,"+35 XP · Le serveur n'a pas compté la partie.");
 // a malformed result from the server is not shown either
 assert.equal(U.endSummary({ok:true,result:{score:"x"},bonus:3,xp:35}).score,"—");
});

// ---------------------------------------------------------------- the Front de neige
test("frontBar: shares of the bar, totals in French, the player's camp named",()=>{
 const f=U.frontBar({left:3000,right:1000,closed:false},"left",{score:42,counted:true});
 assert.equal(f.lp,75);assert.equal(f.rp,25);
 assert.equal(f.leftText,`Gauche ${(3000).toLocaleString("fr-FR")}`);
 assert.equal(f.rightText,`Droite ${(1000).toLocaleString("fr-FR")}`);
 assert.equal(f.note,"tes 42 points comptent pour la Gauche");
 assert.equal(U.frontBar({left:0,right:0,closed:false},"right",{}).lp,50);
 assert.equal(U.frontBar({left:0,right:0,closed:false},"right",{}).note,"Chaque partie compte pour ton camp : la Droite.");
 assert.equal(U.frontBar({left:5,right:9,closed:true},"left",{score:3,counted:true}).note,"Le Front de neige est tombé : résultat final.");
 assert.equal(U.frontBar({left:1,right:0,closed:false},"left",{score:1,counted:true}).note,"ton point compte pour la Gauche");
});

test("frontBar: « tes points comptent » only when the server said the game counted (reply front:true)",()=>{
 const F={left:10,right:20,closed:false};
 assert.equal(U.frontBar(F,"right",{score:42}).note,"Chaque partie compte pour ton camp : la Droite.");          // no word from the server
 assert.equal(U.frontBar(F,"right",{score:42,counted:false}).note,"Cette partie ne compte pas dans le Front.");
 assert.equal(U.frontBar(F,"right",{score:0,counted:true}).note,"Chaque partie compte pour ton camp : la Droite.");
 assert.equal(U.frontBar(F,"right",{score:42,counted:"yes"}).note,"Chaque partie compte pour ton camp : la Droite.");
 assert.equal(U.frontBar({...F,closed:true},"right",{score:42,counted:false}).note,"Le Front de neige est tombé : résultat final.");
});

test("frontBar: nothing without a counter (theme off) or with a malformed one",()=>{
 assert.equal(U.frontBar(null,"left"),null);
 assert.equal(U.frontBar(undefined,"left"),null);
 assert.equal(U.frontBar({left:"a",right:1},"left"),null);
 assert.equal(U.frontBar({left:-1,right:1},"left"),null);
});

// ---------------------------------------------------------------- the challenges
test("challengeText: « {from} : {score} points, encore {h} h », minutes in the last hour",()=>{
 const now=1_000_000;
 assert.equal(U.challengeText({from:"Camille",score:58,expires:now+23.5*3600e3},now),"Camille : 58 points, encore 24 h");
 assert.equal(U.challengeText({from:"Camille",score:1,expires:now+3600e3},now),"Camille : 1 point, encore 1 h");
 assert.equal(U.challengeText({from:"Léa",score:0,expires:now+25*60e3},now),"Léa : 0 point, encore 25 min");
 assert.equal(U.challengeText({from:"Léa",score:7,expires:now-5},now),"Léa : 7 points, encore 1 min");
});

test("sentText: open, won, lost, tie, expired, cancelled",()=>{
 const now=0;
 assert.equal(U.sentText({to:"Bob",status:"open",expires:5*3600e3},now),"Défi à Bob : en attente, encore 5 h");
 assert.equal(U.sentText({to:"Bob",status:"done",result:{mine:40,theirs:31,outcome:"win"}},now),"Défi à Bob : gagné, 40 à 31");
 assert.equal(U.sentText({to:"Bob",status:"done",result:{mine:20,theirs:31,outcome:"loss"}},now),"Défi à Bob : perdu, 20 à 31");
 assert.equal(U.sentText({to:"Bob",status:"done",result:{mine:20,theirs:20,outcome:"tie"}},now),"Défi à Bob : égalité, 20 partout");
 assert.equal(U.sentText({to:"Bob",status:"expired"},now),"Défi à Bob : pas relevé à temps");
 assert.equal(U.sentText({to:"Bob",status:"cancelled"},now),"Défi à Bob : annulé");
 assert.equal(U.sentText({to:"Bob",status:"weird"},now),"");
});

test("challengeLists: only well-formed rows, nothing thrown on garbage",()=>{
 const r=U.challengeLists({received:[{id:1,from:"A",score:3,expires:9},null,{id:"x",from:"B"},{id:2,from:5,score:1,expires:1}],sent:[{id:3,to:"C",status:"open",expires:1},"nope"]});
 assert.deepEqual(r.received.map(x=>x.id),[1]);
 assert.deepEqual(r.sent.map(x=>x.id),[3]);
 assert.deepEqual(U.challengeLists(null),{received:[],sent:[]});
 assert.deepEqual(U.challengeLists({received:"x",sent:{}}),{received:[],sent:[]});
});

test("dareList: players of both camps, never oneself, online first, at most `limit`",()=>{
 const opps=[{name:"Zoé",camp:"left",online:false},{name:"Ana",camp:"right",online:true},{name:"Moi",camp:"left",online:true},{name:"Bob",camp:"left",online:true},null,{name:3}];
 const l=U.dareList(opps,"Moi",10);
 assert.deepEqual(l.map(o=>o.name),["Ana","Bob","Zoé"]);
 assert.deepEqual(new Set(l.map(o=>o.camp)),new Set(["left","right"]));
 assert.equal(U.dareList(opps,"Moi",1).length,1);
 assert.deepEqual(U.dareList(undefined,"Moi"),[]);
});

test("dareView: loading, error with a retry, empty, or the players (datalist: all; buttons: the first 12)",()=>{
 assert.deepEqual(U.dareView(null,"","Moi"),{state:"loading",text:"Chargement des joueurs…",names:[],top:[]});
 assert.deepEqual(U.dareView(null,"Serveur injoignable.","Moi"),{state:"error",text:"Serveur injoignable.",names:[],top:[]});
 assert.equal(U.dareView({opponents:[{name:"Moi"}]},"","Moi").state,"empty");
 assert.equal(U.dareView({opponents:"x"},"","Moi").state,"empty");
 const opps=Array.from({length:30},(_,i)=>({name:`J${i}`,camp:i%2?"right":"left",online:i===29}));
 const v=U.dareView({opponents:opps},"","Moi");
 assert.equal(v.state,"list");assert.equal(v.text,"");
 assert.equal(v.names.length,30);assert.equal(v.top.length,12);
 assert.equal(v.top[0].name,"J29");                 // online first
 // a later failure does not hide a list already loaded (duelErr with duelData)
 assert.equal(U.dareView({opponents:opps},"Erreur du serveur.","Moi").state,"list");
});
