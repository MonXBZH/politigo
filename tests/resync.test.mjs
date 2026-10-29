// resync(S, realNow): after a server outage the clock goes back to the REAL hour, missed hours are skipped, stats untouched (node --test).
// Pure rules tests first, then server tests (a real server process, with the database edited between two stops).
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as R from "../web/rules.mjs";

const {H}=R;
R.setTimeZone("Europe/Paris");
const MIDNIGHT=Date.UTC(2026,0,4,23,0);          // 00:00 in Paris (winter, UTC+1)
const at=(h)=>MIDNIGHT+h*H;
const MIN=60000;
const noRandom=()=>0.99;
function game(camp="left",h=10){return R.newGame(camp,at(h));}
const gauges=["sat","moral","energy","hyg"];
const UNTOUCHED=["sat","moral","energy","hyg","fm","xp","lvl","best","streak","bestStreak","neg","zero","form","mult","deaths","sleeping","equipped","born"];
const snap=S=>structuredClone(Object.fromEntries(UNTOUCHED.map(k=>[k,S[k]])));
const needs=()=>assert.equal(typeof R.resync,"function","R.resync is not implemented yet");
const syncs=S=>S.journal.filter(j=>j.k==="sync");

// ------------------------------------------------------------------ rules
test("R1 a non-finite real time returns 0 and leaves the state untouched",()=>{
 needs();
 for(const bad of [NaN,Infinity,-Infinity,undefined,null,"x"]){
  const S=game();const before=structuredClone(S);
  assert.equal(R.resync(S,bad),0,String(bad));
  assert.deepEqual(S,before,`unchanged for ${String(bad)}`);
 }
});

test("R2 a 5 h downtime: clock, hourIdx and lastReal jump to real time, skipped is returned in ms",()=>{
 needs();
 const S=game();const realNow=at(15)+7*MIN;
 const skipped=R.resync(S,realNow);
 assert.equal(skipped,realNow-at(10));
 assert.equal(S.vclock,realNow);assert.equal(S.lastReal,realNow);
 assert.equal(S.hourIdx,Math.floor(realNow/H));
});

test("R3 no stat is touched, whatever their values",()=>{
 needs();
 const S=game();
 Object.assign(S,{sat:41,moral:52,energy:63,hyg:7,fm:33,xp:123.5,lvl:4,best:6,streak:3,bestStreak:9,neg:2,zero:5,form:"Négligée",mult:0.5,deaths:2,sleeping:true,equipped:{"Olivier Faure":1}});
 const ref=snap(S);
 R.resync(S,at(10)+30*H);
 assert.deepEqual(snap(S),ref);
});

test("R4 a gap of 15 minutes or more writes exactly one sync journal entry",()=>{
 needs();
 for(const gap of [15*MIN,2*H,50*H]){
  const S=game();const n0=S.journal.length;
  const skipped=R.resync(S,at(10)+gap);
  assert.equal(skipped,gap);
  assert.equal(S.journal.length,n0+1,`one entry for ${gap}`);
  const e=S.journal[0];
  assert.equal(e.k,"sync");assert.equal(e.d.skipped,skipped);
  assert.match(e.text,/Maintenance/);assert.match(e.text,/Jauges inchangées/);
  assert.equal(e.t,S.vclock);
 }
});

test("R5 a gap under 15 minutes moves the clock but writes no journal entry",()=>{
 needs();
 for(const gap of [0,1,14*MIN,15*MIN-1]){
  const S=game();const n0=S.journal.length;
  assert.equal(R.resync(S,at(10)+gap),gap);
  assert.equal(S.journal.length,n0);assert.equal(syncs(S).length,0);
  assert.equal(S.vclock,at(10)+gap);
 }
});

test("R6 a state ahead of real time (test server) keeps its clock, returns 0 and records lastReal",()=>{
 needs();
 const S=game();S.vclock=at(10)+200*H;S.hourIdx=Math.floor(S.vclock/H);
 const v0=S.vclock,h0=S.hourIdx,n0=S.journal.length,realNow=at(11);
 assert.equal(R.resync(S,realNow),0);
 assert.equal(S.vclock,v0);assert.equal(S.hourIdx,h0);assert.equal(S.lastReal,realNow);
 assert.equal(S.journal.length,n0);
});

