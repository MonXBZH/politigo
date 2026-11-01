// The Duel du Bâton on a real server (1.6.0): who may challenge the bearer, a live duel played by two scripted
// browsers (a strong and a weak player) that ends with the staff changing hands, a deferred duel (the challenger's
// three rounds alone, the bearer against his ghost, the replay for everyone, the staff moving at its end), the
// anti-cheat holding a duel for the admin's judgement, the bearer's forfeit, and the staff going back to the urn (a
// dying Flamme, a death, the owner's reset). The rounds' clock runs POLITIGO_BATON_SPEED times faster; the stored
// games are edited between two boots of the same server. Pushes are caught by tests/stub-fetch.mjs.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {createConnection} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,until,sleep,keys,FCM} from "./server-helpers.mjs";
import {BD,rng,verdict} from "../web/duel.mjs";

const PORT=3977,K=5;
let dir,LOG,SOCK,proc,db;
const env=()=>({NODE_OPTIONS:"--import /w/tests/stub-fetch.mjs",STUB_FETCH_LOG:LOG,POLITIGO_ADMIN_SOCKET:SOCK,POLITIGO_BATON_SPEED:String(K),POLITIGO_BATON_REPLAY_MS:"1500"});
const ep=c=>`b-${c.name.replace(/\W/g,"")}`;
const pushes=c=>readFileSync(LOG,"utf8").split("\n").filter(Boolean).filter(l=>JSON.parse(l).url===FCM+ep(c)).length;
const me=async c=>(await c.call("GET","/api/me")).json;
const bat=(c,body)=>c.call("POST","/api/baton",body);
const idOf=name=>db.prepare("SELECT id FROM players WHERE name=?").get(name).id;
const holder=()=>db.prepare("SELECT player_id FROM mythics WHERE item='baton'").get()?.player_id??null;
const duelRow=id=>db.prepare("SELECT * FROM baton_duels WHERE id=?").get(id);
const feed=async c=>(await c.call("GET","/api/board")).json.feed;
function adm(obj){
 return new Promise((ok,ko)=>{
  const c=createConnection(SOCK);let text="";
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
 });
}
function stream(c){
 const ac=new AbortController(),events=[];
 fetch(`http://127.0.0.1:${PORT}/events`,{headers:{Cookie:c.cookie},signal:ac.signal}).then(async r=>{
  const dec=new TextDecoder();let buf="";
  for await(const chunk of r.body){
   buf+=dec.decode(chunk,{stream:true});let i;
   while((i=buf.indexOf("\n\n"))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);
    const ev=/^event: (.*)$/m.exec(block)?.[1],data=/^data: (.*)$/m.exec(block)?.[1];if(ev)events.push({ev,data:data&&JSON.parse(data)});}
  }
 }).catch(()=>{});
 return {events,close:()=>ac.abort()};
}
const got=(s,ev)=>s.events.filter(e=>e.ev===ev).map(e=>e.data);
async function opened(c){const s=stream(c);assert.ok(await until(()=>got(s,"me").length),"stream open");return s;}
// Rewrites stored games while the server is down (it loads every game at start), then boots it again.
async function down(fn){await stop(proc);fn();proc=await boot(PORT,dir,env());}
function edit(name,fn){
 const r=db.prepare("SELECT state FROM players WHERE name=?").get(name),S=JSON.parse(r.state);fn(S);
 db.prepare("UPDATE players SET state=? WHERE name=?").run(JSON.stringify(S),name);
}
function giveStaff(name){
 db.prepare("DELETE FROM mythics").run();
 let deaths=0;edit(name,S=>{deaths=S.deaths??0;if(!S.wardrobe.own.includes("baton"))S.wardrobe.own.push("baton");});
 db.prepare("INSERT INTO mythics(item,player_id,t,deaths,warned) VALUES('baton',?,?,?,0)").run(idOf(name),Date.now(),deaths);
}

