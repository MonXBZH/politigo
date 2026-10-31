// Duel and push-subscription tests: a real server on a temporary database, driven over HTTP (node --test).
// Run inside the API image layout: server.mjs, rules.mjs and push.mjs side by side (see tests/run-server.sh).
// A duel turn is the server-paced debate (POST /api/debate), shortened to 3.5 s of play by POLITIGO_DEBATE_MS.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,statSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import crypto from "node:crypto";
import * as R from "../web/rules.mjs";
import {answerOf,debateTurn} from "./server-helpers.mjs";

const PORT=3910,OFF_PORT=3911,INVITE="code-secret-de-test-123",PW="motdepasse1";
// The server runs in a time zone where it is early afternoon right now: daytime-only actions are always testable.
const off=((14-new Date().getUTCHours()+36)%24)-12,DAY_TZ=off>=0?`Etc/GMT-${off}`:`Etc/GMT+${-off}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let proc,DIR,DB;
function boot(port,dir,extra={}){
 const env={...process.env,PORT:String(port),DB_PATH:join(dir,"t.db"),POLITIGO_INVITE:INVITE,COOKIE_SECURE:"0",PROXY_HOPS:"1",SWEEP_MS:"200",BOARD_MS:"50",
  POLITIGO_SPEED:"1",POLITIGO_TZ:DAY_TZ,POLITIGO_ADMIN_SOCKET:"off",POLITIGO_DUEL_MIN_LEVEL:"1",POLITIGO_DUEL_MIN_AGE_H:"0",POLITIGO_DEBATE_MS:"3500",...extra};
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
const duel=(c,body)=>c.call("POST","/api/duel",body);
const debate=(c,body)=>c.call("POST","/api/debate",{op:"next",...body});
const duels=c=>c.call("GET","/api/duels");
const find=async(c,id)=>(await duels(c)).json.duels.find(d=>d.id===id);
const top=async c=>(await c.call("GET","/api/me")).json.state.journal[0];
const feedTexts=async c=>(await c.call("GET","/api/board")).json.feed.map(f=>f.text);
// Challenge and play a turn (3 right answers by default): returns the duel id.
async function challenged(a,b,opts={}){
 const ch=await duel(a,{op:"challenge",name:b.name});assert.equal(ch.status,200,JSON.stringify(ch.json));
 const end=await debateTurn(a,ch.json.duel.id,opts);
 assert.equal(end.status,200,JSON.stringify(end.json));assert.equal(end.json.result.status,"pending");
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
 assert.deepEqual(Object.keys(rowB).sort(),["camp","candidate","lvl","name","ok","online","why"]);
 assert.equal(rowB.ok,true);assert.equal(rowB.why,"");assert.equal(rowB.camp,"right");assert.equal(rowB.candidate,R.people.right[0].name);
 assert.ok(!list.json.opponents.some(o=>o.name==="Duelliste A"),"never oneself");

 const ch=await duel(a,{op:"challenge",name:"duelliste b"});
 assert.equal(ch.status,200);assert.deepEqual(Object.keys(ch.json.duel),["id"],"no seed: the deal stays on the server");assert.equal(ch.json.me.name,"Duelliste A");
 const {id}=ch.json.duel;
 assert.equal((await duels(a)).json.sent,1,"counted as soon as it is sent");
 assert.equal((await find(a,id)).status,"c_play");
 assert.equal(await find(b,id),undefined,"the defender is not told before the challenger has a score");
 assert.equal((await duel(b,{op:"accept",id})).status,422);
 assert.equal((await debate(b,{ref:id})).status,422,"not the defender's turn");
 for(const op of ["accept","refuse"])assert.equal((await duel(z,{op,id})).json.error,"Duel introuvable.",`outsider ${op}`);
 assert.equal((await debate(z,{ref:id})).json.error,"Duel introuvable.","outsider debate");
 assert.equal((await duel(a,{op:"submit",id,picks:[[0,0]]})).status,410,"picks are no longer taken");

 const sb=stream(b);await until(()=>sb.events.some(e=>e.ev==="me"));
 // The first question: text and three answers, nothing that says which one is right.
 const q1=await debate(a,{ref:id});
 assert.equal(q1.status,200,JSON.stringify(q1.json));
 assert.deepEqual(Object.keys(q1.json.q).sort(),["answers","idx","text"]);assert.equal(q1.json.q.answers.length,3);assert.equal(q1.json.done,false);
 assert.ok(!/seed|kind/i.test(JSON.stringify(q1.json)));
 const sub=await debateTurn(a,id);
 assert.equal(sub.status,200,JSON.stringify(sub.json));assert.equal(sub.json.done,true);assert.equal(sub.json.q,null);
 assert.deepEqual(sub.json.result,{score:3,errors:0,status:"pending",mine:3,theirs:null,res:null});
 const ev=await until(()=>sb.events.find(e=>e.ev==="duel"));sb.close();
 assert.deepEqual(ev?.data,{id,kind:"challenged",role:"defender",vs:"Duelliste A"});
 assert.ok((await feedTexts(a)).includes("Duelliste A défie Duelliste B au Débat chrono."));

 const seen=await find(b,id);
 assert.equal(seen.role,"defender");assert.equal(seen.status,"pending");assert.equal(seen.vs,"Duelliste A");
 assert.equal(seen.mine,null);assert.equal(seen.theirs,null,"the challenger's score stays hidden");assert.equal(seen.res,null);
 assert.ok(seen.expires>Date.now()+23*3600e3);
 assert.equal((await debate(a,{ref:id})).status,422,"no second turn");

 const moralB=(await b.call("GET","/api/me")).json.state.moral;
 const acc=await duel(b,{op:"accept",id});
 assert.equal(acc.status,200);assert.deepEqual(acc.json.duel,{id},"no seed for the defender either");
 assert.equal((await find(b,id)).status,"d_play");
 const res=await debateTurn(b,id,{wrong:[1]});
 assert.equal(res.status,200,JSON.stringify(res.json));
 assert.deepEqual(res.json.result,{score:2,errors:1,status:"done",mine:2,theirs:3,res:"loss"});
 assert.equal(res.json.me.state.journal[0].k,"duel");assert.equal(res.json.me.state.journal[0].d.res,"loss");
 assert.ok(res.json.me.state.moral<moralB,"the loser's moral drops");

 const won=await find(a,id);
 assert.deepEqual({role:won.role,status:won.status,mine:won.mine,theirs:won.theirs,res:won.res},{role:"challenger",status:"done",mine:3,theirs:2,res:"win"});
 const ja=await top(a);assert.equal(ja.k,"duel");assert.equal(ja.d.res,"win");assert.match(ja.text,/\+40 XP/);
 assert.ok((await a.call("GET","/api/me")).json.state.xp>=40);
 assert.equal((await find(b,id)).theirs,3,"revealed once done");
 assert.ok((await feedTexts(a)).includes("Duelliste A bat Duelliste B au Débat chrono, 3 à 2."));
 const row=DB.prepare("SELECT paid,turn,fx,c_first,d_first,c_done FROM duels WHERE id=?").get(id);
 assert.equal(row.paid,1);assert.equal(row.turn,null,"the turn state is gone once played");
 assert.ok(row.c_first&&row.d_first&&row.c_done,"request times kept for the multi-account signals");
 const fx=JSON.parse(row.fx);assert.equal(fx.c.xp,40);assert.ok(fx.d.moral<0,"what each side really got is kept");
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

test("a turn begun too late is over, and the pair waits 24 h either way",async()=>{
 const a=await player("Tricheur"),b=await player("Victime");
 const ch=await duel(a,{op:"challenge",name:"Victime"});const {id}=ch.json.duel;
 // Waiting before the first question does not buy time: past the countdown and the grace, the turn is void.
 DB.prepare("UPDATE duels SET c_started=c_started-? WHERE id=?").run(80000,id);
 const r=await debate(a,{ref:id});
 assert.equal(r.status,422);assert.match(r.json.error,/Trop tard/);
 assert.equal((await find(a,id)).status,"void");assert.equal(await find(b,id),undefined);
 assert.equal((await debate(a,{ref:id})).status,422,"a void duel is over");
 assert.equal((await duel(a,{op:"challenge",name:"Victime"})).json.error,"Déjà un duel entre vous il y a moins de 24 h.");
 assert.equal((await duel(b,{op:"challenge",name:"Tricheur"})).json.error,"Déjà un duel entre vous il y a moins de 24 h.");
 const row=(await duels(b)).json.opponents.find(o=>o.name==="Tricheur");assert.equal(row.ok,false);assert.equal(row.why,"Déjà un duel entre vous il y a moins de 24 h");
 // Bad requests: an unknown op, a choice out of range, an answer with no question on screen.
 const x=await player("Faussaire"),y=await player("Cible");
 const c=await duel(x,{op:"challenge",name:y.name}),xid=c.json.duel.id;
 assert.equal((await debate(x,{ref:xid,choice:1})).status,400,"no question shown yet");
 assert.equal((await x.call("POST","/api/debate",{op:"submit",ref:xid})).status,400);
 await debate(x,{ref:xid});await sleep(650);
 for(const choice of [3,-1,"1",1.5]){await sleep(200);assert.equal((await debate(x,{ref:xid,choice})).status,400,String(choice));}
 // A defender too late forfeits: the duel ends, scored 0.
 const c2=await player("Honnête"),d2=await player("Filou");
 const {id:id2}=await challenged(c2,d2);
 assert.equal((await duel(d2,{op:"accept",id:id2})).status,200);
 DB.prepare("UPDATE duels SET d_started=d_started-? WHERE id=?").run(80000,id2);
 const f=await debate(d2,{ref:id2});
 assert.equal(f.status,422);assert.match(f.json.error,/Trop tard/);
 const done=await find(d2,id2);assert.equal(done.status,"done");assert.equal(done.mine,0);assert.equal(done.res,"loss");
 assert.equal((await find(c2,id2)).res,"win");
});

test("a turn left half-played is closed by the clock with what was scored",async()=>{
 const a=await player("Pressé"),b=await player("Témoin");
 const ch=await duel(a,{op:"challenge",name:b.name}),{id}=ch.json.duel;
 let r=await debate(a,{ref:id});await sleep(650);
 r=await debate(a,{ref:id,choice:answerOf(r.json.q,"left")});
 assert.equal(r.json.points,1);assert.equal(r.json.right,true);
 // The page is closed: the sweep ends the turn once its 3.5 s (and a short grace) have run out.
 assert.ok(await until(async()=>(await find(a,id)).status==="pending",9000));
 assert.equal((await find(a,id)).mine,1);
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
 assert.equal((await debate(d,{ref:id2})).json.error,"Duel introuvable.");
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
