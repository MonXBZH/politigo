// 1.7.1 fixes after the audit, on a real server: duels outlive a deleted account (the table of 1.7.0 is migrated),
// the rival of an open duel is told, the plans for a deleted player go, a player who acts is no longer "abandoned",
// the Bâton's global limit answers, the rate-limit keys take only a real address, the lookalikes of the organiser's
// signature are refused, and a lifted suspension says so.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {createConnection} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,client,until,dayNow,PW,INVITE} from "./server-helpers.mjs";

const PORT=3810,TWIN_A=3811,TWIN_B=3812;
let dir,SOCK,proc,db;
const env=()=>({POLITIGO_ADMIN_SOCKET:SOCK});
function adm(obj){
 return new Promise((ok,ko)=>{
  const c=createConnection(SOCK);let text="";
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
 });
}
const idOf=name=>db.prepare("SELECT id FROM players WHERE name=?").get(name)?.id;
async function down(fn){await stop(proc);fn();proc=await boot(PORT,dir,env());}
// The duels table exactly as 1.7.0 made it: linked to the players with ON DELETE CASCADE, then its added columns.
const V170_DUELS=`CREATE TABLE duels(id INTEGER PRIMARY KEY,game TEXT NOT NULL,
 challenger INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,defender INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 seed INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,c_started INTEGER,c_score INTEGER,d_started INTEGER,d_score INTEGER,
 expires INTEGER,resolved INTEGER,winner INTEGER,paid INTEGER NOT NULL DEFAULT 0,sday INTEGER,rday INTEGER);
CREATE INDEX duels_challenger ON duels(challenger);CREATE INDEX duels_defender ON duels(defender);CREATE INDEX duels_status ON duels(status);
ALTER TABLE duels ADD COLUMN turn TEXT;ALTER TABLE duels ADD COLUMN flags TEXT;ALTER TABLE duels ADD COLUMN fx TEXT;ALTER TABLE duels ADD COLUMN c_first INTEGER;
ALTER TABLE duels ADD COLUMN d_first INTEGER;ALTER TABLE duels ADD COLUMN c_done INTEGER;ALTER TABLE duels ADD COLUMN c_errors INTEGER;`;
function to170(d){
 d.exec(`PRAGMA foreign_keys=OFF;BEGIN;ALTER TABLE duels RENAME TO duels_171;DROP INDEX duels_challenger;DROP INDEX duels_defender;DROP INDEX duels_status;${V170_DUELS}
  INSERT INTO duels(id,game,challenger,defender,seed,status,created,c_started,c_score,d_started,d_score,expires,resolved,winner,paid,sday,rday,turn,flags,fx,c_first,d_first,c_done,c_errors)
  SELECT id,game,challenger,defender,seed,status,created,c_started,c_score,d_started,d_score,expires,resolved,winner,paid,sday,rday,turn,flags,fx,c_first,d_first,c_done,c_errors FROM duels_171;
  DROP TABLE duels_171;COMMIT;PRAGMA foreign_keys=ON;`);
}
const linked=d=>d.prepare("PRAGMA foreign_key_list(duels)").all().length;
const insDuel=(d,c,f,status,extra={})=>{const now=Date.now(),day=dayNow(now);
 return Number(d.prepare("INSERT INTO duels(game,challenger,defender,seed,status,created,c_started,c_score,d_started,d_score,expires,resolved,winner,paid,sday,rday) VALUES('debate',?,?,7,?,?,?,?,?,?,?,?,?,?,?,?)")
  .run(c,f,status,now-60e3,now-60e3,3,extra.d_started??null,extra.d_score??null,extra.expires??null,extra.resolved??null,extra.winner??null,extra.paid??0,day,extra.rday??null).lastInsertRowid);};

before(async()=>{
 dir=mkdtempSync(join(tmpdir(),"pggf-"));SOCK=join(dir,"admin.sock");
 proc=await boot(PORT,dir,env());
 db=new DatabaseSync(join(dir,"t.db"),{timeout:5000});
});
after(async()=>{try{db.close();}catch{}await stop(proc);});

// The live stream of one player, collected in the background.
function stream(c){
 const ac=new AbortController(),events=[];
 fetch(`http://127.0.0.1:${c.port}/events`,{headers:{Cookie:c.cookie,"X-Forwarded-For":"10.8.0.1"},signal:ac.signal}).then(async r=>{
  const dec=new TextDecoder();let buf="";
  for await(const chunk of r.body){
   buf+=dec.decode(chunk,{stream:true});let i;
   while((i=buf.indexOf("\n\n"))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);
    const ev=/^event: (.*)$/m.exec(block)?.[1],data=/^data: (.*)$/m.exec(block)?.[1];if(ev)events.push({ev,data:data&&JSON.parse(data)});}
  }
 }).catch(()=>{});
 return {events,close:()=>ac.abort()};
}