// A scripted browser for one round: ready, then a batch every 150 ms with the presses planned for the notes revealed so
// far (a share acc of them, off by a gaussian spread sd), as far as the round's clock has gone. hook(batch) after the
// first batch (the timing checks). Returns the reply that says the round is over, and what came in opp.
async function playRound(c,id,n,{acc=.95,sd=30,seed=1,hook}={}){
 let start=null;
 for(let i=0;start==null;i++){
  const r=await bat(c,{op:"ready",id});assert.equal(r.status,200,`${c.name} ready: ${JSON.stringify(r.json)}`);
  assert.equal(r.json.round.n,n);start=r.json.round.start;if(start==null)await sleep(250);assert.ok(i<60,"the round starts");
 }
 const r0=rng(seed),g=()=>Math.sqrt(-2*Math.log(r0()||1e-9))*Math.cos(2*Math.PI*r0());
 let plan=[],up=0,first=true,hooked=!hook;const opp=[];
 await sleep(Math.max(0,start-Date.now()));
 for(;;){
  const u=Math.max(up,Math.floor((Date.now()-start)*K)-60),presses=plan.filter(([t])=>t>up&&t<=u);
  const r=await bat(c,{op:"play",id,n,up:u,presses,...(first?{from:0}:{})});
  assert.equal(r.status,200,`${c.name} play: ${JSON.stringify(r.json)}`);
  up=u;opp.push(...r.json.opp);
  // A note learnt too late (a stalled batch) is simply missed, as a thumb would: never a burst of catch-up presses.
  for(const [t,l] of r.json.notes){const tp=Math.round(t+g()*sd);if(r0()<acc&&tp>u)plan.push([tp,l]);}
  plan.sort((a,b)=>a[0]-b[0]);
  if(!hooked&&up>1500){hooked=true;await hook({up,start});}
  first=false;
  if(r.json.over)return {...r.json,opp};
  await sleep(150);
 }
}
// A whole live duel: both players round after round until it is over.
async function liveDuel(id,c,b,cSkill,bSkill){
 const overs=[];
 for(let n=0;n<BD.rounds;n++){
  const [rc,rb]=await Promise.all([playRound(c,id,n,{...cSkill,seed:10+n}),playRound(b,id,n,{...bSkill,seed:20+n})]);
  overs.push(rc.over);assert.deepEqual(rc.over,rb.over,"both players hear the same ending");
  if(!rc.over.next)break;
 }
 return overs;
}
const STRONG={acc:.9,sd:45},WEAK={acc:.4,sd:100};   // strong, yet humanly short of the anti-cheat's « sans faute »

let A,B,C,Dd,E,F,G,tiede,obs,sObs;
before(async()=>{
 dir=mkdtempSync(join(tmpdir(),"pgbd-"));LOG=join(dir,"fetch.log");SOCK=join(dir,"admin.sock");writeFileSync(LOG,"");
 proc=await boot(PORT,dir,env());
 A=await player(PORT,"Porteuse A","left");B=await player(PORT,"Defi B","right");C=await player(PORT,"Defi C");
 Dd=await player(PORT,"Defi D","right");E=await player(PORT,"Defi E");F=await player(PORT,"Defi F","right");G=await player(PORT,"Defi G");
 tiede=await player(PORT,"Tiede");obs=await player(PORT,"Temoin","right");
 for(const c of [A,B,C,Dd,E,F,G,tiede,obs])assert.equal((await c.call("POST","/api/push/subscribe",{endpoint:FCM+ep(c),keys:keys()})).status,200);
 db=new DatabaseSync(join(dir,"t.db"),{timeout:5000});
 await down(()=>{
  for(const c of [A,B,C,Dd,E,F,G])edit(c.name,S=>{S.flame.pts=400;});
  edit(tiede.name,S=>{S.flame.pts=100;});
  giveStaff(A.name);
 });
});
after(async()=>{try{sObs?.close();}catch{}try{db.close();}catch{}await stop(proc);});

test("who may challenge the bearer, and what every screen is told",async()=>{
 const refuse=async(c,msg)=>{const r=await bat(c,{op:"challenge"});assert.equal(r.status,422,JSON.stringify(r.json));assert.equal(r.json.error,msg);};
 await refuse(tiede,"Ta Flamme doit atteindre 200 pour défier le porteur.");
 await refuse(obs,"Ta Flamme doit atteindre 200 pour défier le porteur.");
 await refuse(A,"Tu portes déjà le Bâton.");
 const a=(await me(A)).baton;
 assert.deepEqual(a.holder,{name:A.name,camp:"left"});assert.equal(a.mine,true);assert.equal(a.flame,400);assert.equal(a.warn,false);assert.ok(!("can" in a));
 const o=(await me(obs)).baton;assert.equal(o.mine,false);assert.equal(o.can,"Ta Flamme doit atteindre 200 pour défier le porteur.");assert.equal(o.duel,null);
 assert.equal((await me(B)).baton.can,"");
 assert.equal((await bat(B,{op:"nope"})).status,400);
 assert.equal((await bat(B,{op:"ready",id:999})).json.error,"Duel introuvable.");
 assert.equal((await bat(obs,{op:"cheer",e:"fire",side:0})).json.error,"Aucun duel à encourager pour l'instant.");
 assert.equal((await obs.call("GET","/api/baton/watch")).json.watch,null);
});

