// Anti-cheat rules (1.5.0): the debate's referee (debateNew/Reveal/Answer/Done/Result/Finish), the seeded games,
// the time windows and hard caps of the browser games, the audit, and the duel payment caps (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";

const {H,MINI,DEBATE,DUEL,PONG_RULES}=R;
R.setTimeZone("Europe/Paris");
const MIDNIGHT=Date.UTC(2026,0,4,23,0);
const at=h=>MIDNIGHT+h*H;
const noRandom=()=>0.99;
const game=(camp="left")=>R.newGame(camp,at(10));
// The answer index of this camp's line for the question on screen.
const right=(st,camp=st.camp)=>R.debateRounds(R.seeded(st.seed),st.idx+1,st.count)[st.idx].order.indexOf(R.ANSWER_KINDS.indexOf(camp));
const wrong=st=>(right(st)+1)%3;
// Plays a turn: every answer `gap(k)` ms after its question, right unless miss(k). Returns the clock at the end.
function playTurn(st,{t=0,gap=()=>900,miss=()=>false}={}){
 R.debateReveal(st,t);
 for(let k=0;k<200;k++){
  t+=gap(k);const a=R.debateAnswer(st,miss(k)?wrong(st):right(st),t);
  if(a.done)break;R.debateReveal(st,t);
 }
 return t;
}

test("E1 debateNew: a fresh turn, the deck's size checked",()=>{
 assert.deepEqual(R.debateNew(42,"left",{now:5,id:"ab"}),{seed:42,camp:"left",count:R.QUESTIONS.length,id:"ab",created:5,
  idx:0,t0:null,lost:0,points:0,errors:0,shownAt:null,gaps:[],fast:0});
 assert.equal(R.debateNew(1,"left",{count:R.debateCount("halloween")}).count,R.QUESTIONS.length+R.HALLOWEEN.questions.length);
 for(const count of [0,-1,1.5,"9",999,null])assert.equal(R.debateNew(1,"left",{count}).count,R.QUESTIONS.length,String(count));
 assert.equal(R.debateCount(""),R.QUESTIONS.length);
 assert.equal(JSON.stringify(JSON.parse(JSON.stringify(R.debateNew(3,"right")))),JSON.stringify(R.debateNew(3,"right")),"plain JSON");
});

test("E2 debateReveal: starts the clock once, shows labels only, keeps the same question until it is answered",()=>{
 const st=R.debateNew(7,"left");
 assert.equal(R.debateLeft(st,123),MINI.debate.ms,"15 s before the first question");
 const q=R.debateReveal(st,1000);
 assert.equal(st.t0,1000);assert.equal(st.shownAt,1000);
 assert.deepEqual(Object.keys(q).sort(),["answers","idx","leftMs","text"]);
 assert.equal(q.idx,0);assert.equal(q.leftMs,MINI.debate.ms);
 const {i,order}=R.debateRounds(R.seeded(7),1)[0];
 assert.equal(q.text,R.QUESTIONS[i][0]);assert.deepEqual(q.answers,order.map(j=>R.QUESTIONS[i][1+j]));
 assert.ok(q.answers.every(a=>typeof a==="string"));
 const again=R.debateReveal(st,1500);
 assert.equal(st.shownAt,1000,"asking again never resets the reaction clock");assert.equal(st.t0,1000);
 assert.equal(again.text,q.text);assert.equal(again.leftMs,MINI.debate.ms-500);
 assert.equal(R.debateReveal(st,1000+MINI.debate.ms),null,"over");
});

test("E3 seeded determinism: the same seed deals the same questions, another seed another game",()=>{
 const deal=seed=>{const st=R.debateNew(seed,"left"),out=[];let t=0;R.debateReveal(st,t);
  for(let k=0;k<12;k++){out.push(R.debateReveal(st,t).text);t+=700;R.debateAnswer(st,right(st),t);}return out;};
 assert.deepEqual(deal(99),deal(99));assert.notDeepEqual(deal(99),deal(100));
 // The deck in costume: the event's questions come into play.
 const hq=new Set(R.HALLOWEEN.questions.map(q=>q[0]));let seen=false;
 for(let s=1;s<30&&!seen;s++){const st=R.debateNew(s,"left",{count:R.debateCount("halloween")});let t=0;
  for(let k=0;k<20;k++){if(hq.has(R.debateReveal(st,t).text))seen=true;t+=700;R.debateAnswer(st,right(st),t);if(R.debateDone(st,t))break;}}
 assert.ok(seen);
});

