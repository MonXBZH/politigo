// Tests for the Duel du Bâton's screen (web/batonduel.mjs): its pure parts only (node --test, no DOM, no server).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as B from "../web/batonduel.mjs";
import {BD,chart,roundSeed,sim,verdict,timeline} from "../web/duel.mjs";

test("mergeTimed: pieces merged by time, repeats (a reload sends all again) and garbage dropped",()=>{
 let l=B.mergeTimed([],[[300,1],[100,0]]);
 assert.deepEqual(l,[[100,0],[300,1]]);
 l=B.mergeTimed(l,[[100,0],[200,1],[300,1],["x",0],[400,2],null,[500]]);
 assert.deepEqual(l,[[100,0],[200,1],[300,1]]);
 assert.equal(B.mergeTimed(l,undefined),l);
 assert.deepEqual(B.mergeTimed([],[[100,0],[100,1]]),[[100,0],[100,1]]);   // the same instant on two lanes: two presses
});

test("outbox: a batch takes the presses up to `up` in order, a failed one puts them back in front",()=>{
 const o=B.outbox();
 o.add(120.4,0);o.add(80,1);o.add(400,0);
 assert.deepEqual(o.take(200),[[80,1],[120,0]]);assert.equal(o.size,3);
 o.nack();assert.deepEqual(o.take(500),[[80,1],[120,0],[400,0]]);o.ack();assert.equal(o.size,0);
 o.add(-5,1);assert.deepEqual(o.take(10),[[0,1]]);   // never a negative time
 // never more than the server takes in one batch
 const p=B.outbox();for(let i=0;i<BD.maxPresses+30;i++)p.add(i,i%2);
 assert.equal(p.take(1e9).length,BD.maxPresses);p.ack();assert.equal(p.size,30);
 // what a batch takes is what duel.mjs accepts
 const q=B.outbox();for(const t of [5,900,450,450])q.add(t,t%2);assert.ok(cleanOk(q.take(1000)));
});
import {cleanPresses} from "../web/duel.mjs";
const cleanOk=l=>cleanPresses(l)!==null;

test("batchUp: a little behind the local clock, never backwards, never past the round",()=>{
 assert.equal(B.batchUp(1000,0),850);
 assert.equal(B.batchUp(900,860),860);           // the clock slowed down (drift fix): "up" holds
 assert.equal(B.batchUp(99999,0),BD.round+BD.good);
 assert.equal(B.batchUp(50,0),0);
});

test("livePos: the spectators are BD.spectatorDelay and a slack late, never past what has arrived",()=>{
 const start=10000;
 assert.ok(B.livePos(start+500,start,0)<0);                                  // still the countdown for them
 assert.equal(B.livePos(start+20000,start,30000,3000,700),20000-3700);
 assert.equal(B.livePos(start+20000,start,12000,3000,700),12000);            // the stream lags: wait for it
 assert.equal(B.livePos(start+20000,start,undefined,3000,700),0);
});

test("replayPos and winsAt: the replay's clock mapped to its countdowns, rounds and pauses, joining mid-way",()=>{
 const seed=1234,rounds=[0,1,2].map(n=>{const {notes}=chart(roundSeed(seed,n));return {c:notes.filter((_,k)=>k%(n===1?5:1)===0).map(([t,l])=>[t+10,l]),b:notes.filter((_,k)=>k%3===0).map(([t,l])=>[t,l])};});
 const v=verdict(seed,rounds),tl=timeline(v);
 assert.equal(B.replayPos(tl,-5000).phase,"wait");assert.equal(B.replayPos(tl,-5000).left,5000);
 const r0=tl.rounds[0];
 let p=B.replayPos(tl,100);assert.equal(p.phase,"count");assert.equal(p.n,0);assert.equal(p.left,r0.start-100);assert.ok(p.rt<0);
 p=B.replayPos(tl,r0.start+2000);assert.equal(p.phase,"play");assert.equal(p.rt,2000);assert.equal(p.done,0);
 p=B.replayPos(tl,r0.end+10);assert.equal(p.phase,"pause");assert.equal(p.done,1);
 assert.deepEqual(B.winsAt(v,1),v.rounds[0].over.w===0?[1,0]:[0,1]);
 if(tl.rounds[1]){p=B.replayPos(tl,tl.rounds[1].start+1);assert.equal(p.phase,"play");assert.equal(p.n,1);assert.equal(p.i,1);}
 p=B.replayPos(tl,tl.total+1);assert.equal(p.phase,"end");assert.equal(p.done,tl.rounds.length);
 assert.deepEqual(B.winsAt(v,p.done),v.wins);
 // the round's end in the timeline is where sim() ends it
 assert.equal(r0.end-r0.start,sim(chart(roundSeed(seed,0)).notes,[rounds[0].c,rounds[0].b]).over.t);
});