test("F1, F2, A8: on a 1.7.0 duels table, a deleted account no longer takes the rival's duels; its open ones are void, its plans gone",async()=>{
 const w=await player(PORT,"Vainqueur","left"),l1=await player(PORT,"Perdant Un","right");await player(PORT,"Perdant Deux","right");
 const pa=await player(PORT,"Papa","left"),qb=await player(PORT,"Quebec","right");
 const [W,L1,L2,P,Q]=["Vainqueur","Perdant Un","Perdant Deux","Papa","Quebec"].map(idOf);
 assert.equal((await adm({cmd:"schedule-add",text:"Pour toi",target:{kind:"player",id:L1},kind:"daily",time:"10:00"})).ok,true);
 assert.equal((await adm({cmd:"schedule-add",text:"Pour tous",target:{kind:"all"},kind:"daily",time:"10:00"})).ok,true);
 const now=Date.now(),day=dayNow(now);
 let open;
 await down(()=>{
  to170(db);assert.ok(linked(db),"the 1.7.0 table cascades");
  for(const l of [L1,L2])insDuel(db,W,l,"done",{d_started:now-30e3,d_score:0,resolved:now-20e3,winner:W,paid:1,rday:day});
  open=insDuel(db,P,Q,"pending",{expires:now+864e5});
 });
 // Migrated at boot: no link left, the rows and indexes kept.
 assert.equal(linked(db),0);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM duels").get().n,3);
 assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='duels' ORDER BY name").all().map(r=>r.name),["duels_challenger","duels_defender","duels_status"]);
 assert.ok(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='duels_new'").get());
 const board=async()=>(await w.call("GET","/api/board")).json.board.find(r=>r.name==="Vainqueur");
 assert.equal((await w.call("GET","/api/duels")).json.sent,2);assert.equal((await board()).dw,2);

 // Quebec leaves with a duel waiting for them: Papa hears it is void, the same way as a cancellation.
 const sp=stream(pa);await until(()=>sp.events.some(e=>e.ev==="me"));
 assert.equal((await qb.call("DELETE","/api/account",{password:PW})).status,200);
 const ev=await until(()=>sp.events.find(e=>e.ev==="duel"));sp.close();
 assert.deepEqual(ev?.data,{id:open,kind:"void",role:"challenger",vs:"Quebec"});
 const mine=(await pa.call("GET","/api/duels")).json.duels.find(d=>d.id===open);
 assert.equal(mine.status,"void");assert.equal(mine.vs,"Compte supprimé");

 // Perdant Un leaves: the winner keeps the record, the day's challenges and wins, and one plan less.
 assert.equal((await l1.call("DELETE","/api/account",{password:PW})).status,200);
 const after=(await w.call("GET","/api/duels")).json;
 assert.equal(after.sent,2,"still two challenges sent today");assert.equal((await board()).dw,2,"still two wins");
 assert.deepEqual(after.duels.map(d=>[d.vs,d.res]).sort(),[["Compte supprimé","win"],["Perdant Deux","win"]]);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM duels WHERE winner=? AND paid=1 AND rday=?").get(W,day).n,2,"the paid wins still count against the cap");
 assert.deepEqual(db.prepare("SELECT text FROM schedules ORDER BY id").all().map(r=>r.text),["Pour tous"]);
 // Their own counts go with the account (a new one has a new id); the next boot leaves the table alone.
 await down(()=>{});
 assert.equal(linked(db),0);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM duels").get().n,3);
 assert.equal((await w.call("GET","/api/duels")).json.sent,2);
});

test("F1: two servers starting at once on a 1.7.0 file migrate it once, nothing lost",async()=>{
 const d2=mkdtempSync(join(tmpdir(),"pggt-"));
 let a=await boot(TWIN_A,d2);
 const t=new DatabaseSync(join(d2,"t.db"),{timeout:5000});
 await player(TWIN_A,"Jumeau Un","left");await player(TWIN_A,"Jumeau Deux","right");
 const ids=t.prepare("SELECT id FROM players ORDER BY id").all().map(r=>r.id);
 await stop(a);
 to170(t);for(let i=0;i<5;i++)insDuel(t,ids[0],ids[1],"done",{resolved:Date.now(),winner:ids[0],paid:1,rday:dayNow()});
 const [x,y]=await Promise.all([boot(TWIN_A,d2),boot(TWIN_B,d2)]);
 try{
  assert.equal(linked(t),0);assert.equal(t.prepare("SELECT COUNT(*) AS n FROM duels").get().n,5);
  assert.equal(t.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
  assert.ok(!/unexpected schema/.test(x.err+y.err),x.err+y.err);
 }finally{t.close();await stop(x);await stop(y);}
});

test("A6: an action of the player's ends their run of idle deaths at once",async()=>{
 const c=await player(PORT,"Revenant","left"),id=idOf("Revenant");
 await down(()=>{const S=JSON.parse(db.prepare("SELECT state FROM players WHERE id=?").get(id).state);S.idleDeaths=4;S.played=false;
  db.prepare("UPDATE players SET state=? WHERE id=?").run(JSON.stringify(S),id);});
 assert.equal((await adm({cmd:"player",id})).player.idleDeaths,4);
 const r=await c.call("POST","/api/action",{type:"buy",key:"soup"});assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.ok,true,JSON.stringify(r.json));
 assert.equal((await adm({cmd:"player",id})).player.idleDeaths,0);
 // Away again for days: not listed, they played.
 await down(()=>db.prepare("UPDATE players SET last_seen=? WHERE id=?").run(Date.now()-6*864e5,id));
 assert.ok(!(await adm({cmd:"abandoned-list"})).items.some(p=>p.id===id));
});

test("F8: a lifted suspension is told as such, not as a server maintenance",async()=>{
 await player(PORT,"Suspendu","left");const id=idOf("Suspendu");
 assert.equal((await adm({cmd:"suspend",id,on:true})).ok,true);
 // Five hours of suspension: the frozen clock is set back while the server is down.
 await down(()=>{const S=JSON.parse(db.prepare("SELECT state FROM players WHERE id=?").get(id).state);S.vclock-=5*3600e3;S.lastReal-=5*3600e3;S.hourIdx-=5;
  db.prepare("UPDATE players SET state=?,updated=? WHERE id=?").run(JSON.stringify(S),Date.now(),id);});
 assert.equal((await adm({cmd:"suspend",id,on:false})).ok,true);
 const c2=client(PORT);assert.equal((await c2.call("POST","/api/login",{name:"Suspendu",password:PW})).status,200);
 const texts=(await c2.call("GET","/api/me")).json.state.journal.filter(j=>j.k==="sync").map(j=>j.text);
 assert.ok(texts.length>0,"the skipped time is said");
 for(const t of texts){assert.match(t,/^Compte suspendu \(/);assert.doesNotMatch(t,/Maintenance/);}
});

test("A5: the Bâton's global limit answers 429 past 20 requests a second",async()=>{
 const c=await player(PORT,"Pressé","left");
 await down(()=>db.prepare("INSERT INTO settings(key,value) VALUES('baton_won','1') ON CONFLICT(key) DO UPDATE SET value='1'").run());
 const rs=await Promise.all(Array.from({length:25},()=>c.call("POST","/api/baton",{op:"inconnue"})));
 const hit=rs.filter(r=>r.status===429);
 assert.ok(hit.length>0,JSON.stringify(rs.map(r=>r.status)));
 assert.ok(hit.every(r=>r.json.error==="Doucement : trop de requêtes."),"the global limit, not the per-operation one");
});

test("A2: a forwarded address that is not an IP is ignored: the bucket is the connection's, and short",async()=>{
 const reg=(name,xff)=>fetch(`http://127.0.0.1:${PORT}/api/register`,{method:"POST",headers:{"Content-Type":"application/json","X-Forwarded-For":xff},
  body:JSON.stringify({name,password:PW,invite:INVITE,camp:"left"})}).then(r=>r.status);
 const st=[];for(let i=0;i<4;i++)st.push(await reg(`Faussaire ${"abcd"[i]}`,"z".repeat(6000)+i));
 assert.deepEqual(st,[201,201,201,429],"four forged addresses are one connection: the fourth sign-up is refused");
 // A real address still names its own bucket.
 assert.equal(await reg("Honnete Ip","10.66.0.1"),201);
});

test("F5: the lookalikes of « Annonce officielle » are refused, ordinary names are not",async()=>{
 let k=0;
 const reg=async name=>{const r=await fetch(`http://127.0.0.1:${PORT}/api/register`,{method:"POST",headers:{"Content-Type":"application/json","X-Forwarded-For":`10.67.0.${++k}`},
  body:JSON.stringify({name,password:PW,invite:INVITE,camp:"left"})});return {status:r.status,json:await r.json()};};
 for(const name of ["Annonce 0fficielle","Annonce OfficieIIe","Annonce Øfficielle","Ann0nce 0ff1ciel1e","Annonce   officielle","Annoncé Offîcielle","annonce.0FFICIELLE"]){
  const r=await reg(name);assert.equal(r.status,400,`${name}: ${JSON.stringify(r.json)}`);assert.match(r.json.error,/réservé/,name);
 }
 for(const name of ["Officier Lili","Annonceur","Lionel 01"])assert.equal((await reg(name)).status,201,name);
});
