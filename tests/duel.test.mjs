// Duel and push-subscription tests: a real server on a temporary database, driven over HTTP (node --test).
// Run inside the API image layout: server.mjs, rules.mjs and push.mjs side by side (see tests/run-server.sh).
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,statSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import crypto from "node:crypto";
import * as R from "../web/rules.mjs";

const PORT=3910,OFF_PORT=3911,INVITE="code-secret-de-test-123",PW="motdepasse1";
// The server runs in a time zone where it is early afternoon right now: daytime-only actions are always testable.
const off=((14-new Date().getUTCHours()+36)%24)-12,DAY_TZ=off>=0?`Etc/GMT-${off}`:`Etc/GMT+${-off}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let proc,DIR,DB;
function boot(port,dir,extra={}){
 const env={...process.env,PORT:String(port),DB_PATH:join(dir,"t.db"),POLITIGO_INVITE:INVITE,COOKIE_SECURE:"0",PROXY_HOPS:"1",SWEEP_MS:"200",
  POLITIGO_SPEED:"1",POLITIGO_TZ:DAY_TZ,POLITIGO_ADMIN_SOCKET:"off",POLITIGO_DUEL_MIN_LEVEL:"1",POLITIGO_DUEL_MIN_AGE_H:"0",...extra};
 const p=spawn("node",[process.env.SERVER||"/app/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";p.err="";p.stderr.on("data",d=>{p.err+=d;});
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo API/.test(p.out))ok(p);});p.on("exit",code=>ko(new Error("server exited "+code+": "+p.err)));});
}
before(async()=>{DIR=mkdtempSync(join(tmpdir(),"pgd-"));proc=await boot(PORT,DIR);DB=new DatabaseSync(join(DIR,"t.db"),{timeout:5000});});
after(()=>{try{DB.close();}catch{}proc.kill("SIGTERM");});

// A tiny cookie-keeping client per player, each from its own address (sign-ups are limited per address).
let ipSeq=0;
function client(port=PORT){
 let cookie="";const ip=`10.9.${ipSeq>>8}.${ipSeq++&255}`;
 const call=async(method,path,body)=>{
  const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),"X-Forwarded-For":ip},
   body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0].endsWith("=")?"":set.split(";")[0];
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json};
 };
 return {call,port,get cookie(){return cookie;}};
}
async function player(name,camp="left",port=PORT){
 const c=client(port),r=await c.call("POST","/api/register",{name,password:PW,invite:INVITE,camp});
 assert.equal(r.status,201,JSON.stringify(r.json));c.name=name;c.camp=camp;return c;
}
// Picks as the browser records them: [answer shown, ms since play started], the right answer for the camp unless wrong.
function picksFor(seed,camp,{n=3,wrong=[],gap=300}={}){
 return R.debateRounds(R.seeded(seed),n).map((r,k)=>[r.order.indexOf(R.ANSWER_KINDS.indexOf(wrong.includes(k)?"decoy":camp)),k*gap]);
}
const duel=(c,body)=>c.call("POST","/api/duel",body);
const duels=c=>c.call("GET","/api/duels");
const find=async(c,id)=>(await duels(c)).json.duels.find(d=>d.id===id);
const top=async c=>(await c.call("GET","/api/me")).json.state.journal[0];
const feedTexts=async c=>(await c.call("GET","/api/board")).json.feed.map(f=>f.text);
// Challenge and play a valid turn: returns the duel id and seed.
async function challenged(a,b,opts={}){
 const ch=await duel(a,{op:"challenge",name:b.name});assert.equal(ch.status,200,JSON.stringify(ch.json));
 await sleep(2300);   // the 1.3 s countdown plus the last pick (600 ms)
 const sub=await duel(a,{op:"submit",id:ch.json.duel.id,picks:picksFor(ch.json.duel.seed,a.camp,opts)});
 assert.equal(sub.status,200,JSON.stringify(sub.json));
 return ch.json.duel;
}
// The live stream of one player, collected in the background.
function stream(c){
 const ac=new AbortController(),events=[];
 fetch(`http://127.0.0.1:${c.port}/events`,{headers:{Cookie:c.cookie},signal:ac.signal}).then(async r=>{
  const dec=new TextDecoder();let buf="";
  for await(const chunk of r.body){
   buf+=dec.decode(chunk,{stream:true});let i;
   while((i=buf.indexOf("\n\n"))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);
    const ev=/^event: (.*)$/m.exec(block)?.[1],data=/^data: (.*)$/m.exec(block)?.[1];if(ev)events.push({ev,data:data&&JSON.parse(data)});}
  }
 }).catch(()=>{});
 return {events,close:()=>ac.abort()};
}
async function until(fn,ms=3000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(50);}return null;}

