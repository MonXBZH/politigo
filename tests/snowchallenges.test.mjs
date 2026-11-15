// Trêve des confiseurs, the snowball challenges (server/snowchallenges.mjs): a player re-deals one of his validated
// fights (its seed and score, kept by the server) to another; the best score takes +10 moral, a tie +5 each. The module
// alone on a temporary database, then a real server (POLITIGO_EVENT=noel, the launch window shortened for the test).
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync} from "node:fs";
import {createConnection} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,PW,sleep,until} from "./server-helpers.mjs";
import {schedule,play,SPOTS,COVER} from "../web/snowball.mjs";
import {snowFlags} from "../web/rules.mjs";

const CH=await import(process.env.SNOWCH||"/app/snowchallenges.mjs");
const T=120000,it=(name,fn)=>test(name,{timeout:T},fn);
const H=3600e3,DAY=24*H;
// Any activity (a fight included) gives +10 moral by itself (rules: spendActivity): the defender's own fight adds it.
const ACT_MORAL=10;
const fresh=o=>CH.createChallenges(new DatabaseSync(":memory:"),o);

// ---------------------------------------------------------------- the module alone
it("open: never oneself, one open per pair, three a day",()=>{
 const c=fresh(),now=Date.UTC(2026,11,10,12);
 assert.throws(()=>c.open({challenger:1,defender:1,seed:5,score:10,now}),{message:"Pas toi-même."});
 const {id}=c.open({challenger:1,defender:2,seed:5,score:10,now});
 assert.ok(Number.isSafeInteger(id)&&id>0);
 const row=c.get(id);
 assert.equal(row.status,"open");assert.equal(row.challenger,1);assert.equal(row.defender,2);
 assert.equal(row.seed,5);assert.equal(row.score,10);assert.equal(row.expires,now+DAY);
 // one open challenge per pair, in either direction
 assert.throws(()=>c.open({challenger:1,defender:2,seed:6,score:3,now:now+1}),{message:"Déjà un défi ouvert avec ce joueur."});
 assert.throws(()=>c.open({challenger:2,defender:1,seed:6,score:3,now:now+1}),{message:"Déjà un défi ouvert avec ce joueur."});
 // three launched a day, whatever became of them
 c.open({challenger:1,defender:3,seed:7,score:3,now:now+2});
 c.open({challenger:1,defender:4,seed:8,score:3,now:now+3});
 assert.throws(()=>c.open({challenger:1,defender:5,seed:9,score:3,now:now+4}),{message:"3 défis par jour."});
 c.cancelOf(3);
 assert.throws(()=>c.open({challenger:1,defender:5,seed:9,score:3,now:now+5}),{message:"3 défis par jour."},"a cancelled one still counts");
 // another player is not concerned; the next day, again
 assert.ok(c.open({challenger:6,defender:5,seed:9,score:3,now}).id);
 assert.ok(c.open({challenger:1,defender:5,seed:9,score:3,now:now+DAY}).id);
 // a closed challenge frees the pair
 c.finish(id,4,now+10);
 assert.ok(c.open({challenger:2,defender:1,seed:1,score:0,now:now+DAY}).id);
 // nonsense is refused
 for(const bad of [{challenger:"1",defender:7,seed:1,score:1},{challenger:1,defender:7,seed:-1,score:1},{challenger:1,defender:7,seed:2**32,score:1},
  {challenger:1,defender:7,seed:1,score:-2},{challenger:1,defender:7,seed:1,score:1.5},{challenger:1,defender:null,seed:1,score:1}])
  assert.throws(()=>c.open({...bad,now:now+2*DAY}),Error);
 assert.equal(c.get(999999),null);assert.equal(c.get("x"),null);
});