test("E4 debateAnswer: right and wrong, the penalty, the reaction times, the next question",()=>{
 const st=R.debateNew(5,"right");R.debateReveal(st,0);
 let a=R.debateAnswer(st,right(st),800);
 assert.deepEqual(a,{right:true,points:1,errors:0,leftMs:MINI.debate.ms-800,done:false});
 assert.equal(st.idx,1);assert.equal(st.shownAt,null);assert.deepEqual(st.gaps,[800]);
 assert.equal(R.debateAnswer(st,0,900),null,"no question on screen: nothing to answer");
 R.debateReveal(st,800);
 a=R.debateAnswer(st,wrong(st),1700);
 assert.equal(a.right,false);assert.ok(a.miss==="decoy"||a.miss==="opponent");
 assert.equal(a.errors,1);assert.equal(st.lost,DEBATE.penalty);assert.equal(a.leftMs,MINI.debate.ms-1700-DEBATE.penalty);
 assert.deepEqual(st.gaps,[800,900]);
 // The miss says which: the decoy, or the other camp's line.
 const s2=R.debateNew(5,"left");R.debateReveal(s2,0);const ord=R.debateRounds(R.seeded(5),1)[0].order;
 assert.equal(R.debateAnswer(s2,ord.indexOf(2),700).miss,"decoy");
 const s3=R.debateNew(5,"left");R.debateReveal(s3,0);
 assert.equal(R.debateAnswer(s3,ord.indexOf(1),700).miss,"opponent");
 for(const c of [3,-1,1.5,"0",null,undefined,NaN])assert.equal(R.debateAnswer(R.debateNew(1,"left"),c,0),null,String(c));
});

test("E5 the reaction floor: an answer under minReact is ignored, not counted, remembered",()=>{
 const st=R.debateNew(8,"left");R.debateReveal(st,0);
 const a=R.debateAnswer(st,right(st),DEBATE.minReact-1);
 assert.deepEqual(a,{right:null,ignored:true,points:0,errors:0,leftMs:MINI.debate.ms-DEBATE.minReact+1,done:false});
 assert.equal(st.idx,0);assert.equal(st.fast,1);assert.deepEqual(st.gaps,[]);
 R.debateReveal(st,DEBATE.minReact-1);
 assert.equal(R.debateAnswer(st,right(st),DEBATE.minReact).right,true,"the floor itself counts (clock not reset by the re-ask)");
 assert.deepEqual(R.debateResult(st).flags,["trop_rapide"]);
 // A script hammering answers scores no faster than one per minReact, and is flagged.
 const bot=R.debateNew(8,"left");let t=0;R.debateReveal(bot,t);
 for(let k=0;k<200&&!R.debateDone(bot,t);k++){t+=50;R.debateAnswer(bot,right(bot),t);R.debateReveal(bot,t);}
 assert.ok(bot.points<=Math.ceil(MINI.debate.ms/DEBATE.minReact));assert.ok(bot.fast>100);assert.ok(R.debateResult(bot).flags.includes("trop_rapide"));
});

test("E6 idx: a retried answer for an older question changes nothing",()=>{
 const st=R.debateNew(4,"left");R.debateReveal(st,0);
 assert.equal(R.debateAnswer(st,right(st),700,0).right,true);R.debateReveal(st,700);
 const a=R.debateAnswer(st,right(st),1500,0);
 assert.equal(a.stale,true);assert.equal(a.right,null);assert.equal(st.idx,1);assert.equal(st.points,1);
 assert.equal(R.debateAnswer(st,right(st),1500,1).right,true,"the current idx counts");
 assert.equal(R.debateAnswer(st,0,1600,null),null,"null idx: no check, but nothing on screen");
});