let live;
test("a live duel: the strong challenger takes the staff from the weak bearer",async t=>{
 sObs=await opened(obs);const sA=await opened(A);t.after(()=>sA.close());
 const r=await bat(B,{op:"challenge"});assert.equal(r.status,200,JSON.stringify(r.json));
 live=r.json.duel.id;
 assert.equal(r.json.baton.duel.status,"invited");assert.equal(r.json.baton.duel.role,"challenger");
 assert.ok(await until(()=>got(sA,"baton").some(e=>e.kind==="invite"&&e.id===live&&typeof e.c==="string"&&e.c.length>0)),"the bearer is invited");
 assert.ok(await until(()=>pushes(A)===1),"and pushed");
 assert.ok((await feed(obs)).some(e=>e.kind==="baton"&&e.text===`⚔️ ${B.name} défie ${A.name} pour le Bâton de feu.`));
 assert.equal((await bat(C,{op:"challenge"})).json.error,"Un duel pour le Bâton est déjà en cours.");
 assert.equal((await bat(B,{op:"answer",id:live,live:true})).json.error,"Ce défi n'attend pas ta réponse.");
 const ans=await bat(A,{op:"answer",id:live,live:true});assert.equal(ans.status,200,JSON.stringify(ans.json));assert.equal(ans.json.baton.duel.status,"live");
 // Spectators: the delayed watch, the stream of increments, the cheers (3 a second at most).
 const watching=(async()=>{
  let w=null;   // polled gently: the watch is for joining, the increments come by SSE
  for(let i=0;i<25&&!w;i++){const x=(await obs.call("GET","/api/baton/watch")).json?.watch;if(x?.kind==="live"&&x.up>2000)w=x;else await sleep(600);}
  assert.ok(w,"a live round to watch");assert.equal(w.c,B.name);assert.equal(w.b,A.name);assert.equal(w.delay,BD.spectatorDelay);assert.ok(!("seed" in w));
  assert.ok(w.notes.every(([x])=>x<=w.up+BD.lookahead)&&w.presses.c.every(([x])=>x<=w.up)&&w.presses.b.every(([x])=>x<=w.up));
  const ch=await Promise.all(Array.from({length:4},()=>bat(obs,{op:"cheer",e:"saucisse",side:1})));
  assert.equal(ch.filter(x=>x.status===200).length,3);assert.equal(ch.filter(x=>x.status===429).length,1);
  await sleep(1100);assert.equal((await bat(obs,{op:"cheer",e:"tomate",side:0})).status,400);
 })();
 const overs=await liveDuel(live,B,A,STRONG,WEAK);
 await watching;
 assert.ok(overs.length>=2&&overs.every(o=>o.w===0),JSON.stringify(overs));
 assert.ok(got(sObs,"batonCheer").some(e=>e.e==="saucisse"&&e.side===1));
 const lv=got(sObs,"batonLive");assert.ok(lv.length>=2,"live increments");assert.ok(lv.every(x=>x.id===live&&Number.isFinite(x.up)&&Array.isArray(x.notes)&&Array.isArray(x.c)));
 // The staff has changed hands, everywhere.
 assert.ok(await until(()=>holder()===idOf(B.name)),"the row moved");
 assert.equal(duelRow(live).status,"done");assert.equal(duelRow(live).winner,idOf(B.name));
 const wa=(await me(A)).state.wardrobe,wb=(await me(B)).state.wardrobe;
 assert.ok(!wa.own.includes("baton"));assert.ok(wb.own.includes("baton"));assert.notEqual(wb.worn.object,"baton","not worn: he chooses");
 assert.ok(await until(()=>got(sObs,"mythic").length));assert.deepEqual(got(sObs,"mythic")[0],{name:B.name,camp:"right",from:A.name});
 assert.ok((await feed(obs)).some(e=>e.kind==="mythic"&&e.player===B.name&&e.text===`⚔️ ${B.name} a arraché le Bâton de feu des Apprix à ${A.name} !`));
 assert.ok(await until(()=>pushes(obs)>=1&&pushes(A)===2),"everyone else is pushed");
 const vb=(await me(B)).baton;assert.equal(vb.mine,true);assert.deepEqual(vb.duel.result,{winner:"c",how:"duel"});assert.deepEqual(vb.duel.wins,[overs.length,0]);
 // Every screen hears the state change; the replay of a live duel is public at once, and agrees with the referee.
 assert.ok(got(sObs,"baton").some(e=>e.kind==="state"&&e.baton.duel?.status==="done"&&!("role" in e.baton.duel)&&!("can" in e.baton)));
 const w=(await obs.call("GET","/api/baton/watch")).json.watch;
 assert.equal(w.kind,"replay");assert.equal(verdict(w.seed,w.rounds).winner,0);assert.deepEqual(verdict(w.seed,w.rounds).wins,[overs.length,0]);
 const al=await adm({cmd:"alerts"});assert.ok(al.items.some(x=>x.key===`mythic:baton:${idOf(B.name)}`),"the admin sees the new bearer");
});

