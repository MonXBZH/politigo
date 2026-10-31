// Tests for the browser side of the Débat chrono (solo and duel): web/minigames.mjs plays it against the server's
// referee (POST /api/debate), here a stand-in built on the rules' own engine (R.debateReveal / debateAnswer), on the
// game's clock. The game never holds a seed, a deck or which answer is right (node --test, no server needed).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";

// minigames.mjs draws on canvases: a stand-in 2D context that accepts every call and remembers the texts drawn.
const texts=[];
const fakeCtx=()=>new Proxy({},{
 get:(t,k)=>k in t?t[k]:k==="measureText"?s=>({width:String(s).length*7}):k==="fillText"||k==="strokeText"?s=>texts.push(String(s))
  :typeof k==="string"&&k.startsWith("create")?()=>({addColorStop(){}}):()=>{},
 set:(t,k,v)=>{t[k]=v;return true;}
});
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>fakeCtx()})};
const M=await import("../web/minigames.mjs");
const tick=()=>new Promise(ok=>setImmediate(ok));

// The referee, as the server runs it: one turn, the same reply shape as POST /api/debate. clock() is the game's.
function referee(seed,camp,clock,{result=st=>({score:R.debateResult(st).points,bonus:R.debateResult(st).points}),lag=0}={}){
 const st=R.debateNew(seed,camp,{now:0}),log=[];
 const ask=async body=>{
  log.push(body);await tick();const now=clock()+lag;
  let a={};
  if("choice" in body){a=R.debateAnswer(st,body.choice,now,body.idx);if(!a)return {ok:false,status:400,error:"Réponse invalide."};}
  const done=R.debateDone(st,now),q=done?null:R.debateReveal(st,now);
  return {ok:true,status:200,q,points:st.points,errors:st.errors,leftMs:R.debateLeft(st,now),done,...(a.right!==undefined?{right:a.right}:{}),
   ...(a.miss?{miss:a.miss}:{}),...(a.ignored?{ignored:true}:{}),...(done?{result:result(st)}:{})};
 };
 return {st,ask,log};
}
const make=(o={})=>M.createMini("debate",{p:{},camp:"left",ctx:fakeCtx(),scale:()=>1,drawCand:()=>{},now:0,...o});
// Runs the game frame by frame; answer(g,now) may tap. Each frame lets the pending reply land.
async function drive(g,{frame=16.7,answer=()=>{},until=40000}={}){
 let now=g.now;
 while(!g.endT&&now<until){now+=frame;g.step(now,frame/1000);answer(g,now);await tick();await tick();}
 return now;
}
const rightIdx=(st,camp)=>R.debateRounds(R.seeded(st.seed),st.idx+1,st.count)[st.idx].order.indexOf(R.ANSWER_KINDS.indexOf(camp));

test("QUESTIONS is the rules' list, kept for older imports",()=>{
 assert.equal(M.QUESTIONS,R.QUESTIONS);
});

test("the countdown first, then the first question asked for; nothing about the deck on the client",async()=>{
 let clock=0;const ref=referee(42,"left",()=>clock),g=make({ask:ref.ask});
 for(const k of ["seed","picks","rounds"])assert.ok(g[k]==null||k==="seed",k);
 assert.equal(g.seed,null);
 clock=R.DEBATE.intro-1;g.step(clock,.016);await tick();assert.equal(ref.log.length,0,"no request during the countdown");
 g.answer(0,clock);assert.equal(ref.log.length,0,"no answer during the countdown");
 clock=R.DEBATE.intro;g.step(clock,.016);
 assert.deepEqual(ref.log,[{}]);
 await tick();await tick();
 assert.ok(g.q&&typeof g.q.text==="string"&&g.q.answers.length===3);
 assert.ok(g.q.answers.every(a=>typeof a==="string"),"labels only, no kinds");
 assert.equal(ref.st.t0,R.DEBATE.intro,"the server's clock starts with the first question");
});

test("answers go by index with the question's idx, one at a time; the score is the referee's",async()=>{
 let clock=0;const ref=referee(7,"left",()=>clock),g=make({ask:ref.ask});
 await drive(g,{until:R.DEBATE.intro+50,answer:(g,now)=>{clock=now;}});await tick();await tick();clock=g.now;
 // Right answers, 700 ms apart (a human pace): each is counted.
 for(let k=0;k<5;k++){
  clock+=700;g.step(clock,.016);const n=rightIdx(ref.st,"left");
  g.answer(n,clock);g.answer((n+1)%3,clock+1);   // a second tap while the verdict is on its way is dropped
  await tick();await tick();
 }
 assert.equal(ref.st.points,5);assert.equal(g.points,5);assert.equal(g.score(),5);
 const answers=ref.log.filter(b=>"choice" in b);
 assert.equal(answers.length,5);assert.deepEqual(answers.map(b=>b.idx),[0,1,2,3,4]);
 // A wrong one costs the second on the clock shown too.
 clock+=700;g.step(clock,.016);const left0=g.endAt;g.answer((rightIdx(ref.st,"left")+1)%3,clock);await tick();await tick();
 assert.equal(g.errors,1);assert.equal(g.flashOk,false);assert.ok(g.endAt<=left0-R.DEBATE.penalty+1);
});

