// Duel rules: the seeded debate the browser and the server both deal, the replay that scores it, and the outcomes.
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";

const {H,DUEL,DEBATE,MINI}=R;
R.setTimeZone("Europe/Paris");
const NOON=Date.UTC(2026,0,5,11,0);               // 12:00 in Paris: awake
const game=(camp="left")=>{const S=R.newGame(camp,NOON);S.lvl=10;S.xp=R.xpFloor(10)+5;S.best=10;return S;};
// The picks a perfect player of this camp makes, one every "gap" ms from "from".
function perfect(seed,camp,n,gap=300,from=0){
 const rounds=R.debateRounds(R.seeded(seed),n);
 return rounds.map((r,k)=>[r.order.indexOf(R.ANSWER_KINDS.indexOf(camp)),from+k*gap]);
}

test("D1 the same seed deals the same debate; another seed deals another one",()=>{
 const a=R.debateRounds(R.seeded(42)),b=R.debateRounds(R.seeded(42)),c=R.debateRounds(R.seeded(43));
 assert.deepEqual(a,b);
 assert.notDeepEqual(a,c);
 assert.equal(a.length,DUEL.maxPicks+1);
});

test("D2 a deal shows every question once before any comes back, never twice running, answers in a permutation",()=>{
 const n=R.QUESTIONS.length,rounds=R.debateRounds(R.seeded(7),3*n);
 assert.equal(new Set(rounds.slice(0,n).map(r=>r.i)).size,n);
 for(let k=1;k<rounds.length;k++)assert.notEqual(rounds[k].i,rounds[k-1].i);
 for(const r of rounds)assert.deepEqual([...r.order].sort(),[0,1,2]);
});

test("D3 seeded() is uniform enough and stays in [0,1)",()=>{
 const rnd=R.seeded(123);let sum=0;
 for(let i=0;i<10000;i++){const v=rnd();assert.ok(v>=0&&v<1);sum+=v;}
 assert.ok(Math.abs(sum/10000-0.5)<0.02);
});

test("D4 a replay scores the camp's own line, a wrong answer costs a second",()=>{
 for(const camp of ["left","right"]){
  const picks=perfect(9,camp,10);
  assert.deepEqual(R.replayDebate(9,camp,picks),{points:10,errors:0,last:2700});
  // The same picks seen from the other camp are all wrong.
  const other=R.replayDebate(9,camp==="left"?"right":"left",picks);
  assert.equal(other.points,0);assert.equal(other.errors,10);
 }
});

test("D5 picks after the final whistle do not count, and the penalties shorten the game",()=>{
 const picks=perfect(5,"left",60,300);
 const r=R.replayDebate(5,"left",picks);
 assert.equal(r.points,Math.ceil(MINI.debate.ms/300));     // 0..14700 ms
 const wrong=R.debateRounds(R.seeded(5),3).map((x,k)=>[x.order.indexOf(2),k*300]);   // three decoys: −3 s
 const late=[...wrong,...perfect(5,"left",60,300,900).slice(3)];
 const r2=R.replayDebate(5,"left",late);
 assert.equal(r2.errors,3);
 assert.ok(r2.last<MINI.debate.ms-3*DEBATE.penalty);
});

test("D6 a replay refuses what the screen cannot produce",()=>{
 const ok=perfect(1,"left",3);
 assert.ok(R.replayDebate(1,"left",ok));
 for(const bad of [null,"x",{},[[0]],[[3,0]],[[-1,0]],[[0.5,0]],[[0,-5]],[[0,1.5]],[[0,0],[1,100]],
  Array.from({length:DUEL.maxPicks+1},(_,k)=>[0,k*300])])
  assert.equal(R.replayDebate(1,"left",bad),null,JSON.stringify(bad)?.slice(0,40));
 assert.deepEqual(R.replayDebate(1,"left",[]),{points:0,errors:0,last:0});
});

test("D7 duelBlock: asleep, napping and too low a level cannot duel",()=>{
 const S=game();assert.equal(R.duelBlock(S),"");
 S.sleeping=true;assert.match(R.duelBlock(S),/sieste/);S.sleeping=false;
 S.lvl=DUEL.minLevel-1;assert.match(R.duelBlock(S),/niveau/);
 const N=game();N.vclock=Date.UTC(2026,0,5,2,0);assert.match(R.duelBlock(N),/dort/);
});

test("D8 a win pays XP, moral and energy; an unpaid win pays nothing at all",()=>{
 const S=game();S.moral=50;S.energy=50;const xp=S.xp;
 assert.equal(R.duelApply(S,"win",{vs:"Bob",mine:21,theirs:17}),true);
 assert.equal(S.xp,xp+DUEL.win.xp);assert.equal(S.moral,60);assert.equal(S.energy,55);
 assert.equal(S.journal[0].k,"duel");assert.match(S.journal[0].text,/gagné contre Bob.*21 à 17.*\+40 XP/);
 const U=game();U.moral=50;U.energy=50;const ux=U.xp;R.duelApply(U,"win",{vs:"Bob",mine:3,theirs:1,paid:false});
 assert.equal(U.xp,ux);assert.equal(U.moral,50);assert.equal(U.energy,50);assert.doesNotMatch(U.journal[0].text,/XP/);
 assert.match(U.journal[0].text,/plus de gain aujourd'hui, rien ne bouge/);
});

test("D9 a loss never costs a level nor pushes a gauge under the floor",()=>{
 const S=game();S.xp=R.xpFloor(S.lvl)+5;S.moral=30;S.energy=20;
 R.duelApply(S,"loss",{vs:"Bob",mine:4,theirs:9});
 assert.equal(S.lvl,10);assert.equal(S.xp,R.xpFloor(10));
 assert.equal(S.moral,DUEL.floor);assert.equal(S.energy,20);           // already under the floor: untouched
 assert.match(S.journal[0].text,/perdu.*−5 XP, moral −5/);
 const T=game();T.moral=80;T.energy=80;R.duelApply(T,"loss",{vs:"Bob"});
 assert.equal(T.moral,70);assert.equal(T.energy,75);
});

test("D10 tie and chicken raise the moral; an unknown outcome changes nothing",()=>{
 const S=game();S.moral=50;
 R.duelApply(S,"tie",{vs:"Bob",mine:12,theirs:12});assert.equal(S.moral,55);assert.match(S.journal[0].text,/12 partout/);
 R.duelApply(S,"chicken",{vs:"Bob"});assert.equal(S.moral,58);assert.match(S.journal[0].text,/Bob a esquivé/);
 const jn=S.jn;assert.equal(R.duelApply(S,"bogus"),false);assert.equal(S.jn,jn);
 const F=game();F.moral=100;R.duelApply(F,"chicken",{vs:"Bob"});assert.match(F.journal[0].text,/rien ne bouge/);
});

test("D11 the debate rules the duel replays stay those of the game",()=>{
 assert.equal(MINI.debate.ms,15000);
 assert.ok(DUEL.minGap<=DEBATE.flash);
 assert.ok(DUEL.maxPicks>=Math.ceil(MINI.debate.ms/DEBATE.flash));
 assert.ok(H>0);
});

test("an account can duel 12 h after signing up (anti-alt delay)",()=>{
 assert.equal(R.DUEL.minAgeMs,12*R.H);
});