test("a full duel: challenge, play, the defender answers blind, both candidates change and the feed tells",async()=>{
 const a=await player("Duelliste A"),b=await player("Duelliste B","right"),z=await player("Badaud");
 const list=await duels(a);
 assert.equal(list.status,200);assert.equal(list.json.ok,true);assert.equal(list.json.perDay,3);assert.equal(list.json.sent,0);
 assert.equal(typeof list.json.pushKey,"string");assert.equal(Buffer.from(list.json.pushKey,"base64url").length,65);
 const rowB=list.json.opponents.find(o=>o.name==="Duelliste B");
 assert.deepEqual(Object.keys(rowB).sort(),["camp","candidate","lvl","name","ok","why"]);
 assert.equal(rowB.ok,true);assert.equal(rowB.why,"");assert.equal(rowB.camp,"right");assert.equal(rowB.candidate,R.people.right[0].name);
 assert.ok(!list.json.opponents.some(o=>o.name==="Duelliste A"),"never oneself");

 const ch=await duel(a,{op:"challenge",name:"duelliste b"});
 assert.equal(ch.status,200);assert.equal(typeof ch.json.duel.id,"number");assert.ok(Number.isInteger(ch.json.duel.seed));assert.equal(ch.json.me.name,"Duelliste A");
 const {id,seed}=ch.json.duel;
 assert.equal((await duels(a)).json.sent,1,"counted as soon as it is sent");
 assert.equal((await find(a,id)).status,"c_play");
 assert.equal(await find(b,id),undefined,"the defender is not told before the challenger has a score");
 assert.equal((await duel(b,{op:"accept",id})).status,422);
 assert.equal((await duel(b,{op:"submit",id,picks:[]})).status,422,"not the defender's turn");
 for(const op of ["accept","refuse","submit"])assert.equal((await duel(z,{op,id,picks:[]})).json.error,"Duel introuvable.",`outsider ${op}`);

 const sb=stream(b);await until(()=>sb.events.some(e=>e.ev==="me"));
 await sleep(2300);   // the 1.3 s countdown plus the last pick (600 ms)
 const sub=await duel(a,{op:"submit",id,picks:picksFor(seed,"left")});
 assert.equal(sub.status,200,JSON.stringify(sub.json));
 assert.deepEqual({score:sub.json.score,errors:sub.json.errors,status:sub.json.status,mine:sub.json.mine,theirs:sub.json.theirs,res:sub.json.res},
  {score:3,errors:0,status:"pending",mine:3,theirs:null,res:null});
 const ev=await until(()=>sb.events.find(e=>e.ev==="duel"));sb.close();
 assert.deepEqual(ev?.data,{id,kind:"challenged",role:"defender",vs:"Duelliste A"});
 assert.ok((await feedTexts(a)).includes("Duelliste A défie Duelliste B au Débat chrono."));

 const seen=await find(b,id);
 assert.equal(seen.role,"defender");assert.equal(seen.status,"pending");assert.equal(seen.vs,"Duelliste A");
 assert.equal(seen.mine,null);assert.equal(seen.theirs,null,"the challenger's score stays hidden");assert.equal(seen.res,null);
 assert.ok(seen.expires>Date.now()+23*3600e3);
 assert.equal((await duel(a,{op:"submit",id,picks:picksFor(seed,"left")})).status,422,"no second turn");

 const moralB=(await b.call("GET","/api/me")).json.state.moral;
 const acc=await duel(b,{op:"accept",id});
 assert.equal(acc.status,200);assert.deepEqual(acc.json.duel,{id,seed},"the same debate");
 assert.equal((await find(b,id)).status,"d_play");
 await sleep(2300);   // the 1.3 s countdown plus the last pick (600 ms)
 const res=await duel(b,{op:"submit",id,picks:picksFor(seed,"right",{wrong:[1]})});
 assert.equal(res.status,200,JSON.stringify(res.json));
 assert.deepEqual({score:res.json.score,errors:res.json.errors,status:res.json.status,mine:res.json.mine,theirs:res.json.theirs,res:res.json.res},
  {score:2,errors:1,status:"done",mine:2,theirs:3,res:"loss"});
 assert.equal(res.json.me.state.journal[0].k,"duel");assert.equal(res.json.me.state.journal[0].d.res,"loss");
 assert.ok(res.json.me.state.moral<moralB,"the loser's moral drops");

 const won=await find(a,id);
 assert.deepEqual({role:won.role,status:won.status,mine:won.mine,theirs:won.theirs,res:won.res},{role:"challenger",status:"done",mine:3,theirs:2,res:"win"});
 const ja=await top(a);assert.equal(ja.k,"duel");assert.equal(ja.d.res,"win");assert.match(ja.text,/\+40 XP/);
 assert.ok((await a.call("GET","/api/me")).json.state.xp>=40);
 assert.equal((await find(b,id)).theirs,3,"revealed once done");
 assert.ok((await feedTexts(a)).includes("Duelliste A bat Duelliste B au Débat chrono, 3 à 2."));
 assert.equal(DB.prepare("SELECT paid FROM duels WHERE id=?").get(id).paid,1);
});