test("R7 resync is idempotent",()=>{
 needs();
 const S=game();const realNow=at(10)+9*H;
 assert.ok(R.resync(S,realNow)>0);
 const after1=structuredClone(S);
 assert.equal(R.resync(S,realNow),0);
 assert.deepEqual(S,after1);assert.equal(syncs(S).length,1,"no second entry");
});

test("R8 after resync, advance plays exactly one hour for one real hour: the missed hours were skipped",()=>{
 needs();
 const S=game();const realNow=at(10)+40*H+5*MIN;
 R.resync(S,realNow);
 const h0=S.hourIdx;
 R.advance(S,realNow+H,1,noRandom);
 assert.equal(S.hourIdx,h0+1);
 // control: without resync, the same advance would have replayed the whole outage
 // (it drains the gauges, and may even kill the companion, which restarts its hour counter)
 const C=game();R.advance(C,realNow+H,1,noRandom);
 assert.ok(C.deaths>0||C.sat<S.sat,"control: no resync means many hours replayed");
});

test("R9 a neglected companion (all gauges 0, zero=11) survives a 3-day downtime, on the real hour of day",()=>{
 needs();
 const S=game();gauges.forEach(g=>S[g]=0);S.zero=11;
 const realNow=at(10)+3*24*H+25*MIN;
 R.resync(S,realNow);
 assert.equal(S.deaths,0);assert.equal(S.zero,11);gauges.forEach(g=>assert.equal(S[g],0));
 const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",hour:"2-digit",hourCycle:"h23"}).format(realNow));
 assert.equal(R.hodOf(R.curIdx(S)),hour);
});

test("R10 sanitize then resync of a JSON round-trip works",()=>{
 needs();
 const S=game();S.sat=33;S.fm=21;
 const back=R.sanitize(JSON.parse(JSON.stringify(S)),at(10)+H);
 assert.ok(back);
 const realNow=at(10)+6*H;
 let skipped;
 assert.doesNotThrow(()=>{skipped=R.resync(back,realNow);});
 assert.equal(skipped,realNow-S.vclock,"sanitize keeps the saved clock, so the whole gap is skipped");
 assert.equal(back.vclock,realNow);assert.equal(back.sat,33);assert.equal(back.fm,21);
 assert.equal(syncs(back).length,1);
 // and the result survives another round-trip
 assert.ok(R.sanitize(JSON.parse(JSON.stringify(back)),realNow+H));
});

// ------------------------------------------------------------------ server
const BASE_PORT=3970,INVITE="code-secret-de-test-123";
const off=((14-new Date().getUTCHours()+36)%24)-12,DAY_TZ=off>=0?`Etc/GMT-${off}`:`Etc/GMT+${-off}`;
let DIR;
before(()=>{DIR=mkdtempSync(join(tmpdir(),"pg-resync-"));});
const procs=new Set();
after(()=>{for(const p of procs)p.kill("SIGTERM");});
function boot(port,extra={}){
 const env={...process.env,PORT:String(port),DB_PATH:join(DIR,`${port}.db`),POLITIGO_INVITE:INVITE,COOKIE_SECURE:"0",
  PROXY_HOPS:"1",SWEEP_MS:"200",POLITIGO_SPEED:"1",POLITIGO_TZ:DAY_TZ,...extra};
 for(const k of Object.keys(env))if(env[k]===undefined)delete env[k];
 const p=spawn("node",[process.env.SERVER||"/app/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";procs.add(p);p.stderr.on("data",d=>{p.out+=d;});
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo API/.test(p.out))ok(p);});p.on("exit",code=>ko(new Error("server exited "+code+"\n"+p.out)));});
}
const stop=p=>new Promise(r=>{if(p.exitCode!==null){r();return;}p.on("exit",r);p.kill();});
function client(port,ip){
 let cookie="";const base=`http://127.0.0.1:${port}`;
 const call=async(method,path,body)=>{
  const r=await fetch(base+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),"X-Forwarded-For":ip},
   body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0];
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json};
 };
 return {call};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,ms=15000){const end=Date.now()+ms;let last;for(;;){last=await fn();if(last||Date.now()>end)return last;await sleep(150);}}