test("the clock up on screen asks for the verdict; the end screen shows the referee's result",async()=>{
 let clock=0;const ref=referee(9,"right",()=>clock,{result:()=>({score:3,bonus:3,game:"debate"})}),g=make({ask:ref.ask,camp:"right"});
 const end=await drive(g,{answer:(g,now)=>{clock=now;}});
 assert.ok(g.endT,"over");assert.ok(end>=R.DEBATE.intro+R.MINI.debate.ms,"not before the 15 s");
 assert.deepEqual(g.result,{score:3,bonus:3,game:"debate"});
 texts.length=0;g.draw(g.endT+600);
 assert.match(texts.join(" | "),/\+3 XP d'éloquence/);
});

test("a duel's end screen tells the outcome; a solo one the XP; a game given up waits for the referee",async()=>{
 for(const [duel,res,re] of [[true,{res:"win",mine:9,theirs:4},/Victoire 9 à 4/],[true,{res:"loss",mine:2,theirs:4},/Défaite 2 à 4/],
  [true,{res:"tie",mine:4,theirs:4},/Match nul, 4 partout/],[true,{res:null,mine:5,score:5},/24 h/],[false,{score:2,bonus:2},/\+2 XP/]]){
  let clock=0;const ref=referee(3,"left",()=>clock,{result:()=>res}),g=make({ask:ref.ask,duel});
  await drive(g,{answer:(g,now)=>{clock=now;}});
  texts.length=0;g.draw(g.endT+600);const all=texts.join(" | ");
  assert.match(all,re,all);assert.equal(/Fin du duel/.test(all),duel);
 }
 const g=make({ask:()=>new Promise(()=>{})});g.abort(2000);
 texts.length=0;g.draw(g.endT+600);assert.match(texts.join(" | "),/fin du temps/);
});

test("a refused request ends the game (the referee closed it); answers too fast are ignored and said",async()=>{
 const g=make({ask:async()=>({ok:false,status:422,error:"Aucune partie en cours."})});
 await drive(g,{until:3000});assert.ok(g.endT);assert.equal(g.failed,true);
 texts.length=0;g.draw(g.endT+600);assert.match(texts.join(" | "),/close par l'arbitre/);
 let clock=0;const ref=referee(5,"left",()=>clock),h=make({ask:ref.ask});
 await drive(h,{until:R.DEBATE.intro+20,answer:(g,now)=>{clock=now;}});await tick();await tick();clock=h.now;
 clock+=300;h.step(clock,.016);h.answer(rightIdx(ref.st,"left"),clock);await tick();await tick();
 assert.equal(ref.st.fast,1);assert.equal(h.points,0);assert.equal(h.q.idx,0,"same question");
});

test("same seed, same game for both duellists: the server deals, the clients only show",async()=>{
 const shown=[];
 for(let k=0;k<2;k++){
  let clock=0;const ref=referee(12345,"left",()=>clock),g=make({ask:ref.ask,duel:true}),qs=[];
  await drive(g,{answer:(g,now)=>{clock=now;if(g.q&&qs.at(-1)!==g.q.text)qs.push(g.q.text);if(!g.wait&&now%800<17)g.answer(rightIdx(ref.st,"left"),now);}});
  shown.push(qs);
 }
 assert.ok(shown[0].length>3);assert.deepEqual(shown[0],shown[1]);
});

// Halloween: the costume changes the drawings only; the Manif games play the same from the same seed.
const makeKey=(key,o={})=>M.createMini(key,{p:{},camp:"left",ctx:fakeCtx(),scale:()=>1,drawCand:()=>{},now:0,...o});
test("Halloween: the Manif games play the same in costume, and every drawing runs",()=>{
 for(const key of ["cortege","epervier"]){
  const run=season=>{const g=makeKey(key,{season,seed:7,camp:key==="cortege"?"left":"right"});g.target=[300,300];let now=0;
   for(let f=0;f<2400;f++){now+=16.7;g.step(now,.0167);if(f%7===0)g.target=[150+(f*13)%170,200+(f*29)%200];if(f%300===0)g.special?.(now);g.draw(now);}
   g.draw(now+1000);return JSON.stringify([g.score(),g.hp,g.endT,g.x,g.y,g.rand()]);};
  assert.equal(run("halloween"),run(""),key);
 }
 const d=makeKey("debate",{season:"halloween",ask:()=>new Promise(()=>{})});d.draw(0);d.draw(5000);d.abort(6000);d.draw(7000);
});
test("the Manif games are dealt by the server's seed: same seed, same game; Math.random is never used",()=>{
 for(const key of ["cortege","epervier"]){
  const run=seed=>{const g=makeKey(key,{seed});g.target=[300,300];let now=0;
   for(let f=0;f<1800;f++){now+=16.7;g.step(now,.0167);if(f%11===0)g.target=[150+(f*17)%170,200+(f*23)%200];}
   return JSON.stringify([g.score(),g.hp,g.x,g.y,g.items?.length,g.prot?.length,g.wave]);};
  const r0=Math.random;Math.random=()=>{throw new Error("Math.random in a seeded game");};
  try{assert.equal(run(11),run(11),key);assert.notEqual(run(11),run(12),key);}finally{Math.random=r0;}
 }
});