test("a refused challenge: the challenger gets the chicken, the defender's game is untouched",async()=>{
 const a=await player("Hardi","right"),b=await player("Frileux");
 const {id}=await challenged(a,b);
 const jn=(await b.call("GET","/api/me")).json.state.jn;
 const r=await duel(b,{op:"refuse",id});
 assert.equal(r.status,200);assert.equal(r.json.ok,true);assert.equal(r.json.me.name,"Frileux");
 assert.equal(r.json.me.state.jn,jn,"no journal entry for the defender");
 const mine=await find(a,id);assert.equal(mine.status,"refused");assert.equal(mine.res,"chicken");
 const theirs=await find(b,id);assert.equal(theirs.status,"refused");assert.equal(theirs.res,null);
 const j=await top(a);assert.equal(j.k,"duel");assert.equal(j.d.res,"chicken");assert.match(j.text,/Frileux a esquivé ton défi/);
 assert.equal((await duel(b,{op:"accept",id})).status,422,"too late to accept");
 assert.equal((await duel(b,{op:"refuse",id})).status,422,"refused once");
});

test("forged picks void the challenge, and the pair waits 24 h either way",async()=>{
 const a=await player("Tricheur"),b=await player("Victime");
 const ch=await duel(a,{op:"challenge",name:"Victime"});const {id,seed}=ch.json.duel;
 await sleep(2300);   // the 1.3 s countdown plus the last pick (600 ms)
 // Claimed after the time really spent playing.
 const r=await duel(a,{op:"submit",id,picks:picksFor(seed,"left",{gap:2000})});
 assert.equal(r.status,422);assert.equal(r.json.error,"Score refusé.");
 assert.equal((await find(a,id)).status,"void");assert.equal(await find(b,id),undefined);
 assert.equal((await duel(a,{op:"submit",id,picks:picksFor(seed,"left")})).status,422,"a void duel is over");
 assert.equal((await duel(a,{op:"challenge",name:"Victime"})).json.error,"Déjà un duel entre vous il y a moins de 24 h.");
 assert.equal((await duel(b,{op:"challenge",name:"Tricheur"})).json.error,"Déjà un duel entre vous il y a moins de 24 h.");
 const row=(await duels(b)).json.opponents.find(o=>o.name==="Tricheur");assert.equal(row.ok,false);assert.equal(row.why,"Déjà un duel entre vous il y a moins de 24 h");
 // Other forgeries, each on a fresh pair: faster than the screen allows, a bad shape, too many points for the time.
 for(const [i,bad] of [[1,s=>picksFor(s,"left",{gap:100})],[2,()=>[[0,0],[1]]],[3,s=>picksFor(s,"left",{n:12,gap:250})],[4,()=>"oops"]].entries()){
  const x=await player("Faussaire "+i),y=await player("Cible "+i);
  const c=await duel(x,{op:"challenge",name:y.name});await sleep(2300);   // the 1.3 s countdown plus the last pick (600 ms)
  assert.equal((await duel(x,{op:"submit",id:c.json.duel.id,picks:bad[1](c.json.duel.seed)})).status,422,"forgery "+bad[0]);
 }
 // A forged defender forfeits: the duel ends, scored 0.
 const c2=await player("Honnête"),d2=await player("Filou");
 const {id:id2}=await challenged(c2,d2);
 assert.equal((await duel(d2,{op:"accept",id:id2})).status,200);await sleep(300);
 assert.equal((await duel(d2,{op:"submit",id:id2,picks:[[0,0],[0,1]]})).status,422);
 const done=await find(d2,id2);assert.equal(done.status,"done");assert.equal(done.mine,0);assert.equal(done.res,"loss");
 assert.equal((await find(c2,id2)).res,"win");
});