let deferred;
test("a deferred duel: the challenger alone, the bearer against his ghost, the replay, then the staff moves",async t=>{
 const sC=await opened(C);t.after(()=>sC.close());
 const r=await bat(C,{op:"challenge"});assert.equal(r.status,200,JSON.stringify(r.json));deferred=r.json.duel.id;
 assert.equal(r.json.baton.duel.status,"c_play");assert.equal(r.json.baton.duel.mode,"deferred");
 for(let n=0;n<BD.rounds;n++){
  const x=await playRound(C,deferred,n,{...STRONG,seed:30+n});
  assert.equal(x.over.w,null,"solo: no winner");assert.equal(x.over.wins,null);assert.deepEqual(x.opp,[]);assert.equal(x.over.next,n<BD.rounds-1);
 }
 assert.equal(duelRow(deferred).status,"b_wait");
 assert.ok(await until(()=>pushes(B)>=1),"the bearer is told to play");
 assert.equal((await me(C)).baton.duel.wins,null);
 assert.equal((await bat(C,{op:"ready",id:deferred})).json.error,"Ce n'est pas ton tour de jouer.");
 // The bearer: her rounds against the ghost, until one of them has two.
 let opp=0;
 for(let n=0;n<BD.rounds;n++){const x=await playRound(B,deferred,n,{...WEAK,seed:40+n});opp+=x.opp.length;assert.equal(x.over.w,0);if(!x.over.next)break;}
 assert.ok(opp>20,"the ghost's presses reach her");
 const row=duelRow(deferred);assert.equal(row.status,"scheduled");assert.ok(row.replay_at>Date.now()-2000&&row.ends_at>row.replay_at);
 // She knows, he does not, nor anyone: no seed, no recordings before the replay.
 assert.deepEqual((await me(B)).baton.duel.result,{winner:"c",how:"duel"});
 const vc=(await me(C)).baton.duel;assert.equal(vc.result,null);assert.equal(vc.wins,null);
 assert.equal((await bat(C,{op:"play",id:deferred,n:0,up:0,presses:[]})).status,422,"his rounds are closed to him now");
 const w0=(await obs.call("GET","/api/baton/watch")).json.watch;
 if(Date.now()<row.replay_at){assert.equal(w0.kind,"scheduled");assert.ok(!("seed" in w0)&&!("rounds" in w0));}
 assert.ok((await feed(obs)).some(e=>e.kind==="baton"&&/^📺 Le duel pour le Bâton de feu sera rediffusé (ce soir|demain soir) à 21 h : Defi C contre Defi B\.$/.test(e.text)));
 assert.ok(await until(()=>got(sObs,"baton").some(e=>e.kind==="replay"&&e.id===deferred),5000),"the replay starts for everyone");
 const w=(await obs.call("GET","/api/baton/watch")).json.watch;
 assert.equal(w.kind,"replay");assert.equal(verdict(w.seed,w.rounds).winner,0);assert.equal(w.rounds[0].c.length>0,true);
 assert.equal((await bat(obs,{op:"cheer",e:"fire",side:0})).status,200,"cheers during the replay");
 assert.equal(holder(),idOf(B.name),"nothing moves before the replay's end");
 assert.ok(await until(()=>holder()===idOf(C.name),60000),"the staff moves at the replay's end");
 assert.equal(duelRow(deferred).status,"done");
 assert.deepEqual((await me(obs)).baton.duel.result,{winner:"c",how:"duel"});
 assert.equal((await bat(B,{op:"challenge"})).json.error,"Un défi pour le Bâton par semaine : reviens dans 7 jours.");
});

