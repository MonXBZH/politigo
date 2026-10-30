// Tests for the browser side of the duels: the timed debate of web/minigames.mjs, dealt from a seed, must record
// picks that R.replayDebate scores exactly like the screen did (node --test, no server needed).
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

const make=(seed,camp="left")=>M.createMini("debate",{p:{},camp,ctx:fakeCtx(),scale:()=>1,drawCand:()=>{},now:0,seed});
// The answers on screen, as kinds, and the question index: what the player sees.
const shown=g=>({i:g.q.i,kinds:g.q.answers.map(a=>a.k),texts:g.q.answers.map(a=>a.t)});
// Plays a whole game with a seeded "player": fractional clock steps, picks too fast, picks after the whistle.
function playGame(g,rand,{skill=.7,frame=16.7}={}){
 let now=0;
 while(!g.endT&&now<40000){
  now+=frame*(0.5+rand());g.step(now,frame/1000);
  if(rand()<.3){
   const right=g.q.answers.findIndex(a=>a.k===g.camp),n=rand()<skill?right:Math.floor(rand()*3);
   g.answer(n,now);
  }
 }
 // A few late taps: they must change nothing.
 for(let k=0;k<5;k++){now+=300;g.answer(0,now);}
 return now;
}

test("QUESTIONS is the rules' list, kept for older imports",()=>{
 assert.equal(M.QUESTIONS,R.QUESTIONS);
});

test("same seed, same rounds; the answers follow debateRounds' order",()=>{
 const rounds=R.debateRounds(R.seeded(12345));
 const a=make(12345),b=make(12345);
 for(let k=0;k<30;k++){
  assert.equal(a.picks.length,k);
  const sa=shown(a),sb=shown(b),{i,order}=rounds[k];
  assert.deepEqual(sa,sb,`round ${k}`);
  assert.equal(sa.i,i);
  assert.deepEqual(sa.kinds,order.map(j=>R.ANSWER_KINDS[j]));
  assert.deepEqual(sa.texts,order.map(j=>R.QUESTIONS[i][1+j]));
  const t=a.t0+k*400,n=a.q.answers.findIndex(x=>x.k==="left");a.answer(n,t);b.answer(n,t);   // no penalty: 30 rounds fit
 }
 const c=make(54321);
 assert.notDeepEqual([shown(c).i,shown(c).kinds],[shown(make(12345)).i,shown(make(12345)).kinds],"another seed deals another game (here)");
});

test("the replay of the recorded picks gives the score shown, for many seeded games",()=>{
 for(let s=1;s<=300;s++){
  const seed=(s*2654435761)>>>0,camp=s%2?"left":"right",g=make(seed,camp),rand=R.seeded(s);
  playGame(g,rand,{skill:[.2,.6,.95][s%3],frame:[8.3,16.7,33.4][s%3]});
  const r=R.replayDebate(seed,camp,g.picks);
  assert.ok(r,`seed ${seed}: replay accepted`);
  assert.equal(r.points,g.score(),`seed ${seed}: points`);
  assert.equal(r.errors,g.errors,`seed ${seed}: errors`);
  assert.ok(g.picks.length<=R.DUEL.maxPicks);
  for(let k=0;k<g.picks.length;k++){
   const [n,t]=g.picks[k];
   assert.ok(Number.isInteger(n)&&n>=0&&n<=2&&Number.isInteger(t)&&t>=0);
   if(k)assert.ok(t-g.picks[k-1][1]>=R.DUEL.minGap,`seed ${seed}: gap at ${k}`);
  }
 }
});

test("a pick on the final whistle, rounded, is judged as the replay judges it",()=>{
 const ms=R.MINI.debate.ms;
 // 14999.6 ms rounds to 15000: the replay would not count it, so the screen must not either.
 const g=make(99);g.answer(0,g.t0+ms-0.4);
 assert.equal(g.picks.length,0);assert.ok(g.endT,"the whistle went");
 const h=make(99);h.answer(0,h.t0+ms-0.6);
 assert.deepEqual(h.picks,[[0,ms-1]]);
 assert.equal(R.replayDebate(99,"left",h.picks).points,h.score());
 // Penalties shorten the game the same way.
 const p=make(7),wrong=()=>p.q.answers.findIndex(a=>a.k!=="left");
 p.answer(wrong(),p.t0+100);p.answer(wrong(),p.t0+400);
 p.answer(0,p.t0+ms-2000);
 assert.equal(p.picks.length,2,"2 s of penalties: 13 s was the end");
 assert.deepEqual(R.replayDebate(7,"left",p.picks),{points:0,errors:2,last:400});
});

test("picks closer than the flash are ignored, and none before the countdown ends",()=>{
 const g=make(5);
 g.answer(0,g.t0-1);assert.equal(g.picks.length,0,"countdown");
 g.answer(0,g.t0+10);g.answer(1,g.t0+10+R.DEBATE.flash-1);
 assert.equal(g.picks.length,1);
 g.answer(1,g.t0+10+R.DEBATE.flash);assert.equal(g.picks.length,2);
 assert.ok(R.replayDebate(5,"left",g.picks));
});

test("the game stops at DUEL.maxPicks",()=>{
 // Only reachable with a forged clock; the cap keeps a replayable list anyway.
 const ms=R.MINI.debate.ms,step=R.DEBATE.flash;
 R.MINI.debate.ms=1e9;
 let g;try{g=make(3);}finally{R.MINI.debate.ms=ms;}
 const right=()=>g.q.answers.findIndex(a=>a.k==="left");
 for(let k=0;k<R.DUEL.maxPicks+10;k++)g.answer(right(),g.t0+k*step);
 assert.equal(g.picks.length,R.DUEL.maxPicks);assert.ok(g.endT);
});

test("a solo debate deals from Math.random and still records its picks",()=>{
 const g=M.createMini("debate",{p:{},camp:"right",ctx:fakeCtx(),scale:()=>1,drawCand:()=>{},now:0});
 assert.equal(g.seed,null);
 playGame(g,R.seeded(1));
 assert.ok(g.picks.length>0);assert.ok(g.score()>=0);
});

test("the result panel promises XP in a solo game, not in a duel",()=>{
 for(const [seed,xp] of [[undefined,true],[42,false]]){
  const g=M.createMini("debate",{p:{},camp:"left",ctx:fakeCtx(),scale:()=>1,drawCand:()=>{},now:0,seed});
  g.abort(g.t0+1000);
  texts.length=0;g.draw(g.endT+600);
  const all=texts.join(" | ");
  assert.equal(/XP d'éloquence/.test(all),xp,all);
  assert.equal(/arbitre/.test(all),!xp,all);
 }
});