// Registers a player, stops the server, lets `edit` rewrite the stored state, reboots, and returns {me, board, p}.
async function outage(port,name,edit){
 let p=await boot(port);
 const c=client(port,"10.7.0.1");
 const r=await c.call("POST","/api/register",{name,password:"motdepasse1",invite:INVITE,camp:"left"});
 assert.equal(r.status,201,JSON.stringify(r.json));
 await stop(p);
 const db=new DatabaseSync(join(DIR,`${port}.db`));
 const row=db.prepare("SELECT id,state FROM players WHERE name=?").get(name);
 const st=JSON.parse(row.state);
 edit(st);
 db.prepare("UPDATE players SET state=? WHERE id=?").run(JSON.stringify(st),row.id);
 db.close();
 p=await boot(port);
 const login=await c.call("POST","/api/login",{name,password:"motdepasse1"});
 assert.equal(login.status,200);
 return {p,c,port};
}
const past=(st,ms)=>{const t=Date.now()-ms;st.vclock=t;st.lastReal=t;st.hourIdx=Math.floor(t/H);};
// These tests need no real hour to tick while they run (a tick drains, or kills the zero=11 companion): near
// the top of an hour, wait for the next one to begin.
async function awayFromHourEdge(){const left=H-Date.now()%H;if(left<30000)await sleep(left+2000);}

test("S1 server: a 5 h outage is skipped, gauges and fm untouched, a sync entry is journaled, nothing public",async()=>{
 await awayFromHourEdge();
 const {p,c}=await outage(BASE_PORT,"Resync",st=>{
  past(st,5*H);Object.assign(st,{sat:40,moral:50,energy:60,hyg:70,fm:33});
 });
 try{
  await sleep(1200);                                   // let several sweeps run
  const me=await poll(async()=>{const r=await c.call("GET","/api/me");return r.status===200&&r.json.state.journal[0]?.k==="sync"?r.json:null;});
  assert.ok(me,"journal[0] should become a sync entry");
  const s=me.state;
  assert.ok(Math.abs(s.vclock-Date.now())<8000,`vclock ${Date.now()-s.vclock} ms behind real time`);
  assert.deepEqual([s.sat,s.moral,s.energy,s.hyg,s.fm],[40,50,60,70,33]);
  assert.equal(s.deaths,0);
  assert.equal(s.journal.filter(j=>j.k==="sync").length,1);
  assert.match(s.journal[0].text,/Maintenance/);
  assert.ok(s.journal[0].d.skipped>=4.9*H&&s.journal[0].d.skipped<=5.1*H);
  const b=await c.call("GET","/api/board");
  assert.equal(b.status,200);
  assert.ok(!b.json.feed.some(f=>f.kind==="sync"),"no sync entry in the public feed");
  assert.ok(!JSON.stringify(b.json.feed).includes("Maintenance"));
 }finally{await stop(p);}
});

test("S2 server: a neglected companion (zero=11, gauges 0) survives 2 days of downtime",async()=>{
 await awayFromHourEdge();
 const {p,c}=await outage(BASE_PORT+1,"Negligé",st=>{
  past(st,48*H);Object.assign(st,{sat:0,moral:0,energy:0,hyg:0,zero:11});
 });
 try{
  const me=await poll(async()=>{const r=await c.call("GET","/api/me");return r.status===200&&r.json.state.journal[0]?.k==="sync"?r.json:null;});
  assert.ok(me,"journal[0] should become a sync entry");
  await sleep(1000);
  const s=(await c.call("GET","/api/me")).json.state;
  assert.equal(s.deaths,0);
  assert.ok(s.zero<=11,"no extra zero hour was played during the outage: "+s.zero);
  assert.ok(Math.abs(s.vclock-Date.now())<8000);
 }finally{await stop(p);}
});

test("S3 server: a host clock behind the last save (no time sync yet) stops the server before any game is touched",async()=>{
 const port=BASE_PORT+2;let p=await boot(port);
 const c=client(port,"10.7.0.3");
 assert.equal((await c.call("POST","/api/register",{name:"Horloge",password:"motdepasse1",invite:INVITE,camp:"left"})).status,201);
 await stop(p);
 const file=join(DIR,`${port}.db`),db=new DatabaseSync(file);
 db.prepare("UPDATE players SET updated=?").run(Date.now()+3*H);         // the last save is "in the future"
 const before=db.prepare("SELECT state FROM players").get().state;db.close();
 await assert.rejects(boot(port),e=>/exited 1/.test(e.message)&&/Host clock looks wrong/.test(e.message));
 const d2=new DatabaseSync(file);assert.equal(d2.prepare("SELECT state FROM players").get().state,before,"no game was touched");d2.close();
 p=await boot(port,{POLITIGO_TRUST_CLOCK:"1"});                        // the owner says the date is right
 await stop(p);
});
