// Server start-up tests: a v1.3.0 database gains the duel and push tables, restarts are idempotent; files are created
// private (umask); the names accepted at sign-up (node --test).
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,statSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,client,player,login,debateTurn,keys,FCM,INVITE,PW} from "./server-helpers.mjs";

// The tables of v1.3.0, column by column (git show v1.3.0:server/server.mjs): players (with seen_version), sessions, feed.
const V13={
 players:["id","name","name_key","pass","created","state","score","updated","seen_version"],
 sessions:["token_hash","player_id","expires"],
 feed:["id","t","player","kind","text"]
};
const tables=d=>d.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name);
const cols=(d,t)=>d.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name);

test("a v1.3.0 database (no duels, no push_subs) gains both tables; restarts are idempotent",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgm-")),PORT=3913;
 let p=await boot(PORT,dir,{},"old.db");
 try{await player(PORT,"Ancien");await player(PORT,"Ancienne","right");}finally{await stop(p);}
 // Back to the v1.3.0 schema.
 const d=new DatabaseSync(join(dir,"old.db"));
 // Every later table and column goes (duels, push, chat, admin...): what is left is exactly v1.3.0.
 for(const t of tables(d))if(!(t in V13))d.exec(`DROP TABLE ${t}`);
 for(const c of cols(d,"players"))if(!V13.players.includes(c))d.exec(`ALTER TABLE players DROP COLUMN ${c}`);
 assert.deepEqual(tables(d),Object.keys(V13).sort());
 for(const [t,c] of Object.entries(V13))assert.deepEqual(cols(d,t),c,t);
 d.close();

 p=await boot(PORT,dir,{},"old.db");
 let id;
 try{
  const a=await login(PORT,"Ancien");a.camp="left";
  const l=await a.call("GET","/api/duels");
  assert.equal(l.status,200);assert.deepEqual(l.json.duels,[]);assert.ok(l.json.opponents.some(o=>o.name==="Ancienne"));
  assert.equal((await a.call("POST","/api/push/subscribe",{endpoint:FCM+"ancien",keys:keys()})).status,200);
  const ch=await a.call("POST","/api/duel",{op:"challenge",name:"Ancienne"});
  assert.equal(ch.status,200,JSON.stringify(ch.json));id=ch.json.duel.id;
  const sub=await debateTurn(a,id);
  assert.equal(sub.status,200,JSON.stringify(sub.json));assert.equal(sub.json.result.status,"pending");
 }finally{await stop(p);}
 // A second restart on the migrated file: nothing recreated, nothing lost.
 p=await boot(PORT,dir,{},"old.db");
 try{
  const b=await login(PORT,"Ancienne");
  const l=await b.call("GET","/api/duels");
  assert.equal(l.status,200);assert.equal(l.json.duels.find(x=>x.id===id)?.status,"pending");
  const d3=new DatabaseSync(join(dir,"old.db"),{readOnly:true});
  assert.deepEqual(d3.prepare("SELECT endpoint FROM push_subs").all().map(r=>r.endpoint),[FCM+"ancien"]);
  assert.ok(tables(d3).includes("duels"));
  d3.close();
 }finally{await stop(p);}
 assert.doesNotMatch(p.err,/Error/,p.err);
});

// A shared server for the remaining cases.
const PORT=3915;
let proc,DIR;
before(async()=>{DIR=mkdtempSync(join(tmpdir(),"pgb-"));proc=await boot(PORT,DIR);});
after(()=>stop(proc));

test("files the server creates are private to it (umask 077)",()=>{
 for(const f of ["t.db","vapid.json"])assert.equal(statSync(join(DIR,f)).mode&0o777,0o600,f);
 for(const f of ["t.db-wal","t.db-shm"]){let st=null;try{st=statSync(join(DIR,f));}catch{}if(st)assert.equal(st.mode&0o077,0,f);}
});

const register=name=>client(PORT).call("POST","/api/register",{name,password:PW,invite:INVITE,camp:"left"});
test("names: Latin-1 and Latin Extended-A letters are welcome, IPA lookalikes are not",async()=>{
 for(const ok of ["Chloé","Œdipe Roi","Łukasz","Ægir_2","Zoë-Ñandú"])assert.equal((await register(ok)).status,201,ok);
 for(const bad of ["Mɑrine","Mariɴe","Маrine","ʙob"]){
  const r=await register(bad);assert.equal(r.status,400,`${bad}: ${r.status}`);assert.match(r.json.error,/^Pseudo/);
 }
});

test("names: the dotless ı (U+0131, inside Latin Extended-A) cannot pass for an i",async()=>{
 assert.equal((await register("Marine")).status,201);
 const r=await register("Marıne");
 assert.notEqual(r.status,201,"a lookalike of Marine was accepted");
});