it("finish: the best score wins, a tie is a tie",()=>{
 const c=fresh(),now=Date.UTC(2026,11,10,12);
 const a=c.open({challenger:1,defender:2,seed:1,score:10,now}).id;
 assert.deepEqual(c.finish(a,12,now+1,["precision"]),{winner:2,tie:false});
 assert.equal(c.get(a).status,"done");assert.equal(c.get(a).dScore,12);assert.deepEqual(c.get(a).dFlags,["precision"]);
 assert.equal(c.finish(a,99,now+2),null,"finished once");
 const b=c.open({challenger:1,defender:3,seed:1,score:10,now}).id;
 assert.deepEqual(c.finish(b,9,now+1),{winner:1,tie:false});
 const d=c.open({challenger:1,defender:4,seed:1,score:10,now}).id;
 assert.deepEqual(c.finish(d,10,now+1),{winner:null,tie:true});
 assert.equal(c.finish(424242,1,now),null);
 // seen by each side: received while open and not past its time, sent with its result for 24 h
 const e=c.open({challenger:5,defender:1,seed:3,score:7,now}).id;
 assert.deepEqual(c.forDefender(1,now).map(r=>r.id),[e]);
 assert.deepEqual(c.forDefender(1,now+DAY).map(r=>r.id),[],"past its time");
 assert.deepEqual(c.forChallenger(1,now+2).map(r=>r.id).sort(),[a,b,d].sort());
 assert.deepEqual(c.forChallenger(1,now+1+DAY+1),[],"finished more than 24 h ago");
});

it("expire after 24 h; cancelAll and cancelOf",()=>{
 const c=fresh(),now=Date.UTC(2026,11,10,12);
 const a=c.open({challenger:1,defender:2,seed:1,score:1,now}).id,b=c.open({challenger:3,defender:4,seed:1,score:1,now:now+H}).id;
 assert.deepEqual(c.expire(now+DAY-1),[]);
 assert.deepEqual(c.expire(now+DAY),[a]);
 assert.equal(c.get(a).status,"expired");assert.equal(c.get(b).status,"open");
 assert.equal(c.finish(a,5,now+DAY+1),null,"an expired challenge no longer finishes");
 // cancelOf: nothing open touches the player any more, in either role; the others stay
 const x=c.open({challenger:2,defender:5,seed:1,score:1,now}).id,y=c.open({challenger:6,defender:2,seed:1,score:1,now}).id;
 const z=c.open({challenger:5,defender:6,seed:1,score:1,now}).id;
 assert.deepEqual(c.cancelOf(2).sort(),[x,y].sort());
 assert.equal(c.forDefender(2,now).length,0);
 assert.ok(!c.forChallenger(2,now).some(r=>r.status==="open"));
 assert.equal(c.get(x).status,"cancelled");assert.equal(c.get(y).status,"cancelled");assert.equal(c.get(z).status,"open");
 // cancelAll: every open one, and only once
 assert.deepEqual(c.cancelAll().sort(),[b,z].sort());
 assert.deepEqual(c.cancelAll(),[]);
 assert.equal(c.get(a).status,"expired","an expired one stays expired");
 // the admin's list: newest first
 assert.deepEqual(c.recent(10).map(r=>r.id),[z,y,x,b,a]);
});

it("play: a challenge in play is no longer open; it finishes from there, or at 0 once its game is over",()=>{
 const c=fresh(),now=Date.UTC(2026,11,10,12);
 const a=c.open({challenger:1,defender:2,seed:1,score:10,now}).id;
 assert.equal(c.play(a,"g1",now+1),true);
 assert.equal(c.play(a,"g2",now+2),false,"played once");
 const r=c.get(a);
 assert.equal(r.status,"playing");assert.equal(r.dGame,"g1");assert.equal(r.dStart,now+1);
 assert.deepEqual(c.forDefender(2,now+3),[],"no longer offered");
 assert.deepEqual(c.forChallenger(1,now+3).map(x=>[x.id,x.status]),[[a,"playing"]]);
 assert.throws(()=>c.open({challenger:2,defender:1,seed:1,score:1,now:now+4}),{message:"Déjà un défi ouvert avec ce joueur."});
 assert.deepEqual(c.expire(now+2*DAY),[],"in play, it does not expire");
 // the games over: those begun at or before the cut
 assert.deepEqual(c.playingDue(now),[]);
 assert.deepEqual(c.playingDue(now+1),[a]);
 assert.deepEqual(c.finish(a,12,now+5,[]),{winner:2,tie:false});
 assert.equal(c.get(a).status,"done");assert.deepEqual(c.playingDue(now+DAY),[]);
 // never finished: the server closes it with 0 for the defender
 const b=c.open({challenger:3,defender:4,seed:1,score:10,now}).id;
 c.play(b,"g3",now);
 assert.deepEqual(c.playingDue(now+10),[b]);
 assert.deepEqual(c.finish(b,0,now+10),{winner:3,tie:false});
 // only an open one goes into play; nonsense is refused
 assert.equal(c.play(b,"g4",now+11),false);
 assert.equal(c.play(999999,"g",now),false);
 const d=c.open({challenger:5,defender:6,seed:1,score:1,now}).id;
 for(const bad of [null,"",42,"x".repeat(41)])assert.equal(c.play(d,bad,now),false,String(bad));
 // a player gone: the one in play is cancelled too, and so is everything at the end of the theme
 c.play(d,"g5",now);
 assert.deepEqual(c.cancelOf(6,now+1),[d]);
 const e=c.open({challenger:7,defender:8,seed:1,score:1,now}).id;c.play(e,"g6",now);
 assert.deepEqual(c.cancelAll(now+1),[e]);
});

