// Le Duel du Bâton (web/duel.mjs): the chart, the referee, the anti-cheat and the replay's running order (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import {BD,chart,roundSeed,cleanPresses,sim,flagsOf,verdict,timeline,rng} from "../web/duel.mjs";

const {notes}=chart(roundSeed(1234,0));
// A player who hits a share of the notes, off by a gaussian spread (ms); bursts: extra presses beside the notes.
function player(ns,{acc=1,sd=0,seed=7,offset=0}={}){
 const r=rng(seed),g=()=>Math.sqrt(-2*Math.log(r()||1e-9))*Math.cos(2*Math.PI*r());
 return ns.filter(()=>r()<acc).map(([t,l])=>[Math.max(0,Math.round(t+offset+g()*sd)),l]).sort((a,b)=>a[0]-b[0]);
}

test("the chart: the same seed gives the same notes, one at a time, two lanes, a rising tempo",()=>{
 assert.deepEqual(chart(roundSeed(1234,0)),chart(roundSeed(1234,0)));
 assert.notDeepEqual(chart(roundSeed(1234,0)).notes,chart(roundSeed(1234,1)).notes);
 assert.ok(notes.length>=70&&notes.length<=130,`${notes.length} notes`);
 for(let i=0;i<notes.length;i++){
  const [t,l]=notes[i];assert.ok(l===0||l===1);assert.ok(t>0&&t<BD.round);
  if(i)assert.ok(t>notes[i-1][0],"never two notes together");
 }
 const gaps=k=>notes.slice(k,k+15).map((n,i,a)=>i?n[0]-a[i-1][0]:0).slice(1),mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
 assert.ok(mean(gaps(notes.length-16))<mean(gaps(0)),"faster at the end");
});

test("cleanPresses: sorted [t,lane] pairs within the round, or nothing at all",()=>{
 assert.deepEqual(cleanPresses([[10.4,0],[10.4,1],[500,0]]),[[10,0],[10,1],[500,0]]);
 assert.deepEqual(cleanPresses([]),[]);
 for(const bad of [null,{},[[5,2]],[[5]],[[500,0],[10,1]],[[-1,0]],[[BD.round+BD.good+1,0]],[["1",0]],[[NaN,0]]])assert.equal(cleanPresses(bad),null,JSON.stringify(bad));
 assert.equal(cleanPresses(Array.from({length:BD.maxPresses+1},(_,i)=>[i,0])),null);
});

test("a flawless challenger against a bearer who does nothing: the flame burns her long before the whistle",()=>{
 const r=sim(notes,[player(notes),[]]);
 assert.equal(r.over.w,0);assert.equal(r.over.how,"flame");assert.ok(r.over.t<BD.round/2,`${r.over.t}`);
 assert.equal(r.f,-1);assert.equal(r.stats[0].p,r.res[0].filter(x=>x==="p").length);
});

test("two flawless players: the flame does not move, the whistle gives the round to the bearer",()=>{
 const p=player(notes),r=sim(notes,[p,p]);
 assert.equal(r.f,0);assert.deepEqual(r.over,{w:1,t:BD.round,how:"time"});
 assert.equal(r.stats[0].p,notes.length);assert.equal(r.stats[1].p,notes.length);
});

test("judging: perfect within 60 ms, good within 140 ms, a miss after, the combo",()=>{
 const [t,l]=notes[0],one=d=>sim(notes,[[[t+d,l]],[]],{upTo:t+BD.good+1}).res[0][0];
 assert.equal(one(0),"p");assert.equal(one(-60),"p");assert.equal(one(61),"g");assert.equal(one(-140),"g");
 assert.equal(sim(notes,[[],[]],{upTo:t+BD.good+1}).res[0][0],"m");
 const r=sim(notes,[player(notes.slice(0,10)),[]],{upTo:notes[9][0]+1});
 assert.equal(r.stats[0].combo,10);assert.equal(r.stats[0].best,10);
});