test("E7 debateDone: the 15 s minus the penalties, or the deck's end; late answers do not count",()=>{
 const st=R.debateNew(2,"left");
 assert.equal(R.debateDone(st,1e9),false,"not started: not over");
 R.debateReveal(st,0);
 assert.equal(R.debateDone(st,MINI.debate.ms-1),false);assert.equal(R.debateDone(st,MINI.debate.ms),true);
 const a=R.debateAnswer(st,right(st),MINI.debate.ms);
 assert.deepEqual(a,{right:null,late:true,points:0,errors:0,leftMs:0,done:true});
 const w=R.debateNew(2,"left");R.debateReveal(w,0);R.debateAnswer(w,wrong(w),700);R.debateReveal(w,700);R.debateAnswer(w,wrong(w),1400);
 assert.equal(R.debateDone(w,MINI.debate.ms-2*DEBATE.penalty-1),false);assert.equal(R.debateDone(w,MINI.debate.ms-2*DEBATE.penalty),true);
 const d=R.debateNew(2,"left");d.idx=DUEL.maxPicks;d.t0=0;assert.equal(R.debateDone(d,1),true,"deck's end");
});

test("E8 debateResult: the cap and the flags",()=>{
 // A human: irregular answers, a few errors.
 const h=R.debateNew(11,"left");playTurn(h,{gap:k=>[900,1400,1100,2000,800,1700][k%6],miss:k=>k%5===4});
 assert.deepEqual(R.debateResult(h),{points:h.points,errors:h.errors,flags:[]});assert.ok(h.points>=5&&h.errors>=1);
 // A metronome without a single error, faster than anyone: every flag but the cap.
 const b=R.debateNew(11,"left");playTurn(b,{gap:()=>650});
 const rb=R.debateResult(b);
 assert.equal(rb.points,Math.min(b.points,DEBATE.maxPoints));assert.deepEqual(rb.flags,["zero_erreur","rythme_regulier","reflexe","plafond"]);
 assert.ok(b.points>DEBATE.maxPoints,"23 answers in 15 s");assert.equal(rb.points,DEBATE.maxPoints);
 // The thresholds themselves.
 const z=R.debateNew(1,"left");Object.assign(z,{points:DEBATE.zeroErrors,errors:0,gaps:[1000,1500,900]});
 assert.deepEqual(R.debateResult(z).flags,["zero_erreur"]);
 z.points=DEBATE.zeroErrors-1;assert.deepEqual(R.debateResult(z).flags,[]);
 // A human-looking rhythm (varied, one miss) still too quick for anyone: the median gives it away.
 const q=R.debateNew(1,"left");Object.assign(q,{points:14,errors:1,gaps:Array.from({length:DEBATE.reflexMin},(_,k)=>k%3===2?1100:600+k*25)});
 assert.deepEqual(R.debateResult(q).flags,["reflexe"]);
 q.gaps=q.gaps.slice(1);assert.deepEqual(R.debateResult(q).flags,[],"fewer answers than reflexMin: no verdict");
 q.gaps=Array.from({length:DEBATE.reflexMin},(_,k)=>DEBATE.reflexMs+k*90);assert.deepEqual(R.debateResult(q).flags,[]);
 const r=R.debateNew(1,"left");Object.assign(r,{points:DEBATE.regularPoints,errors:3,gaps:Array(DEBATE.regularMin).fill(0).map((_,k)=>1000+(k%2?100:-100))});
 assert.deepEqual(R.debateResult(r).flags,["rythme_regulier"],"CV 0.1");
 r.points=DEBATE.regularPoints-1;assert.deepEqual(R.debateResult(r).flags,[],"a steady hand scoring little: no flag");r.points=DEBATE.regularPoints;
 r.gaps=r.gaps.map((g,k)=>1000+(k%2?300:-300));assert.deepEqual(R.debateResult(r).flags,[],"CV 0.3: a human");
 r.gaps=Array(DEBATE.regularMin-1).fill(1000);assert.deepEqual(R.debateResult(r).flags,[],"too few answers to tell");
 const c=R.debateNew(1,"left");Object.assign(c,{points:DEBATE.maxPoints+1,errors:2});
 assert.deepEqual(R.debateResult(c),{points:DEBATE.maxPoints,errors:2,flags:["plafond"]});
});