test("waiting before sending never raises the human-pace cap: 60 perfect answers are refused",async()=>{
 const a=await player("Pressé"),b=await player("Témoin");
 const ch=await duel(a,{op:"challenge",name:b.name});const {id,seed}=ch.json.duel;
 await sleep(25500);   // a cap counted on the elapsed time (24 s of "play") would allow 61
 const r=await duel(a,{op:"submit",id,picks:picksFor(seed,"left",{n:60,gap:250})});
 assert.equal(r.status,422);assert.equal(r.json.error,"Score refusé.");
 assert.equal((await find(a,id)).status,"void");
});

test("limits: one open duel per pair, three challenges a day",async()=>{
 const p=await player("Limité"),q=[];for(let i=1;i<=4;i++)q.push(await player("Proie "+i));
 assert.equal((await duel(p,{op:"challenge",name:"Proie 1"})).status,200);
 assert.equal((await duel(q[0],{op:"challenge",name:"Limité"})).json.error,"Duel déjà en cours.");
 assert.equal((await duels(q[0])).json.opponents.find(o=>o.name==="Limité").why,"Duel déjà en cours");
 assert.equal((await duel(p,{op:"challenge",name:"Proie 1"})).json.error,"Duel déjà en cours.");
 assert.equal((await duel(p,{op:"challenge",name:"Proie 2"})).status,200);
 assert.equal((await duel(p,{op:"challenge",name:"Proie 3"})).status,200);
 const no=await duel(p,{op:"challenge",name:"Proie 4"});
 assert.equal(no.status,422);assert.equal(no.json.ok,false);assert.equal(no.json.error,"Plus de défis aujourd'hui.");
 const l=(await duels(p)).json;
 assert.equal(l.sent,3);assert.ok(l.opponents.every(o=>!o.ok&&o.why==="Plus de défis aujourd'hui"));
 assert.equal((await duel(p,{op:"challenge",name:"Personne"})).json.error,"Adversaire introuvable.");
 assert.equal((await duel(p,{op:"challenge",name:"Limité"})).json.error,"Adversaire introuvable.","not oneself");
 assert.equal((await duel(p,{op:"dance"})).status,400);
 assert.equal((await duel(p,{op:"accept",id:"1"})).json.error,"Duel introuvable.");
 assert.equal((await client().call("POST","/api/duel",{op:"challenge",name:"Proie 4"})).status,401);
 assert.equal((await client().call("GET","/api/duels")).status,401);
});

test("an asleep candidate can neither challenge nor accept, but can always refuse",async()=>{
 const a=await player("Réveillé"),b=await player("Dormeur");
 const {id}=await challenged(a,b);
 assert.equal((await b.call("POST","/api/action",{type:"light"})).json.on,true);
 const no=await duel(b,{op:"challenge",name:"Réveillé"});
 assert.equal(no.status,422);assert.match(no.json.error,/sieste/);
 assert.ok((await duels(b)).json.opponents.every(o=>!o.ok&&/sieste/.test(o.why)));
 assert.match((await duel(b,{op:"accept",id})).json.error,/sieste/);
 assert.equal((await find(b,id)).status,"pending");
 assert.equal((await duel(b,{op:"refuse",id})).status,200);
});

test("the clock closes duels: unanswered challenges expire, unfinished turns end",async()=>{
 const a=await player("Patient"),b=await player("Absent"),c=await player("Lent"),d=await player("Distrait");
 const {id}=await challenged(a,b);
 DB.prepare("UPDATE duels SET expires=1 WHERE id=?").run(id);
 assert.ok(await until(async()=>(await find(a,id)).status==="expired"));
 assert.equal((await find(a,id)).res,"chicken");assert.equal((await find(b,id)).res,null);
 assert.equal((await top(a)).d.res,"chicken");
 const {id:id2}=await challenged(c,d);
 assert.equal((await duel(d,{op:"accept",id:id2})).status,200);
 DB.prepare("UPDATE duels SET d_started=1 WHERE id=?").run(id2);
 assert.ok(await until(async()=>(await find(c,id2)).status==="done"));
 assert.equal((await find(c,id2)).res,"win");assert.equal((await find(d,id2)).mine,0);
 const ch=await duel(a,{op:"challenge",name:"Lent"});
 DB.prepare("UPDATE duels SET c_started=1 WHERE id=?").run(ch.json.duel.id);
 assert.ok(await until(async()=>(await find(a,ch.json.duel.id)).status==="void"));
});