let held;
test("the timing checks, a flagged part held for the admin, the judgement, the respite",async t=>{
 const sC=await opened(C);t.after(()=>sC.close());
 const r=await bat(Dd,{op:"challenge"});assert.equal(r.status,200,JSON.stringify(r.json));held=r.json.duel.id;
 assert.equal((await bat(C,{op:"answer",id:held,live:true})).status,200);
 const checks=async({up})=>{
  const bad=async body=>{const x=await bat(Dd,{op:"play",id:held,n:0,...body});assert.equal(x.status,422,JSON.stringify(body));assert.equal(x.json.error,"Rythme incohérent.");};
  await bad({up:up+20000,presses:[]});                        // ahead of the clock
  await bad({up,presses:[[up+100,0]]});                        // a press after the declared time
  await bad({up:Math.max(0,up-500),presses:[]});               // going back
  // a batch resent after a lost reply (presses older than what was declared): dropped, neither refused nor flagged
  if(up>200)assert.equal((await bat(Dd,{op:"play",id:held,n:0,up,presses:[[up-150,1]]})).status,200);
  assert.equal((await bat(Dd,{op:"play",id:held,n:0,up,presses:"x"})).status,400);
 };
 const overs=[];
 for(let n=0;n<BD.rounds;n++){
  const [rc,rb]=await Promise.all([playRound(Dd,held,n,{...WEAK,seed:50+n,hook:n===0?checks:null}),playRound(C,held,n,{...STRONG,seed:60+n})]);
  overs.push(rc.over);if(!rc.over.next)break;
 }
 assert.ok(overs.every(o=>o.w===1),"the bearer defends");
 const row=duelRow(held);assert.equal(row.status,"held");
 assert.deepEqual(JSON.parse(row.flags).map(x=>[x.side,x.name,x.n,x.flags]),[["c",Dd.name,0,["horloge"]]]);
 assert.equal(holder(),idOf(C.name));
 const al=(await adm({cmd:"alerts"})).items.find(x=>x.key===`baton:${held}`);
 assert.ok(al);assert.equal(al.kind,"baton");assert.equal(al.title,`Duel du Bâton à valider : ${Dd.name} contre ${C.name}`);assert.match(al.detail,/Defi D, manche 1 \(horloge\)/);
 assert.equal((await adm({cmd:"alerts-ack",keys:[`baton:${held}`]})).ok,true,"a valid alert key");
 assert.equal((await adm({cmd:"player",id:idOf(Dd.name)})).player.batonDuels[0].status,"held");
 assert.equal((await bat(E,{op:"challenge"})).json.error,"Un duel pour le Bâton est déjà en cours.","held: still open");
 assert.equal((await adm({cmd:"baton-judge",id:held})).ok,false,"accept is required");
 const before=pushes(Dd),j=await adm({cmd:"baton-judge",id:held,accept:true,via:"web"});
 assert.equal(j.ok,true,JSON.stringify(j));assert.equal(j.status,"done");assert.equal(j.winner,C.name);
 assert.equal((await adm({cmd:"baton-judge",id:held,accept:true})).ok,false,"once");
 assert.ok((await feed(obs)).some(e=>e.text===`🛡️ ${C.name} a défendu le Bâton de feu face à ${Dd.name}.`));
 assert.ok(await until(()=>pushes(Dd)===before+1),"the challenger is told");
 assert.ok((await adm({cmd:"audit"})).items.some(x=>x.cmd==="baton-judge"&&x.target===`#${held}`));
 assert.equal((await bat(E,{op:"challenge"})).json.error,"Le porteur a 3 jours de répit après sa défense.");
 assert.equal((await me(E)).baton.can,"Le porteur a 3 jours de répit après sa défense.");
});