test("E9 a human pace stays playable: 1 s answers, a few errors, about a dozen points, no flag",()=>{
 const st=R.debateNew(21,"left");playTurn(st,{gap:k=>900+((k*397)%700),miss:k=>k%4===3});
 const r=R.debateResult(st);assert.deepEqual(r.flags,[]);assert.ok(r.points>=7&&r.points<=14,String(r.points));
});

test("E10 debateFinish: pays the referee's score once, for the game S.mini opened",()=>{
 const S=game(),s=R.act(S,{type:"debate"},{now:at(10),random:noRandom});
 const st=s.turn;R.debateReveal(st,at(10)+DEBATE.intro);
 let t=at(10)+DEBATE.intro;for(let k=0;k<6;k++){t+=1000+k*130;R.debateAnswer(st,k===2?wrong(st):right(st),t);R.debateReveal(st,t);}
 const xp0=S.xp,end=at(10)+DEBATE.intro+MINI.debate.ms;
 const r=R.debateFinish(S,st,{now:end,random:noRandom});
 assert.ok(r.ok);assert.deepEqual({...r},{ok:true,bonus:5,game:"debate",score:5,errors:1});
 assert.deepEqual(r.audit,{game:"debate",score:5,secs:16.3,errors:1,flags:[]});assert.ok(!Object.keys(r).includes("audit"));
 assert.equal(S.xp-xp0,5);assert.equal(S.mini,null);
 assert.equal(S.journal[0].text,"Débat chrono : 5 arguments dans la ligne, bonus d'éloquence +5 XP.");
 assert.deepEqual(S.journal[0].d,{game:"debate",score:5,bonus:5,great:false});
 assert.equal(R.debateFinish(S,st,{now:end+1}).error,"Aucune partie en cours.","once");
 // Another game's turn, or no game: refused, nothing paid.
 const T=game();R.act(T,{type:"debate"},{now:at(10),random:noRandom});
 assert.equal(R.debateFinish(T,{...st,id:"autre"},{now:end}).ok,false);assert.ok(T.mini,"left open");
 assert.equal(R.debateFinish(T,null,{now:end}).ok,false);
 // A flagged game is paid (capped) but never announced.
 const B=game(),bs=R.act(B,{type:"debate"},{now:at(10),random:noRandom}).turn;playTurn(bs,{t:at(10)+DEBATE.intro,gap:()=>650});
 const rb=R.debateFinish(B,bs,{now:end});assert.equal(rb.bonus,MINI.debate.bonusCap);assert.equal(B.journal[0].d.great,false);
 assert.deepEqual(rb.audit.flags,["zero_erreur","rythme_regulier","reflexe","plafond"]);
 // A clean great game is announced.
 const G=game(),gs=R.act(G,{type:"debate"},{now:at(10),random:noRandom}).turn;
 Object.assign(gs,{points:MINI.debate.great,errors:2,gaps:[700,1500,900,2100,800,1300,1000,1800]});
 assert.equal(R.debateFinish(G,gs,{now:end}).ok,true);assert.equal(G.journal[0].d.great,true);
});

test("E11 the debate's turn and the audits are hidden from any reply",()=>{
 const S=game(),s=R.act(S,{type:"debate"},{now:at(10),random:noRandom});
 assert.ok(s.turn);assert.equal(JSON.stringify(s).includes("seed"),false);assert.equal({...s}.turn,undefined);
 assert.equal(s.turn.seed,Math.floor(0.99*2**32)>>>0,"the seed comes from the random dependency");
 assert.equal(s.turn.count,R.QUESTIONS.length);
 const hw=R.act(game(),{type:"debate"},{now:at(10),random:noRandom,event:"halloween"});
 assert.equal(hw.turn.count,R.debateCount("halloween"),"a solo debate in costume deals the bigger deck");
});