test("a deleted account mid-duel takes its duels away and breaks nothing",async()=>{
 const a=await player("Survivant"),b=await player("Partant"),c=await player("Fuyard"),d=await player("Restant");
 const {id}=await challenged(a,b);
 assert.equal((await b.call("DELETE","/api/account",{password:PW})).status,200);
 assert.equal(await find(a,id),undefined);
 assert.ok(!(await duels(a)).json.opponents.some(o=>o.name==="Partant"));
 const {id:id2}=await challenged(c,d);
 assert.equal((await duel(d,{op:"accept",id:id2})).status,200);
 assert.equal((await c.call("DELETE","/api/account",{password:PW})).status,200);
 assert.equal((await duel(d,{op:"submit",id:id2,picks:[]})).json.error,"Duel introuvable.");
 await sleep(500);
 assert.equal((await d.call("GET","/api/health")).status,200);
});

// Valid browser keys, made the way a browser makes them.
const keys=()=>({p256dh:crypto.createECDH("prime256v1").generateKeys().toString("base64url"),auth:crypto.randomBytes(16).toString("base64url")});
const FCM="https://fcm.googleapis.com/fcm/send/";
test("push subscriptions: push services only, own rows only, five devices at most",async()=>{
 const st=statSync(join(DIR,"vapid.json"));assert.equal(st.mode&0o777,0o600,"the VAPID key is private");
 const a=await player("Abonné"),b=await player("Voisin");
 const subs=id=>DB.prepare("SELECT endpoint FROM push_subs WHERE player_id=(SELECT id FROM players WHERE name=?) ORDER BY id").all(id).map(r=>r.endpoint);
 assert.equal((await a.call("POST","/api/push/subscribe",{endpoint:FCM+"a1",keys:keys()})).status,200);
 assert.deepEqual(subs("Abonné"),[FCM+"a1"]);
 for(const endpoint of ["http://fcm.googleapis.com/x","https://evil.com/x","https://fcm.googleapis.com.evil.com/x","https://user:pass@fcm.googleapis.com/x",
  "https://fcm.googleapis.com:8443/x","https://127.0.0.1/x","https://[::1]/x",FCM+"x".repeat(1000),42])
  assert.equal((await a.call("POST","/api/push/subscribe",{endpoint,keys:keys()})).status,400,String(endpoint).slice(0,60));
 for(const k of [{p256dh:"AAAA",auth:keys().auth},{p256dh:keys().p256dh,auth:"AAAA"},{p256dh:Buffer.alloc(65,4).toString("base64url"),auth:keys().auth},null])
  assert.equal((await a.call("POST","/api/push/subscribe",{endpoint:FCM+"bad",keys:k})).status,400);
 // Unsubscribing someone else's endpoint does nothing; signing in on the same browser moves it.
 assert.equal((await b.call("POST","/api/push/unsubscribe",{endpoint:FCM+"a1"})).status,200);
 assert.deepEqual(subs("Abonné"),[FCM+"a1"]);
 assert.equal((await b.call("POST","/api/push/subscribe",{endpoint:FCM+"a1",keys:keys()})).status,200);
 assert.deepEqual(subs("Abonné"),[]);assert.deepEqual(subs("Voisin"),[FCM+"a1"]);
 assert.equal((await b.call("POST","/api/push/unsubscribe",{endpoint:FCM+"a1"})).status,200);
 assert.deepEqual(subs("Voisin"),[]);
 for(let i=1;i<=6;i++){assert.equal((await a.call("POST","/api/push/subscribe",{endpoint:FCM+"d"+i,keys:keys()})).status,200);await sleep(5);}
 assert.deepEqual(subs("Abonné"),[2,3,4,5,6].map(i=>FCM+"d"+i),"the oldest device is dropped");
 assert.equal((await client().call("POST","/api/push/subscribe",{endpoint:FCM+"z",keys:keys()})).status,401);
 assert.equal((await a.call("DELETE","/api/account",{password:PW})).status,200);
 assert.equal(DB.prepare("SELECT COUNT(*) n FROM push_subs").get().n,0,"gone with the account");
});

test("POLITIGO_PUSH=off: no key handed out, no subscription taken",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgd-off-")),p=await boot(OFF_PORT,dir,{POLITIGO_PUSH:"off"});
 try{
  const c=await player("Sourd","left",OFF_PORT);
  assert.equal((await duels(c)).json.pushKey,null);
  assert.equal((await c.call("POST","/api/push/subscribe",{endpoint:FCM+"x",keys:keys()})).status,404);
  assert.throws(()=>statSync(join(dir,"vapid.json")),/ENOENT/);
 }finally{p.kill("SIGTERM");}
});
