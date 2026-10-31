// Presence and held pushes: a real server (fetch stubbed by tests/stub-fetch.mjs, nothing leaves the machine).
// Online = an open live stream, shown on the board and in the duel opponents (online first). A push meant for a
// player in a Pong, a mini-game or their own duel turn waits until the game is over.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,debateTurn,until,sleep,keys,FCM} from "./server-helpers.mjs";

const PORT=3920;
let proc,DB,LOG;
before(async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgpr-"));LOG=join(dir,"fetch.log");writeFileSync(LOG,"");
 proc=await boot(PORT,dir,{NODE_OPTIONS:"--import /w/tests/stub-fetch.mjs",STUB_FETCH_LOG:LOG});
 DB=new DatabaseSync(join(dir,"t.db"),{timeout:5000});
});
after(async()=>{try{DB.close();}catch{}await stop(proc);});

const fetched=()=>readFileSync(LOG,"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l).url);
const pushed=ep=>fetched().includes(FCM+ep);
const subscribe=async(c,ep)=>assert.equal((await c.call("POST","/api/push/subscribe",{endpoint:FCM+ep,keys:keys()})).status,200);
const act=(c,body)=>c.call("POST","/api/action",body);
const duel=(c,body)=>c.call("POST","/api/duel",body);
const ago=(col,id,ms=2300)=>DB.prepare(`UPDATE duels SET ${col}=${col}-? WHERE id=?`).run(ms,id);
// a challenges b and plays a turn (POST /api/debate): b is told. Returns the duel.
async function challenged(a,b){
 const ch=await duel(a,{op:"challenge",name:b.name});assert.equal(ch.status,200,JSON.stringify(ch.json));
 const sub=await debateTurn(a,ch.json.duel.id);
 assert.equal(sub.status,200,JSON.stringify(sub.json));assert.equal(sub.json.result.status,"pending");
 return ch.json.duel;
}
// The live stream of one player, collected in the background.
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
const rowOf=(rows,name)=>rows.find(r=>r.name===name);
const boardRow=async(c,name)=>rowOf((await c.call("GET","/api/board")).json.board,name);

test("presence: an open stream is online on the board and in the opponents; closing it goes offline live",async t=>{
 const a=await player(PORT,"Présent A"),w=await player(PORT,"Témoin W");
 const open=[];t.after(()=>{for(const s of open)s.close();});   // even on a failure: no stream leaks into the next test
 const row=await boardRow(w,"Présent A");
 assert.equal(row.online,false,"no stream yet");
 assert.equal(rowOf((await w.call("GET","/api/duels")).json.opponents,"Présent A").online,false);
 const sw=stream(w);open.push(sw);await until(()=>sw.events.some(e=>e.ev==="board"));
 assert.equal(rowOf(sw.events.find(e=>e.ev==="board").data,"Témoin W").online,true,"one's own first board shows oneself online");
 const sa=stream(a);open.push(sa);
 assert.ok(await until(()=>sw.events.some(e=>e.ev==="board"&&rowOf(e.data,"Présent A")?.online===true)),"the others see A come online");
 assert.equal((await boardRow(w,"Présent A")).online,true);
 const opp=rowOf((await w.call("GET","/api/duels")).json.opponents,"Présent A");
 assert.equal(opp.online,true);
 // Only a boolean: no time of any kind.
 assert.deepEqual(Object.keys(row).filter(k=>/seen|last|time|at$/i.test(k)),[]);
 // A second tab is no news; closing one of two keeps A online.
 const n=sw.events.length,sa2=stream(a);open.push(sa2);await until(()=>sa2.events.some(e=>e.ev==="board"));
 sa.close();await sleep(300);
 assert.equal((await boardRow(w,"Présent A")).online,true,"still one stream open");
 assert.ok(!sw.events.slice(n).some(e=>e.ev==="board"&&rowOf(e.data,"Présent A")?.online===false));
 // Only the boards sent after the close: the very first one, from before A came online, also shows A offline.
 const m=sw.events.length;sa2.close();
 assert.ok(await until(()=>sw.events.slice(m).some(e=>e.ev==="board"&&rowOf(e.data,"Présent A")?.online===false)),"the last stream closed: offline for everyone");
 assert.equal((await boardRow(w,"Présent A")).online,false);
 assert.equal(rowOf((await w.call("GET","/api/duels")).json.opponents,"Présent A").online,false);
});

test("opponents: online first, by name inside each group",async()=>{
 const me=await player(PORT,"Trieur"),names=["Zoé En Ligne","Albert Absent","Bruno En Ligne","Yves Absent"];
 const cs=[];for(const n of names)cs.push(await player(PORT,n));
 const ss=[stream(cs[0]),stream(cs[2])];
 // The order is checked on this test's own players only: a stream from another test may still be closing.
 const mine=async()=>(await me.call("GET","/api/duels")).json.opponents.filter(o=>names.includes(o.name));
 await until(async()=>(await mine()).filter(o=>o.online).length===2);
 const all=(await me.call("GET","/api/duels")).json.opponents,fo=all.findIndex(o=>!o.online);
 assert.ok(fo<0||all.slice(fo).every(o=>!o.online),"online first: "+all.map(o=>o.name+":"+o.online).join(", "));
 const opp=await mine();
 const on=opp.filter(o=>o.online).map(o=>o.name),first=opp.findIndex(o=>!o.online);
 assert.deepEqual(on,["Bruno En Ligne","Zoé En Ligne"]);
 assert.ok(opp.slice(0,first).every(o=>o.online)&&opp.slice(first).every(o=>!o.online),"online first: "+opp.map(o=>o.name+":"+o.online).join(", "));
 const off=opp.slice(first).map(o=>o.name);
 assert.deepEqual(off,[...off].sort((a,b)=>a.localeCompare(b,"fr")));
 assert.ok(off.indexOf("Albert Absent")<off.indexOf("Yves Absent"));
 for(const s of ss)s.close();
});

test("a challenge to a defender in a Pong is pushed after pongEnd; one not in a game gets it at once",async()=>{
 const a=await player(PORT,"Défieur Pong"),d=await player(PORT,"Pongiste","right"),e=await player(PORT,"Libre","right");
 await subscribe(d,"pongiste");await subscribe(e,"libre");
 const ps=await act(d,{type:"pongStart"});assert.equal(ps.status,200);
 const sd=stream(d);await until(()=>sd.events.some(e=>e.ev==="me"));
 await challenged(a,d);await challenged(a,e);
 assert.ok(await until(()=>sd.events.some(e=>e.ev==="duel"&&e.data.kind==="challenged")),"the live event is not held: only the push is");sd.close();
 assert.ok(await until(()=>pushed("libre")),"not in a game: pushed at once");
 await sleep(500);   // a couple of sweeps
 assert.ok(!pushed("pongiste"),"held during the Pong");
 await sleep(1800);   // the Pong minimum length
 const end=await act(d,{type:"pongEnd",score:1,id:ps.json.game.id});assert.equal(end.status,200,JSON.stringify(end.json));
 assert.ok(await until(()=>pushed("pongiste")),"pushed once the Pong is over");
 assert.equal(fetched().filter(u=>u===FCM+"pongiste").length,1,"once");
});

test("a duel result for a challenger in a mini-game waits for miniEnd",async()=>{
 const a=await player(PORT,"Joueur Mini"),b=await player(PORT,"Répondeur","right");
 await subscribe(a,"joueur-mini");
 const {id}=await challenged(a,b);
 const ms=await act(a,{type:"manifStart"});assert.equal(ms.status,200,JSON.stringify(ms.json));
 assert.equal((await duel(b,{op:"accept",id})).status,200);
 const sub=await debateTurn(b,id);assert.equal(sub.status,200,JSON.stringify(sub.json));assert.equal(sub.json.result.status,"done");
 await sleep(500);
 assert.ok(!pushed("joueur-mini"),"held during the mini-game");
 const end=await act(a,{type:"miniEnd",score:0,id:ms.json.game.id});assert.equal(end.status,200,JSON.stringify(end.json));
 assert.ok(await until(()=>pushed("joueur-mini")),"pushed once the mini-game is over");
});

test("a player on their own duel turn: held, then sent by the sweep once the clock closed the turn",async()=>{
 const a=await player(PORT,"Premier"),d=await player(PORT,"Au Pupitre","right"),x=await player(PORT,"Second");
 await subscribe(d,"pupitre");
 const first=await challenged(a,d),count=()=>fetched().filter(u=>u===FCM+"pupitre").length;
 assert.ok(await until(()=>count()===1),"the first challenge, pushed at once");
 assert.equal((await duel(d,{op:"accept",id:first.id})).status,200);   // d is now playing (d_play)
 await challenged(x,d);
 await sleep(500);
 assert.equal(count(),1,"held during the duel turn");
 ago("d_started",first.id,10*60e3);   // the turn ran out: the sweep forfeits it, then sends what was held
 assert.ok(await until(()=>count()===2),"sent by the sweep");
 assert.equal(DB.prepare("SELECT status FROM duels WHERE id=?").get(first.id).status,"done");
});

test("a deleted player's held pushes are dropped",async()=>{
 const a=await player(PORT,"Défieur Suppr"),d=await player(PORT,"Partant","right");
 await subscribe(d,"partant");
 assert.equal((await act(d,{type:"pongStart"})).status,200);
 await challenged(a,d);
 assert.equal((await d.call("DELETE","/api/account",{password:"motdepasse1"})).status,200);
 await sleep(600);
 assert.ok(!pushed("partant"));
});

test("presence: a burst of reconnects is grouped into one board, and a reconnect loop is cut off",async()=>{
 const a=await player(PORT,"Rebond R"),w=await player(PORT,"Guetteur G");
 const sw=stream(w);await until(()=>sw.events.some(e=>e.ev==="board"));await sleep(200);
 const n=sw.events.filter(e=>e.ev==="board").length;
 // Ten open/close cycles in a row: the watcher gets a handful of boards at most, not twenty.
 for(let i=0;i<10;i++){const s=stream(a);await until(()=>s.events.some(e=>e.ev==="board"));s.close();await sleep(10);}
 await sleep(300);
 assert.ok(sw.events.filter(e=>e.ev==="board").length-n<=8,"presence changes are coalesced");
 // 30 connections a minute, then 429.
 let refused=0;
 for(let i=0;i<25;i++){const r=await fetch(`http://127.0.0.1:${PORT}/events`,{headers:{Cookie:a.cookie}});if(r.status===429)refused++;r.body?.cancel().catch(()=>{});}
 assert.ok(refused>0,"too many reconnections are refused");
 sw.close();
});