test("E12 Pong: seeded, id checked, time window from the game (never the wait), hard cap, audit",()=>{
 const P=PONG_RULES;
 const run=(ms,score,id)=>{const S=game(),s=R.act(S,{type:"pongStart"},{now:at(10),random:noRandom});
  const r=R.act(S,{type:"pongEnd",score,id:id===undefined?s.game.id:id},{now:at(10)+ms,random:noRandom});return {S,s,r};};
 let x=run(20000,20);assert.ok(x.r.ok);assert.equal(x.r.bonus,P.bonusCap);assert.equal(x.S.pong,null);
 assert.deepEqual(x.r.audit,{game:"pong",score:20,secs:20,flags:[]});
 assert.ok(Number.isInteger(x.s.game.seed));assert.equal(x.s.game.k,"pong");
 x=run(60000,26);assert.equal(x.r.ok,false,"over the hard cap");assert.deepEqual(x.r.audit.flags,["plafond"]);
 x=run(60000,P.maxScore);assert.ok(x.r.ok);assert.deepEqual(x.r.audit.flags,["plafond"],"flagged near the cap");
 x=run(5000,11);assert.equal(x.r.ok,false,"5 s allows ceil(5.5*1.5)+1 = 10");assert.deepEqual(x.r.audit.flags,["trop_rapide"]);
 x=run(5000,10);assert.ok(x.r.ok);
 x=run(1900,0);assert.equal(x.r.ok,false,"under 2 s");assert.deepEqual(x.r.audit.flags,["trop_rapide"]);
 x=run(20000,5,"faux");assert.equal(x.r.ok,false);assert.deepEqual(x.r.audit.flags,["id_inconnu"]);assert.equal(x.S.pong,null,"consumed");
 x=run(91000,5);assert.equal(x.r.error,"Aucun débat en cours.","expired");
});

test("E13 time windows use the time played: intro removed, game length at most, network tolerance",()=>{
 // The cap grows with the time played until the game's length, then stops.
 const S=game("right"),cap=secs=>{const T=game("right"),s=R.act(T,{type:"manifStart"},{now:at(10),random:noRandom});
  for(let sc=MINI.epervier.maxScore;sc>=0;sc--){const U=structuredClone(T);if(R.act(U,{type:"miniEnd",score:sc,id:s.game.id},{now:at(10)+secs*1000,random:noRandom}).ok)return sc;}return -1;};
 assert.equal(cap(3),Math.ceil(3.5*2)+1);assert.equal(cap(10),22);assert.equal(cap(35),MINI.epervier.maxScore);assert.equal(cap(100),MINI.epervier.maxScore);
 assert.equal(cap(110),MINI.epervier.maxScore,"at the expiry");assert.equal(cap(111),-1,"past the expiry");
 assert.ok(S);
});

test("E14 the hard caps stay above the games' physics (invincible bots: Cortège 198, Épervier 45, Pong 24)",()=>{
 assert.ok(MINI.cortege.maxScore>=198*1.2);assert.ok(MINI.epervier.maxScore>=45*1.3);assert.ok(PONG_RULES.maxScore>=24);
 assert.ok(MINI.cortege.great<MINI.cortege.suspect&&MINI.epervier.great<MINI.epervier.suspect);
});

test("E15 duel payments: paidWins a day, defWinsPerDay as the defender, an unpaid win pays nothing",()=>{
 assert.equal(DUEL.defWinsPerDay,3);
 assert.equal(R.duelPaid(0,0,false),true);assert.equal(R.duelPaid(DUEL.paidWins-1,0,false),true);assert.equal(R.duelPaid(DUEL.paidWins,0,false),false);
 assert.equal(R.duelPaid(0,DUEL.defWinsPerDay-1,true),true);assert.equal(R.duelPaid(0,DUEL.defWinsPerDay,true),false);
 assert.equal(R.duelPaid(0,DUEL.defWinsPerDay,false),true,"the defender cap does not touch the challenger's wins");
 const S=R.newGame("left",Date.UTC(2026,0,5,11,0));S.moral=50;S.energy=50;const xp=S.xp;
 R.duelApply(S,"win",{vs:"Bob",mine:9,theirs:3,paid:false});
 assert.deepEqual([S.xp,S.moral,S.energy],[xp,50,50]);assert.match(S.journal[0].text,/rien ne bouge/);
});