// ---------------------------------------------------------------- a real server
const centre=i=>{const s=SPOTS[i];return {x:s.x,y:Math.round(s.base-(64+COVER)/2*s.k)};};
// A good human fight's first seconds: one ball at each foe (no passer-by) 300 ms after he shows up.
// When those first foes are all passers-by or out of reach (about 1.5 % of the deals), the next foes too, until the
// replay scores: computed from the very seed the server dealt, never a 0-point fight (checked on 200 000 seeds; the
// last tap is at 6.9 s at most).
function goodTaps(seed,camp,upTo=2600){
 const sched=schedule(seed,camp),foes=sched.pops.filter(p=>p.passant===null),tap=p=>({t:Math.round(p.t+300),...centre(p.spot)});
 const taps=foes.filter(p=>p.t+300<=upTo).map(tap);
 for(const p of foes.slice(taps.length)){if(play(sched,taps).score>0)break;taps.push(tap(p));}
 return taps;
}
// How long to play before sending: at least the server's 3 s, and long enough for the last tap (the server takes no
// tap later than the time played + 2 s).
const playFor=taps=>Math.max(3300,Math.max(0,...taps.map(p=>p.t))-1500);
const me=async c=>(await c.call("GET","/api/me")).json;
const list=async c=>{const r=await c.call("GET","/api/snow/challenges");assert.equal(r.status,200,JSON.stringify(r.json));return r.json;};
// A validated fight: good taps (a score above 0), or the taps given; returns the game and the server's score.
async function fight(c,{challenge,taps}={}){
 const s=await c.call("POST","/api/action",{type:"snowStart",...(challenge!==undefined?{challenge}:{})});
 assert.equal(s.status,200,JSON.stringify(s.json));
 const g=s.json.game,t=taps??goodTaps(g.seed,c.camp);
 await sleep(playFor(t));
 const e=await c.call("POST","/api/action",{type:"miniEnd",id:g.id,taps:t,score:999});
 assert.equal(e.status,200,JSON.stringify(e.json));
 return {game:g,score:play(schedule(g.seed,c.camp),t).score,end:e};
}
const PORT=3945,WINDOW=6000;let proc,DIR,SOCK;
function adm(obj){
 return new Promise((ok,ko)=>{
  const c=createConnection(SOCK);let text="";
  const t=setTimeout(()=>{c.destroy();ko(new Error("admin socket did not answer"));},8e3);
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{clearTimeout(t);try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
 });
}
before(async()=>{
 DIR=mkdtempSync(join(tmpdir(),"pgch-"));SOCK=join(DIR,"admin.sock");
 proc=await boot(PORT,DIR,{POLITIGO_EVENT:"noel",POLITIGO_ADMIN_SOCKET:SOCK,POLITIGO_SNOW_CHALLENGE_MS:String(WINDOW)});
});
after(async()=>{if(proc)await stop(proc);});

it("A plays then challenges B; B plays on the same seed; the winner takes +10 moral",async()=>{
 const A=await player(PORT,"Neige Alpha","left"),B=await player(PORT,"Neige Bravo","right");
 const f=await fight(A);
 assert.ok(f.score>0,"A scores");
 // refusals first, none of which uses anything up
 const post=(c,body)=>c.call("POST","/api/snow/challenge",body);
 let r=await post(A,{to:"Neige Alpha",gameId:f.game.id});
 assert.equal(r.status,422);assert.equal(r.json.error,"Pas toi-même.");
 r=await post(A,{to:"Personne Ici",gameId:f.game.id});
 assert.equal(r.status,422);assert.equal(r.json.error,"Joueur introuvable.");
 r=await post(A,{to:"Neige Bravo",gameId:"autrepartie"});
 assert.equal(r.status,422);assert.match(r.json.error,/partie/);
 r=await post(A,{to:42});
 assert.equal(r.status,400);
 // the score is the server's, never the body's
 r=await post(A,{to:"neige bravo",gameId:f.game.id,score:999,seed:1});
 assert.equal(r.status,200,JSON.stringify(r.json));
 const id=r.json.challenge.id;
 assert.equal(r.json.challenge.score,f.score);assert.equal(r.json.challenge.to,"Neige Bravo");
 r=await post(A,{to:"Neige Bravo",gameId:f.game.id});
 assert.equal(r.status,422);assert.equal(r.json.error,"Déjà un défi ouvert avec ce joueur.");
 // B sees it; A sees it sent
 const lb=await list(B);
 assert.equal(lb.received.length,1);
 assert.deepEqual(Object.keys(lb.received[0]).sort(),["expires","from","id","score"]);
 assert.equal(lb.received[0].id,id);assert.equal(lb.received[0].from,"Neige Alpha");assert.equal(lb.received[0].score,f.score);
 const la=await list(A);
 assert.equal(la.sent.length,1);assert.equal(la.sent[0].to,"Neige Bravo");assert.equal(la.sent[0].status,"open");
 assert.equal(la.received.length,0);
 // nobody but the defender plays it, and a bad id spends nothing
 r=await A.call("POST","/api/action",{type:"snowStart",challenge:id});
 assert.equal(r.status,422);assert.equal((await me(A)).state.mini,null);
 for(const bad of [999999,"abc",-1,{id}]){
  r=await B.call("POST","/api/action",{type:"snowStart",challenge:bad});
  assert.equal(r.status,422,JSON.stringify(bad));
 }
 assert.equal((await me(B)).state.mini,null,"nothing started");
 assert.equal((await me(B)).state.actsToday,0,"nothing spent");
 // B plays it: the same seed. No tap: 0 points, A wins.
 const m0=(await me(A)).state.moral,b0=(await me(B)).state.moral;
 const g=await fight(B,{challenge:id,taps:[]});
 assert.equal(g.game.seed,f.game.seed,"the challenge's seed");
 assert.equal((await me(A)).state.moral,Math.min(100,m0+10),"the winner takes +10");
 const mb=await me(B);
 assert.equal(mb.state.moral,Math.min(100,b0+ACT_MORAL),"the loser loses nothing (his fight's own +10 only)");
 assert.ok(mb.state.journal.some(j=>j.k==="snowch"&&j.text==="❄️ Défi de neige : Neige Alpha l'emporte, "+f.score+" à 0."),"told in the journal");
 assert.ok((await me(A)).state.journal.some(j=>j.k==="snowch"&&j.text==="❄️ Défi de neige : tu bats Neige Bravo, "+f.score+" à 0. Moral +10."));
 const done=(await list(A)).sent.find(x=>x.id===id);
 assert.equal(done.status,"done");assert.deepEqual(done.result,{mine:f.score,theirs:0,outcome:"win"});
 assert.equal((await list(B)).received.length,0);
 // closed: B cannot play it again, and that spends nothing
 const acts=(await me(B)).state.actsToday;
 r=await B.call("POST","/api/action",{type:"snowStart",challenge:id});
 assert.equal(r.status,422);assert.equal(r.json.error,"Ce défi n'est plus ouvert.");
 assert.equal((await me(B)).state.actsToday,acts);
 // the console sees it, read-only, with names, scores and the defender's flags
 const ad=await adm({cmd:"snow-challenges"});
 assert.equal(ad.ok,true,JSON.stringify(ad));
 const row=ad.items.find(x=>x.id===id);
 assert.equal(row.challenger,"Neige Alpha");assert.equal(row.defender,"Neige Bravo");
 assert.equal(row.score,f.score);assert.equal(row.dScore,0);assert.equal(row.status,"done");assert.deepEqual(row.dFlags,[]);
});

it("a tie gives +5 each; a bot-flagged answer counts as 0",async()=>{
 const A=await player(PORT,"Neige Tango","left"),B=await player(PORT,"Neige Tango Bis","left");
 // the same camp, the same taps on the same seed: the same score
 const f=await fight(A);
 const id=(await A.call("POST","/api/snow/challenge",{to:"Neige Tango Bis",gameId:f.game.id})).json.challenge.id;
 const m0=(await me(A)).state.moral,b0=(await me(B)).state.moral;
 const g=await fight(B,{challenge:id,taps:goodTaps(f.game.seed,"left")});
 assert.equal(g.score,f.score);
 assert.equal((await me(A)).state.moral,Math.min(100,m0+5));assert.equal((await me(B)).state.moral,Math.min(100,b0+ACT_MORAL+5));
 assert.deepEqual((await list(A)).sent.find(x=>x.id===id).result,{mine:f.score,theirs:f.score,outcome:"tie"});
 // C challenges D; D answers with a bot's burst: a higher score, but it counts as 0
 const C=await player(PORT,"Neige Charlie","left"),D=await player(PORT,"Neige Delta","left");
 const fc=await fight(C);
 const id2=(await C.call("POST","/api/snow/challenge",{to:"Neige Delta",gameId:fc.game.id})).json.challenge.id;
 const burst=[...goodTaps(fc.game.seed,"left"),...Array.from({length:60},(_,i)=>({t:3000+i*30,x:20,y:460}))];
 const pd=play(schedule(fc.game.seed,"left"),burst);
 assert.ok(snowFlags(burst,pd,[]).includes("taps_rapides"));
 await fight(D,{challenge:id2,taps:burst});
 assert.deepEqual((await list(C)).sent.find(x=>x.id===id2).result,{mine:fc.score,theirs:0,outcome:"win"});
 const ad=(await adm({cmd:"snow-challenges"})).items.find(x=>x.id===id2);
 assert.ok(ad.dFlags.includes("taps_rapides"));
});

it("a challenge is launched within the window after a clean, ordinary fight",async()=>{
 const A=await player(PORT,"Neige Echo","left"),B=await player(PORT,"Neige Foxtrot","right");
 const f=await fight(A);
 await sleep(WINDOW+300);
 const r=await A.call("POST","/api/snow/challenge",{to:"Neige Foxtrot",gameId:f.game.id});
 assert.equal(r.status,422);assert.equal(r.json.error,"Trop tard : un défi se lance dans les 10 minutes qui suivent la partie.");
 // a bot-flagged fight cannot be re-dealt
 const C=await player(PORT,"Neige Golf","left");
 const s=await C.call("POST","/api/action",{type:"snowStart"}),g=s.json.game;
 const burst=[...goodTaps(g.seed,"left"),...Array.from({length:60},(_,i)=>({t:3000+i*30,x:20,y:460}))];
 await sleep(playFor(burst));
 assert.equal((await C.call("POST","/api/action",{type:"miniEnd",id:g.id,taps:burst})).status,200);
 const r2=await C.call("POST","/api/snow/challenge",{to:"Neige Foxtrot",gameId:g.id});
 assert.equal(r2.status,422);assert.equal(r2.json.error,"Cette partie ne peut pas servir de défi.");
 // nor a challenge's own fight
 const D=await player(PORT,"Neige Hotel","left"),E=await player(PORT,"Neige India","left");
 const fd=await fight(D);
 const id=(await D.call("POST","/api/snow/challenge",{to:"Neige India",gameId:fd.game.id})).json.challenge.id;
 const ge=await fight(E,{challenge:id});
 const r3=await E.call("POST","/api/snow/challenge",{to:"Neige Foxtrot",gameId:ge.game.id});
 assert.equal(r3.status,422);assert.equal(r3.json.error,"Une partie de défi ne se relance pas.");
});

it("a deleted or suspended player's challenges are cancelled; the other is not stuck",async()=>{
 const A=await player(PORT,"Neige Juliet","left"),B=await player(PORT,"Neige Kilo","right"),C=await player(PORT,"Neige Lima","right");
 const f=await fight(A);
 const id=(await A.call("POST","/api/snow/challenge",{to:"Neige Kilo",gameId:f.game.id})).json.challenge.id;
 assert.equal((await B.call("DELETE","/api/account",{password:PW})).status,200);
 assert.equal((await list(A)).sent.find(x=>x.id===id).status,"cancelled");
 // suspended: the defender, then A can challenge again
 const id2=(await A.call("POST","/api/snow/challenge",{to:"Neige Lima",gameId:f.game.id})).json.challenge.id;
 assert.equal((await adm({cmd:"suspend",name:"Neige Lima",on:true})).ok,true);
 assert.equal((await list(A)).sent.find(x=>x.id===id2).status,"cancelled");
 const r=await A.call("POST","/api/snow/challenge",{to:"Neige Lima",gameId:f.game.id});
 assert.equal(r.status,422);assert.equal(r.json.error,"Joueur introuvable.","a suspended player cannot be challenged");
 // a suspended challenger: the defender's received list empties
 const D=await player(PORT,"Neige Mike","left"),E=await player(PORT,"Neige November","left");
 const fd=await fight(D);
 assert.equal((await D.call("POST","/api/snow/challenge",{to:"Neige November",gameId:fd.game.id})).status,200);
 assert.equal((await list(E)).received.length,1);
 assert.equal((await adm({cmd:"suspend",name:"Neige Mike",on:true})).ok,true);
 assert.equal((await list(E)).received.length,0);
});

it("the end of the theme cancels every open challenge; no new one outside it",async()=>{
 const A=await player(PORT,"Neige Oscar","left"),B=await player(PORT,"Neige Papa","right");
 const f=await fight(A);
 const id=(await A.call("POST","/api/snow/challenge",{to:"Neige Papa",gameId:f.game.id})).json.challenge.id;
 assert.equal((await adm({cmd:"event-set",mode:"off"})).ok,true);
 assert.ok(await until(async()=>(await list(A)).sent.find(x=>x.id===id).status==="cancelled",3000));
 const C=await player(PORT,"Neige Quebec","left");
 const r=await A.call("POST","/api/snow/challenge",{to:"Neige Quebec",gameId:f.game.id});
 assert.equal(r.status,422);assert.equal(r.json.error,"Les défis de neige ont lieu seulement pendant la Trêve des confiseurs.");
 assert.equal((await adm({cmd:"event-set",mode:"noel"})).ok,true);
 void C;
});

it("a challenge is played once: a second start is refused, a refused game finishes it at 0",async()=>{
 const A=await player(PORT,"Neige Romeo","left"),B=await player(PORT,"Neige Sierra","right");
 const f=await fight(A);assert.ok(f.score>0);
 const id=(await A.call("POST","/api/snow/challenge",{to:"Neige Sierra",gameId:f.game.id})).json.challenge.id;
 const m0=(await me(A)).state.moral;
 const s1=await B.call("POST","/api/action",{type:"snowStart",challenge:id});
 assert.equal(s1.status,200,JSON.stringify(s1.json));
 const r=await B.call("POST","/api/action",{type:"snowStart",challenge:id});
 assert.equal(r.status,422);assert.equal(r.json.error,"Ce défi est déjà en cours.");
 assert.equal((await me(B)).state.mini.id,s1.json.game.id,"the game in play goes on");
 assert.equal((await list(A)).sent.find(x=>x.id===id).status,"playing");
 assert.equal((await list(B)).received.length,0);
 // the game is refused (malformed taps): the challenge ends at 0 for the defender
 await sleep(3300);
 assert.equal((await B.call("POST","/api/action",{type:"miniEnd",id:s1.json.game.id,taps:"pas des touches"})).status,422);
 assert.deepEqual((await list(A)).sent.find(x=>x.id===id).result,{mine:f.score,theirs:0,outcome:"win"});
 assert.equal((await me(A)).state.moral,Math.min(100,m0+10));
});

it("challenges open at the duels' level, for both players",async()=>{
 const port=3946,dir=mkdtempSync(join(tmpdir(),"pgch-lvl-"));
 const p=await boot(port,dir,{POLITIGO_EVENT:"noel",POLITIGO_DUEL_MIN_LEVEL:"2",POLITIGO_SNOW_CHALLENGE_MS:"60000"});
 try{
  const A=await player(port,"Niveau Alpha","left"),B=await player(port,"Niveau Bravo","right"),C=await player(port,"Niveau Charlie","left");
  const post=(c,body)=>c.call("POST","/api/snow/challenge",body);
  assert.equal((await me(C)).state.lvl,1);
  let r=await post(C,{to:"Niveau Bravo",gameId:"x"});
  assert.equal(r.status,422);assert.equal(r.json.error,"Les défis s'ouvrent au niveau 2.");
  const f=await fight(A);assert.ok((await me(A)).state.lvl>=2,"one fight brings level 2");
  r=await post(A,{to:"Niveau Bravo",gameId:f.game.id});
  assert.equal(r.status,422);assert.equal(r.json.error,"Les défis s'ouvrent au niveau 2.","the defender too");
  await fight(B);
  r=await post(A,{to:"Niveau Bravo",gameId:f.game.id});
  assert.equal(r.status,200,JSON.stringify(r.json));
 }finally{await stop(p);}
});