test("judgeDiff: the word for what a side's last press (or a lost note) earned",()=>{
 const {notes}=chart(roundSeed(99,0)),[t0,l0]=notes[0];
 const at=(pr,upTo)=>sim(notes,[pr],{solo:true,upTo});
 const a=at([],t0-400);
 assert.equal(B.judgeDiff(a,at([[t0,l0]],t0+5)),"p");
 assert.equal(B.judgeDiff(a,at([[t0+100,l0]],t0+105)),"g");
 assert.equal(B.judgeDiff(a,at([],t0+BD.good+5)),"m");
 assert.equal(B.judgeDiff(a,at([[t0-200,l0]],t0-195)),"e");
 // a press far from any note of its lane: beside the notes
 const tx=t0-400,lx=notes.some(([t,l])=>l===0&&Math.abs(t-tx)<=BD.early)?1:0;
 assert.equal(B.judgeDiff(a,at([[tx,lx]],tx+1)),"x");
 assert.equal(B.judgeDiff(a,a),null);assert.equal(B.judgeDiff(null,a),null);
});

test("countWord: 3, 2, 1, BRANDISSEZ !",()=>{
 assert.deepEqual([3400,2000,1000,500,0].map(B.countWord),["3","2","1","BRANDISSEZ !","BRANDISSEZ !"]);
});

test("watchData: a live round or a replay read leniently, never more than its shape",()=>{
 const live=B.watchData({id:4,c:[[100,0],[50,1]],b:[[70,0]],n:1,start:5000,now:20000,wins:[1,0],delay:3000,notes:[[1600,0]]},{c:"Hugo",b:"Camille"});
 assert.equal(live.kind,"live");assert.deepEqual(live.names,{c:"Hugo",b:"Camille"});assert.deepEqual(live.P,[[[50,1],[100,0]],[[70,0]]]);
 assert.equal(live.up,20000-5000-3000);assert.deepEqual(live.wins,[1,0]);
 const named=B.watchData({id:4,c:"Hugo",b:"Camille",cp:[[1,0]],bp:[],start:1,n:0,notes:[]});
 assert.deepEqual(named.names,{c:"Hugo",b:"Camille"});assert.deepEqual(named.P[0],[[1,0]]);
 const rep=B.watchData({id:5,seed:42,rounds:[{c:[[10,0]],b:[]},{c:"junk"}],replayAt:1000,endsAt:2000});
 assert.equal(rep.kind,"replay");assert.equal(rep.rounds.length,2);assert.deepEqual(rep.rounds[1],{c:[],b:[]});
 assert.equal(B.watchData(null).kind,null);assert.equal(B.watchData({id:1}).kind,null);
});

test("screenOf: players get their screen, spectators the arena only when live or replaying",()=>{
 assert.equal(B.screenOf(null,0),"none");
 assert.equal(B.screenOf({role:"challenger",status:"c_play"},0),"play");
 assert.equal(B.screenOf({role:"spectator",status:"c_play"},0),"none");
 assert.equal(B.screenOf({role:"spectator",status:"live"},0),"live");
 assert.equal(B.screenOf({role:"bearer",status:"live"},0),"play");
 assert.equal(B.screenOf({role:"bearer",status:"scheduled",replayAt:1000},999),"play");
 assert.equal(B.screenOf({role:"bearer",status:"scheduled",replayAt:1000},1000),"replay");
 assert.equal(B.screenOf({role:"spectator",status:"done",replayAt:1000},5000),"replay");
 assert.equal(B.screenOf({role:"spectator",status:"done"},5000),"none");      // a live duel over: nothing to replay
});

test("cheers: the six of duel.mjs, each drawn (an emoji or the game's own svg)",()=>{
 assert.deepEqual(Object.keys(B.CHEERS),BD.cheers);
 for(const e of BD.cheers)assert.ok(B.CHEERS[e]||B.cheerSrc(e).endsWith(`/${e}.svg`));
 assert.deepEqual(Object.keys(B.JUDGE).sort(),["e","g","m","p","x"]);
});