test("no spamming: a press too early burns the coming note, a stray press costs the combo and pushes for the other",()=>{
 const [t,l]=notes[5],early=sim(notes,[[...player(notes.slice(0,5)),[t-200,l]],[]],{upTo:t+BD.good+1});
 assert.equal(early.res[0][5],"m");assert.equal(early.stats[0].e,1);assert.equal(early.stats[0].combo,0);
 // hammering both lanes every 50 ms against an average honest bearer loses, by far
 const spam=[];for(let x=0;x<BD.round;x+=50)spam.push([x,0],[x+1,1]);
 const r=sim(notes,[cleanPresses(spam,2000),player(notes,{acc:.8,sd:50})]);
 assert.equal(r.over.w,1);assert.equal(r.over.how,"flame");
 assert.ok(r.stats[0].x+r.stats[0].e>r.stats[0].p+r.stats[0].g);
});

test("the better player wins, in either seat; the deferred duel is the live one",()=>{
 const good=player(notes,{acc:.95,sd:30,seed:3}),poor=player(notes,{acc:.7,sd:70,seed:4});
 assert.equal(sim(notes,[good,poor]).over.w,0);assert.equal(sim(notes,[poor,good]).over.w,1);
 // recordings are all a replay needs: the same presses always give the same round
 assert.deepEqual(sim(notes,[good,poor]),sim(notes,[good.map(x=>[...x]),poor.map(x=>[...x])]));
 // partial knowledge (live: what has arrived so far) never contradicts the whole
 const all=sim(notes,[good,poor]),part=sim(notes,[good,poor],{upTo:all.over.t-1});
 assert.equal(part.over,null);assert.ok(Math.abs(part.f)<1);
});

test("solo (the challenger's half of a deferred duel): judged, the flame never moves, no verdict",()=>{
 const r=sim(notes,[player(notes),[]],{solo:true});
 assert.equal(r.f,0);assert.equal(r.over,null);assert.equal(r.stats[0].p,notes.length);assert.equal(r.res[1].every(x=>x===null),true);
});

test("the anti-cheat: a metronome, a flawless round, a burst; a human passes",()=>{
 const bot=player(notes),rb=sim(notes,[bot,bot]);
 assert.deepEqual(flagsOf(rb.stats[0],bot,notes),["métronome","sans faute"]);
 const human=player(notes,{acc:.9,sd:40}),rh=sim(notes,[human,[]],{solo:true});
 assert.deepEqual(flagsOf(rh.stats[0],human,notes),[]);
 // a script that burns its rival in a few seconds is caught too: the flags count the notes really played
 const quick=sim(notes,[bot,[]]);assert.ok(quick.over.t<BD.round/2);assert.ok(flagsOf(quick.stats[0],bot,notes).includes("métronome"));
 const burst=[...human,...Array.from({length:15},(_,i)=>[20000+i*60,i%2])].sort((a,b)=>a[0]-b[0]);
 assert.ok(flagsOf(sim(notes,[burst,[]],{solo:true}).stats[0],burst,notes).includes("rafale"));
});

test("verdict: best of three, the rounds beyond the decision ignored; the replay's running order",()=>{
 const seed=99,rounds=[0,1,2].map(n=>{const {notes:ns}=chart(roundSeed(seed,n));return {c:player(ns,{acc:.97,sd:20}),b:player(ns,{acc:.6,sd:80,seed:n+11})};});
 const v=verdict(seed,rounds);
 assert.deepEqual(v.wins,[2,0]);assert.equal(v.winner,0);assert.equal(v.rounds.length,2);
 assert.deepEqual(verdict(seed,rounds),v);
 assert.equal(verdict(seed,rounds.slice(0,1)).winner,null);
 const tl=timeline(v);
 assert.equal(tl.rounds[0].start,BD.countdown);assert.equal(tl.rounds[0].end,BD.countdown+v.rounds[0].over.t);
 assert.equal(tl.rounds[1].start,tl.rounds[0].end+BD.pause+BD.countdown);assert.equal(tl.total,tl.rounds[1].end+BD.pause);
});