test("the bearer silent for 48 h: the challenger takes the staff",async()=>{
 await down(()=>db.prepare("UPDATE baton_duels SET resolved=resolved-4*864e5,created=created-4*864e5 WHERE id=?").run(held));
 const r=await bat(E,{op:"challenge"});assert.equal(r.status,200,JSON.stringify(r.json));const id=r.json.duel.id;
 assert.equal(r.json.baton.duel.status,"c_play","the bearer is offline: deferred");
 for(let n=0;n<BD.rounds;n++)await playRound(E,id,n,{...STRONG,seed:70+n});
 assert.equal(duelRow(id).status,"b_wait",JSON.stringify(duelRow(id)));
 await down(()=>db.prepare("UPDATE baton_duels SET expires=? WHERE id=?").run(Date.now()-1000,id));
 assert.ok(await until(()=>holder()===idOf(E.name),8000),JSON.stringify({row:duelRow(id),holder:holder(),err:proc.err.slice(-2000)}));
 const row=duelRow(id);assert.equal(row.status,"forfeit");assert.equal(row.winner,idOf(E.name));
 assert.ok((await me(E)).state.wardrobe.own.includes("baton"));assert.ok(!(await me(C)).state.wardrobe.own.includes("baton"));
 assert.deepEqual((await me(obs)).baton.duel.result,{winner:"c",how:"forfeit"});
});

test("a Flamme under 200 warns the bearer once, under 150 it sends the staff back to the urn",async()=>{
 const p0=pushes(E);
 await down(()=>edit(E.name,S=>{S.flame.pts=180;}));
 assert.ok(await until(()=>db.prepare("SELECT warned FROM mythics").get()?.warned===1),"warned");
 assert.ok(await until(()=>pushes(E)===p0+1),"pushed once");
 const v=(await me(E)).baton;assert.equal(v.warn,true);assert.equal(v.flame,180);
 await sleep(600);assert.equal(pushes(E),p0+1,"only once");
 await down(()=>edit(E.name,S=>{S.flame.pts=100;}));
 assert.ok(await until(()=>holder()===null),"back in the urn");
 assert.ok(!(await me(E)).state.wardrobe.own.includes("baton"));
 assert.ok((await feed(obs)).some(e=>e.kind==="mythic"&&e.player===E.name&&e.text==="🔥 La flamme s'est éteinte : le Bâton de feu retourne dans l'urne…"));
 assert.ok((await adm({cmd:"audit"})).items.some(x=>x.cmd==="mythic-release"&&x.target===E.name&&/Flamme du porteur sous 150/.test(x.detail)));
 const vf=(await me(F)).baton;assert.equal(vf.holder,null);assert.ok(!("can" in vf),"nobody to challenge");
 assert.equal((await bat(F,{op:"challenge"})).json.error,"Le Bâton de feu est dans l'urne.");
});

test("a death sends the staff back; the owner's reset too, with every screen told",async t=>{
 await down(()=>giveStaff(F.name));
 await sleep(600);assert.equal(holder(),idOf(F.name),"a healthy bearer keeps it");
 await down(()=>edit(F.name,S=>{S.deaths=(S.deaths??0)+1;}));
 assert.ok(await until(()=>holder()===null),"a death: back in the urn");
 assert.ok((await adm({cmd:"audit"})).items.some(x=>x.cmd==="mythic-release"&&x.target===F.name&&/mort politique/.test(x.detail)));
 await down(()=>giveStaff(F.name));
 const s=await opened(obs);t.after(()=>s.close());
 // An open duel is void when the staff leaves.
 const r=await bat(G,{op:"challenge"});assert.equal(r.status,200,JSON.stringify(r.json));
 const reset=await adm({cmd:"mythic-reset"});assert.equal(reset.ok,true,JSON.stringify(reset));assert.equal(reset.name,F.name);
 assert.equal(holder(),null);assert.equal(duelRow(r.json.duel.id).status,"void");
 assert.ok(await until(()=>got(s,"baton").some(e=>e.kind==="freed")),"every screen hears it");
 assert.ok(!(await me(F)).state.wardrobe.own.includes("baton"));
 assert.ok((await adm({cmd:"audit"})).items.some(x=>x.cmd==="mythic-reset"&&x.target===F.name));
});
